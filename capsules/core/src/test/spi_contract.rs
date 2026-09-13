// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Check a `hil::spi` controller against the return values it documents.
//!
//! The companion to `uart_contract`, and built for the same reason: an audit
//! on 2026-09-13 read six `hil::spi` guarantees against every implementation
//! in the tree and **found a divergence in every one**. Among them, nine of
//! eleven started a zero-length transfer and answered `Ok(())`, promising a
//! callback the hardware has no reason to raise and leaving the bus busy for
//! every other client.
//!
//! Unlike the uart test, this one cannot be gated: **no emulated board in the
//! tree exposes SPI**, so it runs on hardware or not at all.
//!
//! Each check names the clause it is checking, so a failure says which
//! sentence was broken. The clauses:
//!
//! 1. `is_busy()` is false when nothing is outstanding.
//! 2. `Err(INVAL)` when the transfer length is 0. Nine implementations
//!    instead started the transfer.
//! 3. A transfer on an idle bus starts.
//! 4. `is_busy()` is true while one is outstanding. One implementation
//!    answered a constant `false`, so no client could ever tell.
//! 5. `Err(BUSY)` for a second transfer. Three did not check, and one of
//!    those used a `debug_assert!`, which enforces nothing in a release
//!    build and then discards the outstanding buffers.
//! 6. The completion reports `Ok(len)`.
//! 7. The write buffer comes back with its contents unmodified.
//! 8. Both buffers come back with their bounds unmodified.
//! 9. `is_busy()` is false again once the callback has been made.
//! 10. The blocking byte methods answer a documented code rather than
//!     panicking. One implementation answered `unimplemented!()`.
//!
//! With `new_loopback`, and MOSI jumpered to MISO, one more: the bytes read
//! back match the bytes written. Without that jumper MISO floats and what
//! comes back means nothing, which is why it is a separate constructor
//! rather than something inferred.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil::spi;
use kernel::utilities::cells::{MapCell, OptionalCell};
use kernel::utilities::leasable_buffer::SubSliceMut;

/// What the transfer sends. Alternating bits, all-clear and all-set, so a
/// stuck bit or a reversed order shows up rather than passing by luck.
const PATTERN: [u8; 4] = [0x55, 0xaa, 0x00, 0xff];

#[derive(Clone, Copy, PartialEq)]
enum Stage {
    Idle,
    AwaitingTransfer,
    Done,
}

pub struct TestSpiContract<'a, S: spi::SpiMaster<'a> + 'a> {
    spi: &'a S,
    /// Handed to the bus and given back through the callback or an error.
    write: MapCell<SubSliceMut<'static, u8>>,
    read: MapCell<SubSliceMut<'static, u8>>,
    /// A third buffer, so a second transfer can be attempted while the first
    /// is in flight without borrowing the one already inside the driver.
    spare: MapCell<SubSliceMut<'static, u8>>,
    failures: Cell<usize>,
    checks: Cell<usize>,
    stage: Cell<Stage>,
    /// Whether MOSI is jumpered to MISO. The caller has to say; nothing in
    /// `hil::spi` can tell.
    loopback: bool,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
}

impl<'a, S: spi::SpiMaster<'a>> TestSpiContract<'a, S> {
    pub fn new(
        spi: &'a S,
        write: &'static mut [u8],
        read: &'static mut [u8],
        spare: &'static mut [u8],
    ) -> Self {
        Self::build(spi, write, read, spare, false)
    }

    /// The same test, plus the clause that needs MOSI jumpered to MISO: that
    /// the bytes read back are the bytes written.
    pub fn new_loopback(
        spi: &'a S,
        write: &'static mut [u8],
        read: &'static mut [u8],
        spare: &'static mut [u8],
    ) -> Self {
        Self::build(spi, write, read, spare, true)
    }

    fn build(
        spi: &'a S,
        write: &'static mut [u8],
        read: &'static mut [u8],
        spare: &'static mut [u8],
        loopback: bool,
    ) -> Self {
        Self {
            spi,
            write: MapCell::new(write.into()),
            read: MapCell::new(read.into()),
            spare: MapCell::new(spare.into()),
            failures: Cell::new(0),
            checks: Cell::new(0),
            stage: Cell::new(Stage::Idle),
            loopback,
            client: OptionalCell::empty(),
        }
    }

    fn check(&self, ok: bool, clause: &str) {
        self.checks.set(self.checks.get() + 1);
        if ok {
            debug!("spi-contract: ok   {}", clause);
        } else {
            self.failures.set(self.failures.get() + 1);
            debug!("spi-contract: FAIL {}", clause);
        }
    }

    /// The blocking byte calls. `hil::spi` documents `Ok`, `Err(OFF)`,
    /// `Err(BUSY)` and `Err(FAIL)` for each. Reaching the line after the call
    /// is itself the check that it did not panic.
    ///
    /// **Call this only from ordinary context, never from a callback.** These
    /// are documented as blocking, and at least one implementation busy-waits
    /// on a FIFO flag that cannot change while an interrupt handler is on the
    /// stack.
    fn check_byte_methods(&self) {
        fn enumerated<T>(r: Result<T, ErrorCode>) -> bool {
            matches!(
                r,
                Ok(_) | Err(ErrorCode::OFF) | Err(ErrorCode::BUSY) | Err(ErrorCode::FAIL)
            )
        }
        self.check(
            enumerated(self.spi.write_byte(0x5a)),
            "write_byte() must answer a code the HIL enumerates",
        );
        self.check(
            enumerated(self.spi.read_byte()),
            "read_byte() must answer a code the HIL enumerates",
        );
        self.check(
            enumerated(self.spi.read_write_byte(0x5a)),
            "read_write_byte() must answer a code the HIL enumerates",
        );
    }

    fn finish(&self) {
        self.stage.set(Stage::Done);
        let (n, bad) = (self.checks.get(), self.failures.get());
        if bad == 0 {
            debug!("spi-contract: {} clauses, all kept", n);
            self.client.map(|c| c.done(Ok(())));
        } else {
            debug!("spi-contract: {} clauses, {} BROKEN", n, bad);
            self.client
                .map(|c| c.done(Err(CapsuleTestError::IncorrectResult)));
        }
    }

    pub fn run(&self) {
        self.check(!self.spi.is_busy(), "is_busy() is false when idle");

        // Before anything is in flight, and NOT from the completion callback.
        // These calls are blocking by design -- `hil::spi` says so: *"Not for
        // general use because it is blocking: intended for debugging."* On
        // rp2xxx `write_byte` spins on `while !SSPSR.TFE {}`, so calling it
        // from `read_write_done` -- which runs inside the SPI interrupt
        // handler -- hangs the kernel with the transmit FIFO non-empty. That
        // is exactly what it did, and the register read that diagnosed it
        // showed TFE clear and BSY set.
        self.check_byte_methods();

        let (mut write, read) = match (self.write.take(), self.read.take()) {
            (Some(w), Some(r)) => (w, r),
            _ => {
                debug!("spi-contract: no buffers; test cannot run");
                self.client
                    .map(|c| c.done(Err(CapsuleTestError::ErrorCode(ErrorCode::NOMEM))));
                return;
            }
        };

        // 2. A zero-length transfer must be refused, and both buffers handed
        //    back. Starting it instead leaves the bus busy for good.
        write.slice(0..0);
        let (mut write, read) = match self.spi.read_write_bytes(write, Some(read)) {
            Ok(()) => {
                self.check(
                    false,
                    "read_write_bytes() of length 0 must answer Err(INVAL)",
                );
                // The buffers are inside the driver and the test cannot go on.
                self.finish();
                return;
            }
            Err((e, w, r)) => {
                self.check(
                    e == ErrorCode::INVAL,
                    "read_write_bytes() of length 0 must answer Err(INVAL)",
                );
                match r {
                    Some(r) => (w, r),
                    None => {
                        self.check(false, "an Err must return the read buffer too");
                        self.finish();
                        return;
                    }
                }
            }
        };

        write.reset();
        write[..PATTERN.len()].copy_from_slice(&PATTERN);
        write.slice(0..PATTERN.len());

        // Slice the read buffer to the same window. The clause below is that
        // the bounds come back as they went in, so they have to go in known.
        let mut read = read;
        read.reset();
        read.slice(0..PATTERN.len());

        match self.spi.read_write_bytes(write, Some(read)) {
            Ok(()) => {
                self.stage.set(Stage::AwaitingTransfer);
                self.check(true, "read_write_bytes() on an idle bus must start");
                self.check(
                    self.spi.is_busy(),
                    "is_busy() is true while one is outstanding",
                );

                // 5. A second transfer must be refused rather than replace it.
                if let Some(spare) = self.spare.take() {
                    match self.spi.read_write_bytes(spare, None) {
                        Ok(()) => self.check(
                            false,
                            "read_write_bytes() while one is outstanding must answer Err(BUSY)",
                        ),
                        Err((e, returned, _)) => {
                            self.check(
                                e == ErrorCode::BUSY,
                                "read_write_bytes() while one is outstanding must answer Err(BUSY)",
                            );
                            self.spare.put(returned);
                        }
                    }
                }
                // The callback finishes the test. If it never arrives the
                // test simply never reports, which is the signal that a
                // completed transfer did not call back.
            }
            Err((e, _w, _r)) => {
                self.check(false, "read_write_bytes() on an idle bus must start");
                debug!("spi-contract: refused with {:?}", e);
                self.finish();
            }
        }
    }
}

impl<'a, S: spi::SpiMaster<'a>> spi::SpiMasterClient for TestSpiContract<'a, S> {
    fn read_write_done(
        &self,
        write_buffer: SubSliceMut<'static, u8>,
        read_buffer: Option<SubSliceMut<'static, u8>>,
        status: Result<usize, ErrorCode>,
    ) {
        if self.stage.get() != Stage::AwaitingTransfer {
            self.check(
                false,
                "read_write_bytes() that answered Err must not call back",
            );
            return;
        }

        self.check(
            status == Ok(PATTERN.len()),
            "a completed transfer reports Ok(len)",
        );

        // *"The contents of `write_buffer` is unmodified."*
        self.check(
            write_buffer.as_slice() == PATTERN,
            "the write buffer comes back unmodified",
        );

        // *"Each buffer's bounds are unmodified from their state when
        // `read_write_bytes` is called."*
        self.check(
            write_buffer.len() == PATTERN.len(),
            "the write buffer's bounds come back unmodified",
        );

        match read_buffer {
            Some(read) => {
                self.check(
                    read.len() == PATTERN.len(),
                    "the read buffer's bounds come back unmodified",
                );
                if self.loopback {
                    let matched = read.as_slice() == PATTERN;
                    self.check(matched, "the bytes read back match the bytes written");
                    if !matched {
                        debug!(
                            "spi-contract:   wrote {:?} read {:?}",
                            PATTERN,
                            read.as_slice()
                        );
                    }
                }
            }
            None => self.check(false, "a transfer given a read buffer must return it"),
        }

        self.check(
            !self.spi.is_busy(),
            "is_busy() is false once the callback has been made",
        );

        self.finish();
    }
}

impl<'a, S: spi::SpiMaster<'a>> CapsuleTest for TestSpiContract<'a, S> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}
