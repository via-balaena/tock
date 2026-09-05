// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! The SAR ADC on the RP2040.
//!
//! The driver itself lives in the `rp2xxx` crate, shared with the other RP2
//! chip: the register layout is the same on both. What is specific to this
//! chip is here -- the base address, and the set of channels the package
//! bonds out.
//!
//! Ref: 4.9 "ADC and Temperature Sensor" in the RP2040 datasheet.

use kernel::utilities::StaticRef;
use rp2xxx::adc::AdcRegisters;

const ADC_BASE: StaticRef<AdcRegisters> =
    unsafe { StaticRef::new(0x4004C000 as *const AdcRegisters) };

/// The four analogue inputs the RP2040 bonds out, and the temperature sensor.
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
