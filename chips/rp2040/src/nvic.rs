// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! This chip's interrupt lines, in the form the shared drivers take.
//!
//! `chips/rp2xxx` depends on `kernel` alone and cannot reach an arch crate,
//! so a driver there takes an [`InterruptLine`] and this supplies one. The
//! interrupt numbers live in `interrupts.rs`; see `rp2xxx::nvic` for why the
//! block's own mask is not sufficient on its own.

use rp2xxx::nvic::InterruptLine;

/// One NVIC line on this chip.
///
/// A newtype rather than a re-export: the orphan rule puts the impl below in
/// whichever crate owns one of the two, and that is this one.
pub struct Nvic(cortexm0p::nvic::Nvic);

impl Nvic {
    /// The line for interrupt `irq`, which should come from `interrupts.rs`.
    pub const fn new(irq: u32) -> Self {
        Self(cortexm0p::nvic::Nvic::new(irq))
    }
}

impl InterruptLine for Nvic {
    fn enable(&self) {
        self.0.enable()
    }
}
