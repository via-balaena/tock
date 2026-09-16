// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Provides userspace with access to the screen.
//!
//! Usage
//! -----
//!
//! You need a screen that provides the `hil::screen::Screen` trait.
//!
//! ```rust,ignore
//! let screen =
//!     components::screen::ScreenComponent::new(board_kernel, tft).finalize();
//! ```

use core::cell::Cell;

use kernel::grant::{AllowRoCount, AllowRwCount, Grant, UpcallCount};
use kernel::hil;
use kernel::hil::screen::{ScreenPixelFormat, ScreenRotation};
use kernel::processbuffer::ReadableProcessBuffer;
use kernel::syscall::{CommandReturn, SyscallDriver};
use kernel::utilities::cells::{OptionalCell, TakeCell};
use kernel::utilities::leasable_buffer::SubSliceMut;
use kernel::{ErrorCode, ProcessId};

/// Syscall driver number.
use capsules_core::driver;
pub const DRIVER_NUM: usize = driver::NUM::Screen as usize;

/// Ids for read-only allow buffers
mod ro_allow {
    pub const SHARED: usize = 0;
    /// The number of allow buffers the kernel stores for this grant
    pub const COUNT: u8 = 1;
}

fn screen_rotation_from(screen_rotation: usize) -> Option<ScreenRotation> {
    match screen_rotation {
        0 => Some(ScreenRotation::Normal),
        1 => Some(ScreenRotation::Rotated90),
        2 => Some(ScreenRotation::Rotated180),
        3 => Some(ScreenRotation::Rotated270),
        _ => None,
    }
}

fn screen_pixel_format_from(screen_pixel_format: usize) -> Option<ScreenPixelFormat> {
    match screen_pixel_format {
        0 => Some(ScreenPixelFormat::Mono),
        1 => Some(ScreenPixelFormat::RGB_332),
        2 => Some(ScreenPixelFormat::RGB_565),
        3 => Some(ScreenPixelFormat::RGB_888),
        4 => Some(ScreenPixelFormat::BGRA_8888),
        5 => Some(ScreenPixelFormat::RGB_4BIT),
        6 => Some(ScreenPixelFormat::Mono_8BitPage),
        _ => None,
    }
}

#[derive(Clone, Copy, PartialEq)]
enum ScreenCommand {
    Nop,
    SetBrightness(u16),
    SetPower(bool),
    SetInvert(bool),
    SetRotation(ScreenRotation),
    SetResolution {
        width: usize,
        height: usize,
    },
    SetPixelFormat(ScreenPixelFormat),
    SetWriteFrame {
        x: usize,
        y: usize,
        width: usize,
        height: usize,
    },
    Write(usize),
    Fill,
}

fn pixels_in_bytes(pixels: usize, bits_per_pixel: usize) -> usize {
    let bytes = pixels * bits_per_pixel / 8;
    if !(pixels * bits_per_pixel).is_multiple_of(8) {
        bytes + 1
    } else {
        bytes
    }
}

pub struct App {
    pending_command: bool,
    write_position: usize,
    write_len: usize,
    command: ScreenCommand,
    width: usize,
    height: usize,
}

impl Default for App {
    fn default() -> App {
        App {
            pending_command: false,
            command: ScreenCommand::Nop,
            width: 0,
            height: 0,
            write_len: 0,
            write_position: 0,
        }
    }
}

pub struct Screen<'a> {
    screen: &'a dyn hil::screen::Screen<'a>,
    screen_setup: Option<&'a dyn hil::screen::ScreenSetup<'a>>,
    apps: Grant<App, UpcallCount<1>, AllowRoCount<{ ro_allow::COUNT }>, AllowRwCount<0>>,
    current_process: OptionalCell<ProcessId>,
    pixel_format: Cell<ScreenPixelFormat>,
    buffer: TakeCell<'static, [u8]>,
}

impl<'a> Screen<'a> {
    pub fn new(
        screen: &'a dyn hil::screen::Screen<'a>,
        screen_setup: Option<&'a dyn hil::screen::ScreenSetup<'a>>,
        buffer: &'static mut [u8],
        grant: Grant<App, UpcallCount<1>, AllowRoCount<{ ro_allow::COUNT }>, AllowRwCount<0>>,
    ) -> Screen<'a> {
        Screen {
            screen,
            screen_setup,
            apps: grant,
            current_process: OptionalCell::empty(),
            pixel_format: Cell::new(screen.get_pixel_format()),
            buffer: TakeCell::new(buffer),
        }
    }

    // Check to see if we are doing something. If not,
    // go ahead and do this command. If so, this is queued
    // and will be run when the pending command completes.
    fn enqueue_command(&self, command: ScreenCommand, process_id: ProcessId) -> CommandReturn {
        match self
            .apps
            .enter(process_id, |app, _| {
                if app.pending_command {
                    CommandReturn::failure(ErrorCode::BUSY)
                } else {
                    app.pending_command = true;
                    app.command = command;
                    app.write_position = 0;
                    CommandReturn::success()
                }
            })
            .map_err(ErrorCode::from)
        {
            Err(e) => CommandReturn::failure(e),
            Ok(r) => {
                if self.current_process.is_none() {
                    self.current_process.set(process_id);
                    match self.call_screen(command, process_id) {
                        Ok(()) => CommandReturn::success(),

                        // BUSY is the panel, not the app. `st77xx` answers it
                        // to every call until its init sequence finishes --
                        // about 1.25 s after boot on the breadboard kit's
                        // ST7796 -- and an app has no way to know: `exists`
                        // and `get_resolution` are answered here without ever
                        // touching the driver, so they succeed immediately.
                        //
                        // The capsule already has the mechanism that makes
                        // this a non-problem. `ScreenClient::screen_is_ready`
                        // is raised by the driver when init completes and
                        // calls `run_next_command`, which starts the first app
                        // with `pending_command` set. So leave the command
                        // queued and answer success: the app waits in
                        // `yield_wait` and is served at ready. Clearing
                        // `current_process` is what keeps `schedule_callback`
                        // from delivering a spurious upcall in the meantime.
                        //
                        // Discarding it instead is what made every screen app
                        // open-code a retry loop, and the timeout is the hard
                        // part -- one that gave up at 1017 ms still failed.
                        //
                        // BOUNDED: this trades a visible BUSY for a wait, and
                        // it is correct only because `hil::screen::Screen` now
                        // REQUIRES a driver that answers BUSY to raise a
                        // callback afterwards without being asked again.
                        //
                        // That sentence used to read "in `st77xx` it is
                        // `status != Idle`, and every path out of non-Idle ends
                        // in a callback" -- which was a characterisation of one
                        // driver, checked by reading it once, and it is the
                        // form that has been wrong repeatedly in this file.
                        // Enumerating the six callers of `run_next_command`
                        // showed two are NOT completions (the zero-length Fill
                        // and Write arms below), so the queue is only
                        // guaranteed to be walked again by the driver's own
                        // callback -- which made the unwritten assumption
                        // load-bearing and worth writing down where
                        // implementers read it.
                        //
                        // AND IT MOVES WHERE AN ERROR ARRIVES, which matters
                        // to a caller that stores the answer. A command whose
                        // eventual answer is a failure now reports it through
                        // the upcall instead of the return value, because the
                        // driver was not consulted before this returned. So
                        // `set_pixel_format` with an unsupported format is
                        // `Err(INVAL)` from `command` once the panel is idle,
                        // and `success()` followed by upcall 0 carrying
                        // `into_statuscode(Err(INVAL))` while it is not -- the
                        // same call, answered in two places, chosen by how
                        // early in boot the app ran. A caller that keeps only
                        // the return value is right on one of those and wrong
                        // on the other. Reported to the libtock-rs session,
                        // whose screen adapter stores exactly that.
                        Err(ErrorCode::BUSY) => {
                            self.current_process.clear();
                            CommandReturn::success()
                        }

                        // Everything else fails now. Clear `pending_command`
                        // as well as the current process: it was set just
                        // above, and the error goes back to the app right here
                        // rather than through a callback, so nothing else
                        // would ever clear it and every later command from
                        // this app would answer BUSY for the life of the
                        // process.
                        Err(e) => {
                            self.current_process.clear();
                            let _ = self.apps.enter(process_id, |app, _| {
                                app.pending_command = false;
                            });
                            CommandReturn::failure(e)
                        }
                    }
                } else {
                    r
                }
            }
        }
    }

    fn is_len_multiple_color_depth(&self, len: usize) -> bool {
        let depth = pixels_in_bytes(1, self.screen.get_pixel_format().get_bits_per_pixel());
        len.is_multiple_of(depth)
    }

    fn call_screen(&self, command: ScreenCommand, process_id: ProcessId) -> Result<(), ErrorCode> {
        match command {
            ScreenCommand::SetBrightness(brighness) => self.screen.set_brightness(brighness),
            ScreenCommand::SetPower(enabled) => self.screen.set_power(enabled),
            ScreenCommand::SetInvert(enabled) => self.screen.set_invert(enabled),
            ScreenCommand::SetRotation(rotation) => {
                if let Some(screen) = self.screen_setup {
                    screen.set_rotation(rotation)
                } else {
                    Err(ErrorCode::NOSUPPORT)
                }
            }
            ScreenCommand::SetResolution { width, height } => {
                if let Some(screen) = self.screen_setup {
                    screen.set_resolution((width, height))
                } else {
                    Err(ErrorCode::NOSUPPORT)
                }
            }
            ScreenCommand::SetPixelFormat(pixel_format) => {
                if let Some(screen) = self.screen_setup {
                    screen.set_pixel_format(pixel_format)
                } else {
                    Err(ErrorCode::NOSUPPORT)
                }
            }
            ScreenCommand::Fill => {
                match self
                    .apps
                    .enter(process_id, |app, kernel_data| {
                        let len = kernel_data
                            .get_readonly_processbuffer(ro_allow::SHARED)
                            .map_or(0, |shared| shared.len());
                        // Ensure we have a buffer that is the correct size
                        if len == 0 {
                            Err(ErrorCode::NOMEM)
                        } else if !self.is_len_multiple_color_depth(len) {
                            Err(ErrorCode::INVAL)
                        } else {
                            app.write_position = 0;
                            app.write_len = pixels_in_bytes(
                                app.width * app.height,
                                self.pixel_format.get().get_bits_per_pixel(),
                            );
                            Ok(())
                        }
                    })
                    .unwrap_or_else(|err| err.into())
                {
                    Err(e) => Err(e),
                    Ok(()) => self.buffer.take().map_or(Err(ErrorCode::NOMEM), |buffer| {
                        let len = self.fill_next_buffer_for_write(buffer);
                        if len > 0 {
                            let mut data = SubSliceMut::new(buffer);
                            data.slice(..len);
                            self.screen.write(data, false)
                        } else {
                            self.buffer.replace(buffer);
                            self.run_next_command(kernel::errorcode::into_statuscode(Ok(())), 0, 0);
                            Ok(())
                        }
                    }),
                }
            }

            ScreenCommand::Write(data_len) => {
                match self
                    .apps
                    .enter(process_id, |app, kernel_data| {
                        let len = kernel_data
                            .get_readonly_processbuffer(ro_allow::SHARED)
                            .map_or(0, |shared| shared.len())
                            .min(data_len);
                        // Ensure we have a buffer that is the correct size
                        if len == 0 {
                            Err(ErrorCode::NOMEM)
                        } else if !self.is_len_multiple_color_depth(len) {
                            Err(ErrorCode::INVAL)
                        } else {
                            app.write_position = 0;
                            app.write_len = len;
                            Ok(())
                        }
                    })
                    .unwrap_or_else(|err| err.into())
                {
                    Ok(()) => self.buffer.take().map_or(Err(ErrorCode::FAIL), |buffer| {
                        let len = self.fill_next_buffer_for_write(buffer);
                        if len > 0 {
                            let mut data = SubSliceMut::new(buffer);
                            data.slice(..len);
                            self.screen.write(data, false)
                        } else {
                            self.buffer.replace(buffer);
                            self.run_next_command(kernel::errorcode::into_statuscode(Ok(())), 0, 0);
                            Ok(())
                        }
                    }),
                    Err(e) => Err(e),
                }
            }
            ScreenCommand::SetWriteFrame {
                x,
                y,
                width,
                height,
            } => self
                .apps
                .enter(process_id, |app, _| {
                    app.write_position = 0;
                    app.width = width;
                    app.height = height;

                    self.screen.set_write_frame(x, y, width, height)
                })
                .unwrap_or_else(|err| err.into()),
            _ => Err(ErrorCode::NOSUPPORT),
        }
    }

    fn schedule_callback(&self, data1: usize, data2: usize, data3: usize) {
        self.current_process.take().map(|process_id| {
            let _ = self.apps.enter(process_id, |app, upcalls| {
                app.pending_command = false;
                let _ = upcalls.schedule_upcall(0, (data1, data2, data3));
            });
        });
    }

    fn run_next_command(&self, data1: usize, data2: usize, data3: usize) {
        self.schedule_callback(data1, data2, data3);

        let mut command = ScreenCommand::Nop;

        // Check if there are any pending events.
        for app in self.apps.iter() {
            let process_id = app.processid();
            let start_command = app.enter(|app, _| {
                if app.pending_command {
                    app.pending_command = false;
                    command = app.command;
                    self.current_process.set(process_id);
                    true
                } else {
                    false
                }
            });
            if start_command {
                match self.call_screen(command, process_id) {
                    // BUSY means "wait" on the way in and it has to mean the
                    // same on the way out. Put the command back and leave the
                    // queue alone: the next `screen_is_ready` or completion
                    // walks it again.
                    //
                    // This is NOT a completion-callback-only path, which is
                    // what makes it reachable. Two of the six callers of this
                    // function are inside `call_screen` itself -- the Fill and
                    // Write arms at :282 and :318, on their zero-length path,
                    // neither of which consults the driver's state. And
                    // zero-length is ordinary: `app.width`/`app.height` are
                    // only set by SetWriteFrame, so an app that calls `fill`
                    // before setting a frame takes it. That app's downcall
                    // would otherwise dequeue a DIFFERENT app's queued command
                    // into a driver that is still initialising, and report it
                    // as failed -- the exact loss the enqueue path was fixed
                    // to stop. Found by the parallel libtock-rs session, by
                    // enumerating the call sites after I characterised them.
                    Err(ErrorCode::BUSY) => {
                        self.current_process.clear();
                        let _ = self.apps.enter(process_id, |app, _| {
                            app.pending_command = true;
                        });
                        break;
                    }

                    // `schedule_callback` takes `current_process`, so
                    // clearing it first made the call a no-op: the app was
                    // never told its command failed AND `pending_command`
                    // stayed set, which answers BUSY forever. Let the
                    // callback take it.
                    Err(err) => {
                        self.schedule_callback(kernel::errorcode::into_statuscode(Err(err)), 0, 0);
                    }
                    Ok(()) => {
                        break;
                    }
                }
            }
        }
    }

    fn fill_next_buffer_for_write(&self, buffer: &mut [u8]) -> usize {
        self.current_process.map_or(0, |process_id| {
            self.apps
                .enter(process_id, |app, kernel_data| {
                    let position = app.write_position;
                    let mut len = app.write_len;
                    if position < len {
                        let buffer_size = buffer.len();
                        let chunk_number = position / buffer_size;
                        let initial_pos = chunk_number * buffer_size;
                        let mut pos = initial_pos;
                        match app.command {
                            ScreenCommand::Write(_) => {
                                let res = kernel_data
                                    .get_readonly_processbuffer(ro_allow::SHARED)
                                    .and_then(|shared| {
                                        shared.enter(|s| {
                                            let mut chunks = s.chunks(buffer_size);
                                            if let Some(chunk) = chunks.nth(chunk_number) {
                                                // One bulk copy, NOT a byte at
                                                // a time.
                                                //
                                                // The loop this replaces did a
                                                // Cell read, a bounds-checked
                                                // store and two counter
                                                // updates for every byte -- on
                                                // the order of 19 cycles each.
                                                // For a full-screen frame that
                                                // is 307,200 bytes and about
                                                // 46 ms of CPU on a 125 MHz
                                                // part, which was HALF the
                                                // measured cost of a blit and
                                                // looked exactly like the SPI
                                                // bus running at 48% of its
                                                // clock. Measured on a Pico
                                                // 2 W: the panel write rate
                                                // did not halve when the SPI
                                                // clock was halved, which is
                                                // what named it -- a bus-bound
                                                // transfer would have.
                                                let n = core::cmp::min(chunk.len(), len - pos);
                                                chunk[..n].copy_to_slice(&mut buffer[..n]);
                                                pos += n;
                                                n
                                            } else {
                                                // stop writing
                                                0
                                            }
                                        })
                                    })
                                    .unwrap_or(0);
                                if res > 0 {
                                    app.write_position = pos;
                                }
                                res
                            }
                            ScreenCommand::Fill => {
                                // TODO bytes per pixel
                                len -= position;
                                let bytes_per_pixel = pixels_in_bytes(
                                    1,
                                    self.pixel_format.get().get_bits_per_pixel(),
                                );
                                let mut write_len = buffer_size / bytes_per_pixel;
                                if write_len > len {
                                    write_len = len
                                }
                                app.write_position += write_len * bytes_per_pixel;
                                kernel_data
                                    .get_readonly_processbuffer(ro_allow::SHARED)
                                    .and_then(|shared| {
                                        shared.enter(|data| {
                                            let mut bytes = data.iter();
                                            // bytes per pixel
                                            for i in 0..bytes_per_pixel {
                                                if let Some(byte) = bytes.next() {
                                                    buffer[i] = byte.get();
                                                }
                                            }
                                            // Double the filled prefix rather
                                            // than assign every byte. The old
                                            // loop did `write_len *
                                            // bytes_per_pixel` single
                                            // bounds-checked assignments --
                                            // 12,800 of them per chunk at
                                            // RGB565 -- where this does about
                                            // log2 of that many `copy_within`
                                            // calls, each a bulk move.
                                            //
                                            // MEASURED on an ST7796 over SPI
                                            // at 62.5 MHz: `fill` cost 0.524
                                            // us/pixel against `write`'s 0.344
                                            // for the same pixels, and `write`
                                            // differs only in doing one bulk
                                            // copy. Synthesising the pattern
                                            // was costing more than moving the
                                            // caller's bytes.
                                            let total = write_len * bytes_per_pixel;
                                            let mut filled = bytes_per_pixel;
                                            while filled < total {
                                                let n = core::cmp::min(filled, total - filled);
                                                buffer.copy_within(0..n, filled);
                                                filled += n;
                                            }
                                            write_len * bytes_per_pixel
                                        })
                                    })
                                    .unwrap_or(0)
                            }
                            _ => 0,
                        }
                    } else {
                        0
                    }
                })
                .unwrap_or(0)
        })
    }
}

impl hil::screen::ScreenClient for Screen<'_> {
    fn command_complete(&self, r: Result<(), ErrorCode>) {
        self.run_next_command(kernel::errorcode::into_statuscode(r), 0, 0);
    }

    fn write_complete(&self, data: SubSliceMut<'static, u8>, r: Result<(), ErrorCode>) {
        let buffer = data.take();
        let len = self.fill_next_buffer_for_write(buffer);

        if r == Ok(()) && len > 0 {
            let mut data = SubSliceMut::new(buffer);
            data.slice(..len);
            let _ = self.screen.write(data, true);
        } else {
            self.buffer.replace(buffer);
            self.run_next_command(kernel::errorcode::into_statuscode(r), 0, 0);
        }
    }

    fn screen_is_ready(&self) {
        self.run_next_command(kernel::errorcode::into_statuscode(Ok(())), 0, 0);
    }
}

impl hil::screen::ScreenSetupClient for Screen<'_> {
    fn command_complete(&self, r: Result<(), ErrorCode>) {
        self.run_next_command(kernel::errorcode::into_statuscode(r), 0, 0);
    }
}

impl SyscallDriver for Screen<'_> {
    fn command(
        &self,
        command_num: usize,
        data1: usize,
        data2: usize,
        process_id: ProcessId,
    ) -> CommandReturn {
        match command_num {
            // Driver existence check
            0 => CommandReturn::success(),
            // Does it have the screen setup
            1 => CommandReturn::success_u32(self.screen_setup.is_some() as u32),
            // Set power
            2 => self.enqueue_command(ScreenCommand::SetPower(data1 != 0), process_id),
            // Set Brightness
            3 => self.enqueue_command(ScreenCommand::SetBrightness(data1 as u16), process_id),
            // Invert on (deprecated)
            4 => self.enqueue_command(ScreenCommand::SetInvert(true), process_id),
            // Invert off (deprecated)
            5 => self.enqueue_command(ScreenCommand::SetInvert(false), process_id),
            // Set Invert
            6 => self.enqueue_command(ScreenCommand::SetInvert(data1 != 0), process_id),

            // Get Resolution Modes count
            11 => {
                if let Some(screen) = self.screen_setup {
                    CommandReturn::success_u32(screen.get_num_supported_resolutions() as u32)
                } else {
                    CommandReturn::failure(ErrorCode::NOSUPPORT)
                }
            }
            // Get Resolution Mode Width and Height
            12 => {
                if let Some(screen) = self.screen_setup {
                    match screen.get_supported_resolution(data1) {
                        Some((width, height)) if width > 0 && height > 0 => {
                            CommandReturn::success_u32_u32(width as u32, height as u32)
                        }
                        _ => CommandReturn::failure(ErrorCode::INVAL),
                    }
                } else {
                    CommandReturn::failure(ErrorCode::NOSUPPORT)
                }
            }

            // Get pixel format Modes count
            13 => {
                if let Some(screen) = self.screen_setup {
                    CommandReturn::success_u32(screen.get_num_supported_pixel_formats() as u32)
                } else {
                    CommandReturn::failure(ErrorCode::NOSUPPORT)
                }
            }
            // Get supported pixel format
            14 => {
                if let Some(screen) = self.screen_setup {
                    match screen.get_supported_pixel_format(data1) {
                        Some(pixel_format) => CommandReturn::success_u32(pixel_format as u32),
                        _ => CommandReturn::failure(ErrorCode::INVAL),
                    }
                } else {
                    CommandReturn::failure(ErrorCode::NOSUPPORT)
                }
            }

            // Get Rotation
            21 => CommandReturn::success_u32(self.screen.get_rotation() as u32),
            // Set Rotation
            22 => self.enqueue_command(
                ScreenCommand::SetRotation(
                    screen_rotation_from(data1).unwrap_or(ScreenRotation::Normal),
                ),
                process_id,
            ),

            // Get Resolution
            23 => {
                let (width, height) = self.screen.get_resolution();
                CommandReturn::success_u32_u32(width as u32, height as u32)
            }
            // Set Resolution
            24 => self.enqueue_command(
                ScreenCommand::SetResolution {
                    width: data1,
                    height: data2,
                },
                process_id,
            ),

            // Get pixel format
            25 => CommandReturn::success_u32(self.screen.get_pixel_format() as u32),
            // Set pixel format
            26 => {
                if let Some(pixel_format) = screen_pixel_format_from(data1) {
                    self.enqueue_command(ScreenCommand::SetPixelFormat(pixel_format), process_id)
                } else {
                    CommandReturn::failure(ErrorCode::INVAL)
                }
            }

            // Set Write Frame
            100 => self.enqueue_command(
                ScreenCommand::SetWriteFrame {
                    x: (data1 >> 16) & 0xFFFF,
                    y: data1 & 0xFFFF,
                    width: (data2 >> 16) & 0xFFFF,
                    height: data2 & 0xFFFF,
                },
                process_id,
            ),
            // Write
            200 => self.enqueue_command(ScreenCommand::Write(data1), process_id),
            // Fill
            300 => self.enqueue_command(ScreenCommand::Fill, process_id),

            _ => CommandReturn::failure(ErrorCode::NOSUPPORT),
        }
    }

    fn allocate_grant(&self, processid: ProcessId) -> Result<(), kernel::process::Error> {
        self.apps.enter(processid, |_, _| {})
    }
}
