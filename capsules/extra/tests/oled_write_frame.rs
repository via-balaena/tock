// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! `Sh1106` and `Ssd1306` against a write frame and a buffer that do not
//! agree.
//!
//! Both drivers paint the same kind of paged mono panel and neither checked
//! the frame it was handed. They fail differently, which is why both are
//! here: the SH1106 walks the frame page by page and indexes off the end of
//! a slice, while the SSD1306 folds the frame into two panel commands whose
//! arithmetic underflows on an empty one.
//!
//! The driver walks the frame one page at a time and indexes the caller's
//! data by the frame's geometry alone. Neither the frame nor the length of
//! the data is checked against anything, and both come from an app: the
//! screen syscall driver passes `set_write_frame` straight through from
//! command 100, and sizes the buffer it hands down from the length the app
//! asked to write. So an ordinary syscall could index past the end of a
//! slice, which in the kernel is a panic.
//!
//! These are integration tests rather than a `#[cfg(test)] mod tests` inside
//! the capsule so that the `'static` buffers the driver requires can be
//! leaked rather than declared with `static_init!`, which is board-only.
//!
//! The fake I2C device never completes a transfer on its own. The test
//! decides when each one lands, which is what makes the page walk
//! observable one step at a time.

use capsules_extra::sh1106::{BUFFER_SIZE, Sh1106};
use capsules_extra::ssd1306::{BUFFER_SIZE as SSD1306_BUFFER_SIZE, Ssd1306};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::hil;
use kernel::hil::screen::Screen;
use kernel::utilities::cells::{MapCell, OptionalCell};
use kernel::utilities::leasable_buffer::SubSliceMut;

/// An I2C device that accepts every write and holds the buffer until the
/// test delivers the completion.
struct FakeI2c {
    client: OptionalCell<&'static dyn hil::i2c::I2CClient>,
    inflight: MapCell<&'static mut [u8]>,
    writes: Cell<usize>,
    last_len: Cell<usize>,
}

impl FakeI2c {
    fn new() -> Self {
        Self {
            client: OptionalCell::empty(),
            inflight: MapCell::empty(),
            writes: Cell::new(0),
            last_len: Cell::new(0),
        }
    }

    fn set_client(&self, client: &'static dyn hil::i2c::I2CClient) {
        self.client.set(client);
    }

    /// Deliver the completion for the transfer in flight, if there is one.
    /// Answers whether there was.
    fn complete(&self) -> bool {
        match self.inflight.take() {
            Some(buffer) => {
                if let Some(client) = self.client.get() {
                    client.command_complete(buffer, Ok(()));
                }
                true
            }
            None => false,
        }
    }
}

impl hil::i2c::I2CDevice for FakeI2c {
    fn enable(&self) {}

    fn disable(&self) {}

    fn write_read(
        &self,
        data: &'static mut [u8],
        _write_len: usize,
        _read_len: usize,
    ) -> Result<(), (hil::i2c::Error, &'static mut [u8])> {
        Err((hil::i2c::Error::NotSupported, data))
    }

    fn write(
        &self,
        data: &'static mut [u8],
        len: usize,
    ) -> Result<(), (hil::i2c::Error, &'static mut [u8])> {
        self.writes.set(self.writes.get() + 1);
        self.last_len.set(len);
        self.inflight.replace(data);
        Ok(())
    }

    fn read(
        &self,
        buffer: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (hil::i2c::Error, &'static mut [u8])> {
        Err((hil::i2c::Error::NotSupported, buffer))
    }
}

/// Records what the driver promised the caller.
struct RecordingClient {
    completes: Cell<usize>,
    last_result: Cell<Result<(), ErrorCode>>,
    returned_first_byte: Cell<u8>,
}

impl RecordingClient {
    fn new() -> Self {
        Self {
            completes: Cell::new(0),
            last_result: Cell::new(Ok(())),
            returned_first_byte: Cell::new(0),
        }
    }
}

impl hil::screen::ScreenClient for RecordingClient {
    fn command_complete(&self, _result: Result<(), ErrorCode>) {}

    fn write_complete(&self, buffer: SubSliceMut<'static, u8>, result: Result<(), ErrorCode>) {
        self.completes.set(self.completes.get() + 1);
        self.last_result.set(result);
        self.returned_first_byte
            .set(buffer.as_slice().first().copied().unwrap_or(0));
    }

    fn screen_is_ready(&self) {}
}

/// Everything is leaked, which is how the `'static` lifetimes the driver
/// requires are satisfied outside a board crate.
fn fixture() -> (
    &'static FakeI2c,
    &'static Sh1106<'static, FakeI2c>,
    &'static RecordingClient,
) {
    let i2c: &'static FakeI2c = Box::leak(Box::new(FakeI2c::new()));
    let buffer: &'static mut [u8] = Box::leak(Box::new([0u8; BUFFER_SIZE]));
    let screen: &'static Sh1106<'static, FakeI2c> =
        Box::leak(Box::new(Sh1106::new(i2c, buffer, true)));
    let client: &'static RecordingClient = Box::leak(Box::new(RecordingClient::new()));
    i2c.set_client(screen);
    screen.set_client(client);
    (i2c, screen, client)
}

/// Run the page walk to a standstill. Bounded so that a driver which keeps
/// issuing transfers fails the assertion rather than hanging the suite.
fn drain(i2c: &FakeI2c) {
    for _ in 0..(BUFFER_SIZE * 2) {
        if !i2c.complete() {
            return;
        }
    }
    panic!("the driver never stopped issuing I2C transfers");
}

/// A leaked buffer of `len` bytes, every one set to `fill`.
fn data(len: usize, fill: u8) -> SubSliceMut<'static, u8> {
    SubSliceMut::new(Box::leak(vec![fill; len].into_boxed_slice()))
}

/// The error half of a refused write, having first checked that the buffer
/// came back and is the one that was offered.
///
/// The caller of `write` holds one `'static` buffer and has no way to ask
/// for it back, so a refusal that keeps it is permanent.
fn refused(
    result: Result<(), (ErrorCode, SubSliceMut<'static, u8>)>,
    expected_fill: u8,
) -> ErrorCode {
    match result {
        Ok(()) => panic!("the write was accepted when it should have been refused"),
        Err((e, buffer)) => {
            assert_eq!(
                buffer.as_slice().first().copied(),
                Some(expected_fill),
                "a refused write has to hand the buffer back"
            );
            e
        }
    }
}

#[test]
fn a_frame_wider_than_the_panel_is_refused() {
    let (_i2c, screen, _client) = fixture();

    // 200 exceeds both the 128-pixel panel and the 131 bytes of the
    // driver's I2C buffer that are left once the data header takes one.
    assert_eq!(
        screen.set_write_frame(0, 0, 200, 8),
        Err(ErrorCode::INVAL),
        "a frame wider than the panel has to be refused, not truncated to \
         its low eight bits"
    );

    // 384 is the same refusal for a different reason: it is the value that
    // `as u8` turns into a legal-looking 128.
    assert_eq!(screen.set_write_frame(0, 0, 384, 8), Err(ErrorCode::INVAL));

    // Off the bottom, and off the right by one.
    assert_eq!(screen.set_write_frame(0, 0, 128, 72), Err(ErrorCode::INVAL));
    assert_eq!(screen.set_write_frame(1, 0, 128, 8), Err(ErrorCode::INVAL));
}

#[test]
fn a_frame_that_fits_is_accepted() {
    let (i2c, screen, _client) = fixture();

    // The positive control for the test above: the guard must not be
    // refusing everything.
    assert_eq!(screen.set_write_frame(0, 0, 128, 64), Ok(()));
    assert!(
        i2c.writes.get() > 0,
        "the frame commands must reach the bus"
    );
}

#[test]
fn data_shorter_than_the_frame_does_not_index_past_it() {
    let (i2c, screen, client) = fixture();

    assert_eq!(screen.set_write_frame(0, 0, 128, 64), Ok(()));
    assert!(i2c.complete(), "the frame commands are in flight");

    // A full frame spans 1024 bytes. The screen syscall driver will hand
    // down fewer whenever the app asks to write fewer -- it sizes the chunk
    // from `write_len`, which is the app's own argument to command 200.
    assert!(screen.write(data(100, 0xAA), false).is_ok());
    drain(i2c);

    assert_eq!(
        client.completes.get(),
        1,
        "a write that was accepted has to report"
    );
}

#[test]
fn a_second_write_is_refused_rather_than_dropping_the_first() {
    let (i2c, screen, client) = fixture();

    assert_eq!(screen.set_write_frame(0, 0, 128, 8), Ok(()));
    assert!(i2c.complete());

    // First write: 128 bytes, one page, still in flight.
    assert!(screen.write(data(128, 0x11), false).is_ok());

    // Second write while the first has not reported. The HIL enumerates
    // BUSY for exactly this -- "another write is in progress" -- and the
    // screen syscall driver keeps a BUSY command queued and re-runs it from
    // the driver's own callback.
    assert_eq!(
        refused(screen.write(data(128, 0x22), false), 0x22),
        ErrorCode::BUSY,
        "a write during a write is BUSY, and the HIL does not enumerate \
         NOMEM here at all"
    );

    drain(i2c);

    assert_eq!(client.completes.get(), 1);
    assert_eq!(
        client.returned_first_byte.get(),
        0x11,
        "the buffer handed back has to be the one still in flight; the \
         refused write must not have replaced it"
    );
}

/// The SSD1306 fixture. Same fake, different driver.
fn ssd1306_fixture() -> (
    &'static FakeI2c,
    &'static Ssd1306<'static, FakeI2c>,
    &'static RecordingClient,
) {
    let i2c: &'static FakeI2c = Box::leak(Box::new(FakeI2c::new()));
    let buffer: &'static mut [u8] = Box::leak(Box::new([0u8; SSD1306_BUFFER_SIZE]));
    let screen: &'static Ssd1306<'static, FakeI2c> =
        Box::leak(Box::new(Ssd1306::new(i2c, buffer, true)));
    let client: &'static RecordingClient = Box::leak(Box::new(RecordingClient::new()));
    i2c.set_client(screen);
    screen.set_client(client);
    (i2c, screen, client)
}

#[test]
fn ssd1306_refuses_a_frame_its_commands_cannot_express() {
    let (_i2c, screen, _client) = ssd1306_fixture();

    // `x + width - 1` underflows on an empty frame, and `(y / 8) +
    // (height / 8) - 1` underflows on anything shorter than one page.
    assert_eq!(screen.set_write_frame(0, 0, 0, 8), Err(ErrorCode::INVAL));
    assert_eq!(screen.set_write_frame(0, 0, 128, 0), Err(ErrorCode::INVAL));
    assert_eq!(screen.set_write_frame(0, 0, 128, 4), Err(ErrorCode::INVAL));

    // And a frame off the edge of the panel.
    assert_eq!(screen.set_write_frame(0, 0, 200, 8), Err(ErrorCode::INVAL));
    assert_eq!(screen.set_write_frame(0, 8, 128, 64), Err(ErrorCode::INVAL));
}

#[test]
fn ssd1306_accepts_a_frame_that_fits() {
    let (i2c, screen, _client) = ssd1306_fixture();

    // The positive control for the refusals above.
    assert_eq!(screen.set_write_frame(0, 0, 128, 64), Ok(()));
    assert!(
        i2c.writes.get() > 0,
        "the frame commands must reach the bus"
    );
}

#[test]
fn ssd1306_refuses_data_too_long_for_its_buffer_rather_than_shortening_it() {
    let (i2c, screen, client) = ssd1306_fixture();

    assert_eq!(screen.set_write_frame(0, 0, 128, 64), Ok(()));
    assert!(i2c.complete());

    // One byte of the driver's buffer carries the data header, so this is
    // one more than a single transfer can hold.
    let too_long = SSD1306_BUFFER_SIZE;
    assert_eq!(
        refused(screen.write(data(too_long, 0x33), false), 0x33),
        ErrorCode::SIZE,
        "an over-long write is refused; it used to send the first {} bytes \
         and then report Ok(()) for all {}",
        SSD1306_BUFFER_SIZE - 1,
        too_long
    );

    // Positive control: a full frame still goes out and reports.
    assert!(screen.write(data(1024, 0x44), false).is_ok());
    drain(i2c);
    assert_eq!(client.completes.get(), 1);
    assert_eq!(client.last_result.get(), Ok(()));
}

#[test]
fn ssd1306_refuses_a_second_write_as_busy() {
    let (i2c, screen, client) = ssd1306_fixture();

    assert_eq!(screen.set_write_frame(0, 0, 128, 64), Ok(()));
    assert!(i2c.complete());

    assert!(screen.write(data(1024, 0x55), false).is_ok());
    assert_eq!(
        refused(screen.write(data(1024, 0x66), false), 0x66),
        ErrorCode::BUSY,
        "the HIL enumerates BUSY for another write in progress, not NOMEM"
    );

    drain(i2c);
    assert_eq!(client.completes.get(), 1);
    assert_eq!(client.returned_first_byte.get(), 0x55);
}
