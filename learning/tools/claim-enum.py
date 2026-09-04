#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Enumerate every assertion-bearing sentence in a document, so a factual
review pass has a denominator.

The rubric (memory: prose-concision) grades each claim V/I/N/U and stops when
every claim is graded and none is false. That stopping condition is
meaningless without a claim set, and a human reading for facts silently
selects one -- on the Pico 2 book page the implicit selection covered 44% of
the page and missed a false absolute in the 56% it skipped.

So: enumerate mechanically FIRST, grade the printed list, and let the count be
the denominator you quote.

    ./claim-enum.py src/setup/pico2.md
    ./claim-enum.py --html learning/ch03-*/index.html

Markdown table rows are split per cell, because a table cell is a claim and
gets lost inside a line. Fenced code, headings and HTML script/style/svg are
dropped -- they are checked a different way.

Output is numbered so a grading pass can refer to claims by number, and the
tail line is the count to quote.
"""

import argparse
import re
import sys

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z`*\[])")
RULE_ONLY = set("- :|")


def from_markdown(text):
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    units = []
    for chunk in text.split("\n\n"):
        block = chunk.strip()
        if not block or block.startswith("#"):
            continue
        if block.lstrip().startswith("|"):
            for line in block.split("\n"):
                for cell in line.strip().strip("|").split("|"):
                    cell = cell.strip()
                    if cell and not set(cell) <= RULE_ONLY:
                        units.append(("table", cell))
        else:
            units.append(("prose", " ".join(block.split())))
    return units


def from_html(text):
    for tag in ("script", "style", "svg"):
        text = re.sub(rf"<{tag}.*?</{tag}>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]*>", " ", text)
    text = text.replace("&nbsp;", " ")
    return [("prose", " ".join(p.split())) for p in text.split("\n\n") if p.strip()]


def sentences(units, min_words):
    out = []
    for kind, unit in units:
        for s in SENT_SPLIT.split(unit):
            s = s.strip(" -*")
            if len(s.split()) >= min_words:
                out.append((kind, s))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path")
    ap.add_argument("--html", action="store_true", help="input is HTML, not markdown")
    ap.add_argument(
        "--min-words",
        type=int,
        default=4,
        help="skip fragments shorter than this (default 4)",
    )
    ap.add_argument("--width", type=int, default=150)
    args = ap.parse_args()

    text = open(args.path, encoding="utf-8").read()
    units = from_html(text) if args.html else from_markdown(text)
    found = sentences(units, args.min_words)

    for i, (kind, s) in enumerate(found, 1):
        print(f"{i:3}. [{kind:5}] {s[: args.width]}")

    counts = {}
    for kind, _ in found:
        counts[kind] = counts.get(kind, 0) + 1
    breakdown = ", ".join(f"{v} {k}" for k, v in sorted(counts.items()))
    print(f"\n{len(found)} assertion-bearing sentences ({breakdown})", file=sys.stderr)
    print(
        "Grade every one V/I/N/U. Quote this number as the denominator.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
