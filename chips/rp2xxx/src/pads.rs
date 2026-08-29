// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Pad controls the RP2 chips expose that `kernel::hil` has no equivalent
//! for.
//!
//! A driver that only reads and writes a pin can take `hil::gpio::Output` or
//! `hil::gpio::Input` and stay chip independent. Bringing up a fast
//! half duplex bus needs more than that: the drive strength, the slew rate
//! and the Schmitt trigger all have to be set, and the pin has to be pointed
//! at a PIO block. Both RP2 chips place these bits identically inside their
//! `GPIO_PAD` register, and both encode drive strength the same way, but each
//! exposes them through its own types.

/// How fast a pad drives an edge.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SlewRate {
    Slow,
    Fast,
}

/// How much current a pad can source or sink.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DriveStrength {
    Drive2mA,
    Drive4mA,
    Drive8mA,
    Drive12mA,
}

/// A pin whose pad can be tuned and pointed at a PIO block.
pub trait PioPad: Sized {
    /// A handle on the pad of one GPIO, by number.
    fn from_pin_number(pin: u32) -> Self;

    /// Point this pin at a PIO block, by index.
    fn select_pio(&self, pio_index: usize);

    /// Enable or disable the Schmitt trigger on the input path.
    fn set_schmitt(&self, enable: bool);

    /// Set how fast the pad drives an edge.
    fn set_slew_rate(&self, rate: SlewRate);

    /// Set how much current the pad can source or sink.
    fn set_drive_strength(&self, strength: DriveStrength);

    /// Disable both the pull up and the pull down.
    fn set_pull_none(&self);

    /// Take the pad out of isolation: enable the input, enable the output.
    fn activate_pads(&self);
}
