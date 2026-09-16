// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Fills a screen with solid colours and reports how fast it managed it.
//!
//! Two jobs, and the second is the point.
//!
//! It puts something on the glass, which is the only way to tell a panel that
//! came up from one whose driver merely returned `Ok(())`. An init sequence
//! that silently does nothing looks exactly like one that worked.
//!
//! And it **measures the write path end to end** -- through the screen HIL, the
//! `st77xx` driver, the SPI bus and the mux -- because that number decides what
//! can be built on top. A 320x200 frame at 16bpp is 128,000 bytes; whether that
//! is a tenth of a second or two seconds is the difference between an
//! interactive display and a status indicator, and nothing about the driver
//! says which.
//!
//! What it does NOT measure is the syscall path. This runs inside the kernel,
//! so an app writing the same pixels pays for grants and upcalls on top of
//! everything counted here. Treat the number as the ceiling.

use core::cell::Cell;
use kernel::ErrorCode;
use kernel::debug;
use kernel::hil::screen::{Screen, ScreenClient};
use kernel::hil::time::{ConvertTicks, Ticks, Time};
use kernel::utilities::cells::{OptionalCell, TakeCell};
use kernel::utilities::leasable_buffer::SubSliceMut;

/// Colours to fill with, as RGB565 halves.
///
/// Red, green and blue in turn, so a panel with its channels exchanged is
/// obvious on sight rather than needing a photograph and a colour picker --
/// this panel does exchange red and blue, which is why `ST7796_MADCTL` sets
/// `BGR`, and that was found exactly this way.
const COLOURS: [[u8; 2]; 3] = [[0xF8, 0x00], [0x07, 0xE0], [0x00, 0x1F]];

pub struct TestScreenFill<'a, S: Screen<'a>, A: Time + ConvertTicks<<A as Time>::Ticks>> {
    screen: &'a S,
    clock: &'a A,
    buffer: TakeCell<'static, [u8]>,
    /// Which colour is being written.
    colour: Cell<usize>,
    /// Bytes still owed to the current frame.
    remaining: Cell<usize>,
    /// Bytes written across every frame, for the rate.
    total: Cell<usize>,
    started: OptionalCell<<A as Time>::Ticks>,
}

impl<'a, S: Screen<'a>, A: Time + ConvertTicks<<A as Time>::Ticks>> TestScreenFill<'a, S, A> {
    pub fn new(screen: &'a S, clock: &'a A, buffer: &'static mut [u8]) -> Self {
        Self {
            screen,
            clock,
            buffer: TakeCell::new(buffer),
            colour: Cell::new(0),
            remaining: Cell::new(0),
            total: Cell::new(0),
            started: OptionalCell::empty(),
        }
    }

    /// Bytes in one full frame at the screen's current resolution and depth.
    fn frame_bytes(&self) -> usize {
        let (w, h) = self.screen.get_resolution();
        w * h * self.screen.get_pixel_format().get_bits_per_pixel() / 8
    }

    /// Ask for the whole screen as the write frame.
    ///
    /// **Do not call this at boot.** Both of the driver's setup steps are
    /// asynchronous and each has to be waited for: `init` finishes at
    /// `screen_is_ready`, and `set_write_frame` finishes at
    /// `command_complete`. Calling straight through returns `BUSY` twice --
    /// which is the driver being right, not the test being unlucky.
    pub fn run(&self) {
        let (w, h) = self.screen.get_resolution();
        debug!(
            "screen-fill: {}x{}, {} bits per pixel",
            w,
            h,
            self.screen.get_pixel_format().get_bits_per_pixel()
        );

        if let Err(e) = self.screen.set_write_frame(0, 0, w, h) {
            debug!("screen-fill: set_write_frame failed: {:?}", e);
        }
    }

    /// Begin the next colour, or report and stop if there are none left.
    fn start_colour(&self) {
        if self.colour.get() >= COLOURS.len() {
            self.report();
            return;
        }
        self.remaining.set(self.frame_bytes());
        self.write_chunk(false);
    }

    /// Hand the driver as much of the current colour as the buffer holds.
    fn write_chunk(&self, continuing: bool) {
        let colour = COLOURS[self.colour.get()];
        let buffer = match self.buffer.take() {
            Some(b) => b,
            None => {
                debug!("screen-fill: no buffer");
                return;
            }
        };

        let len = core::cmp::min(buffer.len(), self.remaining.get());
        for (i, byte) in buffer[..len].iter_mut().enumerate() {
            *byte = colour[i % 2];
        }
        self.remaining.set(self.remaining.get() - len);
        self.total.set(self.total.get() + len);

        let mut slice = SubSliceMut::new(buffer);
        slice.slice(0..len);
        if let Err((e, slice)) = self.screen.write(slice, continuing) {
            // Put the buffer back. A benchmark that loses it on the first
            // refusal reports "no buffer" for every pass after, which reads
            // like a different fault than the one that happened.
            self.buffer.replace(slice.take());
            debug!("screen-fill: write failed: {:?}", e);
        }
    }

    fn report(&self) {
        let bytes = self.total.get();
        let ms = self.started.take().map_or(0, |start| {
            self.clock.ticks_to_ms(self.clock.now().wrapping_sub(start))
        });
        if ms == 0 {
            debug!("screen-fill: {} bytes, under a millisecond", bytes);
        } else {
            // Bytes per second, and the frame time that implies for a
            // 320x200x16bpp frame -- which is what a Doom-sized image costs.
            let per_second = (bytes as u64) * 1000 / (ms as u64);
            // 320x200 at 16bpp is 128,000 bytes -- one Doom-sized frame.
            let doom_ms = (128_000u64 * 1000).checked_div(per_second).unwrap_or(0);
            debug!(
                "screen-fill: {} bytes in {} ms = {} B/s; a 320x200x16bpp frame \
                 would take {} ms",
                bytes, ms, per_second, doom_ms
            );
        }
    }
}

impl<'a, S: Screen<'a>, A: Time + ConvertTicks<<A as Time>::Ticks>> ScreenClient
    for TestScreenFill<'a, S, A>
{
    fn command_complete(&self, result: Result<(), ErrorCode>) {
        // The write frame is set. Everything before this point was setup; the
        // clock starts here so the rate below is the write path alone.
        if let Err(e) = result {
            debug!("screen-fill: set_write_frame reported {:?}", e);
            return;
        }
        if self.started.is_some() {
            return;
        }
        self.started.set(self.clock.now());
        self.start_colour();
    }

    fn write_complete(&self, buffer: SubSliceMut<'static, u8>, result: Result<(), ErrorCode>) {
        self.buffer.replace(buffer.take());
        if let Err(e) = result {
            debug!("screen-fill: write_complete reported {:?}", e);
            self.report();
            return;
        }
        if self.remaining.get() > 0 {
            // Same frame, more bytes: `continue_write` keeps the driver's
            // position rather than starting the frame again.
            self.write_chunk(true);
        } else {
            self.colour.set(self.colour.get() + 1);
            self.start_colour();
        }
    }

    fn screen_is_ready(&self) {
        self.run();
    }
}
