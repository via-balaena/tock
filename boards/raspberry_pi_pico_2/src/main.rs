// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright OxidOS Automotive 2025.

//! Tock kernel for the Raspberry Pi Pico 2.
//!
//! It is based on RP2350SoC SoC (Cortex M33).

#![no_std]
#![no_main]
#![deny(missing_docs)]

use core::ptr::addr_of_mut;

use components::gpio::GpioComponent;
use components::led::LedsComponent;
use kernel::component::Component;
use kernel::hil::gpio::Configure;
use kernel::hil::led::LedHigh;
use kernel::platform::{KernelResources, SyscallDriverLookup};
use kernel::syscall::SyscallDriver;
use kernel::{capabilities, create_capability};

use rp2350::adc::{Adc, Channel};
use rp2350::chip::{Rp2350, Rp2350DefaultPeripherals};
use rp2350::gpio::{GpioFunction, RPGpio, RPGpioPin};

mod io;

// Allocate memory for the stack
kernel::stack_size! {0x3000}

// State for loading and holding applications.
// How should the kernel respond when a process faults.
const FAULT_RESPONSE: capsules_system::process_policies::PanicFaultPolicy =
    capsules_system::process_policies::PanicFaultPolicy {};

/// Supported drivers by the platform
pub struct RaspberryPiPico2 {
    base: raspberry_pi_pico_2::Platform,
    led: &'static capsules_core::led::LedDriver<'static, LedHigh<'static, RPGpioPin<'static>>, 1>,
    adc: &'static capsules_core::adc::AdcVirtualized<'static>,
}

impl SyscallDriverLookup for RaspberryPiPico2 {
    fn with_driver<F, R>(&self, driver_num: usize, f: F) -> R
    where
        F: FnOnce(Option<&dyn SyscallDriver>) -> R,
    {
        match driver_num {
            capsules_core::led::DRIVER_NUM => f(Some(self.led)),
            capsules_core::adc::DRIVER_NUM => f(Some(self.adc)),
            _ => self.base.with_driver(driver_num, f),
        }
    }
}

impl KernelResources<Rp2350<'static, Rp2350DefaultPeripherals<'static>>> for RaspberryPiPico2 {
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
    let (board_kernel, base, peripherals, _mux_alarm, chip) =
        raspberry_pi_pico_2::setup(|board_kernel, peripherals| {
            GpioComponent::new(
                board_kernel,
                capsules_core::gpio::DRIVER_NUM,
                components::gpio_component_helper!(
                    RPGpioPin,
                    // Used for serial communication. Comment them in if you don't use serial.
                    // 0 => peripherals.pins.get_pin(RPGpio::GPIO0),
                    // 1 => peripherals.pins.get_pin(RPGpio::GPIO1),
                    2 => peripherals.pins.get_pin(RPGpio::GPIO2),
                    3 => peripherals.pins.get_pin(RPGpio::GPIO3),
                    4 => peripherals.pins.get_pin(RPGpio::GPIO4),
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
                    17 => peripherals.pins.get_pin(RPGpio::GPIO17),
                    18 => peripherals.pins.get_pin(RPGpio::GPIO18),
                    19 => peripherals.pins.get_pin(RPGpio::GPIO19),
                    20 => peripherals.pins.get_pin(RPGpio::GPIO20),
                    21 => peripherals.pins.get_pin(RPGpio::GPIO21),
                    22 => peripherals.pins.get_pin(RPGpio::GPIO22),
                    23 => peripherals.pins.get_pin(RPGpio::GPIO23),
                    24 => peripherals.pins.get_pin(RPGpio::GPIO24),
                    // LED pin
                    // 25 => peripherals.pins.get_pin(RPGpio::GPIO25),
                    26 => peripherals.pins.get_pin(RPGpio::GPIO26),
                    27 => peripherals.pins.get_pin(RPGpio::GPIO27),
                    28 => peripherals.pins.get_pin(RPGpio::GPIO28),
                    29 => peripherals.pins.get_pin(RPGpio::GPIO29)
                ),
                create_capability!(capabilities::MemoryAllocationCapability),
            )
            .finalize(components::gpio_component_static!(RPGpioPin<'static>))
        });

    // Clear again now the peripherals have been reset. `Chip::init()` clears
    // pending interrupts too, but a source still asserting then re-latches at
    // once, and resetting it afterwards does not take the latched bit back.
    // The bootrom leaves USB enabled with its interrupt enables set, so a
    // reset out of a live bootrom session panicked on an unclaimed IRQ 14.
    cortexm33::nvic::clear_all_pending();

    // Set the UART used for panic
    (*addr_of_mut!(io::WRITER)).set_uart(&peripherals.uart0);

    let led = LedsComponent::new().finalize(components::led_component_static!(
        LedHigh<'static, RPGpioPin<'static>>,
        LedHigh::new(peripherals.pins.get_pin(RPGpio::GPIO25))
    ));

    // The four analogue inputs a QFN-60 RP2350 bonds out. On a Pico 2, GPIO26
    // through GPIO28 reach the header as ADC0-ADC2 and GPIO29 measures VSYS
    // through an on-board divider. They are exposed as ADC channels rather
    // than as GPIO pins; the commented-out entries in the GPIO list above
    // trade one for the other.
    //
    // A pad has to leave digital mode before the converter can use it, and
    // nothing in the ADC driver does that -- the pad is GPIO's to configure.
    //
    // This replaces an earlier loop that cleared IE on the same four pads and
    // said of the C SDK doing it "not sure why". The why is the converter, and
    // IE was a third of it. Reset for PADS_BANK0 is 0x116 (datasheet 9.11,
    // table 853): ISO set, PDE set, SCHMITT set, DRIVE 4mA, IE clear. The
    // pull-down is the one that bites: across an analogue source it is the
    // lower leg of a divider, so readings stay plausible while never reaching
    // either rail, which is the failure that gets diagnosed as a bad sensor
    // rather than as a pad. Clearing IE alone would not have fixed it.
    //
    // The three steps below are the ones `adc_gpio_init` takes in the C SDK
    // and each is load-bearing. `set_function` clears ISO and points no
    // digital peripheral at the pin, `PullNone` clears PDE, and
    // `deactivate_pads` clears IE and sets OD -- the step the old loop did.
    for pin in [
        RPGpio::GPIO26,
        RPGpio::GPIO27,
        RPGpio::GPIO28,
        RPGpio::GPIO29,
    ] {
        let pin = peripherals.pins.get_pin(pin);
        pin.set_function(GpioFunction::NULL);
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

    let adc_channel_3 = components::adc::AdcComponent::new(adc_mux, Channel::Channel3)
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
        adc_channel_3,
    ));

    let raspberry_pi_pico = RaspberryPiPico2 { base, led, adc };

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
        &raspberry_pi_pico,
        chip,
        Some(&raspberry_pi_pico.base.ipc),
        &main_loop_capability,
    );
}
