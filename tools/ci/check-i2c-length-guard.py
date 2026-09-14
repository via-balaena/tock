#!/usr/bin/env python3
"""Every I2C master transfer must check its length against its buffer.

`I2CMaster::write_read`, `write` and `read` take a buffer and a length, and
nothing in the type system relates the two. `hil::i2c` now says the length must
be no larger than the buffer and that `Error::Size` is the answer when it is --
but on 2026-09-13 only one of eleven drivers checked, apollo3, and even that
one checked `write_len` and not `read_len`.

The consequences are not uniform, which is why this is a gate and not a style
note. In most drivers an over-long length indexes a slice and panics the board.
In nrf52 and sam4l it is programmed into a DMA engine -- `TXD.MAXCNT` and a
DMA descriptor -- where the transfer runs past the buffer with nothing in Rust
able to see it. And the length can come from a syscall argument: `i2c_master`
passed one straight through until the same day.

THE RULE: inside an `impl I2CMaster` block, each of the three transfer methods
must mention `Error::Size` in its body. Comments and string literals are
blanked before the search, so a comment about `Error::Size` cannot stand in for
a check.

WHAT THIS DOES NOT CHECK, and it is the other half of the contract: that a
driver refuses a second transfer with `Error::Busy` while one is outstanding.
sam4l does not, and the fix cannot be verified here -- its completion path
never disables the DMA channel, so the obvious `is_enabled()` test would wedge
the driver instead, and there is no board to try it on. Enforcing the rule
today would mean enforcing it everywhere but the one place it is broken.

Exit 0 if every body checks, 1 if one does not, 2 if the scan found too few
bodies to have run.
"""

import importlib.util
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMPL = re.compile(r"impl[^\n{]*\bI2CMaster<'[a-z]+>\s+for\s+[^\n{]*\{")
SIG = re.compile(r"\n    fn (write_read|write|read)\(\s*&self,")

# Eleven drivers times three methods. `NoSMBus` in the HIL is not counted: it
# holds no buffer and refuses every transfer outright.
FLOOR = 33

_spec = importlib.util.spec_from_file_location(
    "rust_source", pathlib.Path(__file__).with_name("rust_source.py")
)
_rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rs)
mask, body_at = _rs.mask, _rs.body_at


def main():
    found, bad = 0, []
    for path in sorted((ROOT / "chips").rglob("*.rs")):
        src = path.read_text(errors="replace")
        if "I2CMaster" not in src:
            continue
        masked = mask(src)
        m = IMPL.search(masked)
        if not m:
            continue
        block_start = m.end() - 1
        block = body_at(masked, block_start)
        if block is None:
            continue
        offset = masked.find("{", block_start) + 1
        for sm in SIG.finditer(block):
            body = body_at(block, sm.end())
            if body is None:
                continue
            found += 1
            if "Error::Size" not in body:
                line = masked.count("\n", 0, offset + sm.start()) + 1
                bad.append((f"{path.relative_to(ROOT)}:{line}", sm.group(1)))

    if found < FLOOR:
        print(f"  BROKEN  only {found} transfer bodies found, expected "
              f"{FLOOR}+ -- the scan is not matching")
        return 2

    if not bad:
        print(f"  ok      {found} I2C transfer bodies, every one bounds-checks "
              f"its length")
        return 0

    for site, fn in bad:
        print(f"  UNCHECKED {site}  {fn}() never answers Error::Size")
    print("          hil::i2c: a length larger than the buffer it indexes is")
    print("          Error::Size, checked before the hardware sees it.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
