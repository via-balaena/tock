// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Direct Memory Access (DMA) hardware.
//!
//! Shared by the RP2040 and the RP2350. The channel registers and the
//! interrupt registers are laid out identically on both chips, and the
//! interrupt block starts at the same `+0x400` on both, because the RP2350's
//! four extra channels take up exactly the space the RP2040 leaves reserved.
//!
//! `CTRL_TRIG` is where they part. The RP2350 adds `INCR_READ_REV` at bit 5
//! and `INCR_WRITE_REV` at bit 7. Because the two inserted bits are not
//! adjacent, `INCR_WRITE` moves up by one place and everything from
//! `RING_SIZE` upwards moves by two. Nothing about that is visible to the
//! compiler: a field
//! declared at the wrong bit builds cleanly and then selects the wrong
//! transfer request at run time. So the fields that moved are not declared
//! here at all. They are built from the shifts in [`DmaLayout`], which each
//! chip crate fills in, and the tests check the result against values taken
//! from that chip's datasheet.
//!
//! Only five of the fields that moved are ever used by this driver. The
//! others, `SNIFF_EN`, `IRQ_QUIET`, `RING_SEL` and `RING_SIZE`, are not
//! declared, because a field that is never declared cannot be declared
//! wrongly.
//!
//! RP2040 Datasheet [1], RP2350 Datasheet [2].
//!
//! [1]: https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf
//! [2]: https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf

use kernel::utilities::StaticRef;
use kernel::utilities::cells::OptionalCell;
use kernel::utilities::registers::interfaces::{Readable, Writeable};
use kernel::utilities::registers::{FieldValue, ReadWrite, register_bitfields, register_structs};

register_structs! {
    /// One DMA channel. Identical on both chips.
    pub ChannelRegisters {
        (0x000 => pub read_addr: ReadWrite<u32, READ_ADDR::Register>),
        (0x004 => pub write_addr: ReadWrite<u32, WRITE_ADDR::Register>),
        (0x008 => pub trans_count: ReadWrite<u32, TRANS_COUNT::Register>),
        (0x00C => pub ctrl_trig: ReadWrite<u32, CTRL_TRIG::Register>),
        (0x010 => _reserved0),
        (0x040 => @END),
    },

    /// The interrupt registers, at `+0x400` from the base of the DMA block.
    ///
    /// The RP2350 continues past this with a third and fourth set of enable,
    /// force and status registers. This driver services only the first two,
    /// as the RP2040 driver always has.
    pub DmaIrqRegisters {
        (0x000 => pub intr: ReadWrite<u32, INTR::Register>),
        (0x004 => pub inte0: ReadWrite<u32, INTE::Register>),
        (0x008 => pub intf0: ReadWrite<u32, INTF::Register>),
        (0x00C => pub ints0: ReadWrite<u32, INTS::Register>),
        (0x010 => _reserved0),
        (0x014 => pub inte1: ReadWrite<u32, INTE::Register>),
        (0x018 => pub intf1: ReadWrite<u32, INTF::Register>),
        (0x01C => pub ints1: ReadWrite<u32, INTS::Register>),
        (0x020 => @END),
    }
}

register_bitfields![u32,
    pub READ_ADDR [
        READ_ADDR OFFSET(0) NUMBITS(32) []
    ],
    pub WRITE_ADDR [
        WRITE_ADDR OFFSET(0) NUMBITS(32) []
    ],
    pub TRANS_COUNT [
        TRANS_COUNT OFFSET(0) NUMBITS(32) []
    ],
    pub CTRL_TRIG [
        /// Logical OR of the READ_ERROR and WRITE_ERROR flags.
        AHB_ERROR OFFSET(31) NUMBITS(1) [],
        READ_ERROR OFFSET(30) NUMBITS(1) [],
        WRITE_ERROR OFFSET(29) NUMBITS(1) [],
        /// If 1, the read address increments after each transfer.
        INCR_READ OFFSET(4) NUMBITS(1) [],
        /// The size of each bus transfer.
        DATA_SIZE OFFSET(2) NUMBITS(2) [
            SIZE_BYTE = 0,
            SIZE_HALFWORD = 1,
            SIZE_WORD = 2
        ],
        HIGH_PRIORITY OFFSET(1) NUMBITS(1) [],
        EN OFFSET(0) NUMBITS(1) []
    ],
    pub INTR [
        INTR OFFSET(0) NUMBITS(16) []
    ],
    pub INTE [
        CH11 OFFSET(11) NUMBITS(1) [],
        CH10 OFFSET(10) NUMBITS(1) [],
        CH9 OFFSET(9) NUMBITS(1) [],
        CH8 OFFSET(8) NUMBITS(1) [],
        CH7 OFFSET(7) NUMBITS(1) [],
        CH6 OFFSET(6) NUMBITS(1) [],
        CH5 OFFSET(5) NUMBITS(1) [],
        CH4 OFFSET(4) NUMBITS(1) [],
        CH3 OFFSET(3) NUMBITS(1) [],
        CH2 OFFSET(2) NUMBITS(1) [],
        CH1 OFFSET(1) NUMBITS(1) [],
        CH0 OFFSET(0) NUMBITS(1) [],
    ],
    pub INTF [
        CH11 OFFSET(11) NUMBITS(1) [],
        CH10 OFFSET(10) NUMBITS(1) [],
        CH9 OFFSET(9) NUMBITS(1) [],
        CH8 OFFSET(8) NUMBITS(1) [],
        CH7 OFFSET(7) NUMBITS(1) [],
        CH6 OFFSET(6) NUMBITS(1) [],
        CH5 OFFSET(5) NUMBITS(1) [],
        CH4 OFFSET(4) NUMBITS(1) [],
        CH3 OFFSET(3) NUMBITS(1) [],
        CH2 OFFSET(2) NUMBITS(1) [],
        CH1 OFFSET(1) NUMBITS(1) [],
        CH0 OFFSET(0) NUMBITS(1) [],
    ],
    pub INTS [
        /// Indicates active channel interrupt requests which are currently causing IRQ 0 to
        /// Channel interrupts can be cleared by writing a bit m
        CH11 OFFSET(11) NUMBITS(1) [],
        CH10 OFFSET(10) NUMBITS(1) [],
        CH9 OFFSET(9) NUMBITS(1) [],
        CH8 OFFSET(8) NUMBITS(1) [],
        CH7 OFFSET(7) NUMBITS(1) [],
        CH6 OFFSET(6) NUMBITS(1) [],
        CH5 OFFSET(5) NUMBITS(1) [],
        CH4 OFFSET(4) NUMBITS(1) [],
        CH3 OFFSET(3) NUMBITS(1) [],
        CH2 OFFSET(2) NUMBITS(1) [],
        CH1 OFFSET(1) NUMBITS(1) [],
        CH0 OFFSET(0) NUMBITS(1) [],
    ]
];

/// Where the `CTRL_TRIG` fields that moved between chips actually sit.
///
/// The RP2350 inserts `INCR_READ_REV` at bit 5 and `INCR_WRITE_REV` at bit 7,
/// so every field above bit 4 shifts up by two. These are the five such
/// fields this driver uses; the rest are not declared anywhere.
///
/// Getting one of these wrong is not a build failure. It selects the wrong
/// transfer request, or reports the wrong channel busy, at run time. The
/// tests in each chip crate exist for exactly that reason.
pub trait DmaLayout {
    /// `INCR_WRITE`, one bit. RP2040 5, RP2350 6.
    const INCR_WRITE_SHIFT: usize;
    /// `CHAIN_TO`, four bits. RP2040 11, RP2350 13.
    const CHAIN_TO_SHIFT: usize;
    /// `TREQ_SEL`, six bits. RP2040 15, RP2350 17.
    const TREQ_SEL_SHIFT: usize;
    /// `BSWAP`, one bit. RP2040 22, RP2350 24.
    const BSWAP_SHIFT: usize;
    /// `BUSY`, one bit. RP2040 24, RP2350 26.
    const BUSY_SHIFT: usize;
}

/// `TREQ_SEL`, six bits wide, at this chip's offset.
pub fn treq_sel<L: DmaLayout>(value: u32) -> FieldValue<u32, CTRL_TRIG::Register> {
    FieldValue::<u32, CTRL_TRIG::Register>::new(0x3f, L::TREQ_SEL_SHIFT, value)
}

/// `CHAIN_TO`, four bits wide, at this chip's offset.
pub fn chain_to<L: DmaLayout>(value: u32) -> FieldValue<u32, CTRL_TRIG::Register> {
    FieldValue::<u32, CTRL_TRIG::Register>::new(0xf, L::CHAIN_TO_SHIFT, value)
}

/// `INCR_WRITE`, at this chip's offset.
pub fn incr_write<L: DmaLayout>(set: bool) -> FieldValue<u32, CTRL_TRIG::Register> {
    FieldValue::<u32, CTRL_TRIG::Register>::new(0x1, L::INCR_WRITE_SHIFT, set as u32)
}

/// `BSWAP`, at this chip's offset.
pub fn bswap<L: DmaLayout>(set: bool) -> FieldValue<u32, CTRL_TRIG::Register> {
    FieldValue::<u32, CTRL_TRIG::Register>::new(0x1, L::BSWAP_SHIFT, set as u32)
}

/// Direction of a transfer.
pub enum Transfer {
    MemoryToPeripheral,
    PeripheralToMemory,
}

/// Size of each bus access a transfer makes.
pub enum DataSize {
    Byte,
    HalfWord,
    Word,
}

impl From<DataSize> for FieldValue<u32, CTRL_TRIG::Register> {
    fn from(value: DataSize) -> Self {
        match value {
            DataSize::Byte => CTRL_TRIG::DATA_SIZE::SIZE_BYTE,
            DataSize::HalfWord => CTRL_TRIG::DATA_SIZE::SIZE_HALFWORD,
            DataSize::Word => CTRL_TRIG::DATA_SIZE::SIZE_WORD,
        }
    }
}

/// What a channel should pace itself against.
pub enum DmaPeripheral {
    /// The RX FIFO of one state machine, named by PIO block index and state
    /// machine. The block is an index rather than an enum because how many
    /// blocks a chip has is a fact about the chip.
    PioRxFifo(usize, crate::pio::SMNumber),
    /// The TX FIFO of one state machine. See `PioRxFifo`.
    PioTxFifo(usize, crate::pio::SMNumber),
}

impl DmaPeripheral {
    /// The transfer request number this peripheral is.
    ///
    /// The PIO numbers are laid out so the block, the direction and the state
    /// machine index give the answer directly: PIO0 TX is 0 to 3, PIO0 RX is
    /// 4 to 7, PIO1 TX is 8 to 11 and PIO1 RX is 12 to 15. The RP2350
    /// continues the same pattern with PIO2 at 16 to 23.
    pub fn treq_number(&self) -> u32 {
        let (pio, rx, sm) = match self {
            DmaPeripheral::PioRxFifo(pio, sm) => (*pio as u32, 1, *sm as u32),
            DmaPeripheral::PioTxFifo(pio, sm) => (*pio as u32, 0, *sm as u32),
        };
        pio * 8 + rx * 4 + sm
    }
}

/// Which of the block's interrupt lines a channel should raise.
pub enum Irq {
    Irq0,
    Irq1,
}

/// Notified when a channel finishes a transfer.
pub trait DmaChannelClient {
    fn transfer_done(&self);
}

/// One channel of a DMA block.
pub struct DmaChannel<'a, L: DmaLayout, const CHANNELS: usize> {
    dma: &'a Dma<'a, L, CHANNELS>,
    ch: usize,
}

impl<L: DmaLayout, const CHANNELS: usize> Clone for DmaChannel<'_, L, CHANNELS> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<L: DmaLayout, const CHANNELS: usize> Copy for DmaChannel<'_, L, CHANNELS> {}

impl<'a, L: DmaLayout, const CHANNELS: usize> DmaChannel<'a, L, CHANNELS> {
    pub const fn new(dma: &'a Dma<'a, L, CHANNELS>, ch: usize) -> Self {
        Self { dma, ch }
    }

    pub fn set_client(&self, client: &'a dyn DmaChannelClient) {
        self.dma.set_channel_client(self.ch, client);
    }
}

/// A DMA block.
///
/// `CHANNELS` is how many channels the block has: 12 on the RP2040, 16 on the
/// RP2350.
pub struct Dma<'a, L: DmaLayout, const CHANNELS: usize> {
    channels: StaticRef<[ChannelRegisters; CHANNELS]>,
    irq: StaticRef<DmaIrqRegisters>,
    clients: [OptionalCell<&'a dyn DmaChannelClient>; CHANNELS],
    _layout: core::marker::PhantomData<L>,
}

impl<'a, L: DmaLayout, const CHANNELS: usize> Dma<'a, L, CHANNELS> {
    /// Create a driver for a DMA block.
    ///
    /// `channels` is the base of the block, `irq` is where its interrupt
    /// registers start.
    pub const fn new(
        channels: StaticRef<[ChannelRegisters; CHANNELS]>,
        irq: StaticRef<DmaIrqRegisters>,
    ) -> Self {
        Self {
            channels,
            irq,
            clients: [const { OptionalCell::empty() }; CHANNELS],
            _layout: core::marker::PhantomData,
        }
    }

    /// One channel of this block. `ch` must be below `CHANNELS`.
    pub fn channel(&'a self, ch: usize) -> DmaChannel<'a, L, CHANNELS> {
        DmaChannel::new(self, ch)
    }

    pub fn handle_interrupt0(&self) {
        let value = self.irq.ints0.get();
        self.irq.ints0.set(value);
        self.handle_channels(value);
    }

    pub fn handle_interrupt1(&self) {
        let value = self.irq.ints1.get();
        self.irq.ints1.set(value);
        self.handle_channels(value);
    }

    #[inline]
    fn handle_channels(&self, mut ints: u32) {
        // Only the bits this block actually has.
        ints &= u32::MAX >> (32 - CHANNELS);
        while ints != 0 {
            let channel = ints.trailing_zeros();
            self.clients[channel as usize].map(|client| client.transfer_done());
            ints ^= 1 << channel;
        }
    }

    fn enable_interrupt(&self, channel: usize, irq: Irq) {
        let reg = match irq {
            Irq::Irq0 => &self.irq.inte0,
            Irq::Irq1 => &self.irq.inte1,
        };
        reg.set(reg.get() | (1 << channel));
    }

    fn disable_interrupt(&self, channel: usize, irq: Irq) {
        let reg = match irq {
            Irq::Irq0 => &self.irq.inte0,
            Irq::Irq1 => &self.irq.inte1,
        };
        reg.set(reg.get() & !(1 << channel));
    }

    fn channel_registers(&self, channel: usize) -> &ChannelRegisters {
        &self.channels[channel]
    }

    fn set_channel_client(&self, channel: usize, client: &'a dyn DmaChannelClient) {
        self.clients[channel].set(client)
    }
}

impl<L: DmaLayout, const CHANNELS: usize> DmaChannel<'_, L, CHANNELS> {
    pub fn trans_count(&self) -> u32 {
        self.dma.channel_registers(self.ch).trans_count.get()
    }

    /// Whether the channel is still transferring.
    ///
    /// `BUSY` is one of the bits that moved on the RP2350, so this reads it
    /// through the layout rather than through a declared field.
    pub fn busy(&self) -> bool {
        let regs = self.dma.channel_registers(self.ch);
        regs.ctrl_trig.get() & (1 << L::BUSY_SHIFT) != 0
    }

    pub fn set_read_addr(&self, addr: u32) {
        let regs = self.dma.channel_registers(self.ch);
        regs.read_addr.write(READ_ADDR::READ_ADDR.val(addr));
    }

    pub fn set_write_addr(&self, addr: u32) {
        let regs = self.dma.channel_registers(self.ch);
        regs.write_addr.write(WRITE_ADDR::WRITE_ADDR.val(addr));
    }

    pub fn set_len(&self, len: u32) {
        let regs = self.dma.channel_registers(self.ch);
        regs.trans_count.write(TRANS_COUNT::TRANS_COUNT.val(len));
    }

    pub fn enable_interrupt(&self, irq: Irq) {
        self.dma.enable_interrupt(self.ch, irq);
    }

    pub fn disable_interrupt(&self, irq: Irq) {
        self.dma.disable_interrupt(self.ch, irq);
    }

    /// Configure and start the channel.
    pub fn enable(
        &self,
        treq: DmaPeripheral,
        data_size: DataSize,
        transfer: Transfer,
        byte_swap: bool,
    ) {
        let regs = self.dma.channel_registers(self.ch);

        let (incr_rd, incr_wr) = match transfer {
            Transfer::MemoryToPeripheral => (CTRL_TRIG::INCR_READ::SET, incr_write::<L>(false)),
            Transfer::PeripheralToMemory => (CTRL_TRIG::INCR_READ::CLEAR, incr_write::<L>(true)),
        };

        let fv = treq_sel::<L>(treq.treq_number())
            + FieldValue::from(data_size)
            + bswap::<L>(byte_swap)
            + incr_rd
            + incr_wr
            + chain_to::<L>(self.ch as u32)
            + CTRL_TRIG::EN::SET;
        regs.ctrl_trig.write(fv);
    }
}
