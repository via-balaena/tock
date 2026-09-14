/* Licensed under the Apache License, Version 2.0 or the MIT License. */
/* SPDX-License-Identifier: Apache-2.0 OR MIT                         */
/* Copyright OxidOS Automotive 2025.                                  */

MEMORY
{
  /* uncomment this to boot from RAM */
  /* reset (rx)  : ORIGIN = 0x20000000, LENGTH = 16K
  rom (rx)  : ORIGIN = 0x20000100, LENGTH = 256K
  prog (rx) : ORIGIN = 0x20040000, LENGTH = 1K
  ram (rwx) : ORIGIN = 0x20004000, LENGTH = 240K */

  /* boot from Flash */
  bootloader (rx) : ORIGIN = 0x10000000, LENGTH = 1024
  /* The radio's firmware, NVRAM and CLM blobs live in the kernel image, so
     this board needs far more rom than the plain Pico 2's 255K. Same 576K
     total that boards/raspberry_pi_pico_w gives itself for the same blobs,
     less the 1K bootloader block, which moves prog up to 0x10090000. */
  rom (rx)  : ORIGIN = 0x10000400, LENGTH = 575K
  /* All the flash the part has left. The RP2350 maps flash for execute in
     place, and a Tock process may read its own flash slice, so data carried
     inside an app's TBF is addressable without a copy -- which is how a WAD
     reaches Doom. 256K was enough for code; data needs the rest.
     0x10090000 to the 4 MiB end at 0x10400000 is 0x370000. */
  prog (rx) : ORIGIN = 0x10090000, LENGTH = 3520K
  ram (rwx) : ORIGIN = 0x20000000, LENGTH = 520K
}

PAGE_SIZE = 4K;

ENTRY(jump_to_bootloader)

SECTIONS {
  .bootloader  : ALIGN(4)
    {
        KEEP (*(.metadata_block));
        KEEP (*(.flash_bootloader));
        . = ALIGN (256);
    } > bootloader
}

INCLUDE tock_kernel_layout.ld
