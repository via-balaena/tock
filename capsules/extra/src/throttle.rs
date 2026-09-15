// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! A throttle output that an application requests and this capsule enforces.
//!
//! Built for a vehicle controller, where the thing on the other end of the pin
//! moves and carries someone. The trust boundary is the point: **an
//! application asks for a throttle position and never sets one.** Capsules are
//! trusted and processes are not, so the limits that matter live here, where a
//! buggy or compromised app cannot step around them.
//!
//! # Why not the generic `pwm` driver
//!
//! `capsules_extra::pwm` reclaims a pin from a dead owner, but only **when
//! someone else asks for it**, because a capsule learns of a death by trying
//! to enter a grant and there is no teardown hook to be told. For a pin that
//! selects a chip that is fine. For one that opens a throttle it is not: if
//! nothing else ever wants the pin, the output holds the dead process's last
//! duty cycle for as long as the board runs.
//!
//! A device that must stop within a bounded time needs a periodic callback of
//! its own to notice from, which is what `capsules_extra::stepper` does for
//! motor coils and what this does here.
//!
//! # Three independent reasons the output goes to zero
//!
//! Independent on purpose: each covers a failure the others do not see.
//!
//! 1. **The owner died.** Checked on every tick by entering its grant, the
//!    idiom `stepper` and `adc` use. Worst case one tick.
//! 2. **The owner stopped talking.** A process can hang without dying, and a
//!    hung process holds a throttle open just as effectively as a crashed one.
//!    [`TIMEOUT_TICKS`] of silence decays the target to zero. This is the same
//!    guarantee a VESC gives in its own firmware, kept here so the behaviour
//!    does not depend on which controller is fitted.
//! 3. **The owner asked.** The ordinary path, and the one a brake lever
//!    reaches through the application.
//!
//! What this capsule deliberately does NOT do is read the pedal or the brake.
//! Those are the application's, because which pin is a brake is board
//! knowledge rather than device knowledge. The failsafes above are what makes
//! that division safe: an application that mishandles either can only fail to
//! ask for zero, and every other route to zero still runs.
//!
//! # And what none of this replaces
//!
//! A switch in the motor's supply that a person can reach. Software that
//! stops asking is not the same as a machine that cannot go.

use core::cell::Cell;
use kernel::grant::{AllowRoCount, AllowRwCount, Grant, UpcallCount};
use kernel::hil;
use kernel::hil::time::{Alarm, AlarmClient, ConvertTicks};
use kernel::syscall::{CommandReturn, SyscallDriver};
use kernel::utilities::cells::OptionalCell;
use kernel::{ErrorCode, ProcessId};

/// Syscall driver number.
pub const DRIVER_NUM: usize = capsules_core::driver::NUM::Throttle as usize;

/// Full scale for a throttle request, so a request is in units of 0.01%.
///
/// The same convention `capsules_extra::pwm` uses for duty cycle, so the two
/// numbers mean the same thing when read side by side on a console.
pub const SCALE: u16 = 10_000;

/// How often the output is recomputed.
const TICK_MS: u32 = 20;

/// The most the output may move in one tick.
///
/// A twentieth of full scale per 20 ms tick is 400 ms from closed to open.
/// The limit is here rather than in the application because its purpose is to
/// bound what a *wrong* application can do: a step change is what snaps a
/// chain or breaks traction, and no request should be able to produce one.
const SLEW_PER_TICK: u16 = SCALE / 20;

/// Ticks of silence from the owner before the target is forced to zero.
///
/// Ten ticks is 200 ms. Long enough that an application doing real work
/// between updates is not cut off, short enough that a hung one does not keep
/// a vehicle moving.
const TIMEOUT_TICKS: u32 = 10;

#[derive(Default)]
pub struct App;

pub struct Throttle<'a, A: Alarm<'a>, P: hil::pwm::PwmPin> {
    pwm: &'a P,
    alarm: &'a A,
    apps: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,

    /// The process holding the throttle, if any.
    ///
    /// Validated by entering its grant rather than by comparing identifiers:
    /// a restarted process is given a new identifier precisely so stale ones
    /// do not match, so equality can say that something changed but never
    /// that the owner is still there.
    owner: OptionalCell<ProcessId>,

    /// What the owner last asked for, in units of [`SCALE`].
    target: Cell<u16>,
    /// What the output is actually at. Moves toward `target` by at most
    /// [`SLEW_PER_TICK`] each tick.
    current: Cell<u16>,
    /// Ticks since the owner last said anything.
    silent_ticks: Cell<u32>,
    /// The carrier frequency handed to the pin.
    frequency_hz: usize,
}

impl<'a, A: Alarm<'a>, P: hil::pwm::PwmPin> Throttle<'a, A, P> {
    pub fn new(
        pwm: &'a P,
        alarm: &'a A,
        frequency_hz: usize,
        grant: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    ) -> Self {
        Self {
            pwm,
            alarm,
            apps: grant,
            owner: OptionalCell::empty(),
            target: Cell::new(0),
            current: Cell::new(0),
            silent_ticks: Cell::new(0),
            frequency_hz,
        }
    }

    /// Is the recorded owner still there?
    ///
    /// See `capsules_extra::stepper`, which reaches the same idiom from the
    /// same place: a timer rather than a peripheral callback.
    fn owner_is_live(&self) -> bool {
        self.owner.map_or(false, |owner| {
            !matches!(
                self.apps.enter(owner, |_, _| {}),
                Err(kernel::process::Error::NoSuchApp) | Err(kernel::process::Error::InactiveApp)
            )
        })
    }

    /// Put `duty` on the pin. Zero stops it rather than driving a zero-width
    /// pulse, so "closed" means an undriven pin.
    fn write_output(&self, duty: u16) {
        if duty == 0 {
            let _ = self.pwm.stop();
        } else {
            let scaled =
                (duty as usize).saturating_mul(self.pwm.get_maximum_duty_cycle()) / SCALE as usize;
            let _ = self.pwm.start(self.frequency_hz, scaled);
        }
    }

    /// Close the throttle, release it, and stop ticking.
    fn release(&self) {
        self.write_output(0);
        self.current.set(0);
        self.target.set(0);
        self.silent_ticks.set(0);
        self.owner.clear();
    }

    fn schedule_tick(&self) {
        let interval = self.alarm.ticks_from_ms(TICK_MS);
        self.alarm.set_alarm(self.alarm.now(), interval);
    }

    /// Take the throttle, closed.
    ///
    /// Refused while another live process holds it. A dead one does not hold
    /// anything, which is checked rather than assumed.
    fn arm(&self, processid: ProcessId) -> Result<(), ErrorCode> {
        if self.owner_is_live() && self.owner.map_or(false, |o| o != processid) {
            return Err(ErrorCode::RESERVE);
        }
        self.owner.set(processid);
        self.target.set(0);
        self.current.set(0);
        self.silent_ticks.set(0);
        self.write_output(0);
        self.schedule_tick();
        Ok(())
    }

    fn set_target(&self, processid: ProcessId, requested: u16) -> Result<(), ErrorCode> {
        if self.owner.map_or(true, |o| o != processid) {
            return Err(ErrorCode::RESERVE);
        }
        self.target.set(requested.min(SCALE));
        self.silent_ticks.set(0);
        Ok(())
    }
}

impl<'a, A: Alarm<'a>, P: hil::pwm::PwmPin> AlarmClient for Throttle<'a, A, P> {
    fn alarm(&self) {
        // Before the output moves anywhere: a process that is gone does not
        // get one more tick of throttle.
        if !self.owner_is_live() {
            self.release();
            return;
        }

        // A process that has stopped talking is treated as gone, because from
        // the throttle's point of view it is.
        let silent = self.silent_ticks.get() + 1;
        self.silent_ticks.set(silent);
        if silent > TIMEOUT_TICKS {
            self.target.set(0);
        }

        // Toward the target, never straight to it.
        let (current, target) = (self.current.get(), self.target.get());
        let next = if target > current {
            current.saturating_add(SLEW_PER_TICK).min(target)
        } else {
            current.saturating_sub(SLEW_PER_TICK).max(target)
        };

        if next != current {
            self.current.set(next);
            self.write_output(next);
        }

        self.schedule_tick();
    }
}

impl<'a, A: Alarm<'a>, P: hil::pwm::PwmPin> SyscallDriver for Throttle<'a, A, P> {
    /// Request a throttle position.
    ///
    /// ### `command_num`
    ///
    /// - `0`: Does the driver exist.
    /// - `1`: Arm. Takes the throttle, closed, and starts the tick. Refused
    ///   with `RESERVE` while another live process holds it.
    /// - `2`: Set the target, `data1` in units of [`SCALE`], clamped. Only the
    ///   owner may, and it also refreshes the silence timer.
    /// - `3`: Disarm. Closes the throttle and releases it.
    /// - `4`: Read the position the output is actually at, which is not the
    ///   requested one while the slew limit is catching up.
    fn command(
        &self,
        command_num: usize,
        data1: usize,
        _data2: usize,
        processid: ProcessId,
    ) -> CommandReturn {
        match command_num {
            0 => CommandReturn::success(),

            1 => match self.arm(processid) {
                Ok(()) => CommandReturn::success(),
                Err(e) => CommandReturn::failure(e),
            },

            2 => match self.set_target(processid, data1.min(SCALE as usize) as u16) {
                Ok(()) => CommandReturn::success(),
                Err(e) => CommandReturn::failure(e),
            },

            3 => {
                if self.owner.map_or(true, |o| o != processid) {
                    return CommandReturn::failure(ErrorCode::RESERVE);
                }
                self.release();
                CommandReturn::success()
            }

            4 => CommandReturn::success_u32(self.current.get() as u32),

            _ => CommandReturn::failure(ErrorCode::NOSUPPORT),
        }
    }

    fn allocate_grant(&self, processid: ProcessId) -> Result<(), kernel::process::Error> {
        self.apps.enter(processid, |_, _| {})
    }
}
