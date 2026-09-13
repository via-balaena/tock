// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! The `transmit_word` path through `MuxUart`.
//!
//! No board exercises this path, because no UART driver in the tree
//! implements `transmit_word`: all twenty-six return an error, and one
//! panics. That is exactly why it is worth pinning -- nothing would notice
//! it breaking, and nothing did.
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
use kernel::deferred_call::{DeferredCallClient, initialize_deferred_call_state};
use kernel::hil::uart;
use kernel::platform::chip::ThreadIdProvider;
use kernel::utilities::cells::OptionalCell;

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

/// A UART that records what it was asked to do and answers however the test
/// tells it to, so both the "underlying driver refuses" case (which is what
/// every driver in the tree actually does) and the "underlying driver
/// accepts" case can be driven.
struct FakeUart {
    word_calls: Cell<usize>,
    word_result: Cell<Result<(), ErrorCode>>,
    tx_client: OptionalCell<&'static dyn uart::TransmitClient>,
}

impl FakeUart {
    fn new() -> Self {
        Self {
            word_calls: Cell::new(0),
            word_result: Cell::new(Ok(())),
            tx_client: OptionalCell::empty(),
        }
    }

    /// Deliver the callback that a successful `transmit_word` promised.
    fn complete_word(&self) {
        self.tx_client.map(|c| c.transmitted_word(Ok(())));
    }
}

impl uart::Configure for FakeUart {
    fn configure(&self, _params: uart::Parameters) -> Result<(), ErrorCode> {
        Ok(())
    }
}

impl uart::Transmit<'static> for FakeUart {
    fn set_transmit_client(&self, client: &'static dyn uart::TransmitClient) {
        self.tx_client.set(client);
    }

    fn transmit_buffer(
        &self,
        tx_buffer: &'static mut [u8],
        _tx_len: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u8])> {
        Err((ErrorCode::FAIL, tx_buffer))
    }

    fn transmit_word(&self, _word: u32) -> Result<(), ErrorCode> {
        self.word_calls.set(self.word_calls.get() + 1);
        self.word_result.get()
    }

    fn transmit_abort(&self) -> Result<(), ErrorCode> {
        Ok(())
    }
}

impl uart::Receive<'static> for FakeUart {
    fn set_receive_client(&self, _client: &'static dyn uart::ReceiveClient) {}

    fn receive_buffer(
        &self,
        rx_buffer: &'static mut [u8],
        _rx_len: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u8])> {
        Err((ErrorCode::FAIL, rx_buffer))
    }

    fn receive_word(&self) -> Result<(), ErrorCode> {
        Err(ErrorCode::FAIL)
    }

    fn receive_abort(&self) -> Result<(), ErrorCode> {
        Ok(())
    }
}

/// Counts the callbacks a client is promised.
struct CountingClient {
    words: Cell<usize>,
    last: Cell<Result<(), ErrorCode>>,
}

impl CountingClient {
    fn new() -> Self {
        Self {
            words: Cell::new(0),
            last: Cell::new(Ok(())),
        }
    }
}

impl uart::TransmitClient for CountingClient {
    fn transmitted_word(&self, rval: Result<(), ErrorCode>) {
        self.words.set(self.words.get() + 1);
        self.last.set(rval);
    }

    fn transmitted_buffer(
        &self,
        _tx_buffer: &'static mut [u8],
        _tx_len: usize,
        _rval: Result<(), ErrorCode>,
    ) {
    }
}

/// A mux with `n` devices on it. Everything is leaked, which is how the
/// `'static` lifetimes the virtualizer requires are satisfied without
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
    uart::Transmit::set_transmit_client(fake, mux);
    let devices = (0..n)
        .map(|_| {
            let d: &'static UartDevice<'static> = Box::leak(Box::new(UartDevice::new(mux, false)));
            d.setup();
            d
        })
        .collect();
    (fake, mux, devices)
}

/// Stand in for the deferred call the mux schedules, which nothing services
/// in a hosted test.
fn service_deferred_call(mux: &'static MuxUart<'static>) {
    mux.handle_deferred_call();
}

#[test]
fn transmit_word_through_the_mux() {
    initialize_deferred_call_state::<OneThread>();

    // `transmit_word` answered `Ok(())`, which promises a callback. The mux
    // must therefore actually hand the word to the underlying UART.
    {
        let (fake, mux, devs) = fixture(1);
        assert_eq!(uart::Transmit::transmit_word(devs[0], 0x41), Ok(()));
        service_deferred_call(mux);
        assert_eq!(
            fake.word_calls.get(),
            1,
            "the mux never passed the word to the UART"
        );
    }

    // The underlying UART refusing is the case every driver in the tree
    // actually takes. The client must still get its promised callback, and
    // the device must be usable afterwards.
    {
        let (fake, mux, devs) = fixture(1);
        fake.word_result.set(Err(ErrorCode::FAIL));
        let client: &'static CountingClient = Box::leak(Box::new(CountingClient::new()));
        uart::Transmit::set_transmit_client(devs[0], client);

        assert_eq!(uart::Transmit::transmit_word(devs[0], 0x41), Ok(()));
        service_deferred_call(mux);

        assert_eq!(client.words.get(), 1, "the promised callback never arrived");
        assert_eq!(client.last.get(), Err(ErrorCode::FAIL));
        assert_eq!(
            uart::Transmit::transmit_word(devs[0], 0x42),
            Ok(()),
            "the device was left permanently busy"
        );
    }

    // A word transmit the underlying UART accepts must route its completion
    // back to the client that asked for it, and not before it happens.
    {
        let (fake, mux, devs) = fixture(1);
        fake.word_result.set(Ok(()));
        let client: &'static CountingClient = Box::leak(Box::new(CountingClient::new()));
        uart::Transmit::set_transmit_client(devs[0], client);

        assert_eq!(uart::Transmit::transmit_word(devs[0], 0x41), Ok(()));
        service_deferred_call(mux);
        assert_eq!(fake.word_calls.get(), 1);
        assert_eq!(
            client.words.get(),
            0,
            "the callback came before the transfer did"
        );

        fake.complete_word();
        assert_eq!(
            client.words.get(),
            1,
            "the completion never reached the client"
        );
    }

    // One client's word transmit must not stop the mux serving anyone else.
    // `setup` pushes to the head, so `devs[1]` is the one `do_next_op` finds
    // first and is the one that has to not block `devs[0]`.
    {
        let (fake, mux, devs) = fixture(2);
        fake.word_result.set(Err(ErrorCode::FAIL));

        assert_eq!(uart::Transmit::transmit_word(devs[1], 0x41), Ok(()));
        service_deferred_call(mux);

        assert_eq!(uart::Transmit::transmit_word(devs[0], 0x42), Ok(()));
        service_deferred_call(mux);
        assert_eq!(
            fake.word_calls.get(),
            2,
            "a stuck device blocked the ones behind it"
        );
    }
}
