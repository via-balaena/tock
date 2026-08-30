#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Bind the cover and every chapter into one page: the series as a single book.

Nine separate artifacts is nine URLs, nine share pins to move, and nine
republishes for one change. This emits one file instead, in which each page is
a `[data-page]` section and a small router shows one at a time. Reading a
chapter is unchanged; moving between them stops leaving the document.

The source is not touched and does not become a build product. `check.py` still
runs against the nine files, all five review passes still describe them, and
this reads them the way `mkindex.py` does.

Three things have to be reconciled to put nine standalone pages in one DOM:

  * **Ids collide.** 104 of the series' 983 are declared on more than one page,
    and the figure scripts address elements by id. Every id is prefixed with
    its page's key, in the markup, in the stylesheet and in the script's own
    string literals.
  * **Stylesheets overlap.** Each page carries the same colour tokens -- all
    nine are byte-identical -- so one copy is hoisted. Everything after them is
    that page's own, and is scoped under its section, which is what lets the
    cover keep its typography while the chapters keep theirs.
  * **Links point at directories.** `../ch05-what-a-process-is/` becomes
    `#ch04`, which is also what makes a chapter deep-linkable.

    python3 learning/tools/mkbook.py /tmp/book.html
"""

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)

MARKER = "* { box-sizing: border-box; }"

# Attributes whose value is an id, or a space-separated list of them.
ID_REFS = ("aria-labelledby", "aria-controls", "aria-describedby", "for")


def split_page(html):
    """A page as (style, body, script)."""
    style = html[html.index("<style>") + len("<style>"):html.index("</style>")]
    rest = html[html.index("</style>") + len("</style>"):]
    cut = rest.rindex("<script>")
    body = rest[:cut]
    script = rest[cut + len("<script>"):rest.rindex("</script>")]
    return style, body, script


def declared_ids(body):
    return set(re.findall(r'\bid="([^"]+)"', body))


def namespace_body(body, key, ids):
    def one(match):
        attr, value = match.group(1), match.group(2)
        if attr == "id":
            return 'id="%s--%s"' % (key, value)
        if attr == "href":
            target = value[1:]
            return 'href="#%s--%s"' % (key, target) if target in ids else match.group(0)
        parts = [("%s--%s" % (key, p)) if p in ids else p for p in value.split()]
        return '%s="%s"' % (attr, " ".join(parts))

    pattern = r'\b(id|href|%s)="(#?[^"]*)"' % "|".join(ID_REFS)

    def gate(match):
        attr, value = match.group(1), match.group(2)
        if attr == "href" and not value.startswith("#"):
            return match.group(0)
        return one(match)

    return re.sub(pattern, gate, body)


# Each page's script runs untouched, against a `document` that adds the page's
# prefix for it. Rewriting the scripts was tried twice and is a trap both ways:
# by value it prefixes a literal that is a suffix rather than an id, so chapter
# 1's `getElementById("btn-" + k)` over a list of words that are also ids asks
# for `ch01--btn-ch01--pin`; by call site it misses every figure, because the
# chapters pass their prefixes into one `group()` helper and the lookup inside
# it names a variable. Nothing in the series creates an id at runtime, so a
# wrapper around the four `document` members they use is exact and total.
SCOPED = """/* ---- %s ---- */
(function (D) {
  var HOST = D.getElementById("page-%s");
  var document = {
    getElementById: function (id) { return D.getElementById("%s--" + id); },
    createElement: function (tag) { return D.createElement(tag); },
    querySelector: function (sel) { return HOST.querySelector(sel); },
    querySelectorAll: function (sel) { return HOST.querySelectorAll(sel); }
  };
%s
}(document));"""


def _selector(sel, key, ids):
    sel = re.sub(r"#([A-Za-z][\w-]*)",
                 lambda m: "#%s--%s" % (key, m.group(1)) if m.group(1) in ids
                 else m.group(0), sel)
    out = []
    for one in sel.split(","):
        one = one.strip()
        if not one:
            continue
        if one == "body":
            out.append('[data-page="%s"]' % key)
        elif one.startswith("body "):
            out.append('[data-page="%s"] %s' % (key, one[5:]))
        elif one.startswith(":root") or one.startswith("html"):
            out.append(one)
        else:
            out.append('[data-page="%s"] %s' % (key, one))
    return ", ".join(out)


def scope_css(css, key, ids):
    """Put every rule under this page's section, recursing into @media."""
    out, i, n = [], 0, len(css)
    while i < n:
        brace = css.find("{", i)
        if brace < 0:
            out.append(css[i:])
            break
        head = css[i:brace]
        depth, j = 1, brace + 1
        while j < n and depth:
            depth += (css[j] == "{") - (css[j] == "}")
            j += 1
        body = css[brace + 1:j - 1]
        trivia, sel = re.match(r"^(\s*(?:/\*.*?\*/\s*)*)(.*)$", head, re.S).groups()
        if sel.strip().startswith("@"):
            at = sel.strip().split()[0].lower()
            inner = scope_css(body, key, ids) if at in ("@media", "@supports") else body
            out.append("%s%s{%s}" % (trivia, sel, inner))
        else:
            out.append("%s%s { %s}" % (trivia, _selector(sel, key, ids), body.strip() + " "))
        i = j
    return "".join(out)


CHROME_CSS = '''
/* ---- the book's own chrome ----
   Nine pages behind one hash is a good way to hold a book together and a bad
   way to know where you are in one. This is the part that is the book rather
   than any chapter: what you are reading, how far in it sits, and the two
   links that move. It is built here rather than in a chapter because no
   chapter can know what comes before or after it.

   The bar is sticky and short. The line under it fills as you scroll, which
   is the cheap answer to "how much of this is left" on a page that can run to
   thirteen thousand words. */
.bookbar { position: sticky; top: 0; z-index: 40;
  background: var(--surface); border-bottom: 1px solid var(--rule); }
.bookbar-in { max-width: var(--wide, 60rem); margin: 0 auto;
  display: flex; align-items: center; gap: .9rem;
  padding: .5rem 1.4rem; flex-wrap: wrap; }
.bookbar a { color: inherit; text-decoration: none; }
.bookbar-home { font-family: var(--display); font-weight: 700; font-size: .8rem;
  letter-spacing: .02em; color: var(--ink); white-space: nowrap; }
.bookbar-home:hover { color: var(--hot); }
.bookbar-where { font-family: var(--display); font-size: .7rem; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint);
  white-space: nowrap; }
.bookbar-gap { flex: 1 1 auto; }
.bookbar-move { display: flex; gap: .5rem; }
.bookbar-move a { font-family: var(--display); font-size: .72rem; font-weight: 700;
  letter-spacing: .04em; color: var(--ink-soft); border: 1px solid var(--rule);
  border-radius: 2px; padding: .25rem .55rem; white-space: nowrap; }
.bookbar-move a:hover { border-color: var(--hot); color: var(--hot); }
.bookbar-move a[aria-disabled="true"] { color: var(--ink-faint);
  border-color: var(--rule); pointer-events: none; }
/* Twelve pips, one per page, so the shape of the whole book is visible at a
   glance and the one you are on is placed inside it. */
.bookbar-pips { display: flex; gap: 3px; }
.bookbar-pips i { width: 12px; height: 5px; border-radius: 1px;
  background: var(--rule-strong); display: block; }
.bookbar-pips i.is-done { background: var(--ink-faint); }
.bookbar-pips i.is-here { background: var(--hot); }
.bookread { height: 2px; background: var(--hot); width: 0; }
@media (max-width: 34rem) {
  .bookbar-in { padding: .45rem .9rem; gap: .6rem; }
  .bookbar-pips { display: none; }
}
'''

CHROME_HTML = '''<div class="bookbar">
  <div class="bookbar-in">
    <a class="bookbar-home" href="#cover">Learning Tock from the Ground Up</a>
    <span class="bookbar-where" id="bookbar-where">Cover</span>
    <span class="bookbar-pips" id="bookbar-pips" aria-hidden="true">__PIPS__</span>
    <span class="bookbar-gap"></span>
    <nav class="bookbar-move" aria-label="Move through the book">
      <a id="bookbar-prev" href="#cover">&larr; Back</a>
      <a id="bookbar-next" href="#ch00">Next &rarr;</a>
    </nav>
  </div>
  <div class="bookread" id="bookread"></div>
</div>
'''

CHROME_JS = '''
/* ---- where you are in the book ----
   The router already knows which page is showing; this says so out loud. The
   titles come from each page's own <h1>, so a chapter that is renamed renames
   itself here too. Runs after the router, and stays out of the way of the
   gate's shim, which has no window to scroll. */
(function () {
  if (typeof window === "undefined" || !window.addEventListener) { return; }
  var ORDER = __ORDER__, TITLES = __TITLES__, NUMS = __NUMS__;

  function el(id) { return document.getElementById(id); }

  /* What you have already read, kept in this browser and nowhere else. Every
     access is guarded: a private window, cleared site data, or a browser set
     to refuse storage all throw here rather than returning nothing, and a
     book that will not render because it could not remember anything would
     be a poor trade. Without it the pips fall back to position, which is
     what they meant before this existed. */
  var KEY = "tock-book-read";
  function readSet() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return null; }
  }
  function markRead(key) {
    try {
      var seen = readSet() || {};
      if (seen[key]) { return; }
      seen[key] = 1;
      window.localStorage.setItem(KEY, JSON.stringify(seen));
    } catch (e) {}
  }
  function at() {
    var i;
    for (i = 0; i < ORDER.length; i++) {
      if (!document.getElementById("page-" + ORDER[i]).hidden) { return i; }
    }
    return 0;
  }

  function link(a, i) {
    if (i < 0 || i >= ORDER.length) {
      a.setAttribute("aria-disabled", "true");
      a.setAttribute("href", "#" + ORDER[at()]);
      a.textContent = a.id === "bookbar-prev" ? "\u2190 Back" : "Done \u2192";
      return;
    }
    a.removeAttribute("aria-disabled");
    a.setAttribute("href", "#" + ORDER[i]);
    a.textContent = (a.id === "bookbar-prev" ? "\u2190 " : "")
      + TITLES[ORDER[i]] + (a.id === "bookbar-next" ? " \u2192" : "");
  }

  function paint() {
    var i = at(), k, pips = el("bookbar-pips").children;
    // The chapters number themselves from zero in their own mastheads, so
    // the bar says what they say rather than counting positions and landing
    // one out at both ends.
    el("bookbar-where").textContent = i === 0
      ? "Cover" : "Chapter " + NUMS[ORDER[i]] + " of " + NUMS[ORDER[ORDER.length - 1]];
    markRead(ORDER[i]);
    var seen = readSet();
    for (k = 0; k < pips.length; k++) {
      pips[k].className = k === i ? "is-here"
        : ((seen ? seen[ORDER[k]] : k < i) ? "is-done" : "");
    }
    link(el("bookbar-prev"), i - 1);
    link(el("bookbar-next"), i + 1);
    read();
  }

  function read() {
    var doc = document.documentElement;
    var run = doc.scrollHeight - doc.clientHeight;
    var got = run > 40 ? (doc.scrollTop || 0) / run : 0;
    el("bookread").setAttribute("style",
      "width:" + Math.max(0, Math.min(1, got)) * 100 + "%");
  }

  window.addEventListener("hashchange", paint);
  window.addEventListener("scroll", read, true);
  window.addEventListener("resize", read);
  paint();
}());
'''

ROUTER = """
/* ---- the book ----
   Ten pages in one document, one of them shown. The hash is the page, so a
   chapter is still a link somebody can send, and an id inside a chapter is
   still a link into it -- which is what keeps `#glossary` working.

   The order and the owner map are written out by the build rather than found
   by walking the DOM. That is not only simpler: it means this needs no
   attribute selectors and no parent traversal, so the same bundle the gate
   runs its chapters under can execute the whole book. */
(function () {
  var ORDER = __ORDER__;
  var OWNER = __OWNER__;

  /* Under the gate's DOM shim there is no window to route with. The pages all
     stay visible there, which is what a test of ten coexisting chapters
     wants anyway. */
  if (typeof window === "undefined" || !window.addEventListener) { return; }

  function page(key) { return document.getElementById("page-" + key); }

  function show(key, anchor) {
    var i, el;
    for (i = 0; i < ORDER.length; i++) {
      el = page(ORDER[i]);
      if (el) { el.hidden = ORDER[i] !== key; }
    }
    if (anchor && anchor.scrollIntoView) { anchor.scrollIntoView(); }
    else if (window.scrollTo) { window.scrollTo(0, 0); }
  }

  function route() {
    var want = (window.location.hash || "").replace(/^#/, "");
    if (page(want)) { show(want); return; }
    if (OWNER[want]) { show(OWNER[want], document.getElementById(want)); return; }
    show(ORDER[0]);
  }

  window.addEventListener("hashchange", route);
  route();
}());
"""


def main(argv):
    if len(argv) != 2:
        print("usage: mkbook.py <output.html>")
        return 2
    out = argv[1]

    chapters = sorted(d for d in os.listdir(ROOT)
                      if d.startswith("ch")
                      and os.path.isdir(os.path.join(ROOT, d)))
    sources = [("cover", os.path.join(ROOT, "index.html"))]
    sources += [(d.split("-", 1)[0], os.path.join(ROOT, d, "index.html"))
                for d in chapters]
    where = {d: d.split("-", 1)[0] for d in chapters}

    tokens, styles, bodies, scripts, every_id = None, [], [], [], set()
    for key, path in sources:
        with open(path, encoding="utf-8") as fh:
            html = fh.read()
        style, body, script = split_page(html)

        head, component = style.split(MARKER, 1)
        if tokens is None:
            tokens = head + MARKER
        elif " ".join(head.split()) != " ".join(tokens.split())[:len(" ".join(head.split()))]:
            print("%s: colour tokens differ from the first page's" % key)
            return 1

        # Directories become fragments before ids do, so that `../ch05-.../`
        # is gone by the time anything looks at what is left.
        body = re.sub(r'href="(?:\.\./)?(ch[^"/]+)/"',
                      lambda m: 'href="#%s"' % where.get(m.group(1), m.group(1)), body)
        body = body.replace('href="../"', 'href="#cover"')

        ids = declared_ids(body)
        every_id |= {"%s--%s" % (key, i) for i in ids}
        bodies.append('<div class="page" id="page-%s" data-page="%s"%s>\n%s\n</div>'
                      % (key, key, "" if key == "cover" else " hidden",
                         namespace_body(body, key, ids).strip()))
        styles.append("/* ================= %s ================= */\n%s"
                      % (key, scope_css(component, key, ids)))
        # An ARIA attribute whose value is an id is the one thing the scoped
        # document cannot catch, because it is written onto an element rather
        # than looked up. Chapter 1 sets `aria-labelledby` from a list of bare
        # ids, which in the book would name elements that do not exist and
        # would cost the panel its accessible name.
        script = re.sub(
            r'(setAttribute\(\s*(["\'])aria-(?:labelledby|controls|describedby)\2\s*,\s*)([^);]+)\)',
            lambda mm: '%s"%s--" + (%s))' % (mm.group(1), key, mm.group(3).strip()),
            script)
        scripts.append(SCOPED % (key, key, key, script.rstrip()))

    # Which page owns each id anything links to. Only link targets need to be
    # here, so it stays a handful of entries rather than all 983 ids.
    owner = {}
    for chunk, (key, _) in zip(bodies, sources):
        for target in re.findall(r'href="#([^"]+)"', chunk):
            if target.startswith(key + "--"):
                owner[target] = key
    order = [k for k, _ in sources]
    router = (ROUTER.replace("__ORDER__", json.dumps(order))
                    .replace("__OWNER__", json.dumps(owner, sort_keys=True)))

    # The bar names each page by that page's own <h1>, so renaming a chapter
    # renames it here as well and the two cannot drift.
    titles = {}
    for key, path in sources:
        with open(path, encoding="utf-8") as fh:
            found = re.search(r"<h1[^>]*>(.*?)</h1>", fh.read(), re.S)
        if not found:
            print("%s has no <h1> for the book's bar to name it by" % key)
            return 1
        titles[key] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", found.group(1))).strip()
    titles["cover"] = "Cover"

    # And the chapter number from the page's own masthead, for the same
    # reason: two places saying which chapter this is would drift.
    nums = {"cover": ""}
    for key, path in sources:
        if key == "cover":
            continue
        with open(path, encoding="utf-8") as fh:
            found = re.search(
                r'<p class="eyebrow">[^<]*?Chapter(?:\s|&nbsp;)(\d+)</p>',
                fh.read())
        if not found:
            print("%s has no 'Chapter N' in its masthead for the bar to read"
                  % key)
            return 1
        nums[key] = found.group(1)
    chrome_html = CHROME_HTML.replace("__PIPS__", "<i></i>" * len(order))
    chrome_js = (CHROME_JS.replace("__ORDER__", json.dumps(order))
                          .replace("__TITLES__", json.dumps(titles, sort_keys=True))
                          .replace("__NUMS__", json.dumps(nums, sort_keys=True)))

    # The pages agree on one font link; take theirs rather than keeping a
    # second copy here, which went stale the first time they were restyled.
    fonts = set()
    for _, path in sources:
        with open(path, encoding="utf-8") as fh:
            head = fh.read(4096)
        found = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis[^"]*">', head)
        if found:
            fonts.add(found.group(0))
    if len(fonts) != 1:
        print("the pages disagree about which fonts to load: %d variants" % len(fonts))
        return 1
    font_link = fonts.pop()

    page = """<!-- Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License. -->
<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
<!-- Copyright Jon Hillesheim 2026. -->

<title>Learning Tock from the Ground Up</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
%s

<style>
%s

/* One body for ten pages. Each page keeps its own type and spacing, applied
   to its section rather than to the document. */
body { margin: 0; background: var(--ground); color: var(--ink); }
.page[hidden] { display: none; }
/* ---- the book's own chrome ----
   Nine pages behind one hash is a good way to hold a book together and a bad
   way to know where you are in one. This is the part that is the book rather
   than any chapter: what you are reading, how far in it sits, and the two
   links that move. It is built here rather than in a chapter because no
   chapter can know what comes before or after it.

   The bar is sticky and short. The line under it fills as you scroll, which
   is the cheap answer to "how much of this is left" on a page that can run to
   thirteen thousand words. */
.bookbar { position: sticky; top: 0; z-index: 40;
  background: var(--surface); border-bottom: 1px solid var(--rule); }
.bookbar-in { max-width: var(--wide, 60rem); margin: 0 auto;
  display: flex; align-items: center; gap: .9rem;
  padding: .5rem 1.4rem; flex-wrap: wrap; }
.bookbar a { color: inherit; text-decoration: none; }
.bookbar-home { font-family: var(--display); font-weight: 700; font-size: .8rem;
  letter-spacing: .02em; color: var(--ink); white-space: nowrap; }
.bookbar-home:hover { color: var(--hot); }
.bookbar-where { font-family: var(--display); font-size: .7rem; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint);
  white-space: nowrap; }
.bookbar-gap { flex: 1 1 auto; }
.bookbar-move { display: flex; gap: .5rem; }
.bookbar-move a { font-family: var(--display); font-size: .72rem; font-weight: 700;
  letter-spacing: .04em; color: var(--ink-soft); border: 1px solid var(--rule);
  border-radius: 2px; padding: .25rem .55rem; white-space: nowrap; }
.bookbar-move a:hover { border-color: var(--hot); color: var(--hot); }
.bookbar-move a[aria-disabled="true"] { color: var(--ink-faint);
  border-color: var(--rule); pointer-events: none; }
/* Twelve pips, one per page, so the shape of the whole book is visible at a
   glance and the one you are on is placed inside it. */
.bookbar-pips { display: flex; gap: 3px; }
.bookbar-pips i { width: 12px; height: 5px; border-radius: 1px;
  background: var(--rule-strong); display: block; }
.bookbar-pips i.is-done { background: var(--ink-faint); }
.bookbar-pips i.is-here { background: var(--hot); }
.bookread { height: 2px; background: var(--hot); width: 0; }
@media (max-width: 34rem) {
  .bookbar-in { padding: .45rem .9rem; gap: .6rem; }
  .bookbar-pips { display: none; }
}

%s
</style>

%s
%s

<script>
%s
%s
%s
</script>
""" % (font_link, tokens, "\n\n".join(styles), chrome_html, "\n\n".join(bodies), "\n\n".join(scripts), router, chrome_js)

    problems = verify(page, every_id)
    if not problems:
        problems = assertions_hold(page)
    if problems:
        for p in problems:
            print("  %s" % p)
        print("the book would be broken, so nothing written")
        return 1

    # The book's own chrome, which no chapter suite can reach because it
    # guards on `typeof window` and the shim has none. Skipped where node is
    # missing, the way the compiled probes are skipped without a toolchain.
    if shutil.which("node"):
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False,
                                         encoding="utf-8") as tmp:
            tmp.write(page)
            probe = tmp.name
        try:
            done = subprocess.run(
                ["node", os.path.join(TOOLS, "chrome.tests.js"), probe],
                capture_output=True, text=True)
        finally:
            os.unlink(probe)
        if done.returncode != 0:
            print("the book's chrome fails its own assertions:")
            for line in (done.stdout + done.stderr).strip().split("\n"):
                print("  " + line)
            return 1
        print("  " + done.stdout.strip().split("\n")[-1])

    with open(out, "w", encoding="utf-8") as fh:
        fh.write(page)
    print("wrote %s -- %d pages, %.2f MB" % (out, len(sources), len(page) / 1048576.0))
    return 0


def assertions_hold(page):
    """Run every chapter's own suite against the book, and require them to pass.

    Static checks cannot tell whether nine scripts still behave once they share
    a DOM. The suites can: they are the same assertions the gate runs on the
    separate pages, given a `REG` and a `document` that speak one page's
    namespace. Two of them compare an ARIA target, whose value must now carry
    the page prefix, and those are counted rather than failed.

    The cover used to be left out of this, because its script reached elements
    with `document.querySelector` -- which the shim refuses on purpose -- so it
    could not be run at all. It has a suite now and is run like the rest, which
    matters here more than on its own page: the cover is the one section whose
    ids collide with nothing and whose script addresses eight chapters, so a
    prefixing mistake would show up here first.
    """
    spec = importlib.util.spec_from_file_location("check",
                                                  os.path.join(TOOLS, "check.py"))
    check = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(check)
    if not os.path.exists(check.JSC):
        return ["jsc not found, so the book's behaviour was not checked"]

    trimmed = page
    parts = ["var PASS = 0, FAIL = 0, PREFIXED = 0, WHY = [];",
             "var REAL = REG, RDOC = document;",
             """function scoped(k) { return new Proxy({}, { get: function (t, p) {
                  if (p === '_focused') { return String(REAL._focused).replace(k + '--', ''); }
                  return REAL[k + '--' + p]; } }); }""",
             """function sdoc(k) { return { getElementById: function (i) {
                  return RDOC.getElementById(k + '--' + i); } }; }""",
             """function chk(d, a, b) {
                  if (a === b) { PASS++; return; }
                  if (typeof a === 'string' && a.indexOf('--') > -1
                      && a.split('--')[1] === b) { PREFIXED++; return; }
                  FAIL++; WHY.push(d); }"""]
    suites = sorted(f for f in os.listdir(TOOLS)
                    if re.fullmatch(r"ch\d\d\.tests\.js", f))
    if os.path.exists(os.path.join(TOOLS, "cover.tests.js")):
        suites.append("cover.tests.js")
    for name in suites:
        key = name.split(".")[0]
        with open(os.path.join(TOOLS, name), encoding="utf-8") as fh:
            parts.append("(function (REG, document) {\n%s\n}(scoped(%s), sdoc(%s)));"
                         % (fh.read(), json.dumps(key), json.dumps(key)))
    parts.append("print(JSON.stringify({pass: PASS, fail: FAIL, "
                 "prefixed: PREFIXED, why: WHY.slice(0, 5)}));")

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                     encoding="utf-8") as fh:
        fh.write(check.page_bundle(trimmed, "\n".join(parts)))
        path = fh.name
    try:
        run = subprocess.run([check.JSC, path], capture_output=True, text=True)
    finally:
        os.unlink(path)
    if run.returncode != 0 or not run.stdout.strip():
        return ["the book's scripts threw: %s"
                % (run.stderr.strip().split("\n")[0] if run.stderr else "no output")]
    got = json.loads(run.stdout.strip().splitlines()[-1])
    if got["fail"]:
        return ["%d of %d assertions fail against the book: %s"
                % (got["fail"], got["pass"] + got["fail"] + got["prefixed"],
                   "; ".join(got["why"]))]
    print("  %d assertions from %d chapter suites pass against the book "
          "(%d differ only by the page prefix)"
          % (got["pass"] + got["prefixed"], len(suites), got["prefixed"]))
    return []


# The ids the book itself owns, as opposed to the ones a page brought with
# it. Anything here is written by CHROME_HTML above and by nothing else.
BOOK_CHROME_IDS = frozenset(
    re.findall(r'\bid="([^"]+)"', CHROME_HTML))


def verify(page, every_id):
    """Refuse to write a book whose own links and lookups do not resolve."""
    problems = []
    present = set(re.findall(r'\bid="([^"]+)"', page))
    keys = set(re.findall(r'data-page="([^"]+)"', page))

    missing = sorted(every_id - present)
    if missing:
        problems.append("ids lost in assembly: %s" % ", ".join(missing[:5]))

    # Every id in the book has to carry a page key, be a page container, or
    # belong to the book's own chrome. That is the whole of what stops one
    # chapter's figure from answering another chapter's lookup. The chrome is
    # listed by name rather than by prefix, so a chapter that invents a
    # `bookbar-` id of its own is still caught.
    bare = sorted(i for i in present
                  if not i.startswith("page-")
                  and i not in BOOK_CHROME_IDS
                  and not any(i.startswith(k + "--") for k in keys))
    if bare:
        problems.append("un-namespaced ids in the book: %s" % ", ".join(bare[:6]))

    # And every page's script has to be inside a wrapper, or it is reaching the
    # real document and will find whichever page's element it hits first.
    script = page[page.rindex("<script>"):]
    for key in sorted(keys):
        if 'D.getElementById("%s--" + id)' % key not in script:
            problems.append("%s's script is not scoped to its own page" % key)

    # An aria reference that names nothing is a control with no accessible
    # name, and nothing else in this build would notice.
    body = page[:page.rindex("<script>")]
    for attr in ("aria-labelledby", "aria-controls", "aria-describedby"):
        for value in re.findall(r'%s="([^"]*)"' % attr, body):
            for one in value.split():
                if one not in present:
                    problems.append("%s names %r, which the book has no element "
                                    "with" % (attr, one))

    for href in set(re.findall(r'href="#([^"]*)"', body)):
        if href not in present and href not in keys:
            problems.append("a link points at #%s, which is neither a page nor "
                            "an element" % href)
    leftover = sorted(set(re.findall(r'href="(?!https?:|#)([^"]+)"', body)))
    if leftover:
        problems.append("relative links survive: %s" % ", ".join(leftover))
    return problems


if __name__ == "__main__":
    sys.exit(main(sys.argv))
