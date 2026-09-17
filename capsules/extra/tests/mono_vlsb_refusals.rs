// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! `ScreenARGB8888ToMono8BitPage` when the underlying screen refuses.
//!
//! This adapter is the only `Screen` implementer in the tree that calls
//! `Screen::write` from inside a **callback** rather than from a downcall:
//! `command_complete` runs `write_current_sub_op`, which writes. Two silicon
//! experiments on 2026-09-16 -- the boot readiness gap, and two processes
//! contending for one panel -- both drove `write` only from the syscall
//! driver's downcall path, so this arrival order has never been exercised.
//!
//! What is asserted is **buffer conservation**, not error codes. Every
//! `'static` buffer that goes into this adapter has exactly one way back out,
//! and the adapter holds two: the client's, and its own draw buffer. Losing
//! either is silent -- there is no error, no panic, and no log line, just a
//! screen that stops working some time later. So each test that provokes a
//! refusal then performs a **complete successful write afterwards**: that is
//! what proves the draw buffer is still there, and no assertion about the
//! refusal itself can show it.
//!
//! No board wires this adapter today, which is why it is a host test.

use capsules_extra::screen::screen_adapters::mono_vlsb::ScreenARGB8888ToMono8BitPage;
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::hil::screen::{Screen, ScreenClient, ScreenPixelFormat, ScreenRotation};
use kernel::utilities::cells::{MapCell, OptionalCell};
use kernel::utilities::leasable_buffer::SubSliceMut;

/// One page of an 8x8 frame: 8 source bytes in, 8*8 pixels * 4 bytes out.
const FRAME_W: usize = 8;
const FRAME_H: usize = 8;
const SRC_BYTES: usize = FRAME_W * FRAME_H / 8;
const DRAW_CAP: usize = FRAME_W * FRAME_H * 4;

/// A screen that refuses on demand and never completes anything by itself.
///
/// The test decides when each callback lands, which is the only way the
/// callback arrival order under test can be driven deliberately.
struct FakeScreen {
    client: OptionalCell<&'static dyn ScreenClient>,
    /// Set to make the next `set_write_frame` refuse.
    refuse_frame: Cell<Option<ErrorCode>>,
    /// Set to make the next `write` refuse.
    refuse_write: Cell<Option<ErrorCode>>,
    /// A frame command accepted and awaiting its callback.
    frame_pending: Cell<bool>,
    /// A write accepted, holding the adapter's draw buffer.
    write_pending: MapCell<SubSliceMut<'static, u8>>,
    frames: Cell<usize>,
    writes: Cell<usize>,
}

impl FakeScreen {
    fn new() -> Self {
        Self {
            client: OptionalCell::empty(),
            refuse_frame: Cell::new(None),
            refuse_write: Cell::new(None),
            frame_pending: Cell::new(false),
            write_pending: MapCell::empty(),
            frames: Cell::new(0),
            writes: Cell::new(0),
        }
    }

    /// Deliver a pending `command_complete`. Answers whether there was one.
    fn complete_frame(&self) -> bool {
        if !self.frame_pending.replace(false) {
            return false;
        }
        if let Some(c) = self.client.get() {
            c.command_complete(Ok(()));
        }
        true
    }

    /// Deliver a pending `write_complete`. Answers whether there was one.
    fn complete_write(&self) -> bool {
        match self.write_pending.take() {
            Some(buffer) => {
                if let Some(c) = self.client.get() {
                    c.write_complete(buffer, Ok(()));
                }
                true
            }
            None => false,
        }
    }
}

impl Screen<'static> for FakeScreen {
    fn set_client(&self, client: &'static dyn ScreenClient) {
        self.client.set(client);
    }

    fn get_resolution(&self) -> (usize, usize) {
        (FRAME_W, FRAME_H)
    }

    fn get_pixel_format(&self) -> ScreenPixelFormat {
        ScreenPixelFormat::BGRA_8888
    }

    fn get_rotation(&self) -> ScreenRotation {
        ScreenRotation::Normal
    }

    fn set_write_frame(
        &self,
        _x: usize,
        _y: usize,
        _width: usize,
        _height: usize,
    ) -> Result<(), ErrorCode> {
        self.frames.set(self.frames.get() + 1);
        match self.refuse_frame.get() {
            Some(e) => Err(e),
            None => {
                self.frame_pending.set(true);
                Ok(())
            }
        }
    }

    fn write(
        &self,
        buffer: SubSliceMut<'static, u8>,
        _continue_write: bool,
    ) -> Result<(), (ErrorCode, SubSliceMut<'static, u8>)> {
        self.writes.set(self.writes.get() + 1);
        match self.refuse_write.get() {
            Some(e) => Err((e, buffer)),
            None => {
                self.write_pending.replace(buffer);
                Ok(())
            }
        }
    }

    fn set_brightness(&self, _brightness: u16) -> Result<(), ErrorCode> {
        Ok(())
    }

    fn set_power(&self, _enabled: bool) -> Result<(), ErrorCode> {
        Ok(())
    }

    fn set_invert(&self, _enabled: bool) -> Result<(), ErrorCode> {
        Ok(())
    }
}

/// Records every callback the adapter delivers, and which buffer came with it.
struct RecordingClient {
    write_completes: Cell<usize>,
    command_completes: Cell<usize>,
    last_write_result: Cell<Result<(), ErrorCode>>,
    last_buffer_tag: Cell<u8>,
}

impl RecordingClient {
    fn new() -> Self {
        Self {
            write_completes: Cell::new(0),
            command_completes: Cell::new(0),
            last_write_result: Cell::new(Ok(())),
            last_buffer_tag: Cell::new(0),
        }
    }
}

impl ScreenClient for RecordingClient {
    fn command_complete(&self, _result: Result<(), ErrorCode>) {
        self.command_completes.set(self.command_completes.get() + 1);
    }

    fn write_complete(&self, buffer: SubSliceMut<'static, u8>, result: Result<(), ErrorCode>) {
        self.write_completes.set(self.write_completes.get() + 1);
        self.last_write_result.set(result);
        self.last_buffer_tag
            .set(buffer.as_slice().first().copied().unwrap_or(0));
    }

    fn screen_is_ready(&self) {}
}

type Adapter = ScreenARGB8888ToMono8BitPage<'static, FakeScreen>;

fn fixture() -> (
    &'static FakeScreen,
    &'static Adapter,
    &'static RecordingClient,
) {
    let fake: &'static FakeScreen = Box::leak(Box::new(FakeScreen::new()));
    let draw: &'static mut [u8] = Box::leak(vec![0u8; DRAW_CAP].into_boxed_slice());
    let adapter: &'static Adapter =
        Box::leak(Box::new(ScreenARGB8888ToMono8BitPage::new(fake, draw)));
    let client: &'static RecordingClient = Box::leak(Box::new(RecordingClient::new()));
    fake.set_client(adapter);
    adapter.set_client(client);
    (fake, adapter, client)
}

/// A leaked source buffer tagged in its first byte, so a buffer handed back
/// can be identified rather than merely counted.
fn src(tag: u8) -> SubSliceMut<'static, u8> {
    SubSliceMut::new(Box::leak(vec![tag; SRC_BYTES].into_boxed_slice()))
}

/// Put the adapter in a state where a client `write` is legal: a frame set
/// and its callback delivered.
fn arm(fake: &FakeScreen, adapter: &Adapter) {
    assert_eq!(adapter.set_write_frame(0, 0, FRAME_W, FRAME_H), Ok(()));
    assert!(fake.complete_frame(), "the frame command was accepted");
}

/// Drive one complete, successful client write from start to finish, and
/// assert the client was told exactly once that it succeeded.
///
/// This is the real assertion in every test below: it can only pass if the
/// adapter still owns its draw buffer.
fn write_end_to_end(fake: &FakeScreen, adapter: &Adapter, client: &RecordingClient, tag: u8) {
    let before = client.write_completes.get();
    assert!(
        adapter.write(src(tag), false).is_ok(),
        "a write with the adapter idle has to be accepted"
    );
    // Sub-op: underlying set_write_frame, then the write from its callback.
    for _ in 0..16 {
        if fake.complete_frame() || fake.complete_write() {
            continue;
        }
        break;
    }
    assert_eq!(
        client.write_completes.get(),
        before + 1,
        "exactly one write_complete for one write"
    );
    assert_eq!(client.last_write_result.get(), Ok(()));
    assert_eq!(client.last_buffer_tag.get(), tag, "the client's own buffer");
}

#[test]
fn a_refusal_on_the_callback_path_returns_both_buffers() {
    let (fake, adapter, client) = fixture();
    arm(fake, adapter);

    // The adapter accepts the write and issues the sub-op's frame command.
    assert!(adapter.write(src(0x11), false).is_ok());

    // Refuse the write that the adapter will issue from inside
    // `command_complete`. This is the arrival order neither silicon
    // experiment reached.
    fake.refuse_write.set(Some(ErrorCode::BUSY));
    assert!(fake.complete_frame());

    assert_eq!(
        client.write_completes.get(),
        1,
        "the refused write is reported once, through the callback -- the \
         adapter is inside a callback here, so reporting is allowed"
    );
    assert_eq!(client.last_write_result.get(), Err(ErrorCode::BUSY));
    assert_eq!(
        client.last_buffer_tag.get(),
        0x11,
        "the client's buffer comes back with the failure"
    );

    // And the draw buffer survived. Nothing above could show this.
    fake.refuse_write.set(None);
    write_end_to_end(fake, adapter, client, 0x22);
}

#[test]
fn a_refusal_on_the_downcall_path_returns_the_client_buffer_once() {
    let (fake, adapter, client) = fixture();
    arm(fake, adapter);

    // Refuse the sub-op's frame command, which the adapter issues from
    // inside the client's `write` -- a downcall.
    fake.refuse_frame.set(Some(ErrorCode::BUSY));

    match adapter.write(src(0x33), false) {
        Ok(()) => panic!("the write should have been refused"),
        Err((e, buffer)) => {
            assert_eq!(e, ErrorCode::BUSY);
            assert_eq!(
                buffer.as_slice().first().copied(),
                Some(0x33),
                "the client's buffer comes back in the return value"
            );
        }
    }

    assert_eq!(
        client.write_completes.get(),
        0,
        "reported through the return value ONLY -- a capsule must not issue \
         a callback from inside a downcall, and reporting both ways would \
         tell the caller about one failure twice"
    );

    fake.refuse_frame.set(None);
    write_end_to_end(fake, adapter, client, 0x44);
}

#[test]
fn an_ordinary_write_still_works() {
    // The positive control for both tests above: with nothing refusing,
    // the adapter completes a write. Without this, a fixture that refused
    // everything would pass them both.
    let (fake, adapter, client) = fixture();
    arm(fake, adapter);
    write_end_to_end(fake, adapter, client, 0x55);
    assert!(fake.frames.get() >= 2, "a client frame and a sub-op frame");
    assert_eq!(fake.writes.get(), 1);
}
