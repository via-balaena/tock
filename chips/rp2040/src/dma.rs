// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Direct Memory Access (DMA) hardware.
//!
//! The driver itself is shared with the RP2350 and lives in `rp2xxx::dma`.
//! This module supplies what is specific to this chip: where the block is,
//! how many channels it has, and where the `CTRL_TRIG` fields that moved
//! between the two chips sit on this one.
//!
//! Refer to the RP2040 Datasheet, Section 2.5.
//! RP2040 Datasheet [1].
//!
//! [1]: https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf

use kernel::utilities::StaticRef;
use rp2xxx::dma::{ChannelRegisters, DmaIrqRegisters, DmaLayout};

pub use rp2xxx::dma::{
    DataSize, DmaChannelClient, DmaPeripheral, Irq, Transfer, bswap, chain_to, incr_write, treq_sel,
};

/// The RP2040 has 12 DMA channels.
pub const NUM_CHANNELS: usize = 12;

/// Where the `CTRL_TRIG` fields that differ between the RP2 chips sit on the
/// RP2040. Taken from the RP2040 Datasheet, Section 2.5.7.
pub struct Rp2040DmaLayout;

impl DmaLayout for Rp2040DmaLayout {
    const INCR_WRITE_SHIFT: usize = 5;
    const CHAIN_TO_SHIFT: usize = 11;
    const TREQ_SEL_SHIFT: usize = 15;
    const BSWAP_SHIFT: usize = 22;
    const BUSY_SHIFT: usize = 24;
}

/// The shared DMA driver, with this chip's layout and channel count.
pub type Dma<'a> = rp2xxx::dma::Dma<'a, Rp2040DmaLayout, NUM_CHANNELS>;
/// One channel of this chip's DMA block.
pub type DmaChannel<'a> = rp2xxx::dma::DmaChannel<'a, Rp2040DmaLayout, NUM_CHANNELS>;

const DMA_BASE: usize = 0x5000_0000;
const IRQ_OFFSET: usize = 0x400;

const CHANNELS: StaticRef<[ChannelRegisters; NUM_CHANNELS]> =
    unsafe { StaticRef::new(DMA_BASE as *const [ChannelRegisters; NUM_CHANNELS]) };
const IRQ: StaticRef<DmaIrqRegisters> =
    unsafe { StaticRef::new((DMA_BASE + IRQ_OFFSET) as *const DmaIrqRegisters) };

/// Which DMA channel. The RP2040 has twelve.
#[derive(Clone, Copy)]
pub enum Channel {
    Channel0 = 0,
    Channel1 = 1,
    Channel2 = 2,
    Channel3 = 3,
    Channel4 = 4,
    Channel5 = 5,
    Channel6 = 6,
    Channel7 = 7,
    Channel8 = 8,
    Channel9 = 9,
    Channel10 = 10,
    Channel11 = 11,
}

/// Create a driver for the DMA block.
pub const fn new<'a>() -> Dma<'a> {
    Dma::new(CHANNELS, IRQ)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel::utilities::registers::FieldValue;
    use rp2xxx::dma::CTRL_TRIG;
    use rp2xxx::pio::SMNumber;

    /// Every field this driver writes, at the bit the RP2040 datasheet gives
    /// it. These are the positions that move on the RP2350, so a shared
    /// driver that got them from the wrong chip would still build and would
    /// still pass every other test.
    #[test]
    fn ctrl_trig_fields_sit_where_the_datasheet_puts_them() {
        assert_eq!(u32::from(treq_sel::<Rp2040DmaLayout>(0x3f)), 0x3f << 15);
        assert_eq!(u32::from(chain_to::<Rp2040DmaLayout>(0xf)), 0xf << 11);
        assert_eq!(u32::from(incr_write::<Rp2040DmaLayout>(true)), 1 << 5);
        assert_eq!(u32::from(bswap::<Rp2040DmaLayout>(true)), 1 << 22);
        assert_eq!(Rp2040DmaLayout::BUSY_SHIFT, 24);
    }

    /// The whole word, composed the way `DmaChannel::enable` composes it.
    ///
    /// These two are what the CYW43439 driver asks for on every transfer, so
    /// if either is wrong the radio does not come up.
    #[test]
    fn the_gspi_control_words_are_what_they_were() {
        let data_size = FieldValue::<u32, CTRL_TRIG::Register>::from(DataSize::Word);

        // Memory to peripheral, PIO0 TX FIFO 0, channel 0: read address
        // increments, write address does not.
        let push =
            treq_sel::<Rp2040DmaLayout>(DmaPeripheral::PioTxFifo(0, SMNumber::SM0).treq_number())
                + FieldValue::<u32, CTRL_TRIG::Register>::from(DataSize::Word)
                + bswap::<Rp2040DmaLayout>(false)
                + CTRL_TRIG::INCR_READ::SET
                + incr_write::<Rp2040DmaLayout>(false)
                + chain_to::<Rp2040DmaLayout>(0)
                + CTRL_TRIG::EN::SET;
        //  TREQ 0 << 15 | DATA_SIZE 2 << 2 | INCR_READ 1 << 4 | EN 1
        assert_eq!(u32::from(push), (2 << 2) | (1 << 4) | 1);

        // Peripheral to memory, PIO0 RX FIFO 0, channel 0.
        let pull =
            treq_sel::<Rp2040DmaLayout>(DmaPeripheral::PioRxFifo(0, SMNumber::SM0).treq_number())
                + data_size
                + bswap::<Rp2040DmaLayout>(false)
                + CTRL_TRIG::INCR_READ::CLEAR
                + incr_write::<Rp2040DmaLayout>(true)
                + chain_to::<Rp2040DmaLayout>(0)
                + CTRL_TRIG::EN::SET;
        //  TREQ 4 << 15 | DATA_SIZE 2 << 2 | INCR_WRITE 1 << 5 | EN 1
        assert_eq!(u32::from(pull), (4 << 15) | (2 << 2) | (1 << 5) | 1);
    }

    /// The transfer request numbers, against the table in the datasheet.
    #[test]
    fn treq_numbers_match_the_datasheet_table() {
        assert_eq!(DmaPeripheral::PioTxFifo(0, SMNumber::SM0).treq_number(), 0);
        assert_eq!(DmaPeripheral::PioTxFifo(0, SMNumber::SM3).treq_number(), 3);
        assert_eq!(DmaPeripheral::PioRxFifo(0, SMNumber::SM0).treq_number(), 4);
        assert_eq!(DmaPeripheral::PioRxFifo(0, SMNumber::SM3).treq_number(), 7);
        assert_eq!(DmaPeripheral::PioTxFifo(1, SMNumber::SM0).treq_number(), 8);
        assert_eq!(DmaPeripheral::PioTxFifo(1, SMNumber::SM3).treq_number(), 11);
        assert_eq!(DmaPeripheral::PioRxFifo(1, SMNumber::SM0).treq_number(), 12);
        assert_eq!(DmaPeripheral::PioRxFifo(1, SMNumber::SM3).treq_number(), 15);
    }
}
