// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Show whether a GPIO edge can wake the kernel out of `wfi`.
//!
//! `hil::gpio::Interrupt::enable_interrupts` on rp2350 sets the pin's own
//! `INTE` bit and stops there; nothing enables `IO_IRQ_BANK0` in the NVIC.
//! The line still reaches the kernel eventually, because
//! `Rp2350::service_pending_interrupts` polls `ISPR` -- which reads pending
//! state whether or not the line is enabled -- and calls `enable()` on every
//! line it services. So the first edge heals the line and every later edge is
//! delivered normally.
//!
//! What that leaves is a hole for exactly one edge: the FIRST one, arriving
//! while the kernel is in `wfi` with nothing else able to wake it. A pending
//! interrupt whose NVIC line is disabled is not a `wfi` wake-up event, so the
//! core stays asleep with `ISPR` bit 21 set and the callback undelivered.
//!
//! This probe makes that state reachable and observable:
//!
//! * GP20 is an output, left LOW and never driven by the kernel -- so no edge
//!   happens while the board is still booting, which would heal the line
//!   before the kernel ever sleeps.
//! * GP21 is a rising-edge interrupt input, wired to GP20 by the bench
//!   jumper. Its callback prints one line.
//!
//! The edge is then driven **from the debug port**, not from the kernel:
//!
//! ```text
//! openocd -f interface/cmsis-dap.cfg -f target/rp2350.cfg \
//!   -c "adapter speed 5000" -c init -c "mww 0xd0000018 0x00100000" -c shutdown
//! ```
//!
//! `0xd0000018` is `SIO_GPIO_OUT_SET`, bit 20 is GP20. The AHB-AP writes it
//! without involving the core, so the edge arrives while the kernel really is
//! asleep -- which a kernel-driven `set()` can never test, since the kernel
//! running is the thing being ruled out.
//!
//! Read `ISPR` at `0xe000e200` and `ISER` at `0xe000e100` to see which of the
//! two states the line is in. Bit 21 of word 0 is `IO_IRQ_BANK0`.

use kernel::debug;
use kernel::hil::gpio;
use kernel::hil::gpio::Interrupt;

pub struct NvicWakeProbe<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> {
    out: &'a O,
    input: &'a I,
}

impl<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> NvicWakeProbe<'a, O, I> {
    /// `out` and `input` must be physically wired together.
    pub fn new(out: &'a O, input: &'a I) -> Self {
        Self { out, input }
    }

    /// Arm the input and leave the output low.
    ///
    /// Deliberately does NOT drive the output. Driving it here would raise
    /// the edge while the kernel is still building the board -- awake, so the
    /// poll path would service it and enable the line, and the probe would
    /// then report a healthy NVIC no matter what the driver does.
    pub fn arm(&self) {
        self.out.make_output();
        self.out.clear();
        self.input.make_input();
        Interrupt::enable_interrupts(self.input, gpio::InterruptEdge::RisingEdge);
        debug!("nvic-wake-probe: armed on GP21, GP20 low; drive it from the debug port");
    }
}

impl<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> gpio::Client for NvicWakeProbe<'a, O, I> {
    fn fired(&self) {
        debug!("nvic-wake-probe: FIRED");
    }
}
