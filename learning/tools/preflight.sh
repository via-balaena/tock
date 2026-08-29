#!/usr/bin/env bash

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.
#
# Everything that can be checked by running something, in one command, so that
# it is not a matter of remembering. Run from the repository root before
# committing anything under learning/.
#
#     learning/tools/preflight.sh
#
# Each of these has caught a real defect that the chapter's own gate could not
# see. The toc one is the reason this script exists at all: `tools/ci/toc.sh`
# selects Markdown by grepping for markdown-toc's insertion marker and then
# rewrites what it finds, so learning/README.md -- which had written that
# marker out in order to describe it -- would have had a table of contents
# inserted into the middle of a bullet list and then been reported as out of
# date. Twelve review passes went green locally before anyone ran it, because
# markdown-toc is not installed here.
#
# What this cannot do is in learning/README.md, under "Before committing".

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
FAIL=0

step() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  pass  %s\n" "$1"; }
bad()  { printf "  FAIL  %s\n" "$1"; FAIL=1; }
skip() { printf "  ----  %s\n" "$1"; }

step "The chapter gate"
if python3 learning/tools/check.py > /tmp/preflight-gate.$$ 2>&1; then
    ok "$(grep -E 'assertions passed' /tmp/preflight-gate.$$ | sed 's/^ *//')"
    # The debts owed by chapters that do not exist yet. Not failures -- this is
    # the list the next chapter is written against, so it belongs where it will
    # be read rather than buried in the gate's own output.
    grep -E '^  open  ' /tmp/preflight-gate.$$ || true
else
    cat /tmp/preflight-gate.$$
    bad "check.py"
fi
rm -f /tmp/preflight-gate.$$

step "Tock's own CI, which does not know this directory is special"
if cargo run --quiet --manifest-path=tools/ci/license-checker/Cargo.toml \
        --release > /dev/null 2>&1; then
    ok "license checker"
else
    bad "license checker -- check SPDX headers and learning/.lcignore"
fi

if cargo fmt --check > /dev/null 2>&1; then
    ok "cargo fmt --check"
else
    bad "cargo fmt --check"
fi

# The other half of make format-check reaches every tracked .rs file, workspace
# member or not, so a chapter's demo source is inside it.
if [ -z "$(git grep --files-with-matches $'\t' -- '*.rs')" ]; then
    ok "no tab characters in any tracked .rs"
else
    git grep --files-with-matches $'\t' -- '*.rs' | sed 's/^/          /'
    bad "tab characters in Rust sources"
fi

if ./tools/ci/check-for-readmes.sh > /dev/null 2>&1; then
    ok "check-for-readmes.sh"
else
    bad "check-for-readmes.sh"
fi

MARKED="$(grep -rl '<!-- toc -->' learning --include='*.md' 2>/dev/null || true)"
if [ -z "$MARKED" ]; then
    ok "no file under learning/ carries markdown-toc's marker"
else
    echo "$MARKED" | sed 's/^/          /'
    bad "toc.sh would rewrite these and then call them out of date"
fi

step "Chapter sources, which cargo fmt never reaches"
RS="$(git ls-files 'learning/**/*.rs')"
if [ -z "$RS" ]; then
    skip "no .rs under learning/"
elif ! command -v rustfmt > /dev/null; then
    skip "rustfmt not installed"
elif rustfmt --check --edition 2021 $RS > /dev/null 2>&1; then
    ok "rustfmt --check on $(echo "$RS" | wc -l | tr -d ' ') chapter source(s)"
else
    rustfmt --check --edition 2021 $RS 2>&1 | head -n 20 | sed 's/^/          /'
    bad "rustfmt --check"
fi

step "The book, which is nine pages sharing one DOM"
if BOOK_OUT="$(python3 learning/tools/mkbook.py "$(mktemp -t book).html" 2>&1)"; then
    ok "$(printf '%s' "$BOOK_OUT" | head -n 1 | sed 's/^ *//')"
else
    printf '%s\n' "$BOOK_OUT" | head -n 6 | sed 's/^/          /'
    bad "mkbook.py"
fi

printf "\n"
if [ "$FAIL" -eq 0 ]; then
    printf "\033[1mpreflight passed\033[0m -- now do the part that cannot be run:\n"
    printf "  see \"Before committing\" in learning/README.md\n"
else
    printf "\033[1mpreflight failed\033[0m\n"
fi
exit "$FAIL"
