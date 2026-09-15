// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Count pulses on input pins and report a rate.
//!
//! Written for wheel speed on a vehicle, where a magnet passing a hall sensor
//! gives one pulse per fraction of a revolution, but the capsule itself knows
//! nothing about wheels: it counts edges and divides by time. How many pulses
//! make a revolution and how far a revolution carries you are vehicle facts,
//! and they belong in the application.
//!
//! # Why a capsule rather than GPIO interrupts in an application
//!
//! `capsules_core::gpio` can deliver an edge to userspace, and at the rates a
//! wheel produces -- a hundred or so per second -- an application could keep
//! up. Two things argue for counting here anyway:
//!
//! * **A syscall and an upcall per edge to learn one bit.** Counting is the
//!   whole of the work, and it is cheaper where the interrupt already lands.
//! * **The number is wanted by something that is not userspace.** Slip is the
//!   difference between a driven wheel and an undriven one, and the reason to
//!   measure it is eventually to act on it. A rate a capsule already holds can
//!   gate a throttle without a round trip through a process that may not be
//!   running.
//!
//! # What a window costs you
//!
//! Rates are counted over a fixed window, which is simple and steady but
//! quantises: one pulse in a window is indistinguishable from one-and-a-bit,
//! so the error at low rates is large and at a standstill the answer is zero
//! either way. Measuring the interval between edges instead is sharper when
//! the wheel is barely turning and noisier when it is spinning. The window is
//! the right trade for a speed display and for slip at speed; it is the wrong
//! one for anything that needs to act on the first revolution.
//!
//! [`WINDOW_MS`] is reported through the driver rather than assumed, so an
//! application does not hardcode a number that lives here.

use core::cell::Cell;
use kernel::grant::{AllowRoCount, AllowRwCount, Grant, UpcallCount};
use kernel::hil::gpio;
use kernel::hil::time::{Alarm, AlarmClient, ConvertTicks};
use kernel::syscall::{CommandReturn, SyscallDriver};
use kernel::{ErrorCode, ProcessId};

/// Syscall driver number.
pub const DRIVER_NUM: usize = capsules_core::driver::NUM::PulseCounter as usize;

/// How long each counting window is.
///
/// A quarter second updates fast enough to read and is long enough that a
/// wheel turning slowly still lands a few pulses in it.
pub const WINDOW_MS: u32 = 250;

#[derive(Default)]
pub struct App;

pub struct PulseCounter<'a, A: Alarm<'a>, const N: usize> {
    pins: &'a [&'a dyn gpio::InterruptWithValue<'a>; N],
    alarm: &'a A,
    apps: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,

    /// Edges seen in the window now being counted.
    counts: [Cell<u32>; N],
    /// Pulses per second over the window that just closed.
    rates: [Cell<u32>; N],
    running: Cell<bool>,
}

impl<'a, A: Alarm<'a>, const N: usize> PulseCounter<'a, A, N> {
    pub fn new(
        pins: &'a [&'a dyn gpio::InterruptWithValue<'a>; N],
        alarm: &'a A,
        grant: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    ) -> Self {
        Self {
            pins,
            alarm,
            apps: grant,
            counts: [const { Cell::new(0) }; N],
            rates: [const { Cell::new(0) }; N],
            running: Cell::new(false),
        }
    }

    /// Give each pin the index it reports as its value, so one client can
    /// serve all of them.
    pub fn initialise(&self) {
        for (i, pin) in self.pins.iter().enumerate() {
            pin.set_value(i as u32);
        }
    }

    fn start(&self) {
        if self.running.get() {
            return;
        }
        for (i, pin) in self.pins.iter().enumerate() {
            self.counts[i].set(0);
            self.rates[i].set(0);
            // One edge per pulse. Counting both would double every rate and
            // make the answer depend on the duty cycle of whatever is driving
            // the pin, which a magnet's width should not decide.
            let _ = pin.enable_interrupts(gpio::InterruptEdge::RisingEdge);
        }
        self.running.set(true);
        self.schedule();
    }

    fn stop(&self) {
        for pin in self.pins.iter() {
            pin.disable_interrupts();
        }
        self.running.set(false);
    }

    fn schedule(&self) {
        let interval = self.alarm.ticks_from_ms(WINDOW_MS);
        self.alarm.set_alarm(self.alarm.now(), interval);
    }
}

impl<'a, A: Alarm<'a>, const N: usize> gpio::ClientWithValue for PulseCounter<'a, A, N> {
    fn fired(&self, value: u32) {
        if let Some(count) = self.counts.get(value as usize) {
            // Saturating rather than wrapping: a rate that has run away is
            // better reported as impossibly high than as suddenly zero.
            count.set(count.get().saturating_add(1));
        }
    }
}

impl<'a, A: Alarm<'a>, const N: usize> AlarmClient for PulseCounter<'a, A, N> {
    fn alarm(&self) {
        if !self.running.get() {
            return;
        }
        for i in 0..N {
            let count = self.counts[i].replace(0);
            self.rates[i].set(count.saturating_mul(1000 / WINDOW_MS));
        }
        self.schedule();
    }
}

impl<'a, A: Alarm<'a>, const N: usize> SyscallDriver for PulseCounter<'a, A, N> {
    /// Count pulses on the board's input pins.
    ///
    /// ### `command_num`
    ///
    /// - `0`: Does the driver exist.
    /// - `1`: Start counting on every channel.
    /// - `2`: Stop.
    /// - `3`: Pulses per second on channel `data1`, over the window that last
    ///   closed.
    /// - `4`: How many channels there are.
    /// - `5`: The window length in milliseconds, so an application need not
    ///   assume it.
    fn command(
        &self,
        command_num: usize,
        data1: usize,
        _data2: usize,
        _processid: ProcessId,
    ) -> CommandReturn {
        match command_num {
            0 => CommandReturn::success(),
            1 => {
                self.start();
                CommandReturn::success()
            }
            2 => {
                self.stop();
                CommandReturn::success()
            }
            3 => match self.rates.get(data1) {
                Some(rate) => CommandReturn::success_u32(rate.get()),
                None => CommandReturn::failure(ErrorCode::INVAL),
            },
            4 => CommandReturn::success_u32(N as u32),
            5 => CommandReturn::success_u32(WINDOW_MS),
            _ => CommandReturn::failure(ErrorCode::NOSUPPORT),
        }
    }

    fn allocate_grant(&self, processid: ProcessId) -> Result<(), kernel::process::Error> {
        self.apps.enter(processid, |_, _| {})
    }
}
