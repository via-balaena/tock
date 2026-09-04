#!/usr/bin/env bash

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.
#
# Re-check every numeric claim in a branch's commit messages against the tree.
# Run it after the last edit, before pushing. Three stale counts so far.
#
#   check-claims.sh [worktree] [range]
#
# `range` defaults to upstream/master..HEAD. It used to be hardcoded to
# c25a7f5a9..HEAD, which was fine until that commit was superseded and dropped
# by #5140 -- at which point a tool whose whole job is catching staleness had
# gone stale itself and would have reported nothing at all.
#
# Exits non-zero when a claim does not match, so it can gate a push. The
# original set `fail=0` and never read it, and could not have read it anyway:
# the inner loop sat on the right of a pipe, so it ran in a subshell and any
# assignment died with it. Findings go to a file instead, which is the only
# part of a subshell that outlives it.

set -uo pipefail

WT="${1:-.}"
RANGE="${2:-upstream/master..HEAD}"

cd "$WT" || exit 1

if ! git rev-parse --verify --quiet "${RANGE%%..*}" >/dev/null; then
	echo "check-claims: '${RANGE%%..*}' does not resolve in $WT" >&2
	echo "check-claims: pass a range explicitly, e.g. check-claims.sh . master..HEAD" >&2
	exit 2
fi

found=$(mktemp)
trap 'rm -f "$found"' EXIT

while read -r sha; do
	git log -1 --format=%B "$sha" |
		grep -oE "[a-z0-9/_.]+\.rs is [0-9]+ lines now" |
		while read -r claim; do
			f=$(echo "$claim" | awk '{print $1}')
			n=$(echo "$claim" | awk '{print $3}')
			actual=$(git show "$sha:$f" 2>/dev/null | wc -l | tr -d ' ')
			if [ -z "$actual" ]; then
				echo "  MISSING in ${sha:0:9}: $f is not in the tree at that commit" | tee -a "$found"
			elif [ "$n" != "$actual" ]; then
				echo "  STALE in ${sha:0:9}: $f claims $n lines, is $actual" | tee -a "$found"
			else
				echo "  ok ${sha:0:9}: $f = $n lines"
			fi
		done
done < <(git rev-list "$RANGE")

if [ -s "$found" ]; then
	echo
	echo "check-claims: $(wc -l <"$found" | tr -d ' ') claim(s) do not match the tree." >&2
	exit 1
fi
