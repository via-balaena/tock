#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Build a renderable copy of a chapter, with the script-built figures filled in.

QuickLook is the only renderer on this machine and it does not run JavaScript,
so a figure whose contents are built at load renders as an empty box. Seven of
chapter 1's sixteen figures are in that position, which meant that for several
review rounds the only way to look at one was to hand-write a fixture from
reading its builder -- so it was done once, for one figure, and that one round
found a shipped bug.

This does it for all of them at once. It runs the page under the same shim and
bundle `check.py` assembles for the behavioural checks, walks the DOM the page
built, serialises it back to HTML, and splices each container's contents into a
copy of the page. The result is a file you can hand to `qlmanage`.

    tools/fixture.py ch01-everything-is-memory --out /tmp/f.html
    qlmanage -t -s 1100 -o /tmp /tmp/f.html

The options exist because each one is a step that was otherwise re-derived, and
got wrong, every time somebody rendered something:

  --click ID     fire a click before dumping, repeatable, in order. The boot
                 state is what most readers see, but it is rarely what teaches;
                 the race figure only makes its point once it has been run to
                 the end.
  --isolate ID   hide everything except the figure containing that id. Pick an
                 id, not a class: a class silently hides the whole page and you
                 get a blank square.
  --theme        force one. This is not cosmetic -- QuickLook follows the system
                 appearance, so on a machine set to Dark an unmodified copy is
                 not the light view, and two "both themes" renders come back
                 byte-identical. Forcing works by re-emitting the token block
                 under a selector that out-specifies the dark media query.
  --phone        re-emit the max-width blocks as plain rules. QuickLook does not
                 fire media queries, so narrowing the wrapper proves nothing.

Non-ASCII is written as numeric entities, because these pages carry no
<meta charset> on purpose and raw UTF-8 in a fixture renders as mojibake that
looks like a page bug.
"""

import argparse
import html as html_module
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")


def _check_module():
    spec = importlib.util.spec_from_file_location(
        "check", os.path.join(TOOLS, "check.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Serialising the shim's tree needs nothing the shim does not already hold:
# createElement records the tag, className and classList are one attribute, and
# attributes are strings. An element either has children or has text, because
# that is how these builders work -- a parent gets appendChild, a leaf gets
# textContent -- so there is no interleaving to preserve.
SERIALISE_JS = r"""
function _esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/[^\x00-\x7F]/g, function (c) {
      return "&#" + c.charCodeAt(0) + ";";
    });
}
function _ser(el) {
  var tag = (el.tagName || "span").toLowerCase(), a = "";
  if (el.id) { a += ' id="' + _esc(el.id) + '"'; }
  if (el.className) { a += ' class="' + _esc(el.className) + '"'; }
  Object.keys(el._attrs).forEach(function (k) {
    a += " " + k + '="' + _esc(el._attrs[k]) + '"';
  });
  if (el.disabled) { a += " disabled"; }
  var inner = el.children.length
    ? el.children.map(_ser).join("")
    : _esc(el.textContent);
  return "<" + tag + a + ">" + inner + "</" + tag + ">";
}
CLICKS.forEach(function (id) {
  if (!REG[id]) { throw new Error("--click names an id the page does not have: " + id); }
  REG[id].fire("click");
});
var OUT = {};
Object.keys(REG).forEach(function (id) {
  var el = REG[id];
  OUT[id] = {
    i: el.children.length ? el.children.map(_ser).join("") : _esc(el.textContent),
    t: el.children.length ? "" : el.textContent,
    c: el.className,
    d: !!el.disabled,
    a: el._attrs
  };
});
print(JSON.stringify(OUT));
"""


def generated(chapter_dir, clicks):
    """Run the page under the shim and report what every element ended up as.

    The bundle comes from check.py rather than being assembled here. It was
    assembled here once, and when class seeding was added to the other copy
    this one did not get it -- so a figure rendered with a panel stripped of
    the classes its markup declares, which read as a page bug and was not one.
    """
    check = _check_module()
    page = os.path.join(chapter_dir, "index.html")
    with open(page, encoding="utf-8") as handle:
        html = handle.read()

    tail = "var CLICKS = %s;\n%s" % (json.dumps(clicks), SERIALISE_JS)
    tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                      encoding="utf-8")
    try:
        tmp.write(check.page_bundle(html, tail))
        tmp.close()
        proc = subprocess.run([check.JSC, tmp.name], capture_output=True,
                              text=True)
    finally:
        os.unlink(tmp.name)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout + proc.stderr)
        raise SystemExit("the page did not run under the shim")
    return json.loads(proc.stdout.strip()), check.page_state(html)["text"]


def _rewrite_open_tag(tag, state):
    """Put the live class, attributes and disabled state back on one element."""
    if state["c"]:
        if re.search(r'\bclass="[^"]*"', tag):
            tag = re.sub(r'\bclass="[^"]*"', 'class="%s"' % state["c"],
                         tag, count=1)
        else:
            tag = tag[:-1].rstrip() + ' class="%s">' % state["c"]
    for key, value in state["a"].items():
        if re.search(r'\b%s="[^"]*"' % re.escape(key), tag):
            tag = re.sub(r'\b%s="[^"]*"' % re.escape(key),
                         '%s="%s"' % (key, value), tag, count=1)
        else:
            tag = tag[:-1].rstrip() + ' %s="%s">' % (key, value)
    if state["d"] and "disabled" not in tag:
        tag = tag[:-1].rstrip() + " disabled>"
    return tag


def splice(html, built, markup_text, after_clicks):
    """Put what the script built back into the markup.

    With no clicks this fills only the containers the markup leaves empty.
    That is deliberate: an element the script merely re-worded already reads
    correctly in the markup, and overwriting it would hide a disagreement
    between the two, which is the thing boot_state_checks exists to catch.

    After a click, that reasoning inverts -- the markup is *supposed* to be out
    of date, and leaving it produces a fixture that lies. Figure 16 rendered
    "1 of 5 shown" beneath five visible rungs the first time this was used. So
    in that mode the live class, attributes and disabled state go back onto
    every element, and the text is replaced wherever the script actually
    changed it -- which is decided by comparing against the markup's own text,
    not by guessing from whether the markup happens to contain tags. Guessing
    left the race figure's outcome box saying "Press Step" in the red tint it
    wears when a pin has been lost.
    """
    filled = 0
    for element_id, state in built.items():
        inner = state["i"]
        empty = re.compile(
            r'(<(\w+)[^>]*\bid="%s"[^>]*>)\s*(</\2>)' % re.escape(element_id))
        html, count = empty.subn(
            lambda m: _rewrite_open_tag(m.group(1), state) + inner + m.group(3),
            html)
        if count:
            filled += count
            continue
        if not after_clicks:
            continue
        full = re.compile(
            r'(<(\w+)[^>]*\bid="%s"[^>]*>)(.*?)(</\2>)'
            % re.escape(element_id), re.S)

        def replace(match):
            body = match.group(3)
            was = markup_text.get(element_id)
            changed = was is not None and " ".join(state["t"].split()) != was
            keep = inner if changed else body
            return (_rewrite_open_tag(match.group(1), state) + keep
                    + match.group(4))

        html, count = full.subn(replace, html, count=1)
        filled += count
    return html, filled


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("chapter", help="chapter directory under learning/")
    parser.add_argument("--out", help="write the fixture here (default: stdout)")
    parser.add_argument("--click", action="append", default=[], metavar="ID",
                        help="fire a click on this id first; repeatable")
    parser.add_argument("--isolate", metavar="ID",
                        help="show only the figure containing this id")
    parser.add_argument("--theme", choices=("light", "dark", "auto"),
                        default="auto", help="force a theme (default: auto)")
    parser.add_argument("--phone", action="store_true",
                        help="apply the narrow-width rules unconditionally")
    parser.add_argument("--keep-noscript", action="store_true",
                        help="keep the no-JavaScript notice, which is normally "
                             "stripped so the render shows the ordinary view")
    args = parser.parse_args()

    chapter_dir = args.chapter
    if not os.path.isdir(chapter_dir):
        chapter_dir = os.path.join(ROOT, args.chapter)
    page = os.path.join(chapter_dir, "index.html")
    if not os.path.exists(page):
        raise SystemExit("no index.html in %s" % chapter_dir)

    with open(page, encoding="utf-8") as handle:
        source = handle.read()

    built, markup_text = generated(chapter_dir, args.click)
    body = source
    if not args.keep_noscript:
        body = re.sub(r"<noscript>.*?</noscript>", "", body, flags=re.S)
    body, filled = splice(body, built, markup_text, bool(args.click))

    extra = ""
    if args.isolate:
        extra += ('<style>.wrap > *:not(:has(#%s)) '
                  '{ display: none !important; }</style>' % args.isolate)
    if args.theme == "light":
        tokens = re.search(r"^:root \{(.*?)^\}", source, re.S | re.M).group(1)
        extra += ('<style>html:root:not([data-theme="never"]) {%s}</style>'
                  % tokens)
    elif args.theme == "dark":
        block = re.search(r"@media \(prefers-color-scheme: dark\)\s*\{\s*"
                          r':root:not\(\[data-theme="light"\]\)\s*\{(.*?)\}\s*\}',
                          source, re.S)
        extra += ('<style>html:root:not([data-theme="never"]) {%s}</style>'
                  % block.group(1))
    if args.phone:
        narrow = "".join(re.findall(r"@media \(max-width: 30rem\)\s*\{(.*?)\n\}",
                                    source, re.S))
        extra += ("<style>.wrap { max-width: 374px !important; }%s</style>"
                  % narrow)

    out = body + extra
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(out)
        sys.stderr.write("%s - %d container(s) filled%s\n"
                         % (args.out, filled,
                            ", %d click(s) fired" % len(args.click)
                            if args.click else ""))
    else:
        sys.stdout.write(out)


if __name__ == "__main__":
    main()
