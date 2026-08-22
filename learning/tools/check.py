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

  2. Pedagogy checks           - every load-bearing term is marked <dfn> at or
     before its first bare use in the prose and carried in the glossary, no
     sentence runs past the length a reader can hold or introduces more new
     vocabulary than it can carry, and only a small share of the prose is
     allowed to hide behind a click.

  3. Behavioral checks         - the page's own <script> is executed headlessly
     against the DOM shim in harness.js, then the chapter's assertions in
     tools/<chapter-prefix>.tests.js run against the resulting state.

Run from the repository root:

    python3 learning/tools/check.py

Exits non-zero if anything fails, so it can gate a commit.
"""

import collections
import json
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
    ("danger", "danger-soft", 4.5), ("danger", "surface", 4.5),
    ("danger", "ground", 4.5),
    # Tinted states: the text inside them is the ordinary ink colour.
    ("ink", "danger-soft", 4.5), ("ink", "accent-soft", 4.5),
    ("ink", "hot-soft", 4.5),
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


# Partial opacity is invisible to every contrast check above, because those
# compare *tokens* while opacity composites an element and its background over
# whatever sits behind it. Chapter 1 shipped eleven rules that dimmed text this
# way, measured between 1.57:1 and 3.97:1 against a 4.5:1 requirement, and the
# palette checks passed all of them. It cannot be tuned around either: contrast
# falls as soon as alpha does, and holding 4.5:1 needs an alpha near 0.93,
# which is not dimming. So de-emphasise with a colour token, and keep opacity
# for things that cannot contain words.
OPACITY_EXEMPT = {
    # WCAG 1.4.3 exempts inactive controls from contrast requirements.
    "button:disabled",
}
# SVG shapes cannot contain text -- <text> is deliberately not in this list.
SHAPE_ELEMENTS = ("rect", "circle", "line", "path", "polygon", "polyline",
                  "ellipse")


def opacity_checks(component_css):
    """Refuse partial opacity on anything that could be carrying words."""
    problems = []
    for match in re.finditer(r"(?:^|\n)([^\n{]+)\{([^}]*)\}", component_css):
        selector_list, body = match.group(1).strip(), match.group(2)
        found = re.search(r"(?:^|;|\s)opacity\s*:\s*([0-9.]+)", body)
        if not found:
            continue
        value = float(found.group(1))
        if value <= 0 or value >= 1:
            continue
        for selector in (s.strip() for s in selector_list.split(",")):
            if not selector or selector in OPACITY_EXEMPT:
                continue
            if selector.split()[-1].split(":")[0] in SHAPE_ELEMENTS:
                continue
            problems.append(
                "%r sets opacity %s, which the contrast checks cannot see and "
                "which drops text toward its background - de-emphasise with a "
                "colour token instead" % (selector, found.group(1)))
    return problems


def _specificity(selector):
    """(ids, classes+pseudo-classes+attributes, elements). Good enough for the
    flat, class-based selectors this series uses."""
    ids = len(re.findall(r"#[\w-]+", selector))
    classes = (len(re.findall(r"\.[\w-]+", selector))
               + len(re.findall(r"\[[^\]]+\]", selector))
               + len(re.findall(r":(?!:)[\w-]+", selector)))
    elements = len(re.findall(r"(?:^|[\s>+~])([a-z][\w-]*)", selector))
    return (ids, classes, elements)


def focus_order_checks(component_css):
    """A focus indicator that loses the cascade is not an indicator.

    This is the second time an ordering bug shipped here. The first was a
    component `:hover` losing to the shared `button:hover:not(:disabled)`, which
    has its own check above. This one is subtler: `.pad:focus-visible .pad-box`
    and `.pad.is-lit .pad-box` have *identical* specificity, so whichever is
    written later wins -- and because the arrow keys select the hole they focus,
    the selected style always applied and the focus ring never rendered once.
    Nothing in the palette or ARIA checks can see it.
    """
    problems = []
    rules = [(m.start(), m.group(1).strip(), m.group(2))
             for m in re.finditer(r"(?:^|\n)([^\n{]+)\{([^}]*)\}", component_css)]
    for pos, selector_list, body in rules:
        if ":focus-visible" not in selector_list:
            continue
        props = set(re.findall(r"(?:^|;|\s)([a-z-]+)\s*:", body))
        for selector in (x.strip() for x in selector_list.split(",")):
            if ":focus-visible" not in selector:
                continue
            tail = selector.split()[-1]
            spec = _specificity(selector)
            for other_pos, other_list, other_body in rules:
                if other_pos <= pos or ":focus-visible" in other_list:
                    continue
                other_props = set(re.findall(r"(?:^|;|\s)([a-z-]+)\s*:", other_body))
                shared = props & other_props
                if not shared:
                    continue
                for other in (x.strip() for x in other_list.split(",")):
                    if other.split()[-1] != tail:
                        continue
                    if _specificity(other) >= spec:
                        problems.append(
                            "%r is overridden by %r, which comes later at the "
                            "same or higher specificity and also sets %s - the "
                            "focus indicator will never render"
                            % (selector, other, ", ".join(sorted(shared))))
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

    # The page is served both from this repository and as a standalone upload,
    # and it declares no charset, so a raw multi-byte character is at the mercy
    # of whatever the host guesses. Entities in the markup and \uXXXX escapes in
    # the script cost nothing and remove the question.
    if "charset" not in html.lower():
        for line_no, line in enumerate(html.splitlines(), 1):
            bad = sorted({c for c in line if ord(c) > 127})
            if bad:
                problems.append("non-ASCII on line %d with no charset declared: "
                                "%s - use an HTML entity or a \\uXXXX escape"
                                % (line_no, " ".join("U+%04X" % ord(c) for c in bad)))
                break

    # Cascade trap. The shared `button:hover:not(:disabled)` rule has
    # specificity (0,2,1), so a component rule written as `.thing:hover`
    # (0,2,0) loses to it and its color is silently replaced. That is invisible
    # to the contrast checks below, which compare tokens rather than resolved
    # rules -- it shipped once as amber-on-amber at 1.25:1. Any class-based
    # :hover that sets a color must therefore out-specify it.
    if marker in html and "</style>" in html:
        component_css = html.split(marker, 1)[1].split("</style>", 1)[0]
        generic = re.search(r"button:hover:not\(:disabled\)", component_css)
        if generic:
            for rule in re.finditer(r"(^|\n)(\.[^{\n]*:hover[^{\n]*)\{([^}]*)\}",
                                    component_css):
                selector, body = rule.group(2).strip(), rule.group(3)
                # The `color` property itself, not border-color, background-color
                # or border-bottom-color.
                if not re.search(r"(?:^|;|\s)color\s*:", body):
                    continue
                if ":not(" in selector:
                    continue
                problems.append("%r sets a color on hover but does not "
                                "out-specify button:hover:not(:disabled), so "
                                "the shared rule wins - add :not(:disabled)"
                                % selector)

    if "<title>" not in html:
        problems.append("no <title> - the artifact would be named by filename")

    if marker in html and "</style>" in html:
        problems.extend(focus_order_checks(
            html.split(marker, 1)[1].split("</style>", 1)[0]))

    if marker in html and "</style>" in html:
        problems.extend(opacity_checks(
            html.split(marker, 1)[1].split("</style>", 1)[0]))

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

    # A browser gives an <input value="25"> that value before any script runs.
    # Without this the shim starts every control empty, so the page's first
    # render -- the one a reader actually meets -- goes untested, and a slider
    # silently computes parseInt("") for it.
    values = {}
    for tag in re.findall(r"<[a-zA-Z][^>]*>", html):
        tag_id = re.search(r'\bid="([^"]+)"', tag)
        tag_value = re.search(r'\bvalue="([^"]*)"', tag)
        if tag_id and tag_value:
            values[tag_id.group(1)] = tag_value.group(1)

    with open(os.path.join(TOOLS, "harness.js"), encoding="utf-8") as fh:
        harness = fh.read()
    with open(tests_path, encoding="utf-8") as fh:
        tests = fh.read()

    bundle = "\n".join([
        "var PAGE_IDS = %s;" % repr(ids).replace("'", '"'),
        "var PAGE_VALUES = %s;" % json.dumps(values),
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



# ---------------------------------------------------------------------------
# Pedagogy gate.
#
# A beginner chapter fails in ways the contrast and ARIA checks cannot see: a
# load-bearing noun used before anyone says what it means, prose that only
# exists once you click something, and sentences with more joints than a reader
# can hold. These are the three that an audit of chapter 1 actually caught, so
# they are the three that get enforced.
#
# The contract for a definition is <dfn>: the word's defining appearance is
# tagged, and that appearance must come at or before the first time the running
# prose uses the word bare. Marking it also puts it in the glossary check, so a
# term cannot be defined inline and then go missing from the summary list.

# Words this chapter is not allowed to use before defining. Keyed by the
# chapter directory prefix, because chapter 2 inherits chapter 1's vocabulary
# and should not have to redefine it.
MUST_DEFINE = {
    "ch01": [
        "address", "atomic", "bank", "base address", "bit", "byte", "core",
        "disassembler", "GPIO", "hexadecimal", "interrupt", "mask", "offset",
        "optimizer", "peripheral", "pin", "register", "SIO", "store",
        "volatile",
    ],
}

# Words this series has decided not to use, and why. Seeded from the places a
# real beginner reading chapter 1 actually stopped and asked what something
# meant, which is the only reliable signal available -- an author's own sense of
# what is obvious is measurably unreliable (Hinds 1999 found experts
# underestimate novice difficulty by 35-40% and resist debiasing).
BANNED_WORDS = {
    "leg": "informal, and wrong for this hardware anyway -- the RP2350 is a "
           "QFN package with flat pads and nothing protruding. Say 'pin'.",
}


# Two limits on a sentence, and they are not equally well founded.
#
# Word count is the weak one. Redish (2000), "Readability formulas have even
# more limitations than Klare discusses", is blunt that counting surface
# features tells you nothing about the causes of a reader's trouble, and the
# grade-level formulas behind that habit were calibrated on 1940s schoolchildren
# rather than adults reading technical prose. It is kept only as a backstop
# against genuinely runaway sentences.
#
# Novel terms per sentence is the one with a mechanism behind it. Cognitive load
# theory measures difficulty as element interactivity -- how many unfamiliar
# things must be held and related at once -- so a short sentence carrying three
# new terms is harder than a long one carrying none.
MAX_SENTENCE_WORDS = 34
MAX_NEW_TERMS_PER_SENTENCE = 2

# The technical vocabulary whose first appearances get counted. Wider than
# MUST_DEFINE, because a term can be fair to use undefined and still cost the
# reader something on the sentence where it lands.
TRACKED_TERMS = [
    "address", "atomic", "bank", "base address", "bit", "bus", "byte", "core",
    "compiler", "crate", "disassembler", "flash", "GPIO", "hexadecimal",
    "instruction", "interrupt", "kernel", "mask", "offset", "optimizer",
    "peripheral", "pin", "processor", "register", "RAM", "SIO", "SRAM",
    "store", "volatile", "voltage",
]

# Share of prose allowed to live only inside the script, reachable by clicking.
# Chapter 1 shipped at 30%, including the only expansion of "SIO".
MAX_GATED_PROSE = 0.20


def _strip_for_prose(html):
    """The running prose a reader parses: no code, no script, no citations."""
    text = re.sub(r"<style.*?</style>", " ", html, flags=re.S)
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.S)
    text = re.sub(r"<pre.*?</pre>", " ", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(r'<div class="sources">.*', " ", text, flags=re.S)
    # Diagram labels are not sentences, and a verbatim quotation cannot be
    # rewritten to suit a house style, so neither is held to the prose limits.
    text = re.sub(r"<svg.*?</svg>", " ", text, flags=re.S)
    text = re.sub(r"<blockquote.*?</blockquote>", " ", text, flags=re.S)
    return text


def _sentences(text):
    # Block boundaries end a sentence. Without this a heading glues onto the
    # paragraph after it and the pair looks like one enormous sentence.
    text = re.sub(r"</(h[1-6]|p|li|div|section|figure|blockquote|dt|dd|span|"
                  r"button|figcaption|summary|td|th|caption|tr)>", ". ", text)
    plain = re.sub(r"<[^>]+>", " ", text)
    for entity, char in (("&mdash;", "-"), ("&ndash;", "-"), ("&nbsp;", " "),
                         ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                         ("&hellip;", "..."), ("&rarr;", "->")):
        plain = plain.replace(entity, char)
    plain = re.sub(r"\s+", " ", plain)
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", plain) if s.strip()]


def pedagogy_checks(html, chapter):
    problems = []
    prose = _strip_for_prose(html)

    # 1. Every must-define term is tagged <dfn> before its first bare use.
    #    Both offsets are measured against `prose`, and the blanking below
    #    preserves length, so the two are directly comparable.
    defined = {}
    for match in re.finditer(r"<dfn[^>]*>(.*?)</dfn>", prose, flags=re.S | re.I):
        word = re.sub(r"<[^>]+>", "", match.group(1)).strip().lower()
        defined.setdefault(word, match.start())

    def _blank(match):
        return " " * len(match.group(0))

    scan = re.sub(r"<dfn[^>]*>.*?</dfn>", _blank, prose, flags=re.S | re.I)
    scan = re.sub(r"<code.*?</code>", _blank, scan, flags=re.S)
    # Attribute values are not prose. Without this an id like "tab-atomic"
    # counts as the reader meeting the word "atomic".
    scan = re.sub(r"<[^>]+>", _blank, scan)

    terms = MUST_DEFINE.get(chapter.split("-", 1)[0], [])
    for term in terms:
        pattern = r"\b%s(?:s|es)?\b" % re.escape(term)
        flags = 0 if term.isupper() else re.I
        first_use = re.search(pattern, scan, flags)
        marked = defined.get(term.lower())
        if marked is None:
            if first_use:
                problems.append("%r is used in the prose but never marked "
                                "<dfn>%s</dfn>" % (term, term))
            continue
        if first_use and first_use.start() < marked:
            problems.append("%r is used before it is defined "
                            "(bare use at %d, <dfn> at %d)"
                            % (term, first_use.start(), marked))

    # 2. Everything defined inline also appears in the glossary, and vice
    #    versa, so the two never drift apart.
    listed = set()
    found_any = False
    for block in re.finditer(r'<(\w+)[^>]*class="glossary"[^>]*>(.*?)</\1>',
                             html, flags=re.S):
        found_any = True
        for entry in re.findall(r"<dt[^>]*>(.*?)</dt>", block.group(2), flags=re.S):
            listed.add(re.sub(r"<[^>]+>", "", entry).strip().lower())
    if terms:
        if not found_any:
            problems.append("no element with class=\"glossary\"")
        else:
            for term in terms:
                if term.lower() not in listed:
                    problems.append("%r is not in the glossary" % term)

    # 3. A word a reader has already tripped over does not come back.
    for word, why in BANNED_WORDS.items():
        hit = re.search(r"\b%ss?\b" % re.escape(word), prose, re.I)
        if hit:
            near = re.sub(r"\s+", " ",
                          prose[max(0, hit.start() - 45):hit.start() + 45]).strip()
            problems.append("%r is on the do-not-use list: %s (near %r)"
                            % (word, why, near))

    # 4. No sentence longer than the reader can hold, and no sentence that
    #    introduces more new vocabulary than it can carry.
    seen_terms = set()
    for sentence in _sentences(prose):
        words = re.findall(r"[A-Za-z0-9'_.-]+", sentence)
        if len(words) > MAX_SENTENCE_WORDS:
            problems.append("sentence of %d words (limit %d): %r"
                            % (len(words), MAX_SENTENCE_WORDS,
                               sentence[:90] + "..."))
        fresh = []
        for term in TRACKED_TERMS:
            if term in seen_terms:
                continue
            flags = 0 if term.isupper() else re.I
            if re.search(r"\b%s(?:s|es)?\b" % re.escape(term), sentence, flags):
                fresh.append(term)
        seen_terms.update(fresh)
        if len(fresh) > MAX_NEW_TERMS_PER_SENTENCE:
            problems.append("sentence introduces %d new terms (limit %d) "
                            "%s: %r" % (len(fresh), MAX_NEW_TERMS_PER_SENTENCE,
                                        sorted(fresh), sentence[:80] + "..."))

    # 5. Prose hidden behind a click, as a share of the whole. A reader with
    #    JavaScript off, or one who simply does not click, must not lose an
    #    explanation the chapter depends on.
    script = "".join(re.findall(r"<script.*?</script>", html, flags=re.S))
    gated = 0
    for literal in re.findall(r'"((?:[^"\\]|\\.){12,})"', script):
        if " " in literal and re.search(r"[a-z]{3} [a-z]{3}", literal):
            gated += len(re.findall(r"[A-Za-z0-9']+", literal))
    visible = len(re.findall(r"[A-Za-z0-9']+", re.sub(r"<[^>]+>", " ", prose)))
    if visible:
        share = gated / float(gated + visible)
        if share > MAX_GATED_PROSE:
            problems.append("%.0f%% of prose is only reachable by clicking "
                            "(limit %.0f%%): %d words in the script vs %d in "
                            "the page" % (100 * share, 100 * MAX_GATED_PROSE,
                                          gated, visible))

    return problems


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

        problems = pedagogy_checks(html, chapter)
        if problems:
            bad = True
            for problem in problems:
                print("  FAIL  %s" % problem)
        else:
            print("  pass  pedagogy checks")

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
