// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Interface for reading, writing, and erasing flash storage pages.
//!
//! Operates on single pages. The page size is set by the associated type
//! `page`. Here is an example of a page type and implementation of this trait:
//!
//! ```rust
//! use core::ops::{Index, IndexMut};
//!
//! use kernel::hil;
//! use kernel::ErrorCode;
//!
//! // Size in bytes
//! const PAGE_SIZE: u32 = 1024;
//!
//! struct NewChipPage(pub [u8; PAGE_SIZE as usize]);
//!
//! impl Default for NewChipPage {
//!     fn default() -> Self {
//!         Self {
//!             0: [0; PAGE_SIZE as usize],
//!         }
//!     }
//! }
//!
//! impl NewChipPage {
//!     fn len(&self) -> usize {
//!         self.0.len()
//!     }
//! }
//!
//! impl Index<usize> for NewChipPage {
//!     type Output = u8;
//!
//!     fn index(&self, idx: usize) -> &u8 {
//!         &self.0[idx]
//!     }
//! }
//!
//! impl IndexMut<usize> for NewChipPage {
//!     fn index_mut(&mut self, idx: usize) -> &mut u8 {
//!         &mut self.0[idx]
//!     }
//! }
//!
//! impl AsMut<[u8]> for NewChipPage {
//!     fn as_mut(&mut self) -> &mut [u8] {
//!         &mut self.0
//!     }
//! }
//!
//! struct NewChipStruct {};
//!
//! impl<'a, C> hil::flash::HasClient<'a, C> for NewChipStruct {
//!     fn set_client(&'a self, client: &'a C) { }
//! }
//!
//! impl hil::flash::Flash for NewChipStruct {
//!     type Page = NewChipPage;
//!
//!     fn read_page(&self, page_number: usize, buf: &'static mut Self::Page) -> Result<(), (ErrorCode, &'static mut Self::Page)> { Err((ErrorCode::FAIL, buf)) }
//!     fn write_page(&self, page_number: usize, buf: &'static mut Self::Page) -> Result<(), (ErrorCode, &'static mut Self::Page)> { Err((ErrorCode::FAIL, buf)) }
//!     fn erase_page(&self, page_number: usize) -> Result<(), ErrorCode> { Err(ErrorCode::FAIL) }
//! }
//! ```
//!
//! A user of this flash interface might look like:
//!
//! ```rust
//! use kernel::utilities::cells::TakeCell;
//! use kernel::hil;
//!
//! pub struct FlashUser<'a, F: hil::flash::Flash + 'static> {
//!     driver: &'a F,
//!     buffer: TakeCell<'static, F::Page>,
//! }
//!
//! impl<'a, F: hil::flash::Flash> FlashUser<'a, F> {
//!     pub fn new(driver: &'a F, buffer: &'static mut F::Page) -> FlashUser<'a, F> {
//!         FlashUser {
//!             driver: driver,
//!             buffer: TakeCell::new(buffer),
//!         }
//!     }
//! }
//!
//! impl<'a, F: hil::flash::Flash> hil::flash::Client<F> for FlashUser<'a, F> {
//!     fn read_complete(&self, buffer: &'static mut F::Page, result: Result<(), hil::flash::Error>) {}
//!     fn write_complete(&self, buffer: &'static mut F::Page, result: Result<(), hil::flash::Error>) { }
//!     fn erase_complete(&self, result: Result<(), hil::flash::Error>) {}
//! }
//! ```

use crate::ErrorCode;

/// Flash errors returned in the callbacks.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    /// An error occurred during the flash operation.
    FlashError,

    /// A flash memory protection violation was detected.
    FlashMemoryProtectionError,
}

pub trait HasClient<'a, C> {
    /// Set the client for this flash peripheral. The client will be called
    /// when operations complete.
    fn set_client(&'a self, client: &'a C);
}

/// A page of writable persistent flash memory.
///
/// # What every operation promises
///
/// All three are asynchronous. On `Ok(())` the operation has started and
/// exactly one [`Client`] callback will follow. On `Err` it did not start,
/// nothing on the device was touched, and **there will be no callback** --
/// `read_page` and `write_page` hand the buffer back inside the error, which
/// is the only way the caller gets it again.
///
/// The errors an implementation may return:
///
/// - [`ErrorCode::INVAL`]: `page_number` is past the end of the device. This
///   MUST be checked. Four of the nine implementations in this tree did not,
///   and the consequences are not uniform: two of them compute an address
///   from the page number and use it, so an out-of-range page reads or writes
///   somewhere else entirely, and two truncate or wrap it, which destroys a
///   page the caller never named while still reporting success. There is no
///   safe default for a caller to assume, because a page count is a property
///   of the part.
/// - [`ErrorCode::BUSY`]: an operation is already outstanding. An
///   implementation holds one buffer, so accepting a second loses the first
///   and the callback that would have returned it.
/// - [`ErrorCode::NOSUPPORT`]: the device cannot do this at all -- a
///   read-only mapping, or a part with no erase.
///
/// # Erasing before a write is NOT settled by this interface
///
/// Flash can only clear bits; setting one back to 1 needs an erase. Whether
/// [`Flash::write_page`] does that for you is the single most important thing
/// a caller needs to know, and **implementations in this tree disagree**:
///
/// - nrf52's `nvmc` erases when the page is not already blank, sam4l's
///   `flashcalw` erases unconditionally as part of its write state machine,
///   and `qemu_virt_chip`'s `pflash` erases only when a bit has to go from 0
///   to 1.
/// - apollo3's `flashctrl`, lowrisc's `flash_ctrl` and stm32f303xc's `flash`
///   do not erase at all. On the last of those, programming a half-word that
///   is not already `0xFFFF` raises `PGERR` and the write is reported failed.
///
/// So **a caller that needs the page to end up equal to its buffer must call
/// [`Flash::erase_page`] first** and not rely on the write to do it. That is
/// stated here as the fact it is, rather than as a rule, because picking one
/// reading would silently change three drivers or add an erase cycle to every
/// write on the other three, and neither belongs in a doc comment.
pub trait Flash {
    /// Type of a single flash page for the given implementation.
    type Page: AsMut<[u8]> + Default;

    /// Read a page of flash into the buffer.
    ///
    /// See the trait documentation for what the return values mean.
    fn read_page(
        &self,
        page_number: usize,
        buf: &'static mut Self::Page,
    ) -> Result<(), (ErrorCode, &'static mut Self::Page)>;

    /// Write a page of flash from the buffer.
    ///
    /// Read *Erasing before a write* on the trait before calling this: whether
    /// the previous contents are cleared for you is not something this
    /// interface settles.
    fn write_page(
        &self,
        page_number: usize,
        buf: &'static mut Self::Page,
    ) -> Result<(), (ErrorCode, &'static mut Self::Page)>;

    /// Erase a page of flash by setting every byte to 0xFF.
    ///
    /// See the trait documentation for what the return values mean.
    fn erase_page(&self, page_number: usize) -> Result<(), ErrorCode>;
}

/// Implement `Client` to receive callbacks from `Flash`.
///
/// Exactly one of these follows every call that returned `Ok(())`, and none
/// follows a call that returned `Err`.
pub trait Client<F: Flash> {
    /// Flash read complete.
    ///
    /// `read_buffer` is always the buffer passed to [`Flash::read_page`],
    /// whatever `result` says -- it is the only way it comes back.
    fn read_complete(&self, read_buffer: &'static mut F::Page, result: Result<(), Error>);

    /// Flash write complete.
    ///
    /// `write_buffer` is always the buffer passed to [`Flash::write_page`],
    /// whatever `result` says.
    fn write_complete(&self, write_buffer: &'static mut F::Page, result: Result<(), Error>);

    /// Flash erase complete.
    fn erase_complete(&self, result: Result<(), Error>);
}
