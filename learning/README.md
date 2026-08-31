<!-- Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License. -->
<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
<!-- Copyright Jon Hillesheim 2026. -->

# Learning Tock from the Ground Up

An interactive companion to the [Tock Book](https://book.tockos.org/), for
people learning microcontrollers and the Tock kernel on a Raspberry Pi Pico 2
or Pico 2 W -- a board the official book does not cover.

Each chapter is a self-contained, interactive HTML page. Every technical claim is
checked against this repository and cited by file, with the line and the commit
wherever a chapter's argument turns on a line, so a reader can verify rather
than trust.

## What this is, and what the book is

The Tock Book is the project's own documentation. It is the right place for
installing the toolchain, writing applications, the guided courses, and the
reference specifications, and this series does not repeat any of it. Each
chapter names the book page it sits beside.

Two things are missing there. The first is the board: the book's guided
material is built around an nRF52840DK, and its getting-started list names five
boards -- Hail, imix, nRF52840dk, Arduino Nano 33 BLE, BBC Micro:bit v2 --
under a line reading "As of February 2021". A search of all 127 pages for
`pico`, `rp2040`, `rp2350` or `raspberry` returns nothing. Everything here runs
on hardware you can buy for about ten dollars.

The second is mechanism. The book states how Tock is built; these pages take
one instruction, one register, one refused write, and let you drive it until
the reason is obvious. Chapters 1 and 2 have no counterpart in the book at all:
`read-modify-write` appears nowhere in it, and every use of the word "volatile"
except two lines in `development/code_size` means non-volatile *storage* rather
than a compiler's treatment of a register.

## Chapters

Nine. Chapter 1 asks one question -- any code can write any address -- and each
chapter after it answers part of that. The last one lands on grants, which is
the last mechanism chapter 1 names, so the arc closes where the first chapter
said it would.

Chapter 0 sits outside that arc and answers nothing in it. It is the hands-on
chapter the other eight had been assuming rather than teaching: chapter 8 ends
by telling the reader to run `make flash-openocd`, and until chapter 0 the
series never said how to reach the point where that command works. It is
optional, and it says so on the cover.

| # | Title | Covers | Beside, in the book |
|---|-------|--------|---------------------|
| 0 | [Getting It Running](ch00-getting-it-running/) | Tock on a chip you can hold: build it, put it there with one command, three wires to make it talk -- and which two of this board's four flashing routes fail without saying so | [getting_started](https://book.tockos.org/getting_started) -- five boards, no Pico |
| 1 | [Everything Is Memory](ch01-everything-is-memory/) | One `str` instruction to 3.3 V on a pin, and why, before anything later introduces a protection, nothing stops it landing anywhere | nothing on this |
| 2 | [Registers Are Not Variables](ch02-registers-are-not-variables/) | What a read gives back, what the compiler does to a loop that polls, and what the second processor does to your value while you are holding it | nothing on this |
| 3 | [How Code Starts Running](ch03-how-code-starts-running/) | Power-on to `main()`: where the processor looks for its first instruction, what the boot ROM hunts for in the kilobyte ahead of the kernel, and what "initialize RAM" means | [doc/startup](https://book.tockos.org/doc/startup) |
| 4 | [What a Driver May Touch](ch04-what-a-driver-may-touch/) | Capsules and HILs: a driver that cannot reach hardware it was not handed, enforced by the type system rather than by the chip -- and the three things it can still do to you anyway | [doc/design](https://book.tockos.org/doc/design), [development/hil](https://book.tockos.org/development/hil) |
| 5 | [What a Process Is](ch05-what-a-process-is/) | Code the compiler never saw: sixteen trusted bytes at the front of an application, a walk through flash that ends when a header stops parsing, and a slice of RAM with the kernel's own record of the process hidden at the top of it | [doc/processes](https://book.tockos.org/doc/processes), [doc/tock_binary_format](https://book.tockos.org/doc/tock_binary_format) |
| 6 | [The Memory Protection Unit](ch06-the-memory-protection-unit/) | The hardware that checks every address a process touches: two registers per region, eight regions, a 32-byte size rule, and the six steps from a refused store to a stopped process | [course/root-of-trust/userspace-attack](https://book.tockos.org/course/root-of-trust/userspace-attack) |
| 7 | [Asking the Kernel](ch07-asking-the-kernel/) | One instruction out: eight classes of request in four registers, the same eight words carrying the answer back, and how a buffer crosses a fence built to stop exactly that | [doc/syscalls](https://book.tockos.org/doc/syscalls), [TRD104](https://book.tockos.org/trd/trd104-syscalls) |
| 8 | [Grants](ch08-grants/) | How a driver keeps per-process state inside the process's own memory, bounded, with no allocator: seventy-six bytes for a console, cut from the top downward, and not freed until the process exits | [doc/syscalls](https://book.tockos.org/doc/syscalls), [development/syscall](https://book.tockos.org/development/syscall) |

## The cover

`learning/index.html` is the front door: chapter 0 and then the eight in
dependency order, what the series is for, and how to check a claim rather than
believe it.
A clone gets working links because it links by relative path.

The published copy links to hosted chapters instead, and those URLs are
addresses on an account rather than part of a CC BY-SA work, so they are not in
this branch. `learning/tools/mkindex.py` substitutes them from an ignored
`tools/artifact-urls.json` and refuses to write anything if a single link would
land dead -- a set with one dead entry is worse than none, because it looks
complete.

    python3 learning/tools/mkindex.py /tmp/publish

It emits the whole set, not just the cover: since the chapters link to each
other and back to the cover, every page has hrefs to substitute and the cover
needs a URL of its own. On a static host none of this applies -- the relative
links are already right, and the build is `cp -r learning/ .`

## The book

Nine artifacts is nine URLs, nine share pins and nine republishes for one
change. `learning/tools/mkbook.py` binds the whole series into a single page
instead, where each page is a `[data-page]` section and a small router shows
one at a time:

    python3 learning/tools/mkbook.py /tmp/book.html

**The source is not touched and does not become a build product.** `check.py`
still runs against the nine files and every review pass still describes them.

Three things have to be reconciled to put nine standalone pages in one DOM,
and each of them is a way the book could be quietly wrong:

- **Ids collide** -- 104 of the series' 983 are declared on more than one page,
  and `qo-` means one thing in chapter 1 and another in chapter 3. Every id in
  the markup is prefixed with its page's key.
- **The scripts are left alone.** They get a `document` that adds the prefix for
  them. Rewriting them was tried twice and is a trap both ways: by value it
  moves a literal that is a *suffix* rather than an id, so chapter 1's
  `getElementById("btn-" + k)` over a list of words that are also ids asks for
  `ch01--btn-ch01--pin`; by call site it misses every figure, because the
  chapters pass their prefixes into one `group()` helper whose lookup names a
  variable. Nothing in the series creates an id at runtime, so wrapping the
  four `document` members they use is exact.
- **An ARIA attribute holding an id is the exception**, because it is written
  onto an element rather than looked up. Chapter 1 sets `aria-labelledby` from
  bare ids; in the book those name nothing, and the panel loses its accessible
  name. Those values are prefixed at the call site, and the build refuses if
  any `aria-*` target does not resolve.

**The build proves itself.** It runs all ten pages' own assertion suites
against the assembled book -- 1734 of them -- with a `REG` and a `document`
scoped to each chapter, and writes nothing if any fails. Two compare an ARIA
target whose value must now carry the prefix, and are counted rather than
failed. `preflight.sh` runs the whole thing.

The cover is outside that: it has no suite, and its script uses a
`document.querySelector` the shim does not implement. It is checked by eye.

**What the cover is for, beyond navigation.** It is the only file that
duplicates information: every chapter's number, title and place in the order
appear both in the chapter and on the cover. `index_checks` in `check.py`
exists because duplicated information goes stale -- it fails if a chapter has
no entry, if an entry points somewhere that is not a chapter, if the visible
chips and the `data-needs` attribute disagree, if a chapter claims to depend on
a later one, if the cover renames a chapter, or if the cover pins a commit some
chapter does not cite. That last one is not hypothetical: the first draft of
the cover claimed all seven chapters sat on `08894c2e0` while chapter 1 sat on
`47287a64e`. They agree now. Adding a Pico 2 W board crate meant re-pinning
every chapter to one commit that contains it, which closed the split as a side
effect.

**Why those seven and not the five chapter 1 promises.** Chapter 1 commits to
itself, to chapter 3 by name, and then to three more in a single clause:
"capsules, the memory protection unit, and grants -- and each one gets its own
chapter". Two of those three cannot be written as promised. `kernel/src/grant.rs`
describes grants as allocating "memory from a process to hold state on the
process's behalf", out of a region inside that process's own memory, and they
hold the upcalls and allowed buffers that syscalls create. So grants need
processes and syscalls underneath them, and the MPU needs processes -- it is
what it fences. Chapters 5 and 7 are those missing prerequisites; nothing in
chapter 1 promised them, and without them chapters 6 and 8 have no ground to
stand on.

**Reading order is dependency order.** 3 needs 1 and 2. 5 needs 4. 6 needs 4
and 5. 7 needs 3, 4 and 6. The MPU deliberately comes before syscalls: meet the
wall, then find the door, which is the same shape as letting the read-modify-write
race lose a pin before the atomic register is offered.

**Units.** After a numeral it is `kB`; spelled out it is "kilobyte". Chapter 1
shipped `KB`, chapter 3 spells it out throughout, and chapter 5 arrived with a
third spelling before this was written down -- three conventions for one unit
across four chapters, which is what a cross-chapter notation pass is for.

**Size.** Chapter 7 is the longest of the later chapters -- 9 figures, and
about a fifth more words than chapter 6 by the same measure. Chapter 8 lands
between them at 7,100 and 9 figures, which is where a closing chapter should
sit: it introduces one mechanism and spends the rest of its length paying off
eight promises made by four earlier chapters. Some of that is
the subject: it is the only chapter that has to teach a calling convention,
which means naming four registers three times over. Some of it is not, and a
review pass should ask which. Chapter 5 came out at 12 figures against the 8 to
10 below, which is the target doing its job rather than failing: three of those twelve were added
by review passes, and each one replaced a section that was prose only on the
skim path. Chapter 6 landed inside it first time, at 4,800 words and 9 figures,
which is what a chapter looks like when the vocabulary is already there. Chapter 1 runs to about 10,900 prose words across 17 figures, and is
the outlier on purpose -- it defines the vocabulary from nothing and has no
chapter to lean on. Later chapters inherit that vocabulary and should be roughly
half: aim under 6,000 words and 8 to 10 figures. Nothing enforces this; it is a
target to notice blowing past, not a gate.

All seven are groundable on the hardware in front of the reader -- a Pico 2 and
a debug probe -- because `boards/raspberry_pi_pico_2` is a real port in this
tree and every chapter can cite it. Chapter 0 is the one that actually puts it
there, and it is the only chapter whose claims are about commands rather than
about source, which is why it is the only one that needed a bench to verify.

**That bench ran on 2026-08-29**, on a Pico 2&nbsp;W with a Raspberry Pi Debug
Probe, flashed from a Raspberry Pi over SWD. The route works: OpenOCD reported
`SWD DPIDR 0x4c013477` and both Cortex-M33 cores, programmed the kernel, and
the banner arrived on the console as the board reset. Five things were wrong
and are fixed -- the debug connections are a header labelled `DEBUG` rather
than pads on an edge, `list` prints a header rather than nothing, `verify_image`
is silent on success, the debug connector carries no power and the chapter
never said the board needs its own, and the not-found message is now quoted
rather than paraphrased. One claim could not be run: what a *Mac* calls the
probe, since the bench drives it from the Pi. The chapter says so.

**Which board that is.** `boards/raspberry_pi_pico_2` is the plain Pico 2. This
tree has no `raspberry_pi_pico_2_w`; the `_w` board it does have is built on
`chips/rp2040`, an earlier chip. The series cites the plain crate throughout and
says, in the chapter where it costs something, what a wireless board does
differently -- chapter 1 for GPIO 25 being the radio's chip select rather than
the LED, chapter 4 for the panic blink landing there, chapter 5 for which crate
`make program` flashes. A new chapter that reaches for hardware owes the reader
the same sentence.

## The reading order, carried by the chapters

The cover used to hold the order alone. Every chapter was a standalone page
with no link to any other -- chapters 4 to 8 had no `<a>` on them at all -- so
a reader who arrived at one directly had no way on and no way back, and the
cover was the only thing that could be handed to somebody.

Each chapter now carries three links:

- **`.runback`**, in the running head under the eyebrow, back to the cover.
- **The next chapter's title**, on the card that was already at the foot of
  every chapter, which had been written and styled but never linked.
- **`.pager`**, under that card: back one chapter, and out to the cover.
  Chapter 8 has no card to link, because there is no chapter 9.

**The cover is a page in the order, not a table of it.** It links down into all
nine chapters, and for a while nothing linked it *forward* -- so the one page
holding the reading order was the only page not in it, and chapter 1's row was
the odd one out, with an empty left slot. What is behind chapter 1 is the
cover. So the cover carries a `.begin` card at its foot, where a chapter's
next-card sits, and chapter 1's pager goes back to it: `&larr;&nbsp;Contents`,
one link and no separate Contents beside it, which would be the same link
twice. The chain runs cover to chapter 8 with no special case in it.

Every href is relative, so a clone reads exactly as a static host does, and
`mkindex.py` is what rewrites them for a host where neither path exists.

The `.begin` card links chapter 1 a second time, on purpose -- it is the page
turn, not an eighth contents entry. `index_checks` counts entries from the
contents list with that card cut out, because a chapter appearing twice *in the
list* is a real defect and this is not that.

`nav_checks` in `check.py` guards this. That the order is written down at all
is what makes it need guarding: it lives on the cover, and now seven more times
in hand-written links one directory deeper, which is the shape of every drift
this branch has had. So no link is trusted -- each is resolved against the
chapter directories that exist and against the position of the page it is on,
and the label is checked too, because a link whose href moved and whose text
did not is worse than a broken one.

**A navigation label is not a promise, and the ledger does not hold it.** A
pager reading "Chapter 3" says where it goes, not what the page claims, so
`_without_nav` cuts these controls out before the promise ledger and the
pedagogy limits see the page -- the same reason `<title>` and `<h1>` are
already cut out of both. This is not the reference going unchecked: resolving a
link against the directories is stricter than the ledger's test, which only
asks whether a quoted sentence is still somewhere on the page.

## Why this lives in the Tock repository

The chapters cite kernel source by file, and by line where the line is the point. Keeping them in a branch of the
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

This runs three kinds of check against every chapter -- static, pedagogy and
behavioral -- then one on the cover, one on the links between the chapters, and
two across the chapters together, and exits non-zero if any fails, so it can
gate a commit.

**Static checks** on the page: duplicate ids, unbalanced tags, JavaScript
reaching for ids that do not exist, CSS variables used but never defined, and
color literals outside the theme token blocks -- that last one being the usual
way a page ends up unreadable in one of the two color schemes.

Twenty-seven more static checks exist because each caught a live defect. Keep the
count above honest when adding one; it has now said the wrong number twice:

- **A byte count a figure printed without compiling anything.** Chapter 8's
  whole argument is a number: what one driver costs one process. The first
  version of that number was 72, arrived at by adding up the field widths of
  the three slot types and the driver's own struct -- and wrong, because
  `grant_size` begins with a counters word that nobody adding up slots would
  think to include. The answer is 76. So the chapter ships `grant-sizes.rs`,
  which transcribes `grant_size` rather than approximating it, and the gate
  compiles it for the board's target with the toolchain `rust-toolchain.toml`
  pins and reads the answers out of the object file. The check runs from the
  probe to the page: the totals the probe produces have to be somewhere on the
  page. The reverse -- sweeping every number the page spells and demanding the
  probe made it -- was written first and failed correct work immediately, since
  "forty bytes" of gap and "twelve drivers" are not claims about a grant's
  size. Both forms need a boundary a hyphen does not satisfy: `76` sits inside
  the citation `:376-396` on that very page and `twenty` sits inside
  `twenty-four`, and matching either was enough to pass a page that had stopped
  saying the number at all.

- **A citation whose line number is not in the file it resolves to.** The
  sources lists say "the same file" a lot, because repeating a path for every
  line of one function is noise. That works until a bullet names two files:
  chapter 7's names `kernel/src/kernel.rs` and then the board crate, and the
  "the same file, :903-911" under it therefore pointed at a 481-line file. The
  lines it meant are in `kernel.rs`. Three review passes verified every
  citation on that page and none of them caught it, because each verified from
  a list with explicit paths -- the chain was never the thing under test, and a
  reader following the bibliography is the only one who would ever have hit it.
  Each `:N` now resolves back to the last path actually named and the tree is
  asked, at the chapter's own pinned commit, whether that file has an Nth line.
  A bare basename counts as a path if the full one appeared earlier in the same
  list, which is a reader-followable abbreviation and the thing chapter 6 does
  six times after giving `arch/cortex-m33/src/mpu_v8m.rs` once; a basename
  nothing introduced is not. What it does not check is whether the line *says*
  anything in particular -- that stays a review lens. Skipped where git or the
  pinned commit is unavailable.

- **A chapter's summary of another chapter.** Only a closing chapter has this
  problem, and chapter 8 has it badly: its last figure walks all eight chapters
  in one panel each, and four of the eight were wrong on the first draft --
  written from memory about pages that were not open. It said the chip is wired
  to fetch the first instruction, where chapter 3's headline is that the first
  instruction is never yours. It credited the type system with a refusal
  chapter 4 attributes to a crate-level `forbid`, having said outright that
  this is the half the type system does not cover. It said the kernel cannot
  check a process, where chapter 5 spends a figure on the sixteen bytes it does
  check. And it quoted chapter 1's closing sentence with a clause chapter 1
  does not have. There is no gate for this: the check is to open the chapter
  being summarised and read what it says. `RETIRED_PHRASES` holds the four
  wrong ones so they cannot come back.

- **A halfword a figure printed without assembling it.** The sibling of the
  Rust one below, for chapter 7, whose whole opening rests on `svc N` being
  `0xDF00` with N in its low byte -- which is why the class of a request is the
  one part of it a runaway pointer cannot touch. `syscall-demo.s` ships beside
  that page and `arm-none-eabi-as` runs on it, and then every line of the
  listing is checked halfword-and-instruction together, and every bare
  four-digit hex halfword anywhere on the page has to be one the assembler
  actually emitted. What that cannot reach is a *pairing* printed away from its
  instruction, which is how Figure 1's readout works, so `ch06.tests.js`
  re-derives that arithmetic from the button's own label instead. Skipped where
  the cross-assembler is not installed.
  A gate that skips when its input is missing has to be sure the input ships,
  and this one nearly did not: `learning/.gitignore` ignores `*.s`, because
  following chapter 1's build line drops one beside `optimizer-demo.rs`, and it
  swallowed chapter 7's source the first time it was committed. Nothing noticed
  -- the page cited a file that would not have been in the clone, and the check
  would have skipped in silence on every machine but this one. It now refuses
  outright if git ignores its own input. The file also carries Tock's licence
  rather than the series' CC BY-SA, which is what `learning/.lcignore` says a
  demo source should do, and its comments start with `#` rather than the `@` of
  ordinary ARM assembly: the licence checker reads a file through a syntax
  highlighter that does not know `@` begins a comment there, and a header it
  cannot see is a header that is missing.

- **A sentence laid out as a flex row.** `display: flex` makes a flex item of
  every direct child, an `<em>` in the middle of a sentence included, and `gap`
  then puts space on both sides of it. The words after it are a separate item
  too, so the punctuation drifts away from what it belongs to. The instruction
  line over every interactive figure has been a flex row since chapter 1, which
  shipped Figure 13's "then try *the hardware's way* ." with the full stop half
  a rem adrift and kept it through every review pass of every chapter -- nothing
  here can see layout, and nobody re-rendered a figure that already worked.
  Chapter 7 found it by putting an `svc 2` in one. Six lines across four
  chapters were affected. The check is narrow twice over: it wants a direct
  inline child with words on *both* sides of it, because words on one side only
  is the badge-and-label idiom that chapter 1's roadmap chips are built on; and
  it only looks at tags that promise prose, because a `<div>` laid out as a row
  of terms is doing its job -- chapter 1's fill-in-the-blank equations are
  `base [addr] + offset [addr] =` in monospace and want their even gaps. A
  sentence written into a `<div>` still escapes it.
  One thing this cost: the stylesheet comment explaining the fix originally
  named the offending tags as markup, and the tag-balance check counts what a
  comment says, so all six chapters failed on one unclosed `code`.

- **A phrase a review pass removed, back on the page.** Chapter 6's second
  chapter-2 collision, `block`, was struck from six places in its first review
  pass and survived in two source-list bullets, because that pass read the prose
  and not the citations. `RETIRED_PHRASES` is a per-chapter list of phrasings a
  pass deliberately removed, checked against the markup only -- the CSS says
  `display: block` legitimately, and a negative assertion legitimately names the
  phrase it forbids. Adding a line to that list is only allowed once the phrase
  is actually gone, so the gate proves itself the moment it is written.

- **A stylesheet comment with no rule under it.** `dead_css_checks` finds a rule
  with no markup and has nothing to say about a comment with no rule. Ten of
  these were inherited across chapters 1 to 5, describing rules deleted when a
  chapter pruned what it did not use -- including one that survived chapter 4's
  five review passes. Section banners (`/* ---- name ---- */`) are exempt,
  because heading a section rather than a rule is their job. Beware the fix:
  removing the same comment text from five chapters at once deleted two correct
  ones, where that comment really did head `.note`.

- **An assertion naming the figure its element used to be in.** Fixing the
  bullet below meant renumbering all twelve of chapter 5's figures. The page
  came out right and every assertion still passed, because the suite addresses
  elements by id and an id carries no number -- so eight assertion descriptions
  were left naming the old figure. A suite that reads correct, runs green, and
  tells you the wrong thing about the page it guards is worse than no
  description at all. Two shapes are checked, both of which name the element's
  own figure by construction: a `walk()` label and a "figure N opens ..."
  description. An assertion that deliberately points at a different figure is
  left alone.

- **A figure numbered out of order.** Chapter 5's third review pass inserted a
  figure after Figure 4 and numbered it 12, which is what the last label had
  been. Every cross-reference on the page still resolved, all 138 assertions
  still passed, and the number was correct in the narrow sense that it named
  exactly one figure -- it just sat fifth. Only rendering it caught that, and
  only because `fixture.py` picks figures by position rather than by label.
  Labels must now read 1..N down the page.

- **A word the glossary defines and the chapter never uses.** The list makes a
  promise in its own lead sentence -- "each is one sentence now and repeated in
  context below" -- and nothing checked it. Chapter 5 shipped eleven words of
  which two, `userspace` and `TBF`, appeared exactly once each: in the list.
  The chapter said "application" and "the header" everywhere it could have said
  them, so the reader was handed two words and never shown one in use. Both
  existing vocabulary rules pass that page. The `<dfn>` rule is bidirectional
  between the tags and the list, and the two agreed; the leaned-on rule asks
  whether a word used four or more times was ever defined, which is the other
  direction entirely. This one asks whether a defined word is ever used, and it
  is the easier of the two to get wrong, because a glossary is written before
  the prose that was supposed to need it. The first version looked only at the
  prose *after* the block, which is right for chapters 4 and 5, where the
  glossary is front matter, and wrong for chapter 1, whose list is a closing
  summary with nothing after it -- it reported all twenty-three of chapter 1's
  terms as unused. It reads the whole page outside the list now.

- **A word the series leans on and never defines.** The `<dfn>` rule is
  bidirectional but narrow: every term a chapter *marks* has to be in its
  glossary and vice versa. It says nothing about a word used constantly and
  never marked at all. Chapter 4 used `crate` fourteen times with its whole
  argument resting on it -- "what makes it legal there and illegal here is only
  which crate it sits in" -- and `process` twelve times, three chapters before
  the one that explains what a process is. Neither was defined anywhere, and
  both existing rules were satisfied, because an unmarked term is never
  required in a glossary. Any watched term used four or more times in a chapter
  must now be defined by that chapter or an earlier one. It found nine: chapter
  1 had never said what a kernel, an instruction, a processor, a crate or flash
  was, and chapter 3 had never defined RAM.

- **A control the script never reaches.** Chapter 4's Figure 8 shipped with
  three buttons, three panels, a correct opening state in the markup and no
  listener -- the one line binding them was never written. Every static check
  passed, because the markup was internally consistent: the opening state a
  script would have produced was already there. Only walking the figure in the
  behavioural suite caught it. Now a button that declares `aria-pressed` has to
  be reachable from the script, by its own id, by a prefix the script builds ids
  from, or by a class the script selects on. The first version of this check
  only knew about numeric suffixes and reported nine correctly-bound buttons in
  chapter 1, which build ids as `"opt-" + a word`.

- **A CSS rule the page never uses.** Chapter 3 was built by copying chapter
  1's stylesheet and deleting what it did not need -- 237 rules went, and 23
  survived with nothing left to style, plus three media queries left with empty
  bodies. None of it rendered wrong, which is exactly the problem: dead CSS is
  invisible until the sheet gets copied again for the next chapter, and then it
  is inherited rather than found. The check reads every class and id in a rule's
  selector and asks whether the page mentions it anywhere outside the `<style>`
  block, so a class the script alone adds still counts as used.
  Classes and ids were the whole of it until chapter 5's second review pass,
  which left a rule made only of element names invisible. `.selfcheck details`,
  `.selfcheck summary` and `summary:focus-visible` rode from chapter 1 into
  chapters 4 and 5, neither of which contains a `<details>` anywhere, and the
  comment above them asserted they were "still load-bearing" -- which is how
  they survived five review passes of chapter 4. A tag named in a selector must
  now appear in the markup too. The test is deliberately narrow: only element
  names occurring nowhere on the page are refused, so `p` and `button` are
  never in question, and `html`, `body` and `head` are exempt because a browser
  creates them whether or not the file writes them. On first run it found
  twenty-five more rules across chapters 3, 4 and 5 -- `strong`, `a`,
  `input[type="range"]`, `.next ol`, `.instrument-body svg` and the rest.
  One of them was not dead but misdirected: `.goals ol` has said `ol` since
  chapter 3 and every chapter after the first writes `<ul>`, so the flex layout
  and the gap it sets had never once applied to a goals list. That one was
  repointed rather than deleted.
  What this still cannot see is a rule whose element exists somewhere else on
  the page: `.next ol` is dead in chapter 1 too, and chapter 1 has an `<ol>`.

- **A stylesheet comment naming a figure the chapter does not have.** Not a
  check -- a habit the checks cannot enforce, recorded because it went wrong
  once. Chapter 5 inherited chapter 4's sheet, and with it seven section
  comments naming chapter 4's figure numbers: `/* Figure 7: two boards, one
  capsule */` heads the component chapter 5 uses for Figure 10, which has no
  capsule in it. Two of the seven named Figure 12 and Figure 14, which exist in
  chapter *one* and have never existed in chapter 4 or 4. Name the component by
  what it does and put this chapter's figures after it.

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
- **A chapter with no sources and no licence.** Chapter 3 shipped without
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

**Two review lenses that are deliberately not gates.** Both were written as
checks, both failed correct work, and the reasons are worth keeping because the
temptation to gate them will come back.

- **An instruction the chapter tells the reader to run.** Seven chapters
  checked every assertion against source and none of them ever checked an
  *imperative*. Chapter 8 ended the series on "it is `make program` in
  `boards/raspberry_pi_pico_2`", which errors out without an `APP` variable,
  does nothing on a Mac, and ignores the debug probe the same sentence says the
  reader has -- all three of which chapter 5 had already documented with
  citations, and two review passes read that sentence without checking it. The
  gate written for it checks that a named `make` target exists, which **would
  not have caught this**: `program` exists, and the defect was that it is the
  wrong target. It also fails chapter 5, which names `make flash-app` on
  purpose to report that the board's README sends readers to a target the board
  does not define. So: run it by hand. Read every command a chapter prints,
  open the Makefile, and ask whether it does what the sentence claims *on the
  reader's machine and hardware*.

- **A prose anchor nothing reads.** An id on a paragraph exists so an assertion
  can pin what it claims. Chapter 6 shipped three unread, chapter 7 fifteen,
  chapter 8 twelve. The exemption is what cannot be got right: it has to let
  through the ids a figure builds without letting through a hand-written
  anchor, and three versions each failed differently -- stripping digits
  swallowed `closing2` because `closing` is asserted; no exemption reported 38
  of chapter 8's 137; assuming the shape `prefix-N` reported twenty of chapter
  1's, which builds ids as `"dd-" + a word`. Asking the script which prefixes
  it builds gets closest and still reports chapter 1's SVG marker defs, its
  section ids and its `aria-labelledby` targets, none of which any script
  should read. Run it by hand and ignore those three categories.

**Pedagogy checks**, which exist because an audit of chapter 1 found roughly
forty technical terms used without ever being defined, and a third of the prose
sitting behind buttons a reader might never press. Four rules are enforced:

1. Every load-bearing term is wrapped in `<dfn>` at or before its first bare use
   in the running prose, and carried in a `class="glossary"` list. The term list
   is `MUST_DEFINE` in `check.py`, keyed by chapter prefix, so chapter 3 inherits
   chapter 1's vocabulary instead of redefining it. Separately, the `<dfn>` tags
   and the glossary must name exactly the same set in both directions, which is
   what stops a term defined inline but absent from `MUST_DEFINE` from going
   missing at the end -- `compiler` had, while the chapter's own text promised
   every word it uses is collected there.
   A chapter's own name is not running prose, and counting it made this rule
   refuse correct work: chapter 5 is called "What a Process Is", so `process`
   appeared at character 21 of what the scan called prose, several hundred
   characters before the glossary that defines it. `<title>` is never rendered
   in the page at all and `<h1>` is the masthead, so both are now cut before
   the scan; chapters 6 and 8 are titled the same way and would have hit it
   too. Everything else in the masthead -- the eyebrow, the standfirst -- is
   prose a reader reads, and still counts, which a mutation confirms: put a
   bare `process` in chapter 5's standfirst and the rule fires again.
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
   ways. Chapter 4 shipped 33 panels with `is-off` already on the element, so a
   reader with JavaScript off lost 1,018 words -- 26.6% of the chapter -- while
   this rule reported roughly nothing, because it only looked inside script
   strings and chapter 4 keeps its sentences in the markup, as the rule says to.
   Chapters 1 and 3 ship every panel showing and let the script put the others
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
   to the prose limits all along; chapters 1 to 4 happened to keep every bullet
   short enough that nobody found out. Chapter 5 cites a Makefile target
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
claim somebody has to keep, and two of the three findings in chapter 3's third
review pass were exactly that: chapter 1's Figure 6 promised "Chapter 3 opens
them up" of the two things sharing the first kilobyte of flash, and chapter 3
opened one of them; Figure 7 told the reader all six instructions were ones
they had already met, and one appears nowhere else in the series.

That risk grows with every chapter. Chapter 3 makes fourteen claims about what
chapter 1 says, and chapter 1 was rewritten heavily after chapter 3 was
drafted -- seven passages converted from prose into tables, ten openings cut.
Any one of those edits could have removed a sentence chapter 3 cites, and
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
  enough to tell "chapter 6 covers this" from "come back an hour later" is
  also sharp enough to drop a real promise silently, and silent is how chapter
  3 shipped with no sources section at all. A false match costs one ledger
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
  next chapter gets written against. Chapter 4 currently owes four.

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
   it. The phone render is not a formality: the arrow after the next chapter's
   title was set off with a plain space, which is a break opportunity, so at
   narrow widths it wrapped onto a line of its own under the title -- the same
   shape as the orphaned punctuation the `.dothis` flex row shipped for six
   chapters. Remember that QuickLook does not run scripts, so what it shows is
   the no-JavaScript reader's view; strip the `<noscript>` block from the
   preview copy to see the ordinary one.
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

## Reading it

The nine pages are self-contained -- no build step, no bundler, no external
assets beyond Google Fonts -- but reading them one directory at a time is
reading nine things rather than one book. `mkbook.py` binds them into a single
document with a router, and `serve.py` serves that and rebuilds it on every
request:

```
python3 learning/tools/serve.py
```

A full build is about 0.15 seconds, so there is no watcher and no build product
to go stale: edit a chapter, and the page reloads itself into what you just
saved. `#ch05` deep-links a chapter, `?theme=dark` forces a theme instead of
following the system, and any other path is served out of `learning/` as an
ordinary file, so a single chapter still reads at its own URL.

Two things it does that opening a built file cannot. It supplies the doctype
and `<head>` the pages deliberately lack -- the host adds those at publish
time, and without them a browser renders in quirks mode, so "it looked right
locally" stops meaning anything. And when the gate refuses to build the book,
the failure becomes the page, rather than leaving the last good build on screen
while a broken edit looks fine.

To build the file without serving it:

```
python3 learning/tools/mkbook.py /tmp/book.html
```

## License

The series -- prose, diagrams, and interactive pages -- is licensed
**CC BY-SA 4.0**. Share and adapt it freely, with credit, under the same license.
See [`LICENSE`](LICENSE).

Tock source code quoted inside the chapters remains under its own
Apache-2.0 OR MIT license and is not relicensed by this grant.
