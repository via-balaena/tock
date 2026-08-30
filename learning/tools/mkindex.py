#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Emit the publishable copy of the series, with hosted links instead of paths.

Every page here links the others by relative path: the cover opens
`ch04-what-a-driver-may-touch/`, and a chapter reaches its neighbours at
`../ch05-what-a-process-is/` and the cover at `../`. That is what a clone
wants, and what a static host wants -- on a real site this script has nothing
to do, and the right build is `cp -r learning/ .`

Artifacts are the host that cannot do it. Each page is uploaded standalone to
an account-scoped URL with no path relationship to any other, so every one of
those hrefs is dead there and has to be substituted. The URLs are addresses on
an account rather than part of a CC BY-SA work, so they live in an ignored
`artifact-urls.json` beside this script rather than in the branch.

Two copies of one series, and reissuing one and forgetting the other is a real
failure but a silent one -- so this writes the whole set at once, and refuses
to write anything at all if a single link would land dead.

    python3 learning/tools/mkindex.py /tmp/publish

It was named for the cover, which was the only page with links to rewrite until
the chapters were linked to each other.
"""

import json
import os
import re
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)

# The cover's own entry in artifact-urls.json. Chapters link back to it, so it
# is needed for the same reason the chapters' own URLs are.
COVER = "index"


def main(argv):
    if len(argv) != 2:
        print("usage: mkindex.py <output-directory>")
        return 2
    out = argv[1]

    urls_path = os.path.join(TOOLS, "artifact-urls.json")
    if not os.path.exists(urls_path):
        print("no artifact-urls.json beside mkindex.py; nothing to substitute")
        return 1
    with open(urls_path, encoding="utf-8") as fh:
        urls = json.load(fh)

    chapters = sorted(d for d in os.listdir(ROOT)
                      if d.startswith("ch")
                      and os.path.isdir(os.path.join(ROOT, d)))

    missing = [c for c in chapters + [COVER] if c not in urls]
    if missing:
        print("no URL for: %s" % ", ".join(missing))
        print("the published copy would carry a dead link, so nothing written")
        return 1

    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as fh:
        cover = fh.read()

    linked = set(re.findall(r'href="(ch[^"/]+)/"', cover))
    unlinked = sorted(set(chapters) - linked)
    if unlinked:
        print("the cover does not link: %s" % ", ".join(unlinked))
        return 1

    # A hosted page opens outside the frame it is served in, so the reader
    # keeps the page they were on rather than navigating away from it inside
    # itself. Same-tab is right in a clone and on a site, which is why this
    # attribute is added here and is not in the source.
    def hosted(url):
        return 'href="%s" target="_blank" rel="noopener"' % url

    pages = {"index.html": cover}
    for chapter in chapters:
        with open(os.path.join(ROOT, chapter, "index.html"),
                  encoding="utf-8") as fh:
            pages["%s.html" % chapter] = fh.read()

    written = {}
    for name, html in sorted(pages.items()):
        # A chapter reaching a sibling, then the cover from the chapters, then
        # the cover reaching a chapter. Longest pattern first, so `../ch04/`
        # is never partly eaten by the rule for `../`.
        html = re.sub(r'href="\.\./(ch[^"/]+)/"',
                      lambda m: hosted(urls[m.group(1)]), html)
        html = re.sub(r'href="\.\./"', hosted(urls[COVER]), html)
        html = re.sub(r'href="(ch[^"/]+)/"',
                      lambda m: hosted(urls[m.group(1)]), html)

        # Nothing on a hosted page can be reached by relative path. This is the
        # check that makes the whole set safe: a link shape nobody thought of
        # stops the build instead of shipping dead.
        leftover = re.findall(r'href="(?!https?:|#|mailto:)([^"]+)"', html)
        if leftover:
            print("%s: relative links survive the rewrite: %s"
                  % (name, ", ".join(sorted(set(leftover)))))
            return 1
        written[name] = html

    if not os.path.isdir(out):
        os.makedirs(out)
    for name, html in sorted(written.items()):
        with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
            fh.write(html)

    print("wrote %d pages to %s" % (len(written), out))
    for name in sorted(written):
        print("  %s" % name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
