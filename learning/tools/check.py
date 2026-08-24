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
import html as html_module
import json
import os
import re
import subprocess
import shutil
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
    # The street table's failing verdicts sit on a sunk ground once pressed.
    ("danger", "surface-sunk", 4.5),
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


def state_scope_checks(component_css):
    """A state token must not be the only thing anchoring a rule.

    `.is-on .lamp` says "any .lamp inside anything that is on", so the rule
    reaches into every component on the page that happens to use that token.
    Chapter 1 had four of them from the high/low circuit, and then Figure 4 and
    Figure 7 started using `.is-on` for "this is the one being shown". Nothing
    collided, because none of the new elements contains a `.lamp`, `.ray`,
    `.volt` or `.wire` -- but that is luck, and it is the same shape as the
    `.next` collision that rendered every step of the race figure as a narrow
    centred box. Anchor the rule on the component as well: `.lvl.is-on .lamp`.

    Only descendant combinators matter here. `.hxrange.is-on` is a compound
    selector, so it cannot match anything but an `.hxrange`.
    """
    problems = []
    for match in re.finditer(r"(?:^|\n)([^\n{]+)\{", component_css):
        for selector in (s.strip() for s in match.group(1).split(",")):
            parts = selector.split()
            if len(parts) < 2:
                continue
            if re.fullmatch(r"\.(is|has)-[\w-]+", parts[0]):
                problems.append(
                    "%r is anchored only on a state token, so it reaches into "
                    "every component that uses %s - name the component too"
                    % (selector, parts[0]))
    return problems


def _specificity(selector):
    """(ids, classes+pseudo-classes+attributes, elements). Good enough for the
    flat, class-based selectors this series uses.

    `:not()` contributes nothing itself -- only its argument counts -- so the
    functional part is dropped before counting, leaving the inner selector to be
    counted normally. Without this, `button:hover:not(:disabled)` scored
    (0,3,1) instead of (0,2,1), which would inflate every selector guarding
    itself against the shared hover rule. `:where()` would need the opposite
    treatment and is not used here.
    """
    selector = selector.replace(":not", "")
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


def _live_text_ids(script, page_ids):
    """Ids whose text the script rewrites, including ones it builds by hand.

    The chapters address most of their generated elements as
    `getElementById("hdd-" + i)`, so looking only for a literal id finds
    nothing. A concatenated first argument is treated as a prefix and matched
    against the ids the page actually declares. The `[^;]` window is what keeps
    `getElementById("x").setAttribute(...)` from counting: the statement ends
    before any `.textContent` further down could be reached.
    """
    exact, prefixes = set(), set()
    for match in re.finditer(r'getElementById\(\s*"((?:[^"\\]|\\.)*)"\s*(\+)?',
                             script):
        if not re.match(r"[^;]{0,120}?\.textContent\s*=",
                        script[match.end():match.end() + 160], re.S):
            continue
        (prefixes if match.group(2) else exact).add(match.group(1))
    live = set(i for i in page_ids if i in exact)
    for prefix in prefixes:
        live |= set(i for i in page_ids if i.startswith(prefix))
    return live


def live_name_checks(html):
    """A control whose content is the answer must not be renamed over the top.

    `aria-label` *replaces* an element's content for anything reading the
    accessibility tree. Put one on a control whose content the script keeps
    rewriting and the label wins permanently, so the value never reaches a
    screen reader. Figure 4's digit cells shipped announcing "the first digit,
    bits 31 down to 28" and never once said which digit was in them, which is
    the entire thing the figure exists to show. It is the same shape as the
    `role="img"` bug on the board drawing: an accessibility attribute that
    suppresses what it was added to help with.

    `aria-labelledby` pointing at the live element is the fix, so it is what
    this allows. Only the initial markup is scanned, since an attribute the
    script sets is absent for the first render.
    """
    problems = []
    body = html[html.index("</style>") + 8:] if "</style>" in html else html
    markup = body.split("<script>")[0]
    script = "".join(re.findall(r"<script.*?</script>", html, flags=re.S))
    live = _live_text_ids(script, set(re.findall(r'\bid="([^"]+)"', html)))

    # A misspelt reference is not a weaker name, it is no name at all: the
    # browser finds no element, falls back to nothing, and the control is
    # announced as "button". Cheap to check and impossible to see by reading.
    declared = set(re.findall(r'\bid="([^"]+)"', html))
    for match in re.finditer(r'aria-labelledby="([^"]+)"', markup):
        missing = [i for i in match.group(1).split() if i not in declared]
        if missing:
            problems.append("aria-labelledby points at %s, which no element "
                            "declares - the control ends up with no name at all"
                            % ", ".join(missing))

    if not live:
        return problems

    controls = r"<(button|a|summary)\b([^>]*)>(.*?)</\1>"
    for match in re.finditer(controls, markup, re.S):
        tag, attrs, inner = match.groups()
        if "aria-label=" not in attrs:
            continue
        # An id the author has explicitly taken out of the accessibility
        # tree is not being hidden by the label by accident. Figure 4's bit
        # cells show 1 or 0, which is a second rendering of aria-pressed, and
        # they say so with aria-hidden rather than relying on this checker to
        # guess that the label happens to be harmless there.
        declared = re.findall(r'<[^>]*\bid="([^"]+)"[^>]*>', inner)
        opted_out = set(re.findall(
            r'<[^>]*\bid="([^"]+)"[^>]*\baria-hidden="true"[^>]*>'
            r'|<[^>]*\baria-hidden="true"[^>]*\bid="([^"]+)"[^>]*>', inner))
        excluded = set(x for pair in opted_out for x in pair if x)
        hidden = sorted((set(declared) & live) - excluded)
        if hidden:
            problems.append(
                "<%s%s> carries an aria-label, which replaces its content for "
                "a screen reader, but the script rewrites %s inside it - name "
                "it with aria-labelledby pointing at the live element instead"
                % (tag, attrs[:48], ", ".join(hidden)))
    return problems


def register_table_checks(html):
    """A register table states each offset three times, so keep them agreeing.

    Figure 7 shows an offset in sixteens and the same offset in tens, and the
    script holds the offsets again as numbers because the figure's whole point
    is base + offset arithmetic. Three copies of one fact is exactly the shape
    that drifts: the behavioural tests exercise the script's copy, and nothing
    would notice the markup disagreeing with it. They were generated from one
    table originally; this is what keeps them that way once the generator is
    gone.
    """
    problems = []
    rows = re.findall(r'<span class="reg-o">0x([0-9A-Fa-f]+)</span>\s*'
                      r'<span class="reg-t">(\d+)</span>', html)
    if not rows:
        return problems
    for hex_text, tens in rows:
        if int(hex_text, 16) != int(tens):
            problems.append("register offset 0x%s is shown as %s in tens, "
                            "which is %d" % (hex_text, tens, int(hex_text, 16)))
    shown = [int(h, 16) for h, _ in rows]
    # A multiple of 4, not exactly 4: a real register block can carry reserved
    # gaps, and this rule should still hold for the table that shows one.
    for step_from, step_to in zip(shown, shown[1:]):
        step = step_to - step_from
        if step <= 0 or step % 4:
            problems.append("register offsets step by %d from 0x%03X to 0x%03X, "
                            "but a 32-bit register is 4 bytes wide, so every "
                            "step should be a positive multiple of 4"
                            % (step, step_from, step_to))
    # Only a table whose addresses the script computes has a third copy to
    # keep in step. A purely static register listing is a legitimate thing to
    # print, and the two columns above are still checked for it.
    if "RGBASE" not in html:
        return problems
    declared = re.search(r"var RGOFF = \[([^\]]*)\];", html)
    if not declared:
        problems.append("the script computes register addresses from RGBASE "
                        "but declares no RGOFF of offsets to add to it")
        return problems
    in_script = [int(x.strip(), 16) for x in declared.group(1).split(",")
                 if x.strip()]
    if in_script != shown:
        problems.append("the register table shows offsets %s but the script "
                        "computes addresses from %s"
                        % (["0x%03X" % v for v in shown],
                           ["0x%03X" % v for v in in_script]))
    return problems


def _rust_lines(text):
    """Source lines with comments and indentation removed, blanks dropped."""
    out = []
    for line in text.splitlines():
        line = re.sub(r"//.*", "", line).strip()
        if line:
            out.append(re.sub(r"\s+", " ", line))
    return out


def demo_source_checks(html, chapter_dir):
    """A figure quoting source must quote the source it shipped.

    Figure 14 shows five pairs of Rust beside the assembly each compiles to,
    and its whole claim is that the instructions are real output from the file
    committed beside the page. That claim is only worth anything while the two
    agree. They have drifted once already: the identifiers on the page had been
    renamed for house style and so were not what went through the compiler.

    Comments are stripped from both sides before comparing, because the page
    adds a word or two to say what to look at. That is also what catches a
    comment written in the wrong language -- `; first` is a comment in assembly
    and a syntax error in Rust, so it survives the stripping and fails to
    match, which is how it was found.
    """
    problems = []
    demo = os.path.join(chapter_dir, "optimizer-demo.rs")
    if not os.path.exists(demo):
        return problems
    with open(demo, encoding="utf-8") as fh:
        haystack = _rust_lines(fh.read())
    blocks = re.findall(r'<div class="optcol [^"]*">\s*'
                        r'<span class="optcol-h">[^<]*</span>\s*'
                        r"<pre><code>(.*?)</code></pre>", html, re.S)
    if not blocks:
        return problems
    for block in blocks:
        text = re.sub("<[^>]+>", "", block)
        for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">")):
            text = text.replace(entity, char)
        needle = _rust_lines(text)
        if not needle:
            continue
        run = any(haystack[i:i + len(needle)] == needle
                  for i in range(len(haystack) - len(needle) + 1))
        if not run:
            problems.append("Figure 14 shows %r, which is not in "
                            "optimizer-demo.rs - the figure claims that file "
                            "is what was compiled" % " / ".join(needle)[:90])
    return problems


TARGET = "thumbv8m.main-none-eabi"


def _asm_functions(source_path):
    """Compile the demo and return {function name: [instruction lines]}.

    Returns None when the toolchain is not available, so the check skips
    rather than failing on a machine that cannot build for the Pico 2.
    """
    if not shutil.which("rustc"):
        return None
    out = tempfile.mkdtemp()
    try:
        proc = subprocess.run(
            ["rustc", "--target", TARGET, "--crate-type", "lib", "-O",
             "--emit", "asm", "-o", os.path.join(out, "demo.s"), source_path],
            capture_output=True, text=True, cwd=os.path.dirname(source_path))
        if proc.returncode != 0:
            return None
        with open(os.path.join(out, "demo.s"), encoding="utf-8") as fh:
            text = fh.read()
    finally:
        shutil.rmtree(out, ignore_errors=True)

    funcs, current = {}, None
    for line in text.splitlines():
        bare = line.strip()
        name = re.match(r"^([A-Za-z_][\w]*):$", bare)
        if name:
            current = name.group(1)
            funcs[current] = []
            continue
        if current is None:
            continue
        if bare.startswith(".Lfunc_end"):
            current = None
            continue
        if bare.startswith(".") and not bare.endswith(":"):
            continue
        if bare:
            funcs[current].append(re.sub(r"\s+", " ", bare))
    return funcs


def _shown_lines(block):
    """The instruction lines a figure shows, comments and padding removed."""
    text = re.sub("<[^>]+>", "", block)
    for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">")):
        text = text.replace(entity, char)
    out = []
    for line in text.splitlines():
        line = re.sub(r";.*", "", line).strip()
        if not line or line.startswith("..."):
            continue
        out.append(re.sub(r"\s+", " ", line))
    return out


def demo_asm_checks(html, chapter_dir):
    """Figure 14 says its listings are real compiler output. Compile and see.

    Every line the figure shows for a case must appear in that function's
    actual output, in the order shown. Lines the figure elides are fine -- it
    says which -- but a line it shows that the compiler never emitted, or shows
    out of order, is the figure claiming something it did not observe.
    """
    problems = []
    demo = os.path.join(chapter_dir, "optimizer-demo.rs")
    if not os.path.exists(demo) or "optcol" not in html:
        return problems
    funcs = _asm_functions(demo)
    if funcs is None:
        return problems
    with open(demo, encoding="utf-8") as fh:
        rust = fh.read()

    pairs = re.findall(
        r'<div class="optcol [^"]*">\s*<span class="optcol-h">[^<]*</span>\s*'
        r"<pre><code>(.*?)</code></pre>.*?<pre><code>(.*?)</code></pre>",
        html, re.S)
    if not pairs:
        problems.append("Figure 14 has no source/assembly pairs to check")
        return problems
    for src_block, asm_block in pairs:
        needle = _rust_lines(re.sub("<[^>]+>", "", src_block)
                             .replace("&amp;", "&").replace("&lt;", "<")
                             .replace("&gt;", ">"))
        owner = None
        for match in re.finditer(r"pub unsafe fn (\w+)\(\) \{(.*?)\n\}",
                                 rust, re.S):
            body = _rust_lines(match.group(2))
            if needle and body[:len(needle)] == needle:
                owner = match.group(1)
                break
        if owner is None:
            problems.append("Figure 14 shows Rust that matches no function in "
                            "optimizer-demo.rs: %r" % " / ".join(needle)[:70])
            continue
        real = funcs.get(owner)
        if real is None:
            problems.append("%s is in the demo but not in its compiled output"
                            % owner)
            continue
        at = 0
        for shown in _shown_lines(asm_block):
            while at < len(real) and real[at] != shown:
                at += 1
            if at >= len(real):
                problems.append("Figure 14 shows %r for %s, which is not in "
                                "that function's output in that order"
                                % (shown, owner))
                break
            at += 1
    return problems


def _mono_without_case(body):
    """A declaration block that asks for the code face and ignores case."""
    return bool(re.search(r"font(?:-family)?\s*:[^;]*var\(--mono\)", body)
                and "text-transform" not in body)


def button_case_checks(html):
    """A button showing code must not be uppercased by the shared button rule.

    `button { text-transform: uppercase }` is the house style for labels and
    wrong for anything case-sensitive, and the `font:` shorthand does not reset
    it. This has now bitten twice: glossary terms rendered as PIN, and Figure
    5's first-digit buttons rendered 0X0 through 0XF -- capital X, in the one
    section teaching what the 0x prefix means. Both were invisible to every
    other check here, and the second was only ever going to be caught by
    looking, because those buttons do not exist in the markup at all; the
    script builds them.

    So the classes are gathered from both places: `<button class="...">` in the
    markup, and `className = "..."` on anything `createElement("button")`
    produced. A class whose rule asks for the monospace family is showing code
    -- that is what the family means on these pages -- so its rule has to say
    what happens to case. Requiring the declaration rather than a particular
    value keeps the rule loose: a component is free to answer `uppercase` if it
    means it, and only silence is refused.
    """
    problems = []
    style = html[html.index("<style>"):html.index("</style>")]
    css = re.sub(r"/\*.*?\*/", "", style, flags=re.S)
    script = html[html.rindex("<script>"):html.rindex("</script>")]

    classes = set()
    for attr in re.findall(r'<button[^>]*\bclass="([^"]*)"', html):
        classes.update(attr.split())
    for match in re.finditer(r'createElement\("button"\)(.{0,200}?)className\s*=\s*([^;]+);',
                             script, re.S):
        for literal in re.findall(r'"([^"]*)"', match.group(2)):
            classes.update(literal.split())

    # The base class of every button the script builds. Its content is never in
    # the markup, so no one can eyeball it, and the first version of this check
    # only asked about monospace ones -- which let the prediction options ship
    # reading 0X02000000, because they are set in the body face.
    generated = set()
    for match in re.finditer(r'createElement\("button"\).{0,200}?className\s*=\s*"([^"]*)"',
                             script, re.S):
        first = match.group(1).split()
        if first:
            generated.add(first[0])

    declared = set()
    for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        target = selector.strip().rstrip(",").split(",")[0].strip()
        match = re.fullmatch(r"\.([\w-]+)", target)
        if not match:
            continue
        name = match.group(1)
        if "text-transform" in body:
            declared.add(name)
        if name not in classes:
            continue
        if _mono_without_case(body):
            problems.append(
                "%s is a button showing monospace text and never says what "
                "happens to its case, so the shared button rule uppercases it "
                "- 0x0 renders as 0X0" % target)

    # A rule can dress buttons without naming a class they carry --
    # `.stray-seg button` styles the address buttons of Figure 17, whose own
    # class list is empty. Skipped by the loop above, and removing its reset
    # brought 0XD0000018 back with nothing complaining.
    for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        target = " ".join(selector.split())
        if not re.search(r"(?:^|[\s>+~])button(?:[\s:\[]|$)", target):
            continue
        if _mono_without_case(body):
            problems.append(
                "%s dresses buttons in the monospace family without saying "
                "what happens to their case, so the shared button rule "
                "uppercases them - 0x0 renders as 0X0" % target)

    for name in sorted(generated - declared):
        problems.append(
            ".%s is the base class of a button the script builds, so its text "
            "is never in the markup for anyone to notice, and it does not say "
            "what happens to its case - the shared button rule uppercases it"
            % name)
    return problems


SELECTED_TOKENS = {"is-on", "is-lit"}


def boot_state_checks(html):
    """The figure a reader meets with scripting off is the markup's own state.

    A figure that declares an opening state declares it twice: in the markup,
    so the page reads with no JavaScript, and in the script, which reproduces
    it on load. The behavioural tests only ever see the second, because the
    script has run by the time they look, so the markup half can drift
    unnoticed. Figure 15 shipped a listing whose opening line was not the one
    its panel showed, and only a screenshot caught it.

    Selection is spelled two ways on this page, and for a while this scan knew
    only one of them. `is-on` marks the chosen panel in Figures 3, 4, 7 and 15;
    `is-lit` does the same job in Figures 1, 2 and 3. Reading only `is-on` made
    the scan silently skip every `is-lit` figure -- proven by moving the lit
    panel in Figure 7 and in Figure 1 and watching only the first get caught.
    Both tokens count now. The token was only half of it: the scan also read
    attributes positionally, requiring `class=` before `id=`, so Figure 1's
    `<g id="svg-byte" class="cast-el">` stayed invisible whatever its classes
    said. Fixing the token alone left the mutation still escaping, which is the
    argument for putting the defect back rather than reasoning about the patch.
    Attributes come out of the tag in either order now.

    Note what this still does not mean: Figures 1 and 2 deliberately mark
    nothing in the markup, because un-highlighted is a fine way for them to
    read with no scripting, and a figure that declares no opening state is not
    required to.

    The invariant checked is the one that cannot be argued with: where a set of
    buttons and a set of panels inside one figure share suffixes --
    `dl-and`/`dp-and`, `hd-0`/`hxr-0`, `rg-2`/`rgn-2` -- the pressed button and
    the shown panel must be the same one.

    Three things the scan has to allow for, each of which produced a false
    alarm first. Independent toggles are not a one-of-many group, so a set with
    no matching panels is skipped -- Figure 4's four bit switches are meant to
    be three-quarters pressed. A group may carry an extra control on the same
    prefix, so the panels need only be a subset of the buttons, which is what
    lets Figure 7's `rg-twins` sit beside `rg-0`..`rg-7`. And a set where no
    panel is marked shown is the other legitimate pattern: Figure 14's cases
    are all visible until the script puts four away, so no scripting means all
    five rather than none. Figures are scanned one at a time, because `hd-*`
    and `rgn-*` both run 0 to 7 and have nothing to do with each other.
    """
    problems = []
    body = html[html.index("</style>") + 8:] if "</style>" in html else html
    markup = body.split("<script>")[0]

    for figure in re.findall(r"<figure\b.*?</figure>", markup, re.S):
        pressed, shown = {}, {}
        for tag in re.finditer(r"<([a-zA-Z][\w-]*)([^>]*)>", figure):
            name, attrs = tag.group(1).lower(), tag.group(2)
            ident = re.search(r'\bid="([\w-]+?)-(\w+)"', attrs)
            if not ident:
                continue
            prefix, suffix = ident.groups()
            state = re.search(r'\baria-pressed="(\w+)"', attrs)
            if name == "button" and state:
                pressed.setdefault(prefix, {})[suffix] = state.group(1) == "true"
                continue
            marks = re.search(r'\bclass="([^"]*)"', attrs)
            marks = marks.group(1).split() if marks else []
            shown.setdefault(prefix, {})[suffix] = bool(
                SELECTED_TOKENS & set(marks))
        for bprefix in pressed:
            shown.pop(bprefix, None)

        for bprefix, buttons in sorted(pressed.items()):
            if len(buttons) < 2:
                continue
            for pprefix, panels in sorted(shown.items()):
                if len(panels) < 2 or not set(panels) <= set(buttons):
                    continue
                lit = sorted(s for s, on in panels.items() if on)
                if not lit:
                    continue      # the inverted pattern: everything visible
                down = sorted(s for s, on in buttons.items()
                              if on and s in panels)
                if len(lit) != 1 or down != lit:
                    problems.append(
                        "with no JavaScript, %s-* shows %s while %s-* has %s "
                        "pressed - the markup's opening state has drifted from "
                        "the one the script reproduces"
                        % (pprefix, lit, bprefix, down or ["nothing"]))
    return problems


def assertion_checks(tests_path):
    """An assertion whose expected value is its actual value cannot fail.

    `chk("no answer is on screen before the reader commits", true, true)` was
    written beside a loop that threw on failure, so the real check was the
    throw and the chk was decoration -- but it counted toward the suite total
    and read, in a list of passes, exactly like coverage. That is worse than
    no assertion, which is the same argument as a check that has never failed.
    """
    problems = []
    if not os.path.exists(tests_path):
        return problems
    with open(tests_path, encoding="utf-8") as handle:
        source = handle.read()

    index = 0
    while True:
        start = source.find("chk(", index)
        if start < 0:
            break
        cursor, depth = start + 4, 1
        while depth and cursor < len(source):
            if source[cursor] == "(":
                depth += 1
            elif source[cursor] == ")":
                depth -= 1
            cursor += 1
        args, parts, current, nesting = source[start + 4:cursor - 1], [], "", 0
        for char in args:
            if char in "([{":
                nesting += 1
            elif char in ")]}":
                nesting -= 1
            if char == "," and nesting == 0:
                parts.append(current)
                current = ""
            else:
                current += char
        parts.append(current)
        if len(parts) >= 3:
            got, want = (" ".join(p.split()) for p in parts[1:3])
            if got == want:
                problems.append(
                    "%s asserts %s against itself, so it cannot fail"
                    % (" ".join(parts[0].split())[:60], got))
            # A ternary whose arms agree is the same defect wearing a
            # disguise, and the identity test above walks straight past it.
            # `REG["x"] ? true : true` was written within an hour of adding
            # that test, by the person who added it.
            ternary = re.match(r"^.+\?(.+):(.+)$", got)
            if ternary and (" ".join(ternary.group(1).split())
                            == " ".join(ternary.group(2).split())):
                problems.append(
                    "%s picks between two identical values, so it cannot fail"
                    % " ".join(parts[0].split())[:60])
        index = cursor
    # A comparison that cannot fail. `x.length >= 0` is never false, and I have
    # now written the tautology three times: chk(..., true, true), a ternary
    # whose arms agree, and this. Each time within an hour of adding the rule
    # meant to catch the previous one.
    for line in re.findall(r"chk\([^;]*?\);", source, re.S):
        flat = " ".join(line.split())
        if re.search(r"\.length\s*>=\s*0", flat) or re.search(
                r"\.length\s*>\s*-\d", flat):
            problems.append(
                "an assertion compares a length against zero, which cannot "
                "fail: %s" % flat[:90])

    return problems


def provenance_checks(html, name):
    """Every chapter carries its sources and its licence, at the bottom.

    Chapter 2 shipped without either. The section was inserted by a string
    replacement whose anchor did not match, which silently did nothing, and
    nothing downstream noticed: the page still passed every check and every
    assertion. Two promises broke quietly. The series tells the reader that
    every claim on a page is checked against source, and the licence footer is
    one of the four documents that have to agree about how this content is
    licensed -- the others being LICENSE, README.md and .lcignore.
    """
    problems = []
    if 'class="col sources"' not in html and "checked against source" not in html:
        problems.append(
            "%s has no sources section, and the series promises every claim on "
            "a page is checked against one" % name)
    if "CC&nbsp;BY-SA" not in html and "CC BY-SA" not in html:
        problems.append(
            "%s has no licence line, which is one of the four places this "
            "content's licence is stated" % name)
    return problems


def imperative_checks(html):
    """Every figure names something to do, above the thing that does it.

    The chapter's own rule -- an imperative over each figure, a "Notice that"
    under it -- and fifteen of seventeen followed it. Figures 10 and 13 never
    had one, which nothing noticed because the rule lived in a note rather
    than in the gate. The line is what tells a reader that a drawing is a
    control at all, and Figure 13's only instruction sat *inside* its outcome
    box, below the tabs it does not mention.
    """
    problems = []
    body = html[html.index("</style>") + 8:] if "</style>" in html else html
    markup = body.split("<script>")[0]
    # Only the instrument figures. The two plain `svgfig` drawings carry no
    # controls, so there is nothing to tell a reader to do with them, and
    # requiring a line over those would be a gate failing correct work.
    for figure in re.findall(r'<figure class="instrument[^"]*">.*?</figure>',
                             markup, re.S):
        if 'class="dothis"' in figure:
            continue
        label = re.search(r'instrument-label">([^<]*)', figure)
        problems.append(
            "%s has no imperative - nothing above it says what to do with it"
            % (label.group(1).replace("&nbsp;", " ") if label else "a figure"))
    return problems


def selected_in_markup_checks(html):
    """A group the script selects one of must say which one in the markup.

    boot_state_checks compares a pressed button against a shown panel, and lets
    a group with nothing shown through, because that is a real pattern: Figure
    14's cases are all visible until the script puts four away. The escape is
    wider than it should be. Take the opening class off Figure 17's first panel
    and nothing complained -- the behavioural tests still passed, because the
    script sets it at load, and the no-JavaScript reader was left with five
    equally dim paragraphs and no way to tell which one was being talked about.

    What separates the two cases is which token the script uses. A *selection*
    token means one of these is current, so exactly one must carry it before
    any script runs; `is-off` and the like hide things and imply nothing. So
    the prefixes are read out of the script -- `getElementById("stp-" + i)`
    followed by `classList.toggle("is-on", ...)` -- rather than guessed at.

    Two things this deliberately does not reach, so nobody reads more coverage
    into it than it has. A group addressed by literal id rather than by prefix
    plus index is invisible here; Figure 2's `cat-*` is written that way. And
    "exactly one" is the wrong rule for a set of independent flags -- that same
    `cat-*` lights two at boot, because a console pin is also a GPIO -- so
    widening the scan without widening the rule would fail correct work.
    """
    problems = []
    if "<script>" not in html:
        return problems
    script = html[html.rindex("<script>"):html.rindex("</script>")]
    markup = html[:html.rindex("<script>")]

    groups, groups_at = {}, {}
    for match in re.finditer(
            r'getElementById\(\s*"([\w-]+?)-"\s*\+[^)]*\)\s*'
            r'\.classList\.toggle\(\s*"([\w-]+)"', script):
        prefix, token = match.groups()
        if token in SELECTED_TOKENS:
            groups.setdefault(prefix, set()).add(token)
            groups_at.setdefault(prefix, match.start())

    # Which button group drives each panel group, taken from the same lines of
    # script rather than from the surrounding markup. boot_state_checks pairs
    # these by scanning one <figure> at a time, so it cannot see an interactive
    # that is not inside one -- this page has three, and none of them is even
    # inside a <section>. Reading both prefixes off adjacent statements needs
    # no container at all, and cannot mis-pair `hd-*` with `rgn-*` the way a
    # whole-page scan would.
    drivers = []
    for match in re.finditer(
            r'getElementById\(\s*"([\w-]+?)-"\s*\+[^)]*\)'
            r'[\s\S]{0,80}?\.setAttribute\(\s*"aria-pressed"', script):
        drivers.append((match.start(), match.group(1)))

    def suffix_marked(prefix, wanted):
        """The suffix of the one `prefix-*` element the markup marks."""
        found = []
        for tag in re.finditer(
                r'<[a-zA-Z][^>]*\bid="%s-(\w+)"[^>]*>' % re.escape(prefix), markup):
            attrs = tag.group(0)
            classes = re.search(r'\bclass="([^"]*)"', attrs)
            pressed = re.search(r'\baria-pressed="(\w+)"', attrs)
            if wanted == "pressed":
                if pressed and pressed.group(1) == "true":
                    found.append(tag.group(1))
            elif classes and wanted & set(classes.group(1).split()):
                found.append(tag.group(1))
        return found

    for prefix, tokens in sorted(groups.items()):
        members = re.findall(
            r'<[a-zA-Z][^>]*\bid="%s-\w+"[^>]*>' % re.escape(prefix), markup)
        if len(members) < 2:
            continue
        lit = suffix_marked(prefix, tokens)
        if len(lit) != 1:
            problems.append(
                "the script marks one of %s-* with %s, but the markup marks %d "
                "of them - with no JavaScript the reader cannot tell which one "
                "the page is talking about"
                % (prefix, "/".join(sorted(tokens)), len(lit)))
            continue
        # Nearest *qualifying* driver, not merely nearest. A driver qualifies
        # only if its members actually carry aria-pressed and its suffixes
        # cover the panel's -- the same correspondence boot_state_checks
        # requires. Without both tests this paired Figure 1's nine word buttons
        # with its three zones, whose suffixes are not even the same kind of
        # thing, and Figure 4's ranges with the spans inside its buttons
        # rather than the buttons.
        at = groups_at.get(prefix)
        want = set(lit) | set(re.findall(
            r'<[a-zA-Z][^>]*\bid="%s-(\w+)"' % re.escape(prefix), markup))
        near = []
        for pos, name in drivers:
            if name == prefix:
                continue
            pressable = set(re.findall(
                r'<[a-zA-Z][^>]*\bid="%s-(\w+)"[^>]*\baria-pressed="'
                % re.escape(name), markup))
            if pressable and want <= pressable:
                near.append((abs(pos - at), name))
        if not near:
            continue
        distance, driver = min(near)
        if distance > 2000:
            continue
        down = suffix_marked(driver, "pressed")
        if down != lit:
            problems.append(
                "with no JavaScript, %s-* shows %s while %s-* has %s pressed - "
                "the markup's opening state has drifted from the one the script "
                "reproduces" % (prefix, lit, driver, down or ["nothing"]))
    return problems


def run_order_checks(html):
    """Figure 15's run-order badge is stated twice; keep the two agreeing.

    Each of the three live lines carries a number, and so does the heading of
    the panel that explains it. Nothing else ties them together, and the whole
    point of the badge is that this order is *not* the order the lines are
    printed in -- so a reader has no way to catch a wrong one by eye.
    """
    problems = []
    if 'class="disline"' not in html and "disline" not in html:
        return problems
    lines, panels = {}, {}
    for match in re.finditer(r'id="dl-(\w+)"[^>]*>\s*<span class="dis-n">([^<]*)</span>',
                             html):
        lines[match.group(1)] = match.group(2).strip()
    for match in re.finditer(r'id="dp-(\w+)">\s*<span class="dispanel-h">'
                             r'<span class="dis-n">([^<]*)</span>', html):
        panels[match.group(1)] = match.group(2).strip()
    if not lines:
        return problems
    for slug in sorted(lines):
        if slug not in panels:
            problems.append("the line dl-%s has no panel dp-%s to explain it"
                            % (slug, slug))
        elif lines[slug] != panels[slug]:
            problems.append("dl-%s is numbered %r in the listing and %r in its "
                            "panel" % (slug, lines[slug], panels[slug]))
    want = set(str(i + 1) for i in range(len(lines)))
    if set(lines.values()) != want:
        problems.append("the run-order badges are %s, which is not %s"
                        % (sorted(lines.values()), sorted(want)))
    return problems


# A colour and a background set by the *same rule* are certain to meet: no
# cascade analysis is needed to know that. This is the narrow, decidable slice
# of the problem the palette checks cannot see, and it is the one that bit
# twice in a day -- a badge painted --hot-ink on --hot at 3.50:1, and before
# that --surface on --rule-strong at 3.34:1. Both pairings looked fine in the
# token list; neither pairing was in it.
BORDERISH = ("border-color", "border", "outline", "outline-color",
             "box-shadow", "border-left-color", "border-top-color",
             "border-right-color", "border-bottom-color")


def same_rule_contrast_checks(component_css, tokens):
    """Any rule painting both a foreground and a background must be legible."""
    problems = []
    for match in re.finditer(r"(?:^|\n)([^\n{]+)\{([^}]*)\}", component_css):
        selector, decls = match.group(1).strip(), match.group(2)
        fg = re.search(r"(?:^|;|\s)color\s*:\s*var\((--[a-z0-9-]+)\)", decls)
        bg = re.search(r"(?:^|;|\s)background(?:-color)?\s*:\s*var\((--[a-z0-9-]+)\)",
                       decls)
        if not fg or not bg:
            continue
        for label, theme in tokens:
            a, b = theme.get(fg.group(1)), theme.get(bg.group(1))
            if not a or not b:
                continue
            got = _contrast(a, b)
            if got < 4.5:
                problems.append(
                    "%s theme: %r paints %s on %s at %.2f:1, and text needs "
                    "4.5:1" % (label, selector, fg.group(1), bg.group(1), got))
    return problems


def glossary_use_checks(html):
    """A word the chapter defines and then never uses again.

    The glossary section makes a promise in its own lead sentence -- "each is
    one sentence now and repeated in context below" -- and nothing was checking
    it. Chapter 4 shipped eleven words of which two, `userspace` and `TBF`,
    appeared exactly once each: in the list itself. The chapter said
    "application" and "the header" everywhere it could have said them, which
    means the reader was handed two words and then never shown one in use.

    Both existing vocabulary rules are satisfied by that page. The `<dfn>` rule
    is bidirectional between the tags and the list, and both agreed. The
    leaned-on rule asks whether a word used four or more times has ever been
    defined, which is the opposite question. This one asks whether a word that
    was defined is ever used, and it is the cheaper of the two to get wrong,
    because a glossary is written before the prose that was supposed to need it.
    """
    problems = []
    for block in re.finditer(
            r'<(\w+)[^>]*class="glossary(?: cast)?"[^>]*>(.*?)</\1>',
            html, flags=re.S):
        listed = [re.sub(r"<[^>]+>", "", t).strip()
                  for t in re.findall(r"<dt[^>]*>(.*?)</dt>",
                                      block.group(2), flags=re.S)]
        # Everywhere except the list itself. The first version looked only at
        # the prose *after* the block, which is right for chapters 3 and 4,
        # where the glossary is the front matter -- and wrong for chapter 1,
        # whose list is a closing summary with nothing after it. That version
        # reported all twenty-three of chapter 1's terms as unused.
        rest = html[:block.start()] + html[block.end():]
        text = " ".join(_sentences(_strip_for_prose(rest)))
        for term in listed:
            if not re.search(r"\b%ss?\b" % re.escape(term), text,
                             0 if term.isupper() else re.I):
                problems.append(
                    "%r is in the glossary and never used after it" % term)
    return problems


def wired_checks(html):
    """A control the script never reaches.

    Chapter 3's Figure 8 shipped with three buttons, three panels, a correct
    opening state in the markup, and no listener: the `group()` call that binds
    them was never added. Every static check passed, because the markup was
    internally consistent -- the opening state a script would produce is the one
    that was already there. Only walking the figure caught it.

    So: every button that declares `aria-pressed` has to be reachable from the
    script, either by its own id or by the prefix the script builds ids from.
    """
    if "<script>" not in html:
        return []
    script = html[html.rindex("<script>") + len("<script>"):
                  html.rindex("</script>")]
    strings = set(_string_literals(script))
    problems = []
    for tag in re.findall(r"<button[^>]*aria-pressed[^>]*>", html):
        found = re.search(r'\bid="([^"]+)"', tag)
        if not found:
            problems.append("a button declares aria-pressed but has no id")
            continue
        ident = found.group(1)
        # Named outright, or built from a prefix the script holds. The prefix
        # is not always an index: chapter 1 builds "opt-" + a word and "btn-" +
        # a word, so stripping trailing digits alone reported nine buttons that
        # are bound perfectly well. Any literal that is a prefix of the id
        # counts, and a class the script selects on counts too, since
        # `querySelectorAll(".bet-opt")` never mentions an id at all.
        classes = re.search(r'\bclass="([^"]*)"', tag)
        tokens = set(classes.group(1).split()) if classes else set()
        if (ident in strings
                or tokens & strings
                or any(len(lit) >= 3 and ident.startswith(lit)
                       for lit in strings)):
            continue
        problems.append(
            "nothing in the script reaches %s, so its aria-pressed is a "
            "promise the page does not keep" % ident)
    return problems


def figure_order_checks(html):
    """Figure labels run 1..N down the page, with no gaps and no repeats.

    Written after inserting a figure into the middle of chapter 4 and numbering
    it 12, which is what the last label had been. Every cross-reference on the
    page still resolved, the behavioural suite still passed, and the number was
    correct in the sense that it named exactly one figure -- it just sat fifth,
    between Figure 4 and Figure 5. Only rendering it caught that, and only
    because the renderer picks figures by position rather than by label.
    """
    labels = re.findall(r'instrument-label">Figure (\d+)</span>', html)
    if not labels:
        return []
    want = [str(n) for n in range(1, len(labels) + 1)]
    if labels == want:
        return []
    return ["figure labels read %s down the page, and should read %s"
            % (", ".join(labels), ", ".join(want))]


def figure_label_checks(html, tests_path):
    """An assertion that names a figure names the one its element is in.

    Written after renumbering chapter 4's twelve figures to fix the misplaced
    Figure 12 above. The page came out right and every assertion still passed,
    because the suite addresses elements by id and an id does not carry a
    number. What it left behind was eight assertion descriptions naming the
    figure the element used to be in -- a suite that reads correct, passes
    green, and tells the reader the wrong thing about the page it is guarding.

    Only two shapes are checked, and both name the element's own figure by
    construction: a walk() label, and a "figure N opens ..." description. An
    assertion that deliberately names a different figure -- "the top panel
    hands the reader on to figure 7" -- is left alone.
    """
    if not os.path.exists(tests_path):
        return []
    owner = {}
    for block in re.finditer(r"<figure\b.*?</figure>", html, re.S):
        label = re.search(r'instrument-label">Figure (\d+)</span>', block.group(0))
        if not label:
            continue
        for prefix in re.findall(r'id="([a-z]+)-0"', block.group(0)):
            owner[prefix] = label.group(1)
    if not owner:
        return []

    with open(tests_path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    # Comments in these suites are whole lines, and they carry figure numbers
    # for prose reasons the two patterns below should not be reading.
    code = " ".join(l for l in lines if not l.lstrip().startswith("//"))

    problems = []
    seen = set()
    def claim(prefix, said, shape):
        if prefix not in owner or owner[prefix] == said:
            return
        key = (prefix, said, shape)
        if key in seen:
            return
        seen.add(key)
        problems.append(
            "%s calls %s- figure %s in a %s, and the page has it in figure %s"
            % (os.path.basename(tests_path), prefix, said, shape, owner[prefix]))

    for m in re.finditer(r'walk\(\s*"([a-z]+)-"\s*,\s*"[a-z]+-"\s*,'
                         r'\s*\d+\s*,\s*"figure (\d+)"', code):
        claim(m.group(1), m.group(2), "walk label")
    for m in re.finditer(r'chk\(\s*"figure (\d+) opens[^"]*"\s*,'
                         r'\s*REG\["([a-z]+)-0"\]', code):
        claim(m.group(2), m.group(1), '"opens on" description')
    return problems


# Words that head a selector part without naming an element: at-rule keywords
# and the bare-word pieces of a media query. Plus the three elements a browser
# creates whether or not the file writes them -- these pages open at `<title>`
# and have no `<html>` or `<body>` tag anywhere, and `body { ... }` is the rule
# that paints the background.
CSS_NOT_TAGS = {"from", "to", "and", "not", "only", "screen", "print", "all",
                "html", "body", "head"}


def dead_css_checks(html):
    """A rule whose class or id appears nowhere else on the page.

    Chapter 2 was built by copying chapter 1's stylesheet and deleting what it
    did not use -- 237 rules went. Fourteen survived that had nothing left to
    style: `.brp`, `.pkgp`, `.strayp`, `.hxrange` and the rest were chapter 1
    figures that chapter 2 does not have, and each appeared exactly once in the
    file, in its own rule. Two media queries were left with empty bodies and a
    comment describing a figure that is not there either.

    None of it renders wrong, which is the problem: dead CSS is invisible until
    somebody copies the sheet again for the next chapter, and then it is
    inherited rather than found. It also makes the sheet lie about what the
    page contains, which is the thing a reader of the source trusts it for.

    Class and id tokens were the whole of it for a while, which left a rule
    made only of element names invisible. `.selfcheck details`, `.selfcheck
    summary` and `summary:focus-visible` rode from chapter 1 into chapters 3
    and 4, neither of which contains a `<details>` anywhere -- and the comment
    above them asserted they were "still load-bearing", which is how they
    survived five review passes of chapter 3. So a tag named in a selector has
    to appear in the markup too. The test is narrow on purpose: only element
    names occurring nowhere on the page are refused, so `p`, `button` and the
    rest are never in question.
    """
    if "</style>" not in html:
        return []
    style = html[html.index("<style>") + 7:html.index("</style>")]
    rest = html[html.index("</style>") + 8:]

    # Every class and id the page can actually put on an element: the values of
    # its class and id attributes, plus every string the script holds, since a
    # class the script adds never appears in the markup at all.
    #
    # Reading the whole page as one bag of words instead -- the first version of
    # this -- lets ordinary prose vouch for a rule. `.goals .cost` is dead in
    # both chapters written so far, and chapter 2 passed anyway, because the
    # word "cost" occurs in a figure title three screens away.
    live = set()
    markup = re.sub(r"<script.*?</script>", " ", rest, flags=re.S)
    tags = set(t.lower() for t in re.findall(r"<([A-Za-z][\w-]*)", markup))
    # A script can create elements as well as write classes.
    tags.update(t.lower() for t in
                re.findall(r'createElement\(\s*["\']([A-Za-z][\w-]*)', rest))
    for value in re.findall(r'\b(?:class|id)="([^"]*)"', markup):
        live.update(re.findall(r"[\w-]+", value))
    if "<script>" in rest:
        script = rest[rest.rindex("<script>") + len("<script>"):
                      rest.rindex("</script>")]
        for literal in _string_literals(script):
            live.update(re.findall(r"[\w-]+", literal))

    problems = []
    body = re.sub(r"/\*.*?\*/", " ", style, flags=re.S)
    # Rule heads only: everything before a `{` that is not inside a block.
    depth, head, empty_at = 0, [], None
    i = 0
    while i < len(body):
        c = body[i]
        if c == "{":
            if depth == 0:
                selector = " ".join("".join(head).split())
                head = []
                if selector.startswith("@"):
                    # An at-rule with nothing in it is dead in a quieter way.
                    j, d = i + 1, 1
                    while j < len(body) and d:
                        d += (body[j] == "{") - (body[j] == "}")
                        j += 1
                    if not body[i + 1:j - 1].strip():
                        problems.append("%s has an empty body" % selector)
                else:
                    for token in re.findall(r"[.#]([A-Za-z][\w-]*)", selector):
                        if token not in live:
                            problems.append(
                                "%s styles .%s, which the page never uses"
                                % (selector, token))
                    # Type selectors: the name heading a compound, not the word
                    # after a dot, a hash or a colon.
                    for part in re.split(r"[\s>+~,]+", selector):
                        name = re.match(r"([A-Za-z][\w-]*)", part)
                        if not name:
                            continue
                        tag = name.group(1).lower()
                        if tag not in tags and tag not in CSS_NOT_TAGS:
                            problems.append(
                                "%s styles <%s>, which the page has none of"
                                % (selector, tag))
            depth += 1
        elif c == "}":
            depth -= 1
            if depth < 0:
                depth = 0
        elif depth == 0:
            head.append(c)
        i += 1
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

    if marker in html and "</style>" in html:
        problems.extend(state_scope_checks(
            html.split(marker, 1)[1].split("</style>", 1)[0]))

    if marker in html and "</style>" in html:
        try:
            themes = [
                ("light", _tokens(html[html.index(":root {"):
                                       html.index("@media (prefers-color-scheme: dark)")])),
                ("dark", _tokens(html[html.index("@media (prefers-color-scheme: dark)"):
                                      html.index(':root[data-theme="dark"]')])),
            ]
        except ValueError:
            themes = []
        if themes:
            problems.extend(same_rule_contrast_checks(
                html.split(marker, 1)[1].split("</style>", 1)[0], themes))

    problems.extend(palette_checks(html))
    problems.extend(semantic_checks(html))
    problems.extend(register_table_checks(html))
    problems.extend(boot_state_checks(html))
    problems.extend(selected_in_markup_checks(html))
    problems.extend(imperative_checks(html))
    problems.extend(provenance_checks(html, name))
    problems.extend(assertion_checks(os.path.join(TOOLS, name.split('-')[0] + '.tests.js')))
    problems.extend(button_case_checks(html))
    problems.extend(run_order_checks(html))
    problems.extend(demo_source_checks(html, os.path.join(ROOT, name)))
    problems.extend(demo_asm_checks(html, os.path.join(ROOT, name)))
    problems.extend(live_name_checks(html))
    problems.extend(dead_css_checks(html))
    problems.extend(glossary_use_checks(html))
    problems.extend(figure_order_checks(html))
    problems.extend(figure_label_checks(
        html, os.path.join(TOOLS, name.split('-')[0] + '.tests.js')))
    problems.extend(wired_checks(html))

    return problems


VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}


def _page_text(html):
    """Every id'd element's own text, as a browser would hand it over.

    One pass with a tag stack, so nesting is handled rather than guessed at.
    The value is tag-stripped and whitespace-collapsed because that is what the
    shim's innerHTML and textContent both hand back; matching the browser's
    markup-preserving innerHTML would mean a second divergence, not one fewer.
    """
    out, stack = {}, []
    for match in re.finditer(r"<(/?)([a-zA-Z][\w-]*)([^>]*?)(/?)>", html):
        closing, tag, attrs, self_closed = match.groups()
        tag = tag.lower()
        if closing:
            while stack:
                name, ident, start = stack.pop()
                if name != tag:
                    continue
                if ident is not None:
                    inner = html[start:match.start()]
                    inner = re.sub(r"<[^>]*>", "", inner)
                    inner = html_module.unescape(inner)
                    out[ident] = " ".join(inner.split())
                break
            continue
        if self_closed or tag in VOID_TAGS:
            continue
        ident = re.search(r'\bid="([^"]+)"', attrs)
        stack.append((tag, ident.group(1) if ident else None, match.end()))
    return out


def _attr_map(html, attr):
    """{id: value of `attr`} for every element in the markup that has both.

    Unescaped, because an HTML parser decodes entity references inside an
    attribute value before anything can read it back. Leaving them raw meant
    `getAttribute` handed the page a literal "&mdash;", which Figure 17 then
    printed into its readout.
    """
    out = {}
    for tag in re.findall(r"<[a-zA-Z][^>]*>", html):
        tag_id = re.search(r'\bid="([^"]+)"', tag)
        value = re.search(r'\b%s="([^"]*)"' % attr, tag)
        if tag_id and value:
            out[tag_id.group(1)] = html_module.unescape(value.group(1))
    return out


def page_state(html):
    """What a browser hands every element before a line of script runs.

    Three maps, each here because the shim starting blank hid something:

    `value` -- a browser gives an `<input value="25">` that value, and without
    it the page's first render, the one a reader actually meets, went untested
    and a slider computed parseInt("").

    `text` -- the markup's own words. These pages are built on the rule that
    the markup holds the sentences and the script only moves highlights, so an
    unseeded shim could only ever reach content the script wrote, which is
    precisely the content this architecture exists not to have. Figure 13's
    reset reads its idle line back off the element.

    `cls` -- the markup's own classes, without which `classList.contains`
    answered false for a class the markup plainly declares.

    `attrs` -- every other attribute. `getAttribute` used to return only what
    `setAttribute` had set, so it answered null for an attribute written in the
    markup; and without `min`/`max` a range input could not be clamped the way
    a browser clamps one.
    """
    attrs = {}
    for tag in re.findall(r"<[a-zA-Z][^>]*>", html):
        tag_id = re.search(r'\bid="([^"]+)"', tag)
        if not tag_id:
            continue
        pairs = {k: html_module.unescape(v) for k, v in
                 re.findall(r'\b([a-zA-Z][\w:-]*)="([^"]*)"', tag)}
        pairs.pop("id", None)
        pairs.pop("class", None)
        attrs[tag_id.group(1)] = pairs

    return {
        "value": _attr_map(html, "value"),
        "text": _page_text(html),
        "cls": _attr_map(html, "class"),
        "attrs": attrs,
    }


def page_bundle(html, tail):
    """The jsc bundle: seeded shim, the page's script, then `tail`.

    Both callers go through here on purpose. `fixture.py` used to assemble its
    own copy of this and was not given the class seeding when that was added,
    so it rendered a figure whose panel had lost the classes the markup gave
    it -- a defect in the instrument that looked exactly like a defect in the
    page. Two assemblies of the same bundle will always drift; there is one.
    """
    page_js = html[html.rindex("<script>") + len("<script>"):html.rindex("</script>")]
    ids = sorted(set(re.findall(r'\bid="([^"]+)"', html)))
    state = page_state(html)

    with open(os.path.join(TOOLS, "harness.js"), encoding="utf-8") as fh:
        harness = fh.read()
    # The shim's own contract runs before any page script, so a shim that has
    # drifted from the DOM fails loudly instead of quietly certifying a page.
    contract_path = os.path.join(TOOLS, "harness.contract.js")
    if os.path.exists(contract_path):
        with open(contract_path, encoding="utf-8") as fh:
            harness = harness + "\n" + fh.read()

    return "\n".join([
        "var PAGE_IDS = %s;" % json.dumps(ids),
        "var PAGE_VALUES = %s;" % json.dumps(state["value"]),
        "var PAGE_TEXT = %s;" % json.dumps(state["text"]),
        "var PAGE_CLASS = %s;" % json.dumps(state["cls"]),
        "var PAGE_ATTRS = %s;" % json.dumps(state["attrs"]),
        harness,
        page_js,
        tail,
    ])


def behavior_checks(html, tests_path):
    """Execute the page JS plus assertions under jsc. Returns (ok, output)."""
    if not os.path.exists(JSC):
        return None, "JavaScriptCore not found at %s - skipped" % JSC

    if "<script>" not in html:
        return None, "page has no <script> - skipped"

    with open(tests_path, encoding="utf-8") as fh:
        tests = fh.read()

    bundle = page_bundle(html, "\n".join([
        tests,
        "var failed = report();",
        "if (failed) { throw new Error(failed + ' assertion(s) failed'); }",
    ]))

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
        "crate", "disassembler", "flash", "GPIO", "hexadecimal", "instruction",
        "interrupt", "kernel", "mask", "offset", "optimizer", "peripheral",
        "pin", "processor", "register", "SIO", "store", "volatile",
    ],
    "ch03": [
        "board", "capsule", "generic", "HIL", "process", "struct", "trait",
        "unsafe", "virtualizer",
    ],
    "ch04": [
        "fault", "grant", "heap", "panic", "process", "scheduler", "stack",
        "syscall", "TBF", "timeslice", "userspace",
    ],
    "ch05": [
        "execute-never", "fault", "HardFault", "MemManage",
        "memory protection unit", "permissions", "privileged", "region",
        "unprivileged",
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
    # The sources list is citations, not running prose, and this rule has said
    # so since chapter 2 -- but it matched `<div class="sources">` and every
    # chapter writes `<section class="col sources">`, so the exemption had
    # never once applied. Chapters 1 to 3 happened to keep every bullet under
    # the sentence limit and nobody noticed; chapter 4 cites a Makefile target
    # against a README that names a different one, which cannot be said in
    # thirty-four words. Match what the pages actually write.
    text = re.sub(r'<(div|section)[^>]*class="[^"]*\bsources\b[^"]*">.*', " ",
                  text, flags=re.S)
    # A chapter's own name is not running prose. `<title>` is never rendered in
    # the page at all -- it is the browser tab -- and `<h1>` is the masthead.
    # Counting them was not a strict reading of the rule, it was measuring the
    # wrong text: chapter 4 is called "What a Process Is", so the word `process`
    # appeared at character 21, several hundred characters before the glossary
    # that defines it, and the ordering rule refused a chapter for naming its
    # own subject. Chapters 5 and 7 are titled the same way. Everything else in
    # the masthead -- the eyebrow, the standfirst -- is prose and still counts.
    text = re.sub(r"<title>.*?</title>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<h1[^>]*>.*?</h1>", " ", text, flags=re.S | re.I)
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


def _string_literals(source):
    """Every string literal in a piece of JavaScript, in order.

    A regex that only matches literals of some minimum length cannot do this.
    It skips the short ones, so the scan desynchronises: the closing quote of a
    skipped literal becomes the opening quote of the next match, and everything
    between them -- code, and more to the point comments -- is captured as
    though it were prose. Chapter 1's script has 598 literals under twelve
    characters, and the count it produced included whole comment blocks. It read
    as prose hidden behind a click, which is a real rule being enforced with a
    measurement that was not measuring it.

    Comments are removed first, then every literal is consumed in order so the
    quotes stay paired. Regular-expression literals are stepped over, since one
    containing a quote would desynchronise the scan the same way.
    """
    out = []
    i, n = 0, len(source)
    # A `/` opens a regex only where a value is expected. Tracking the previous
    # significant character is enough for the code this series writes.
    prev = ""
    while i < n:
        c = source[i]
        if c == "/" and i + 1 < n and source[i + 1] == "/":
            i = source.find("\n", i)
            if i < 0:
                break
            continue
        if c == "/" and i + 1 < n and source[i + 1] == "*":
            end = source.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        if c == "/" and prev in "=(,[:;!&|?{}\n" or (c == "/" and prev == ""):
            j = i + 1
            while j < n and source[j] not in "/\n":
                j = j + 2 if source[j] == "\\" else j + 1
            i = j + 1
            while i < n and source[i].isalpha():
                i += 1
            prev = "/"
            continue
        if c in "\"'`":
            j = i + 1
            buf = []
            while j < n and source[j] != c:
                if source[j] == "\\" and j + 1 < n:
                    buf.append(source[j + 1])
                    j += 2
                else:
                    buf.append(source[j])
                    j += 1
            out.append("".join(buf))
            i = j + 1
            prev = c
            continue
        if not c.isspace():
            prev = c
        i += 1
    return out


# The scanner above decides how much of a chapter's prose counts as hidden
# behind a click, so a quiet mistake in it silently retunes a pedagogy rule
# rather than breaking anything. These are the cases that would have caught the
# desynchronisation it replaced, and they run on every invocation.
LITERAL_CASES = [
    ('var a = "one"; var b = "two";', ["one", "two"]),
    ('var a = "0"; /* a comment with "quotes" */ var b = "after";',
     ["0", "after"]),
    ("var a = 'it\\'s'; var b = \"next\";", ["it's", "next"]),
    ('// a line comment with "a quote\nvar a = "real";', ["real"]),
    ('var re = /"/; var a = "after the regex";', ["after the regex"]),
    ('s.replace(/<[^>]*>/g, ""); var a = "ok";', ["", "ok"]),
    ('var a = "he said \\"hi\\""; var b = "z";', ['he said "hi"', "z"]),
    ('var d = 6 / 2; var a = "division is not a regex";',
     ["division is not a regex"]),
]


def literal_scanner_checks():
    problems = []
    for source, want in LITERAL_CASES:
        got = _string_literals(source)
        if got != want:
            problems.append("the string-literal scanner reads %r as %r, "
                            "not %r" % (source, got, want))
    return problems


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
    # The chapter's vocabulary list: `glossary`, or `glossary cast` where the
    # words are collected at the front. An exact-attribute match missed the
    # second, and chapter 2 got away with it only because it declares no
    # required terms. `glossary inline` is excluded on purpose -- that modifier
    # marks a two-column table standing in for a paragraph, whose left column is
    # whatever the paragraph was about (`28 bytes`, `*ptr`) and not vocabulary.
    for block in re.finditer(
            r'<(\w+)[^>]*class="glossary(?: cast)?"[^>]*>(.*?)</\1>',
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

    # 2b. Anything defined inline is in the glossary, and every glossary entry
    #     is defined inline. The rule above only pushes MUST_DEFINE terms into
    #     the glossary, so a term the author marked with <dfn> off that list
    #     could go missing from it -- `compiler` did, while the chapter's own
    #     text promised every word it uses is collected there.
    if found_any:
        marked = set(defined)
        for term in sorted(marked - listed):
            problems.append("%r is marked <dfn> but is not in the glossary"
                            % term)
        for term in sorted(listed - marked):
            problems.append("%r is in the glossary but is never marked <dfn>"
                            % term)

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
    hidden_in_markup = 0
    for literal in _string_literals(script):
        if (len(literal) >= 12 and " " in literal
                and re.search(r"[a-z]{3} [a-z]{3}", literal)):
            gated += len(re.findall(r"[A-Za-z0-9']+", literal))

    # The second route to the same place, and the one this measurement did not
    # see for four review passes. A chapter that keeps its sentences in the
    # markup -- which is the rule -- can still hide a quarter of them by
    # shipping the panels with `is-off` already on. Chapter 3 did: 1,018 words
    # in 33 blocks, 26.6% of the chapter, while this rule reported roughly
    # nothing, because none of it was in a script string. Chapters 1 and 2 ship
    # every panel visible and let the script put the others away, so a reader
    # with no JavaScript meets all of them; that is the pattern, and this is
    # what holds a later chapter to it.
    body = html[html.index("</style>") + 8:] if "</style>" in html else html
    body = body.split("<script>")[0]
    for hidden in re.finditer(
            r'<(\w+)[^>]*class="[^"]*\bis-off\b[^"]*"[^>]*>(.*?)</\1>',
            body, re.S):
        gated += len(re.findall(r"[A-Za-z0-9']+",
                                re.sub(r"<[^>]+>", " ", hidden.group(2))))
        hidden_in_markup += len(re.findall(
            r"[A-Za-z0-9']+", re.sub(r"<[^>]+>", " ", hidden.group(2))))
    # Words hidden in the markup are inside `prose` as well, so counting them
    # on both sides of the ratio would let a chapter hide a third of itself and
    # still measure under the limit -- which is exactly what the first version
    # of this did when the defect was put back to test it.
    visible = len(re.findall(r"[A-Za-z0-9']+",
                             re.sub(r"<[^>]+>", " ", prose))) - hidden_in_markup
    visible = max(visible, 0)
    if visible:
        share = gated / float(gated + visible)
        if share > MAX_GATED_PROSE:
            problems.append("%.0f%% of prose is only reachable by clicking "
                            "(limit %.0f%%): %d words in script strings or "
                            "markup that ships hidden, vs %d visible"
                            % (100 * share, 100 * MAX_GATED_PROSE,
                               gated, visible))

    return problems


# ---------------------------------------------------------------------------
# The promise ledger.
#
# Two of the three findings in chapter 2's third review pass were the same
# shape: one chapter says something about another chapter, and the other
# chapter does not back it up. Chapter 1's Figure 6 promised "Chapter 2 opens
# them up" of two things and chapter 2 opened one. Figure 7 said all six
# instructions were ones the reader had already met, and one of them appears
# nowhere else in the series.
#
# That class only gets worse from here. Chapter 2 alone makes fourteen claims
# about what chapter 1 says, and chapter 1 was rewritten heavily after chapter
# 2 was drafted -- seven passages were converted from prose to tables, ten
# openings were cut. Any one of those edits could have taken away a sentence
# chapter 2 cites, and nothing would have said so.
#
# What a machine can check here is narrow, and pretending otherwise would be
# worse than not checking. It cannot read a chapter and decide whether a debt
# is honoured. It can insist that every cross-reference is written down, that
# what the ledger says a chapter says is still there, and that a chapter which
# has shipped contains the text its creditors were promised. The judgement
# stays with the author; the bookkeeping does not.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Vocabulary the series leans on.
#
# The existing rule is bidirectional but narrow: every term a chapter marks
# <dfn> has to be in its glossary, and vice versa. It has nothing to say about a
# word the chapter uses constantly and never marks at all.
#
# Chapter 3 used `crate` fourteen times, and its central argument turns on it --
# "what makes it legal there and illegal here is only which crate it sits in".
# It used `process` twelve times, all load-bearing, three chapters before the
# one that explains what a process is. Neither was defined anywhere in the
# series, and nothing noticed, because both rules were satisfied: the terms were
# never marked, so they were never required in a glossary.
#
# A word used this often is load-bearing whether or not the author noticed. The
# threshold is deliberately blunt.
# ---------------------------------------------------------------------------

LEANED_ON = 4

# Terms that carry weight when they appear, beyond TRACKED_TERMS. Kept separate
# because TRACKED_TERMS drives the per-sentence novelty limit, which is a
# different question from whether the series ever says what a word means.
WEIGHT_BEARING = [
    "capsule", "crate", "generic", "grant", "HIL", "lifetime", "panic",
    "process", "scheduler", "struct", "syscall", "timeslice", "trait",
    "unsafe", "upcall", "virtualizer",
]


def vocabulary_checks(root, chapters):
    """A word a chapter leans on has to be defined somewhere by then.

    Somewhere, not necessarily here: chapter 3 may lean on `flash` because
    chapter 2 defined it. What it may not do is lean on a word no chapter has
    ever explained.
    """
    problems = []
    defined = set()
    watch = sorted(set(WEIGHT_BEARING) | set(TRACKED_TERMS), key=len,
                   reverse=True)
    for chapter in chapters:
        page = os.path.join(root, chapter, "index.html")
        if not os.path.exists(page):
            continue
        with open(page, encoding="utf-8") as fh:
            html = fh.read()
        # This chapter's own definitions count for this chapter. The glossary
        # sits near the top, before the prose that leans on it, so crediting
        # them only from the next chapter onward reported every word chapter 1
        # defines as undefined -- 23 of them, including `address`.
        defined |= {d.lower() for d in re.findall(r"<dfn[^>]*>(.*?)</dfn>", html)}
        prose = " ".join(_sentences(_strip_for_prose(html)))
        for term in watch:
            uses = len(re.findall(r"\b%ss?\b" % re.escape(term), prose,
                                  re.IGNORECASE))
            if uses >= LEANED_ON and term.lower() not in defined:
                problems.append(
                    "%s uses '%s' %d times and no chapter has defined it"
                    % (chapter.split("-", 1)[0], term, uses))
    return problems


LEDGER = os.path.join(ROOT, "promises.json")

PLANNED_CHAPTERS = ["ch%02d" % n for n in range(1, 8)]

WORD_NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4,
                "five": 5, "six": 6, "seven": 7}

# Deliberately loose. A regex clever enough to tell "chapter 5 covers this"
# from "come back an hour later" would also be clever enough to drop a real
# promise quietly, and quiet is how chapter 2 shipped with no sources section.
# Over-matching costs one ledger line and a written reason; under-matching
# costs a broken promise nobody sees.
PROMISE_PAT = re.compile(
    r"\b(chapters?\s+(?:\d+|one|two|three|four|five|six|seven)"
    r"|later\b|you will (?:see|meet)\b|for now\b|not yet\b"
    r"|next chapter\b|rest of this series\b)", re.I)


def _chapter_sentences(html):
    """Everything a reader can end up looking at, as sentences.

    The prose, and then every string literal in the script. The literals
    matter: "Chapter 2 opens them up" was a panel string, and so was Figure
    7's claim about the six instructions. A scan over the markup alone sees
    neither, which would have made this gate blind to both of the findings
    that caused it to be written.
    """
    text = re.sub(r"<style.*?</style>", " ", html, flags=re.S)
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    out = _sentences(text)
    if "<script>" in html:
        src = html[html.rindex("<script>") + len("<script>"):
                   html.rindex("</script>")]
        for literal in _string_literals(src):
            out.extend(s for s in _sentences(literal) if len(s.split()) > 3)
    return out


def _named_chapter(phrase):
    """The chapter directory prefix a matched phrase names, or None."""
    number = re.search(r"chapters?\s+(\d+|[a-z]+)", phrase, re.I)
    if not number:
        return None
    token = number.group(1).lower()
    value = int(token) if token.isdigit() else WORD_NUMBERS.get(token)
    return None if value is None else "ch%02d" % value


def promise_checks(root, chapters):
    """Every cross-reference is logged, still said, and backed where it lands.

    Returns (problems, notes). Notes are the debts owed by chapters that do
    not exist yet: not failures, but the specification the next chapter is
    written against.
    """
    problems, notes = [], []

    if not os.path.exists(LEDGER):
        return ["no promises.json - the ledger the promise gate reads"], []
    with open(LEDGER, encoding="utf-8") as fh:
        try:
            entries = json.load(fh)
        except ValueError as exc:
            return ["promises.json is not readable JSON: %s" % exc], []

    prefix_of = {c.split("-", 1)[0]: c for c in chapters}
    text_of = {}
    for chapter in chapters:
        page = os.path.join(root, chapter, "index.html")
        if os.path.exists(page):
            with open(page, encoding="utf-8") as fh:
                text_of[chapter.split("-", 1)[0]] = _chapter_sentences(fh.read())

    seen_ids = set()
    for entry in entries:
        eid = entry.get("id", "")
        where = entry.get("in", "")
        says = entry.get("says", "")
        if not eid or eid in seen_ids:
            problems.append("ledger entry with a missing or repeated id: %r"
                            % (eid or entry))
            continue
        seen_ids.add(eid)
        if where not in text_of:
            problems.append("%s is logged in %s, which is not a chapter here"
                            % (eid, where or "nowhere"))
            continue
        if not says or not PROMISE_PAT.search(says):
            problems.append(
                "%s quotes %r, which contains no reference for it to be "
                "logging" % (eid, says))
            continue
        # The quoted line has to still be on the page. This is the half that
        # catches an edit: rewrite the sentence and its ledger entry goes
        # stale, which is the moment to re-read what it was promising.
        if not any(says in s for s in text_of[where]):
            problems.append(
                "%s quotes %r, which %s no longer says" % (eid, says, where))
            continue

        owed = entry.get("about")
        if owed is None:
            if not entry.get("why", "").strip():
                problems.append(
                    "%s claims %r is not a reference but gives no reason"
                    % (eid, says))
            continue
        if owed not in PLANNED_CHAPTERS:
            problems.append("%s points at %s, which is not one of the seven"
                            % (eid, owed))
            continue
        kept = entry.get("kept_by", "")
        if not kept:
            problems.append("%s says %s owes something but not what" % (eid, owed))
            continue
        if owed not in text_of:
            note = "%s owes %s: %s" % (owed, where, kept)
            if note not in notes:
                notes.append(note)
            continue
        if not any(kept in s for s in text_of[owed]):
            problems.append(
                "%s: %s says %r, and %s does not say %r"
                % (eid, where, says, owed, kept))

    # The other half. A reference nobody wrote down is the case this gate
    # exists for, so an unlogged one fails rather than warns.
    logged = collections.defaultdict(list)
    for entry in entries:
        if entry.get("in") and entry.get("says"):
            logged[entry["in"]].append(entry["says"])
    for prefix, sentences in sorted(text_of.items()):
        for sentence in sentences:
            for match in PROMISE_PAT.finditer(sentence):
                phrase = match.group(0)
                # A chapter naming its own number is identifying itself, not
                # referring to anything.
                if _named_chapter(phrase) == prefix:
                    continue
                # "the next chapter" alongside an explicit number in the same
                # sentence is the same promise said twice, and the numbered half
                # is the one worth logging. On its own it still has to be.
                if (phrase.lower() == "next chapter"
                        and re.search(r"chapters?\s+\d", sentence, re.I)):
                    continue
                if any(says in sentence and phrase.lower() in says.lower()
                       for says in logged[prefix]):
                    continue
                problems.append(
                    "%s says %r and no ledger entry covers the %r in it"
                    % (prefix, sentence[:90], phrase))
    return problems, notes


def main():
    chapters = sorted(d for d in os.listdir(ROOT)
                      if d.startswith("ch")
                      and os.path.isdir(os.path.join(ROOT, d)))
    if not chapters:
        print("no chapter directories found under %s" % ROOT)
        return 1

    broken = literal_scanner_checks()
    if broken:
        for problem in broken:
            print("  FAIL  %s" % problem)
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

    # Across chapters, not within one, so it runs once after all of them.
    print("\npromises")
    print("-" * len("promises"))
    for problem in vocabulary_checks(ROOT, chapters):
        print("  FAIL  %s" % problem)
        failures += 1

    problems, notes = promise_checks(ROOT, chapters)
    for problem in problems:
        print("  FAIL  %s" % problem)
    if not problems:
        print("  pass  every cross-reference is logged and backed")
    else:
        failures += 1
    for note in sorted(notes):
        print("  open  %s" % note)

    print("\n%s" % ("all chapters passed" if not failures
                    else "%d chapter(s) with failures" % failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
