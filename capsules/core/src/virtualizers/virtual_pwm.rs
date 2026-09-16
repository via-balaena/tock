// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Virtualize a PWM interface.
//!
//! `MuxPwm` provides shared access to a single PWM interface for multiple
//! users. `PwmPinUser` provides access to a specific PWM pin.
//!
//! There is no queue here, and there was never a need for one.
//! [`hil::pwm::Pwm`] is synchronous: `start` and `stop` return a `Result` and
//! the HIL has no completion callback at all, so an operation can always be
//! carried out on the spot and its answer handed straight back.
//!
//! Two defects came out of pretending otherwise. The first was an `inflight`
//! slot: the first user to start claimed it, and while it was held every
//! OTHER user's operation sat in its cell and never ran while `start` went on
//! answering `Ok(())` -- one PWM pin at a time, silently. Confirmed on RP2350
//! silicon by register read: the starved channel had its TOP, divider and
//! compare correctly programmed with `CSR.EN` clear.
//!
//! The second outlived the fix for the first. Operations were still deferred
//! through `do_next_op`, which ran them as `let _ = self.pwm.start(..)` --
//! **so the underlying error was discarded and the caller was told `Ok(())`
//! whatever happened.** An app asking for a frequency the chip refuses got a
//! success and a pin that never moved. A deferred call cannot return a result,
//! which is why removing the deferral is the fix rather than a tidy-up.
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
//! ```

use kernel::ErrorCode;
use kernel::hil;

pub struct MuxPwm<'a, P: hil::pwm::Pwm> {
    pwm: &'a P,
}

impl<'a, P: hil::pwm::Pwm> MuxPwm<'a, P> {
    pub const fn new(pwm: &'a P) -> MuxPwm<'a, P> {
        MuxPwm { pwm }
    }
}

pub struct PwmPinUser<'a, P: hil::pwm::Pwm> {
    mux: &'a MuxPwm<'a, P>,
    pin: P::Pin,
}

impl<'a, P: hil::pwm::Pwm> PwmPinUser<'a, P> {
    pub const fn new(mux: &'a MuxPwm<'a, P>, pin: P::Pin) -> PwmPinUser<'a, P> {
        PwmPinUser { mux, pin }
    }
}

impl<P: hil::pwm::Pwm> hil::pwm::PwmPin for PwmPinUser<'_, P> {
    /// Passed straight through, error and all.
    ///
    /// This used to queue the operation and answer `Ok(())` regardless of
    /// what the hardware said. Every error `hil::pwm` enumerates -- a
    /// frequency the chip cannot produce, a duty cycle above the maximum --
    /// reached the caller as a success.
    fn start(&self, frequency_hz: usize, duty_cycle: usize) -> Result<(), ErrorCode> {
        self.mux.pwm.start(&self.pin, frequency_hz, duty_cycle)
    }

    fn stop(&self) -> Result<(), ErrorCode> {
        self.mux.pwm.stop(&self.pin)
    }

    fn get_maximum_frequency_hz(&self) -> usize {
        self.mux.pwm.get_maximum_frequency_hz()
    }

    fn get_maximum_duty_cycle(&self) -> usize {
        self.mux.pwm.get_maximum_duty_cycle()
    }
}
