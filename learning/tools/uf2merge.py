#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Join UF2 files into one, renumbering the blocks.

Written because `make program` does not work on a Pico 2. That target embeds
an application into the kernel image with

    arm-none-eabi-objcopy --set-section-flags .apps=LOAD,ALLOC
    arm-none-eabi-objcopy --update-section .apps=<tbf>

and then converts the result. The flag change makes objcopy rewrite the
program headers, and the segment at 0x20000000 -- which is `.stack`, 12 kB of
uninitialised RAM -- comes back with a file size of 0x3000 where it had 0.
picotool then refuses the whole image:

    ERROR: ELF contains memory contents for uninitialized memory at 0x20000000

Marking `.stack` NOLOAD does not move it. llvm-objcopy is worse than a
failure: it updates the section and leaves the program header alone, so
picotool accepts the ELF and writes a UF2 with no application in it and no
warning that anything is missing.

What does work is converting the two halves separately, since picotool is
happy with the kernel ELF on its own and with the .tbf as a binary at
0x10040000, and then joining the results here. A UF2 file is a flat run of
512-byte blocks, each carrying its own target address, its index, and the
total count, so joining two files leaves every block claiming to belong to a
file that stops halfway. This renumbers them, and refuses a join where two
blocks would write the same address.

    picotool uf2 convert kernel.elf kernel.uf2
    cp app.tbf app.bin
    picotool uf2 convert app.bin app.uf2 --offset 0x10040000
    python3 learning/tools/uf2merge.py both.uf2 kernel.uf2 app.uf2

The result has been decoded and checked against its inputs, byte for byte in
the application region. It has not been flashed to a board.
"""
import struct, sys

MAGIC0, MAGIC1, MAGIC_END = 0x0A324655, 0x9E5D5157, 0x0AB16F30
BLOCK = 512

def read(path):
    data = open(path, "rb").read()
    if len(data) % BLOCK:
        sys.exit("%s: %d bytes is not a whole number of UF2 blocks"
                 % (path, len(data)))
    out = []
    for i in range(0, len(data), BLOCK):
        b = data[i:i + BLOCK]
        m0, m1 = struct.unpack_from("<II", b, 0)
        (me,) = struct.unpack_from("<I", b, BLOCK - 4)
        if (m0, m1, me) != (MAGIC0, MAGIC1, MAGIC_END):
            sys.exit("%s: block %d has bad magic" % (path, i // BLOCK))
        out.append(bytearray(b))
    return out

def main(argv):
    if len(argv) < 4:
        sys.exit("usage: uf2merge.py OUT.uf2 IN.uf2 [IN.uf2 ...]")
    out, ins = argv[1], argv[2:]
    blocks = []
    for p in ins:
        blocks.extend(read(p))
    total = len(blocks)
    seen = {}
    for n, b in enumerate(blocks):
        addr, = struct.unpack_from("<I", b, 0x0C)
        size, = struct.unpack_from("<I", b, 0x10)
        for a in range(addr, addr + size, 256):
            if a in seen:
                sys.exit("blocks %d and %d both write 0x%08X"
                         % (seen[a], n, a))
            seen[a] = n
        struct.pack_into("<II", b, 0x14, n, total)
    with open(out, "wb") as fh:
        for b in blocks:
            fh.write(bytes(b))
    print("%s: %d blocks from %d files" % (out, total, len(ins)))

main(sys.argv)
