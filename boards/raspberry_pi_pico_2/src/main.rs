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

use components::led::LedsComponent;
use kernel::component::Component;
use kernel::hil::led::LedHigh;
use kernel::platform::{KernelResources, SyscallDriverLookup};
use kernel::syscall::SyscallDriver;
use kernel::{capabilities, create_capability};

use rp2350::chip::{Rp2350, Rp2350DefaultPeripherals};
use rp2350::gpio::{RPGpio, RPGpioPin};

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
}

impl SyscallDriverLookup for RaspberryPiPico2 {
    fn with_driver<F, R>(&self, driver_num: usize, f: F) -> R
    where
        F: FnOnce(Option<&dyn SyscallDriver>) -> R,
    {
        match driver_num {
            capsules_core::led::DRIVER_NUM => f(Some(self.led)),
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
    let (board_kernel, base, peripherals, _mux_alarm, chip) = raspberry_pi_pico_2::setup();

    // Set the UART used for panic
    (*addr_of_mut!(io::WRITER)).set_uart(&peripherals.uart0);

    let led = LedsComponent::new().finalize(components::led_component_static!(
        LedHigh<'static, RPGpioPin<'static>>,
        LedHigh::new(peripherals.pins.get_pin(RPGpio::GPIO25))
    ));

    let raspberry_pi_pico = RaspberryPiPico2 { base, led };

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
