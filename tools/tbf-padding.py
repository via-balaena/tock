#!/usr/bin/env python3
"""Emit a padding TBF, so the app after it lands at a fixed address.

Bundling two apps into one kernel ELF concatenates their TBFs, which puts the
second at an offset that depends on the size of the first. libtock-rs apps are
linked for a FIXED flash address, so the second app then refuses to load:

    Unable to use process binary: App flash does not match requested
    address. Actual:0x10091aa0, Expected:0x10090080.

Padding the first app up to a round slot makes the second app's address a
constant instead, so it only has to be linked once and stays correct however
the first app grows.

    ./tbf-padding.py <gap_bytes> <out.tbf>
    ./tbf-padding.py $((0x4000 - $(wc -c < first.tbf))) pad.tbf

Then concatenate first.tbf, pad.tbf, second.tbf and objcopy the result into
the kernel's .apps section -- which takes TWO invocations, because .apps is
NOBITS until the flags change (see findings/4770 in the tock-rp2350 repo):

    arm-none-eabi-objcopy --set-section-flags .apps=LOAD,ALLOC kernel.elf out.elf
    arm-none-eabi-objcopy --update-section .apps=apps.bin out.elf

VERIFIED ON SILICON, 2026-09-15, Pico 2 W: the kernel logs `Unable to use
process binary: Process item is just padding.` and the apps either side of it
load normally. That line is the confirmation to look for -- it is the kernel
recognising the entry, not rejecting it.

The format is a bare 16-byte TBF v2 header with no Main or Program TLV. The
kernel walks the app region header to header; an entry with no Main is not a
process, so it is stepped over.

    word0  version u16 = 2, header_size u16 = 16
    word1  total_size (this header plus the zero padding after it)
    word2  flags = 0
    word3  checksum = word0 ^ word1 ^ word2
"""

import struct
import sys


def padding_tbf(total: int) -> bytes:
    if total < 16 or total % 4:
        raise ValueError("total_size must be at least 16 and a multiple of 4")
    w0 = 2 | (16 << 16)
    w2 = 0
    return struct.pack("<IIII", w0, total, w2, w0 ^ total ^ w2) + b"\0" * (total - 16)


def main() -> int:
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip().splitlines()[0] + "\n\nusage: tbf-padding.py <gap_bytes> <out.tbf>")
    total = int(sys.argv[1], 0)
    blob = padding_tbf(total)
    with open(sys.argv[2], "wb") as f:
        f.write(blob)
    print("padding TBF: total_size=%d (0x%x), %d bytes written" % (total, total, len(blob)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
