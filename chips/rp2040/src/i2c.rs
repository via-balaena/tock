// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! I2C0 and I2C1 on the RP2040.
//!
//! The driver itself lives in the `rp2xxx` crate, shared with the other RP2
//! chip: both fit the same Synopsys DW_apb_i2c at the same register offsets.
//! What is specific to this chip is here -- the base addresses -- along with
//! the `SystemClock` impl in `clocks.rs` and the `ResetLine` handle from
//! `resets.rs`.
//!
//! Ref: 4.3 "I2C" in the RP2040 datasheet.

use crate::clocks::Clocks;
use crate::interrupts;
use crate::nvic::Nvic;
use crate::resets::{Peripheral, PeripheralReset, Resets};
use kernel::utilities::StaticRef;
use rp2xxx::i2c::I2cRegisters;

const I2C0_BASE: StaticRef<I2cRegisters> =
    unsafe { StaticRef::new(0x40044000 as *const I2cRegisters) };

const I2C1_BASE: StaticRef<I2cRegisters> =
    unsafe { StaticRef::new(0x40048000 as *const I2cRegisters) };

const I2C0_RESET: &[Peripheral] = &[Peripheral::I2c0];
const I2C1_RESET: &[Peripheral] = &[Peripheral::I2c1];

/// The shared DW_apb_i2c driver, with this chip's clocks and resets filled in.
pub type I2c<'a, 'c> = rp2xxx::i2c::I2c<'a, 'c, Clocks, PeripheralReset<'a>, Nvic>;

/// Create a driver for I2C0.
pub fn new_i2c0<'a, 'c>(clocks: &'a Clocks, resets: &'a Resets) -> I2c<'a, 'c> {
    I2c::new(
        "I2C0",
        I2C0_BASE,
        clocks,
        resets.line(I2C0_RESET),
        Nvic::new(interrupts::I2C0_IRQ),
    )
}

/// Create a driver for I2C1.
///
/// **No `DefaultPeripherals` holds this one, and `chip.rs` does not route its
/// interrupt.** A board that builds it must add the `service_interrupt` arm
/// with it, or the first completion reaches `_ => false` and panics the
/// kernel. That predates the line being armed here: `next_pending_with_mask`
/// reads `ISPR`, so the poll path finds a pending interrupt whether or not
/// its line is enabled.
pub fn new_i2c1<'a, 'c>(clocks: &'a Clocks, resets: &'a Resets) -> I2c<'a, 'c> {
    I2c::new(
        "I2C1",
        I2C1_BASE,
        clocks,
        resets.line(I2C1_RESET),
        Nvic::new(interrupts::I2C1_IRQ),
    )
}
