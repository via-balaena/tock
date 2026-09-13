// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Tock Cell types.

// `map_cell` needs `unsafe` to hand out a reference into a `MaybeUninit`
// that it has just proved is initialized. Nothing else in this crate does,
// so the lint is denied for the crate and allowed back for that one module:
// `forbid` would be stronger but admits no inner `allow` (E0453), which
// would mean no lint here at all.
#![deny(unsafe_code)]
// Every `unsafe` block in `map_cell` already carries a `// SAFETY:` comment,
// so requiring one costs nothing today and keeps it true. `tock-cells` is
// the only crate in the tree currently able to say this: everywhere else
// there are blocks without one. Same shape as the `kernel` crate denying
// `clippy::missing_safety_doc` for the doc-comment half of the same rule.
#![deny(clippy::undocumented_unsafe_blocks)]
#![no_std]

#[allow(unsafe_code)]
pub mod map_cell;
pub mod numeric_cell_ext;
pub mod optional_cell;
pub mod take_cell;
