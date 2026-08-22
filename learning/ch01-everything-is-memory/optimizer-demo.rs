// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// This is source code rather than teaching prose, so it carries the licence of
// the kernel it demonstrates instead of the series' CC BY-SA. Creative Commons
// recommend against CC licences for software, and this way the file can simply
// be reused.
//
// The source behind Figure 12 of chapter 1. Run this from inside this
// repository, so that rust-toolchain.toml supplies the pinned nightly and the
// thumbv8m.main-none-eabi target a Pico 2 needs. Copied somewhere else it
// fails with "can't find crate for `core`".
//
//     rustc --target thumbv8m.main-none-eabi --crate-type lib -O \
//           --emit asm -o demo.s optimizer-demo.rs
//
// Each pair is the same operation written twice: once the way you would
// reach for, and once with the volatile promise. The addresses are the ones
// chapter 1 uses throughout.

#![no_std]
#![allow(dead_code, non_upper_case_globals)]

use core::ptr::{read_volatile, write_volatile};

const uartfr: *mut u32 = 0x4007_0018 as *mut u32; // UART0 base + 0x018
const TXFF: u32 = 1 << 5; // chips/rp2350/src/uart.rs:104
const gpio_out_set: *mut u32 = 0xD000_0018 as *mut u32;
const gpio_out_xor: *mut u32 = 0xD000_0028 as *mut u32;

// 1. Wait for the port. The plain read is lifted out of the loop.
#[no_mangle]
pub unsafe fn wait_plain() {
    while (*uartfr & TXFF) != 0 {}
}
#[no_mangle]
pub unsafe fn wait_volatile() {
    while (read_volatile(uartfr) & TXFF) != 0 {}
}

// 2. Flip a pin twice. The two plain stores collapse into one.
#[no_mangle]
pub unsafe fn flip_twice_plain() {
    *gpio_out_xor = 1 << 25;
    *gpio_out_xor = 1 << 25;
}
#[no_mangle]
pub unsafe fn flip_twice_volatile() {
    write_volatile(gpio_out_xor, 1 << 25);
    write_volatile(gpio_out_xor, 1 << 25);
}

// 3. Two stores, in order. The plain pair comes out reversed.
#[no_mangle]
pub unsafe fn order_plain() {
    *gpio_out_set = 1;
    *gpio_out_xor = 2;
}
#[no_mangle]
pub unsafe fn order_volatile() {
    write_volatile(gpio_out_set, 1);
    write_volatile(gpio_out_xor, 2);
}

// 4. Store once and walk away. Both survive: the compiler cannot prove that
//    nothing else is watching this address.
#[no_mangle]
pub unsafe fn store_once_plain() {
    *gpio_out_set = 1 << 25;
}
#[no_mangle]
pub unsafe fn store_once_volatile() {
    write_volatile(gpio_out_set, 1 << 25);
}

// 5. Read one and ignore it. The plain read emits nothing at all.
#[no_mangle]
pub unsafe fn peek_plain() {
    let _ = *uartfr;
}
#[no_mangle]
pub unsafe fn peek_volatile() {
    let _ = read_volatile(uartfr);
}
