// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! The SAR ADC shared by the RP2040 and the RP2350.
//!
//! A 12-bit successive-approximation converter behind an analogue mux, with a
//! four-entry result FIFO and an on-die temperature sensor on the last channel.
//! The register offsets are identical on both chips; what differs is the base
//! address, how many inputs the package bonds out, and therefore which channel
//! the temperature sensor occupies. Each chip crate supplies those.
//!
//! Ref: 4.9 "ADC and Temperature Sensor" in the RP2040 datasheet, 12.4 in the
//! RP2350's.

use core::cell::Cell;

use kernel::ErrorCode;
use kernel::hil;
use kernel::utilities::registers::interfaces::{ReadWriteable, Readable};
use kernel::utilities::registers::{ReadWrite, register_bitfields, register_structs};
use kernel::utilities::{StaticRef, cells::OptionalCell};

register_structs! {
    /// Control and data interface to SAR ADC
    pub AdcRegisters {
        /// ADC Control and Status
        (0x000 => cs: ReadWrite<u32, CS::Register>),
        /// Result of most recent ADC conversion
        (0x004 => result: ReadWrite<u32, RESULT::Register>),
        /// FIFO control and status
        (0x008 => fcs: ReadWrite<u32, FCS::Register>),
        /// Conversion result FIFO
        (0x00C => fifo: ReadWrite<u32, FIFO::Register>),
        /// Clock divider. If non-zero, CS_START_MANY will start conversions
        /// at regular intervals rather than back-to-back.
        /// The divider is reset when either of these fields are written.
        /// Total period is 1 + INT + FRAC / 256
        (0x010 => div: ReadWrite<u32, DIV::Register>),
        /// Raw Interrupts
        (0x014 => intr: ReadWrite<u32, INTR::Register>),
        /// Interrupt Enable
        (0x018 => inte: ReadWrite<u32, INTE::Register>),
        /// Interrupt Force
        (0x01C => intf: ReadWrite<u32, INTE::Register>),
        /// Interrupt status after masking & forcing
        (0x020 => ints: ReadWrite<u32, INTE::Register>),
        (0x024 => @END),
    }
}

register_bitfields![u32,
CS [
    /// Round-robin sampling. 1 bit per channel. Set all bits to 0 to disable.
    /// Otherwise, the ADC will cycle through each enabled channel in a
    /// round-robin fashion.
    ///
    /// Nine bits wide on the RP2350 and five on the RP2040, matching the
    /// number of channels each chip can have. Declared at the wider width;
    /// the [`Channel`] type a chip supplies is what stops a value the chip
    /// cannot select from being written.
    RROBIN OFFSET(16) NUMBITS(9) [],
    /// Select analog mux input. Updated automatically in round-robin mode.
    ///
    /// Four bits on the RP2350, three on the RP2040. Declared at the wider
    /// width, for the same reason as `RROBIN`.
    AINSEL OFFSET(12) NUMBITS(4) [],
    /// Some past ADC conversion encountered an error. Write 1 to clear.
    ERR_STICKY OFFSET(10) NUMBITS(1) [],
    /// The most recent ADC conversion encountered an error; result is undefined or noisy.
    ERR OFFSET(9) NUMBITS(1) [],
    /// 1 if the ADC is ready to start a new conversion. Implies any previous conversion
    /// has completed.
    /// 0 whilst conversion in progress.
    READY OFFSET(8) NUMBITS(1) [],
    /// Continuously perform conversions whilst this bit is 1. A new conversion will start
    /// immediately after the previous finishes.
    START_MANY OFFSET(3) NUMBITS(1) [],
    /// Start a single conversion. Self-clearing. Ignored if start_many is asserted.
    START_ONCE OFFSET(2) NUMBITS(1) [],
    /// Power on temperature sensor. 1 - enabled. 0 - disabled.
    TS_EN OFFSET(1) NUMBITS(1) [],
    /// Power on ADC and enable its clock.
    /// 1 - enabled. 0 - disabled.
    EN OFFSET(0) NUMBITS(1) []
],
RESULT [
    RESULT OFFSET(0) NUMBITS(12) []
],
FCS [
    /// DREQ/IRQ asserted when level >= threshold
    THRESH OFFSET(24) NUMBITS(4) [],
    /// The number of conversion results currently waiting in the FIFO
    LEVEL OFFSET(16) NUMBITS(4) [],
    /// 1 if the FIFO has been overflowed. Write 1 to clear.
    OVER OFFSET(11) NUMBITS(1) [],
    /// 1 if the FIFO has been underflowed. Write 1 to clear.
    UNDER OFFSET(10) NUMBITS(1) [],
    /// 1 if the FIFO is full
    FULL OFFSET(9) NUMBITS(1) [],
    /// 1 if the FIFO is empty
    EMPTY OFFSET(8) NUMBITS(1) [],
    /// If 1: assert DMA requests when FIFO contains data
    DREQ_EN OFFSET(3) NUMBITS(1) [],
    /// If 1: conversion error bit appears in the FIFO
    ERR OFFSET(2) NUMBITS(1) [],
    /// If 1: FIFO results are right-shifted to be one byte in size.
    SHIFT OFFSET(1) NUMBITS(1) [],
    /// If 1: write result to the FIFO after each conversion.
    EN OFFSET(0) NUMBITS(1) []
],
FIFO [
    /// 1 if this particular sample experienced a conversion error.
    ERR OFFSET(15) NUMBITS(1) [],
    VAL OFFSET(0) NUMBITS(12) []
],
DIV [
    /// Integer part of clock divisor.
    INT OFFSET(8) NUMBITS(16) [],
    /// Fractional part of clock divisor.
    FRAC OFFSET(0) NUMBITS(8) []
],
INTR [
    /// Triggered when the sample FIFO reaches a certain level.
    FIFO OFFSET(0) NUMBITS(1) []
],
INTE [
    /// Triggered when the sample FIFO reaches a certain level.
    FIFO OFFSET(0) NUMBITS(1) []
]
];

/// One input of the analogue mux.
///
/// Each chip supplies its own set, because how many inputs exist and which one
/// the temperature sensor occupies are properties of the package rather than
/// of the converter.
pub trait Channel: Copy + PartialEq {
    /// The value written to `CS.AINSEL` to select this input.
    fn ainsel(&self) -> u32;

    /// Whether sampling this input requires the temperature sensor powered.
    ///
    /// A chip-level question rather than a driver-level one: the sensor is the
    /// last channel, which is channel 4 on a package that bonds four inputs
    /// and channel 8 on one that bonds eight.
    fn is_temperature_sensor(&self) -> bool;
}

#[derive(Copy, Clone, PartialEq)]
enum AdcStatus {
    Idle,
    OneSample,
}

/// Depth of the ADC's hardware sample FIFO, used to bound the drain in
/// `stop_sampling` so a FIFO that never reports empty cannot hang the kernel.
const FIFO_DEPTH: usize = 4;

/// Bound on the wait for `CS::READY` in `stop_sampling`.
///
/// Past this the driver is declared idle regardless, because a converter that
/// never reports ready must not hang the kernel. A conversion is 96 ADC
/// clocks, so this is roughly two orders of magnitude more than one needs.
const READY_SPIN_LIMIT: usize = 10_000;

pub struct Adc<'a, C: Channel> {
    registers: StaticRef<AdcRegisters>,
    status: Cell<AdcStatus>,
    client: OptionalCell<&'a dyn hil::adc::Client>,
    /// The driver is generic over the channel type but stores no channel: the
    /// selected input lives in `CS.AINSEL` and nothing here reads it back.
    _channel: core::marker::PhantomData<C>,
}

impl<C: Channel> Adc<'_, C> {
    pub const fn new(registers: StaticRef<AdcRegisters>) -> Self {
        Self {
            registers,
            status: Cell::new(AdcStatus::Idle),
            client: OptionalCell::empty(),
            _channel: core::marker::PhantomData,
        }
    }

    pub fn init(&self) {
        self.registers.cs.modify(CS::EN::SET);
        while !self.registers.cs.is_set(CS::READY) {}
    }

    pub fn disable(&self) {
        self.registers.cs.modify(CS::EN::CLEAR);
    }

    fn enable_interrupt(&self) {
        self.registers.inte.modify(INTE::FIFO::SET);
    }

    fn disable_interrupt(&self) {
        self.registers.inte.modify(INTE::FIFO::CLEAR);
    }

    fn enable_temperature(&self) {
        self.registers.cs.modify(CS::TS_EN::SET);
    }

    pub fn handle_interrupt(&self) {
        // Mask first, and unconditionally. The FIFO interrupt is level
        // triggered, so any path out of this handler that leaves it unmasked
        // with the condition still true re-enters immediately and spins the
        // kernel. There were two such paths, and both of them left the mask
        // set because `disable_interrupt` used to sit *inside* the
        // `client.map` below:
        //
        //   - no client set, so the closure never ran; and
        //   - an interrupt arriving with `CS::READY` clear, which skipped the
        //     whole body.
        //
        // Nothing is lost by masking early: `sample` re-enables it for the
        // next conversion, which is the only time it is wanted.
        //
        // Neither path is reachable on any board in this tree today -- every
        // board that builds the ADC also gives it a client through the mux,
        // and this driver never sets `START_MANY`, so a sample cannot land
        // while a conversion is still running. This is a guard against a
        // configuration that does not exist yet, not a fix for an observed
        // hang.
        self.disable_interrupt();

        if self.registers.cs.is_set(CS::READY) {
            if self.status.get() == AdcStatus::OneSample {
                self.status.set(AdcStatus::Idle);
            }

            // Popped whether or not anyone is listening. Leaving the entry in
            // the FIFO would make the next `sample` deliver this conversion's
            // result instead of its own, because `THRESH` is 1 and the stale
            // entry alone satisfies it.
            let sample = (self.registers.fifo.read(FIFO::VAL) << 4) as u16;
            self.client.map(|client| client.sample_ready(sample));
        }
    }
}

impl<'a, C: Channel> hil::adc::Adc<'a> for Adc<'a, C> {
    type Channel = C;

    fn sample(&self, channel: &Self::Channel) -> Result<(), ErrorCode> {
        if self.status.get() == AdcStatus::Idle {
            if channel.is_temperature_sensor() {
                self.enable_temperature();
            }
            self.status.set(AdcStatus::OneSample);
            self.registers.cs.modify(CS::AINSEL.val(channel.ainsel()));
            self.registers
                .fcs
                .modify(FCS::THRESH.val(1_u32) + FCS::EN::SET);
            self.enable_interrupt();
            self.registers.cs.modify(CS::START_ONCE::SET);
            Ok(())
        } else {
            Err(ErrorCode::BUSY)
        }
    }

    fn sample_continuous(
        &self,
        _channel: &Self::Channel,
        _frequency: u32,
    ) -> Result<(), ErrorCode> {
        Err(ErrorCode::NOSUPPORT)
    }

    fn stop_sampling(&self) -> Result<(), ErrorCode> {
        // This answered `NOSUPPORT` unconditionally, which left the driver
        // with no way back out of `OneSample`. A conversion whose interrupt
        // never arrives wedged it permanently: every later `sample` answers
        // `BUSY`, and the syscall driver's `active` flag stays set with it,
        // so the ADC was gone for every process until the board was reset.
        //
        // What this method can promise is exactly what the HIL states -- "no
        // further callbacks will occur" -- and that does not require aborting
        // a conversion already in flight. A `START_ONCE` conversion finishes
        // in about 2 us and cannot be cancelled; masking the interrupt and
        // draining the FIFO discards whatever it produces.
        if self.status.get() == AdcStatus::Idle {
            // Already stopped, so the guarantee already holds. Idempotent
            // rather than an error: a caller stopping an ADC it is not sure
            // about is the case this exists for.
            return Ok(());
        }

        // Stop any free-running conversion, then stop listening.
        self.registers.cs.modify(CS::START_MANY::CLEAR);
        self.disable_interrupt();

        // Wait for the conversion already in flight to finish before calling
        // the driver idle. Without this the ADC is still busy when
        // `stop_sampling` returns, and the next `START_ONCE` lands on a busy
        // converter and is ignored -- so the following `sample` is accepted,
        // starts nothing, and its callback never comes. Found on silicon by
        // the conformance test, which got five clauses in and then waited
        // forever for a sample that was never taken.
        //
        // A conversion is 96 ADC clocks, about 2 us at the 48 MHz this chip
        // runs the ADC at, so this spin is short. It is bounded anyway: a
        // converter that never reports ready must not hang the kernel, and
        // leaving the status Idle is the right answer even then, because the
        // point of this method is to make the driver usable again.
        for _ in 0..READY_SPIN_LIMIT {
            if self.registers.cs.is_set(CS::READY) {
                break;
            }
        }

        // Drain whatever the last conversion left. Bounded rather than
        // `while !EMPTY`: this runs in the kernel, and a FIFO that never
        // reports empty would hang the board instead of reporting a fault.
        // The hardware FIFO is four entries deep.
        for _ in 0..FIFO_DEPTH {
            if self.registers.fcs.is_set(FCS::EMPTY) {
                break;
            }
            let _ = self.registers.fifo.read(FIFO::VAL);
        }
        self.registers.fcs.modify(FCS::EN::CLEAR);

        self.status.set(AdcStatus::Idle);
        Ok(())
    }

    fn get_resolution_bits(&self) -> usize {
        12
    }

    fn get_voltage_reference_mv(&self) -> Option<usize> {
        Some(3300)
    }

    fn set_client(&self, client: &'a dyn hil::adc::Client) {
        self.client.set(client);
    }
}
