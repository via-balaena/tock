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
   is safe in a way that a generic top-level filename would not be.

If those hold, the workflow is:

```
git fetch upstream
git rebase upstream/master
```

There is nothing to resolve, because there is nothing overlapping.

## What CI requires of these files

The repository's own checks apply to anything committed here, and this content is
held to them:

- `make licensecheck` walks every file in the tree and requires Tock's own SPDX
  string, which it hardcodes (`tools/ci/license-checker/src/main.rs:100`). Because
  this series is licensed CC BY-SA 4.0 instead, `learning/.lcignore` excludes these
  files from that check. That file is repository tooling config, so it carries the
  Tock header itself.
- `make format-check` is Rust-only and does not apply.
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
