// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Conformance test for `hil::adc::Adc`.
//!
//! `hil::adc` enumerates **no errors at all** across its eighteen methods, so
//! like `hil::i2c` before it the contract has to be derived from what the
//! implementations agree on. Seven chip drivers implement it and they disagree
//! on every fallible method: `sample` answers `BUSY` in four and cannot fail
//! in three; `stop_sampling` answers `NOSUPPORT` in three, `OFF` in one,
//! `BUSY` in one, and cannot fail in one.
//!
//! Needs no external hardware. Every clause is about what the driver does with
//! a request rather than what voltage is on the pin, so a floating input is a
//! perfectly good one.
//!
//! # What this cannot check, and why
//!
//! **Anything on the far side of a callback**, which includes the one thing
//! `hil::adc` actually states twice: *"All ADC samples will be the raw ADC
//! value left-justified in the u16."* Checking that needs a delivered sample,
//! and this test cannot get one.
//!
//! That is a measurement, not an assumption. Setting this test as the chip
//! driver's client and sampling produces **zero entries into the driver's
//! interrupt handler** on RP2350 -- instrumented and run -- where the same
//! driver, with the ADC mux as its client, enters the handler on every sample
//! an app makes. Whatever the mux does that this does not has not been
//! isolated. Until it is, the clauses here are the synchronous ones, and the
//! justification rule stays prose that nothing executes.
//!
//! Continuous and high-speed sampling are not exercised either:
//! `sample_continuous` is `NOSUPPORT` on four of the seven drivers, so a
//! shared test would be asserting on a feature most of the tree lacks.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::deferred_call::{DeferredCall, DeferredCallClient};
use kernel::hil::adc::{Adc, Client};
use kernel::utilities::cells::OptionalCell;

pub struct TestAdcContract<'a, A: Adc<'a>> {
    adc: &'a A,
    channel: A::Channel,
    failures: Cell<usize>,
    /// Set once the final sample has been issued, so `sample_ready` knows the
    /// callback it receives is the one the last clause is waiting for.
    awaiting_sample: Cell<bool>,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
    deferred_call: DeferredCall,
}

impl<'a, A: Adc<'a>> TestAdcContract<'a, A> {
    pub fn new(adc: &'a A, channel: A::Channel) -> Self {
        Self {
            adc,
            channel,
            failures: Cell::new(0),
            awaiting_sample: Cell::new(false),
            client: OptionalCell::empty(),
            deferred_call: DeferredCall::new(),
        }
    }

    fn check(&self, clause: &str, ok: bool) {
        if ok {
            debug!("adc-contract: ok    {}", clause);
        } else {
            self.failures.set(self.failures.get() + 1);
            debug!("adc-contract: FAIL  {}", clause);
        }
    }

    /// Schedule the run. The clauses execute from the deferred call, which is
    /// to say from the kernel's main loop rather than from board setup.
    pub fn run(&self) {
        self.deferred_call.set();
    }

    fn run_clauses(&self) {
        self.failures.set(0);

        // Clause 1: the resolution is a number a caller can use. Everything
        // that reads a sample depends on it.
        let bits = self.adc.get_resolution_bits();
        self.check("resolution in 1..=16", (1..=16).contains(&bits));

        // Clause 2: a reference voltage, if reported, is a plausible one. The
        // HIL allows `None` for "unknown"; what it cannot mean is zero, which
        // would make every voltage a caller computes from it zero too.
        self.check(
            "reference voltage is None or non-zero",
            self.adc.get_voltage_reference_mv() != Some(0),
        );

        // Clause 3: stopping an ADC that is not sampling is not an error. The
        // promise is that no further callbacks occur, and that already holds
        // when idle -- a caller stopping an ADC it is unsure about, which is
        // what this method is for, should not have to know which it is.
        self.check(
            "stop_sampling when idle is Ok",
            self.adc.stop_sampling() == Ok(()),
        );

        // Clause 4: a second sample while one is in flight is refused, rather
        // than reconfiguring the peripheral underneath the first. Three of the
        // seven drivers cannot fail here at all.
        match self.adc.sample(&self.channel) {
            Ok(()) => {
                self.check(
                    "sample during a sample is refused",
                    self.adc.sample(&self.channel) == Err(ErrorCode::BUSY),
                );

                // Clause 5: and the one in flight can be called off.
                self.check(
                    "stop_sampling during a sample is Ok",
                    self.adc.stop_sampling() == Ok(()),
                );

                // Clause 6: the driver is usable afterwards. This is the one
                // that matters: a `stop_sampling` reporting success while
                // leaving the driver wedged passes every check except the
                // next sample. Three drivers answer `NOSUPPORT` to clause 5
                // and so can never reach a state this would prove.
                self.check(
                    "sample is accepted after stop_sampling",
                    self.adc.sample(&self.channel) == Ok(()),
                );

                // Leave one sample outstanding on purpose: the clause that
                // needs a delivered value is in `sample_ready`.
                //
                // Say so, because the run stops here if the callback never
                // comes and silence is ambiguous. It once meant "this board
                // never called `adc.init()`", and read as "callbacks do not
                // work".
                self.awaiting_sample.set(true);
                debug!("adc-contract: waiting for the delivered sample");
            }
            Err(e) => {
                self.check("a sample on an idle ADC is accepted", false);
                debug!("adc-contract: the first sample returned {:?}", e);
            }
        }

        if self.awaiting_sample.get() {
            // The run finishes in `sample_ready`.
            return;
        }
        self.report();
    }

    fn report(&self) {
        let failures = self.failures.get();
        if failures == 0 {
            debug!("adc-contract: all clauses passed");
        } else {
            debug!("adc-contract: {} clause(s) FAILED", failures);
        }
        self.client.map(|client| {
            client.done(if failures == 0 {
                Ok(())
            } else {
                Err(CapsuleTestError::IncorrectResult)
            })
        });
    }
}

impl<'a, A: Adc<'a>> Client for TestAdcContract<'a, A> {
    fn sample_ready(&self, sample: u16) {
        if !self.awaiting_sample.get() {
            return;
        }
        self.awaiting_sample.set(false);

        // The rule `hil::adc` states twice, on `sample` and on
        // `sample_continuous`: "All ADC samples will be the raw ADC value
        // left-justified in the u16." A 12-bit converter must therefore leave
        // the low four bits clear. A 16-bit one has none to leave, so the
        // clause is skipped rather than passed vacuously.
        let bits = self.adc.get_resolution_bits();
        if bits < 16 {
            let low = sample & ((1u16 << (16 - bits)) - 1);
            debug!("adc-contract: delivered sample 0x{:04X}", sample);
            self.check("sample is left-justified", low == 0);
        } else {
            debug!(
                "adc-contract: skip  left-justification -- {} bits fills the u16",
                bits
            );
        }
        self.report();
    }
}

impl<'a, A: Adc<'a>> CapsuleTest for TestAdcContract<'a, A> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}

impl<'a, A: Adc<'a>> DeferredCallClient for TestAdcContract<'a, A> {
    fn handle_deferred_call(&self) {
        self.run_clauses();
    }

    fn register(&'static self) {
        self.deferred_call.register(self);
    }
}
