// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Runs `hil::i2c`'s stated guarantees against a real `I2CMaster`.
//!
//! Until 2026-09-13 there was nothing to run: `I2CMaster`, `I2CSlave` and
//! `I2CDevice` carried no doc comments at all, so the interface enumerated no
//! errors and an audit could only ask whether the eleven implementations
//! agreed with each other. They did not. The contract those drivers were
//! measured into is now written on the trait, and this executes the part of it
//! that can be executed anywhere.
//!
//! **Every clause here is synchronous and none of them reaches the bus.** That
//! is deliberate, and it is what makes this runnable on a board with no I2C
//! device attached and no pull-up resistors -- which is the common case, and
//! was the case that kept this HIL unaudited. Each clause is a rejection the
//! driver must make *before* the buffer is handed to the hardware:
//!
//! 1. `write` with `len` past the buffer is `Err(Size)`. Ten of eleven drivers
//!    indexed a slice or programmed a DMA engine instead.
//! 2. `read` with `len` past the buffer is `Err(Size)`. Same ten.
//! 3. `write_read` with `write_len` past the buffer is `Err(Size)`.
//! 4. `write_read` with `read_len` past the buffer is `Err(Size)`. The one
//!    driver that did check, apollo3, checked `write_len` and let this one by.
//! 5. A zero-length transfer answers something the HIL enumerates rather than
//!    panicking. rp2040 asserted on it, and a zero length arrives from a
//!    syscall argument on a board that exposes `i2c_master`.
//! 6. The buffer comes back. `hil::i2c` says `Err((error, buffer))` returns
//!    it, and a caller that does not get it back has lost it for good.
//!
//! And one clause that needs a second controller, through
//! [`TestI2cContract::check_uninitialized`]: a transfer on a controller that
//! was never brought up answers an error rather than taking the board down.
//! rp2040 asserted on that too.
//!
//! What this cannot check is everything on the other side of a `Ok(())`: that
//! a transfer completes, that `command_complete` arrives exactly once, that
//! `Error::Busy` refuses a second transfer while one is in flight, that
//! `AddressNak` comes back from an address nobody answers. All of those need a
//! bus with pull-ups on it. They are the reason this file is called a contract
//! test and not a driver test.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil::i2c::{self, Error, I2CMaster};
use kernel::utilities::cells::{OptionalCell, TakeCell};

/// Any address will do: no clause here reaches the bus, so nothing has to
/// answer. 0x55 is in the general 7-bit range and is not a reserved address.
const ADDR: u8 = 0x55;

pub struct TestI2cContract<'a, I: I2CMaster<'a>> {
    i2c: &'a I,
    buffer: TakeCell<'static, [u8]>,
    checks: Cell<usize>,
    failures: Cell<usize>,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
}

impl<'a, I: I2CMaster<'a>> TestI2cContract<'a, I> {
    /// `buffer` is only ever rejected, never transmitted, so its contents do
    /// not matter -- but its length does, since every clause asks for one byte
    /// more than it holds.
    pub fn new(i2c: &'a I, buffer: &'static mut [u8]) -> Self {
        Self {
            i2c,
            buffer: TakeCell::new(buffer),
            checks: Cell::new(0),
            failures: Cell::new(0),
            client: OptionalCell::empty(),
        }
    }

    /// Record one clause's outcome. `clause` is the sentence being checked, so
    /// a failure line reads without the source to hand.
    fn check(&self, ok: bool, clause: &str) {
        self.checks.set(self.checks.get() + 1);
        if ok {
            debug!("i2c-contract: ok   {}", clause);
        } else {
            self.failures.set(self.failures.get() + 1);
            debug!("i2c-contract: FAIL {}", clause);
        }
    }

    /// Clause 7. **Call this before the controller is initialised**, on the
    /// same controller `run` will use afterwards.
    ///
    /// It is separate from `run` because it is the only clause whose meaning
    /// depends on when it happens, and nothing in `hil::i2c` lets a test ask a
    /// controller whether it has been brought up.
    ///
    /// A driver may legitimately answer `Ok(())` if it needs no bring-up.
    /// What it may not do is panic, which is what rp2040 did: an
    /// `assert!(state != State::Uninitialized)` on a path `hil::i2c`
    /// documents as returning an error.
    pub fn check_uninitialized(&self) {
        let buffer = match self.buffer.take() {
            Some(b) => b,
            None => return,
        };
        let len = buffer.len();
        match self.i2c.write(ADDR, buffer, len) {
            Ok(()) => {
                // It accepted the transfer, so the buffer is gone until a
                // callback returns it and `run` has nothing to work with.
                self.check(
                    false,
                    "a transfer on an uninitialized controller must not start one",
                );
            }
            Err((error, b)) => {
                self.check(
                    enumerated(error),
                    "a transfer on an uninitialized controller answers an enumerated error",
                );
                self.buffer.replace(b);
            }
        }
    }

    pub fn run(&self) {
        let mut buf = match self.buffer.take() {
            Some(b) => b,
            None => {
                debug!("i2c-contract: no buffer; test cannot run");
                self.client
                    .map(|c| c.done(Err(CapsuleTestError::ErrorCode(ErrorCode::NOMEM))));
                return;
            }
        };
        let len = buf.len();
        let over = len + 1;

        // 1, 2, 3, 4. A length past the buffer it indexes is `Err(Size)`, and
        // 6: the buffer comes back with it every time, which is what lets the
        // next clause reuse it.
        buf = match self.i2c.write(ADDR, buf, over) {
            Ok(()) => {
                self.check(false, "write() with len past the buffer must be Err(Size)");
                // It started a transfer with a bad length. There is no buffer
                // to continue with and no callback is wired, so stop here
                // rather than report the rest against a live controller.
                self.finish();
                return;
            }
            Err((error, b)) => {
                self.check(
                    error == Error::Size,
                    "write() with len past the buffer is Err(Size)",
                );
                b
            }
        };

        buf = match self.i2c.read(ADDR, buf, over) {
            Ok(()) => {
                self.check(false, "read() with len past the buffer must be Err(Size)");
                self.finish();
                return;
            }
            Err((error, b)) => {
                self.check(
                    error == Error::Size,
                    "read() with len past the buffer is Err(Size)",
                );
                b
            }
        };

        buf = match self.i2c.write_read(ADDR, buf, over, 1) {
            Ok(()) => {
                self.check(
                    false,
                    "write_read() with write_len past the buffer must fail",
                );
                self.finish();
                return;
            }
            Err((error, b)) => {
                self.check(
                    error == Error::Size,
                    "write_read() with write_len past the buffer is Err(Size)",
                );
                b
            }
        };

        buf = match self.i2c.write_read(ADDR, buf, 1, over) {
            Ok(()) => {
                self.check(
                    false,
                    "write_read() with read_len past the buffer must fail",
                );
                self.finish();
                return;
            }
            Err((error, b)) => {
                self.check(
                    error == Error::Size,
                    "write_read() with read_len past the buffer is Err(Size)",
                );
                b
            }
        };

        // 5. A zero-length transfer. The HIL does not require one to work --
        // the Synopsys controller on the RP2 chips genuinely cannot do it, and
        // answers `NotSupported` -- only that asking is not fatal.
        match self.i2c.write(ADDR, buf, 0) {
            Ok(()) => self.check(true, "a zero-length write answers"),
            Err((error, b)) => {
                self.check(
                    enumerated(error),
                    "a zero-length write answers an enumerated error",
                );
                self.buffer.replace(b);
            }
        }

        self.finish();
    }

    fn finish(&self) {
        let (n, bad) = (self.checks.get(), self.failures.get());
        if bad == 0 {
            debug!("i2c-contract: {} clauses, all kept", n);
            self.client.map(|c| c.done(Ok(())));
        } else {
            debug!("i2c-contract: {} clauses, {} BROKEN", n, bad);
            self.client
                .map(|c| c.done(Err(CapsuleTestError::IncorrectResult)));
        }
    }
}

/// Whether `error` is one of the variants `hil::i2c` defines.
///
/// This is a match rather than a `true`, so that adding a variant to
/// [`i2c::Error`] makes the compiler ask whether this clause still means what
/// it says.
fn enumerated(error: Error) -> bool {
    match error {
        Error::AddressNak
        | Error::DataNak
        | Error::ArbitrationLost
        | Error::Overrun
        | Error::Size
        | Error::NotSupported
        | Error::Busy => true,
    }
}

impl<'a, I: I2CMaster<'a>> CapsuleTest for TestI2cContract<'a, I> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}

/// The client this test never registers.
///
/// `hil::i2c` has no way to ask a controller for its client back, and every
/// clause here is a rejection that makes no callback, so nothing is ever
/// called. Implementing it anyway keeps the test usable as the sole holder of
/// an `I2CMaster`, which a board needs it to be.
impl<'a, I: I2CMaster<'a>> i2c::I2CHwMasterClient for TestI2cContract<'a, I> {
    fn command_complete(&self, _buffer: &'static mut [u8], _status: Result<(), Error>) {
        debug!("i2c-contract: unexpected command_complete; no clause starts a transfer");
    }
}
