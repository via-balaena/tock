#!/usr/bin/env python3
"""Every `Err(NAME)` written in a comment must name something that exists.

`kernel/src/hil/uart.rs` documented `Err(ENOSUPPORT)` for
`Configure::configure`. There is no such `ErrorCode` variant -- the enum has
`NOSUPPORT` -- so the sentence described a return value no implementation
could produce, and nothing caught it because doc comments are not compiled.

It did not stay put either. Quoting a HIL sentence into the driver that obeys
it is a good habit, and it carried the wrong name into 37 further comments
across 26 chip files in a single day. One wrong word in a doc comment is
cheap; one wrong word that everything downstream quotes is not.

Only SCREAMING_CASE names are examined, because that is how an `ErrorCode`
variant is spelled and nothing else in an `Err(...)` is: `Err(Error)` names
`hil::can`'s own error enum, `Err(err)` and `Err(source)` are bindings in
prose, `Err(T)` is a generic parameter. A three-letter floor keeps `Err(T)`
and `Err(E)` out while admitting `Err(OFF)`.

Exit 0 if every name resolves, 1 if one does not, 2 if the check could not run
-- an unreadable ErrorCode enum is a broken check, not a passing one.
"""

import collections
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TREES = ["kernel", "capsules", "chips", "arch", "libraries", "boards"]

COMMENT = re.compile(r"^\s*(?:///|//!|//)")
# SCREAMING_CASE only, three characters or more. See the module docstring.
MENTION = re.compile(r"Err\(([A-Z][A-Z0-9_]{2,})\)")


# Anchored on the brace, not on a substring. `pub enum ErrorCode` is a prefix
# of `pub enum ErrorCodeRenamed`, so a plain `in` test survives the enum being
# renamed out from under it and then extracts variants from whatever followed
# -- which is how this function first passed a test designed to break it.
ENUM = re.compile(r"pub enum ErrorCode\s*\{")

# A floor on the count, so a regex that matches the enum but not its variants
# reports a broken check rather than an empty set that vacuously agrees with
# every name it is asked about.
MIN_VARIANTS = 8


def error_code_variants():
    src = (ROOT / "kernel" / "src" / "errorcode.rs").read_text(encoding="utf-8")
    match = ENUM.search(src)
    if not match:
        return None
    body = src[match.end():]
    end = body.find("\n}")
    if end < 0:
        return None
    found = set(re.findall(r"^\s+([A-Z][A-Z0-9]*)\s*=", body[:end], re.M))
    return found if len(found) >= MIN_VARIANTS else None


def main():
    variants = error_code_variants()
    if not variants:
        print("  BROKEN  could not read the ErrorCode enum")
        return 2

    files = [
        p
        for tree in TREES
        for p in sorted((ROOT / tree).rglob("*.rs"))
        if "/target/" not in str(p)
    ]
    if not files:
        print("  BROKEN  found no .rs files to scan")
        return 2

    texts = {p: p.read_text(encoding="utf-8", errors="replace") for p in files}

    bad = collections.defaultdict(list)
    total = 0
    for path, text in texts.items():
        for lineno, line in enumerate(text.splitlines(), 1):
            if not COMMENT.match(line):
                continue
            for name in MENTION.findall(line):
                total += 1
                if name in variants:
                    continue
                bad[name].append(f"{path.relative_to(ROOT)}:{lineno}")

    if not total:
        print("  BROKEN  no `Err(NAME)` mentions found at all -- the scan missed")
        return 2

    if not bad:
        print(f"  ok      {total} `Err(NAME)` mentions, every name resolves")
        return 0

    for name, where in sorted(bad.items(), key=lambda kv: -len(kv[1])):
        print(f"  UNKNOWN `Err({name})` is not an ErrorCode variant "
              f"-- {len(where)} site(s)")
        for site in where[:8]:
            print(f"            {site}")
        if len(where) > 8:
            print(f"            ... and {len(where) - 8} more")
    print("          A documented return nobody can return. Check the spelling")
    print("          against kernel/src/errorcode.rs, and fix every quote of it.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
