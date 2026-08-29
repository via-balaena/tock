// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Tock kernel for the Raspberry Pi Pico 2 W.
//!
//! It is based on RP2350SoC SoC (Cortex M33) with an Infineon CYW43439 radio.
//!
//! The board is the Raspberry Pi Pico 2 with an Infineon CYW43439 radio
//! module added, so everything but the radio comes from the
//! `raspberry_pi_pico_2` library.
//!
//! GPIO 25 is the difference that matters on the RP2350 side: on a Pico 2 it
//! drives the user LED, and here it is the radio's SPI chip select. This
//! board therefore has no LED driver, and its panic handler prints and halts
//! rather than blinking. The LED a Pico 2 W does have is on the radio itself.
//!
//! The radio speaks a half duplex SPI that no hardware SPI block can drive,
//! so it runs over a PIO state machine with DMA feeding the FIFOs, the same
//! way `raspberry_pi_pico_w` reaches the same part on the RP2040.

#![no_std]
#![no_main]
#![deny(missing_docs)]

use core::ptr::addr_of_mut;

use capsules_core::virtualizers::virtual_alarm::VirtualMuxAlarm;
use components::pio_gspi::PioGspiComponent;
use kernel::component::Component;
use kernel::debug;
use kernel::platform::{KernelResources, SyscallDriverLookup};
use kernel::syscall::SyscallDriver;
use kernel::{capabilities, create_capability};

use rp2350::chip::{Rp2350, Rp2350DefaultPeripherals};
use rp2350::gpio::{RPGpio, RPGpioPin};
use rp2350::pio_gspi::PioGSpi;
use rp2350::timer::RPTimer;
use rp2350::{dma, pio};

mod io;

type CYW4343xSpiBus = capsules_extra::cyw4343::spi_bus::CYW4343xSpiBus<
    'static,
    PioGSpi<'static>,
    VirtualMuxAlarm<'static, RPTimer<'static>>,
>;

type CYW4343xHw = capsules_extra::cyw4343::CYW4343x<
    'static,
    RPGpioPin<'static>,
    VirtualMuxAlarm<'static, RPTimer<'static>>,
    CYW4343xSpiBus,
>;

type WifiDriver = capsules_extra::wifi::WifiDriver<'static, CYW4343xHw>;

// Allocate memory for the stack
kernel::stack_size! {0x3000}

// State for loading and holding applications.
// How should the kernel respond when a process faults.
const FAULT_RESPONSE: capsules_system::process_policies::PanicFaultPolicy =
    capsules_system::process_policies::PanicFaultPolicy {};

/// Supported drivers by the platform
pub struct RaspberryPiPico2W {
    base: raspberry_pi_pico_2::Platform,
    wifi: &'static WifiDriver,
}

impl SyscallDriverLookup for RaspberryPiPico2W {
    fn with_driver<F, R>(&self, driver_num: usize, f: F) -> R
    where
        F: FnOnce(Option<&dyn SyscallDriver>) -> R,
    {
        match driver_num {
            capsules_extra::wifi::DRIVER_NUM => f(Some(self.wifi)),
            _ => self.base.with_driver(driver_num, f),
        }
    }
}

impl KernelResources<Rp2350<'static, Rp2350DefaultPeripherals<'static>>> for RaspberryPiPico2W {
    type SyscallDriverLookup = Self;
    type SyscallFilter = ();
    type ProcessFault = ();
    type Scheduler = raspberry_pi_pico_2::SchedulerInUse;
    type SchedulerTimer = cortexm33::systick::SysTick;
    type WatchDog = ();
    type ContextSwitchCallback = ();

    fn syscall_driver_lookup(&self) -> &Self::SyscallDriverLookup {
        self
    }
    fn syscall_filter(&self) -> &Self::SyscallFilter {
        &()
    }
    fn process_fault(&self) -> &Self::ProcessFault {
        &()
    }
    fn scheduler(&self) -> &Self::Scheduler {
        self.base.scheduler
    }
    fn scheduler_timer(&self) -> &Self::SchedulerTimer {
        &self.base.systick
    }
    fn watchdog(&self) -> &Self::WatchDog {
        &()
    }
    fn context_switch_callback(&self) -> &Self::ContextSwitchCallback {
        &()
    }
}

// ---------------------------------------------------------------------------
// NOT FOR UPSTREAM. Radio bring-up harness.
//
// Nothing in the tree drives the CYW43439 at boot; the syscall driver does it
// when an application asks for it. This calls init() itself and prints what
// comes back, so the transport can be exercised with no application loaded.
// ---------------------------------------------------------------------------
struct RadioBringUp {
    device: &'static CYW4343xHw,
}

impl capsules_extra::wifi::Client for RadioBringUp {
    fn command_done(&self, rval: Result<(), kernel::ErrorCode>) {
        use capsules_extra::wifi::Device;
        match rval {
            Ok(()) => {
                debug!("cyw43 bringup: init reported success");
                match self.device.mac() {
                    Ok(m) => debug!(
                        "cyw43 bringup: MAC {:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                        m[0], m[1], m[2], m[3], m[4], m[5]
                    ),
                    Err(e) => debug!("cyw43 bringup: MAC unavailable, {:?}", e),
                }
            }
            Err(e) => debug!("cyw43 bringup: init failed, {:?}", e),
        }
    }

    fn scanned_network(&self, _ssid: capsules_extra::wifi::Ssid) {}

    fn scan_done(&self) {
        debug!("cyw43 bringup: scan done");
    }
}

/// Main function called after RAM initialized.
#[no_mangle]
pub unsafe fn main() {
    let (board_kernel, base, peripherals, mux_alarm, chip) = raspberry_pi_pico_2::setup();

    // Set the UART used for panic
    (*addr_of_mut!(io::WRITER)).set_uart(&peripherals.uart0);

    // WIFI
    //
    // The four pins the CYW43439 module is wired to. They are the same on
    // this board as on the Raspberry Pi Pico W, and none of them reaches the
    // 40 pin header.
    let cs = peripherals.pins.get_pin(RPGpio::GPIO25);
    cs.make_output();

    let pio_gspi = PioGspiComponent::new(
        &peripherals.pio0,
        pio::SMNumber::SM0,
        peripherals.dma.channel(dma::Channel::Channel0 as usize),
        dma::Irq::Irq0,
        RPGpio::GPIO29 as u32,
        RPGpio::GPIO24 as u32,
        cs,
    )
    .finalize(components::pio_gspi_component_static!(
        rp2350::pio_gspi::PioGSpi<'static>
    ));

    let (fw, nvram, clm) = (
        tock_firmware_cyw43::cyw43439::FW,
        tock_firmware_cyw43::cyw43439::NVRAM,
        tock_firmware_cyw43::cyw43439::CLM,
    );

    let pwr = peripherals.pins.get_pin(RPGpio::GPIO23);
    pwr.make_output();

    let cyw4343_spi_bus =
        components::cyw4343::CYW4343xSpiBusComponent::new(mux_alarm, pio_gspi, fw, nvram).finalize(
            components::cyw4343x_spi_bus_component_static!(PioGSpi<'static>, RPTimer),
        );
    pio_gspi.set_irq_client(cyw4343_spi_bus);

    let cyw4343_device =
        components::cyw4343::CYW4343xComponent::new(pwr, mux_alarm, cyw4343_spi_bus, clm).finalize(
            components::cyw4343_component_static!(RPGpioPin, RPTimer, CYW4343xSpiBus),
        );

    let wifi = components::wifi::WifiComponent::new(
        board_kernel,
        capsules_extra::wifi::DRIVER_NUM,
        cyw4343_device,
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    .finalize(components::wifi_component_static!(CYW4343xHw));

    let raspberry_pi_pico_2_w = RaspberryPiPico2W { base, wifi };

    // NOT FOR UPSTREAM: take the client back from the syscall driver and start
    // the radio here, so the transport runs with no application loaded.
    {
        use capsules_extra::wifi::Device;
        let bringup = kernel::static_init!(
            RadioBringUp,
            RadioBringUp {
                device: cyw4343_device
            }
        );
        cyw4343_device.set_client(bringup);
        match cyw4343_device.init() {
            Ok(()) => debug!("cyw43 bringup: init started"),
            Err(e) => debug!("cyw43 bringup: init refused, {:?}", e),
        }
    }

    debug!("Initialization complete. Enter main loop");

    let process_management_capability =
        create_capability!(capabilities::ProcessManagementCapability);

    // These symbols are defined in the linker script.
    extern "C" {
        /// Beginning of the ROM region containing app images.
        static _sapps: u8;
        /// End of the ROM region containing app images.
        static _eapps: u8;
        /// Beginning of the RAM region for app memory.
        static mut _sappmem: u8;
        /// End of the RAM region for app memory.
        static _eappmem: u8;
    }

    kernel::process::load_processes(
        board_kernel,
        chip,
        core::slice::from_raw_parts(
            core::ptr::addr_of!(_sapps),
            core::ptr::addr_of!(_eapps) as usize - core::ptr::addr_of!(_sapps) as usize,
        ),
        core::slice::from_raw_parts_mut(
            core::ptr::addr_of_mut!(_sappmem),
            core::ptr::addr_of!(_eappmem) as usize - core::ptr::addr_of!(_sappmem) as usize,
        ),
        &FAULT_RESPONSE,
        &process_management_capability,
    )
    .unwrap_or_else(|err| {
        kernel::debug!("Error loading processes!");
        kernel::debug!("{:?}", err);
    });

    let main_loop_capability = create_capability!(capabilities::MainLoopCapability);

    board_kernel.kernel_loop(
        &raspberry_pi_pico_2_w,
        chip,
        Some(&raspberry_pi_pico_2_w.base.ipc),
        &main_loop_capability,
    );
}
