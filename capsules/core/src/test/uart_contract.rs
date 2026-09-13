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
//! 7. The single-word methods answer one of the codes the HIL enumerates,
//!    rather than panicking. One driver answered `unimplemented!()` and
//!    another asserted on an uninitialized UART; both took the board down
//!    on a call documented as returning an error.
//!
//! 8. With `new_loopback`, the clauses that need the bytes to come back:
//!    a completed receive reports `Ok(())`, reports the length it was
//!    given, reports `Error::None`, and **the bytes received match the
//!    bytes sent**. Everything above this line checks what a driver
//!    *reported*; only this checks what it *carried*.
//!
//! Checks 1 to 5 are synchronous. Check 6 needs the callback, so the test
//! continues there rather than at the end of `run`. Check 8 replaces the
//! plain transmit phase when loopback is in use, and check 7 runs last in
//! either case, because a UART that accepts a word transmit starts one.
//!
//! Arranging the loopback is the caller's job -- see `new_loopback`. A chip
//! may have an internal loopback bit (the PL011's `UARTCR.LBE`, which
//! rp2350 exposes as `set_loopback`), or a board may have TX wired to RX.
//! An internal loop sits ahead of the pads, so it checks the driver and the
//! peripheral's datapath but says nothing about the pads or the pin mux.
//!
//! What this cannot check: that a client may start a new operation from
//! inside a completion callback without being refused. That one needs a
//! second client on the same mux to trigger, which is a board wiring
//! question rather than something a capsule can arrange for itself. It is
//! the defect verified separately on silicon; see
//! `learning/bench/uart-abort-silicon` in the notes repository.
//!
//! Nor can it check the word-width truncation the HIL states -- that `0x18f`
//! goes out as `0x8f` in 8N1 and `0x0f` in 7N1 -- because changing the width
//! needs `Configure`, and the bound here is `UartData` so that the same test
//! runs against a `UartDevice` from the mux, which has no `Configure`.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil::uart;
use kernel::utilities::cells::{OptionalCell, TakeCell};

/// Bytes the transmit phase sends. Short, because without loopback nothing
/// is necessarily listening -- the point is then that the transfer completes
/// and calls back, not what arrives at the other end.
const TX_LEN: usize = 4;

/// What the loopback phase sends. Alternating bits, then all-clear and
/// all-set, so a word truncated to seven bits, a stuck bit, or a reversed
/// bit order each show up as a mismatch instead of passing by luck.
const PATTERN: [u8; TX_LEN] = [0x55, 0xaa, 0x00, 0xff];

/// Which stage the asynchronous part of the test is in.
#[derive(Clone, Copy, PartialEq)]
enum Stage {
    /// Nothing started.
    Idle,
    /// A receive is outstanding and has been aborted; a callback is required.
    AwaitingAbortCallback,
    /// A real transmit is in flight; its callback is required.
    AwaitingTransmit,
    /// One byte is in flight, expected to arrive on this UART's own receive
    /// path. The receive callback drives the next one.
    AwaitingLoopback,
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
    /// Whether the caller has put this UART into loopback, so that what is
    /// transmitted arrives on its own receive path.
    loopback: bool,
    /// Which byte of `PATTERN` the loopback phase is on. One byte is in
    /// flight at a time; see `start_loopback` for why.
    lb_index: Cell<usize>,
    /// What has come back so far, compared against `PATTERN` at the end.
    received: Cell<[u8; TX_LEN]>,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
}

impl<'a, U: uart::UartData<'a>> TestUartContract<'a, U> {
    pub fn new(uart: &'a U, buffer: &'static mut [u8]) -> Self {
        Self::build(uart, buffer, false)
    }

    /// The same test, plus the clauses that can only be checked when what is
    /// transmitted comes back on the same UART's receive path.
    ///
    /// **The caller is responsible for arranging that**, because nothing in
    /// `hil::uart` can: a chip may offer an internal loopback bit, or the
    /// board may have TX wired to RX. If neither is true, the loopback phase
    /// will simply never call back and the test will never report -- which is
    /// why it is a separate constructor rather than something inferred.
    pub fn new_loopback(uart: &'a U, buffer: &'static mut [u8]) -> Self {
        Self::build(uart, buffer, true)
    }

    fn build(uart: &'a U, buffer: &'static mut [u8], loopback: bool) -> Self {
        Self {
            uart,
            buffer: TakeCell::new(buffer),
            failures: Cell::new(0),
            checks: Cell::new(0),
            stage: Cell::new(Stage::Idle),
            loopback,
            lb_index: Cell::new(0),
            received: Cell::new([0; TX_LEN]),
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

    /// The single-word methods. No UART driver in the tree implements these
    /// -- every one of the twenty-six answers an error -- so what is worth
    /// checking is that the error is one the HIL actually enumerates, and
    /// that asking does not take the board down. One driver used to answer
    /// with `unimplemented!()` and another asserted, both of which reach
    /// this check as a panic rather than a failure.
    ///
    /// These run last because a UART that *does* accept a word transmit
    /// starts one, and that would disturb the checks before it.
    fn check_word_methods(&self) {
        fn enumerated(r: Result<(), ErrorCode>) -> bool {
            matches!(
                r,
                Ok(())
                    | Err(ErrorCode::OFF)
                    | Err(ErrorCode::BUSY)
                    | Err(ErrorCode::NOSUPPORT)
                    | Err(ErrorCode::FAIL)
            )
        }
        self.check(
            enumerated(self.uart.transmit_word(b'z' as u32)),
            "transmit_word() must answer a code the HIL enumerates",
        );
        self.check(
            enumerated(self.uart.receive_word()),
            "receive_word() must answer a code the HIL enumerates",
        );
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
                    Err((e, returned)) => {
                        self.check(
                            e == ErrorCode::BUSY,
                            "receive_buffer() while one is outstanding must answer Err(BUSY)",
                        );
                        // Keep it; the transmit phase needs a second buffer
                        // to check that a second transmit is refused.
                        self.buffer.put(Some(returned));
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

    /// Send one byte of `PATTERN` and arm a receive for it. With the UART
    /// in loopback it arrives on this same UART, and the receive callback
    /// sends the next one.
    ///
    /// **One byte at a time, and the next is sent only once the previous has
    /// arrived.** The rp2350 UART runs with its FIFOs disabled -- `configure`
    /// clears `FEN`, and has to, because the driver's receive path tests
    /// `RXFF` (FIFO *full*), which with FIFOs enabled would need 32 queued
    /// bytes to ever fire. So the receive side holds exactly one byte.
    /// Sending four back to back overruns it: measured on silicon as
    /// `UARTRIS` bit 10 (OE) set with `RXFE` still 1 and `RXIM` still armed
    /// -- the byte is lost, no further receive interrupt is raised, and the
    /// test waits forever.
    ///
    /// The receive is armed before the transmit, because a byte that arrives
    /// with no buffer posted is dropped.
    fn start_loopback(&self, rx_buf: &'static mut [u8]) {
        self.lb_index.set(0);
        self.send_one(rx_buf);
    }

    /// Arm a one-byte receive and transmit the pattern byte at `lb_index`.
    fn send_one(&self, rx_buf: &'static mut [u8]) {
        let i = self.lb_index.get();
        let tx_buf = match self.buffer.take() {
            Some(b) => b,
            None => {
                self.check(false, "the loopback phase needs a second buffer");
                self.finish();
                return;
            }
        };

        if let Err((e, _b)) = self.uart.receive_buffer(rx_buf, 1) {
            self.check(
                false,
                "receive_buffer() on an idle UART must start a receive",
            );
            debug!("uart-contract: loopback receive refused with {:?}", e);
            self.buffer.replace(tx_buf);
            self.finish();
            return;
        }

        tx_buf[0] = PATTERN[i];
        self.stage.set(Stage::AwaitingLoopback);

        if let Err((e, b)) = self.uart.transmit_buffer(tx_buf, 1) {
            self.check(
                false,
                "transmit_buffer() on an idle UART must start a transmit",
            );
            debug!("uart-contract: loopback transmit refused with {:?}", e);
            self.buffer.replace(b);
            self.finish();
        }
    }

    /// Start a real transfer and check the clauses only a completed one
    /// reaches: that `Ok(())` is followed by a callback returning the
    /// buffer, and that a second transmit meanwhile is refused.
    ///
    /// This is also the only part of the test that makes the peripheral
    /// raise an interrupt. Everything before it exercises the driver's own
    /// bookkeeping, which is why it passes on a chip whose interrupt is not
    /// routed at all.
    fn start_transmit(&self, buffer: &'static mut [u8]) {
        for (i, b) in buffer.iter_mut().enumerate().take(TX_LEN) {
            *b = b'a' + (i as u8);
        }
        match self.uart.transmit_buffer(buffer, TX_LEN) {
            Ok(()) => {
                self.stage.set(Stage::AwaitingTransmit);
                // A second transmit while that one is in flight must be
                // refused rather than replace it.
                if let Some(spare) = self.buffer.take() {
                    match self.uart.transmit_buffer(spare, TX_LEN) {
                        Ok(()) => self.check(
                            false,
                            "transmit_buffer() while one is outstanding must answer Err(BUSY)",
                        ),
                        Err((e, returned)) => {
                            self.check(
                                e == ErrorCode::BUSY,
                                "transmit_buffer() while one is outstanding must answer Err(BUSY)",
                            );
                            self.buffer.put(Some(returned));
                        }
                    }
                }
                // The callback finishes the test. If it never arrives the
                // test simply never reports, which is the signal that a
                // completed transfer did not call back.
            }
            Err((e, _b)) => {
                self.check(
                    false,
                    "transmit_buffer() on an idle UART must start a transmit",
                );
                debug!("uart-contract: transmit_buffer refused with {:?}", e);
                self.finish();
            }
        }
    }
}

impl<'a, U: uart::UartData<'a>> uart::ReceiveClient for TestUartContract<'a, U> {
    fn received_buffer(
        &self,
        rx_buffer: &'static mut [u8],
        rx_len: usize,
        rval: Result<(), ErrorCode>,
        error: uart::Error,
    ) {
        match self.stage.get() {
            Stage::AwaitingAbortCallback => {
                // The clause is that a cancelled receive calls back and hands
                // the buffer over. Arriving here at all is the check; `rval`
                // should say it was cancelled.
                self.check(
                    true,
                    "a cancelled receive must call back and return the buffer",
                );
                self.check(
                    rval == Err(ErrorCode::CANCEL),
                    "a cancelled receive reports Err(CANCEL)",
                );
                if self.loopback {
                    self.start_loopback(rx_buffer);
                } else {
                    self.start_transmit(rx_buffer);
                }
            }
            Stage::AwaitingLoopback => {
                // A byte this test sent, arriving back on the same UART.
                // Everything here is a clause no test without loopback can
                // reach. The per-byte clauses are checked on the first byte
                // only, so the report stays one line per clause rather than
                // one per byte.
                let i = self.lb_index.get();
                if i == 0 {
                    self.check(rval == Ok(()), "a completed receive reports Ok(())");
                    self.check(
                        rx_len == 1,
                        "a completed receive reports the length it was given",
                    );
                    self.check(
                        error == uart::Error::None,
                        "a receive that succeeded reports Error::None",
                    );
                }

                let mut got = self.received.get();
                got[i] = rx_buffer[0];
                self.received.set(got);

                if i + 1 < TX_LEN {
                    self.lb_index.set(i + 1);
                    self.send_one(rx_buffer);
                } else {
                    let matched = got == PATTERN;
                    self.check(matched, "the bytes received match the bytes sent");
                    if !matched {
                        debug!("uart-contract:   sent {:?} got {:?}", PATTERN, got);
                    }
                    self.check_word_methods();
                    self.finish();
                }
            }
            _ => {}
        }
    }
}

impl<'a, U: uart::UartData<'a>> uart::TransmitClient for TestUartContract<'a, U> {
    fn transmitted_word(&self, rval: Result<(), ErrorCode>) {
        // Only reachable from a UART that accepted `transmit_word`, which
        // nothing in the tree does. Report it rather than let the trait's
        // empty default swallow it.
        debug!("uart-contract: note transmitted_word({:?})", rval);
    }

    fn transmitted_buffer(
        &self,
        tx_buffer: &'static mut [u8],
        tx_len: usize,
        rval: Result<(), ErrorCode>,
    ) {
        match self.stage.get() {
            Stage::AwaitingTransmit => {
                self.check(
                    true,
                    "a completed transmit must call back and return the buffer",
                );
                self.check(rval == Ok(()), "a completed transmit reports Ok(())");
                self.check(
                    tx_len == TX_LEN,
                    "a completed transmit reports the length it was given",
                );
                self.check_word_methods();
                self.finish();
            }
            Stage::AwaitingLoopback => {
                // Checked on the first byte only; after that this callback
                // exists to hand the buffer back so the receive callback can
                // send the next byte.
                if self.lb_index.get() == 0 {
                    self.check(
                        true,
                        "a completed transmit must call back and return the buffer",
                    );
                    self.check(rval == Ok(()), "a completed transmit reports Ok(())");
                    self.check(
                        tx_len == 1,
                        "a completed transmit reports the length it was given",
                    );
                }
                self.buffer.replace(tx_buffer);
            }
            _ => {
                // No transmit was outstanding, so this is a callback from a
                // call that answered Err -- which the documentation forbids.
                self.check(
                    false,
                    "transmit_buffer() that answered Err must not call back",
                );
            }
        }
    }
}

impl<'a, U: uart::UartData<'a>> CapsuleTest for TestUartContract<'a, U> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}
