#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Quality gate for the learning series.

For every chapter directory under learning/ this runs:

  1. Static checks on the page  - duplicate ids, unbalanced tags, JavaScript
     reaching for ids that do not exist, CSS variables used but never defined,
     and colours hardcoded outside the theme token blocks (which is the classic
     way an artifact ends up unreadable in one of the two themes).

  2. Behavioural checks         - the page's own <script> is executed headlessly
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

    # Colours must live in the token blocks so both themes resolve as a set.
    # Everything after the reset is component CSS and should reference tokens.
    marker = "* { box-sizing: border-box; }"
    if marker in html and "</style>" in html:
        component_css = html.split(marker, 1)[1].split("</style>", 1)[0]
        literals = sorted(set(re.findall(r"#[0-9A-Fa-f]{3,8}\b", component_css)))
        if literals:
            problems.append("colour literals outside the token blocks: %s"
                            % ", ".join(literals))

    if "<title>" not in html:
        problems.append("no <title> - the artifact would be named by filename")

    return problems


def behaviour_checks(html, tests_path):
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
            ok, out = behaviour_checks(html, tests_path)
            if ok is None:
                print("  ----  %s" % out)
            else:
                print(out)
                if not ok:
                    bad = True
        else:
            print("  ----  no %s.tests.js, behavioural checks skipped" % prefix)

        if bad:
            failures += 1

    print("\n%s" % ("all chapters passed" if not failures
                    else "%d chapter(s) with failures" % failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
