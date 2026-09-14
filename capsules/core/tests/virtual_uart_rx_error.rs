// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! A failed receive must reach the clients that were waiting for it.
//!
//! `MuxUart` splits one underlying receive across clients asking for
//! different lengths. When the underlying receive FAILS it still has to tell
//! them: `hil::uart` says a failed reception calls back with `Err(FAIL)` and
//! a specific [`uart::Error`], and a client that is never told cannot act.
//!
//! Before the branch this pins, the mux forwarded `rcode` and `error` only to
//! a client whose read had been FILLED. Anyone still waiting fell through to
//! the "more to read" path, had its buffer put back, and went on waiting --
//! the error simply evaporated. On real hardware that is a break or a framing
//! error arriving mid-read: the driver reports it, the mux eats it, and the
//! client sees a read that never finishes and never fails.
//!
//! Hosted rather than on silicon on purpose. The mux is pure logic, and the
//! silicon route needs an error injected while a particular read is
//! outstanding -- a timing race that took most of an afternoon to stop
//! chasing elsewhere. Here the failure is delivered exactly when the test
//! says.
//!
//! This is an integration test rather than a `#[cfg(test)] mod tests` inside
//! the capsule because constructing a `MuxUart` constructs a `DeferredCall`,
//! whose global state has to be initialized first, and the only way to do
//! that is to implement `ThreadIdProvider` -- an `unsafe trait`. Capsule
//! crates are `#![forbid(unsafe_code)]`, which admits no inner `allow`, so
//! the implementation cannot live inside `capsules-core`. A `tests/` file is
//! a separate crate root and is not bound by the library's attributes.
//!
//! Everything runs in one `#[test]` on purpose: the deferred-call state is a
//! single global bound to one thread, so a second test thread touching it
//! would be racing it rather than testing this.

use capsules_core::virtualizers::virtual_uart::{MuxUart, UartDevice};
use core::cell::Cell;
use kernel::ErrorCode;
use kernel::deferred_call::initialize_deferred_call_state;
use kernel::hil::uart;
use kernel::platform::chip::ThreadIdProvider;
use kernel::utilities::cells::{OptionalCell, TakeCell};

/// The test binary is single-threaded by construction (one `#[test]`), so a
/// constant id is unique and consistent for every thread that can observe it.
enum OneThread {}

// ### Safety
//
// `running_thread_id` must be unique and consistent per thread. This test
// binary has exactly one `#[test]`, so only one thread ever calls into the
// deferred-call state, and a constant satisfies both requirements. Adding a
// second `#[test]` to this file would break that and is why there is not one.
unsafe impl ThreadIdProvider for OneThread {
    fn running_thread_id() -> usize {
        0
    }
}

/// A UART that accepts a receive, holds the buffer, and hands it back with
/// whatever outcome the test asks for -- which is the part real hardware
/// will not do on cue.
struct FakeUart {
    rx_client: OptionalCell<&'static dyn uart::ReceiveClient>,
    held: TakeCell<'static, [u8]>,
    receives: Cell<usize>,
}

impl FakeUart {
    fn new() -> Self {
        Self {
            rx_client: OptionalCell::empty(),
            held: TakeCell::empty(),
            receives: Cell::new(0),
        }
    }

    /// Complete the outstanding receive however the caller says. Returns
    /// false if there was nothing outstanding, so a test cannot pass by
    /// asserting on a callback that was never possible.
    fn finish(&self, len: usize, rcode: Result<(), ErrorCode>, error: uart::Error) -> bool {
        match self.held.take() {
            Some(buf) => {
                self.rx_client
                    .map(move |c| c.received_buffer(buf, len, rcode, error));
                true
            }
            None => false,
        }
    }
}

impl uart::Configure for FakeUart {
    fn configure(&self, _params: uart::Parameters) -> Result<(), ErrorCode> {
        Ok(())
    }
}

impl uart::Transmit<'static> for FakeUart {
    fn set_transmit_client(&self, _client: &'static dyn uart::TransmitClient) {}

    fn transmit_buffer(
        &self,
        tx_buffer: &'static mut [u8],
        _tx_len: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u8])> {
        Err((ErrorCode::FAIL, tx_buffer))
    }

    fn transmit_word(&self, _word: u32) -> Result<(), ErrorCode> {
        Err(ErrorCode::NOSUPPORT)
    }

    fn transmit_abort(&self) -> Result<(), ErrorCode> {
        Ok(())
    }
}

impl uart::Receive<'static> for FakeUart {
    fn set_receive_client(&self, client: &'static dyn uart::ReceiveClient) {
        self.rx_client.set(client);
    }

    fn receive_buffer(
        &self,
        rx_buffer: &'static mut [u8],
        _rx_len: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u8])> {
        self.receives.set(self.receives.get() + 1);
        self.held.replace(rx_buffer);
        Ok(())
    }

    fn receive_word(&self) -> Result<(), ErrorCode> {
        Err(ErrorCode::NOSUPPORT)
    }

    fn receive_abort(&self) -> Result<(), ErrorCode> {
        Ok(())
    }
}

/// Records what a client was actually told.
struct RecordingClient {
    calls: Cell<usize>,
    rcode: Cell<Result<(), ErrorCode>>,
    error: Cell<uart::Error>,
    len: Cell<usize>,
}

impl RecordingClient {
    fn new() -> Self {
        Self {
            calls: Cell::new(0),
            rcode: Cell::new(Ok(())),
            error: Cell::new(uart::Error::None),
            len: Cell::new(0),
        }
    }
}

impl uart::ReceiveClient for RecordingClient {
    fn received_buffer(
        &self,
        _rx_buffer: &'static mut [u8],
        rx_len: usize,
        rcode: Result<(), ErrorCode>,
        error: uart::Error,
    ) {
        self.calls.set(self.calls.get() + 1);
        self.rcode.set(rcode);
        self.error.set(error);
        self.len.set(rx_len);
    }
}

/// A mux with `n` receiving devices on it. Everything is leaked, which is how
/// the `'static` lifetimes the virtualizer requires are satisfied without
/// `static_init!`.
fn fixture(
    n: usize,
) -> (
    &'static FakeUart,
    &'static MuxUart<'static>,
    Vec<&'static UartDevice<'static>>,
) {
    let fake: &'static FakeUart = Box::leak(Box::new(FakeUart::new()));
    let buf: &'static mut [u8] = Box::leak(Box::new([0u8; 64]));
    let mux: &'static MuxUart<'static> = Box::leak(Box::new(MuxUart::new(fake, buf, 115_200)));
    uart::Receive::set_receive_client(fake, mux);
    let devices = (0..n)
        .map(|_| {
            let d: &'static UartDevice<'static> = Box::leak(Box::new(UartDevice::new(mux, true)));
            d.setup();
            d
        })
        .collect();
    (fake, mux, devices)
}

fn client_on(dev: &'static UartDevice<'static>) -> &'static RecordingClient {
    let c: &'static RecordingClient = Box::leak(Box::new(RecordingClient::new()));
    uart::Receive::set_receive_client(dev, c);
    c
}

#[test]
fn a_failed_receive_reaches_the_waiting_clients() {
    initialize_deferred_call_state::<OneThread>();

    // A client waiting on a read longer than what arrived must still be told
    // the receive failed. This is the case the mux used to drop: `remaining`
    // is non-zero, so it went down the "more to read" path and put the
    // buffer back without a word to anyone.
    {
        let (fake, _mux, devs) = fixture(1);
        let client = client_on(devs[0]);
        let buf: &'static mut [u8] = Box::leak(Box::new([0u8; 16]));

        assert_eq!(uart::Receive::receive_buffer(devs[0], buf, 8), Ok(()));
        assert_eq!(fake.receives.get(), 1, "the mux never started a receive");

        assert!(
            fake.finish(0, Err(ErrorCode::FAIL), uart::Error::BreakError),
            "nothing was outstanding to fail"
        );

        assert_eq!(
            client.calls.get(),
            1,
            "a client waiting on 8 words was never told the receive failed"
        );
        assert_eq!(client.rcode.get(), Err(ErrorCode::FAIL));
        assert_eq!(client.error.get(), uart::Error::BreakError);
        assert_eq!(client.len.get(), 0, "no words arrived, so none were read");
    }

    // Every waiting client, not just the first one the list happens to reach.
    {
        let (fake, _mux, devs) = fixture(2);
        let a = client_on(devs[0]);
        let b = client_on(devs[1]);
        let ba: &'static mut [u8] = Box::leak(Box::new([0u8; 16]));
        let bb: &'static mut [u8] = Box::leak(Box::new([0u8; 16]));

        assert_eq!(uart::Receive::receive_buffer(devs[0], ba, 8), Ok(()));
        assert_eq!(uart::Receive::receive_buffer(devs[1], bb, 4), Ok(()));

        assert!(fake.finish(0, Err(ErrorCode::FAIL), uart::Error::FramingError));

        assert_eq!(a.calls.get(), 1, "the 8-word client was not told");
        assert_eq!(b.calls.get(), 1, "the 4-word client was not told");
        assert_eq!(a.error.get(), uart::Error::FramingError);
        assert_eq!(b.error.get(), uart::Error::FramingError);
    }

    // A SUCCESSFUL short read must still behave as it always did: the client
    // keeps waiting, no callback, and the mux asks for the rest. Without
    // this, "tell everyone on error" could quietly become "tell everyone",
    // and the partial-read path is the whole point of the virtualizer.
    {
        let (fake, _mux, devs) = fixture(1);
        let client = client_on(devs[0]);
        let buf: &'static mut [u8] = Box::leak(Box::new([0u8; 16]));

        assert_eq!(uart::Receive::receive_buffer(devs[0], buf, 8), Ok(()));
        assert!(fake.finish(3, Ok(()), uart::Error::None));

        assert_eq!(
            client.calls.get(),
            0,
            "a partial but successful read must not complete the client"
        );
        assert_eq!(
            fake.receives.get(),
            2,
            "the mux must ask for the rest of a partial read"
        );
    }
}
