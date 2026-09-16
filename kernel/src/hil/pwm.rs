// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Interfaces for Pulse Width Modulation output.
//!
//! # This interface is synchronous
//!
//! There is no client trait and no completion callback anywhere in this file.
//! `start` and `stop` do the work and return the answer, so **the `Result` is
//! the whole answer** -- there is no later notification that changes it.
//!
//! That has a consequence for anything sitting between a caller and a driver.
//! A virtualizer must pass the underlying result back, not queue the
//! operation and answer `Ok(())`: a deferred call cannot return a result, so
//! deferring is the same as discarding it. `MuxPwm` did exactly that and told
//! callers their pin had started when the chip had refused the frequency.
//!
//! # Errors
//!
//! Enumerated from what the implementations already do. They are few because
//! the interface is small, but they were not written down, and a caller
//! cannot tell "the pin is running" from "the pin is not running and nobody
//! said so" without them.

use crate::ErrorCode;

/// PWM control for a single pin.
pub trait Pwm {
    /// The chip-dependent type of a PWM pin.
    type Pin;

    /// Generate a PWM signal on the given pin at the given frequency and duty
    /// cycle.
    ///
    /// - `frequency_hz` is specified in Hertz.
    /// - `duty_cycle` is specified as a portion of the max duty cycle supported
    ///   by the chip. Clients should call `get_maximum_duty_cycle()` to get the
    ///   value that corresponds to 100% duty cycle, and divide that
    ///   appropriately to get the desired duty cycle value. For example, a 25%
    ///   duty cycle would be `PWM0.get_maximum_duty_cycle() / 4`.
    ///
    /// Return values:
    /// - `Ok(())`: the pin is generating the signal now. There is no callback;
    ///   this is the whole answer.
    /// - `INVAL`: the chip cannot produce this. That covers a `frequency_hz`
    ///   above [`Pwm::get_maximum_frequency_hz`], a `duty_cycle` above
    ///   [`Pwm::get_maximum_duty_cycle`], and a frequency too low to represent
    ///   in the timer's divider.
    /// - `FAIL`: the peripheral is not in a state to drive the pin at all --
    ///   for instance its clock has not been configured.
    ///
    /// **Do not pass a `frequency_hz` of 0; call [`Pwm::stop`] instead.** It
    /// is not portable: two in-tree drivers answer `INVAL`, and two stop the
    /// pin and answer `Ok(())`. A caller that means to stop has an
    /// unambiguous way to say so, and one that arrives at 0 by arithmetic
    /// wants to hear about it.
    fn start(
        &self,
        pin: &Self::Pin,
        frequency_hz: usize,
        duty_cycle: usize,
    ) -> Result<(), ErrorCode>;

    /// Stop a PWM pin output.
    ///
    /// **Idempotent.** Stopping a pin that is not running is `Ok(())`, not an
    /// error: what this promises is that the pin is not driven when it
    /// returns, and that already holds. No in-tree implementation fails this
    /// call.
    fn stop(&self, pin: &Self::Pin) -> Result<(), ErrorCode>;

    /// Return the maximum PWM frequency supported by the PWM implementation.
    /// The frequency will be specified in Hertz.
    ///
    /// Never 0: a caller divides by it to pick a frequency.
    fn get_maximum_frequency_hz(&self) -> usize;

    /// Return an opaque number that represents a 100% duty cycle. This value
    /// will be hardware specific, and essentially represents the precision
    /// of the underlying PWM hardware.
    ///
    /// Users of this HIL should divide this number to calculate a duty cycle
    /// value suitable for calling `start()`. For example, to generate a 50%
    /// duty cycle:
    ///
    /// ```ignore
    /// let max = PWM0.get_maximum_duty_cycle();
    /// let dc  = max / 2;
    /// PWM0.start(pin, freq, dc);
    /// ```
    ///
    /// Never 0: a caller divides by it. The number is opaque and chip
    /// specific, so it is only meaningful as a denominator -- comparing it
    /// between two implementations says nothing.
    fn get_maximum_duty_cycle(&self) -> usize;
}

/// Higher-level PWM interface that restricts the user to a specific PWM pin.
/// This is particularly useful for passing to capsules that need to control
/// only a specific pin.
///
/// Every method means what the matching [`Pwm`] method means, **including its
/// errors** -- see there rather than here, so the two cannot drift apart. An
/// implementation standing between this and a chip returns what the chip
/// returned; see the note at the top of this file about why it must not
/// answer on the chip's behalf.
pub trait PwmPin {
    /// Start a PWM output. Same as the `start` function in the `Pwm` trait.
    fn start(&self, frequency_hz: usize, duty_cycle: usize) -> Result<(), ErrorCode>;

    /// Stop a PWM output. Same as the `stop` function in the `Pwm` trait.
    fn stop(&self) -> Result<(), ErrorCode>;

    /// Return the maximum PWM frequency supported by the PWM implementation.
    /// Same as the `get_maximum_frequency_hz` function in the `Pwm` trait.
    fn get_maximum_frequency_hz(&self) -> usize;

    /// Return an opaque number that represents a 100% duty cycle. This value
    /// Same as the `get_maximum_duty_cycle` function in the `Pwm` trait.
    fn get_maximum_duty_cycle(&self) -> usize;
}
