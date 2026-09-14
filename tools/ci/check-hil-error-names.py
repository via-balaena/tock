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

TWO RULES, because the first version only caught half of it.

**`Err(NAME)` must name a variant.** Only SCREAMING_CASE names are examined,
because that is how a variant is spelled and nothing else inside an `Err(...)`
is: `Err(Error)` names `hil::can`'s own error enum, `Err(err)` and
`Err(source)` are bindings in prose, `Err(T)` is a generic parameter. A
three-letter floor keeps `Err(T)` out while admitting `Err(OFF)`.

**No E-prefixed spelling of a real variant, anywhere in a comment.** The first
rule missed sixteen further sites, because capsule module docs write the code
bare -- `* ENOSUPPORT: Invalid allow_num` -- rather than inside an `Err(...)`.
The C-errno habit is the cause and it is not a convention here: upstream doc
comments run NOSUPPORT 39 to ENOSUPPORT 17, INVAL 90 to EINVAL 0, BUSY 129 to
EBUSY 1, and TRD104's own table names every code bare.

Markdown under `doc/` is scanned too, since `doc/syscalls/` documents the same
codes to userspace -- but NOT `doc/wg/`, which is meeting notes. Those are a
record of what people said and must not be tidied.

Exit 0 if every name resolves, 1 if one does not, 2 if the check could not run
-- an unreadable ErrorCode enum is a broken check, not a passing one.
"""

import collections
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TREES = ["kernel", "capsules", "chips", "arch", "libraries", "boards", "doc"]
# Meeting notes record what was said; correcting them would be falsifying them.
SKIP = ("doc/wg/",)

COMMENT = re.compile(r"^\s*(?:///|//!|//)")
EPREFIX = re.compile(r"\b(E[A-Z][A-Z0-9]{2,})\b")
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
        for p in sorted((ROOT / tree).rglob("*"))
        if p.suffix in (".rs", ".md")
        and "/target/" not in str(p)
        and not any(s in str(p.relative_to(ROOT)) for s in SKIP)
    ]
    if not files:
        print("  BROKEN  found no .rs files to scan")
        return 2

    texts = {p: p.read_text(encoding="utf-8", errors="replace") for p in files}

    eforms = {"E" + v: v for v in variants}

    bad = collections.defaultdict(list)
    total = 0
    for path, text in texts.items():
        is_rust = path.suffix == ".rs"
        for lineno, line in enumerate(text.splitlines(), 1):
            prose = not is_rust or COMMENT.match(line)
            if not prose:
                continue
            site = f"{path.relative_to(ROOT)}:{lineno}"
            if is_rust:
                for name in MENTION.findall(line):
                    total += 1
                    if name in variants:
                        continue
                    bad[name].append(site)
            for name in EPREFIX.findall(line):
                if name in eforms:
                    total += 1
                    bad[f"{name} (did you mean {eforms[name]}?)"].append(site)

    if not total:
        print("  BROKEN  no `Err(NAME)` mentions found at all -- the scan missed")
        return 2

    if not bad:
        print(f"  ok      {total} documented error names across {len(files)} "
              f"files, every one resolves")
        return 0

    for name, where in sorted(bad.items(), key=lambda kv: -len(kv[1])):
        print(f"  UNKNOWN {name} is not an ErrorCode variant "
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
