#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Emit the publishable copy of the cover, with hosted links instead of paths.

`learning/index.html` links its chapters by relative path, which is what a
clone wants and what the gate checks. The published copy needs the hosted URL
of each chapter instead, and those URLs are account-scoped links rather than
content, so they are not in the repository -- they live in an ignored
`artifact-urls.json` beside this script.

Two files, one source. Editing the cover and forgetting to reissue the
published copy is a real failure, but a silent one, so this refuses to write
anything if a chapter has no URL rather than emitting a cover with one dead
entry in it.

    python3 learning/tools/mkindex.py /path/to/publish/index.html
"""

import json
import os
import re
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)


def main(argv):
    if len(argv) != 2:
        print("usage: mkindex.py <output.html>")
        return 2
    out = argv[1]

    urls_path = os.path.join(TOOLS, "artifact-urls.json")
    if not os.path.exists(urls_path):
        print("no artifact-urls.json beside mkindex.py; nothing to substitute")
        return 1
    with open(urls_path, encoding="utf-8") as fh:
        urls = json.load(fh)

    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as fh:
        html = fh.read()

    chapters = sorted(d for d in os.listdir(ROOT)
                      if d.startswith("ch")
                      and os.path.isdir(os.path.join(ROOT, d)))
    missing = [c for c in chapters if c not in urls]
    if missing:
        print("no URL for: %s" % ", ".join(missing))
        print("the published cover would carry a dead link, so nothing written")
        return 1

    linked = set(re.findall(r'href="(ch[^"/]+)/"', html))
    unlinked = sorted(set(chapters) - linked)
    if unlinked:
        print("the cover does not link: %s" % ", ".join(unlinked))
        return 1

    # A hosted chapter opens outside the frame the cover is served in, so the
    # reader keeps the cover rather than navigating away from it inside itself.
    def swap(match):
        return 'href="%s" target="_blank" rel="noopener"' % urls[match.group(1)]

    html = re.sub(r'href="(ch[^"/]+)/"', swap, html)

    # Nothing on a hosted page can be reached by relative path.
    leftover = re.findall(r'href="(?!https?:|#|mailto:)([^"]+)"', html)
    if leftover:
        print("relative links survive the rewrite: %s" % ", ".join(leftover))
        return 1

    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("wrote %s with %d hosted chapter links" % (out, len(chapters)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
