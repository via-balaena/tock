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
use kernel::hil::gpio::Configure;
use kernel::hil::time::Alarm;
use kernel::platform::{KernelResources, SyscallDriverLookup};
use kernel::syscall::SyscallDriver;
use kernel::{capabilities, create_capability, static_init};
use pio_gspi_component::{PioGspiComponent, pio_gpsi_component_static};

use rp2350::adc::{Adc, Channel};
use rp2350::chip::{Rp2350, Rp2350DefaultPeripherals};
use rp2350::gpio::{RPGpio, RPGpioPin};
use rp2350::pio_gspi::PioGSpi;
use rp2350::spi::Spi;
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
    adc: &'static capsules_core::adc::AdcVirtualized<'static>,
    spi: &'static capsules_core::spi_controller::Spi<
        'static,
        capsules_core::virtualizers::virtual_spi::VirtualSpiMasterDevice<'static, Spi<'static>>,
    >,
}

impl SyscallDriverLookup for RaspberryPiPico2W {
    fn with_driver<F, R>(&self, driver_num: usize, f: F) -> R
    where
        F: FnOnce(Option<&dyn SyscallDriver>) -> R,
    {
        match driver_num {
            capsules_extra::wifi::DRIVER_NUM => f(Some(self.wifi)),
            capsules_extra::stepper::DRIVER_NUM => f(Some(self.stepper)),
            capsules_core::adc::DRIVER_NUM => f(Some(self.adc)),
            capsules_core::spi_controller::DRIVER_NUM => f(Some(self.spi)),
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
                    // GPIO 18 to 21 are the stepper's phase windings. They are
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
                    // GPIO 2, 3 and 4 are SPI0 SCK, TX and RX to the
                    // display header, and GPIO 17 is the SPI capsule's own
                    // chip select. GPIO 5, 6 and 7 stay here on purpose:
                    // they are the panel's CS, DC and RST, and userspace
                    // drives all three.
                    5 => peripherals.pins.get_pin(RPGpio::GPIO5),
                    6 => peripherals.pins.get_pin(RPGpio::GPIO6),
                    7 => peripherals.pins.get_pin(RPGpio::GPIO7),
                    8 => peripherals.pins.get_pin(RPGpio::GPIO8),
                    9 => peripherals.pins.get_pin(RPGpio::GPIO9),
                    10 => peripherals.pins.get_pin(RPGpio::GPIO10),
                    11 => peripherals.pins.get_pin(RPGpio::GPIO11),
                    12 => peripherals.pins.get_pin(RPGpio::GPIO12),
                    13 => peripherals.pins.get_pin(RPGpio::GPIO13),
                    14 => peripherals.pins.get_pin(RPGpio::GPIO14),
                    15 => peripherals.pins.get_pin(RPGpio::GPIO15),
                    16 => peripherals.pins.get_pin(RPGpio::GPIO16),
                    22 => peripherals.pins.get_pin(RPGpio::GPIO22)
                    // GPIO 26, 27 and 28 are ADC0, ADC1 and ADC2. Uncomment to
                    // use them as GPIO pins instead of analogue inputs -- they
                    // cannot be both, since a process driving one as an output
                    // while another samples it is a short through the pad
                    // driver, and neither driver can see the other to refuse.
                    // 26 => peripherals.pins.get_pin(RPGpio::GPIO26),
                    // 27 => peripherals.pins.get_pin(RPGpio::GPIO27),
                    // 28 => peripherals.pins.get_pin(RPGpio::GPIO28)
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

    // The stepper's four phase windings, in sequence order, on GPIO 18 to 21:
    // physical pins 24 to 27, the four bracketed by the grounds at 23 and 28.
    //
    // NOT the obvious contiguous four below them. This board is seated in a
    // breadboard kit where GPIO 13 is a beeper and GPIO 11 is tied low by
    // something unidentified, so driving 11 would be a short through the pin
    // driver and 13 would sound rather than step. 18 to 21 are clear of
    // everything that kit wires up.
    let stepper_alarm = static_init!(
        VirtualMuxAlarm<'static, RPTimer>,
        VirtualMuxAlarm::new(mux_alarm)
    );
    stepper_alarm.setup();

    let stepper = static_init!(
        StepperDriver,
        capsules_extra::stepper::Stepper::new(
            [
                peripherals.pins.get_pin(RPGpio::GPIO18),
                peripherals.pins.get_pin(RPGpio::GPIO19),
                peripherals.pins.get_pin(RPGpio::GPIO20),
                peripherals.pins.get_pin(RPGpio::GPIO21),
            ],
            stepper_alarm,
            board_kernel.create_grant(
                capsules_extra::stepper::DRIVER_NUM,
                &create_capability!(capabilities::MemoryAllocationCapability),
            ),
        )
    );
    stepper_alarm.set_alarm_client(stepper);

    // ANALOGUE INPUTS -- channels 0, 1 and 2 only.
    //
    // A QFN-60 RP2350 bonds four analogue inputs, but the fourth is GPIO 29,
    // which on this board is the CYW43439's gSPI clock. Sampling it would mean
    // taking the pad off the radio, so there is no channel 3 here and adding
    // one by copying the Pico 2's wiring would break WiFi rather than fail.
    // The temperature sensor on channel 4 is not wired up either: it needs the
    // RP2350's own calibration constants, which is a separate claim to check.
    //
    // The pads have to leave digital mode before the converter can use them,
    // and the ADC driver is the wrong place for it -- a pad belongs to GPIO.
    // Reset for PADS_BANK0 is 0x116 (RP2350 datasheet 9.11, table 853): ISO
    // set, PDE set, SCHMITT set, DRIVE 4mA, IE clear. The pull-down is the one
    // that matters. Across an analogue source it is the lower leg of a
    // divider, so the reading stays plausible while never reaching either
    // rail, which is the failure that gets diagnosed as a bad sensor rather
    // than as a pad.
    //
    // The order below is the order the C SDK's `adc_gpio_init` uses and each
    // step is load-bearing: `set_function` clears ISO and points no digital
    // peripheral at the pin, `PullNone` clears PDE, and `deactivate_pads`
    // clears IE and sets OD. Dropping any one of them leaves a pad that still
    // reads, just wrongly.
    for pin in [RPGpio::GPIO26, RPGpio::GPIO27, RPGpio::GPIO28] {
        let pin = peripherals.pins.get_pin(pin);
        pin.set_function(rp2350::gpio::GpioFunction::NULL);
        pin.set_floating_state(kernel::hil::gpio::FloatingState::PullNone);
        pin.deactivate_pads();
    }

    peripherals.adc.init();

    let adc_mux = components::adc::AdcMuxComponent::new(&peripherals.adc)
        .finalize(components::adc_mux_component_static!(Adc));

    let adc_channel_0 = components::adc::AdcComponent::new(adc_mux, Channel::Channel0)
        .finalize(components::adc_component_static!(Adc));

    let adc_channel_1 = components::adc::AdcComponent::new(adc_mux, Channel::Channel1)
        .finalize(components::adc_component_static!(Adc));

    let adc_channel_2 = components::adc::AdcComponent::new(adc_mux, Channel::Channel2)
        .finalize(components::adc_component_static!(Adc));

    let adc = components::adc::AdcVirtualComponent::new(
        board_kernel,
        capsules_core::adc::DRIVER_NUM,
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    .finalize(components::adc_syscall_component_helper!(
        adc_channel_0,
        adc_channel_1,
        adc_channel_2,
    ));

    // SPI0 TO THE DISPLAY HEADER.
    //
    // The kit silkscreens GP2-GP7 as SCLK, MOSI, MISO, CS, DC, RST, and the
    // first four land exactly on SPI0's own functions in the RP2350 pin table:
    // GP2 is SPI0 SCK, GP3 is SPI0 TX, GP4 is SPI0 RX, GP5 is SPI0 CSn. Only
    // the first three are put in SPI mode here. GP5, GP6 and GP7 stay in the
    // userspace GPIO array as plain pins.
    //
    // That is deliberate and it is the whole reason this is wired the way it
    // is. Reading a register out of a TFT controller is one chip-select
    // assertion spanning a change of the data/command line:
    //
    //     CS low -> DC low -> command -> DC high -> read reply -> CS high
    //
    // The SPI syscall driver cannot express it. It asserts chip select per
    // transfer and releases it on completion, and commands 3 and 4 -- set and
    // get chip select -- both return NOSUPPORT. `hil::spi::SpiMaster` has
    // `hold_low`/`release_low` for exactly this, but the syscall capsule never
    // calls them. So two syscalls means two assertions and the controller sees
    // the command as finished before the data phase. Userspace has to own the
    // chip select, which is what every userspace TFT driver does anyway.
    let spi_clk = peripherals.pins.get_pin(RPGpio::GPIO2);
    let spi_tx = peripherals.pins.get_pin(RPGpio::GPIO3);
    let spi_rx = peripherals.pins.get_pin(RPGpio::GPIO4);
    spi_clk.set_function(rp2350::gpio::GpioFunction::SPI);
    spi_tx.set_function(rp2350::gpio::GpioFunction::SPI);
    spi_rx.set_function(rp2350::gpio::GpioFunction::SPI);

    let mux_spi = components::spi::SpiMuxComponent::new(&peripherals.spi0)
        .finalize(components::spi_mux_component_static!(Spi));

    // The capsule still needs a chip select of its own and will toggle it
    // around every transfer, so it is pointed at GPIO 17 -- one of the two
    // discrete user LEDs, which `kit_blink` has driven successfully, so it is
    // known not to be the addressable LED's data line. A spare pin from the
    // free list would have been a guess: the WS2812's data pin has never been
    // identified, and clocking every SPI transfer into it would light the
    // thing up as a side effect. A pin that is known beats a pin that is
    // merely unclaimed, and the LED makes bus activity visible for free.
    // GPIO 17 therefore leaves the userspace GPIO array.
    let spi = components::spi::SpiSyscallComponent::new(
        board_kernel,
        mux_spi,
        kernel::hil::spi::cs::IntoChipSelect::<_, kernel::hil::spi::cs::ActiveLow>::into_cs(
            peripherals.pins.get_pin(RPGpio::GPIO17),
        ),
        capsules_core::spi_controller::DRIVER_NUM,
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    .finalize(components::spi_syscall_component_static!(Spi));

    let raspberry_pi_pico_2_w = RaspberryPiPico2W {
        base,
        wifi,
        stepper,
        adc,
        spi,
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
