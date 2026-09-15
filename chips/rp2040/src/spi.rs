// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! SPI0 and SPI1 on the RP2040.
//!
//! The driver itself lives in the `rp2xxx` crate, shared with the other RP2
//! chip: both fit the same Arm PL022 PrimeCell with the same register layout.
//! What is specific to this chip is here -- the base addresses, and, in
//! `clocks.rs`, the `PeripheralClock` impl the driver uses to read `clk_peri`.
//!
//! Ref: 4.4.3 "SPI" in the RP2040 datasheet.

use crate::clocks::Clocks;
use crate::gpio::RPGpioPin;
use crate::interrupts;
use crate::nvic::Nvic;
use kernel::utilities::StaticRef;
use rp2xxx::spi::SpiRegisters;

const SPI0_BASE: StaticRef<SpiRegisters> =
    unsafe { StaticRef::new(0x4003C000 as *const SpiRegisters) };

const SPI1_BASE: StaticRef<SpiRegisters> =
    unsafe { StaticRef::new(0x40040000 as *const SpiRegisters) };

/// The shared PL022 driver, with this chip's clocks and GPIO pins filled in.
pub type Spi<'a> = rp2xxx::spi::Spi<'a, Clocks, RPGpioPin<'a>, Nvic>;

/// Create a driver for SPI0.
pub fn new_spi0(clocks: &Clocks) -> Spi<'_> {
    Spi::new(SPI0_BASE, clocks, Nvic::new(interrupts::SPI0_IRQ))
}

/// Create a driver for SPI1.///
/// **No `DefaultPeripherals` holds this one, and `chip.rs` does not route its
/// interrupt.** A board that builds it must add the `service_interrupt` arm
/// with it, or the first completion reaches `_ => false` and panics the
/// kernel. That predates the line being armed here: `next_pending_with_mask`
/// reads `ISPR`, so the poll path finds a pending interrupt whether or not
/// its line is enabled.
pub fn new_spi1(clocks: &Clocks) -> Spi<'_> {
    Spi::new(SPI1_BASE, clocks, Nvic::new(interrupts::SPI1_IRQ))
}
