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

/// Enable the ADC's NVIC line.
///
/// Setting `INTE::FIFO` in the block is NOT sufficient, and this is the second
/// driver on this chip to need saying so -- see `enable_interrupt` in `dma.rs`.
/// The kernel sleeps in WFI whenever no process is runnable, and on a Cortex-M
/// a pending interrupt whose NVIC line is disabled does not wake it.
/// `Chip::init` disables every line, so until something enables this one a
/// conversion that is the only thing left to wake the kernel never does.
///
/// The line heals itself as soon as the kernel is awake for any other reason.
/// `next_pending_with_mask` reads ISPR and never ISER (`arch/cortex-m/src/
/// nvic.rs`), so the poll path sees a pending-but-disabled source, services it,
/// and `service_pending_interrupts` calls `enable()` afterwards. That bounds
/// the hazard to the first interrupt this source raises, and makes it fatal
/// only when nothing else is running to do the waking.
///
/// Measured on a Pico 2 W: Doom ran for a minute or two, then stopped with no
/// error, no output, the process still Yielded, and the core in WFI where the
/// debugger reports "target was in unknown state when halt was requested".
/// Adding this call fixed it. Why the stop took a minute rather than arriving
/// on the first conversion is NOT explained by the paragraph above and has not
/// been isolated.
///
/// Must be called AFTER `Chip::init()`, which disables every line.
pub fn enable_nvic() {
    cortexm33::nvic::Nvic::new(crate::interrupts::ADC_IRQ_FIFO).enable();
}

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
