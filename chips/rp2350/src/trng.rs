// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! True random number generator on the RP2350.
//!
//! **New capability rather than a port.** The RP2040 has no TRNG at all, so
//! there is no `chips/rp2040/src/trng.rs` to follow; the block is an Arm
//! TrustZone TRNG, and its behaviour comes from the datasheet's section 12.12
//! rather than from a sibling driver.
//!
//! # How the block runs
//!
//! Setting `RND_SRC_EN` starts a free-running ring oscillator that is
//! deliberately NOT derived from the system clocks, and samples it every
//! `SAMPLE_CNT1` system ticks. It stops on its own, either having collected
//! **192 bits at once** into the six `EHR_DATA` registers, or having failed
//! one of three entropy checks. `RNG_ISR` says which.
//!
//! Two consequences shape this driver:
//!
//! * **Results arrive six words at a time, not one.** `EHR_DATA[x]` reads as
//!   zero until a run succeeds, and reading `EHR_DATA[5]` is what clears all
//!   six. So [`TrngIter`] walks 0 to 5 in order and the last read is load
//!   bearing -- a client that stops early leaves the registers full, which is
//!   why [`Trng::drain`] exists.
//! * **A run can fail, and one failure is terminal.** `AUTOCORR_ERR` means the
//!   autocorrelation test failed four times in a row, and the datasheet is
//!   explicit that the block "ceases functioning until next reset" -- so that
//!   one is answered with `TRNG_SW_RESET` rather than by retrying. `CRNGT_ERR`
//!   and `VN_ERR` are ordinary bad runs and are simply restarted.
//!
//! # Configuration
//!
//! Arm defines a characterisation procedure for choosing the oscillator chain
//! length and sample count per SoC. Raspberry Pi did not run it -- the
//! datasheet says their own drivers "do not utilise the standard approach" --
//! and instead gives a usable pair directly: chain length 0 or 1 with a sample
//! count of 20 to 25 averages about 2 ms per 192 bits. [`CHAIN_LEN`] and
//! [`SAMPLE_TICKS`] take the slow end of that range, because the datasheet
//! pairs shorter sampling with more failed checks and this driver would rather
//! be slow than restart.
//!
//! Reset releases the block: `RESETS` bit 25 resets to 1, and the board's
//! `unreset_all_except(&[], true)` clears the whole register and waits on
//! `reset_done`, so nothing here has to touch resets.

use core::cell::Cell;
use kernel::ErrorCode;
use kernel::hil;
use kernel::hil::entropy::Continue;
use kernel::mmio;
use kernel::utilities::StaticRef;
use kernel::utilities::cells::OptionalCell;
use kernel::utilities::registers::interfaces::{Readable, Writeable};
use kernel::utilities::registers::{ReadOnly, ReadWrite, register_bitfields, register_structs};

/// Ring oscillator chain length, `TRNG_CONFIG.RND_SRC_SEL`, 0 to 3.
const CHAIN_LEN: u32 = 1;

/// System clock ticks between samples of the oscillator.
///
/// The datasheet offers 20-25 for "about 2 milliseconds" and 100 to
/// "significantly reduce, but not eliminate" failed entropy checks. **25 was
/// tried first on silicon and failed the autocorrelation test immediately**,
/// four runs in a row, which is the one failure the block does not recover
/// from on its own. 100 is the slower of the two figures the datasheet gives
/// and this driver would rather be slow than reset.
///
/// For scale: the hardware's own reset value is 0xffff, far above either.
const SAMPLE_TICKS: u32 = 100;

/// How many times to reset and retry before telling the client the request
/// failed.
///
/// Bounded rather than open ended: the datasheet says entropy check failures
/// are expected and cannot be eliminated, so a driver that gave up on the
/// first one would be unusable -- but a block that is genuinely broken must
/// still answer rather than spin.
const MAX_RESETS: u8 = 4;

/// Words in one collection. The hardware fills all six or none.
const EHR_WORDS: usize = 6;

register_structs! {
    TrngRegisters {
        (0x000 => _reserved_before_imr),
        (0x100 => rng_imr: ReadWrite<u32, INT::Register>),
        (0x104 => rng_isr: ReadOnly<u32, INT::Register>),
        (0x108 => rng_icr: ReadWrite<u32, INT::Register>),
        (0x10c => trng_config: ReadWrite<u32, TRNG_CONFIG::Register>),
        (0x110 => trng_valid: ReadOnly<u32>),
        (0x114 => ehr_data: [ReadOnly<u32>; EHR_WORDS]),
        (0x12c => rnd_source_enable: ReadWrite<u32, RND_SOURCE_ENABLE::Register>),
        (0x130 => sample_cnt1: ReadWrite<u32>),
        (0x134 => autocorr_statistic: ReadWrite<u32>),
        (0x138 => trng_debug_control: ReadWrite<u32>),
        (0x13c => _reserved_before_sw_reset),
        (0x140 => trng_sw_reset: ReadWrite<u32>),
        (0x144 => _reserved_before_debug_en),
        (0x1b4 => rng_debug_en_input: ReadWrite<u32>),
        (0x1b8 => trng_busy: ReadOnly<u32>),
        (0x1bc => rst_bits_counter: ReadWrite<u32>),
        (0x1c0 => rng_version: ReadOnly<u32>),
        (0x1c4 => _reserved_before_bist),
        (0x1e0 => rng_bist_cntr: [ReadOnly<u32>; 3]),
        (0x1ec => @END),
    }
}

register_bitfields![u32,
    /// One layout for all three of `RNG_IMR`, `RNG_ISR` and `RNG_ICR`, which
    /// share it. **`RNG_IMR` is a MASK: 1 disables**, and it resets to all
    /// ones, so enabling an interrupt means writing a zero.
    INT [
        EHR_VALID OFFSET(0) NUMBITS(1) [],
        AUTOCORR_ERR OFFSET(1) NUMBITS(1) [],
        CRNGT_ERR OFFSET(2) NUMBITS(1) [],
        VN_ERR OFFSET(3) NUMBITS(1) []
    ],
    TRNG_CONFIG [
        RND_SRC_SEL OFFSET(0) NUMBITS(2) []
    ],
    RND_SOURCE_ENABLE [
        RND_SRC_EN OFFSET(0) NUMBITS(1) []
    ]
];

mmio! {
    safety: "RP2350 datasheet address map, TRNG_BASE in the 12.12 register listing; read on silicon before it was trusted";

    TRNG_BASE: TrngRegisters = 0x400F0000,
}

pub struct Trng<'a> {
    registers: StaticRef<TrngRegisters>,
    client: OptionalCell<&'a dyn hil::entropy::Client32>,
    /// Which `EHR_DATA` word the iterator hands out next.
    word: Cell<usize>,
    /// Resets spent on the request in flight, against [`MAX_RESETS`].
    resets: Cell<u8>,
}

impl Trng<'_> {
    pub fn new() -> Self {
        Self {
            registers: TRNG_BASE,
            client: OptionalCell::empty(),
            word: Cell::new(EHR_WORDS),
            resets: Cell::new(0),
        }
    }

    /// Start one collection.
    fn start(&self) {
        self.registers
            .trng_config
            .write(TRNG_CONFIG::RND_SRC_SEL.val(CHAIN_LEN));
        self.registers.sample_cnt1.set(SAMPLE_TICKS);
        // Write one to clear, so a status left by an earlier run cannot be
        // mistaken for this one's. AUTOCORR_ERR is deliberately absent:
        // "Cannot be cleared by SW! Only RNG reset clears this bit", which is
        // why `handle_interrupt` answers it with `sw_reset` instead.
        self.registers
            .rng_icr
            .write(INT::EHR_VALID::SET + INT::CRNGT_ERR::SET + INT::VN_ERR::SET);
        self.registers
            .rnd_source_enable
            .write(RND_SOURCE_ENABLE::RND_SRC_EN::SET);
    }

    /// Stop the oscillator. The datasheet asks for this whenever the block is
    /// not in use, not merely at teardown.
    fn stop(&self) {
        self.registers
            .rnd_source_enable
            .write(RND_SOURCE_ENABLE::RND_SRC_EN::CLEAR);
    }

    /// Read `EHR_DATA[5]`, which clears all six.
    ///
    /// Needed because a client may take fewer than six words and answer
    /// `Done`. The registers would then still hold that run's bits, and the
    /// next run's `EHR_VALID` would hand the same values out again.
    fn drain(&self) {
        let _ = self.registers.ehr_data[EHR_WORDS - 1].get();
        self.word.set(EHR_WORDS);
    }

    /// Unmask the four sources and arm the NVIC line.
    fn enable_interrupts(&self) {
        // `RNG_IMR` masks with a one, so zero here is "let it through".
        self.registers.rng_imr.write(
            INT::EHR_VALID::CLEAR
                + INT::AUTOCORR_ERR::CLEAR
                + INT::CRNGT_ERR::CLEAR
                + INT::VN_ERR::CLEAR,
        );
        // The block's own mask is not sufficient: `Chip::init` disables every
        // NVIC line, and a pending interrupt whose line is disabled is not a
        // `wfi` wake-up event. See `rp2xxx::nvic` for the whole class.
        cortexm33::nvic::Nvic::new(crate::interrupts::TRNG_IRQ).enable();
    }

    fn disable_interrupts(&self) {
        self.registers.rng_imr.write(
            INT::EHR_VALID::SET + INT::AUTOCORR_ERR::SET + INT::CRNGT_ERR::SET + INT::VN_ERR::SET,
        );
    }

    /// Recover from `AUTOCORR_ERR`, which is terminal until a reset.
    fn sw_reset(&self) {
        self.stop();
        self.registers.trng_sw_reset.set(1);
        // The bootrom reads this register twice after the write as a fixed
        // delay (`varm_boot_path.c`, quoted in 12.12.4), so the same is done
        // here rather than inventing a cycle count.
        let _ = self.registers.trng_sw_reset.get();
        let _ = self.registers.trng_sw_reset.get();
        self.word.set(EHR_WORDS);
    }

    pub fn handle_interrupt(&self) {
        let status = self.registers.rng_isr.extract();

        if status.is_set(INT::AUTOCORR_ERR) {
            // Terminal for the block -- it "ceases functioning until next
            // reset" -- so this cannot be retried in place the way the other
            // two checks can. Reset and start again, up to a bound.
            //
            // Measured on a Pico 2 W: this fires, and at SAMPLE_TICKS of 25 it
            // fired on the very first collection. Treating it as a hard
            // failure made the driver useless, which is why it is a retry.
            self.sw_reset();
            if self.resets.get() < MAX_RESETS {
                self.resets.set(self.resets.get() + 1);
                // The reset restored every register to its default, including
                // an all-masked `RNG_IMR`, so the unmasking has to be redone.
                self.enable_interrupts();
                self.start();
            } else {
                self.resets.set(0);
                self.disable_interrupts();
                self.client.map(|client| {
                    let mut empty = core::iter::empty();
                    client.entropy_available(&mut empty, Err(ErrorCode::FAIL))
                });
            }
            return;
        }

        if status.is_set(INT::CRNGT_ERR) || status.is_set(INT::VN_ERR) {
            // An ordinary bad run. Clear and collect again; the client is not
            // told, because it asked for entropy and none has been produced
            // yet.
            self.registers
                .rng_icr
                .write(INT::CRNGT_ERR::SET + INT::VN_ERR::SET);
            self.stop();
            self.start();
            return;
        }

        if !status.is_set(INT::EHR_VALID) {
            return;
        }

        // A good collection: the request is making progress, so the budget
        // spent on earlier resets no longer counts against it.
        self.resets.set(0);
        self.word.set(0);
        let cont = self
            .client
            .map(|client| client.entropy_available(&mut TrngIter(self), Ok(())));

        // Whatever the client took, the run's bits must not survive into the
        // next one.
        self.drain();
        self.registers.rng_icr.write(INT::EHR_VALID::SET);

        match cont {
            Some(Continue::More) => self.start(),
            _ => {
                self.stop();
                self.disable_interrupts();
            }
        }
    }
}

impl Default for Trng<'_> {
    fn default() -> Self {
        Self::new()
    }
}

/// Hands out one collection, oldest word first.
///
/// Stops at six rather than re-reading: `EHR_DATA` holds exactly 192 bits and
/// a seventh read would return the same word again, which is not entropy.
struct TrngIter<'a, 'b: 'a>(&'a Trng<'b>);

impl Iterator for TrngIter<'_, '_> {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        let w = self.0.word.get();
        if w >= EHR_WORDS {
            return None;
        }
        self.0.word.set(w + 1);
        Some(self.0.registers.ehr_data[w].get())
    }
}

impl<'a> hil::entropy::Entropy32<'a> for Trng<'a> {
    fn get(&self) -> Result<(), ErrorCode> {
        self.resets.set(0);
        self.enable_interrupts();
        self.start();
        Ok(())
    }

    fn cancel(&self) -> Result<(), ErrorCode> {
        self.stop();
        self.disable_interrupts();
        // A collection may have completed between the last interrupt and this
        // call, so clear it rather than leaving it for the next `get`.
        self.drain();
        Ok(())
    }

    fn set_client(&'a self, client: &'a dyn hil::entropy::Client32) {
        self.client.set(client);
    }
}
