#!/usr/bin/env python3
"""A `SAFETY:` comment must be attached to `unsafe` code.

AGENTS.md requires every `unsafe` to carry a comment explaining why it is
sound. The converse is not written anywhere and turns out to matter: psc3 and
psoc62xa used the same form to excuse five `unwrap()`s each -- *"// SAFETY:
When a transmit is started, a buffer is passed"* above an `unwrap` that would
take the board down from inside an interrupt handler if it were ever wrong.

Nothing there is unsafe. The comments were true, and the invariants really were
maintained by the entry points, but borrowing the shape of the unsafe-code rule
to justify a panic makes a panic look reviewed. It also spreads: those two
drivers are near-identical, so it had already been copied once.

THE RULE: a line matching `// SAFETY:` must have `unsafe` within the next three
non-comment lines, or on the last non-comment line before it. Both directions
are needed. Most sites are a comment above an `unsafe` block or call; the
lookbehind is for the other common shape, a `SAFETY:` written *inside* an
`unsafe { }` whose keyword is on the line above -- `map_cell.rs` does that, and
a forward-only rule reports it.

The tree has 137 of these comments and every one passes, which is what makes
the rule enforceable rather than aspirational.

WHAT THIS CANNOT CHECK: whether the comment is true, or whether an `unsafe`
block has a comment at all -- that is the rule AGENTS.md already states and it
is not what this is for.

Exit 0 if every comment sits on unsafe code, 1 if one does not, 2 if the scan
found too few comments to have run.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SAFETY = re.compile(r"^\s*//+[!/]?\s*SAFETY:")
COMMENT = re.compile(r"^\s*//")
LOOKAHEAD = 3

# What the tree holds today. A scan that suddenly finds a handful has stopped
# matching the comment form, not been cleaned up.
FLOOR = 100


def looks_unsafe(lines, i):
    """Whether `unsafe` is in view of the SAFETY comment on line `i`."""
    view, j = [], i + 1
    while j < len(lines) and len(view) < LOOKAHEAD:
        text = lines[j].strip()
        if text and not COMMENT.match(lines[j]):
            view.append(text)
        j += 1
    k = i - 1
    while k >= 0 and (not lines[k].strip() or COMMENT.match(lines[k])):
        k -= 1
    if k >= 0:
        view.append(lines[k].strip())
    return any("unsafe" in v for v in view)


def main():
    found, bad = 0, []
    for path in sorted(ROOT.rglob("*.rs")):
        if "target/" in str(path):
            continue
        lines = path.read_text(errors="replace").splitlines()
        for i, line in enumerate(lines):
            if not SAFETY.match(line):
                continue
            found += 1
            if not looks_unsafe(lines, i):
                rel = path.relative_to(ROOT)
                bad.append((f"{rel}:{i + 1}", line.strip()[:58]))

    if found < FLOOR:
        print(f"  BROKEN  only {found} SAFETY: comments found, expected "
              f"{FLOOR}+ -- the scan is not matching")
        return 2

    if not bad:
        print(f"  ok      {found} SAFETY: comments, every one on unsafe code")
        return 0

    for site, text in bad:
        print(f"  UNATTACHED {site}  {text}")
    print("          A SAFETY: comment on safe code borrows the form of the")
    print("          unsafe-code rule for something else -- usually a panic.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
