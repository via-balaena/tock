// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Tock kernel for the Raspberry Pi Pico 2 W.
//!
//! It is based on the RP2350 SoC (Cortex M33) and carries an Infineon
//! CYW43439 radio, reached over half duplex SPI driven by a PIO state
//! machine with DMA underneath it.
//!
//! The board is the Raspberry Pi Pico 2 with the radio wired into four of the
//! pins the plain board leaves free, so it is built on
//! [`raspberry_pi_pico_2`] and differs from it only where the radio takes
//! something over: the LED, since GPIO 25 is the LED on a Pico 2 and the
//! radio's chip select here, and the four pins the radio is wired to.

#![no_std]
#![no_main]
#![deny(missing_docs)]

use core::ptr::addr_of_mut;

use capsules_core::virtualizers::virtual_alarm::VirtualMuxAlarm;
use components::gpio::GpioComponent;
use kernel::component::Component;
use kernel::hil::time::Alarm;
use kernel::platform::{KernelResources, SyscallDriverLookup};
use kernel::syscall::SyscallDriver;
use kernel::{capabilities, create_capability, static_init};
use pio_gspi_component::{PioGspiComponent, pio_gpsi_component_static};

use rp2350::chip::{Rp2350, Rp2350DefaultPeripherals};
use rp2350::gpio::{RPGpio, RPGpioPin};
use rp2350::pio_gspi::PioGSpi;
use rp2350::timer::RPTimer;
use rp2350::{dma, pio};

mod io;
mod pio_gspi_component;

// Allocate memory for the stack
kernel::stack_size! {0x3000}

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

type StepperDriver =
    capsules_extra::stepper::Stepper<'static, VirtualMuxAlarm<'static, RPTimer<'static>>>;

// How should the kernel respond when a process faults.
const FAULT_RESPONSE: capsules_system::process_policies::PanicFaultPolicy =
    capsules_system::process_policies::PanicFaultPolicy {};

/// Supported drivers by the platform
pub struct RaspberryPiPico2W {
    base: raspberry_pi_pico_2::Platform,
    wifi: &'static WifiDriver,
    stepper: &'static StepperDriver,
}

impl SyscallDriverLookup for RaspberryPiPico2W {
    fn with_driver<F, R>(&self, driver_num: usize, f: F) -> R
    where
        F: FnOnce(Option<&dyn SyscallDriver>) -> R,
    {
        match driver_num {
            capsules_extra::wifi::DRIVER_NUM => f(Some(self.wifi)),
            capsules_extra::stepper::DRIVER_NUM => f(Some(self.stepper)),
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

/// Main function called after RAM initialized.
#[no_mangle]
pub unsafe fn main() {
    let (board_kernel, base, peripherals, mux_alarm, chip) =
        raspberry_pi_pico_2::setup(|board_kernel, peripherals| {
            GpioComponent::new(
                board_kernel,
                capsules_core::gpio::DRIVER_NUM,
                components::gpio_component_helper!(
                    RPGpioPin,
                    // GPIO 0 and 1 are the console UART.
                    //
                    // GPIO 10 to 13 are the stepper's phase windings. They are
                    // left out for the same reason as the radio's pins: a
                    // process able to drive a winding directly could energise
                    // a coil behind the driver that is responsible for not
                    // leaving one energised.
                    //
                    // GPIO 23, 24, 25 and 29 are the CYW43439: power, gSPI data,
                    // chip select and gSPI clock. They are left out because a
                    // process that could drive them could power the radio up
                    // underneath the kernel, and once it is running could cut
                    // its power or corrupt a transfer on the bus.
                    2 => peripherals.pins.get_pin(RPGpio::GPIO2),
                    3 => peripherals.pins.get_pin(RPGpio::GPIO3),
                    4 => peripherals.pins.get_pin(RPGpio::GPIO4),
                    5 => peripherals.pins.get_pin(RPGpio::GPIO5),
                    6 => peripherals.pins.get_pin(RPGpio::GPIO6),
                    7 => peripherals.pins.get_pin(RPGpio::GPIO7),
                    8 => peripherals.pins.get_pin(RPGpio::GPIO8),
                    9 => peripherals.pins.get_pin(RPGpio::GPIO9),
                    14 => peripherals.pins.get_pin(RPGpio::GPIO14),
                    15 => peripherals.pins.get_pin(RPGpio::GPIO15),
                    16 => peripherals.pins.get_pin(RPGpio::GPIO16),
                    17 => peripherals.pins.get_pin(RPGpio::GPIO17),
                    18 => peripherals.pins.get_pin(RPGpio::GPIO18),
                    19 => peripherals.pins.get_pin(RPGpio::GPIO19),
                    20 => peripherals.pins.get_pin(RPGpio::GPIO20),
                    21 => peripherals.pins.get_pin(RPGpio::GPIO21),
                    22 => peripherals.pins.get_pin(RPGpio::GPIO22),
                    26 => peripherals.pins.get_pin(RPGpio::GPIO26),
                    27 => peripherals.pins.get_pin(RPGpio::GPIO27),
                    28 => peripherals.pins.get_pin(RPGpio::GPIO28)
                ),
                create_capability!(capabilities::MemoryAllocationCapability),
            )
            .finalize(components::gpio_component_static!(RPGpioPin<'static>))
        });

    // Set the UART used for panic
    (*addr_of_mut!(io::WRITER)).set_uart(&peripherals.uart0);

    // The CYW43439 radio.
    //
    // It hangs off four pins rather than a bus the chip has a peripheral for:
    // chip select and power are plain outputs, and clock and data are driven
    // by a PIO state machine running a half duplex SPI program, with a DMA
    // channel moving the words. The pins are the same four the RP2040 Pico W
    // uses, which is why boards/raspberry_pi_pico_w reads almost identically
    // from here down.
    let cs = peripherals.pins.get_pin(RPGpio::GPIO25);
    cs.make_output();

    let pio_gspi = PioGspiComponent::new(
        &peripherals.pio0,
        pio::SMNumber::SM0,
        peripherals.dma.channel(dma::Channel::Ch0),
        dma::Irq::Irq0,
        peripherals.pins.get_pin(RPGpio::GPIO29),
        peripherals.pins.get_pin(RPGpio::GPIO24),
        cs,
    )
    .finalize(pio_gpsi_component_static!());

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

    // The stepper's four phase windings, in sequence order, on GPIO 10 to 13,
    // which is where the ULN2003's IN1 to IN4 are physically wired.
    //
    // NOTE: if this board is seated in the breadboard kit, GPIO 13 is that
    // board's beeper and GPIO 11 is tied low by something unidentified.
    // Driving 11 against whatever holds it down is a short through the pin
    // driver. These pins are correct for a bare board and wrong in the kit.
    let stepper_alarm = static_init!(
        VirtualMuxAlarm<'static, RPTimer>,
        VirtualMuxAlarm::new(mux_alarm)
    );
    stepper_alarm.setup();

    let stepper = static_init!(
        StepperDriver,
        capsules_extra::stepper::Stepper::new(
            [
                peripherals.pins.get_pin(RPGpio::GPIO10),
                peripherals.pins.get_pin(RPGpio::GPIO11),
                peripherals.pins.get_pin(RPGpio::GPIO12),
                peripherals.pins.get_pin(RPGpio::GPIO13),
            ],
            stepper_alarm,
            board_kernel.create_grant(
                capsules_extra::stepper::DRIVER_NUM,
                &create_capability!(capabilities::MemoryAllocationCapability),
            ),
        )
    );
    stepper_alarm.set_alarm_client(stepper);

    let raspberry_pi_pico_2_w = RaspberryPiPico2W {
        base,
        wifi,
        stepper,
    };

    kernel::debug!("Initialization complete. Enter main loop");

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
