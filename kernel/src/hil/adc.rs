// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Interfaces for analog to digital converter peripherals.
//!
//! # Errors
//!
//! The errors below were derived from the seven chip drivers that implement
//! this HIL, which had agreed on nothing: before they were written down,
//! `sample` answered `BUSY` in four drivers and could not fail in three, and
//! `stop_sampling` answered `NOSUPPORT` in three, `OFF` in one, `BUSY` in one,
//! and could not fail in one. An implementation should answer the error named
//! here for the condition named here, and a caller should not have to know
//! which chip it is talking to.
//!
//! Two rules span the whole interface:
//!
//! - **`Ok(())` from a sampling call promises a callback.** The client is
//!   entitled to exactly one [`Client::sample_ready`] per accepted
//!   [`Adc::sample`], and the operation is not finished until it arrives.
//! - **`BUSY` means try again later, so it must only be returned when a
//!   later attempt could succeed.** Returning it for a condition that nothing
//!   will change -- an ADC that is not sampling, a feature the chip does not
//!   have -- asks the caller to retry forever.

use crate::ErrorCode;

// *** Interfaces for low-speed, single-sample ADCs ***

/// Simple interface for reading an ADC sample on any channel.
pub trait Adc<'a> {
    /// The chip-dependent type of an ADC channel.
    type Channel: PartialEq;

    /// Request a single ADC sample on a particular channel.
    /// Used for individual samples that have no timing requirements.
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    ///
    /// Return values:
    /// - `Ok(())`: sampling started. [`Client::sample_ready`] will be called
    ///   exactly once.
    /// - `BUSY`: a sample is already in progress. The request was not started
    ///   and no callback is owed for it.
    /// - `OFF`: the ADC is not powered or not enabled.
    fn sample(&self, channel: &Self::Channel) -> Result<(), ErrorCode>;

    /// Request repeated ADC samples on a particular channel.
    /// Callbacks will occur at the given frequency with low jitter and can be
    /// set to any frequency supported by the chip implementation. However
    /// callbacks may be limited based on how quickly the system can service
    /// individual samples, leading to missed samples at high frequencies.
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    ///
    /// Return values:
    /// - `Ok(())`: sampling started. [`Client::sample_ready`] will be called
    ///   repeatedly until [`Adc::stop_sampling`].
    /// - `NOSUPPORT`: this driver does not do continuous sampling at all.
    ///   Four of the seven in-tree drivers answer this, so a caller that needs
    ///   continuous samples must be prepared for it.
    /// - `BUSY`: a sample is already in progress.
    /// - `INVAL`: `frequency` cannot be produced on this chip.
    /// - `OFF`: the ADC is not powered or not enabled.
    fn sample_continuous(&self, channel: &Self::Channel, frequency: u32) -> Result<(), ErrorCode>;

    /// Stop a sampling operation.
    /// Can be used to stop any simple or high-speed sampling operation. No
    /// further callbacks will occur.
    ///
    /// **Stopping an ADC that is not sampling is `Ok(())`, not an error.**
    /// What this method promises is that no further callbacks occur, and when
    /// nothing is sampling that promise already holds. A caller stopping an
    /// ADC it is unsure about is the case this exists for, so it should not
    /// have to know the answer in advance. In particular `BUSY` is wrong
    /// here: nothing will change, so the retry it invites cannot succeed.
    ///
    /// A driver that cannot stop leaves a caller with no way to recover a
    /// conversion whose callback never arrives -- every later `sample` then
    /// answers `BUSY` for the life of the board. Prefer masking the interrupt
    /// and discarding the result over `NOSUPPORT`; a conversion that cannot
    /// be aborted in hardware does not prevent this method from keeping its
    /// promise.
    ///
    /// Return values:
    /// - `Ok(())`: no further callbacks will occur, whether or not anything
    ///   was sampling.
    /// - `OFF`: the ADC is not powered or not enabled.
    /// - `NOSUPPORT`: this driver cannot stop sampling. See above.
    fn stop_sampling(&self) -> Result<(), ErrorCode>;

    /// Function to ask the ADC how many bits of resolution are in the samples
    /// it is returning.
    ///
    /// In `1..=16`. Together with the left-justification rule this is what
    /// tells a caller which bits of a sample carry data: the low
    /// `16 - get_resolution_bits()` bits of every sample are zero.
    fn get_resolution_bits(&self) -> usize;

    /// Function to ask the ADC what reference voltage it used when taking the
    /// samples. This allows the user of this interface to calculate an actual
    /// voltage from the ADC reading.
    ///
    /// The returned reference voltage is in millivolts, or `None` if unknown.
    /// `Some(0)` is not a meaningful answer -- a caller converting a sample to
    /// a voltage with it gets zero for every reading -- so a driver that does
    /// not know answers `None`.
    fn get_voltage_reference_mv(&self) -> Option<usize>;

    fn set_client(&self, client: &'a dyn Client);
}

/// Trait for handling callbacks from simple ADC calls.
pub trait Client {
    /// Called when a sample is ready.
    ///
    /// `sample` is the raw ADC value **left-justified** in the `u16`: the low
    /// `16 - Adc::get_resolution_bits()` bits are zero, and a caller that
    /// wants the raw value shifts them out. The rule is stated on the
    /// requesting methods too, but this is where the value actually arrives,
    /// which is where a reader needs it.
    fn sample_ready(&self, sample: u16);
}

// *** Interfaces for high-speed, buffered ADC sampling ***

/// Interface for continuously sampling at a given frequency on a channel.
/// Requires the AdcSimple interface to have been implemented as well.
pub trait AdcHighSpeed<'a>: Adc<'a> {
    /// Start sampling continuously into buffers.
    /// Samples are double-buffered, going first into `buffer1` and then into
    /// `buffer2`. A callback is performed to the client whenever either buffer
    /// is full, which expects either a second buffer to be sent via the
    /// `provide_buffer` call. Length fields correspond to the number of
    /// samples that should be collected in each buffer. If an error occurs,
    /// the buffers will be returned.
    ///
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    ///
    /// Return values:
    /// - `Ok(())`: sampling started. [`HighSpeedClient::samples_ready`] is
    ///   called each time a buffer fills.
    /// - `NOSUPPORT`: this driver has no high-speed path.
    /// - `BUSY`: a sample is already in progress.
    /// - `INVAL`: `frequency` cannot be produced, or a length does not fit
    ///   its buffer.
    /// - `OFF`: the ADC is not powered or not enabled.
    ///
    /// Both buffers come back with the error, because the caller has no other
    /// way to recover them.
    fn sample_highspeed(
        &self,
        channel: &Self::Channel,
        frequency: u32,
        buffer1: &'static mut [u16],
        length1: usize,
        buffer2: &'static mut [u16],
        length2: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u16], &'static mut [u16])>;

    /// Provide a new buffer to fill with the ongoing `sample_continuous`
    /// configuration.
    /// Expected to be called in a `buffer_ready` callback. Note that if this
    /// is not called before the second buffer is filled, samples will be
    /// missed. Length field corresponds to the number of samples that should
    /// be collected in the buffer. If an error occurs, the buffer will be
    /// returned.
    ///
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    ///
    /// Return values:
    /// - `Ok(())`: the buffer is queued and will be filled next.
    /// - `NOSUPPORT`: this driver has no high-speed path.
    /// - `BUSY`: a second buffer is already queued, so a third is not needed
    ///   yet. Unlike the other uses of `BUSY` in this file this one really is
    ///   transient -- the next `samples_ready` makes room.
    /// - `INVAL`: nothing is sampling, or what is running is a single sample
    ///   rather than a continuous one, so there is no operation to feed.
    /// - `OFF`: the ADC is not powered or not enabled.
    ///
    /// The buffer comes back with the error.
    fn provide_buffer(
        &self,
        buf: &'static mut [u16],
        length: usize,
    ) -> Result<(), (ErrorCode, &'static mut [u16])>;

    /// Reclaim ownership of buffers.
    /// Can only be called when the ADC is inactive, which occurs after a
    /// successful `stop_sampling`. Used to reclaim buffers after a sampling
    /// operation is complete. Returns Ok() if the ADC was inactive, but
    /// there may still be no buffers that are `some` if the driver had already
    /// returned all buffers.
    ///
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    ///
    /// Return values:
    /// - `Ok(..)`: the ADC was inactive. Either entry may still be `None` if
    ///   the driver had already handed that buffer back.
    /// - `NOSUPPORT`: this driver has no high-speed path.
    /// - `INVAL`: the ADC is still sampling. Call [`Adc::stop_sampling`]
    ///   first.
    fn retrieve_buffers(
        &self,
    ) -> Result<(Option<&'static mut [u16]>, Option<&'static mut [u16]>), ErrorCode>;

    fn set_highspeed_client(&self, client: &'a dyn HighSpeedClient);
}

/// Trait for handling callbacks from high-speed ADC calls.
pub trait HighSpeedClient {
    /// Called when a buffer is full.
    /// The length provided will always be less than or equal to the length of
    /// the buffer. Expects an additional call to either provide another buffer
    /// or stop sampling
    fn samples_ready(&self, buf: &'static mut [u16], length: usize);
}

/// The same interface as [`Adc`] with the channel already bound, as a
/// virtualizer hands out.
///
/// Every method means what the matching [`Adc`] method means, **including its
/// errors** -- see there rather than here, so the two cannot drift apart. A
/// virtualizer sits between this and the chip driver, so `BUSY` may be the
/// virtualizer's answer about another user rather than the hardware's about
/// itself; it says the same thing to the caller either way.
pub trait AdcChannel<'a> {
    /// Request a single ADC sample on a particular channel.
    /// Used for individual samples that have no timing requirements.
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    fn sample(&self) -> Result<(), ErrorCode>;

    /// Request repeated ADC samples on a particular channel.
    /// Callbacks will occur at the given frequency with low jitter and can be
    /// set to any frequency supported by the chip implementation. However
    /// callbacks may be limited based on how quickly the system can service
    /// individual samples, leading to missed samples at high frequencies.
    /// All ADC samples will be the raw ADC value left-justified in the u16.
    fn sample_continuous(&self) -> Result<(), ErrorCode>;

    /// Stop a sampling operation.
    /// Can be used to stop any simple or high-speed sampling operation. No
    /// further callbacks will occur.
    ///
    /// **Stopping an ADC that is not sampling is `Ok(())`, not an error.**
    /// What this method promises is that no further callbacks occur, and when
    /// nothing is sampling that promise already holds. A caller stopping an
    /// ADC it is unsure about is the case this exists for, so it should not
    /// have to know the answer in advance. In particular `BUSY` is wrong
    /// here: nothing will change, so the retry it invites cannot succeed.
    ///
    /// A driver that cannot stop leaves a caller with no way to recover a
    /// conversion whose callback never arrives -- every later `sample` then
    /// answers `BUSY` for the life of the board. Prefer masking the interrupt
    /// and discarding the result over `NOSUPPORT`; a conversion that cannot
    /// be aborted in hardware does not prevent this method from keeping its
    /// promise.
    ///
    /// Return values:
    /// - `Ok(())`: no further callbacks will occur, whether or not anything
    ///   was sampling.
    /// - `OFF`: the ADC is not powered or not enabled.
    /// - `NOSUPPORT`: this driver cannot stop sampling. See above.
    fn stop_sampling(&self) -> Result<(), ErrorCode>;

    /// Function to ask the ADC how many bits of resolution are in the samples
    /// it is returning.
    ///
    /// In `1..=16`. Together with the left-justification rule this is what
    /// tells a caller which bits of a sample carry data: the low
    /// `16 - get_resolution_bits()` bits of every sample are zero.
    fn get_resolution_bits(&self) -> usize;

    /// Function to ask the ADC what reference voltage it used when taking the
    /// samples. This allows the user of this interface to calculate an actual
    /// voltage from the ADC reading.
    ///
    /// The returned reference voltage is in millivolts, or `None` if unknown.
    /// `Some(0)` is not a meaningful answer -- a caller converting a sample to
    /// a voltage with it gets zero for every reading -- so a driver that does
    /// not know answers `None`.
    fn get_voltage_reference_mv(&self) -> Option<usize>;

    fn set_client(&self, client: &'a dyn Client);
}
