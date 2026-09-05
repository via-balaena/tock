// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Driver for a four-phase unipolar stepper motor.
//!
//! Four output pins, driven in sequence, of the kind a 28BYJ-48 and a ULN2003
//! board present. The capsule owns the stepping: an application asks for a
//! number of steps at an interval and the sequence is advanced from this
//! capsule's own alarm, rather than the application toggling pins itself.
//!
//! That division is deliberate and is the reason this exists rather than
//! applications using [`crate::gpio`](../../capsules_core/gpio/index.html)
//! directly. A coil left energised draws current and heats the motor, and
//! nothing releases a GPIO pin when the process that set it dies — the GPIO
//! driver is documented as exporting "hardware-like" control and correctly has
//! no ownership model to unwind. A motor is not a pin, and the policy that a
//! dead owner's coils must be de-energised is device knowledge, so it belongs
//! in the kernel where it can be enforced rather than in an application where
//! it can only be intended.
//!
//! Because the capsule steps from its own alarm, it already has a periodic
//! callback, and the liveness check costs nothing extra: on every step the
//! owner's grant is entered, and a grant that reports the process is gone
//! de-energises the coils and stops. The worst case is one step interval of
//! energised coil rather than an indefinite one.
//!
//! Usage
//! -----
//!
//! ```rust,ignore
//! let stepper = static_init!(
//!     capsules_extra::stepper::Stepper<'static, VirtualMuxAlarm<'static, A>>,
//!     capsules_extra::stepper::Stepper::new(
//!         [pin_a, pin_b, pin_c, pin_d],
//!         virtual_alarm,
//!         board_kernel.create_grant(DRIVER_NUM, &grant_cap),
//!     )
//! );
//! virtual_alarm.set_alarm_client(stepper);
//! ```
//!
//! The four pins are the phase windings in order. Which physical pins those
//! are is a board decision, as with LEDs and buttons; an application never
//! names a pin. They are configured as outputs and driven low when the capsule
//! is constructed, so a board does not have to remember to do it.

use core::cell::Cell;

use kernel::grant::{AllowRoCount, AllowRwCount, Grant, UpcallCount};
use kernel::hil::gpio::Pin;
use kernel::hil::time::{Alarm, AlarmClient, ConvertTicks};
use kernel::syscall::{CommandReturn, SyscallDriver};
use kernel::utilities::cells::OptionalCell;
use kernel::{ErrorCode, ProcessId};

/// Syscall driver number.
use capsules_core::driver;
pub const DRIVER_NUM: usize = driver::NUM::Stepper as usize;

/// Number of phase windings.
const PHASES: usize = 4;

/// Half-step sequence, one row per state, one column per winding.
///
/// Half-stepping rather than full-stepping because it is what reference
/// drivers for these motors use and it runs more smoothly; a caller that
/// wants full steps takes two steps. One `step` advances this table by one
/// row, so a 28BYJ-48 with its 64:1 gearbox takes 4096 steps per revolution.
#[rustfmt::skip]
const SEQUENCE: [[bool; PHASES]; 8] = [
    [true,  false, false, false],
    [true,  true,  false, false],
    [false, true,  false, false],
    [false, true,  true,  false],
    [false, false, true,  false],
    [false, false, true,  true ],
    [false, false, false, true ],
    [true,  false, false, true ],
];

/// Per-process state, of which there is none.
///
/// Everything about a run lives in the capsule, because only one process may
/// be stepping at a time. The grant exists so that the owner's liveness can be
/// checked and its upcall delivered.
#[derive(Default)]
pub struct App {}

#[derive(Clone, Copy, PartialEq)]
enum Direction {
    Forward,
    Reverse,
}

pub struct Stepper<'a, A: Alarm<'a>> {
    pins: [&'a dyn Pin; PHASES],
    alarm: &'a A,
    apps: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,

    /// The process currently stepping, if any. Validated by entering its
    /// grant rather than by comparing identifiers: a restarted process is
    /// given a new identifier specifically so that stale ones do not match,
    /// so equality can only tell you that something has changed, never that
    /// the owner is still alive.
    owner: OptionalCell<ProcessId>,
    /// Index into `SEQUENCE`.
    phase: Cell<usize>,
    steps_remaining: Cell<usize>,
    steps_taken: Cell<usize>,
    direction: Cell<Direction>,
    interval_us: Cell<u32>,
}

impl<'a, A: Alarm<'a>> Stepper<'a, A> {
    pub fn new(
        pins: [&'a dyn Pin; PHASES],
        alarm: &'a A,
        grant: Grant<App, UpcallCount<1>, AllowRoCount<0>, AllowRwCount<0>>,
    ) -> Self {
        for pin in pins.iter() {
            pin.make_output();
            pin.clear();
        }
        Self {
            pins,
            alarm,
            apps: grant,
            owner: OptionalCell::empty(),
            phase: Cell::new(0),
            steps_remaining: Cell::new(0),
            steps_taken: Cell::new(0),
            direction: Cell::new(Direction::Forward),
            interval_us: Cell::new(0),
        }
    }

    /// Drive every winding low.
    ///
    /// Called on completion, on `stop`, and when the owner is found to be
    /// gone. Leaving a winding high is what heats the motor, so this is the
    /// only state the capsule ever leaves the pins in once a run has ended.
    fn deenergise(&self) {
        for pin in self.pins.iter() {
            pin.clear();
        }
    }

    fn write_phase(&self) {
        let row = &SEQUENCE[self.phase.get()];
        for (pin, on) in self.pins.iter().zip(row.iter()) {
            if *on {
                pin.set();
            } else {
                pin.clear();
            }
        }
    }

    fn advance_phase(&self) {
        let next = match self.direction.get() {
            Direction::Forward => (self.phase.get() + 1) % SEQUENCE.len(),
            Direction::Reverse => (self.phase.get() + SEQUENCE.len() - 1) % SEQUENCE.len(),
        };
        self.phase.set(next);
    }

    /// Stop stepping, release the pins and forget the owner.
    fn release(&self) {
        let _ = self.alarm.disarm();
        self.deenergise();
        self.owner.clear();
        self.steps_remaining.set(0);
    }

    /// Is the recorded owner still alive?
    ///
    /// Entering the grant is the check: `NoSuchApp` and `InactiveApp` are how
    /// the kernel reports that the process behind an identifier is gone. This
    /// is the same idiom `capsules_core::adc` uses, reached here from a timer
    /// rather than from a peripheral callback, because a stepper's periodic
    /// alarm is inherent to the device rather than added to poll for this.
    fn owner_is_live(&self) -> bool {
        self.owner.map_or(false, |owner| {
            !matches!(
                self.apps.enter(owner, |_, _| {}),
                Err(kernel::process::Error::NoSuchApp) | Err(kernel::process::Error::InactiveApp)
            )
        })
    }

    fn arm(&self) {
        let interval = self.alarm.ticks_from_us(self.interval_us.get());
        self.alarm.set_alarm(self.alarm.now(), interval);
    }

    fn start(
        &self,
        processid: ProcessId,
        direction: Direction,
        steps: usize,
        interval_us: u32,
    ) -> Result<(), ErrorCode> {
        if steps == 0 || interval_us == 0 {
            return Err(ErrorCode::INVAL);
        }

        // A motor already running for a live process belongs to that process,
        // including when that process is this one: an owner wanting to change
        // direction or distance stops first, which reports how far the old
        // movement got. Replacing a run in place would either lose that count
        // or deliver two completions for one subscription.
        //
        // A motor whose owner has died is free, and reclaiming it here is the
        // other half of the check in `alarm` -- that one covers an owner dying
        // mid-run, this one covers a process arriving to find a motor held by
        // an owner that is already gone.
        if self.owner.is_some() {
            if self.owner_is_live() {
                return Err(ErrorCode::BUSY);
            }
            self.release();
        }

        self.owner.set(processid);
        self.direction.set(direction);
        self.steps_remaining.set(steps);
        self.steps_taken.set(0);
        self.interval_us.set(interval_us);
        self.arm();
        Ok(())
    }

    fn finish(&self) {
        let taken = self.steps_taken.get();
        let owner = self.owner.take();
        let _ = self.alarm.disarm();
        self.deenergise();
        self.steps_remaining.set(0);

        if let Some(owner) = owner {
            let _ = self.apps.enter(owner, |_, upcalls| {
                let _ = upcalls
                    .schedule_upcall(0, (kernel::errorcode::into_statuscode(Ok(())), taken, 0));
            });
        }
    }
}

impl<'a, A: Alarm<'a>> AlarmClient for Stepper<'a, A> {
    fn alarm(&self) {
        // Before anything else, and before the phase advances: a process that
        // is gone does not get one more step.
        if !self.owner_is_live() {
            self.release();
            return;
        }

        self.advance_phase();
        self.write_phase();
        self.steps_taken.set(self.steps_taken.get() + 1);

        let remaining = self.steps_remaining.get().saturating_sub(1);
        self.steps_remaining.set(remaining);

        if remaining == 0 {
            self.finish();
        } else {
            self.arm();
        }
    }
}

impl<'a, A: Alarm<'a>> SyscallDriver for Stepper<'a, A> {
    /// Drive a four-phase stepper motor.
    ///
    /// ### `command_num`
    ///
    /// - `0`: Driver existence check.
    /// - `1`: Step forward. `arg1` is the number of steps, `arg2` the interval
    ///   between them in microseconds. Returns `BUSY` if a run is already in
    ///   progress for a live process — including this one, since a step
    ///   command never replaces a movement — and `INVAL` for a zero count or
    ///   interval.
    /// - `2`: Step in reverse, otherwise as command 1.
    /// - `3`: Stop. De-energises the windings and releases the motor, and
    ///   delivers the completion upcall with the steps taken so far: the count
    ///   is how an open-loop caller knows where the motor ended up. Returns
    ///   `RESERVE` if the caller does not own the motor.
    fn command(
        &self,
        command_num: usize,
        arg1: usize,
        arg2: usize,
        processid: ProcessId,
    ) -> CommandReturn {
        match command_num {
            0 => CommandReturn::success(),

            1 | 2 => {
                let direction = if command_num == 1 {
                    Direction::Forward
                } else {
                    Direction::Reverse
                };
                let interval = match u32::try_from(arg2) {
                    Ok(interval) => interval,
                    Err(_) => return CommandReturn::failure(ErrorCode::INVAL),
                };
                match self.start(processid, direction, arg1, interval) {
                    Ok(()) => CommandReturn::success(),
                    Err(e) => CommandReturn::failure(e),
                }
            }

            3 => {
                // A stopped run still reports, because the step count is how
                // an open-loop caller knows where the motor ended up. Ending
                // the run silently would discard that at precisely the moment
                // it matters.
                if !self.owner.contains(&processid) {
                    // Not a no-op with a success return. The case that matters
                    // is not a dead owner -- the liveness check covers that --
                    // but a live one that has stopped making progress. A
                    // supervisor trying to intervene has to be able to tell
                    // that the motor did not stop, and a silent success is the
                    // wrong answer from the one command whose whole purpose is
                    // making something stop.
                    return CommandReturn::failure(ErrorCode::RESERVE);
                }
                self.finish();
                CommandReturn::success()
            }

            _ => CommandReturn::failure(ErrorCode::NOSUPPORT),
        }
    }

    fn allocate_grant(&self, processid: ProcessId) -> Result<(), kernel::process::Error> {
        self.apps.enter(processid, |_, _| {})
    }
}
