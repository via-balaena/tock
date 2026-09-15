// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

use kernel::grant::{AllowRoCount, AllowRwCount, Grant, UpcallCount};
use kernel::hil;
use kernel::syscall::{CommandReturn, SyscallDriver};
use kernel::utilities::cells::OptionalCell;
use kernel::{ErrorCode, ProcessId};

/// Syscall driver number.
use capsules_core::driver;
pub const DRIVER_NUM: usize = driver::NUM::Pwm as usize;

// An empty app, for potential uses in future updates of the driver
#[derive(Default)]
pub struct App;

pub struct Pwm<'a, const NUM_PINS: usize> {
    /// The usable pwm pins.
    pwm_pins: &'a [&'a dyn hil::pwm::PwmPin; NUM_PINS],
    /// Per-app state.
    apps: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    /// An array of apps associated to their reserved pins.
    active_process: [OptionalCell<ProcessId>; NUM_PINS],
}

impl<'a, const NUM_PINS: usize> Pwm<'a, NUM_PINS> {
    pub fn new(
        pwm_pins: &'a [&'a dyn hil::pwm::PwmPin; NUM_PINS],
        grant: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    ) -> Pwm<'a, NUM_PINS> {
        assert!(u16::try_from(NUM_PINS).is_ok());
        Pwm {
            pwm_pins,
            apps: grant,
            active_process: [const { OptionalCell::empty() }; NUM_PINS],
        }
    }

    /// Whether `processid` may use `pin`.
    ///
    /// True when nothing holds the pin, when this process already holds it,
    /// or when **the process that held it no longer exists** -- in which case
    /// the claim is reclaimed and the output stopped on the way past.
    ///
    /// That last case is the one this used to get wrong. A process that dies
    /// while driving a pin never reaches command 2, so its `ProcessId` stayed
    /// in `active_process` and every later claimant was refused `RESERVE`
    /// forever -- including the same application restarted, which is given a
    /// new `ProcessId`. The pin also kept running at whatever duty cycle it
    /// was left at, which for anything that moves is the worse half.
    ///
    /// **Reclaiming is lazy**: it happens when someone next asks for the pin,
    /// not when the owner dies, because a capsule only learns of a death by
    /// trying to enter the grant. A device that must stop within a bounded
    /// time cannot rely on this and needs a capsule of its own with a
    /// callback to check liveness from -- an alarm, or its own completion
    /// interrupt.
    pub fn claim_pin(&self, processid: ProcessId, pin: usize) -> bool {
        self.active_process[pin].map_or(true, |id| {
            if id == processid {
                // The same app coming back to a pin it holds.
                return true;
            }

            // Another process holds it. Whether that is a genuine refusal or
            // a stale claim depends on whether that process still exists.
            // Both errors, as `adc.rs` checks both: `NoSuchApp` is a process
            // that is gone, `InactiveApp` one that cannot run again.
            match self.apps.enter(id, |_, _| {}) {
                Ok(()) => false,
                Err(kernel::process::Error::NoSuchApp)
                | Err(kernel::process::Error::InactiveApp) => {
                    let _ = self.release_pin(pin);
                    true
                }
                // Anything else is not evidence that the owner is gone, so
                // refuse: leaving a pin claimed is recoverable, handing a
                // running output to a second process is not.
                Err(_) => false,
            }
        })
    }

    /// Release `pin` and stop its output.
    ///
    /// Stopping is part of releasing rather than a separate step the caller
    /// has to remember. A released pin that is still driven is exactly the
    /// state a dead owner used to leave behind, and the name would be a lie.
    ///
    /// The claim is cleared even if `stop` fails: a pin that cannot be
    /// stopped is a problem, but one that also cannot be claimed again is a
    /// worse one.
    pub fn release_pin(&self, pin: usize) -> Result<(), ErrorCode> {
        let stopped = self.pwm_pins[pin].stop();
        self.active_process[pin].clear();
        stopped
    }
}

/// Provide an interface for userland.
impl<const NUM_PINS: usize> SyscallDriver for Pwm<'_, NUM_PINS> {
    /// Command interface.
    ///
    /// ### `command_num`
    ///
    /// - `0`: Driver existence check.
    /// - `1`: Start the PWM pin output. First 16 bits of `data1` are used for
    ///   the duty cycle, as a percentage with 2 decimals, and the last 16 bits
    ///   of `data1` are used for the PWM channel to be controlled. `data2` is
    ///   used for the frequency in hertz. For the duty cycle, 100% is the max
    ///   duty cycle for this pin.
    /// - `2`: Stop the PWM output.
    /// - `3`: Return the maximum possible frequency for this pin.
    /// - `4`: Return number of PWM pins if this driver is included on the platform.
    fn command(
        &self,
        command_num: usize,
        data1: usize,
        data2: usize,
        processid: ProcessId,
    ) -> CommandReturn {
        match command_num {
            // Check existence.
            0 => CommandReturn::success(),

            // Start the pwm output.

            // data1 stores the duty cycle and the pin number in the format
            // +------------------+------------------+
            // | duty cycle (u16) |   pwm pin (u16)  |
            // +------------------+------------------+
            // This format was chosen because there are only 2 parameters in the command function that can be used for storing values,
            // but in this case, 3 values are needed (pin, frequency, duty cycle), so data1 stores two of these values that can be
            // represented using only 16 bits.
            1 => {
                let pin = data1 & ((1 << 16) - 1);
                let duty_cycle = data1 >> 16;
                let frequency_hz = data2;

                if pin >= NUM_PINS {
                    // App asked to use a pin that doesn't exist.
                    CommandReturn::failure(ErrorCode::INVAL)
                } else {
                    if !self.claim_pin(processid, pin) {
                        // App cannot claim pin.
                        CommandReturn::failure(ErrorCode::RESERVE)
                    } else {
                        // App can claim pin, start pwm pin at given frequency and duty_cycle.
                        self.active_process[pin].set(processid);
                        // Duty cycle is represented as a 4 digit number, so we divide by 10000 to get the percentage of the max duty cycle.
                        // e.g.: a duty cycle of 60.5% is represented as 6050, so the actual value of the duty cycle is
                        // 6050 * max_duty_cycle / 10000 = 0.605 * max_duty_cycle
                        self.pwm_pins[pin]
                            .start(
                                frequency_hz,
                                duty_cycle * self.pwm_pins[pin].get_maximum_duty_cycle() / 10000,
                            )
                            .into()
                    }
                }
            }

            // Stop the PWM output.
            2 => {
                let pin = data1;
                if pin >= NUM_PINS {
                    // App asked to use a pin that doesn't exist.
                    CommandReturn::failure(ErrorCode::INVAL)
                } else {
                    if !self.claim_pin(processid, pin) {
                        // App cannot claim pin.
                        CommandReturn::failure(ErrorCode::RESERVE)
                    } else if self.active_process[pin].is_none() {
                        // If there is no active app, the pwm pin isn't in use.
                        CommandReturn::failure(ErrorCode::OFF)
                    } else {
                        // Releasing is what stops the output.
                        self.release_pin(pin).into()
                    }
                }
            }

            // Get max frequency of pin.
            3 => {
                let pin = data1;
                if pin >= NUM_PINS {
                    CommandReturn::failure(ErrorCode::INVAL)
                } else {
                    CommandReturn::success_u32(self.pwm_pins[pin].get_maximum_frequency_hz() as u32)
                }
            }

            // Return number of usable PWM pins.
            4 => CommandReturn::success_u32(NUM_PINS as u32),

            _ => CommandReturn::failure(ErrorCode::NOSUPPORT),
        }
    }

    fn allocate_grant(&self, processid: ProcessId) -> Result<(), kernel::process::Error> {
        self.apps.enter(processid, |_, _| {})
    }
}
