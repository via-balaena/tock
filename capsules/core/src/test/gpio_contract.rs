// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Check a `hil::gpio` pin pair against the behaviour the HIL documents.
//!
//! The third of these, after `uart_contract` and `spi_contract`, and the one
//! whose guarantees are almost entirely BEHAVIOURAL rather than return codes:
//! `hil::gpio` documents what a pin does, not what it answers.
//!
//! An audit on 2026-09-13 read the return-value guarantees across all sixteen
//! `Configure` implementations and found **no divergence** -- every
//! `make_output`/`make_input` answers a permitted `Configuration`, and every
//! `toggle` returns the new value rather than the old. That is a real result
//! and plausibly explained: GPIO is the most exercised HIL in the tree, since
//! every board drives an LED or reads a button. What it does NOT cover is
//! whether the pin actually did the thing, which is what this runs.
//!
//! **Needs two pins wired together**, an output and an input. Without the
//! wire the input floats and the round-trip clauses report nonsense rather
//! than hanging, so the caller has to say the wire is there.
//!
//! The clauses:
//!
//! 1. `make_output()` answers `Output` or `InputOutput`, and `configuration()`
//!    then agrees.
//! 2. `make_input()` answers `Input` or `InputOutput`, and `configuration()`
//!    then agrees.
//! 3. `set()` on the output is read as high on the input, and `clear()` low.
//!    The wire is what makes this a check of the pin rather than of a
//!    register write.
//! 4. `toggle()` returns the new value AND the wire follows it.
//! 5. A rising edge makes a rising-edge interrupt pending. On rp2350 and
//!    rp2040 this could never have passed before today: `is_pending()` ANDed
//!    four distinct single-bit masks together, which is unconditionally zero,
//!    so it always answered false.
//!
//! Both are read through `is_pending()` rather than by waiting for `fired()`,
//! because a GPIO interrupt is delivered by the kernel loop, which has not
//! started while the board is still being built. The first version of this
//! waited for the callback and reported a failure that was its own.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil::gpio;
use kernel::utilities::cells::OptionalCell;

#[derive(Clone, Copy, PartialEq)]
enum Stage {
    Idle,
    /// A rising edge has been armed and the output driven high.
    AwaitingRising,
    /// A rising-edge interrupt is armed and the output has gone LOW, which
    /// must not fire it.
    ExpectingSilence,
    Done,
}

pub struct TestGpioContract<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> {
    out: &'a O,
    input: &'a I,
    failures: Cell<usize>,
    checks: Cell<usize>,
    stage: Cell<Stage>,
    fired: Cell<usize>,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
}

impl<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> TestGpioContract<'a, O, I> {
    /// `out` and `input` must be physically wired together.
    pub fn new(out: &'a O, input: &'a I) -> Self {
        Self {
            out,
            input,
            failures: Cell::new(0),
            checks: Cell::new(0),
            stage: Cell::new(Stage::Idle),
            fired: Cell::new(0),
            client: OptionalCell::empty(),
        }
    }

    fn check(&self, ok: bool, clause: &str) {
        self.checks.set(self.checks.get() + 1);
        if ok {
            debug!("gpio-contract: ok   {}", clause);
        } else {
            self.failures.set(self.failures.get() + 1);
            debug!("gpio-contract: FAIL {}", clause);
        }
    }

    fn finish(&self) {
        self.stage.set(Stage::Done);
        let (n, bad) = (self.checks.get(), self.failures.get());
        if bad == 0 {
            debug!("gpio-contract: {} clauses, all kept", n);
            self.client.map(|c| c.done(Ok(())));
        } else {
            debug!("gpio-contract: {} clauses, {} BROKEN", n, bad);
            self.client
                .map(|c| c.done(Err(CapsuleTestError::IncorrectResult)));
        }
    }

    pub fn run(&self) {
        use gpio::Configuration;

        // 1 and 2. The configuration a pin reports, and whether the value it
        //    hands back when reconfigured agrees with it afterwards.
        let c = self.out.make_output();
        self.check(
            matches!(c, Configuration::Output | Configuration::InputOutput),
            "make_output() answers Output or InputOutput",
        );
        self.check(
            matches!(
                self.out.configuration(),
                Configuration::Output | Configuration::InputOutput
            ),
            "configuration() agrees after make_output()",
        );

        let c = self.input.make_input();
        self.check(
            matches!(c, Configuration::Input | Configuration::InputOutput),
            "make_input() answers Input or InputOutput",
        );
        self.check(
            matches!(
                self.input.configuration(),
                Configuration::Input | Configuration::InputOutput
            ),
            "configuration() agrees after make_input()",
        );

        // 3. The wire. Without it these read a floating pin and mean nothing,
        //    which is why the caller has to declare it.
        self.out.set();
        self.check(
            self.input.read(),
            "set() on the output reads high on the input",
        );
        self.out.clear();
        self.check(
            !self.input.read(),
            "clear() on the output reads low on the input",
        );

        // 4. `toggle` returns the NEW value, and the wire follows it.
        let t = self.out.toggle();
        self.check(t, "toggle() from low returns true");
        self.check(
            self.input.read() == t,
            "the input follows what toggle() reported",
        );
        let t = self.out.toggle();
        self.check(!t, "toggle() from high returns false");
        self.check(
            self.input.read() == t,
            "the input follows what toggle() reported",
        );

        // 5 and 6. The edge checks, done through `is_pending()` rather than
        //    by waiting for a callback. A GPIO interrupt is delivered by the
        //    kernel loop, which has not started while a board is still being
        //    built, so a test that waits for `fired()` here can only ever
        //    report a false failure -- which is exactly what the first
        //    version of this did.
        //
        //    Armed ONCE, and the wrong edge is driven FIRST, so nothing has
        //    There is deliberately NO check that a falling edge leaves a
        //    rising-edge interrupt un-pending, though that is the clause one
        //    would want. It cannot be made sound here: the RP2 latches edges
        //    in `INTR` whether or not the interrupt is enabled, and
        //    `INTS = INTR & INTE`, so arming exposes any edge that happened
        //    BEFORE arming -- including ones this test's own earlier clauses
        //    created. A failure could not be attributed to the falling edge
        //    rather than to that stale latch.
        //
        //    Whether arming clears stale state is itself inconsistent across
        //    the tree -- stm32f303xc and lowrisc clear it; nrf5x, sam4l and
        //    rp2350 do not -- and `hil::gpio` does not say which is right.
        self.out.clear();
        self.input
            .enable_interrupts(gpio::InterruptEdge::RisingEdge);

        self.out.set();
        self.check(
            self.input.is_pending(),
            "a rising edge makes a rising-edge interrupt pending",
        );

        self.input.disable_interrupts();
        self.finish();
    }
}

impl<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> gpio::Client for TestGpioContract<'a, O, I> {
    fn fired(&self) {
        // Counted only. The edge clauses are checked synchronously through
        // `is_pending()`, because nothing delivers this callback until the
        // kernel loop runs.
        self.fired.set(self.fired.get() + 1);
    }
}

impl<'a, O: gpio::Pin, I: gpio::InterruptPin<'a>> CapsuleTest for TestGpioContract<'a, O, I> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}
