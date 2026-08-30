#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Render every figure in a chapter, so the look is complete rather than sampled.

    python3 learning/tools/contact.py ch01-everything-is-memory
    python3 learning/tools/contact.py --all

Nothing in the gate can see a rendered pixel. `harness.js` has no stylesheet at
all, so a rule that hides what it should show, a label clipped mid-word, a bar
drawn over the text under it and a colour pair that vanishes in one theme are
invisible to all 44 checks. Every one of those shipped at least once, and every
one was found by rendering something and looking at it.

The trouble with that is not the looking, it is the sampling: figures get
rendered when somebody thinks to render them, which means the ones nobody
suspects are never seen. This renders all of them -- every figure, in both
themes and at phone width -- into one page per chapter, so the manual pass has
a fixed and finite shape.

It builds an ordinary HTML page and stops. **Open it in a browser**: the
frames measure their own contents there, so a tall figure is shown whole.
QuickLook renders it too and is useful for a quick overview, but it runs no
scripts, so every frame stays at its fallback height and the tall figures are
cut off -- which is the one thing this tool exists to prevent.

    python3 learning/tools/contact.py --all --out /tmp
    open /tmp/contact-ch01.html

What it cannot do is decide whether what it drew is right. That stays a human
reading a page of pictures, which is the point: the tool makes sure the page
holds every picture.
"""

import argparse
import os
import re
import subprocess
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)


def figures(chapter):
    """(anchor id, label, title) for every figure, in document order."""
    with open(os.path.join(ROOT, chapter, "index.html"), encoding="utf-8") as fh:
        page = fh.read()
    out = []
    for block in re.findall(r"<figure.*?</figure>", page, flags=re.S):
        label = re.search(r'instrument-label">([^<]*)</span>', block)
        title = re.search(r'instrument-title">([^<]*)</span>', block)
        # The first id inside the figure is what --isolate keys on. A figure
        # with none cannot be isolated and is reported rather than skipped
        # quietly, because a figure nobody can render is exactly the one that
        # ships broken.
        ident = re.search(r'\bid="([a-zA-Z][a-zA-Z0-9_-]*)"', block)
        out.append((ident.group(1) if ident else None,
                    label.group(1) if label else "?",
                    title.group(1) if title else "?"))
    return out


def render(chapter, ident, theme, phone):
    args = [sys.executable, os.path.join(TOOLS, "fixture.py"), chapter,
            "--isolate", ident, "--theme", theme]
    if phone:
        args.append("--phone")
    done = subprocess.run(args, capture_output=True, text=True)
    if done.returncode != 0:
        return None, done.stderr.strip().split("\n")[-1][:120]
    return done.stdout, None


CELL = """<section class="cell">
  <h2>%s &middot; %s <span class="how">%s</span></h2>
  <iframe srcdoc="%s" title="%s, %s"></iframe>
</section>"""


def sheet(chapter, out_path):
    cells, problems = [], []
    for ident, label, title in figures(chapter):
        if ident is None:
            problems.append("%s has no id, so it cannot be isolated" % label)
            continue
        for theme, phone, how in (("light", False, "light"),
                                  ("dark", False, "dark"),
                                  ("dark", True, "dark, phone")):
            html, why = render(chapter, ident, theme, phone)
            if why:
                problems.append("%s (%s): %s" % (label, how, why))
                continue
            cells.append(CELL % (label, title, how,
                                 html.replace("&", "&amp;").replace('"', "&quot;"),
                                 label, how))
    page = """<!doctype html><meta charset="utf-8">
<title>%s &mdash; every figure</title>
<style>
 body { margin: 0; padding: 1.2rem; background: #6b6b70;
   font: 13px -apple-system, BlinkMacSystemFont, sans-serif; }
 h1 { color: #fff; font-size: 1rem; margin: 0 0 1rem; }
 .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
   gap: 1rem; align-items: start; }
 .cell h2 { font-size: .72rem; font-weight: 700; letter-spacing: .04em;
   text-transform: uppercase; color: #fff; margin: 0 0 .3rem; }
 .cell .how { color: #d6d6da; font-weight: 400; text-transform: none;
   letter-spacing: 0; }
 iframe { width: 100%%; height: 620px; border: 0; background: #fff;
   border-radius: 3px; display: block; }
 .bad { color: #ffd9d2; background: #7a2f24; padding: .5rem .7rem;
   border-radius: 3px; margin-bottom: .8rem; white-space: pre-wrap; }
</style>
<h1>%s &mdash; %d figures, three renders each</h1>
%s
<div class="grid">%s</div>
<script>
/* A fixed height clips the tall figures, which is where a defect at the bottom
   of one would hide -- the opposite of the point. These are srcdoc frames, so
   the document inside is reachable and can be measured. */
addEventListener("load", function () {
  var frames = document.querySelectorAll("iframe"), i, doc;
  for (i = 0; i < frames.length; i++) {
    try {
      doc = frames[i].contentDocument;
      frames[i].style.height = Math.max(
        doc.body.scrollHeight, doc.documentElement.scrollHeight) + 24 + "px";
    } catch (e) {}
  }
});
</script>
""" % (chapter, chapter, len(figures(chapter)),
       ('<div class="bad">%s</div>' % "\n".join(problems)) if problems else "",
       "\n".join(cells))
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(page)
    return len(cells), problems


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("chapter", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out", default=".")
    args = ap.parse_args(argv[1:])

    chapters = sorted(d for d in os.listdir(ROOT)
                      if d.startswith("ch")
                      and os.path.isdir(os.path.join(ROOT, d)))
    if not args.all:
        if not args.chapter:
            ap.error("name a chapter, or pass --all")
        chapters = [args.chapter]

    bad = 0
    for chapter in chapters:
        out = os.path.join(args.out, "contact-%s.html" % chapter.split("-", 1)[0])
        n, problems = sheet(chapter, out)
        print("%-34s %3d renders -> %s" % (chapter, n, out))
        for problem in problems:
            print("    %s" % problem)
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
