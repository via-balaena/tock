#!/usr/bin/env python3
"""Hold the two RP2 UART drivers' overrun handler identical.

`chips/rp2040/src/uart.rs` and `chips/rp2350/src/uart.rs` are separate files
driving the same Arm PL011. Two of their receive blocks were written and
MEASURED on an rp2350 -- the overrun report, and the per-character framing,
break and parity errors the PL011 carries in `UARTDR` bits 8 to 10 -- and then
copied to the rp2040, where there is no board here to run them on.

That copy is the entire warrant for the rp2040 half. It is a claim about two
files, so it can be checked instead of asserted, and it is exactly the kind of
claim that rots silently: someone fixes one driver, the other keeps the bug,
and the comment saying "the same block" is still sitting there reading true.

Comments are stripped before comparing. Prose about the code is allowed to
differ -- the rp2350's mentions its FIFOs being on -- but the code is not.

Exit 0 if the blocks match, 1 if they diverge, 2 if a block could not be
found, which is a broken check rather than a passing one.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

# name | start marker | end marker
#
# Each entry is a block that was written and MEASURED on an rp2350 and then
# copied to the rp2040, where there is no board to run it on. Add one whenever
# that happens again: the copy is the warrant, so the copy is what to pin.
PAIRS = [
    (
        "overrun handler",
        "if self.registers.uartris.is_set(UARTRIS::OERIS)",
        "fn fill_fifo",
    ),
    (
        "per-character receive errors",
        "let flaw = if data.is_set(UARTDR::BE)",
        "if self.rx_position.get() < self.rx_len.get()",
    ),
]

FILES = {
    "rp2040": ROOT / "chips" / "rp2040" / "src" / "uart.rs",
    "rp2350": ROOT / "chips" / "rp2350" / "src" / "uart.rs",
}


def extract(path, start, end):
    """The code of one block: comments stripped, whitespace normalised."""
    text = path.read_text(encoding="utf-8")
    i = text.find(start)
    if i < 0:
        return None, f"{path.name}: no {start!r}"
    j = text.find(end, i)
    if j < 0:
        return None, f"{path.name}: no {end!r} after {start!r}"
    lines = []
    for line in text[i:j].splitlines():
        bare = line.strip()
        if not bare or bare.startswith("//"):
            continue
        lines.append(re.sub(r"\s+", " ", bare))
    if not lines:
        return None, f"{path.name}: {start!r} extracted no code at all"
    return lines, None


def main():
    bad = 0
    for name, start, end in PAIRS:
        blocks = {}
        for chip, path in FILES.items():
            got, why = extract(path, start, end)
            if got is None:
                print(f"  BROKEN  {name}: {why}")
                return 2
            blocks[chip] = got

        a, b = blocks["rp2040"], blocks["rp2350"]
        if a == b:
            print(f"  ok      {name}: rp2040 and rp2350 agree, {len(a)} lines")
            continue

        bad += 1
        print(f"  DIVERGED {name}: rp2040 has {len(a)} lines, rp2350 has {len(b)}")
        import difflib

        for line in difflib.unified_diff(a, b, "rp2040", "rp2350", lineterm="", n=1):
            print(f"    {line}")
        print("    One driver was changed and the other was not. The rp2040 half")
        print("    is only justified by being the same code as the measured one.")

    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
