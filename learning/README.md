<!-- Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License. -->
<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
<!-- Copyright Jon Hillesheim 2026. -->

# Learning Tock from the Ground Up

A series that teaches microcontrollers and the Tock kernel from first principles,
written from the position of someone actually learning them rather than someone
who already knows.

Each chapter is a self-contained, interactive HTML page. Every technical claim is
quoted from this repository at a known commit, with file and line given, so a
reader can verify rather than trust.

## Chapters

| # | Title | Source |
|---|-------|--------|
| 1 | Everything Is Memory | [`ch01-everything-is-memory/`](ch01-everything-is-memory/) |

## Why this lives in the Tock repository

The chapters cite kernel source by file and line. Keeping them in a branch of the
tree they describe means those citations can always be checked against the exact
commit the branch sits on — and when a rebase moves a line we quoted, that is
information we want, not an inconvenience.

## Rebase safety

This branch is designed to rebase onto `upstream/master` forever without conflicts.
That property is not automatic; it holds only while these rules hold:

1. **Only ever add files. Never modify a file that upstream owns.** Not the root
   `README.md`, not `Makefile`, not `.gitignore`, not `Cargo.toml`, nothing.
2. **Every file this branch adds lives under `learning/`.** Git conflicts on file
   paths, not directory names, so as long as upstream never creates a file at one
   of our exact paths, a rebase is a fast-forward with no merge work.
3. **Keep chapter files inside a distinctly named subdirectory.** `learning/ch01-.../index.html`
   is safe in a way that a generic top-level filename would not be. Shared
   tooling lives in `learning/tools/`.

If those hold, the workflow is:

```
git fetch upstream
git rebase upstream/master
```

There is nothing to resolve, because there is nothing overlapping.

## Checking a chapter

The chapters are interactive, so "it looks right" is not evidence. From the
repository root:

```
python3 learning/tools/check.py
```

This runs three kinds of check against every chapter and exits non-zero if any
fails, so it can gate a commit.

**Static checks** on the page: duplicate ids, unbalanced tags, JavaScript
reaching for ids that do not exist, CSS variables used but never defined, and
color literals outside the theme token blocks -- that last one being the usual
way a page ends up unreadable in one of the two color schemes.

Five more static checks exist because each caught a live defect:

- **Non-ASCII with no charset declared.** These pages carry no `<meta charset>`
  and are served both from this repository and as standalone uploads, so a raw
  multi-byte character is at the mercy of whatever the host guesses. Use HTML
  entities in markup and `\uXXXX` escapes in script.
- **Hover rules that lose the cascade.** The shared `button:hover:not(:disabled)`
  rule has specificity (0,2,1), so a component rule written `.thing:hover`
  (0,2,0) loses to it and has its color silently replaced. This shipped once as
  the selected digit in chapter 1's first figure rendering at 1.25:1 in dark
  mode. The contrast checks cannot see it, because they compare *tokens* rather
  than *resolved rules* -- both colors involved were individually fine. Any
  class-based `:hover` that sets `color` must therefore out-specify the shared
  rule; `:not(:disabled)` is the convention.
- **Partial opacity on anything that can hold text.** Opacity composites an
  element *and its background* over whatever sits behind it, so dimmed text
  lands near the background however good the tokens are. Chapter 1 shipped
  eleven such rules, measured between 1.57:1 and 3.97:1 against a 4.5:1
  requirement, and the palette checks passed every one because they compare
  tokens rather than what the CSS paints. It cannot be tuned around either:
  contrast falls as soon as alpha does. De-emphasise with a colour token and
  keep opacity for SVG shapes, which cannot hold words and are exempt, along
  with disabled controls.
- **A focus indicator that loses the cascade.** The sibling of the hover trap,
  and subtler, because the specificities are *equal* rather than different:
  `.pad:focus-visible .pad-box` and `.pad.is-lit .pad-box` both score (0,3,0),
  so source order decides. The selection rule was written later, and since the
  arrow keys select the hole they focus, the ring never rendered once. Any
  `:focus-visible` rule overridden by a later rule of equal or higher
  specificity that sets the same property is refused.
- **A name that hides the thing it names.** `aria-label` *replaces* an
  element's content for anything reading the accessibility tree. Chapter 1's
  digit cells were labelled "the first digit, bits 31 down to 28" and so
  announced that forever, never the digit inside them -- the one thing that
  figure exists to show changing. That is the third bug of this shape on one
  page, after `role="img"` hid forty interactive pads and a focus ring lost the
  cascade, which is why the question to ask of any label is what it now
  prevents from being read. A control carrying an `aria-label` while the script
  rewrites text inside it is refused. Name it with `aria-labelledby` pointing
  at the live element, or mark that content `aria-hidden` where something else
  already announces it -- the 1 and 0 under chapter 1's bit switches are a
  second rendering of `aria-pressed`, and say so.

Two more are preventive rather than forensic:

- **`aria-labelledby` pointing at nothing.** A misspelt reference is not a
  weaker name, it is no name at all: the browser finds no element, falls back
  to nothing, and announces the control as "button". Every referenced id must
  be declared somewhere on the page.
- **A figure quoting compiler output it did not observe.** Figure 14 of
  chapter 1 shows five pairs of Rust beside the assembly each compiles to, and
  says so. Two checks hold that to account. The first compares the Rust against
  `optimizer-demo.rs`, shipped beside the page, with comments stripped from
  both sides -- they had drifted once already, when identifiers on the page
  were renamed for house style and stopped being what went through the
  compiler. The second actually runs the build the page documents and requires
  every instruction shown to appear in that function's real output, in the
  order shown; the figure may elide, and says what it elides, but it may not
  invent. The compile costs about 0.05s and is skipped where `rustc` or the
  target is missing.
- **A register table disagreeing with itself.** Figure 7 of chapter 1 states
  each offset three times -- in sixteens, in tens, and again as a number in the
  script, which needs it to compute base + offset. The behavioral assertions
  exercise only the script's copy, so the markup could drift away from it
  unnoticed. All three must agree, and each step between neighbouring offsets
  must be a positive multiple of 4, because a 32-bit register is 4 bytes wide.
  A listing with no script computing addresses is left alone, since printing
  one statically is a perfectly good thing to do.

**Pedagogy checks**, which exist because an audit of chapter 1 found roughly
forty technical terms used without ever being defined, and a third of the prose
sitting behind buttons a reader might never press. Four rules are enforced:

1. Every load-bearing term is wrapped in `<dfn>` at or before its first bare use
   in the running prose, and carried in a `class="glossary"` list. The term list
   is `MUST_DEFINE` in `check.py`, keyed by chapter prefix, so chapter 2 inherits
   chapter 1's vocabulary instead of redefining it. Separately, the `<dfn>` tags
   and the glossary must name exactly the same set in both directions, which is
   what stops a term defined inline but absent from `MUST_DEFINE` from going
   missing at the end -- `compiler` had, while the chapter's own text promised
   every word it uses is collected there.
2. No sentence introduces more than two new technical terms, and none runs past
   34 words. The novel-term limit is the one with a mechanism behind it --
   cognitive load theory measures difficulty as how many unfamiliar things must
   be held at once, so a short sentence carrying three new terms is harder than
   a long one carrying none. The word count is only a backstop; readability
   formulas are calibrated on 1940s schoolchildren and cannot find or fix a real
   problem, which is why nothing here targets a grade level.
3. No word on the do-not-use list appears. That list is seeded from the places
   a real beginner reading the chapter actually stopped and asked what
   something meant -- the first entry is "leg", which was both informal and
   wrong, since the RP2350 is a QFN package with flat pads and nothing
   protruding. Add to it whenever a reader trips; an author's own sense of
   what is obvious is measurably unreliable.
4. At most 20% of the prose may be reachable only by clicking. That share is
   measured by tokenising the script's string literals rather than matching
   them with a regex: a pattern that only accepts literals over some length
   skips the short ones, and skipping one desynchronises the scan, so the
   closing quote of a literal pairs with the next opening quote and the code
   between them -- comments included -- gets counted as prose. Quotations,
   diagram labels and the sources list are exempt from the sentence limits: a
   datasheet quote cannot be rewritten to suit a house style.

**Behavioral checks**: the page's own `<script>` is executed headlessly under
JavaScriptCore against the DOM shim in `tools/harness.js`, then the chapter's
assertions run against the resulting state. The shim deliberately copies the
DOM's *refusals*, not only its behaviour: it rejects an empty or
space-containing `classList` token, and its `innerHTML` setter strips tags and
keeps the text rather than discarding anything that is not the empty string.
A permissive shim is worse than none, because it makes a broken widget pass --
chapter 1's prediction figure called `classList.add("")`, which a browser
refuses, so clicking any answer threw before anything was revealed, and it
survived five review rounds because the shim stored the empty key without
complaint. When adding to the shim, copy the contract including what it
rejects.

Because the shim decides whether every other assertion means anything,
`tools/harness.contract.js` checks the places it is meant to copy the DOM, and
runs before any page script. Each case is a divergence that was found and
closed: `className` and `classList` are two views of one attribute rather than
two unrelated stores; `setAttribute` coerces its value to a string and a
missing attribute reads back as `null`; `querySelectorAll` actually filters by
the class it was given and refuses any selector shape it cannot honour, rather
than returning every child and letting a wrong query look right. This is also how the interactive figures are verified to actually
compute what the prose claims they compute -- the
chapter 1 suite caught a `1 << 31` integer-overflow case that no amount of
reading would have found.

Two of those assertions exist to enforce a finding rather than a behavior: no
figure may boot into an empty "select something to begin" state, because most
readers never click, and a figure that teaches nothing until clicked teaches
nothing. They run before any other test touches a control.

Adding a chapter means adding `tools/chNN.tests.js`; the runner discovers it by
the chapter directory's prefix and needs no changes.

### Looking at it

None of these checks can see the page. To actually render one on macOS:

```
qlmanage -t -s 1100 -o . learning/ch01-everything-is-memory/index.html
```

QuickLook runs the stylesheet but **not** the JavaScript, so this shows the page
as a reader with scripting disabled would meet it -- which is worth seeing in its
own right. It caught a readout value clipped inside its cell, and several figures
rendering as empty colored boxes, neither of which any static check noticed.

To frame one figure at a time, copy the file, add a stylesheet that hides
`.wrap > *` and un-hides a single `figure.instrument:nth-of-type(N)`, and render
that. Keep the whole body in the copy: the script expects every element to exist,
and deleting the others makes it throw.

## What CI requires of these files

The repository's own checks apply to anything committed here, and this content is
held to them:

- `make licensecheck` walks every file in the tree and requires Tock's own SPDX
  string, which it hardcodes (`tools/ci/license-checker/src/main.rs:100`). Because
  the chapters are CC BY-SA 4.0 instead, `learning/.lcignore` excludes this
  README, the LICENSE and each `ch*/index.html` from that check -- and nothing
  else. Anything else a chapter ships is ordinary code under Tock's license and
  is deliberately left to be checked, so `optimizer-demo.rs` is verified like
  any other source file. `.lcignore` is repository tooling config, so it carries
  the Tock header itself.
- `make format-check` is Rust-only. A chapter may ship a `.rs` file so that a
  figure showing compiler output can be reproduced -- chapter 1 has
  `optimizer-demo.rs` -- but nothing under `learning/` is a workspace member,
  so `cargo fmt` never reaches it. `learning/.gitignore` keeps the `.s` output
  of building one out of the way.
- `tools/ci/check-for-readmes.sh` only fires on directories containing a
  `Cargo.toml`; there are none here.
- `tools/ci/toc.sh` only checks Markdown containing a `<!-- toc -->` marker, which
  this series does not use.

Run `make prepush` from the repository root before committing.

## Viewing a chapter

The pages are self-contained: no build step, no bundler, no external assets beyond
Google Fonts. Open `index.html` in a browser, or serve the directory:

```
python3 -m http.server --directory learning 8000
```

## License

The series -- prose, diagrams, and interactive pages -- is licensed
**CC BY-SA 4.0**. Share and adapt it freely, with credit, under the same license.
See [`LICENSE`](LICENSE).

Tock source code quoted inside the chapters remains under its own
Apache-2.0 OR MIT license and is not relicensed by this grant.
