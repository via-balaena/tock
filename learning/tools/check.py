#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Quality gate for the learning series.

For every chapter directory under learning/ this runs:

  1. Static checks on the page  - duplicate ids, unbalanced tags, JavaScript
     reaching for ids that do not exist, CSS variables used but never defined,
     and colors hardcoded outside the theme token blocks (which is the classic
     way an artifact ends up unreadable in one of the two themes). Also the
     WCAG contrast of every foreground-on-background pair in both themes, that
     the OS-dark and toggled-dark palettes agree, heading order, and whether
     ARIA roles are backed by the behavior they promise.

  2. Behavioral checks         - the page's own <script> is executed headlessly
     against the DOM shim in harness.js, then the chapter's assertions in
     tools/<chapter-prefix>.tests.js run against the resulting state.

Run from the repository root:

    python3 learning/tools/check.py

Exits non-zero if anything fails, so it can gate a commit.
"""

import collections
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")

JSC = ("/System/Library/Frameworks/JavaScriptCore.framework"
       "/Versions/A/Helpers/jsc")

# Tags whose open/close counts must match. Void and self-closing tags excluded.
PAIRED_TAGS = ["div", "section", "figure", "p", "span", "button",
               "pre", "code", "ol", "ul", "li", "table", "script", "style"]


# The token vocabulary shared by every chapter, and the pairs that actually
# appear as foreground-on-background. WCAG AA: 4.5:1 for body text, 3:1 for
# large text and for the boundaries of interactive components.
CONTRAST_PAIRS = [
    ("ink", "ground", 4.5), ("ink", "surface", 4.5), ("ink", "surface-sunk", 4.5),
    ("ink-soft", "ground", 4.5), ("ink-soft", "surface", 4.5),
    ("ink-soft", "surface-sunk", 4.5),
    ("ink-faint", "surface", 4.5), ("ink-faint", "surface-sunk", 4.5),
    ("accent", "ground", 4.5), ("accent", "surface", 4.5),
    ("accent", "surface-sunk", 4.5), ("accent", "accent-soft", 4.5),
    ("hot", "ground", 4.5), ("hot", "surface", 4.5),
    ("hot", "surface-sunk", 4.5), ("hot", "hot-soft", 4.5),
    ("hot-ink", "hot-fill", 4.5), ("surface", "accent", 4.5),
    ("danger", "danger-soft", 4.5),
    ("rule-strong", "surface", 3.0), ("rule-strong", "ground", 3.0),
    ("hot-fill", "surface", 3.0),
]


def _luminance(hex_color):
    parts = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    parts = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
             for v in parts]
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]


def _contrast(a, b):
    la, lb = _luminance(a), _luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def _tokens(segment):
    return dict(re.findall(r"(--[a-z-]+):\s*(#[0-9A-Fa-f]{6})", segment))


def palette_checks(html):
    """Both themes must resolve as a set, and every pair must be legible."""
    problems = []
    try:
        light = _tokens(html[html.index(":root {"):
                             html.index("@media (prefers-color-scheme: dark)")])
        media = _tokens(html[html.index("@media (prefers-color-scheme: dark)"):
                             html.index(':root[data-theme="dark"]')])
        stamped = _tokens(html[html.index(':root[data-theme="dark"]'):
                               html.index("* { box-sizing")])
    except ValueError:
        return ["could not locate the three theme blocks"]

    if media != stamped:
        differing = sorted(set(media) ^ set(stamped)) or [
            k for k in media if stamped.get(k) != media[k]]
        problems.append("the OS-dark and toggled-dark palettes disagree: %s"
                        % ", ".join(differing))
    missing = sorted(set(light) - set(media))
    if missing:
        problems.append("light tokens with no dark counterpart: %s"
                        % ", ".join(missing))

    for label, theme in (("light", light), ("dark", media)):
        for fg, bg, need in CONTRAST_PAIRS:
            keys = ("--" + fg, "--" + bg)
            if not all(k in theme for k in keys):
                continue
            got = _contrast(theme[keys[0]], theme[keys[1]])
            if got < need:
                problems.append("%s theme: %s on %s is %.2f:1, needs %.1f:1"
                                % (label, fg, bg, got, need))
    return problems


def semantic_checks(html):
    """Heading order and the promises made by ARIA roles."""
    problems = []
    body = html[html.index("</style>") + 8:] if "</style>" in html else html

    headings = [(int(m.group(1)), re.sub("<[^>]+>", "", m.group(2))[:40])
                for m in re.finditer(r"<h([1-6])[^>]*>(.*?)</h\1>", body, re.S)]
    previous = 0
    for level, text in headings:
        if previous and level > previous + 1:
            problems.append("heading level skips h%d to h%d at %r"
                            % (previous, level, text.strip()))
        previous = level
    if sum(1 for level, _ in headings if level == 1) != 1:
        problems.append("expected exactly one h1")

    # A role is a promise about behavior. Claiming the tab role without the
    # keyboard pattern misleads screen-reader users. Check the markup itself,
    # not the whole file: an attribute that only the script sets is absent for
    # the initial render, which is exactly when a reader first meets the page.
    markup = body.split("<script>")[0]
    if 'role="tab"' in markup:
        for tag in re.findall(r"<[a-z]+[^>]*role=\"tabpanel\"[^>]*>", markup):
            if "aria-labelledby" not in tag:
                problems.append("tabpanel is unlabelled in the initial markup: %s"
                                % tag[:70])
        if '"keydown"' not in html:
            problems.append('role="tab" without arrow-key handling')
        for tag in re.findall(r"<[a-z]+[^>]*role=\"tab\"[^>]*>", markup):
            if "tabindex" not in tag:
                problems.append("tab without a roving tabindex: %s" % tag[:70])

    for match in re.finditer(r"<button[^>]*>(.*?)</button>", body, re.S):
        if (not re.sub("<[^>]+>", "", match.group(1)).strip()
                and "aria-label" not in match.group(0)):
            problems.append("button with no accessible name: %s"
                            % match.group(0)[:60])
    return problems


def static_checks(html, name):
    """Return a list of problem strings; empty means the page is clean."""
    problems = []

    ids = re.findall(r'\bid="([^"]+)"', html)
    dupes = [k for k, v in collections.Counter(ids).items() if v > 1]
    if dupes:
        problems.append("duplicate id(s): %s" % ", ".join(sorted(dupes)))

    wanted = set(re.findall(r'getElementById\("([^"]+)"\)', html))
    missing = sorted(wanted - set(ids))
    if missing:
        problems.append("getElementById targets with no matching id: %s"
                        % ", ".join(missing))

    for tag in PAIRED_TAGS:
        opened = len(re.findall(r"<%s[\s>]" % tag, html))
        closed = len(re.findall(r"</%s>" % tag, html))
        if opened != closed:
            problems.append("<%s>: %d opened, %d closed" % (tag, opened, closed))

    defined = set(re.findall(r"(--[a-z0-9-]+)\s*:", html))
    used = set(re.findall(r"var\((--[a-z0-9-]+)\)", html))
    undefined = sorted(used - defined)
    if undefined:
        problems.append("CSS variables used but never defined: %s"
                        % ", ".join(undefined))

    # Colors must live in the token blocks so both themes resolve as a set.
    # Everything after the reset is component CSS and should reference tokens.
    marker = "* { box-sizing: border-box; }"
    if marker in html and "</style>" in html:
        component_css = html.split(marker, 1)[1].split("</style>", 1)[0]
        literals = sorted(set(re.findall(r"#[0-9A-Fa-f]{3,8}\b", component_css)))
        if literals:
            problems.append("color literals outside the token blocks: %s"
                            % ", ".join(literals))

    if "<title>" not in html:
        problems.append("no <title> - the artifact would be named by filename")

    problems.extend(palette_checks(html))
    problems.extend(semantic_checks(html))

    return problems


def behavior_checks(html, tests_path):
    """Execute the page JS plus assertions under jsc. Returns (ok, output)."""
    if not os.path.exists(JSC):
        return None, "JavaScriptCore not found at %s - skipped" % JSC

    if "<script>" not in html:
        return None, "page has no <script> - skipped"

    page_js = html[html.rindex("<script>") + len("<script>"):html.rindex("</script>")]
    ids = sorted(set(re.findall(r'\bid="([^"]+)"', html)))

    with open(os.path.join(TOOLS, "harness.js"), encoding="utf-8") as fh:
        harness = fh.read()
    with open(tests_path, encoding="utf-8") as fh:
        tests = fh.read()

    bundle = "\n".join([
        "var PAGE_IDS = %s;" % repr(ids).replace("'", '"'),
        harness,
        page_js,
        tests,
        "var failed = report();",
        "if (failed) { throw new Error(failed + ' assertion(s) failed'); }",
    ])

    tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                      encoding="utf-8")
    try:
        tmp.write(bundle)
        tmp.close()
        proc = subprocess.run([JSC, tmp.name], capture_output=True, text=True)
        out = (proc.stdout + proc.stderr).rstrip()
        return proc.returncode == 0, out
    finally:
        os.unlink(tmp.name)


def main():
    chapters = sorted(d for d in os.listdir(ROOT)
                      if d.startswith("ch")
                      and os.path.isdir(os.path.join(ROOT, d)))
    if not chapters:
        print("no chapter directories found under %s" % ROOT)
        return 1

    failures = 0
    for chapter in chapters:
        page = os.path.join(ROOT, chapter, "index.html")
        print("\n%s" % chapter)
        print("-" * len(chapter))

        bad = False

        if not os.path.exists(page):
            print("  FAIL  no index.html")
            failures += 1
            continue

        with open(page, encoding="utf-8") as fh:
            html = fh.read()

        problems = static_checks(html, chapter)
        if problems:
            bad = True
            for problem in problems:
                print("  FAIL  %s" % problem)
        else:
            print("  pass  static checks")

        prefix = chapter.split("-", 1)[0]
        tests_path = os.path.join(TOOLS, "%s.tests.js" % prefix)
        if os.path.exists(tests_path):
            ok, out = behavior_checks(html, tests_path)
            if ok is None:
                print("  ----  %s" % out)
            else:
                print(out)
                if not ok:
                    bad = True
        else:
            print("  ----  no %s.tests.js, behavioral checks skipped" % prefix)

        if bad:
            failures += 1

    print("\n%s" % ("all chapters passed" if not failures
                    else "%d chapter(s) with failures" % failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
