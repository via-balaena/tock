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

Seven, and then the series is finished. Chapter 1 asks one question -- any code
can write any address -- and each chapter after it answers part of that. The
last one lands on grants, which is the last mechanism chapter 1 names, so the
arc closes where the first chapter said it would.

| # | Title | Covers | Status |
|---|-------|--------|--------|
| 1 | [Everything Is Memory](ch01-everything-is-memory/) | One store, from `str` to 3.3 V on a pin, and why nothing stops it landing anywhere | published |
| 2 | [How Code Starts Running](ch02-how-code-starts-running/) | Power-on to `main()`: where the processor looks for its first instruction, what the boot ROM hunts for in the kilobyte ahead of the kernel, and what "initialize RAM" means | published |
| 3 | [What a Driver May Touch](ch03-what-a-driver-may-touch/) | Capsules and HILs: a driver that cannot reach hardware it was not handed, enforced by the type system rather than by the chip -- and the three things it can still do to you anyway | published |
| 4 | [What a Process Is](ch04-what-a-process-is/) | Code the compiler never saw: sixteen trusted bytes at the front of an application, a walk through flash that ends when a header stops parsing, and a slice of RAM with the kernel's own record of the process hidden at the top of it | published |
| 5 | The memory protection unit | The hardware fence the kernel programs around a process before letting it run | planned |
| 6 | Asking the kernel | The eight syscall classes, upcalls and allowed buffers: the only door through that fence | planned |
| 7 | Grants | How a driver keeps per-process state inside the process's own memory, bounded, with no allocator | planned |

**Why those seven and not the five chapter 1 promises.** Chapter 1 commits to
itself, to chapter 2 by name, and then to three more in a single clause:
"capsules, the memory protection unit, and grants -- and each one gets its own
chapter". Two of those three cannot be written as promised. `kernel/src/grant.rs`
describes grants as allocating "memory from a process to hold state on the
process's behalf", out of a region inside that process's own memory, and they
hold the upcalls and allowed buffers that syscalls create. So grants need
processes and syscalls underneath them, and the MPU needs processes -- it is
what it fences. Chapters 4 and 6 are those missing prerequisites; nothing in
chapter 1 promised them, and without them chapters 5 and 7 have no ground to
stand on.

**Reading order is dependency order.** 3 needs 1 and 2. 5 needs 4. 6 needs 4
and 5. 7 needs 3, 4 and 6. The MPU deliberately comes before syscalls: meet the
wall, then find the door, which is the same shape as letting the read-modify-write
race lose a pin before the atomic register is offered.

**Units.** After a numeral it is `kB`; spelled out it is "kilobyte". Chapter 1
shipped `KB`, chapter 2 spells it out throughout, and chapter 4 arrived with a
third spelling before this was written down -- three conventions for one unit
across four chapters, which is what a cross-chapter notation pass is for.

**Size.** Chapter 1 runs to about 10,900 prose words across 17 figures, and is
the outlier on purpose -- it defines the vocabulary from nothing and has no
chapter to lean on. Later chapters inherit that vocabulary and should be roughly
half: aim under 6,000 words and 8 to 10 figures. Nothing enforces this; it is a
target to notice blowing past, not a gate.

All seven are groundable on the hardware in front of the reader -- a Pico 2 and
a debug probe -- because `boards/raspberry_pi_pico_2` is a real port in this
tree and every chapter can cite it.

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

This runs four kinds of check against every chapter and exits non-zero if any
fails, so it can gate a commit.

**Static checks** on the page: duplicate ids, unbalanced tags, JavaScript
reaching for ids that do not exist, CSS variables used but never defined, and
color literals outside the theme token blocks -- that last one being the usual
way a page ends up unreadable in one of the two color schemes.

Nineteen more static checks exist because each caught a live defect. Keep the
count above honest when adding one; it has now said the wrong number twice:

- **A word the glossary defines and the chapter never uses.** The list makes a
  promise in its own lead sentence -- "each is one sentence now and repeated in
  context below" -- and nothing checked it. Chapter 4 shipped eleven words of
  which two, `userspace` and `TBF`, appeared exactly once each: in the list.
  The chapter said "application" and "the header" everywhere it could have said
  them, so the reader was handed two words and never shown one in use. Both
  existing vocabulary rules pass that page. The `<dfn>` rule is bidirectional
  between the tags and the list, and the two agreed; the leaned-on rule asks
  whether a word used four or more times was ever defined, which is the other
  direction entirely. This one asks whether a defined word is ever used, and it
  is the easier of the two to get wrong, because a glossary is written before
  the prose that was supposed to need it. The first version looked only at the
  prose *after* the block, which is right for chapters 3 and 4, where the
  glossary is front matter, and wrong for chapter 1, whose list is a closing
  summary with nothing after it -- it reported all twenty-three of chapter 1's
  terms as unused. It reads the whole page outside the list now.

- **A word the series leans on and never defines.** The `<dfn>` rule is
  bidirectional but narrow: every term a chapter *marks* has to be in its
  glossary and vice versa. It says nothing about a word used constantly and
  never marked at all. Chapter 3 used `crate` fourteen times with its whole
  argument resting on it -- "what makes it legal there and illegal here is only
  which crate it sits in" -- and `process` twelve times, three chapters before
  the one that explains what a process is. Neither was defined anywhere, and
  both existing rules were satisfied, because an unmarked term is never
  required in a glossary. Any watched term used four or more times in a chapter
  must now be defined by that chapter or an earlier one. It found nine: chapter
  1 had never said what a kernel, an instruction, a processor, a crate or flash
  was, and chapter 2 had never defined RAM.

- **A control the script never reaches.** Chapter 3's Figure 8 shipped with
  three buttons, three panels, a correct opening state in the markup and no
  listener -- the one line binding them was never written. Every static check
  passed, because the markup was internally consistent: the opening state a
  script would have produced was already there. Only walking the figure in the
  behavioural suite caught it. Now a button that declares `aria-pressed` has to
  be reachable from the script, by its own id, by a prefix the script builds ids
  from, or by a class the script selects on. The first version of this check
  only knew about numeric suffixes and reported nine correctly-bound buttons in
  chapter 1, which build ids as `"opt-" + a word`.

- **A CSS rule the page never uses.** Chapter 2 was built by copying chapter
  1's stylesheet and deleting what it did not need -- 237 rules went, and 23
  survived with nothing left to style, plus three media queries left with empty
  bodies. None of it rendered wrong, which is exactly the problem: dead CSS is
  invisible until the sheet gets copied again for the next chapter, and then it
  is inherited rather than found. The check reads every class and id in a rule's
  selector and asks whether the page mentions it anywhere outside the `<style>`
  block, so a class the script alone adds still counts as used.

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
- **A foreground and a background set by the same rule.** The palette checks
  compare *tokens* against a list of pairings, so a rule inventing a pairing
  that is not on that list goes unseen. Two did in one day: a badge painted
  `--hot-ink` on `--hot` at 3.50:1, and before that `--surface` on
  `--rule-strong` at 3.34:1 -- the second introduced while fixing the first,
  which is what makes this worth automating rather than remembering. Where one
  rule sets both, no cascade analysis is needed to know the two will meet, so
  that slice is checked outright. A background inherited from an ancestor is
  still a manual check.
- **A figure that opens differently with scripting off.** A figure that
  declares an opening state declares it twice: in the markup, so the page reads
  without JavaScript, and in the script, which reproduces it on load. The
  behavioural tests only ever see the second, because the script has run by the
  time they look. So where a set of buttons and a set of panels inside one
  figure share suffixes, the pressed button and the shown panel must be the
  same one. That shape fits five of chapter 1's seventeen figures; most of the
  rest build their contents at load and so have no markup state to compare
  against, which is a different problem and the `<noscript>` note is what
  answers it. Figure 15 shipped with a listing whose opening line was not the one
  its panel explained, and only a screenshot caught it. Sets with no matching
  panels are left alone, since independent toggles are not a group; so are sets
  where nothing is marked shown, which is the other legitimate pattern --
  Figure 14's cases are all visible until the script puts four away, and
  Figures 1 and 2 mark nothing at all because reading un-highlighted suits
  them.
  This check spent a while narrower than it read. It recognised only `is-on`,
  while Figures 1, 2 and 3 spell selection `is-lit`, and it matched attributes
  positionally so that `class=` had to precede `id=`. Either one alone was
  enough to hide a moved boot state, and fixing only the first left the test
  mutation still escaping -- which is the argument for reintroducing a defect
  rather than reading the patch and being satisfied.
- **A button showing code that the shared button rule uppercases.**
  `button { text-transform: uppercase }` is right for labels and wrong for
  anything case-sensitive, and the `font:` shorthand resets neither it nor
  letter-spacing. It has bitten twice: glossary terms rendered as PIN, and
  Figure 5's first-digit buttons rendered `0X0` through `0XF` -- a capital X,
  in the one section teaching what the `0x` prefix means. Nothing else here
  could see it, and no screenshot had, because those buttons are not in the
  markup at all: the script builds them. So button classes are gathered from
  `<button class="...">` *and* from `className =` on anything
  `createElement("button")` returned, and a class whose rule asks for the
  monospace family -- which on these pages means it is showing code -- must
  say what happens to its case. The declaration is what is required, not a
  particular value, so a component that means `uppercase` may still say so.
  Two widenings since, each after the narrower version let a real one through.
  The font test alone missed the prediction options, which are set in the body
  face and shipped reading `0X02000000`, so the base class of every button the
  script builds must now declare its case whatever font it asks for. And a rule
  can dress buttons without naming a class they carry -- `.stray-seg button`
  styles Figure 17's addresses, whose own class list is empty -- so selectors
  are matched too, not only bare class names.
- **A group the script selects one of, that the markup does not.**
  `boot_state_checks` compares a pressed button against a shown panel and lets
  a group with nothing shown through, because that is a real pattern -- Figure
  14's cases are all visible until the script puts four away. That escape was
  too wide. Taking the opening class off Figure 17's first panel broke nothing
  anybody could see: the behavioural tests still passed, because the script
  sets it on load, and only the reader with scripting off was left with five
  equally dim paragraphs and no way to tell which one the page meant. What
  separates the two cases is the token. A *selection* token says one of these
  is current, so exactly one must carry it before any script runs; `is-off`
  hides things and implies nothing. So the prefixes are read out of the script
  -- `getElementById("stp-" + i)` followed by `classList.toggle("is-on", ...)`
  -- rather than guessed at. Figures 1 and 2 had to start declaring their
  opening state in the markup to satisfy it, which is a straight improvement:
  with scripting off they now demonstrate themselves instead of sitting inert.
  It does not reach a group addressed by literal id, nor one where several
  members are legitimately lit at once; Figure 2's `cat-*` is both.
  It also pairs each panel group with the button group that drives it, read
  off the adjacent `setAttribute("aria-pressed", ...)` in the same script.
  That is the same comparison the rule above makes, but it needs no container
  to do it -- which matters, because that one scans a `<figure>` at a time and
  three of this page's interactives are not inside one. Neither is any of them
  inside a `<section>`: the street table sits between two. A driver only
  counts if its own members carry `aria-pressed` and its suffixes cover the
  panel's, since without both tests it paired Figure 1's nine word buttons
  with its three zones, and Figure 4's bit ranges with the spans inside its
  buttons rather than the buttons.
- **A figure with nothing telling you what to do with it.** The chapter's own
  rule is an imperative over each figure and a "Notice that" under it, and
  fifteen of seventeen followed it -- the rule lived in a note, so nothing
  noticed the other two. That line is what tells a reader a drawing is a
  control at all; Figure 13's only instruction sat *inside* its outcome box,
  below the tabs it never mentioned. Only the `instrument` figures are
  required to carry one: the two plain `svgfig` drawings have no controls, and
  demanding a line over those would be the gate failing correct work.
- **An assertion that cannot fail.** `chk("no answer is on screen before the
  reader commits", true, true)` sat beside a loop that threw on failure, so the
  throw was the real check and the `chk` was decoration -- but it counted
  toward the suite total and read, in a list of passes, exactly like coverage.
  Any `chk` whose expected value is its actual value is refused, whether that
  is a repeated literal or the same expression written twice. This is the same
  argument as a check that has never failed: it is worse than nothing, because
  it looks like something. It also refuses a ternary whose two arms agree --
  `REG["x"] ? true : true` walks straight past an identity test, and was
  written within the hour by the person who had just added one.
- **A chapter with no sources and no licence.** Chapter 2 shipped without
  either. The section was inserted by a string replacement whose anchor did not
  match, which silently did nothing, and nothing downstream noticed -- the page
  passed every check and every assertion it had. Two promises broke quietly:
  the series tells its reader that every claim on a page is checked against
  source, and the licence footer is one of four places this content's licence
  is stated, alongside `LICENSE`, this file and `.lcignore`. Every chapter must
  carry both.
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
   A chapter's own name is not running prose, and counting it made this rule
   refuse correct work: chapter 4 is called "What a Process Is", so `process`
   appeared at character 21 of what the scan called prose, several hundred
   characters before the glossary that defines it. `<title>` is never rendered
   in the page at all and `<h1>` is the masthead, so both are now cut before
   the scan; chapters 5 and 7 are titled the same way and would have hit it
   too. Everything else in the masthead -- the eyebrow, the standfirst -- is
   prose a reader reads, and still counts, which a mutation confirms: put a
   bare `process` in chapter 4's standfirst and the rule fires again.
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
4. At most 20% of the prose may be reachable only by clicking, counted two
   ways. Chapter 3 shipped 33 panels with `is-off` already on the element, so a
   reader with JavaScript off lost 1,018 words -- 26.6% of the chapter -- while
   this rule reported roughly nothing, because it only looked inside script
   strings and chapter 3 keeps its sentences in the markup, as the rule says to.
   Chapters 1 and 2 ship every panel showing and let the script put the others
   away, so a reader with no script meets all of them; markup that ships hidden
   now counts against the same limit. The script-string half is measured by
   tokenising the literals rather than matching them with a regex: a pattern that only accepts literals over some length
   skips the short ones, and skipping one desynchronises the scan, so the
   closing quote of a literal pairs with the next opening quote and the code
   between them -- comments included -- gets counted as prose. Quotations,
   diagram labels and the sources list are exempt from the sentence limits: a
   datasheet quote cannot be rewritten to suit a house style. That exemption
   had never once applied. It matched `<div class="sources">` and every chapter
   writes `<section class="col sources">`, so the sources list was being held
   to the prose limits all along; chapters 1 to 3 happened to keep every bullet
   short enough that nobody found out. Chapter 4 cites a Makefile target
   against a README naming a different one, which cannot be said in thirty-four
   words, and that is what surfaced it.

**Behavioral checks**: the page's own `<script>` is executed headlessly under
JavaScriptCore against the DOM shim in `tools/harness.js`, then the chapter's
assertions run against the resulting state. The shim is handed what the markup
already contains before any script runs -- every `value=` attribute, and every
id'd element's text -- because a browser would. Without the second of those,
the only content any assertion could reach was content the script had written,
which is precisely the content these pages are written to avoid having: the
rule here is that the markup holds the sentences and the script only moves
highlights. Figure 13 restores its idle prompt by reading it back off the
element, and against an unseeded shim that reads as empty. The seeding covers
the markup's classes and its other attributes too, and decodes entity
references the way a parser does -- Figure 17 keeps its readout lines in
`data-moved`, and undecoded they printed a literal `&mdash;` onto the page.
A range input also clamps what you assign it, so the shim does: 8 into a
`max="7"` scrubber left Figure 9 reporting "9 of 8" with no step highlighted,
a position the control cannot reach. The shim deliberately copies the
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

**Promise checks**, across chapters rather than within one, read from
`promises.json`. A chapter that says something about another chapter has made a
claim somebody has to keep, and two of the three findings in chapter 2's third
review pass were exactly that: chapter 1's Figure 6 promised "Chapter 2 opens
them up" of the two things sharing the first kilobyte of flash, and chapter 2
opened one of them; Figure 7 told the reader all six instructions were ones
they had already met, and one appears nowhere else in the series.

That risk grows with every chapter. Chapter 2 makes fourteen claims about what
chapter 1 says, and chapter 1 was rewritten heavily after chapter 2 was
drafted -- seven passages converted from prose into tables, ten openings cut.
Any one of those edits could have removed a sentence chapter 2 cites, and
nothing would have said so.

The gate is deliberately narrow, because the wide version would be a lie: no
check can read a chapter and decide whether a debt has been honoured. What it
does enforce is the bookkeeping.

- **Every cross-reference is written down.** The scan reads the prose *and*
  every string literal in the script, which is the half that matters: both
  findings above were panel text, invisible to anything looking at markup
  alone. An unlogged reference fails the build.
- **The pattern over-matches on purpose.** It takes any "chapter *N*", and
  also bare "later", "for now", "not yet", "you will see". A regex sharp
  enough to tell "chapter 5 covers this" from "come back an hour later" is
  also sharp enough to drop a real promise silently, and silent is how chapter
  2 shipped with no sources section at all. A false match costs one ledger
  line and a written reason; a missed one costs a broken promise nobody sees.
  Entries with `"about": null` must say `"why"`.
- **The quoted line must still be on the page.** Rewrite the sentence and its
  ledger entry goes stale and fails, which is the moment to re-read what it
  was promising.
- **A chapter that has shipped must contain what its creditors were told.**
  `kept_by` is a substring the owing chapter has to carry. It proves the topic
  is present, not that the argument lands -- the judgement stays with the
  author, the bookkeeping does not.
- **Debts owed by chapters that do not exist yet are printed, not failed.**
  `preflight.sh` surfaces them, because that list is the specification the
  next chapter gets written against. Chapter 3 currently owes four.

A chapter naming its own number is identifying itself, not referring to
anything, and is skipped.


### Looking at it

None of these checks can see the page. To actually render one on macOS:

```
qlmanage -t -s 1100 -o . learning/ch01-everything-is-memory/index.html
```

QuickLook runs the stylesheet but **not** the JavaScript, so this shows the page
as a reader with scripting disabled would meet it -- which is worth seeing in its
own right. It caught a readout value clipped inside its cell, and several figures
rendering as empty colored boxes, neither of which any static check noticed.

That is only half the page, though. Seven of chapter 1's seventeen figures build
their contents at load, so QuickLook shows them as empty boxes, and for several
review rounds the only way to look at one was to hand-write a fixture by reading
its builder. That got done once, for one figure, and that one round found a
shipped bug. `tools/fixture.py` does it for all of them:

```
learning/tools/fixture.py ch01-everything-is-memory \
    --isolate ladder --theme light --out /tmp/f.html
qlmanage -t -s 1100 -o /tmp /tmp/f.html
```

It runs the page under the same shim and the same bundle `check.py` uses for the
behavioural checks -- literally the same function, because two assemblies of it
drifted once already -- then serialises the DOM the page built and splices it
back into a copy of the markup.

Every option is there because it is a step that was otherwise re-derived, and
got wrong, each time somebody rendered something. `--isolate ID` frames one
figure; give it an *id*, because a class silently hides the whole page and you
get a blank square. `--theme light|dark` forces one, which is not cosmetic:
QuickLook follows the system appearance, so on a machine set to Dark an
unmodified copy is not the light view, and two "both themes" renders come back
byte-identical. `--phone` re-emits the narrow-width rules as plain rules, since
QuickLook does not fire media queries and narrowing the wrapper proves nothing.

`--click ID`, repeatable, fires clicks before dumping. The boot state is what
most readers see but rarely what teaches -- the race figure only makes its point
once it has been run to the end. With clicks the markup is *supposed* to be out
of date, so the live classes, attributes and disabled states are written back
too, and text is replaced wherever the script actually changed it. Without
clicks only the empty containers are filled, deliberately: overwriting an
element the markup already words correctly would hide exactly the disagreement
`boot_state_checks` exists to catch.

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
- `make format-check` is Rust-only, and it is two checks rather than one. A
  chapter may ship a `.rs` file so that a figure showing compiler output can be
  reproduced -- chapter 1 has `optimizer-demo.rs`. Nothing under `learning/` is
  a workspace member, so `cargo fmt --check` never reaches it; but the second
  half of `tools/ci/check_format.sh` scans every tracked `.rs` file for tab
  characters with `git grep`, and that does reach it. Keep chapter sources
  tab-free, and run `rustfmt --check` on them by hand, since nothing in CI
  will. `learning/.gitignore` keeps the `.s` output of building one out of the
  way.
- `tools/ci/check-for-readmes.sh` only fires on directories containing a
  `Cargo.toml`; there are none here.
- `tools/ci/toc.sh` runs `markdown-toc` over every Markdown file carrying that
  tool's insertion marker, and nothing here carries one. Note that it selects
  files with a plain `grep`, so *writing* the marker into a file -- to describe
  it, say -- is enough to make the script pick that file up, insert a table of
  contents into it, and then report it as out of date. That is why this bullet
  does not spell the marker out. Every other file in the tree that matches has
  a matching stop marker and a real table of contents; this one had the opening
  half and nothing else, which would have failed CI on any machine where
  `markdown-toc` is installed.

### Before committing

Run everything that can be run:

```
learning/tools/preflight.sh
```

That is the chapter gate, Tock's licence checker, `cargo fmt --check`, the tab
scan that reaches chapter sources even though `cargo fmt` does not,
`check-for-readmes.sh`, a check that nothing here carries markdown-toc's
insertion marker, and `rustfmt --check` on any `.rs` a chapter ships.

Then the part no script can do. Every item below is here because skipping it
let a real defect reach a commit in this repository, and the list is ordered so
the cheapest come first:

1. **Render every state you changed** -- both themes, and once at phone width.
   A figure's opening state shipped wrong twice and only a screenshot caught
   it. Remember that QuickLook does not run scripts, so what it shows is the
   no-JavaScript reader's view; strip the `<noscript>` block from the preview
   copy to see the ordinary one.
2. **Read back the accessible name of every control you touched.** An
   `aria-label` replaces content rather than adding to it, and a figure once
   announced its own label forever instead of the digit it existed to show.
3. **Measure every colour pair your change paints.** `check.py` now catches a
   foreground and background set by one rule, but a background inherited from
   an ancestor is still yours to check by hand.
4. **Read the changed prose in order, as a reader.** Four passes of inspecting
   markup missed a hint pointing at a code block that had been deleted, and a
   sentence contradicted forty paragraphs later by the same chapter.
5. **Sweep for what your change may have stranded**: prose that says "above" or
   "the listing" or "the table"; class names now used by two components;
   absolutes like *exactly*, *always*, *never*, *any ... you will ever*.
6. **Mutation-test what you added.** For an assertion, break the code and see
   it fail. For a *check*, put the defect back first -- a checker's lines are
   silent on a healthy page, so mutating one against clean input proves
   nothing. A check that has never failed has never been tested.
7. **Run whatever the page quotes.** Figure 14's listings are compared against
   a real compile on every gate run because they once drifted; anything else a
   chapter claims to have run, run.

Run `make prepush` from the repository root too, if you have touched anything
outside `learning/`.

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
