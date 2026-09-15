#!/usr/bin/env python3
"""What `hil::i2c` requires of every master transfer, checked by reading.

`I2CMaster::write_read`, `write` and `read` share one contract, and until
2026-09-13 it was written nowhere: those traits carried no doc comments at
all, so the interface enumerated no errors and eleven drivers had nothing to
diverge from. Three rules of it are visible in the source text.

**A length past the buffer is `Error::Size`.** Nothing related the length
argument to the buffer, and one driver of eleven checked -- apollo3, which
checked `write_len` and let `read_len` by. What an over-long length did varied:
most index a slice and panic the board, but nrf52 and sam4l program it into a
DMA engine, where the transfer runs past the buffer with nothing in Rust able
to see it. And the length can come from a syscall argument: `i2c_master` passed
one straight through until the same day.

**A transfer while one is outstanding is `Error::Busy`.** A driver holds one
buffer, so accepting a second loses the first and the `command_complete` that
was the only way back to its owner. lowrisc, nrf52 and sam4l had no such check
anywhere in the file. This rule follows calls up to three deep, because the
check is often in a helper -- rp2040 and rp2350 reach theirs through
`write_then_read` and then `ready_for_transfer` -- and a rule that demanded the
words inline would have forced the check into the wrong place.

**A transfer body does not answer `Error::ArbitrationLost`.** That is a bus
event -- another master driving the line -- reported from an interrupt handler,
not something a call can know before it starts. Eleven sites used it to mean
"busy", nine in the virtualizer and two in chip drivers, and those two were a
copy-paste divergence inside one file: stm32f4xx and stm32wle5xx answered
`Busy` from `write` and `write_read` and `ArbitrationLost` from `read`, for the
identical condition. It matters beyond tidiness because the two reach userspace
as different codes, `RESERVE` against `BUSY`, so an app retrying a busy device
never saw the code that tells it to.

Comments and string literals are blanked before any of these searches, so a
comment about `Error::Size` cannot stand in for a check.

WHAT THIS CANNOT CHECK is everything on the other side of an `Ok(())`: that a
transfer completes, that `command_complete` arrives exactly once, that the
buffer that comes back is the one that went in. Those need a bus with pull-ups
on it. Six clauses that need no bus run on hardware instead --
`capsules/core/src/test/i2c_contract.rs`, on the bench.

Exit 0 if every body keeps all three, 1 if one does not, 2 if the scan found
too few bodies to have run.
"""

import importlib.util
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
# `[^{;]*?` and not `[^\n{]*`: rustfmt wraps an impl header too long for one
# line, and this scan stopped seeing rp2xxx's I2c the day it gained a generic
# parameter -- three bodies, invisible, so a broken rule in them would have
# been reported as clean. `{` and `;` are what bound the match to one item, so
# it cannot run past the opening brace of a different impl.
#
# FLOOR is what caught it, and that is the point of having one: the failure
# was "only 30 transfer bodies found", not a quiet pass. A scan that reports
# what it found against what it expects fails loudly when it goes blind.
IMPL = re.compile(r"impl[^{;]*?\bI2CMaster<'[a-z]+>\s+for\s+[^{;]*?\{")
SIG = re.compile(r"\n    fn (write_read|write|read)\(\s*&self,")
CALL = re.compile(r"self\.(\w+)\s*\(")
FN = r"\bfn\s+%s\s*\("

# Three levels is what the deepest real case needs: a trait method calls
# `write_then_read`, which calls `ready_for_transfer`, which is where the
# refusal lives. A limit rather than full recursion so a cycle cannot hang it.
CALL_DEPTH = 3

# Eleven drivers times three methods. `NoSMBus` in the HIL is not counted: it
# holds no buffer and refuses every transfer outright.
FLOOR = 33

_spec = importlib.util.spec_from_file_location(
    "rust_source", pathlib.Path(__file__).with_name("rust_source.py")
)
_rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rs)
mask, body_at = _rs.mask, _rs.body_at


def fn_body(masked, name):
    """The body of `fn <name>` anywhere in this file, or None."""
    m = re.search(FN % re.escape(name), masked)
    return body_at(masked, m.end()) if m else None


def reaches(masked, body, needle, depth=CALL_DEPTH, seen=None):
    """Whether `body`, or something it calls, contains `needle`."""
    if needle in body:
        return True
    if depth == 0:
        return False
    seen = seen if seen is not None else set()
    for name in sorted(set(CALL.findall(body))):
        if name in seen:
            continue
        seen.add(name)
        called = fn_body(masked, name)
        if called is not None and reaches(masked, called, needle, depth - 1, seen):
            return True
    return False


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
            line = masked.count("\n", 0, offset + sm.start()) + 1
            site = f"{path.relative_to(ROOT)}:{line}"
            if "Error::Size" not in body:
                bad.append((site, sm.group(1), "never answers Error::Size"))
            if not reaches(masked, body, "Error::Busy"):
                bad.append((site, sm.group(1), "never answers Error::Busy"))
            if "Error::ArbitrationLost" in body:
                bad.append(
                    (site, sm.group(1), "answers Error::ArbitrationLost, which is a bus event")
                )

    if found < FLOOR:
        print(f"  BROKEN  only {found} transfer bodies found, expected "
              f"{FLOOR}+ -- the scan is not matching")
        return 2

    if not bad:
        print(f"  ok      {found} I2C transfer bodies keep all three rules: "
              f"Size, Busy, no ArbitrationLost")
        return 0

    for site, fn, why in bad:
        print(f"  BROKEN  {site}  {fn}() {why}")
    print("          hil::i2c: a length past its buffer is Error::Size, a")
    print("          transfer while one is outstanding is Error::Busy, and")
    print("          ArbitrationLost is reported from an interrupt, not here.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
