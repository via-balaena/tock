// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Hang the kernel loop on purpose, to prove the watchdog resets the board.
//!
//! A watchdog that has never fired has never been tested, and this one is
//! easy to get subtly wrong: the counter lives behind a tick generator in
//! another block, and `PSM_WDSEL` decides whether a timeout resets anything
//! at all. Either mistake leaves a watchdog that looks configured, reports a
//! sensible time remaining, and does nothing.
//!
//! **Why an alarm rather than a spin at the end of `setup`.** The kernel calls
//! `WatchDog::setup` inside `kernel_loop`, after board setup has returned, so
//! a board that hangs before that hangs with the watchdog still off and proves
//! nothing. This arms an alarm instead and spins inside its callback, which
//! runs from the loop with the watchdog live.
//!
//! What it looks like on the console: a normal boot, a line saying the spin
//! has started, silence for about a second, then the board boots again
//! reporting that the watchdog was the cause. It repeats, so there is no
//! single moment to catch.

use kernel::debug;
use kernel::hil::time::{Alarm, AlarmClient, ConvertTicks};

pub struct WatchdogProbe<'a, A: Alarm<'a>> {
    alarm: &'a A,
    delay_ms: u32,
}

impl<'a, A: Alarm<'a>> WatchdogProbe<'a, A> {
    pub fn new(alarm: &'a A, delay_ms: u32) -> Self {
        Self { alarm, delay_ms }
    }

    /// Arm the alarm. The hang happens in the callback, not here.
    pub fn arm(&self) {
        debug!(
            "watchdog-probe: hanging the kernel loop in {} ms",
            self.delay_ms
        );
        self.alarm
            .set_alarm(self.alarm.now(), self.alarm.ticks_from_ms(self.delay_ms));
    }
}

impl<'a, A: Alarm<'a>> AlarmClient for WatchdogProbe<'a, A> {
    fn alarm(&self) {
        // Deliberate. The kernel loop never gets another pass, so nothing
        // tickles the watchdog and the chip should reset itself.
        debug!("watchdog-probe: spinning now -- the board should reset");
        loop {
            core::hint::spin_loop();
        }
    }
}
