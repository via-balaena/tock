// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright OxidOS Automotive 2025.

//! PIO gSPI (generic SPI) support.
//!
//! The driver is shared with the RP2350 and lives in `rp2xxx::pio_gspi`.
//! This alias fills in this chip's DMA layout, channel count and pin type.

use crate::dma::{NUM_CHANNELS, Rp2040DmaLayout};
use crate::gpio::RPGpioPin;

/// The shared gSPI driver, with this chip's types filled in.
pub type PioGSpi<'a> = rp2xxx::pio_gspi::PioGSpi<'a, Rp2040DmaLayout, NUM_CHANNELS, RPGpioPin<'a>>;
