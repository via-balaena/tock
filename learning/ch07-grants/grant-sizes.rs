// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Source code rather than teaching prose, so it carries the licence of the
// kernel it measures rather than the series' CC BY-SA, the same way chapter
// 1's optimizer-demo.rs and chapter 6's syscall-demo.s do.
//
// Every byte count chapter 7 prints came from compiling this for the board's
// own target with the nightly the tree pins, rather than from adding up field
// widths by hand:
//
//   rustup run nightly-2026-07-21 rustc --target thumbv8m.main-none-eabi \
//       --crate-type lib --emit obj -O grant-sizes.rs -o /tmp/g.o
//   arm-none-eabi-objdump -s -j .rodata.SIZES /tmp/g.o
//
// The struct definitions below are copies of the ones named in each comment,
// field for field, at commit 83bad9388.

#![no_std]
#![allow(dead_code)]
use core::mem::{align_of, size_of};

// The three slot types the kernel stores per grant, field for field as
// kernel/src/grant.rs declares them at :752-788. MachineRegister and
// CapabilityPtr are each one thin pointer on this target.
#[repr(C)]
struct SavedUpcall {
    appdata: *const (),
    fn_ptr: *const (),
}
#[repr(C)]
struct SavedAllowRo {
    ptr: *const u8,
    len: usize,
}
#[repr(C)]
struct SavedAllowRw {
    ptr: *mut u8,
    len: usize,
}

// capsules/core/src/console.rs:95-100, the console's per-process state.
#[derive(Default)]
struct App {
    write_len: usize,
    write_remaining: usize,
    pending_write: bool,
    read_len: usize,
}

// EnteredGrantKernelManagedLayout::grant_size, kernel/src/grant.rs:376-396,
// transcribed rather than approximated. The leading size_of::<usize>() is the
// counters word -- three bytes holding the three counts and one unused -- and
// leaving it out is how the first version of this file was four bytes short.
const fn grant_size(
    upcalls: usize,
    allow_ro: usize,
    allow_rw: usize,
    t_size: usize,
    t_align: usize,
) -> usize {
    let kernel_managed_size = size_of::<usize>()
        + upcalls * size_of::<SavedUpcall>()
        + allow_ro * size_of::<SavedAllowRo>()
        + allow_rw * size_of::<SavedAllowRw>();
    let mask = t_align - 1;
    let padding = (t_align - (kernel_managed_size & mask)) & mask;
    kernel_managed_size + padding + t_size
}

// console.rs:59-92 declares UpcallCount<3>, AllowRoCount<2>, AllowRwCount<2>.
const CONSOLE: usize = grant_size(3, 2, 2, size_of::<App>(), align_of::<App>());

// The same driver with no slots at all, to price the slots on their own.
const BARE: usize = grant_size(0, 0, 0, size_of::<App>(), align_of::<App>());

#[no_mangle]
pub static SIZES: [usize; 8] = [
    size_of::<SavedUpcall>(),
    size_of::<SavedAllowRo>(),
    size_of::<SavedAllowRw>(),
    size_of::<App>(),
    align_of::<App>(),
    size_of::<usize>(),
    CONSOLE,
    BARE,
];
