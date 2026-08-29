// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright OxidOS Automotive 2025.

//! Component for the PIO gSPI bus the CYW43439 radio speaks.
//!
//! Usage
//! -----
//! ```rust
//! let pio_gspi = PioGspiComponent::new(
//!     &peripherals.pio0,
//!     pio::SMNumber::SM0,
//!     peripherals.dma.channel(dma::Channel::Channel0 as usize),
//!     dma::Irq::Irq0,
//!     RPGpio::GPIO29 as u32,
//!     RPGpio::GPIO24 as u32,
//!     cs,
//! )
//! .finalize(components::pio_gspi_component_static!(
//!     rp2040::pio_gspi::PioGSpi<'static>
//! ));
//! ```

use core::mem::MaybeUninit;
use kernel::component::Component;
use kernel::hil::gpio;
use rp2xxx::dma::{DmaChannel, DmaLayout, Irq};
use rp2xxx::pads::PioPad;
use rp2xxx::pio::{Pio, SMNumber};
use rp2xxx::pio_gspi::PioGSpi;

#[macro_export]
macro_rules! pio_gspi_component_static {
    // Takes the chip crate's own alias, e.g. `rp2040::pio_gspi::PioGSpi`, so
    // a board does not need to depend on `rp2xxx` to name the type.
    ($T:ty $(,)?) => {{ kernel::static_buf!($T) }};
}

pub type PioGspiComponentType<L, const N: usize, P> = PioGSpi<'static, L, N, P>;

pub struct PioGspiComponent<
    L: DmaLayout + 'static,
    const CHANNELS: usize,
    P: gpio::Output + PioPad + 'static,
> {
    pio: &'static Pio,
    pio_sm: SMNumber,
    dma_channel: DmaChannel<'static, L, CHANNELS>,
    dma_irq: Irq,
    clk: u32,
    dio: u32,
    cs: &'static P,
}

impl<L: DmaLayout + 'static, const CHANNELS: usize, P: gpio::Output + PioPad + 'static>
    PioGspiComponent<L, CHANNELS, P>
{
    pub fn new(
        pio: &'static Pio,
        pio_sm: SMNumber,
        dma_channel: DmaChannel<'static, L, CHANNELS>,
        dma_irq: Irq,
        clk: u32,
        dio: u32,
        cs: &'static P,
    ) -> Self {
        Self {
            pio,
            pio_sm,
            dma_channel,
            dma_irq,
            clk,
            dio,
            cs,
        }
    }
}

impl<L: DmaLayout + 'static, const CHANNELS: usize, P: gpio::Output + PioPad + 'static> Component
    for PioGspiComponent<L, CHANNELS, P>
{
    type StaticInput = &'static mut MaybeUninit<PioGSpi<'static, L, CHANNELS, P>>;
    type Output = &'static PioGSpi<'static, L, CHANNELS, P>;

    fn finalize(self, static_memory: Self::StaticInput) -> Self::Output {
        self.dma_channel.enable_interrupt(self.dma_irq);

        let pio_gspi = static_memory.write(PioGSpi::new(
            self.pio,
            self.dma_channel,
            self.clk,
            self.dio,
            self.cs,
            self.pio_sm,
        ));

        self.dma_channel.set_client(pio_gspi);
        pio_gspi.init();
        self.pio.sm(self.pio_sm).set_sm_client(pio_gspi);

        pio_gspi
    }
}
