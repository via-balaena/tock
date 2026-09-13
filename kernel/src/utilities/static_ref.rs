// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Wrapper type for safe pointers to static memory.

use core::mem::align_of;
use core::ops::Deref;
use core::ptr::NonNull;

/// A pointer to statically allocated mutable data such as memory mapped I/O
/// registers.
///
/// This is a simple wrapper around a raw pointer that encapsulates an unsafe
/// dereference in a safe manner. It serve the role of creating a `&'static T`
/// given a raw address and acts similarly to `extern` definitions, except
/// [`StaticRef`] is subject to module and crate boundaries, while `extern`
/// definitions can be imported anywhere.
///
/// Because this defers the actual dereference, this can be put in a `const`,
/// whereas `const I32_REF: &'static i32 = unsafe { &*(0x1000 as *const i32) };`
/// will always fail to compile since `0x1000` doesn't have an allocation at
/// compile time, even if it's known to be a valid MMIO address.
#[derive(Debug)]
pub struct StaticRef<T> {
    ptr: NonNull<T>,
}

impl<T> StaticRef<T> {
    /// Create a new [`StaticRef`] from a raw pointer
    ///
    /// Prefer [`StaticRef::at`] where the address is a literal: it takes the
    /// address as an integer, which lets the compiler check the alignment and
    /// null halves of the contract below rather than leaving them to the
    /// caller. A `*const T` cannot be inspected during const evaluation, so
    /// this constructor cannot check anything.
    ///
    /// # Safety
    ///
    /// - `ptr` must be aligned, non-null, and dereferencable as `T`.
    /// - `*ptr` must be valid for the program duration.
    pub const unsafe fn new(ptr: *const T) -> StaticRef<T> {
        // SAFETY: `ptr` is non-null as promised by the caller.
        unsafe {
            StaticRef {
                ptr: NonNull::new_unchecked(ptr.cast_mut()),
            }
        }
    }

    /// Create a new [`StaticRef`] from the address of a memory mapped register
    /// block.
    ///
    /// Taking the address as a `usize` rather than a `*const T` is what makes
    /// this checkable: raw pointers cannot be cast to integers during const
    /// evaluation, so a `*const T` argument leaves every clause of the safety
    /// contract to the caller. Given an integer, two of them become arithmetic
    /// the compiler performs, and a violation in a `const` or `static` binding
    /// is a compile error at the offending line rather than a fault on boot.
    ///
    /// ```
    /// # use kernel::utilities::StaticRef;
    /// # use kernel::utilities::registers::ReadWrite;
    /// #[repr(C)]
    /// struct Registers {
    ///     control: ReadWrite<u32>,
    /// }
    ///
    /// const UART: StaticRef<Registers> = unsafe { StaticRef::at(0x4000_0000) };
    /// ```
    ///
    /// A misaligned address does not compile:
    ///
    /// ```compile_fail
    /// # use kernel::utilities::StaticRef;
    /// # use kernel::utilities::registers::ReadWrite;
    /// #[repr(C)]
    /// struct Registers {
    ///     control: ReadWrite<u32>,
    /// }
    ///
    /// // 0x4000_0002 is not 4-byte aligned, and `Registers` requires it.
    /// const UART: StaticRef<Registers> = unsafe { StaticRef::at(0x4000_0002) };
    /// ```
    ///
    /// Neither does a null address:
    ///
    /// ```compile_fail
    /// # use kernel::utilities::StaticRef;
    /// # use kernel::utilities::registers::ReadWrite;
    /// #[repr(C)]
    /// struct Registers {
    ///     control: ReadWrite<u32>,
    /// }
    ///
    /// const UART: StaticRef<Registers> = unsafe { StaticRef::at(0) };
    /// ```
    ///
    /// # Safety
    ///
    /// The caller must still guarantee the two clauses no compiler can check:
    ///
    /// - `addr` must be dereferencable as `T`, that is, it must actually be
    ///   the register block `T` describes.
    /// - `*addr` must be valid for the program duration.
    ///
    /// The alignment and non-null clauses of [`StaticRef::new`] are checked
    /// here instead of being asserted.
    pub const unsafe fn at(addr: usize) -> StaticRef<T> {
        assert!(addr != 0, "StaticRef: base address is null");
        assert!(
            addr.is_multiple_of(align_of::<T>()),
            "StaticRef: base address is not aligned for this register type"
        );

        // SAFETY: `addr` is non-null, checked immediately above. The caller
        // guarantees it is dereferencable as `T` and valid for the program
        // duration.
        unsafe {
            StaticRef {
                ptr: NonNull::new_unchecked(addr as *mut T),
            }
        }
    }
}

impl<T> Clone for StaticRef<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Copy for StaticRef<T> {}

impl<T> Deref for StaticRef<T> {
    type Target = T;
    fn deref(&self) -> &T {
        // SAFETY: `ptr` is aligned and dereferencable for the program duration
        // as promised by the caller of `StaticRef::new`.
        unsafe { self.ptr.as_ref() }
    }
}
