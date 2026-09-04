<!-- Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License. -->
<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
<!-- Copyright Jon Hillesheim 2026. -->

# Bench artifacts

Things that were run on hardware and are worth keeping, but do not belong
upstream. **The `.patch` files here are diffs of Tock source and carry Tock's
own Apache-2.0 OR MIT licence, not the CC BY-SA of the rest of `learning/`.**
Each says so in its header.

They are named `.patch.txt` rather than `.patch` because the repository's
licence checker identifies file types by extension and diff syntax has no
comment token, so a `.patch` can never carry a header it will accept. `git
apply` does not care about the extension, and both were verified to apply with
the header in place.

## `defect5-silicon-demo.patch.txt`

Reproduces, on an RP2350, the PIO defect where a block IRQ flag is delivered to
the wrong state machine's client. Applies to `pico2w-typed` (PR #5141), whose
driver still has the bug.

It puts a two-instruction program (`irq 0`, then a jump to itself) on **SM1**
and registers a client on **both** SM0 and SM1 with distinct names. The console
says which one the driver actually called:

    [defect5] SM1 is the state machine raising irq 0
    [defect5] the client on SM0 was called

A variant whose client clears nothing instead hangs the kernel outright: two
characters of console output, then silence, with the core stuck in
`kernel/src/kernel.rs` and NVIC ISPR bit 15 pending.

## `defect5-fix-on-silicon.patch.txt`

The same demonstration against the *fixed* driver, with PR #5150's change
ported onto `chips/rp2xxx/src/pio.rs`. Same board, same program, same client:

    [fixed] the block client was called, flags=0b0001

The client still clears nothing and the kernel runs on, because the driver
clears before dispatching.

## Running either

Build for `raspberry_pi_pico_2`, copy the ELF to the bench Pi, then:

    openocd -f interface/cmsis-dap.cfg -f target/rp2350.cfg \
      -c "adapter speed 5000" -c "program <elf> verify reset exit"

Neither patch is for merging.
