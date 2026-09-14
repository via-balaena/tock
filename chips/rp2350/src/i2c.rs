// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! I2C0 and I2C1 on the RP2350.
//!
//! The driver itself lives in the `rp2xxx` crate, shared with the other RP2
//! chip: both fit the same Synopsys DW_apb_i2c, and every register offset the
//! driver declares appears at the same place in Table 1055 of this chip's
//! datasheet as in Table 464 of the RP2040's. What is specific to this chip is
//! here -- the base addresses -- along with the `SystemClock` impl in
//! `clocks.rs` and the `ResetLine` handle from `resets.rs`.
//!
//! Ref: 12.2 "I2C" in the RP2350 datasheet.

use crate::clocks::Clocks;
use crate::resets::{Peripheral, PeripheralReset, Resets};
use kernel::mmio;
use rp2xxx::i2c::I2cRegisters;

mmio! {
    safety: "RP2350 datasheet 12.2.17, 'List of registers'. I2C0 CONFIRMED ON SILICON: IC_COMP_TYPE at 0x400900fc reads 0x44570140, the Synopsys signature the datasheet documents. I2C1 not exercised";

    I2C0_BASE: I2cRegisters = 0x40090000,
    I2C1_BASE: I2cRegisters = 0x40098000,
}

const I2C0_RESET: &[Peripheral] = &[Peripheral::I2c0];
const I2C1_RESET: &[Peripheral] = &[Peripheral::I2c1];

/// The shared DW_apb_i2c driver, with this chip's clocks and resets filled in.
pub type I2c<'a, 'c> = rp2xxx::i2c::I2c<'a, 'c, Clocks, PeripheralReset<'a>>;

/// Create a driver for I2C0.
pub fn new_i2c0<'a, 'c>(clocks: &'a Clocks, resets: &'a Resets) -> I2c<'a, 'c> {
    I2c::new("I2C0", I2C0_BASE, clocks, resets.line(I2C0_RESET))
}

/// Create a driver for I2C1.
pub fn new_i2c1<'a, 'c>(clocks: &'a Clocks, resets: &'a Resets) -> I2c<'a, 'c> {
    I2c::new("I2C1", I2C1_BASE, clocks, resets.line(I2C1_RESET))
}
