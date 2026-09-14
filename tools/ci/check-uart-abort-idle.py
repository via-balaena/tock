#!/usr/bin/env python3
"""An abort with nothing outstanding must answer `Ok(())`.

`kernel::hil::uart` states it twice. `Transmit::transmit_abort`: *"if there is
no outstanding call to `transmit_word` or `transmit_buffer` then a call to
this function returns `Ok(())`"*. `Receive::receive_abort`: *"If there is no
outstanding receive operation, `Ok(())` is returned and there will be no
callback."* And in the other direction: *"If this function returns any `Err()`
there will be a callback."*

So a body that answers `Err` unconditionally breaks both sentences at once. It
refuses an idle abort, and the refusal promises a callback that nothing will
ever send. A caller that waits for its buffer back waits for the life of the
board. Twelve drivers did this on 2026-09-13 -- some with `Err(FAIL)`, some
with `Err(NOSUPPORT)`, which this call may not answer at all, and sam4l with an
unconditional `Err(BUSY)` in `receive_abort` while the `transmit_abort`
forty-nine lines below it in the same impl was correctly guarded.

THE RULE, and it is the whole of what this can check mechanically: **an abort
body that can return `Err` must also be able to return `Ok(())`.** A body with
both has a decision in it; a body with only `Err` cannot have one.

WHAT THIS CANNOT SEE. The mirror defect -- an unconditional `Ok(())` while a
callback is already queued -- looks identical from here, because whether an
operation can be outstanding is a fact about the driver's state, not its
control flow. segger/rtt had exactly that: `transmit_buffer` starts an alarm
that will call `transmitted_buffer`, and `transmit_abort` answered `Ok(())`,
which tells the client no callback is coming. It was found by reading, not by
this. Two drivers here answer `Ok(())` unconditionally and are right to --
veer_el2 and x86_q35 refuse every `receive_buffer`, so a receive can never be
outstanding.

Exit 0 if every body can answer both, 1 if one cannot, 2 if the scan found too
few bodies to have run at all.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TREES = ["kernel", "capsules", "chips", "arch", "libraries", "boards"]
ABORT = re.compile(r"\bfn\s+(transmit_abort|receive_abort)\s*\(")

# Every implementation in the tree, at the count that made this check worth
# writing. A scan that finds far fewer has stopped matching, not been fixed.
FLOOR = 30


def mask(src):
    """Return `src` with comment and string bodies blanked, length preserved.

    Brace counting and the `Err`/`Ok` search both run on this, so a brace in a
    comment cannot end a body early and a quoted `Err(` cannot stand in for a
    real one. The rule is about what the code returns, not what it says.
    """
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            while i < n and src[i] != "\n":
                out[i] = " "
                i += 1
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            depth = 1
            out[i] = out[i + 1] = " "
            i += 2
            while i < n and depth:
                if src[i : i + 2] == "/*":
                    depth += 1
                    out[i] = out[i + 1] = " "
                    i += 2
                elif src[i : i + 2] == "*/":
                    depth -= 1
                    out[i] = out[i + 1] = " "
                    i += 2
                else:
                    if src[i] != "\n":
                        out[i] = " "
                    i += 1
        elif c in "\"'":
            # A lifetime (`&'static`) is an apostrophe with no closing quote.
            if c == "'" and re.match(r"'[A-Za-z_][A-Za-z0-9_]*\b(?!')", src[i:]):
                i += 1
                continue
            quote = c
            i += 1
            while i < n and src[i] != quote:
                if src[i] == "\\":
                    out[i] = " "
                    i += 1
                if i < n:
                    if src[i] != "\n":
                        out[i] = " "
                    i += 1
            i += 1
        else:
            i += 1
    return "".join(out)


def body_at(masked, start):
    """The text between the braces of the function beginning at `start`."""
    open_at = masked.find("{", start)
    if open_at < 0:
        return None
    depth, i = 0, open_at
    while i < len(masked):
        if masked[i] == "{":
            depth += 1
        elif masked[i] == "}":
            depth -= 1
            if depth == 0:
                return masked[open_at + 1 : i]
        i += 1
    return None


def main():
    found, bad = 0, []
    for tree in TREES:
        for path in sorted((ROOT / tree).rglob("*.rs")):
            src = path.read_text(errors="replace")
            if "_abort" not in src:
                continue
            masked = mask(src)
            for m in ABORT.finditer(masked):
                body = body_at(masked, m.end())
                if body is None:
                    continue
                found += 1
                if "Err(" in body and "Ok(())" not in body:
                    line = masked.count("\n", 0, m.start()) + 1
                    rel = path.relative_to(ROOT)
                    bad.append((f"{rel}:{line}", m.group(1)))

    if found < FLOOR:
        print(f"  BROKEN  only {found} abort bodies found, expected {FLOOR}+ "
              f"-- the scan is not matching")
        return 2

    if not bad:
        print(f"  ok      {found} abort bodies, every one can answer Ok(())")
        return 0

    for site, fn in bad:
        print(f"  ALWAYS-ERR {site}  {fn}() can never answer Ok(())")
    print("          hil::uart: with nothing outstanding an abort returns")
    print("          Ok(()); any Err promises a callback that will not come.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
