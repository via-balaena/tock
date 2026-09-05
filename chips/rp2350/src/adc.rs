// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! The SAR ADC on the RP2350.
//!
//! The driver itself lives in the `rp2xxx` crate, shared with the other RP2
//! chip: the register layout is the same on both. What is specific to this
//! chip is here -- the base address, and the set of channels the package
//! bonds out.
//!
//! # Packages
//!
//! The channels below are the **QFN-60** package, the RP2350A, which is what a
//! Raspberry Pi Pico 2 carries: four analogue inputs and the temperature
//! sensor as the fifth. The QFN-80 package, the RP2350B, bonds eight inputs
//! and puts the sensor on channel 8; supporting it needs a second channel set
//! here, not a change to the shared driver.
//!
//! Ref: 12.4 "ADC and Temperature Sensor" in the RP2350 datasheet.

use kernel::utilities::StaticRef;
use rp2xxx::adc::AdcRegisters;

const ADC_BASE: StaticRef<AdcRegisters> =
    unsafe { StaticRef::new(0x400A0000 as *const AdcRegisters) };

/// The four analogue inputs a QFN-60 RP2350 bonds out, and the temperature
/// sensor.
#[repr(u32)]
#[derive(Copy, Clone, PartialEq)]
pub enum Channel {
    Channel0 = 0,
    Channel1 = 1,
    Channel2 = 2,
    Channel3 = 3,
    /// The on-die temperature sensor.
    Channel4 = 4,
}

impl rp2xxx::adc::Channel for Channel {
    fn ainsel(&self) -> u32 {
        *self as u32
    }

    fn is_temperature_sensor(&self) -> bool {
        *self == Channel::Channel4
    }
}

/// The shared SAR ADC driver, with this chip's channels filled in.
pub type Adc<'a> = rp2xxx::adc::Adc<'a, Channel>;

/// Create a driver for the ADC.
pub const fn new_adc<'a>() -> Adc<'a> {
    Adc::new(ADC_BASE)
}
