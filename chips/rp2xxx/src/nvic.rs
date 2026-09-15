// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! What a shared driver needs of a chip's interrupt controller.
//!
//! Like `dma` and `pads`, this module holds no registers -- only the interface
//! a driver here needs of whichever chip it is built into.
//!
//! **Why a driver in this crate cannot name its own line.** Setting a
//! peripheral's own interrupt mask is not sufficient on either chip: the
//! kernel sleeps in `wfi` whenever no process is runnable, `Chip::init`
//! disables every line in the NVIC, and on a Cortex-M a pending interrupt
//! whose line is disabled is not a `wfi` wake-up event. The line has to be
//! armed as well. But this crate depends on `kernel` alone -- deliberately,
//! because the RP2040 and the RP2350 number their interrupts differently, so
//! there is no number a driver here could name that is right for both. The
//! chip crate knows the number, builds the line, and hands it in.
//!
//! The hazard is bounded, which is why the tree ran for a long time without
//! this. `next_pending_with_mask` reads `ISPR` and never `ISER`, so a
//! pending-but-disabled source is visible to the kernel's poll path, gets
//! serviced, and is enabled on the way past. A line therefore heals itself on
//! the first interrupt the kernel happens to be awake for, and only the
//! FIRST interrupt from a source -- arriving while the kernel sleeps with
//! nothing else able to wake it -- can be delayed indefinitely.
//!
//! Measured on a Pico 2 W, 2026-09-15: `SPI0_IRQ` read as enabled in `ISER`
//! on a running board with nothing in the tree enabling it, which is that
//! self-heal caught in the act. Relying on it is relying on some other
//! interrupt happening to arrive first.

/// One peripheral's line into the chip's interrupt controller.
pub trait InterruptLine {
    /// Arm the line, so an interrupt from this peripheral can wake the kernel
    /// out of `wfi`.
    ///
    /// Idempotent: enabling an already-enabled line is a single write of a
    /// bit that is already set.
    fn enable(&self);
}
