// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! BENCH INSTRUMENT -- NOT FOR UPSTREAM.
//!
//! A faithful reproduction of the ownership logic in
//! `capsules/extra/src/pwm.rs`, driving a GPIO pin instead of a PWM pin, so
//! that the behaviour can be observed on hardware that has no PWM driver.
//!
//! `pwm.rs` claims a pin for a process and never checks whether that process
//! is still alive:
//!
//! - `claim_pin` compares the stored `ProcessId` for equality and never enters
//!   its grant, so it can never learn the process is gone.
//! - `release_pin` is reached from exactly one place, the cooperative `Stop`
//!   command.
//!
//! So a process that claims a pin and then dies leaves the hardware driven and
//! the slot held. `process_standard.rs`'s `reset()` mints a new identifier for
//! a restarted process specifically to invalidate stored `ProcessId`s, so even
//! the restarted process is refused. The pin is unrecoverable.
//!
//! `capsules/core/src/adc.rs` shows the idiom that fixes it: enter the stored
//! process's grant, and on `NoSuchApp` or `InactiveApp` clear the slot *and*
//! stop the hardware.
//!
//! Command 4 here is the only thing not copied from `pwm.rs`: it applies the
//! `adc.rs` idiom on demand, so the same board can show the bug and the fix
//! without reflashing.

use kernel::grant::{AllowRoCount, AllowRwCount, Grant, UpcallCount};
use kernel::hil::gpio;
use kernel::syscall::{CommandReturn, SyscallDriver};
use kernel::utilities::cells::OptionalCell;
use kernel::{ErrorCode, ProcessId};

/// Bench-only driver number, deliberately outside `capsules_core::driver::NUM`.
pub const DRIVER_NUM: usize = 0xF0001;

#[derive(Default)]
pub struct App;

pub struct ReclaimLeakDemo<'a, const NUM_PINS: usize> {
    pins: &'a [&'a dyn gpio::Pin; NUM_PINS],
    apps: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    /// An array of apps associated to their reserved pins. This mirrors
    /// `Pwm::active_process`.
    active_process: [OptionalCell<ProcessId>; NUM_PINS],
}

impl<'a, const NUM_PINS: usize> ReclaimLeakDemo<'a, NUM_PINS> {
    pub fn new(
        pins: &'a [&'a dyn gpio::Pin; NUM_PINS],
        grant: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    ) -> ReclaimLeakDemo<'a, NUM_PINS> {
        ReclaimLeakDemo {
            pins,
            apps: grant,
            active_process: [const { OptionalCell::empty() }; NUM_PINS],
        }
    }

    /// Copied from `Pwm::claim_pin`. Note what it does NOT do: enter the
    /// stored process's grant. Equality against a stale `ProcessId` always
    /// fails, so a dead owner locks the pin out permanently.
    pub fn claim_pin(&self, processid: ProcessId, pin: usize) -> bool {
        self.active_process[pin].map_or(true, |id| id == processid)
    }

    /// Copied from `Pwm::release_pin`.
    pub fn release_pin(&self, pin: usize) {
        self.active_process[pin].clear();
    }

    /// The `adc.rs` idiom, which `pwm.rs` lacks. Returns true if a dead owner
    /// was found and reclaimed.
    fn reclaim_if_dead(&self, pin: usize) -> bool {
        self.active_process[pin].map_or(false, |id| {
            match self.apps.enter(id, |_, _| {}) {
                Err(kernel::process::Error::NoSuchApp)
                | Err(kernel::process::Error::InactiveApp) => {
                    // Owner is gone. Clear the slot AND stop the hardware,
                    // which is the half that matters for a pin still driven.
                    self.active_process[pin].clear();
                    self.pins[pin].clear();
                    true
                }
                _ => false,
            }
        })
    }
}

impl<const NUM_PINS: usize> SyscallDriver for ReclaimLeakDemo<'_, NUM_PINS> {
    /// ### `command_num`
    ///
    /// - `0`: Driver existence check.
    /// - `1`: Claim the pin in `data1` and drive it high.
    /// - `2`: Release the pin in `data1` and drive it low.
    /// - `3`: Report the pin's state: 0 unclaimed, 1 claimed by the caller,
    ///   2 claimed by someone else (which includes a dead someone else).
    /// - `4`: Run the `adc.rs` reclaim idiom on the pin. Returns 1 if a dead
    ///   owner was reclaimed, 0 otherwise.
    fn command(
        &self,
        command_num: usize,
        data1: usize,
        _data2: usize,
        processid: ProcessId,
    ) -> CommandReturn {
        let pin = data1;
        if command_num != 0 && pin >= NUM_PINS {
            return CommandReturn::failure(ErrorCode::INVAL);
        }
        match command_num {
            0 => CommandReturn::success(),

            // Claim and drive high. Mirrors Pwm's command 1.
            1 => {
                if !self.claim_pin(processid, pin) {
                    CommandReturn::failure(ErrorCode::RESERVE)
                } else {
                    self.active_process[pin].set(processid);
                    self.pins[pin].make_output();
                    self.pins[pin].set();
                    CommandReturn::success()
                }
            }

            // Release and drive low. Mirrors Pwm's command 2, the only path
            // that ever clears ownership.
            2 => {
                if !self.claim_pin(processid, pin) {
                    CommandReturn::failure(ErrorCode::RESERVE)
                } else if self.active_process[pin].is_none() {
                    CommandReturn::failure(ErrorCode::OFF)
                } else {
                    self.release_pin(pin);
                    self.pins[pin].clear();
                    CommandReturn::success()
                }
            }

            // Observe ownership without changing it.
            3 => {
                let state = self.active_process[pin].map_or(0, |id| {
                    if id == processid {
                        1
                    } else {
                        2
                    }
                });
                CommandReturn::success_u32(state)
            }

            // Apply the adc.rs idiom on demand.
            4 => CommandReturn::success_u32(self.reclaim_if_dead(pin) as u32),

            _ => CommandReturn::failure(ErrorCode::NOSUPPORT),
        }
    }

    fn allocate_grant(&self, processid: ProcessId) -> Result<(), kernel::process::Error> {
        self.apps.enter(processid, |_, _| {})
    }
}
