// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Direct Memory Access (DMA) hardware.
//!
//! The driver itself is shared with the RP2040 and lives in `rp2xxx::dma`.
//! This module supplies what is specific to this chip: where the block is,
//! how many channels it has, and where the `CTRL_TRIG` fields that moved
//! between the two chips sit on this one.
//!
//! Refer to the RP2350 Datasheet, Section 12.
//! RP2350 Datasheet [1].
//!
//! [1]: https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf

use kernel::utilities::StaticRef;
use rp2xxx::dma::{ChannelRegisters, DmaIrqRegisters, DmaLayout};

pub use rp2xxx::dma::{
    DataSize, DmaChannelClient, DmaPeripheral, Irq, Transfer, bswap, chain_to, incr_write, treq_sel,
};

/// The RP2350 has 16 DMA channels, four more than the RP2040.
pub const NUM_CHANNELS: usize = 16;

/// Where the `CTRL_TRIG` fields that differ between the RP2 chips sit on the
/// RP2350.
///
/// This chip inserts `INCR_READ_REV` at bit 5 and `INCR_WRITE_REV` at bit 7.
/// The two are not adjacent, so `INCR_WRITE` sits between them and moves up
/// by one, while everything from `RING_SIZE` upwards moves by two. Taken from
/// the RP2350 Datasheet, Section 12.6.
pub struct Rp2350DmaLayout;

impl DmaLayout for Rp2350DmaLayout {
    const INCR_WRITE_SHIFT: usize = 6;
    const CHAIN_TO_SHIFT: usize = 13;
    const TREQ_SEL_SHIFT: usize = 17;
    const BSWAP_SHIFT: usize = 24;
    const BUSY_SHIFT: usize = 26;
}

/// The shared DMA driver, with this chip's layout and channel count.
pub type Dma<'a> = rp2xxx::dma::Dma<'a, Rp2350DmaLayout, NUM_CHANNELS>;
/// One channel of this chip's DMA block.
pub type DmaChannel<'a> = rp2xxx::dma::DmaChannel<'a, Rp2350DmaLayout, NUM_CHANNELS>;

const DMA_BASE: usize = 0x5000_0000;

/// The interrupt registers sit at the same offset on both chips. The four
/// extra channels here take up exactly the space the RP2040 leaves reserved.
const IRQ_OFFSET: usize = 0x400;

const CHANNELS: StaticRef<[ChannelRegisters; NUM_CHANNELS]> =
    unsafe { StaticRef::new(DMA_BASE as *const [ChannelRegisters; NUM_CHANNELS]) };
const IRQ: StaticRef<DmaIrqRegisters> =
    unsafe { StaticRef::new((DMA_BASE + IRQ_OFFSET) as *const DmaIrqRegisters) };

/// Which DMA channel. The RP2350 has sixteen.
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
    Channel12 = 12,
    Channel13 = 13,
    Channel14 = 14,
    Channel15 = 15,
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

    /// Every field this driver writes, at the bit the RP2350 datasheet gives
    /// it. These sit two places above where the RP2040 puts them, which is
    /// the whole reason the shifts are a trait rather than a declaration:
    /// getting them from the wrong chip builds cleanly and fails on silicon.
    ///
    /// Transcribed from the datasheet independently of the RP2040 values, so
    /// this and its counterpart in chips/rp2040 are two derivations that have
    /// to agree with the two-place shift between them.
    #[test]
    fn ctrl_trig_fields_sit_where_the_datasheet_puts_them() {
        assert_eq!(u32::from(treq_sel::<Rp2350DmaLayout>(0x3f)), 0x3f << 17);
        assert_eq!(u32::from(chain_to::<Rp2350DmaLayout>(0xf)), 0xf << 13);
        assert_eq!(u32::from(incr_write::<Rp2350DmaLayout>(true)), 1 << 6);
        assert_eq!(u32::from(bswap::<Rp2350DmaLayout>(true)), 1 << 24);
        assert_eq!(Rp2350DmaLayout::BUSY_SHIFT, 26);
    }

    /// How far each field moved from its RP2040 position.
    ///
    /// Two bits are inserted, and not next to each other: `INCR_READ_REV` at
    /// bit 5 and `INCR_WRITE_REV` at bit 7. So `INCR_WRITE`, which sits
    /// between them, moves up by one, and everything from `RING_SIZE` upwards
    /// moves by two. Writing this down as a rule rather than five numbers is
    /// what makes a transcription slip visible; an earlier version of this
    /// test asserted a flat two places and failed, correctly.
    #[test]
    fn each_moved_field_shifted_by_the_bits_inserted_below_it() {
        // One bit inserted below it: INCR_READ_REV.
        assert_eq!(Rp2350DmaLayout::INCR_WRITE_SHIFT, 5 + 1);
        // Two bits inserted below these: INCR_READ_REV and INCR_WRITE_REV.
        assert_eq!(Rp2350DmaLayout::CHAIN_TO_SHIFT, 11 + 2);
        assert_eq!(Rp2350DmaLayout::TREQ_SEL_SHIFT, 15 + 2);
        assert_eq!(Rp2350DmaLayout::BSWAP_SHIFT, 22 + 2);
        assert_eq!(Rp2350DmaLayout::BUSY_SHIFT, 24 + 2);
    }

    /// The whole word, composed the way `DmaChannel::enable` composes it, for
    /// the two transfers the CYW43439 driver makes.
    #[test]
    fn the_gspi_control_words() {
        let push =
            treq_sel::<Rp2350DmaLayout>(DmaPeripheral::PioTxFifo(0, SMNumber::SM0).treq_number())
                + FieldValue::<u32, CTRL_TRIG::Register>::from(DataSize::Word)
                + bswap::<Rp2350DmaLayout>(false)
                + CTRL_TRIG::INCR_READ::SET
                + incr_write::<Rp2350DmaLayout>(false)
                + chain_to::<Rp2350DmaLayout>(0)
                + CTRL_TRIG::EN::SET;
        assert_eq!(u32::from(push), (2 << 2) | (1 << 4) | 1);

        let pull =
            treq_sel::<Rp2350DmaLayout>(DmaPeripheral::PioRxFifo(0, SMNumber::SM0).treq_number())
                + FieldValue::<u32, CTRL_TRIG::Register>::from(DataSize::Word)
                + bswap::<Rp2350DmaLayout>(false)
                + CTRL_TRIG::INCR_READ::CLEAR
                + incr_write::<Rp2350DmaLayout>(true)
                + chain_to::<Rp2350DmaLayout>(0)
                + CTRL_TRIG::EN::SET;
        //  TREQ 4 << 17 | DATA_SIZE 2 << 2 | INCR_WRITE 1 << 6 | EN 1
        assert_eq!(u32::from(pull), (4 << 17) | (2 << 2) | (1 << 6) | 1);
    }

    /// PIO2's transfer requests continue the pattern at 16 to 23.
    #[test]
    fn pio2_transfer_requests_follow_pio1() {
        assert_eq!(DmaPeripheral::PioTxFifo(2, SMNumber::SM0).treq_number(), 16);
        assert_eq!(DmaPeripheral::PioRxFifo(2, SMNumber::SM3).treq_number(), 23);
    }
}
