// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright OxidOS Automotive 2025.

//! Shared platform setup for the Raspberry Pi Pico 2 and boards derived from
//! it.
//!
//! It is based on RP2350SoC SoC (Cortex M33).
//!
//! This crate is both a library and a binary. The binary is the plain
//! Raspberry Pi Pico 2; the library holds everything a derived board also
//! needs, so that such a board can call [`setup`] and then add only the
//! drivers that differ. See `doc/NestedBoards.md`.

#![no_std]

use capsules_core::virtualizers::virtual_alarm::{MuxAlarm, VirtualMuxAlarm};
use enum_primitive::cast::FromPrimitive;
use kernel::component::Component;
use kernel::debug::PanicResources;
use kernel::platform::SyscallDriverLookup;
use kernel::platform::chip::Chip;
use kernel::syscall::SyscallDriver;
use kernel::utilities::single_thread_value::SingleThreadValue;
use kernel::{Kernel, capabilities, create_capability, static_init};

use rp2350::chip::{Rp2350, Rp2350DefaultPeripherals};
use rp2350::clocks::{
    AdcAuxiliaryClockSource, HstxAuxiliaryClockSource, PeripheralAuxiliaryClockSource, PllClock,
    ReferenceAuxiliaryClockSource, ReferenceClockSource, SystemAuxiliaryClockSource,
    SystemClockSource, UsbAuxiliaryClockSource,
};
use rp2350::gpio::{GpioFunction, RPGpio, RPGpioPin};
use rp2350::resets::Peripheral;
use rp2350::timer::RPTimer;
#[allow(unused)]
use rp2350::{BASE_VECTORS, xosc};

mod flash_bootloader;

// Manually setting the boot header section that contains the FCB header
//
// This section attribute is only applied when targeting bare-metal
// (`target_os = "none"`). Host builds (e.g. tests, clippy, doc) use object
// formats (Mach-O, PE, ...) that reject a bare section name like this,
// yielding errors such as: `mach-o section specifier requires a segment and
// section separated by a comma`.
#[cfg_attr(target_os = "none", link_section = ".flash_bootloader")]
#[used]
static FLASH_BOOTLOADER: [u8; 256] = flash_bootloader::FLASH_BOOTLOADER;

// This section attribute is only applied when targeting bare-metal
// (`target_os = "none"`). Host builds (e.g. tests, clippy, doc) use object
// formats (Mach-O, PE, ...) that reject a bare section name like this,
// yielding errors such as: `mach-o section specifier requires a segment and
// section separated by a comma`.
#[cfg_attr(target_os = "none", link_section = ".metadata_block")]
#[used]
static METADATA_BLOCK: [u8; 28] = flash_bootloader::METADATA_BLOCK;

// Number of concurrent processes this platform supports.
const NUM_PROCS: usize = 4;

/// The chip this board runs on.
pub type ChipHw = Rp2350<'static, Rp2350DefaultPeripherals<'static>>;
type ProcessPrinterInUse = capsules_system::process_printer::ProcessPrinterText;

/// Resources for when a board panics used by io.rs.
pub static PANIC_RESOURCES: SingleThreadValue<PanicResources<ChipHw, ProcessPrinterInUse>> =
    SingleThreadValue::new();

/// The GPIO driver a board built on this platform supplies.
///
/// Which pins userspace may drive is a decision for each board rather than
/// for the platform: a pin that is free on one may be wired to something on
/// another. So [`setup`] takes a closure that builds this, and each board
/// names its own pins with `components::gpio_component_helper!`.
pub type GpioDriver = capsules_core::gpio::GPIO<'static, RPGpioPin<'static>>;

/// The scheduler this board uses.
pub type SchedulerInUse = components::sched::round_robin::RoundRobinComponentType;

/// Drivers every board built on this platform provides.
pub struct Platform {
    /// Inter-process communication, passed to `kernel_loop`.
    pub ipc: kernel::ipc::IPC<{ NUM_PROCS as u8 }>,
    console: &'static capsules_core::console::Console<'static>,
    /// The scheduler, for `KernelResources::scheduler`.
    pub scheduler: &'static SchedulerInUse,
    /// The scheduler timer, for `KernelResources::scheduler_timer`.
    pub systick: cortexm33::systick::SysTick,
    alarm: &'static capsules_core::alarm::AlarmDriver<
        'static,
        VirtualMuxAlarm<'static, rp2350::timer::RPTimer<'static>>,
    >,
    gpio: &'static GpioDriver,
    #[cfg(feature = "kit_display")]
    screen: &'static capsules_extra::screen::screen::Screen<'static>,
    #[cfg(feature = "kit_input")]
    buttons: &'static capsules_core::button::Button<'static, RPGpioPin<'static>>,
    #[cfg(feature = "kit_input")]
    adc: &'static capsules_core::adc::AdcVirtualized<'static>,
}

impl SyscallDriverLookup for Platform {
    fn with_driver<F, R>(&self, driver_num: usize, f: F) -> R
    where
        F: FnOnce(Option<&dyn SyscallDriver>) -> R,
    {
        match driver_num {
            capsules_core::console::DRIVER_NUM => f(Some(self.console)),
            capsules_core::alarm::DRIVER_NUM => f(Some(self.alarm)),
            capsules_core::gpio::DRIVER_NUM => f(Some(self.gpio)),
            #[cfg(feature = "kit_display")]
            capsules_extra::screen::screen::DRIVER_NUM => f(Some(self.screen)),
            #[cfg(feature = "kit_input")]
            capsules_core::button::DRIVER_NUM => f(Some(self.buttons)),
            #[cfg(feature = "kit_input")]
            capsules_core::adc::DRIVER_NUM => f(Some(self.adc)),
            kernel::ipc::DRIVER_NUM => f(Some(&self.ipc)),
            _ => f(None),
        }
    }
}

#[allow(dead_code)]
extern "C" {
    /// Entry point used for debugger
    ///
    /// When loaded using gdb, the Raspberry Pi Pico 2 is not reset
    /// by default. Without this function, gdb sets the PC to the
    /// beginning of the flash. This is not correct, as the RP2350
    /// has a more complex boot process.
    ///
    /// This function is set to be the entry point for gdb and is used
    /// to send the RP2350 back in the bootloader so that all the boot
    /// sequence is performed.
    fn jump_to_bootloader();
}

// Unlike arch/* and chips/*, board crates aren't cross-compiled against
// their real target for docs (see CRATE_TARGETS in
// tools/build/build_all_docs.sh), so `doc` is what makes the host-target
// doc pass pick this real implementation over having no implementation
// at all.
#[cfg(any(doc, all(target_arch = "arm", target_os = "none")))]
core::arch::global_asm!(
    "
    .section .jump_to_bootloader, \"ax\"
    .global jump_to_bootloader
    .thumb_func
  jump_to_bootloader:
    movs r0, #0
    ldr r1, =(0xe0000000 + 0x0000ed08)
    str r0, [r1]
    ldmia r0!, {{r1, r2}}
    msr msp, r1
    bx r2
    "
);

fn init_clocks(
    peripherals: &Rp2350DefaultPeripherals,
    clocks: &'static rp2350::clocks::Clocks,
    resets: &'static rp2350::resets::Resets,
) {
    // // Start tick in watchdog
    // peripherals.watchdog.start_tick(12);
    //
    // Disable the Resus clock
    clocks.disable_resus();

    // Setup the external Oscillator
    peripherals.xosc.init();

    // disable ref and sys clock aux sources
    clocks.disable_sys_aux();
    clocks.disable_ref_aux();

    resets.reset(&[Peripheral::PllSys, Peripheral::PllUsb]);
    resets.unreset(&[Peripheral::PllSys, Peripheral::PllUsb], true);

    // Configure PLLs (from Pico SDK)
    //                   REF     FBDIV VCO            POSTDIV
    // PLL SYS: 12 / 1 = 12MHz * 125 = 1500MHZ / 6 / 2 = 125MHz
    // PLL USB: 12 / 1 = 12MHz * 40  = 480 MHz / 5 / 2 =  48MHz

    // It seems that the external oscillator is clocked at 12 MHz

    clocks.pll_init(PllClock::Sys, 12, 1, 1500 * 1000000, 6, 2);
    clocks.pll_init(PllClock::Usb, 12, 1, 480 * 1000000, 5, 2);

    // pico-sdk: // CLK_REF = XOSC (12MHz) / 1 = 12MHz
    clocks.configure_reference(
        ReferenceClockSource::Xosc,
        ReferenceAuxiliaryClockSource::PllUsb,
        12000000,
        12000000,
    );
    // pico-sdk: CLK SYS = PLL SYS (125MHz) / 1 = 125MHz
    clocks.configure_system(
        SystemClockSource::Auxiliary,
        SystemAuxiliaryClockSource::PllSys,
        125000000,
        125000000,
    );

    // pico-sdk: CLK USB = PLL USB (48MHz) / 1 = 48MHz
    clocks.configure_usb(UsbAuxiliaryClockSource::PllSys, 48000000, 48000000);
    // pico-sdk: CLK ADC = PLL USB (48MHZ) / 1 = 48MHz
    clocks.configure_adc(AdcAuxiliaryClockSource::PllUsb, 48000000, 48000000);
    // pico-sdk: CLK HSTX = PLL USB (48MHz) / 1024 = 46875Hz
    clocks.configure_hstx(HstxAuxiliaryClockSource::PllSys, 48000000, 46875);
    // pico-sdk:
    // CLK PERI = clk_sys. Used as reference clock for Peripherals. No dividers so just select and enable
    // Normally choose clk_sys or clk_usb
    clocks.configure_peripheral(PeripheralAuxiliaryClockSource::System, 125000000);
}

unsafe fn get_peripherals() -> (
    &'static mut Rp2350DefaultPeripherals<'static>,
    &'static rp2350::clocks::Clocks,
    &'static rp2350::resets::Resets,
) {
    let clocks = static_init!(rp2350::clocks::Clocks, rp2350::clocks::Clocks::new());
    let resets = static_init!(rp2350::resets::Resets, rp2350::resets::Resets::new());
    let peripherals = static_init!(
        Rp2350DefaultPeripherals,
        Rp2350DefaultPeripherals::new(clocks, resets)
    );
    (peripherals, clocks, resets)
}

/// Bring the chip up and instantiate the drivers every board on this platform
/// shares.
///
/// Returns the kernel, the shared [`Platform`], the peripherals, the alarm mux
/// (so a derived board can hang further virtual alarms off it) and the chip.
///
/// ### Safety
///
/// Must be called exactly once, from the main thread, before any other kernel
/// initialization. It performs `static_init!` allocations and binds
/// [`PANIC_RESOURCES`] to the calling thread.
pub unsafe fn setup(
    gpio: impl FnOnce(
        &'static Kernel,
        &'static Rp2350DefaultPeripherals<'static>,
    ) -> &'static GpioDriver,
) -> (
    &'static Kernel,
    Platform,
    &'static Rp2350DefaultPeripherals<'static>,
    &'static MuxAlarm<'static, RPTimer<'static>>,
    &'static Rp2350<'static, Rp2350DefaultPeripherals<'static>>,
) {
    ChipHw::init();

    // Initialize deferred calls very early.
    kernel::deferred_call::initialize_deferred_call_state::<
        <ChipHw as kernel::platform::chip::Chip>::ThreadIdProvider,
    >();

    // Bind global variables to this thread.
    let _ = PANIC_RESOURCES
        .bind_to_thread::<<ChipHw as kernel::platform::chip::Chip>::ThreadIdProvider>(
            PanicResources::new(),
        );

    let (peripherals, clocks, resets) = get_peripherals();
    peripherals.init();

    resets.reset_all_except(&[
        Peripheral::IOQSpi,
        Peripheral::PadsQSpi,
        Peripheral::PllUsb,
        Peripheral::PllSys,
    ]);

    init_clocks(peripherals, clocks, resets);

    resets.unreset_all_except(&[], true);

    let gpio_tx = peripherals.pins.get_pin(RPGpio::GPIO0);
    let gpio_rx = peripherals.pins.get_pin(RPGpio::GPIO1);
    gpio_rx.set_function(GpioFunction::UART);
    gpio_tx.set_function(GpioFunction::UART);

    //// Disable IE for pads 26-29 (the Pico SDK runtime does this, not sure why)
    for pin in 26..30 {
        peripherals
            .pins
            .get_pin(RPGpio::from_usize(pin).unwrap())
            .deactivate_pads();
    }

    let chip = static_init!(
        Rp2350<Rp2350DefaultPeripherals>,
        Rp2350::new(peripherals, &peripherals.sio)
    );
    PANIC_RESOURCES.get().map(|resources| {
        resources.chip.put(chip);
    });

    // Create an array to hold process references.
    let processes = components::process_array::ProcessArrayComponent::new()
        .finalize(components::process_array_component_static!(NUM_PROCS));
    PANIC_RESOURCES.get().map(|resources| {
        resources.processes.put(processes.as_slice());
    });

    let board_kernel = static_init!(Kernel, Kernel::new(processes.as_slice()));

    let memory_allocation_capability = create_capability!(capabilities::MemoryAllocationCapability);

    let mux_alarm = components::alarm::AlarmMuxComponent::new(&peripherals.timer0)
        .finalize(components::alarm_mux_component_static!(RPTimer));

    let alarm = components::alarm::AlarmDriverComponent::new(
        board_kernel,
        capsules_core::alarm::DRIVER_NUM,
        mux_alarm,
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    .finalize(components::alarm_component_static!(RPTimer));

    let uart_mux = components::console::UartMuxComponent::new(&peripherals.uart0, 115200)
        .finalize(components::uart_mux_component_static!());

    // Setup the console.
    let console = components::console::ConsoleComponent::new(
        board_kernel,
        capsules_core::console::DRIVER_NUM,
        uart_mux,
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    .finalize(components::console_component_static!());

    let gpio = gpio(board_kernel, peripherals);

    // Create the debugger object that handles calls to `debug!()`.
    components::debug_writer::DebugWriterComponent::new::<
        <ChipHw as kernel::platform::chip::Chip>::ThreadIdProvider,
    >(
        uart_mux,
        create_capability!(capabilities::SetDebugWriterCapability),
    )
    .finalize(components::debug_writer_component_static!());

    #[cfg(feature = "uart_contract_test")]
    // Run the hil::uart conformance test against a device on this mux.
    //
    // An audit on 2026-09-13 read seven of the guarantees `hil::uart` states
    // against all twenty-six implementations in the tree and found every one
    // of them violated somewhere. This executes the clauses at boot instead
    // of leaving them as prose. Results print through `debug!` above.
    {
        use capsules_core::test::uart_contract::TestUartContract;

        // Against the chip driver itself, on UART1, not through the mux.
        // UART0 carries the console, so testing that one would fight the
        // process console for the line; UART1 is otherwise unused here.
        // Most of the divergences the audit found live in chip drivers
        // rather than in the virtualizer.
        let test_uart = &peripherals.uart1;

        // With `uart_contract_test_pads`, the loop runs out of the chip and
        // back in over a jumper, which is the only way to exercise the pads
        // and the function mux. GP20 is UART1 TX and GP21 is UART1 RX at
        // FUNCSEL 0x02 (checked against the RP2350 datasheet's GPIO20_CTRL
        // and GPIO21_CTRL tables). `LBE` is deliberately left clear: with it
        // set the bytes would never reach a pad and the wire would prove
        // nothing.
        //
        // This is conditional compilation for the one reason AGENTS.md
        // allows it -- the alternative is a board that hangs at boot unless
        // a particular wire is present.
        //
        // BEFORE `configure`, and that ordering is load-bearing. `configure`
        // ends by setting `RXE`, so doing it first leaves a LIVE receiver
        // watching a pin that is still a GPIO; muxing the pad under it then
        // looks like a start bit and the PL011 latches a character. Measured
        // on silicon, the same build both ways:
        //
        //     pads after  configure   UARTFR.RXFE 0, UARTRIS 0x280, 3/3 FAIL
        //     pads before configure   UARTFR.RXFE 1, UARTRIS 0x000, 4/4 pass
        //
        // `UARTRIS` 0x280 is bits 9 and 7 -- break and framing error -- which
        // is what a half-formed character looks like. With the FIFOs on it
        // waits in the receive FIFO and is handed to the first client that
        // asks, which showed up as the loopback pattern arriving rotated by
        // one: sent 55 aa 00 ff, got 00 55 aa 00.
        #[cfg(feature = "uart_contract_test_pads")]
        {
            peripherals
                .pins
                .get_pin(RPGpio::GPIO20)
                .set_function(GpioFunction::UART);
            peripherals
                .pins
                .get_pin(RPGpio::GPIO21)
                .set_function(GpioFunction::UART);
        }

        // The transmit phase needs a working peripheral: `configure` ends by
        // setting UARTEN, TXE and RXE, and without it a transmit fills the
        // FIFO and never drains, so the test would hang rather than fail.
        #[cfg(not(feature = "uart_contract_test_unconfigured"))]
        let _ = kernel::hil::uart::Configure::configure(
            test_uart,
            kernel::hil::uart::Parameters {
                baud_rate: 115200,
                width: kernel::hil::uart::Width::Eight,
                stop_bits: kernel::hil::uart::StopBits::One,
                parity: kernel::hil::uart::Parity::None,
                hw_flow_control: false,
            },
        );
        // Close the loop so the test can check what was carried, not only
        // what was reported. Two ways, and they cover different things.
        //
        // By default, the peripheral's own diagnostic mode: `UARTCR.LBE`,
        // datasheet 12.1.3.2.6. The loop sits ahead of the pads, so UART1's
        // pins stay unconfigured and drive nothing, and no jumper is needed
        // on a board whose pins are already spoken for. It says nothing
        // about the pads or the pin mux.
        //
        // Set after `configure`, which only ever read-modify-writes UARTCR
        // and so would preserve the bit either way.
        #[cfg(not(feature = "uart_contract_test_pads"))]
        test_uart.set_loopback(true);

        let test_buffer = static_init!([u8; 64], [0; 64]);
        let contract = static_init!(
            TestUartContract<rp2350::uart::Uart>,
            TestUartContract::new_loopback(test_uart, test_buffer)
        );
        // Before `run`, because it is synchronous and because a driver that
        // does not validate will not return from it.
        contract.check_configure(test_uart);

        kernel::hil::uart::Receive::set_receive_client(test_uart, contract);
        kernel::hil::uart::Transmit::set_transmit_client(test_uart, contract);
        contract.run();
    }

    // The `hil::spi` conformance test, on SPI0. The six guarantees audited on
    // 2026-09-13 each found a divergence, so a driver passing is worth
    // knowing rather than assumed. Unlike the uart one this cannot be gated:
    // no emulated board in the tree exposes SPI.
    //
    // GP4 MISO, GP5 CSn, GP6 SCK, GP7 MOSI -- the wiring the rp2350-spi-bench
    // harness used. With `spi_contract_test_loopback`, MOSI is expected to be
    // jumpered to MISO; without the wire MISO floats, and only the clause
    // that compares the bytes read back fails.
    #[cfg(feature = "spi_contract_test")]
    {
        use capsules_core::test::spi_contract::TestSpiContract;
        use kernel::hil::spi::SpiMaster;
        use kernel::hil::spi::cs::{ActiveLow, IntoChipSelect};

        let spi_miso = peripherals.pins.get_pin(RPGpio::GPIO4);
        let spi_csn = peripherals.pins.get_pin(RPGpio::GPIO5);
        let spi_clk = peripherals.pins.get_pin(RPGpio::GPIO6);
        let spi_mosi = peripherals.pins.get_pin(RPGpio::GPIO7);
        spi_miso.set_function(GpioFunction::SPI);
        // Software chip select: the driver drives this through SIO, not the
        // PL022's own CS.
        spi_csn.make_output();
        spi_clk.set_function(GpioFunction::SPI);
        spi_mosi.set_function(GpioFunction::SPI);

        let test_spi = &peripherals.spi0;
        let _ = test_spi.init();
        let _ = test_spi.specify_chip_select(IntoChipSelect::<_, ActiveLow>::into_cs(spi_csn));
        let _ = test_spi.set_rate(1_000_000);

        let spi_write = static_init!([u8; 8], [0; 8]);
        let spi_read = static_init!([u8; 8], [0; 8]);
        let spi_spare = static_init!([u8; 8], [0; 8]);

        #[cfg(not(feature = "spi_contract_test_loopback"))]
        let spi_contract = static_init!(
            TestSpiContract<rp2350::spi::Spi>,
            TestSpiContract::new(test_spi, spi_write, spi_read, spi_spare)
        );
        #[cfg(feature = "spi_contract_test_loopback")]
        let spi_contract = static_init!(
            TestSpiContract<rp2350::spi::Spi>,
            TestSpiContract::new_loopback(test_spi, spi_write, spi_read, spi_spare)
        );

        SpiMaster::set_client(test_spi, spi_contract);
        spi_contract.run();
    }

    // The `hil::gpio` conformance test, on GP20 (output) and GP21 (input),
    // which the bench has wired together. The return-value guarantees were
    // audited by reading on 2026-09-13 and found clean across all sixteen
    // implementations -- plausibly because GPIO is the most exercised HIL in
    // the tree. What reading cannot check is whether the pin did the thing,
    // and that is what the wire is for.
    #[cfg(feature = "gpio_contract_test")]
    {
        use capsules_core::test::gpio_contract::TestGpioContract;
        use kernel::hil::gpio::Interrupt;

        let out_pin = peripherals.pins.get_pin(RPGpio::GPIO20);
        let in_pin = peripherals.pins.get_pin(RPGpio::GPIO21);

        let gpio_contract = static_init!(
            TestGpioContract<RPGpioPin, RPGpioPin>,
            TestGpioContract::new(out_pin, in_pin)
        );
        Interrupt::set_client(in_pin, gpio_contract);
        gpio_contract.run();
    }

    // The `hil::i2c` conformance test. Every clause it runs is a rejection
    // the driver must make before the buffer reaches the hardware, so it
    // needs no I2C device, no pull-ups and no pads muxed -- which is what
    // makes it runnable here at all, and is why it does not collide with the
    // uart, spi or gpio tests over pins. The clauses that need a bus are
    // named in the test's own module documentation as what it cannot check.
    //
    // `check_uninitialized` runs FIRST, deliberately: it is the clause about
    // a controller that has not been brought up, and `init` below brings this
    // one up.
    #[cfg(feature = "i2c_contract_test")]
    {
        use capsules_core::test::i2c_contract::TestI2cContract;

        let i2c_buffer = static_init!([u8; 8], [0; 8]);
        let i2c_contract = static_init!(
            TestI2cContract<rp2350::i2c::I2c>,
            TestI2cContract::new(&peripherals.i2c0, i2c_buffer)
        );
        i2c_contract.check_uninitialized();
        peripherals.i2c0.init(100_000);
        i2c_contract.run();
    }

    // PROCESS CONSOLE
    let process_printer = components::process_printer::ProcessPrinterTextComponent::new()
        .finalize(components::process_printer_text_component_static!());
    PANIC_RESOURCES.get().map(|resources| {
        resources.printer.put(process_printer);
    });

    kernel::create_typed_capability!(process_console_cap, ProcessConsoleCap:
        kernel::capabilities::ProcessManagementCapability,
        kernel::capabilities::ProcessStartCapability
    );
    let process_console = components::process_console::ProcessConsoleComponent::new(
        board_kernel,
        uart_mux,
        mux_alarm,
        process_printer,
        Some(cortexm33::support::reset),
        process_console_cap,
    )
    .finalize(components::process_console_component_static!(
        RPTimer,
        ProcessConsoleCap
    ));
    let _ = process_console.start();

    let scheduler = components::sched::round_robin::RoundRobinComponent::new(processes)
        .finalize(components::round_robin_component_static!(NUM_PROCS));

    // The breadboard kit's TFT, on SPI0.
    //
    // GP2 SCLK, GP3 MOSI, GP5 CS, GP6 DC, GP7 RST -- the kit's silkscreen, and
    // each label lands on the matching SPI0 function. GP4 is the panel's MISO
    // and is deliberately left alone: the kit does not wire the controller's
    // output through, which is why the part cannot be identified over this bus
    // and why the variant's name is a choice rather than a measurement.
    //
    // Feature-gated because a bare Pico 2 or Pico 2 W has nothing on those
    // pins. MUTUALLY EXCLUSIVE with `spi_contract_test`, which puts SPI0 on
    // GP4-GP7 and would fight this over DC and RST.
    //
    // KNOWN HAZARD, not fixed: GP2, GP3, GP5, GP6 and GP7 stay in the board's
    // userspace GPIO array even with this feature on, so an app can drive the
    // capsule's DC and RST from under it, or mux the SPI pins back to SIO. The
    // kit's own raw-SPI apps do exactly that -- it is how the panel was
    // brought up before this existed -- so the two paths can run on one kernel
    // and fight.
    //
    // The array is built by `components::gpio_component_helper!` in each board
    // crate, and the macro does not accept `#[cfg]` on its arms: gating the
    // five pins means two whole invocations differing by five lines, in two
    // crates, which is a worse thing to maintain than this comment. A pin
    // array that can exclude a set belongs in the component, and that is a
    // change to a macro every board shares.
    //
    // 62.5 MHz, the PL022's maximum, and measured rather than chosen.
    //
    // This was 31.25 for a while, because above it nothing improved: 62.5 gave
    // the same time to the millisecond, and so did quadrupling the write
    // buffer. That cap has since been found and removed. It was the FIFO --
    // eight entries, so a FIFO-fed write costs an interrupt dispatch every
    // eight bytes, and that cost does not shrink when the clock rises. With
    // SPI0 on a DMA channel the clock matters again: 128,000 bytes take 34 ms
    // here against 57 at 31.25, which is 3.73 MB/s against 2.21.
    //
    // The old comment here reasoned that "a clock that cannot be seen to help
    // is not worth the risk". That was sound while the cap was unexplained and
    // is simply false now.
    //
    // The part is still unidentified and an ILI9486 would be out of spec well
    // below here, so this rests on observation rather than a datasheet: the
    // panel was read at 62.5 MHz and shows the same picture it did at 31.25 --
    // no tearing, no speckle, no wrong colours. If a future panel of this kit
    // misbehaves, this line is the first thing to halve.
    //
    // 125 MHz / (2 * 1) lands exactly, with no rounding.
    // Give SPI0 a DMA channel for bulk writes.
    //
    // Without this the panel caps at about 2.21 MB/s and stops improving
    // above roughly 31 MHz: the PL022's FIFO is eight entries, so every
    // eight bytes costs an interrupt dispatch, and that cost does not
    // shrink when the clock rises. Measured four ways -- 7.8, 15.6, 31.25
    // and 62.5 MHz -- and the last two are identical to the millisecond
    // while the divider registers differ, which is what says the clock is
    // not the limit.
    //
    // Channel 1, because the Pico 2 W's radio takes channel 0 in its own
    // main.rs and this block is shared by both boards.
    use rp2350::dma::PeripheralDma;
    let spi_dma = static_init!(
        rp2350::dma::DmaChannel<'static>,
        peripherals.dma.channel(rp2350::dma::Channel::Ch1)
    );
    spi_dma.enable_interrupt(rp2350::dma::Irq::Irq0);
    spi_dma.set_dma_client(&peripherals.spi0);
    peripherals
        .spi0
        .set_dma(spi_dma, rp2350::dma::DmaPacer::Spi0Tx);

    #[cfg(feature = "kit_display")]
    let tft = {
        use kernel::hil::spi::cs::{ActiveLow, IntoChipSelect};

        let spi_clk = peripherals.pins.get_pin(RPGpio::GPIO2);
        let spi_mosi = peripherals.pins.get_pin(RPGpio::GPIO3);
        let spi_cs = peripherals.pins.get_pin(RPGpio::GPIO5);
        spi_clk.set_function(GpioFunction::SPI);
        spi_mosi.set_function(GpioFunction::SPI);
        // Software chip select, as the SPI conformance test does: the panel
        // needs CS held across a command and its parameters together, which
        // the PL022's own chip select does not promise.
        spi_cs.make_output();

        let mux_spi = components::spi::SpiMuxComponent::new(&peripherals.spi0)
            .finalize(components::spi_mux_component_static!(rp2350::spi::Spi));

        let bus = components::bus::SpiMasterBusComponent::new(
            mux_spi,
            IntoChipSelect::<_, ActiveLow>::into_cs(spi_cs),
            62_500_000,
            kernel::hil::spi::ClockPhase::SampleLeading,
            kernel::hil::spi::ClockPolarity::IdleLow,
        )
        .finalize(components::spi_bus_component_static!(rp2350::spi::Spi));

        let tft = components::st77xx::ST77XXComponent::new(
            mux_alarm,
            bus,
            Some(peripherals.pins.get_pin(RPGpio::GPIO6)),
            Some(peripherals.pins.get_pin(RPGpio::GPIO7)),
            &capsules_extra::st77xx::ST7796,
        )
        .finalize(components::st77xx_component_static!(
            // bus type
            capsules_extra::bus::SpiMasterBus<
                'static,
                capsules_core::virtualizers::virtual_spi::VirtualSpiMasterDevice<
                    'static,
                    rp2350::spi::Spi<'static>,
                >,
            >,
            // timer type
            RPTimer,
            // pin type
            RPGpioPin,
        ));

        let _ = tft.init();
        tft
    };

    #[cfg(feature = "kit_display")]
    let screen = components::screen::ScreenComponent::new(
        board_kernel,
        capsules_extra::screen::screen::DRIVER_NUM,
        tft,
        Some(tft),
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    // Sized to the largest single write any app on this board makes, which is
    // one band of Doom's frame: 320 x 10 pixels at RGB565. It was 57,600,
    // chosen before anything drew, and that is 44,800 bytes of KERNEL RAM --
    // RAM the app cannot have, on a board where Doom fits or does not by less
    // than that. An app that writes more than this in one call gets an error,
    // not a truncated picture.
    .finalize(components::screen_component_static!(12800));

    // Fill the panel from the kernel and report how fast it managed it.
    //
    // This TAKES THE CLIENT BACK from the screen syscall driver built just
    // above, so a build with this feature drives the panel from the kernel and
    // userspace sees nothing. That is the point: it is the only way to tell a
    // panel that came up from a driver that merely returned `Ok(())`, and the
    // rate it reports is what decides what can be built on the display.
    #[cfg(feature = "kit_display_test")]
    {
        use capsules_extra::test::screen_fill::TestScreenFill;

        let fill_buffer = static_init!([u8; 4096], [0; 4096]);
        let fill = static_init!(
            TestScreenFill<
                capsules_extra::st77xx::ST77XX<
                    'static,
                    VirtualMuxAlarm<'static, RPTimer<'static>>,
                    capsules_extra::bus::SpiMasterBus<
                        'static,
                        capsules_core::virtualizers::virtual_spi::VirtualSpiMasterDevice<
                            'static,
                            rp2350::spi::Spi<'static>,
                        >,
                    >,
                    RPGpioPin<'static>,
                >,
                RPTimer<'static>,
            >,
            TestScreenFill::new(tft, &peripherals.timer0, fill_buffer)
        );
        // No `run()` here: `init` above is asynchronous and the driver calls
        // `screen_is_ready` when it has finished, which is where the test
        // starts itself.
        kernel::hil::screen::Screen::set_client(tft, fill);
    }

    // The kit's two buttons, GP14 and GP15, both active-low with pull-ups:
    // resting HIGH and pulled to ground when held. That was measured on this
    // board, not read off the silkscreen -- holding each one takes its pin
    // low, and a resting button is indistinguishable from any unconnected pin,
    // so it has to be held to be seen.
    //
    // Two buttons is what the hardware has. The kit's other input is the
    // joystick on GP26/GP27, which is an ADC pair rather than a button and is
    // a separate driver.
    //
    // KNOWN HAZARD, the same one `kit_display` carries above: GP14 and GP15
    // stay in the userspace GPIO array with this feature on, so an app can
    // reconfigure a pin out from under the button capsule -- drive it as an
    // output, or change its pull. Both hazards have one fix, a pin array that
    // can exclude a set, and it belongs in the shared GPIO component.
    #[cfg(feature = "kit_input")]
    let buttons = components::button::ButtonComponent::new(
        board_kernel,
        capsules_core::button::DRIVER_NUM,
        components::button_component_helper!(
            RPGpioPin<'static>,
            (
                peripherals.pins.get_pin(RPGpio::GPIO14),
                kernel::hil::gpio::ActivationMode::ActiveLow,
                kernel::hil::gpio::FloatingState::PullUp
            ),
            (
                peripherals.pins.get_pin(RPGpio::GPIO15),
                kernel::hil::gpio::ActivationMode::ActiveLow,
                kernel::hil::gpio::FloatingState::PullUp
            )
        ),
        create_capability!(capabilities::MemoryAllocationCapability),
    )
    .finalize(components::button_component_static!(RPGpioPin<'static>));

    // THE JOYSTICK, which is the other half of the kit's input: two analogue
    // axes on GP26 and GP27, and no click button (GP11 was checked and is not
    // one). Two buttons alone cannot play anything that needs to move and
    // turn, which is what this is for.
    //
    // The pads have to leave digital mode before the converter can use them,
    // and the ADC driver is the wrong place for it -- a pad belongs to GPIO.
    // Reset for PADS_BANK0 is 0x116 (RP2350 datasheet 9.11, table 853): ISO
    // set, PDE set, SCHMITT set, DRIVE 4mA, IE clear. The pull-down is the one
    // that matters: across an analogue source it is the lower leg of a
    // divider, so the reading stays plausible while never reaching either
    // rail -- the failure that gets diagnosed as a bad sensor rather than as a
    // pad.
    //
    // The order is the one the C SDK's `adc_gpio_init` uses and each step is
    // load-bearing: `set_function` clears ISO and points no digital peripheral
    // at the pin, `PullNone` clears PDE, `deactivate_pads` clears IE and sets
    // OD. Drop any one and the pad still reads, just wrongly.
    //
    // Channel 2 (GP28) is wired here because the pad work is identical and
    // the kit leaves it free. Channel 3 is NOT: it is GP29, the CYW43439's
    // gSPI clock on the W board, and sampling it would take the pad off the
    // radio. The temperature sensor on channel 4 needs the chip's own
    // calibration constants, which is a separate claim to check.
    //
    // SAME HAZARD as the buttons and the display above: GP26-GP28 stay in the
    // userspace GPIO array, so an app can drive one as an output while another
    // samples it -- a short through the pad driver that neither driver can see
    // to refuse. One fix for all three: a pin array that can exclude a set.
    #[cfg(feature = "kit_input")]
    let adc = {
        use kernel::hil::gpio::Configure;

        for pin in [RPGpio::GPIO26, RPGpio::GPIO27, RPGpio::GPIO28] {
            let pin = peripherals.pins.get_pin(pin);
            pin.set_function(rp2350::gpio::GpioFunction::NULL);
            pin.set_floating_state(kernel::hil::gpio::FloatingState::PullNone);
            pin.deactivate_pads();
        }

        peripherals.adc.init();

        // The block's own interrupt enable is not enough: without this, a
        // conversion that is the only thing left to wake the kernel never
        // does. See
        // `rp2350::adc::enable_nvic`. Safe here because `ChipHw::init()`, which
        // disables every line, has already run far above.
        rp2350::adc::enable_nvic();

        let adc_mux = components::adc::AdcMuxComponent::new(&peripherals.adc)
            .finalize(components::adc_mux_component_static!(rp2350::adc::Adc));

        let adc_0 = components::adc::AdcComponent::new(adc_mux, rp2350::adc::Channel::Channel0)
            .finalize(components::adc_component_static!(rp2350::adc::Adc));
        let adc_1 = components::adc::AdcComponent::new(adc_mux, rp2350::adc::Channel::Channel1)
            .finalize(components::adc_component_static!(rp2350::adc::Adc));
        let adc_2 = components::adc::AdcComponent::new(adc_mux, rp2350::adc::Channel::Channel2)
            .finalize(components::adc_component_static!(rp2350::adc::Adc));

        components::adc::AdcVirtualComponent::new(
            board_kernel,
            capsules_core::adc::DRIVER_NUM,
            create_capability!(capabilities::MemoryAllocationCapability),
        )
        .finalize(components::adc_syscall_component_helper!(adc_0, adc_1, adc_2))
    };

    let platform = Platform {
        ipc: kernel::ipc::IPC::new(
            board_kernel,
            kernel::ipc::DRIVER_NUM,
            &memory_allocation_capability,
        ),
        console,
        alarm,
        gpio,
        #[cfg(feature = "kit_display")]
        screen,
        #[cfg(feature = "kit_input")]
        buttons,
        #[cfg(feature = "kit_input")]
        adc,
        scheduler,
        systick: cortexm33::systick::SysTick::new_with_calibration(125_000_000),
    };

    (board_kernel, platform, peripherals, mux_alarm, chip)
}
