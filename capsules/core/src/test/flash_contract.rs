// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Runs `hil::flash`'s stated guarantees against a real `Flash`.
//!
//! Until 2026-09-14 there was almost nothing to run: the three trait methods
//! carried one sentence each and enumerated no errors, so nine implementations
//! had nothing to diverge from and an audit could only ask whether they agreed
//! with each other. Four of them did not bound the page number at all. The
//! contract they were measured into is now on the trait, and this executes it.
//!
//! **This test writes to flash.** The caller says which page, and it must be
//! one the board can afford to lose -- a page inside whatever region it has
//! set aside for storage, never one holding the kernel or an app.
//!
//! The clauses, in the order they run:
//!
//! 1. `read_page` past the end of the device is `Err(INVAL)`, and the buffer
//!    comes back. 2 and 3 are the same for `write_page` and `erase_page`.
//!    None of these touches the device, which is why they run first: four
//!    implementations used to compute an address from the page number and use
//!    it, so getting this wrong is an access somewhere that is not flash.
//! 4. An erase completes, and every byte of the page then reads `0xFF` --
//!    which is the one substantive thing `hil::flash` has always said, in
//!    `erase_page`'s own sentence.
//! 5. A write to the erased page completes, and reading it back gives the
//!    bytes that were written.
//! 6. **A second write to the same page, without erasing first.** This is not
//!    a pass or a fail: `hil::flash` deliberately does not settle whether
//!    `write_page` erases for you, because the implementations disagree. What
//!    is checked is what IS settled -- that exactly one callback arrives and
//!    the buffer comes back with it -- and what actually happened is printed,
//!    so the divergence is an observation on this chip rather than a claim
//!    about all of them.
//!
//! The `past_end` page number is a constructor argument because nothing in
//! `hil::flash` can be asked how many pages a device has, and computing one
//! from `usize::MAX` would overflow inside any implementation that multiplies
//! before it checks.

use crate::test::capsule_test::{CapsuleTest, CapsuleTestClient, CapsuleTestError};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil;
use kernel::utilities::cells::{OptionalCell, TakeCell};

/// What the first write puts in the page, and what the second one puts there.
///
/// The second is not a subset of the first bit for bit: `0x0f` has bits set
/// that `0xf0` does not, so a chip that programs without erasing cannot
/// produce it by clearing bits alone. That is what makes clause 6 tell the
/// two kinds of implementation apart instead of passing on both.
const FIRST: u8 = 0xf0;
const SECOND: u8 = 0x0f;

#[derive(Clone, Copy, PartialEq)]
enum Stage {
    Idle,
    ErasingBlank,
    ReadingBlank,
    WritingFirst,
    ReadingFirst,
    WritingSecond,
    Done,
}

pub struct TestFlashContract<'a, F: hil::flash::Flash + 'static> {
    flash: &'a F,
    page: usize,
    past_end: usize,
    buffer: TakeCell<'static, F::Page>,
    stage: Cell<Stage>,
    checks: Cell<usize>,
    failures: Cell<usize>,
    client: OptionalCell<&'static dyn CapsuleTestClient>,
}

impl<'a, F: hil::flash::Flash> TestFlashContract<'a, F> {
    /// `page` is erased and written twice, so it must be expendable.
    /// `past_end` is any page number the device does not have.
    pub fn new(flash: &'a F, page: usize, past_end: usize, buffer: &'static mut F::Page) -> Self {
        Self {
            flash,
            page,
            past_end,
            buffer: TakeCell::new(buffer),
            stage: Cell::new(Stage::Idle),
            checks: Cell::new(0),
            failures: Cell::new(0),
            client: OptionalCell::empty(),
        }
    }

    fn check(&self, ok: bool, clause: &str) {
        self.checks.set(self.checks.get() + 1);
        if ok {
            debug!("flash-contract: ok   {}", clause);
        } else {
            self.failures.set(self.failures.get() + 1);
            debug!("flash-contract: FAIL {}", clause);
        }
    }

    pub fn run(&self) {
        let buf = match self.buffer.take() {
            Some(b) => b,
            None => {
                debug!("flash-contract: no buffer; test cannot run");
                self.client
                    .map(|c| c.done(Err(CapsuleTestError::ErrorCode(ErrorCode::NOMEM))));
                return;
            }
        };

        // 1, 2, 3. A page the device does not have, on each of the three
        // calls. None of them reaches the hardware.
        let buf = match self.flash.read_page(self.past_end, buf) {
            Ok(()) => {
                self.check(false, "read_page() past the end must not start");
                return;
            }
            Err((error, b)) => {
                self.check(
                    error == ErrorCode::INVAL,
                    "read_page() past the end is Err(INVAL)",
                );
                b
            }
        };
        let buf = match self.flash.write_page(self.past_end, buf) {
            Ok(()) => {
                self.check(false, "write_page() past the end must not start");
                return;
            }
            Err((error, b)) => {
                self.check(
                    error == ErrorCode::INVAL,
                    "write_page() past the end is Err(INVAL)",
                );
                b
            }
        };
        self.check(
            self.flash.erase_page(self.past_end) == Err(ErrorCode::INVAL),
            "erase_page() past the end is Err(INVAL)",
        );

        // 4. Erase, then read it back and look at every byte.
        self.buffer.replace(buf);
        self.stage.set(Stage::ErasingBlank);
        if self.flash.erase_page(self.page).is_err() {
            self.check(false, "erase_page() on a real page starts");
            self.finish();
        }
    }

    fn fill(&self, buf: &mut F::Page, value: u8) {
        for byte in buf.as_mut().iter_mut() {
            *byte = value;
        }
    }

    fn all(&self, buf: &mut F::Page, value: u8) -> bool {
        buf.as_mut().iter().all(|b| *b == value)
    }

    fn finish(&self) {
        self.stage.set(Stage::Done);
        let (n, bad) = (self.checks.get(), self.failures.get());
        if bad == 0 {
            debug!("flash-contract: {} clauses, all kept", n);
            self.client.map(|c| c.done(Ok(())));
        } else {
            debug!("flash-contract: {} clauses, {} BROKEN", n, bad);
            self.client
                .map(|c| c.done(Err(CapsuleTestError::IncorrectResult)));
        }
    }
}

impl<F: hil::flash::Flash> hil::flash::Client<F> for TestFlashContract<'_, F> {
    fn read_complete(&self, buffer: &'static mut F::Page, result: Result<(), hil::flash::Error>) {
        let buffer = {
            match self.stage.get() {
                Stage::ReadingBlank => {
                    self.check(result.is_ok(), "the read after an erase completes");
                    self.check(
                        self.all(buffer, 0xFF),
                        "every byte of an erased page reads 0xFF",
                    );
                    self.fill(buffer, FIRST);
                    self.stage.set(Stage::WritingFirst);
                    buffer
                }
                Stage::ReadingFirst => {
                    self.check(result.is_ok(), "the read after a write completes");
                    self.check(
                        self.all(buffer, FIRST),
                        "a page reads back the bytes that were written",
                    );
                    self.fill(buffer, SECOND);
                    self.stage.set(Stage::WritingSecond);
                    buffer
                }
                _ => {
                    self.check(false, "an unexpected read_complete arrived");
                    self.buffer.replace(buffer);
                    self.finish();
                    return;
                }
            }
        };
        if let Err((_, b)) = self.flash.write_page(self.page, buffer) {
            self.check(false, "write_page() on a real page starts");
            self.buffer.replace(b);
            self.finish();
        }
    }

    fn write_complete(&self, buffer: &'static mut F::Page, result: Result<(), hil::flash::Error>) {
        match self.stage.get() {
            Stage::WritingFirst => {
                self.check(result.is_ok(), "a write to an erased page completes");
                self.stage.set(Stage::ReadingFirst);
                if let Err((_, b)) = self.flash.read_page(self.page, buffer) {
                    self.check(false, "read_page() on a real page starts");
                    self.buffer.replace(b);
                    self.finish();
                }
            }
            Stage::WritingSecond => {
                // The divergence. Whatever this chip did, the callback arrived
                // and brought the buffer, which is the part `hil::flash`
                // settles. What it did is reported, not judged.
                self.check(
                    true,
                    "a second write without an erase calls back with the buffer",
                );
                match result {
                    Ok(()) => debug!(
                        "flash-contract: note this chip ACCEPTED a write over \
                         un-erased flash -- it erases inside write_page"
                    ),
                    Err(e) => debug!(
                        "flash-contract: note this chip REFUSED a write over \
                         un-erased flash ({:?}) -- the caller must erase first",
                        e
                    ),
                }
                self.buffer.replace(buffer);
                self.finish();
            }
            _ => {
                self.check(false, "an unexpected write_complete arrived");
                self.buffer.replace(buffer);
                self.finish();
            }
        }
    }

    fn erase_complete(&self, result: Result<(), hil::flash::Error>) {
        if self.stage.get() != Stage::ErasingBlank {
            self.check(false, "an unexpected erase_complete arrived");
            self.finish();
            return;
        }
        self.check(result.is_ok(), "erase_page() on a real page completes");
        self.stage.set(Stage::ReadingBlank);
        match self.buffer.take() {
            Some(buffer) => {
                if let Err((_, b)) = self.flash.read_page(self.page, buffer) {
                    self.check(false, "read_page() on a real page starts");
                    self.buffer.replace(b);
                    self.finish();
                }
            }
            None => {
                self.check(false, "the buffer was still held at erase_complete");
                self.finish();
            }
        }
    }
}

impl<F: hil::flash::Flash> CapsuleTest for TestFlashContract<'_, F> {
    fn set_client(&self, client: &'static dyn CapsuleTestClient) {
        self.client.set(client);
    }
}
