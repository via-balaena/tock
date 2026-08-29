// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright OxidOS Automotive 2024.
//
// Author: Radu Matei <radu.matei.05.21@gmail.com>
//         Alberto Udrea <albertoudrea4@gmail.com>

//! Programmable Input Output (PIO) hardware.
//!
//! The driver itself is shared with the RP2350 and lives in `rp2xxx::pio`.
//! This module supplies the parts that are specific to this chip: where the
//! two PIO blocks are, how many there are, and which GPIO alternate function
//! selects them.
//!
//! Refer to the RP2040 Datasheet, Section 3 for more information.
//! RP2040 Datasheet [1].
//!
//! [1]: https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf

use crate::gpio::{GpioFunction, RPGpioPin};
use kernel::utilities::StaticRef;
use rp2xxx::pio::{PioIrqRegisters, PioRegisters};

pub use rp2xxx::pio::{
    InterruptSources, LoadedProgram, Pio, PioFifoJoin, PioMovStatusType, PioRxClient, PioSmClient,
    PioTxClient, ProgramError, RelocatedProgram, SMNumber, StateMachine, StateMachineConfiguration,
};

/// There can be 2 PIOs per RP2040.
#[derive(Clone, Copy, PartialEq)]
pub enum PIONumber {
    PIO0 = 0,
    PIO1 = 1,
}

const PIO_0_BASE_ADDRESS: usize = 0x50200000;
const PIO_1_BASE_ADDRESS: usize = 0x50300000;

/// Where a block's interrupt registers start, relative to the block.
///
/// They follow the state machine registers directly on this chip. The RP2350
/// puts sixteen `RXFn_PUTGETn` registers and a `GPIOBASE` in between, so its
/// offset is larger.
const IRQ_OFFSET: usize = 0x128;

const fn regs(base: usize) -> StaticRef<PioRegisters> {
    unsafe { StaticRef::new(base as *const PioRegisters) }
}

const fn irq_regs(base: usize) -> StaticRef<PioIrqRegisters> {
    unsafe { StaticRef::new((base + IRQ_OFFSET) as *const PioIrqRegisters) }
}

/// Create a driver for PIO0.
pub fn new_pio0() -> Pio {
    Pio::new(
        PIONumber::PIO0 as usize,
        regs(PIO_0_BASE_ADDRESS),
        irq_regs(PIO_0_BASE_ADDRESS),
        regs(PIO_0_BASE_ADDRESS + 0x1000),
        regs(PIO_0_BASE_ADDRESS + 0x2000),
        regs(PIO_0_BASE_ADDRESS + 0x3000),
    )
}

/// Create a driver for PIO1.
pub fn new_pio1() -> Pio {
    Pio::new(
        PIONumber::PIO1 as usize,
        regs(PIO_1_BASE_ADDRESS),
        irq_regs(PIO_1_BASE_ADDRESS),
        regs(PIO_1_BASE_ADDRESS + 0x1000),
        regs(PIO_1_BASE_ADDRESS + 0x2000),
        regs(PIO_1_BASE_ADDRESS + 0x3000),
    )
}

/// Point a pin at the PIO block this driver drives.
///
/// Which alternate function selects a PIO block is a fact about the RP2040
/// rather than about the state machines, so it stays here.
pub fn gpio_init(pio: &Pio, pin: &RPGpioPin) {
    pin.set_function(if pio.index() == PIONumber::PIO1 as usize {
        GpioFunction::PIO1
    } else {
        GpioFunction::PIO0
    });
}

impl rp2xxx::pads::PioPad for RPGpioPin<'_> {
    fn from_pin_number(pin: u32) -> Self {
        use enum_primitive::cast::FromPrimitive;
        RPGpioPin::new(crate::gpio::RPGpio::from_u32(pin).unwrap())
    }

    fn select_pio(&self, pio_index: usize) {
        self.set_function(if pio_index == PIONumber::PIO1 as usize {
            GpioFunction::PIO1
        } else {
            GpioFunction::PIO0
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
