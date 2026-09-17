#!/usr/bin/env python3
"""A fallible HIL method must say which errors it can return.

AGENTS.md asks for it -- *"All valid errors should be enumerated"* -- and
nothing checked it. The cost is not theoretical. `hil::i2c` documented no
errors on any method and eleven drivers disagreed about all of them, one
letting an app panic the kernel on six boards. `hil::adc` documented none
across eighteen methods and its seven drivers had agreed on nothing: `sample`
answered `BUSY` in four and could not fail in three. In both cases the
contract had to be reconstructed from the implementations, which is archaeology
that a sentence would have prevented.

This is a RATCHET, not a standard. Half the fallible methods in `kernel/src/hil`
name no error today, so a gate that demanded them all would fail on every run
and be switched off within a day. Instead it records what each file manages now
and fails when a file gets worse:

  - a file that documents fewer methods than it used to;
  - a file that gains a fallible method without gaining a documented one.

Both are regressions a person would not otherwise see, because nothing about
an undocumented method looks wrong in a diff.

WHY A BASELINE AND NOT A RULE. Deciding whether prose "enumerates the errors"
is a judgement, and this script's version of that judgement is crude: it looks
for an error-variant name in the doc block. It will call
`AdcChannel::sample` undocumented even though it deliberately points at
`Adc::sample` rather than restating six enumerations that would drift apart.
Recording the number instead of ruling on it means the crudeness is harmless --
the check compares today's judgement against yesterday's, so only CHANGES
matter, and a detector that is stable is as good as one that is right.

Variant names come from `ErrorCode` and, for the HILs that define their own
error type, from the `enum Error` in the same file -- `hil::i2c` and `hil::can`
both do, and a check that only knew `ErrorCode` would report them as
undocumented forever.

    ./check-hil-error-docs.py             check against the baseline
    ./check-hil-error-docs.py --worklist  also print what is undocumented
    ./check-hil-error-docs.py --update    record the current state

Exit 0 if nothing regressed, 1 if something did, 2 if the check could not run --
an unreadable ErrorCode enum or a missing baseline is a broken check, not a
passing one.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HIL = ROOT / "kernel" / "src" / "hil"
BASELINE = ROOT / "tools" / "ci" / "hil-error-docs-baseline.txt"

FN = re.compile(r"^\s*(?:pub\s+)?fn\s+\w+")
# `Result<_, ()>` carries no error code, so there is nothing to enumerate.
UNIT_ERR = re.compile(r"->\s*Result<[^;{]*,\s*\(\)\s*>")


def error_names():
    """Every `ErrorCode` variant. A broken read is exit 2, not an empty set."""
    try:
        src = (ROOT / "kernel" / "src" / "errorcode.rs").read_text()
    except OSError as e:
        sys.exit(f"cannot read errorcode.rs: {e}")
    names = set(re.findall(r"^\s{4}([A-Z][A-Z0-9]{2,})\s*=", src, re.M))
    if not names:
        sys.exit("found no ErrorCode variants -- the parse is wrong, not the enum")
    return names


def local_error_names(src):
    """Variants of an `enum Error` defined in the HIL file itself."""
    m = re.search(r"pub enum Error\s*\{(.*?)\n\}", src, re.S)
    if not m:
        return set()
    return set(re.findall(r"^\s*([A-Z]\w+)\s*(?:,|\{|\()", m.group(1), re.M))


def scan(path, codes):
    """Answer (documented, fallible) for one HIL file."""
    lines = path.read_text().split("\n")
    names = codes | local_error_names("\n".join(lines))
    fallible = documented = 0
    for i, line in enumerate(lines):
        if not FN.match(line):
            continue
        sig, j = line, i
        while ";" not in sig and "{" not in sig and j + 1 < len(lines):
            j += 1
            sig += " " + lines[j].strip()
        if "-> Result" not in sig or UNIT_ERR.search(sig):
            continue
        fallible += 1
        k, block = i - 1, []
        while k >= 0 and (
            lines[k].strip().startswith("///") or lines[k].strip().startswith("#[")
        ):
            block.append(lines[k])
            k -= 1
        text = "\n".join(block)
        if any(re.search(r"\b%s\b" % re.escape(n), text) for n in names):
            documented += 1
    return documented, fallible


def collect():
    codes = error_names()
    out = {}
    for path in sorted(HIL.rglob("*.rs")):
        documented, fallible = scan(path, codes)
        if fallible:
            out[str(path.relative_to(ROOT))] = (documented, fallible)
    if not out:
        sys.exit("found no fallible HIL methods -- the parse is wrong, not the tree")
    return out


def read_baseline():
    if not BASELINE.exists():
        sys.exit(f"no baseline at {BASELINE}; run with --update to create it")
    out = {}
    for line in BASELINE.read_text().split("\n"):
        line = line.split("#")[0].strip()
        if not line:
            continue
        name, documented, fallible = line.rsplit(None, 2)
        out[name] = (int(documented), int(fallible))
    return out


def main():
    args = set(sys.argv[1:])
    now = collect()

    if "--update" in args:
        body = "\n".join(f"{k} {v[0]} {v[1]}" for k, v in sorted(now.items()))
        BASELINE.write_text(
            "# documented / fallible methods per HIL file. Regenerate with\n"
            "# tools/ci/check-hil-error-docs.py --update\n" + body + "\n"
        )
        print(f"recorded {len(now)} files")
        return 0

    was = read_baseline()
    problems = []
    for name, (documented, fallible) in sorted(now.items()):
        if name not in was:
            # A new HIL file is not a regression, but its methods are the
            # queue's problem rather than this run's.
            continue
        old_doc, old_fallible = was[name]
        if documented < old_doc:
            problems.append(
                f"{name}: {old_doc} methods named their errors, now {documented}"
            )
        elif fallible > old_fallible and documented == old_doc:
            problems.append(
                f"{name}: gained {fallible - old_fallible} fallible method(s) "
                f"and documented none of them"
            )

    total_doc = sum(d for d, _ in now.values())
    total_all = sum(f for _, f in now.values())
    for p in problems:
        print(f"  REGRESSED  {p}")
    print(
        f"  {'fail' if problems else 'ok'}      "
        f"{total_doc} of {total_all} fallible HIL methods name an error "
        f"({100 * total_doc // total_all}%), across {len(now)} files"
    )

    if "--worklist" in args:
        gaps = sorted(
            ((f - d, f, d, n) for n, (d, f) in now.items()), reverse=True
        )
        print("\n  undocumented, largest gap first:")
        for gap, fallible, documented, name in gaps:
            if gap:
                print(f"    {documented:3d}/{fallible:<3d}  {name}")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
