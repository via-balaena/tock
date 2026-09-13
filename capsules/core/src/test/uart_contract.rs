// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Check a `hil::uart` implementation against the return values it documents.
//!
//! Takes anything implementing `uart::UartData`, which is the blanket
//! `Transmit + Receive`. That covers both a chip driver and a `UartDevice`
//! from the mux; `Configure` is deliberately not required, because the
//! virtualizer does not implement it and the contract under test does not
//! involve it.
//!
//! `kernel::hil::uart` states, in the doc comments of `Transmit`, `Receive`
//! and their clients, exactly what each call must answer. Nothing executes
//! those sentences. An audit on 2026-09-13 read seven of them against all
//! twenty-six implementations in the tree and **every one was violated by at
//! least one implementation**, including a driver that wedged its UART
//! permanently on the first abort. This runs the clauses instead of reading
//! them.
//!
//! Each check names the clause it is checking, so a failure says which
//! sentence was broken rather than only that something went wrong. The
//! clauses, and what the audit found breaking each:
//!
//! 1. `Err(SIZE)` when `tx_len` exceeds the slice. Three implementations
//!    clamped or indexed past the end instead; one panicked.
//! 2. `Err(SIZE)` when `rx_len` exceeds the slice. Same three.
//! 3. `transmit_abort()` with nothing outstanding returns `Ok(())`. Eleven
//!    implementations answered `Err` unconditionally.
//! 4. `receive_abort()` with nothing outstanding returns `Ok(())`. Seven did.
//! 5. `Err(BUSY)` when a receive is already outstanding. Six implementations
//!    silently replaced the outstanding buffer, losing it and its callback.
//! 6. A cancelled receive still calls back, returning the buffer. One
//!    implementation set a state nothing ever read, stranding the buffer and
//!    leaving the UART unusable for the life of the board.
//!
//! Checks 1 to 5 are synchronous. Check 6 needs the callback, so the test
//! finishes there rather than at the end of `run`.
//!
//! What this cannot check: that a client may start a new operation from
//! inside a completion callback without being refused. That one needs a
//! second client on the same mux to trigger, which is a board wiring
//! question rather than something a capsule can arrange for itself. It is
//! the defect verified separately on silicon; see
//! `learning/bench/uart-abort-silicon` in the notes repository.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil::uart;
use kernel::utilities::cells::{OptionalCell, TakeCell};

/// Which stage the asynchronous part of the test is in.
#[derive(Clone, Copy, PartialEq)]
enum Stage {
    /// Nothing started.
    Idle,
    /// A receive is outstanding and has been aborted; a callback is required.
    AwaitingAbortCallback,
    /// Finished, one way or the other.
    Done,
}

pub struct TestUartContract<'a, U: uart::UartData<'a> + 'a> {
    uart: &'a U,
    /// Handed to the UART and given back through the callback or an error.
    buffer: TakeCell<'static, [u8]>,
    /// Failures seen so far. The test runs every check rather than stopping
    /// at the first, so one broken clause does not hide the others.
    failures: Cell<usize>,
    checks: Cell<usize>,
    stage: Cell<Stage>,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
}

impl<'a, U: uart::UartData<'a>> TestUartContract<'a, U> {
    pub fn new(uart: &'a U, buffer: &'static mut [u8]) -> Self {
        Self {
            uart,
            buffer: TakeCell::new(buffer),
            failures: Cell::new(0),
            checks: Cell::new(0),
            stage: Cell::new(Stage::Idle),
            client: OptionalCell::empty(),
        }
    }

    /// Record one clause's outcome. `clause` is the sentence being checked,
    /// so a failure line is readable without the source to hand.
    fn check(&self, ok: bool, clause: &str) {
        self.checks.set(self.checks.get() + 1);
        if ok {
            debug!("uart-contract: ok   {}", clause);
        } else {
            self.failures.set(self.failures.get() + 1);
            debug!("uart-contract: FAIL {}", clause);
        }
    }

    fn finish(&self) {
        self.stage.set(Stage::Done);
        let (n, bad) = (self.checks.get(), self.failures.get());
        if bad == 0 {
            debug!("uart-contract: {} clauses, all kept", n);
            self.client.map(|c| c.done(Ok(())));
        } else {
            debug!("uart-contract: {} clauses, {} BROKEN", n, bad);
            self.client
                .map(|c| c.done(Err(CapsuleTestError::IncorrectResult)));
        }
    }

    pub fn run(&self) {
        let buf = match self.buffer.take() {
            Some(b) => b,
            None => {
                debug!("uart-contract: no buffer; test cannot run");
                self.client
                    .map(|c| c.done(Err(CapsuleTestError::ErrorCode(ErrorCode::NOMEM))));
                return;
            }
        };
        let len = buf.len();

        // 1. `Err(SIZE)`: `tx_len` is larger than the passed slice.
        //    The buffer must come back with the error, or it is lost.
        let buf = match self.uart.transmit_buffer(buf, len + 1) {
            Ok(()) => {
                self.check(false, "transmit_buffer(len+1) must answer Err(SIZE)");
                // The buffer is inside the driver now and this test cannot
                // continue without it.
                self.finish();
                return;
            }
            Err((e, b)) => {
                self.check(
                    e == ErrorCode::SIZE,
                    "transmit_buffer(len+1) must answer Err(SIZE)",
                );
                b
            }
        };

        // 2. `Err(SIZE)`: `rx_len` is larger than the passed slice.
        let buf = match self.uart.receive_buffer(buf, len + 1) {
            Ok(()) => {
                self.check(false, "receive_buffer(len+1) must answer Err(SIZE)");
                self.finish();
                return;
            }
            Err((e, b)) => {
                self.check(
                    e == ErrorCode::SIZE,
                    "receive_buffer(len+1) must answer Err(SIZE)",
                );
                b
            }
        };

        // 3 and 4. With nothing outstanding an abort must answer `Ok(())`,
        //    which the documentation states twice: *if there is no
        //    outstanding call ... then a call to this function returns
        //    `Ok(())`*. An `Err` here also promises a callback that cannot
        //    come, because nothing was started.
        self.check(
            self.uart.transmit_abort() == Ok(()),
            "transmit_abort() with nothing outstanding must answer Ok(())",
        );
        self.check(
            self.uart.receive_abort() == Ok(()),
            "receive_abort() with nothing outstanding must answer Ok(())",
        );

        // 5. A second receive while one is outstanding must be refused, not
        //    silently swallow the first buffer. Start one, then try again
        //    with a second buffer made from the first's own tail so the test
        //    needs only one allocation.
        let (first, second) = buf.split_at_mut(len / 2);
        // `split_at_mut` borrows, so rebuild the two halves as owned slices.
        let first: &'static mut [u8] = first;
        let second: &'static mut [u8] = second;

        match self.uart.receive_buffer(first, 1) {
            Ok(()) => {
                match self.uart.receive_buffer(second, 1) {
                    Ok(()) => {
                        // The driver took a second buffer while one was
                        // outstanding. The first is now unreachable.
                        self.check(
                            false,
                            "receive_buffer() while one is outstanding must answer Err(BUSY)",
                        );
                    }
                    Err((e, _returned)) => {
                        self.check(
                            e == ErrorCode::BUSY,
                            "receive_buffer() while one is outstanding must answer Err(BUSY)",
                        );
                    }
                }

                // 6. Cancel it. `Ok(())` means no callback is coming and the
                //    driver never took the buffer; any `Err` promises one.
                match self.uart.receive_abort() {
                    Ok(()) => {
                        self.check(
                            false,
                            "receive_abort() with a receive outstanding must not answer Ok(())",
                        );
                        self.finish();
                    }
                    Err(_) => {
                        // The callback must arrive. If it never does, the
                        // test simply never reports, which is itself the
                        // signal: the buffer was stranded.
                        self.stage.set(Stage::AwaitingAbortCallback);
                    }
                }
            }
            Err((e, _)) => {
                self.check(
                    false,
                    "receive_buffer() on an idle UART must start a receive",
                );
                debug!("uart-contract: receive_buffer refused with {:?}", e);
                self.finish();
            }
        }
    }
}

impl<'a, U: uart::UartData<'a>> uart::ReceiveClient for TestUartContract<'a, U> {
    fn received_buffer(
        &self,
        _rx_buffer: &'static mut [u8],
        _rx_len: usize,
        rval: Result<(), ErrorCode>,
        _error: uart::Error,
    ) {
        if self.stage.get() != Stage::AwaitingAbortCallback {
            return;
        }
        // The clause is that a cancelled receive calls back and hands the
        // buffer over. Arriving here at all is the check; `rval` should say
        // it was cancelled.
        self.check(
            true,
            "a cancelled receive must call back and return the buffer",
        );
        self.check(
            rval == Err(ErrorCode::CANCEL),
            "a cancelled receive reports Err(CANCEL)",
        );
        self.finish();
    }
}

impl<'a, U: uart::UartData<'a>> uart::TransmitClient for TestUartContract<'a, U> {
    fn transmitted_buffer(
        &self,
        _tx_buffer: &'static mut [u8],
        _tx_len: usize,
        _rval: Result<(), ErrorCode>,
    ) {
        // Nothing in this test starts a transmit that completes; a callback
        // here means an implementation called back from a rejected call.
        self.check(
            false,
            "transmit_buffer() that answered Err must not call back",
        );
    }
}

impl<'a, U: uart::UartData<'a>> CapsuleTest for TestUartContract<'a, U> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}
