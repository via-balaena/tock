// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Watchdog timer on the RP2350.
//!
//! The kernel loop already knows how to drive one. `kernel_loop` calls
//! `setup` once, `tickle` on every pass, and `suspend`/`resume` either side of
//! sleeping -- so a board that names a `WatchDog` type gets a chip-level reset
//! whenever the loop stops going round, with no application code involved.
//! Until this existed, `raspberry_pi_pico_2` named `()` and every one of those
//! calls went nowhere.
//!
//! # What differs from the RP2040
//!
//! Close enough to look like a port and different in two ways that matter:
//!
//! * **The tick is not here.** The RP2040 watchdog owns a `TICK` register and
//!   starting the watchdog is enough. On this chip the tick generators moved
//!   into the `TICKS` block, and the watchdog's has to be started separately
//!   -- see [`crate::ticks::Ticks::set_watchdog_generator`]. Miss it and the
//!   watchdog is enabled, never counts down, and never fires: the worst of
//!   both, because it looks configured.
//! * **One tick is one microsecond, not half of one.** The RP2040's counter
//!   decrements twice per microsecond, which is why its `LOAD` tops out near
//!   8.3 seconds. Here the same 24 bits are "approximately 16 seconds" and
//!   `CTRL.TIME` is documented in usec, so the RP2040's factor of two would
//!   halve every period asked for.
//!
//! # What it resets
//!
//! Nothing, unless told. `PSM_WDSEL` selects which subsystems a watchdog event
//! resets and resets to zero, so an enabled watchdog with an untouched
//! `WDSEL` fires into the void. [`Watchdog::start`] sets every bit except
//! `ROSC` and `XOSC`, matching the SDK: the oscillators are left running
//! because restarting them is slow and they are not what hung.
//!
//! # Debug
//!
//! `PAUSE_DBG0`, `PAUSE_DBG1` and `PAUSE_JTAG` reset to one and are left that
//! way, so halting a core over SWD does not reset the board underneath the
//! debugger.

use kernel::mmio;
use kernel::utilities::StaticRef;
use kernel::utilities::registers::interfaces::{ReadWriteable, Readable, Writeable};
use kernel::utilities::registers::{ReadOnly, ReadWrite, register_bitfields, register_structs};

/// How long the kernel loop may go round without tickling before the chip is
/// reset.
///
/// A second is far longer than a pass through the loop -- `tickle` runs at
/// least once per process timeslice -- and is chosen to be safe rather than
/// tight: too short a period resets a board that is merely busy, which is a
/// worse failure than a late reset. A board wanting tighter, such as one
/// driving a motor, can call [`Watchdog::start`] with its own figure instead
/// of taking this default.
pub const DEFAULT_PERIOD_US: u32 = 1_000_000;

/// The widest `LOAD` will take, about 16.7 seconds.
const MAX_LOAD_US: u32 = 0x00FF_FFFF;

register_structs! {
    WatchdogRegisters {
        (0x00 => ctrl: ReadWrite<u32, CTRL::Register>),
        (0x04 => load: ReadWrite<u32, LOAD::Register>),
        (0x08 => reason: ReadOnly<u32, REASON::Register>),
        (0x0c => scratch: [ReadWrite<u32>; 8]),
        (0x2c => @END),
    }
}

register_structs! {
    /// Only `WDSEL`. The power-on state machine is a larger block; this models
    /// the one register the watchdog needs and nothing else, and belongs in a
    /// `psm` module of its own the moment anything else wants PSM.
    PsmRegisters {
        (0x00 => _reserved_frce_on_and_off),
        (0x08 => wdsel: ReadWrite<u32>),
        (0x0c => @END),
    }
}

register_bitfields![u32,
    CTRL [
        /// Trigger a watchdog reset. Self clearing.
        TRIGGER OFFSET(31) NUMBITS(1) [],
        /// When clear the counter is paused rather than reset.
        ENABLE OFFSET(30) NUMBITS(1) [],
        PAUSE_DBG1 OFFSET(26) NUMBITS(1) [],
        PAUSE_DBG0 OFFSET(25) NUMBITS(1) [],
        PAUSE_JTAG OFFSET(24) NUMBITS(1) [],
        /// Microseconds remaining before the reset. Read only.
        TIME OFFSET(0) NUMBITS(24) []
    ],
    LOAD [
        LOAD OFFSET(0) NUMBITS(24) []
    ],
    REASON [
        FORCE OFFSET(1) NUMBITS(1) [],
        TIMER OFFSET(0) NUMBITS(1) []
    ]
];

mmio! {
    safety: "RP2350 datasheet address map, 12.9 for the watchdog and Table 532 for PSM WDSEL";

    WATCHDOG_BASE: WatchdogRegisters = 0x400D8000,
    PSM_BASE: PsmRegisters = 0x40018000,
}

/// Every `WDSEL` subsystem except the two oscillators.
///
/// Bits 0 to 24 are defined; 2 is `ROSC` and 3 is `XOSC`.
const WDSEL_ALL_BUT_OSCILLATORS: u32 = 0x01FF_FFFF & !((1 << 2) | (1 << 3));

pub struct Watchdog {
    registers: StaticRef<WatchdogRegisters>,
    psm: StaticRef<PsmRegisters>,
}

impl Watchdog {
    pub fn new() -> Self {
        Self {
            registers: WATCHDOG_BASE,
            psm: PSM_BASE,
        }
    }

    /// Enable the watchdog with a period in microseconds.
    ///
    /// The caller must have started the watchdog tick first, with
    /// [`crate::ticks::Ticks::set_watchdog_generator`]. This cannot do it:
    /// the tick lives in another block, which is exactly the trap the module
    /// documentation opens with.
    pub fn start(&self, period_us: u32) {
        // Disabled while `LOAD` is set, so the counter cannot fire on a
        // half-written period.
        self.registers.ctrl.modify(CTRL::ENABLE::CLEAR);

        // Choose what a timeout resets, which defaults to nothing at all.
        self.psm.wdsel.set(WDSEL_ALL_BUT_OSCILLATORS);

        self.registers
            .load
            .write(LOAD::LOAD.val(period_us.min(MAX_LOAD_US)));
        self.registers.ctrl.modify(CTRL::ENABLE::SET);
    }

    /// Reload the counter. Cheap enough for every pass of the kernel loop:
    /// one store.
    pub fn feed(&self, period_us: u32) {
        self.registers
            .load
            .write(LOAD::LOAD.val(period_us.min(MAX_LOAD_US)));
    }

    /// Pause the counter. It holds its value rather than resetting.
    pub fn stop(&self) {
        self.registers.ctrl.modify(CTRL::ENABLE::CLEAR);
    }

    /// Did the last reset come from the watchdog?
    ///
    /// Survives the reset itself, so a board can tell a watchdog restart from
    /// a power-on -- which is the difference between "something hung" and
    /// "someone plugged it in".
    pub fn caused_last_reset(&self) -> bool {
        self.registers.reason.is_set(REASON::TIMER)
    }

    /// Microseconds left before the watchdog fires.
    pub fn time_remaining_us(&self) -> u32 {
        self.registers.ctrl.read(CTRL::TIME)
    }

    /// Reset the chip now, by asking the watchdog to fire.
    pub fn trigger_reset(&self) -> ! {
        self.psm.wdsel.set(WDSEL_ALL_BUT_OSCILLATORS);
        self.registers.ctrl.modify(CTRL::TRIGGER::SET);
        // The reset is a few cycles away. Spin rather than `wfi`, which needs
        // `unsafe` and is not allowed in `chips/`.
        loop {
            core::hint::spin_loop();
        }
    }
}

impl Default for Watchdog {
    fn default() -> Self {
        Self::new()
    }
}

impl kernel::platform::watchdog::WatchDog for Watchdog {
    fn setup(&self) {
        self.start(DEFAULT_PERIOD_US);
    }

    fn tickle(&self) {
        self.feed(DEFAULT_PERIOD_US);
    }

    fn suspend(&self) {
        // Called before `wfi`. A kernel with nothing to do is not a kernel
        // that has hung, and it may legitimately sleep for far longer than
        // the period.
        self.stop();
    }

    fn resume(&self) {
        // NOT the default implementation, which only calls `tickle`. `suspend`
        // cleared `ENABLE` above, and reloading `LOAD` does not set it again,
        // so taking the default here would leave the watchdog off for good
        // after the first time the board slept.
        self.start(DEFAULT_PERIOD_US);
    }
}
