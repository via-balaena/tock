// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! `ST77XX::set_write_frame` against frames the panel cannot show.
//!
//! The frame comes straight from an app: the screen syscall driver splits
//! command 100's two arguments into x/y/width/height and passes them down
//! without examining them. This driver then computed `x + width - 1` and
//! `y + height - 1` with no check, which underflows on an empty frame.
//!
//! The two build profiles disagreed about what that is. In release the
//! wrapped value is caught by `set_memory_frame`'s bounds check and comes
//! back as `INVAL`; the dev profile turns on overflow checks, where the same
//! syscall is a kernel panic. A defect whose severity depends on the profile
//! is worth removing even when the shipping profile is the safe one, because
//! nothing makes the shipping profile stay that way.
//!
//! The stubs below are never reached on the path under test --- validation
//! happens before any bus, alarm or pin is touched --- but a driver needs
//! them to exist before it can be built at all. They are the first test
//! scaffolding `st77xx` has had.

use capsules_extra::bus::{Bus, BusAddr8};
use capsules_extra::st77xx::{ST77XX, ST7796, SendCommand};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::hil::gpio;
use kernel::hil::screen::Screen;
use kernel::hil::time::{Alarm, AlarmClient, Freq16KHz, Ticks32, Time};

/// The ST7796 on the breadboard kit: 480x320.
const PANEL_W: usize = 480;
const PANEL_H: usize = 320;

struct StubBus {
    calls: Cell<usize>,
}

impl Bus<'static, BusAddr8> for StubBus {
    fn set_addr(&self, _addr: BusAddr8) -> Result<(), ErrorCode> {
        self.calls.set(self.calls.get() + 1);
        Ok(())
    }

    fn write(
        &self,
        _data_width: capsules_extra::bus::DataWidth,
        buffer: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u8])> {
        self.calls.set(self.calls.get() + 1);
        Err((ErrorCode::NODEVICE, buffer))
    }

    fn read(
        &self,
        _data_width: capsules_extra::bus::DataWidth,
        buffer: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u8])> {
        Err((ErrorCode::NODEVICE, buffer))
    }

    fn set_client(&self, _client: &'static dyn capsules_extra::bus::Client) {}
}

struct StubAlarm;

impl Time for StubAlarm {
    type Frequency = Freq16KHz;
    type Ticks = Ticks32;

    fn now(&self) -> Ticks32 {
        Ticks32::from(0)
    }
}

impl Alarm<'static> for StubAlarm {
    fn set_alarm_client(&self, _client: &'static dyn AlarmClient) {}
    fn set_alarm(&self, _reference: Ticks32, _dt: Ticks32) {}
    fn get_alarm(&self) -> Ticks32 {
        Ticks32::from(0)
    }
    fn disarm(&self) -> Result<(), ErrorCode> {
        Ok(())
    }
    fn is_armed(&self) -> bool {
        false
    }
    fn minimum_dt(&self) -> Ticks32 {
        Ticks32::from(1)
    }
}

/// Exists only so the driver's `P` parameter has a concrete type. Both pins
/// are passed as `None`, so nothing here is ever called.
struct StubPin;

impl gpio::Configure for StubPin {
    fn configuration(&self) -> gpio::Configuration {
        gpio::Configuration::Output
    }
    fn make_output(&self) -> gpio::Configuration {
        gpio::Configuration::Output
    }
    fn disable_output(&self) -> gpio::Configuration {
        gpio::Configuration::Other
    }
    fn make_input(&self) -> gpio::Configuration {
        gpio::Configuration::Input
    }
    fn disable_input(&self) -> gpio::Configuration {
        gpio::Configuration::Other
    }
    fn deactivate_to_low_power(&self) {}
    fn set_floating_state(&self, _state: gpio::FloatingState) {}
    fn floating_state(&self) -> gpio::FloatingState {
        gpio::FloatingState::PullNone
    }
}

impl gpio::Output for StubPin {
    fn set(&self) {}
    fn clear(&self) {}
    fn toggle(&self) -> bool {
        false
    }
}

impl gpio::Input for StubPin {
    fn read(&self) -> bool {
        false
    }
}

struct CountingClient {
    commands: Cell<usize>,
}

impl kernel::hil::screen::ScreenClient for CountingClient {
    fn command_complete(&self, _result: Result<(), ErrorCode>) {
        self.commands.set(self.commands.get() + 1);
    }
    fn write_complete(
        &self,
        _buffer: kernel::utilities::leasable_buffer::SubSliceMut<'static, u8>,
        _result: Result<(), ErrorCode>,
    ) {
    }
    fn screen_is_ready(&self) {}
}

type Driver = ST77XX<'static, StubAlarm, StubBus, StubPin>;

fn fixture() -> &'static Driver {
    let bus: &'static StubBus = Box::leak(Box::new(StubBus {
        calls: Cell::new(0),
    }));
    let alarm: &'static StubAlarm = Box::leak(Box::new(StubAlarm));
    let buffer: &'static mut [u8] = Box::leak(vec![0u8; 64].into_boxed_slice());
    let sequence: &'static mut [SendCommand] =
        Box::leak(vec![SendCommand::Nop; 8].into_boxed_slice());
    let driver: &'static Driver = Box::leak(Box::new(ST77XX::new(
        bus,
        alarm,
        None::<&'static StubPin>,
        None::<&'static StubPin>,
        buffer,
        sequence,
        &ST7796,
    )));
    let client: &'static CountingClient = Box::leak(Box::new(CountingClient {
        commands: Cell::new(0),
    }));
    Screen::set_client(driver, client);
    driver
}

#[test]
fn an_empty_frame_is_refused_rather_than_underflowing() {
    let driver = fixture();

    // `x + width - 1` with width 0, and `y + height - 1` with height 0.
    assert_eq!(driver.set_write_frame(0, 0, 0, 8), Err(ErrorCode::INVAL));
    assert_eq!(driver.set_write_frame(0, 0, 8, 0), Err(ErrorCode::INVAL));
    assert_eq!(driver.set_write_frame(0, 0, 0, 0), Err(ErrorCode::INVAL));
}

#[test]
fn a_frame_off_the_panel_is_refused() {
    let driver = fixture();

    assert_eq!(
        driver.set_write_frame(0, 0, PANEL_W + 1, 8),
        Err(ErrorCode::INVAL)
    );
    assert_eq!(
        driver.set_write_frame(0, 0, 8, PANEL_H + 1),
        Err(ErrorCode::INVAL)
    );
    // Fits only if the origin is ignored.
    assert_eq!(
        driver.set_write_frame(1, 0, PANEL_W, 8),
        Err(ErrorCode::INVAL)
    );
    assert_eq!(
        driver.set_write_frame(0, 1, 8, PANEL_H),
        Err(ErrorCode::INVAL)
    );
    // And an addition that overflows rather than merely exceeding.
    assert_eq!(
        driver.set_write_frame(usize::MAX, 0, 2, 8),
        Err(ErrorCode::INVAL)
    );
}

#[test]
fn a_frame_that_fits_is_not_refused() {
    // The positive control. `set_write_frame` reaches the bus here, and the
    // stub bus answers `NODEVICE`, so what is asserted is only that the
    // frame itself was accepted -- the guard is not rejecting everything.
    let driver = fixture();
    assert_ne!(
        driver.set_write_frame(0, 0, PANEL_W, PANEL_H),
        Err(ErrorCode::INVAL),
        "a full-panel frame is valid"
    );
    assert_ne!(
        driver.set_write_frame(8, 8, 16, 16),
        Err(ErrorCode::INVAL),
        "an interior frame is valid"
    );
}
