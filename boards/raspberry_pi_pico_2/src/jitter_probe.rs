// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2026.

//! Measure how late a periodic kernel alarm actually fires.
//!
//! The kernel half of a jitter measurement whose other half is a userspace
//! app. Both keep an ABSOLUTE cadence -- wake `n` is due at `start + n *
//! period` -- because a probe that re-arms for "now + period" from inside its
//! own callback folds every late wake into the schedule and measures drift
//! instead of lateness. That mistake reports a clean run on a badly jittery
//! system, which is the one outcome worth engineering against.
//!
//! Absolute cadence is exactly what `Alarm::set_alarm(reference, dt)` is
//! shaped for: passing the previous deadline as `reference` lets the
//! implementation tell a deadline that has *just* passed from one far in the
//! future, and fire the former immediately rather than waiting a wrap
//! (`hil::time`, and tock#1651).
//!
//! **What this can and cannot see.** The chip's timer is `Freq1MHz`
//! (`chips/rp2040/src/timer.rs:222`), so one tick is one microsecond and
//! nothing finer than that is visible; the probe prints the frequency it
//! actually read rather than trusting that sentence. It measures the alarm
//! callback, so it includes interrupt latency and whatever else the kernel
//! loop was doing, and excludes everything a userspace app additionally pays.
//! The difference between this and the app IS the measurement.
//!
//! Run it against a CPU-bound process. A quiet board is not a control: it
//! cannot show whether the probe would have noticed jitter that was there.
//!
//! # Measured on a Pico 2 W, 2026-09-15
//!
//! | condition                        | capsule min/max | process min/max |
//! |----------------------------------|-----------------|-----------------|
//! | 1 kHz, no processes              | 6 / 31          | --              |
//! | 1 kHz, one periodic process      | 6 / 105         | 157 / 326       |
//! | 1 kHz, that process + a CPU hog  | 4 / **87**      | 153 / **10537** |
//! | 10 kHz, no processes             | 5 / 384         | --              |
//!
//! Microseconds, 10,000 samples per probe per run (50,000 for the last).
//!
//! **The contended row is the measurement worth having, and it confirms a
//! bound that was derived before it was measured.** `round_robin.rs` grants a
//! 10,000 us timeslice, so a process waiting behind one CPU-bound sibling
//! should miss its deadline by up to about that. It missed by 10,537 us --
//! quantum plus overhead -- and not rarely: 64% of wakes were over 4 ms late.
//! The capsule under the identical load peaked at 87 us, two orders of
//! magnitude better, because an interrupt's bottom half stops a running
//! process rather than queueing behind it.
//!
//! **What that does NOT say.** The capsule's typical case moved 4-8 us -> 16-32
//! us when processes appeared, so capsule latency is bounded by something that
//! still depends on what userspace is doing. "Ahead of every process" is not
//! "unaffected by them", and a design resting on a hard bound needs the first
//! sentence rather than the ratio.
//!
//! **The 10 kHz maximum is a startup transient and the `tail` counters are
//! what establish that**, not the histogram: over 50,000 samples the eleven
//! excursions above 32 us all fell in the first TEN samples, leaving 49,990
//! consecutive wakes with one sample above 16 us and none above 32. A
//! histogram cannot separate "a few bad wakes at boot" from "a few bad wakes
//! throughout" -- both draw the same bar -- which is why the last excursion's
//! index is reported next to the count.
//!
//! **Capsule lateness is not independent of process load**: adding one
//! periodic process moved the typical case from 4-8 us to 16-64 us. The
//! capsule still runs ahead of every process, but "ahead of" is not "unaffected
//! by".

use core::cell::Cell;
use kernel::debug;
use kernel::hil::time::{Alarm, AlarmClient, Frequency, Ticks, Time};

/// Bucket `i` holds lateness in `[2^(i-1), 2^i)` microseconds; bucket 0 holds
/// exactly 0, and the last bucket is everything at or above 65,536 us.
const BUCKETS: usize = 18;

/// Lateness beyond this is read as the alarm having fired EARLY, which the
/// `Alarm` contract forbids ("it can be delayed but will never fire early").
/// A wrapping subtraction turns early into a value near `u32::MAX`, so the
/// two are the same measurement and only the magnitude separates them. One
/// second is far past any jitter this board can produce and far below the
/// wrap, so anything above it is counted as a contract violation instead of
/// being averaged into the histogram where it would be invisible.
const EARLY_THRESHOLD_US: u32 = 1_000_000;

/// Lateness at or above this is counted separately and its position recorded.
/// Chosen as the first bucket above everything the quiet board produces in
/// steady state, so the count is excursions rather than ordinary spread.
const TAIL_US: u32 = 32;

pub struct JitterProbe<'a, A: Alarm<'a>> {
    alarm: &'a A,
    period_us: u32,
    target: u32,
    /// When the wake now being serviced was due.
    expected: Cell<A::Ticks>,
    n: Cell<u32>,
    min: Cell<u32>,
    max: Cell<u32>,
    max_at: Cell<u32>,
    /// Samples at or above `TAIL_US`, and the index of the LAST one. A tail
    /// that stops early is a startup cost; one that continues is the system's
    /// steady-state behaviour, and a histogram alone cannot tell them apart --
    /// both draw the same bar.
    tail: Cell<u32>,
    tail_last_at: Cell<u32>,
    early: Cell<u32>,
    buckets: [Cell<u32>; BUCKETS],
}

impl<'a, A: Alarm<'a>> JitterProbe<'a, A> {
    pub fn new(alarm: &'a A, period_us: u32, target: u32) -> Self {
        Self {
            alarm,
            period_us,
            target,
            expected: Cell::new(A::Ticks::from(0u32)),
            n: Cell::new(0),
            min: Cell::new(u32::MAX),
            max: Cell::new(0),
            max_at: Cell::new(0),
            tail: Cell::new(0),
            tail_last_at: Cell::new(0),
            early: Cell::new(0),
            buckets: [const { Cell::new(0) }; BUCKETS],
        }
    }

    /// Start the run. Everything else happens in the callback.
    pub fn arm(&self) {
        let hz = <A as Time>::Frequency::frequency();
        debug!(
            "jitter: capsule start period={}us samples={} timer={}Hz",
            self.period_us, self.target, hz
        );
        let period = self.ticks();
        let start = self.alarm.now();
        self.expected.set(start.wrapping_add(period));
        self.alarm.set_alarm(start, period);
    }

    /// The period in timer ticks, derived from the frequency the chip reports
    /// rather than from an assumed 1 MHz.
    fn ticks(&self) -> A::Ticks {
        let hz = <A as Time>::Frequency::frequency() as u64;
        A::Ticks::from(((self.period_us as u64 * hz) / 1_000_000) as u32)
    }

    fn record(&self, late_us: u32) {
        if late_us >= EARLY_THRESHOLD_US {
            self.early.set(self.early.get() + 1);
            return;
        }
        if late_us < self.min.get() {
            self.min.set(late_us);
        }
        if late_us > self.max.get() {
            self.max.set(late_us);
            self.max_at.set(self.n.get());
        }
        if late_us >= TAIL_US {
            self.tail.set(self.tail.get() + 1);
            self.tail_last_at.set(self.n.get());
        }
        let idx = if late_us == 0 {
            0
        } else {
            // 1 -> 1, 2..3 -> 2, 4..7 -> 3, ...
            ((32 - late_us.leading_zeros()) as usize).min(BUCKETS - 1)
        };
        self.buckets[idx].set(self.buckets[idx].get() + 1);
    }

    fn report(&self) {
        debug!(
            "jitter: capsule done n={} late_us min={} max={} at_sample={} early={} tail>={}us n={} last_at={}",
            self.n.get(),
            if self.min.get() == u32::MAX {
                0
            } else {
                self.min.get()
            },
            self.max.get(),
            self.max_at.get(),
            self.early.get(),
            TAIL_US,
            self.tail.get(),
            self.tail_last_at.get()
        );
        // Printed in three lines so one debug! call never outruns the buffer.
        for chunk in 0..3 {
            let lo = chunk * 6;
            debug!(
                "jitter: capsule [{}]={} [{}]={} [{}]={} [{}]={} [{}]={} [{}]={}",
                lo,
                self.buckets[lo].get(),
                lo + 1,
                self.buckets[lo + 1].get(),
                lo + 2,
                self.buckets[lo + 2].get(),
                lo + 3,
                self.buckets[lo + 3].get(),
                lo + 4,
                self.buckets[lo + 4].get(),
                lo + 5,
                self.buckets[lo + 5].get()
            );
        }
        debug!("jitter: capsule buckets are 0us, then [2^(i-1), 2^i) us, last is >=65536us");
    }
}

impl<'a, A: Alarm<'a>> AlarmClient for JitterProbe<'a, A> {
    fn alarm(&self) {
        let due = self.expected.get();
        let late = self.alarm.now().wrapping_sub(due);
        // Ticks are the chip's, microseconds are what gets reported; at
        // Freq1MHz these are the same number, which is why the conversion is
        // done rather than assumed.
        let hz = <A as Time>::Frequency::frequency() as u64;
        let late_us = ((late.into_u32() as u64 * 1_000_000) / hz) as u32;
        self.record(late_us);

        self.n.set(self.n.get() + 1);
        if self.n.get() >= self.target {
            self.report();
            return; // stop: no re-arm
        }
        // Re-arm from the deadline that just passed, never from `now`.
        let period = self.ticks();
        self.expected.set(due.wrapping_add(period));
        self.alarm.set_alarm(due, period);
    }
}
