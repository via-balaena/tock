// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! PIO gSPI (generic SPI) support.
//!
//! The driver is shared with the RP2040 and lives in `rp2xxx::pio_gspi`.
//! This alias fills in this chip's DMA layout, channel count and pin type.

use crate::dma::{NUM_CHANNELS, Rp2350DmaLayout};
use crate::gpio::RPGpioPin;

/// The shared gSPI driver, with this chip's types filled in.
pub type PioGSpi<'a> = rp2xxx::pio_gspi::PioGSpi<'a, Rp2350DmaLayout, NUM_CHANNELS, RPGpioPin<'a>>;
