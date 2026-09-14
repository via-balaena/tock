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
//!    implementations answered `Err` unconditionally, which also breaks the
//!    other half of the clause -- any `Err` promises a callback, and an idle
//!    UART has none to make, so the caller waits for its buffer forever. All
//!    eleven are guarded now, and `tools/ci/check-uart-abort-idle.py` fails
//!    the build if an abort body loses the ability to answer `Ok(())` again.
//! 4. `receive_abort()` with nothing outstanding returns `Ok(())`. Ten did
//!    not, sam4l among them -- forty-nine lines from a `transmit_abort` in the
//!    same impl that was already guarded correctly.
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
//! 8. A cancelled receive reports how many words actually arrived, not the
//!    length that was asked for. Two implementations diverge in opposite
//!    directions: one always answers 0, the other answers the requested
//!    length.
//! 9. With `new_loopback`, the clauses that need the bytes to come back:
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

/// A word with bit 7 set, and what it must become once the UART is
/// configured for seven-bit words. `hil::uart` states the rule on
/// `transmit_buffer`: *"The word width is determined by the UART
/// configuration, truncating any more significant bits."*
const WIDE_WORD: u8 = 0xc5;
const WIDE_WORD_IN_SEVEN_BITS: u8 = 0x45;

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
    /// A seven-bit word is in flight, expected back with its top bit gone.
    AwaitingWidth,
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
    /// The configurable end of this UART, when the board has one to hand.
    /// The test's own bound is `UartData`, so that the same test runs against
    /// a `UartDevice` from the mux -- which has no `Configure`.
    configure: OptionalCell<&'static dyn uart::Configure>,
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
            configure: OptionalCell::empty(),
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

    /// Start a transmit from inside a completion callback.
    ///
    /// *"A call to [`Transmit::transmit_word`] or [`Transmit::transmit_buffer`]
    /// made within this callback SHOULD NOT return `Err(BUSY)`. When this
    /// callback is made the UART should be ready to receive another call."*
    ///
    /// A driver that issues the callback before clearing its own state
    /// refuses the very call the contract invites. That is not theoretical:
    /// six chip drivers had it on the receive side, and on a mux it killed
    /// the process console -- an application read and the console stopped
    /// receiving at the same moment, verified on RP2350 silicon.
    ///
    /// The stage is closed first, so a driver that accepts the call and then
    /// calls back again is ignored rather than counted as a stray callback.
    fn reentrant_transmit(&self, buffer: &'static mut [u8]) {
        const CLAUSE: &str = "transmit_buffer() from inside its own callback must not answer BUSY";
        self.stage.set(Stage::Done);
        match self.uart.transmit_buffer(buffer, 1) {
            Ok(()) => {
                self.check(true, CLAUSE);
                // Nothing is waiting on it; leave the driver idle.
                let _ = self.uart.transmit_abort();
            }
            Err((e, _b)) => self.check(e != ErrorCode::BUSY, CLAUSE),
        }
    }

    /// The same clause on the receive side, which is the half that has
    /// actually been seen to break.
    fn reentrant_receive(&self, buffer: &'static mut [u8]) {
        const CLAUSE: &str = "receive_buffer() from inside its own callback must not answer BUSY";
        self.stage.set(Stage::Done);
        match self.uart.receive_buffer(buffer, 1) {
            Ok(()) => {
                self.check(true, CLAUSE);
                let _ = self.uart.receive_abort();
            }
            Err((e, _b)) => self.check(e != ErrorCode::BUSY, CLAUSE),
        }
    }

    /// The clauses that need [`uart::Configure`], which the main test cannot
    /// reach: its bound is `UartData` so that the same test also runs against
    /// a `UartDevice` from the mux, and the mux has no `Configure`.
    ///
    /// Call this before `run` on a board that has the configurable end of the
    /// UART to hand.
    ///
    /// *"`Err(INVAL)`: Impossible parameters (e.g. a `Parameters::baud_rate`
    /// of 0)."* Nine of the twenty-six implementations compute a clock
    /// divisor by dividing by the baud rate with nothing checking it first,
    /// so a request for zero is integer division by zero and takes the kernel
    /// down -- from a call the HIL documents as returning an error, made from
    /// a capsule.
    pub fn check_configure(&self, configure: &'static dyn uart::Configure) {
        // Kept for the width phase, which needs to change the word size and
        // put it back.
        self.configure.set(configure);

        let impossible = uart::Parameters {
            baud_rate: 0,
            width: uart::Width::Eight,
            stop_bits: uart::StopBits::One,
            parity: uart::Parity::None,
            hw_flow_control: false,
        };
        // Reaching the next line at all is half the check: on a driver that
        // divides without looking, this call never returns.
        let answer = configure.configure(impossible);
        self.check(
            answer == Err(ErrorCode::INVAL),
            "configure() with a baud rate of 0 must answer Err(INVAL)",
        );
    }

    /// Reconfigure this UART for `width`, keeping everything else as the
    /// board set it.
    fn set_width(&self, width: uart::Width) -> bool {
        self.configure
            .map(|c| {
                c.configure(uart::Parameters {
                    baud_rate: 115200,
                    width,
                    stop_bits: uart::StopBits::One,
                    parity: uart::Parity::None,
                    hw_flow_control: false,
                }) == Ok(())
            })
            .unwrap_or(false)
    }

    /// Send one word too wide for the configured width and see it come back
    /// truncated.
    ///
    /// *"Each byte in `tx_buffer` is a UART transfer word of 8 or fewer bits.
    /// The word width is determined by the UART configuration, truncating any
    /// more significant bits. E.g., `0x18f` transmitted in 8N1 will be sent
    /// as `0x8f` and in 7N1 will be sent as `0x0f`."*
    ///
    /// This needs both a `Configure` handle and a loopback, which is why the
    /// test could not reach it before: with nothing listening, what went out
    /// on the wire was unobservable, and the mux the test also runs against
    /// has no `Configure` at all.
    fn start_width_check(&self, rx_buf: &'static mut [u8]) {
        let tx_buf = match self.buffer.take() {
            Some(b) => b,
            None => {
                self.check(false, "the width phase needs a second buffer");
                self.finish();
                return;
            }
        };

        if !self.set_width(uart::Width::Seven) {
            self.check(false, "configure() must accept a seven-bit word width");
            self.buffer.replace(tx_buf);
            self.finish();
            return;
        }

        if let Err((_e, b)) = self.uart.receive_buffer(rx_buf, 1) {
            self.check(
                false,
                "receive_buffer() on an idle UART must start a receive",
            );
            self.buffer.replace(tx_buf);
            let _ = b;
            self.finish();
            return;
        }

        tx_buf[0] = WIDE_WORD;
        self.stage.set(Stage::AwaitingWidth);

        if let Err((_e, b)) = self.uart.transmit_buffer(tx_buf, 1) {
            self.check(
                false,
                "transmit_buffer() on an idle UART must start a transmit",
            );
            self.buffer.replace(b);
            self.finish();
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

    /// Send `PATTERN` in one transfer and take it back in one receive. With
    /// the UART in loopback it arrives on this same UART, which is what lets
    /// this phase check what the driver CARRIED rather than what it reported.
    ///
    /// The receive is armed before the transmit, because a word that arrives
    /// with no buffer posted is dropped.
    ///
    /// This sent one byte at a time until 2026-09-13, waiting for each to
    /// arrive before sending the next, because the rp2350 UART ran with
    /// `FEN` clear and its receive side then held exactly one byte -- four
    /// bytes back to back overran it and the test waited forever. That
    /// driver enables the FIFOs now. A four-word transfer is in any case a
    /// clause `hil::uart` plainly makes and a one-word transfer cannot
    /// reach: *"the `rx_len` argument specifies how many words were
    /// received"*, and a driver whose receive is one word deep answers it
    /// wrongly or not at all.
    fn start_loopback(&self, rx_buf: &'static mut [u8]) {
        let tx_buf = match self.buffer.take() {
            Some(b) => b,
            None => {
                self.check(false, "the loopback phase needs a second buffer");
                self.finish();
                return;
            }
        };

        if rx_buf.len() < TX_LEN || tx_buf.len() < TX_LEN {
            self.check(false, "the loopback phase needs two buffers of TX_LEN");
            self.buffer.replace(tx_buf);
            self.finish();
            return;
        }

        if let Err((e, _b)) = self.uart.receive_buffer(rx_buf, TX_LEN) {
            self.check(
                false,
                "receive_buffer() on an idle UART must start a receive",
            );
            debug!("uart-contract: loopback receive refused with {:?}", e);
            self.buffer.replace(tx_buf);
            self.finish();
            return;
        }

        tx_buf[..TX_LEN].copy_from_slice(&PATTERN);
        self.stage.set(Stage::AwaitingLoopback);

        if let Err((e, b)) = self.uart.transmit_buffer(tx_buf, TX_LEN) {
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
                // "Err(CANCEL): ... `rx_len` contains how many words were
                // received." Nothing has been sent at this point, so the
                // answer is zero. Two implementations get this wrong in
                // opposite directions: stm32u5xx always reports 0 even when
                // bytes did arrive, and x86_q35 reported the length that was
                // asked for rather than the count that came.
                self.check(
                    rx_len == 0,
                    "a cancelled receive reports how many words arrived",
                );
                if self.loopback {
                    self.start_loopback(rx_buffer);
                } else {
                    self.start_transmit(rx_buffer);
                }
            }
            Stage::AwaitingLoopback => {
                // The bytes this test sent, arriving back on the same UART.
                // Everything here is a clause no test without loopback can
                // reach.
                self.check(rval == Ok(()), "a completed receive reports Ok(())");
                self.check(
                    rx_len == TX_LEN,
                    "a completed receive reports the length it was given",
                );
                self.check(
                    error == uart::Error::None,
                    "a receive that succeeded reports Error::None",
                );
                // Say what actually came back when it is not what was wanted.
                // A clause name tells you which sentence broke; this tells you
                // what the driver said instead, which is where the next hour
                // goes if it is missing.
                if rval != Ok(()) || error != uart::Error::None {
                    debug!(
                        "uart-contract:   receive answered {:?} with {:?}, {} of {} words",
                        rval, error, rx_len, TX_LEN
                    );
                }

                let matched = rx_buffer[..TX_LEN] == PATTERN;
                self.check(matched, "the bytes received match the bytes sent");
                if !matched {
                    debug!(
                        "uart-contract:   sent {:?} got {:?}",
                        PATTERN,
                        &rx_buffer[..TX_LEN]
                    );
                }

                if self.configure.is_some() {
                    self.start_width_check(rx_buffer);
                } else {
                    self.reentrant_receive(rx_buffer);
                    self.check_word_methods();
                    self.finish();
                }
            }
            Stage::AwaitingWidth => {
                let got = rx_buffer[0];
                self.check(
                    got == WIDE_WORD_IN_SEVEN_BITS,
                    "a word wider than the configured width is truncated",
                );
                if got != WIDE_WORD_IN_SEVEN_BITS {
                    debug!(
                        "uart-contract:   sent {:#04x} in 7N1, expected {:#04x}, got {:#04x}",
                        WIDE_WORD, WIDE_WORD_IN_SEVEN_BITS, got
                    );
                }

                // Put the width back before anything else uses this UART.
                self.check(
                    self.set_width(uart::Width::Eight),
                    "configure() must accept an eight-bit word width",
                );

                self.reentrant_receive(rx_buffer);
                self.check_word_methods();
                self.finish();
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
                self.reentrant_transmit(tx_buffer);
                self.check_word_methods();
                self.finish();
            }
            Stage::AwaitingLoopback => {
                self.check(
                    true,
                    "a completed transmit must call back and return the buffer",
                );
                self.check(rval == Ok(()), "a completed transmit reports Ok(())");
                self.check(
                    tx_len == TX_LEN,
                    "a completed transmit reports the length it was given",
                );
                self.buffer.replace(tx_buffer);
            }
            Stage::AwaitingWidth => {
                // The receive callback drives this phase; this one exists to
                // take the buffer back.
                self.buffer.replace(tx_buffer);
            }
            // The re-entrant clause may leave one transfer in flight on
            // purpose. Once the test has closed, a callback is expected.
            Stage::Done => {}
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
