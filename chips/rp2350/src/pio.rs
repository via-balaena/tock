// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Programmable Input Output (PIO) hardware.
//!
//! The driver itself is shared with the RP2040 and lives in `rp2xxx::pio`.
//! This module supplies what is specific to this chip: where the three PIO
//! blocks are, where each one's interrupt registers start, and which GPIO
//! alternate function selects them.
//!
//! The interrupt registers begin further into the block here than they do on
//! the RP2040. This chip inserts sixteen `RXFn_PUTGETn` registers at +0x128
//! and a `GPIOBASE` at +0x168 first, so `INTR` lands at +0x16c rather than
//! +0x128.
//!
//! `GPIOBASE` selects which thirty-two GPIOs a block can reach. It resets to
//! zero, meaning GPIO 0 to 31, which covers every pin this package has, and
//! this driver never writes it.
//!
//! Refer to the RP2350 Datasheet, Section 11.
//! RP2350 Datasheet [1].
//!
//! [1]: https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf

use crate::gpio::{GpioFunction, RPGpioPin};
use kernel::utilities::StaticRef;
use rp2xxx::pio::{PioIrqRegisters, PioRegisters};

pub use rp2xxx::pio::{
    InterruptSources, LoadedProgram, Pio, PioFifoJoin, PioMovStatusType, PioRxClient, PioSmClient,
    PioTxClient, ProgramError, RelocatedProgram, SMNumber, StateMachine, StateMachineConfiguration,
};

/// There are 3 PIO blocks on the RP2350.
#[derive(Clone, Copy, PartialEq)]
pub enum PIONumber {
    PIO0 = 0,
    PIO1 = 1,
    PIO2 = 2,
}

const PIO_0_BASE_ADDRESS: usize = 0x50200000;
const PIO_1_BASE_ADDRESS: usize = 0x50300000;
const PIO_2_BASE_ADDRESS: usize = 0x50400000;

/// Where a block's interrupt registers start, relative to the block.
///
/// The RP2040 puts them at +0x128, directly after the state machine
/// registers. This chip has sixteen `RXFn_PUTGETn` registers and a
/// `GPIOBASE` in between.
const IRQ_OFFSET: usize = 0x16c;

const fn regs(base: usize) -> StaticRef<PioRegisters> {
    unsafe { StaticRef::new(base as *const PioRegisters) }
}

const fn irq_regs(base: usize) -> StaticRef<PioIrqRegisters> {
    unsafe { StaticRef::new((base + IRQ_OFFSET) as *const PioIrqRegisters) }
}

fn pio(index: PIONumber, base: usize) -> Pio {
    Pio::new(
        index as usize,
        regs(base),
        irq_regs(base),
        regs(base + 0x1000),
        regs(base + 0x2000),
        regs(base + 0x3000),
    )
}

/// Create a driver for PIO0.
pub fn new_pio0() -> Pio {
    pio(PIONumber::PIO0, PIO_0_BASE_ADDRESS)
}

/// Create a driver for PIO1.
pub fn new_pio1() -> Pio {
    pio(PIONumber::PIO1, PIO_1_BASE_ADDRESS)
}

/// Create a driver for PIO2.
pub fn new_pio2() -> Pio {
    pio(PIONumber::PIO2, PIO_2_BASE_ADDRESS)
}

/// Point a pin at the PIO block this driver drives.
pub fn gpio_init(pio: &Pio, pin: &RPGpioPin) {
    pin.set_function(match pio.index() {
        x if x == PIONumber::PIO2 as usize => GpioFunction::PIO2,
        x if x == PIONumber::PIO1 as usize => GpioFunction::PIO1,
        _ => GpioFunction::PIO0,
    });
}

impl rp2xxx::pads::PioPad for RPGpioPin<'_> {
    fn from_pin_number(pin: u32) -> Self {
        use enum_primitive::cast::FromPrimitive;
        RPGpioPin::new(crate::gpio::RPGpio::from_u32(pin).unwrap())
    }

    fn select_pio(&self, pio_index: usize) {
        self.set_function(match pio_index {
            x if x == PIONumber::PIO2 as usize => GpioFunction::PIO2,
            x if x == PIONumber::PIO1 as usize => GpioFunction::PIO1,
            _ => GpioFunction::PIO0,
        });
    }

    fn set_schmitt(&self, enable: bool) {
        RPGpioPin::set_schmitt(self, enable)
    }

    fn set_slew_rate(&self, rate: rp2xxx::pads::SlewRate) {
        RPGpioPin::set_slew_rate(
            self,
            match rate {
                rp2xxx::pads::SlewRate::Slow => crate::gpio::SlewRate::Slow,
                rp2xxx::pads::SlewRate::Fast => crate::gpio::SlewRate::Fast,
            },
        )
    }

    fn set_drive_strength(&self, strength: rp2xxx::pads::DriveStrength) {
        RPGpioPin::set_drive_strength(
            self,
            match strength {
                rp2xxx::pads::DriveStrength::Drive2mA => crate::gpio::DriveStrength::Drive2mA,
                rp2xxx::pads::DriveStrength::Drive4mA => crate::gpio::DriveStrength::Drive4ma,
                rp2xxx::pads::DriveStrength::Drive8mA => crate::gpio::DriveStrength::Drive8ma,
                rp2xxx::pads::DriveStrength::Drive12mA => crate::gpio::DriveStrength::Drive12ma,
            },
        )
    }

    fn set_pull_none(&self) {
        use kernel::hil::gpio::Configure;
        self.set_floating_state(kernel::hil::gpio::FloatingState::PullNone);
    }

    fn activate_pads(&self) {
        RPGpioPin::activate_pads(self)
    }
}
