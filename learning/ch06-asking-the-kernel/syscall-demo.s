# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.
#
# This is source code rather than teaching prose, so it carries the licence of
# the kernel it demonstrates instead of the series' CC BY-SA, the same way
# chapter 1's optimizer-demo.rs does.
#
# Every instruction encoding chapter 6 prints came from this file. It is not
# part of Tock and is not linked into anything; it exists so that the hex in
# Figure 1 and in the listing above it is observed rather than looked up:
#
#   arm-none-eabi-as -mcpu=cortex-m33 -mthumb syscall-demo.s -o /tmp/d.o
#   arm-none-eabi-objdump -d /tmp/d.o
#
# learning/tools/check.py runs exactly that and compares two things against
# what comes back: every line of the listing, halfword and instruction
# together, and every four-digit hex halfword printed anywhere on the page.
# The pairing inside Figure 1's readout is checked the other way, by
# ch06.tests.js re-deriving it from the button's own label.
#
# Comments here start with # rather than the @ that ARM assembly usually uses.
# The assembler takes either; Tock's licence checker reads this file through a
# syntax highlighter that does not know @ is a comment in ARM assembly, and a
# header it cannot see is a header that is missing. # at the start of a line is
# still a comment to the assembler, and # inside an instruction is still an
# immediate, which is why the movs lines below are unaffected.

	.syntax unified
	.thumb

# The five svc instructions Figure 1 decodes. Class numbers run 0 to 7; 8 is
# the one the kernel cannot turn into a request, and 255 is what Tock itself
# executes to go the other way, where the number is never read.
	.global demo_classes
	.thumb_func
demo_classes:
	svc 0
	svc 2
	svc 4
	svc 8
	svc 255

# A process turning on its first LED, which is the request chapter 3 left
# half-finished. Driver 2 is the LED driver, command 1 is "on", and the
# argument is which LED. Class 2 is command.
	.global demo_led_on
	.thumb_func
demo_led_on:
	movs r0, #2
	movs r1, #1
	movs r2, #0
	movs r3, #0
	svc 2
	bx lr
