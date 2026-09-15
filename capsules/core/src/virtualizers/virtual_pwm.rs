// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Virtualize a PWM interface.
//!
//! `MuxPwm` provides shared access to a single PWM interface for multiple
//! users. `PwmPinUser` provides access to a specific PWM pin.
//!
//! Usage
//! -----
//!
//! ```rust,ignore
//! # use kernel::static_init;
//!
//! let mux_pwm = static_init!(
//!     capsules_core::virtual_pwm::MuxPwm<'static, nrf52::pwm::Pwm>,
//!     capsules_core::virtual_pwm::MuxPwm::new(&base_peripherals.pwm0)
//! );
//! let virtual_pwm_buzzer = static_init!(
//!     capsules_core::virtual_pwm::PwmPinUser<'static, nrf52::pwm::Pwm>,
//!     capsules_core::virtual_pwm::PwmPinUser::new(mux_pwm, nrf5x::pinmux::Pinmux::new(31))
//! );
//! virtual_pwm_buzzer.add_to_mux();
//! ```

use kernel::ErrorCode;
use kernel::collections::list::{List, ListLink, ListNode};
use kernel::hil;
use kernel::utilities::cells::OptionalCell;

pub struct MuxPwm<'a, P: hil::pwm::Pwm> {
    pwm: &'a P,
    devices: List<'a, PwmPinUser<'a, P>>,
}

impl<'a, P: hil::pwm::Pwm> MuxPwm<'a, P> {
    pub const fn new(pwm: &'a P) -> MuxPwm<'a, P> {
        MuxPwm {
            pwm,
            devices: List::new(),
        }
    }

    /// Run every operation that is waiting.
    ///
    /// There is no such thing as an operation in flight here. `hil::pwm::Pwm`
    /// is synchronous -- `start` and `stop` return a `Result` and the HIL has
    /// no completion callback at all -- so a pending operation can always be
    /// carried out immediately.
    ///
    /// This used to keep an `inflight` slot: the first user to start claimed
    /// it, and while it was held every OTHER user's operation was left in its
    /// cell and never run, while `PwmPinUser::start` went on answering
    /// `Ok(())`. One PWM pin at a time, silently. Nothing noticed because
    /// every board in the tree drives a buzzer and a mux with one user never
    /// contends; on a board with two it cost a working output and reported
    /// nothing. Confirmed on RP2350 silicon by register read -- the starved
    /// channel had its TOP, divider and compare correctly programmed with
    /// `CSR.EN` clear.
    fn do_next_op(&self) {
        for node in self.devices.iter() {
            node.operation.take().map(|operation| match operation {
                Operation::Simple {
                    frequency_hz,
                    duty_cycle,
                } => {
                    let _ = self.pwm.start(&node.pin, frequency_hz, duty_cycle);
                }
                Operation::Stop => {
                    let _ = self.pwm.stop(&node.pin);
                }
            });
        }
    }
}

#[derive(Copy, Clone, PartialEq)]
enum Operation {
    Simple {
        frequency_hz: usize,
        duty_cycle: usize,
    },
    Stop,
}

pub struct PwmPinUser<'a, P: hil::pwm::Pwm> {
    mux: &'a MuxPwm<'a, P>,
    pin: P::Pin,
    operation: OptionalCell<Operation>,
    next: ListLink<'a, PwmPinUser<'a, P>>,
}

impl<'a, P: hil::pwm::Pwm> PwmPinUser<'a, P> {
    pub const fn new(mux: &'a MuxPwm<'a, P>, pin: P::Pin) -> PwmPinUser<'a, P> {
        PwmPinUser {
            mux,
            pin,
            operation: OptionalCell::empty(),
            next: ListLink::empty(),
        }
    }

    pub fn add_to_mux(&'a self) {
        self.mux.devices.push_head(self);
    }
}

impl<'a, P: hil::pwm::Pwm> ListNode<'a, PwmPinUser<'a, P>> for PwmPinUser<'a, P> {
    fn next(&'a self) -> &'a ListLink<'a, PwmPinUser<'a, P>> {
        &self.next
    }
}

impl<P: hil::pwm::Pwm> hil::pwm::PwmPin for PwmPinUser<'_, P> {
    fn start(&self, frequency_hz: usize, duty_cycle: usize) -> Result<(), ErrorCode> {
        self.operation.set(Operation::Simple {
            frequency_hz,
            duty_cycle,
        });
        self.mux.do_next_op();
        Ok(())
    }

    fn stop(&self) -> Result<(), ErrorCode> {
        self.operation.set(Operation::Stop);
        self.mux.do_next_op();
        Ok(())
    }

    fn get_maximum_frequency_hz(&self) -> usize {
        self.mux.pwm.get_maximum_frequency_hz()
    }

    fn get_maximum_duty_cycle(&self) -> usize {
        self.mux.pwm.get_maximum_duty_cycle()
    }
}
