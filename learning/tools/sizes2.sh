#!/usr/bin/env bash

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.
#
# Build a list of boards and record their sizes.
#
#   sizes2.sh <worktree> <outfile> <board>...
#
# NOTE: this reads llvm-size's SUMMARY line, which on RP2 boards cannot see a
# flash change smaller than 4K: .storage is ALIGN(PAGE_SIZE) at both ends and
# pads to the same boundary whatever .text does, so .text falling 65376 to
# 64580 showed as 69164 both times. Use `llvm-size -A` per-section when the
# change being measured is small.

WT="$1"; OUT="$2"; shift 2
SIZE=$(ls ~/.rustup/toolchains/*/lib/rustlib/aarch64-apple-darwin/bin/llvm-size 2>/dev/null | head -1)
: > "$OUT"
for b in "$@"; do
  ( cd "$WT/boards/$b" && make ) > "$OUT.$b.log" 2>&1
  rc=$?
  elf=$(ls "$WT/target/thumbv"*"/release/$b.elf" 2>/dev/null | head -1)
  if [ $rc -ne 0 ] || [ -z "$elf" ]; then echo "$b BUILD_FAILED rc=$rc" >> "$OUT"
  else "$SIZE" "$elf" | tail -1 | awk -v b="$b" '{print b, $1, $2, $3}' >> "$OUT"; fi
done
echo DONE >> "$OUT"
