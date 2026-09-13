#!/usr/bin/env bash
#
# Run the `hil::uart` conformance test on qemu_rv32_virt and read its verdict.
#
# The test is a kernel test that prints at boot, so this needs neither apps nor
# tockloader nor QMP -- which is why it is not part of `qemu-virt-ci-runner`,
# whose job is installing libtock-c apps and driving them over QMP. This takes
# about two seconds.
#
# Exit status:
#   0  every clause held
#   1  a clause was broken
#   2  the test did not report -- it never ran, stalled, or the kernel does not
#      contain it. THIS IS A FAILURE. A conformance test that says nothing must
#      never be mistaken for one that passed.

set -uo pipefail

BOARD="qemu_rv32_virt"
TARGET="riscv32imac-unknown-none-elf"
BOOT_SECONDS="${BOOT_SECONDS:-8}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 2

fail() { printf '  FAIL  %s\n' "$*"; }
note() { printf '        %s\n' "$*"; }

printf 'uart contract, %s under qemu\n' "$BOARD"

command -v qemu-system-riscv32 > /dev/null 2>&1
if [ "$?" -ne 0 ]; then
  fail "qemu-system-riscv32 is not on PATH"
  exit 2
fi

# Build with the test compiled in, into a target directory of its own.
#
# Sharing the ordinary one does not work, and the way it fails is quiet: a
# featured and an unfeatured build write the SAME path, so a later `make`
# overwrites the featured binary while cargo's fingerprint still says its
# featured build is current -- and the next `cargo build --features` is a
# no-op that leaves the wrong binary on disk. That was not hypothetical; the
# artifact check below caught exactly this on the first run of this script.
#
# Note also that `cargo build` writes the bare binary, while the `.elf` beside
# it is written by `make`. Booting the wrong one prints nothing, which reads
# exactly like a test that did not run.
build_dir="target/uart-contract"
build_output="$(cd "boards/$BOARD" && cargo build --release \
  --features uart_contract_test --target-dir "../../$build_dir" 2>&1)"
build_status="$?"
if [ "$build_status" -ne 0 ]; then
  fail "the board did not build"
  printf '%s\n' "$build_output" | grep -E '^error' | head -5
  exit 2
fi

kernel="$build_dir/$TARGET/release/$BOARD"
if [ ! -f "$kernel" ]; then
  fail "no artifact at $kernel"
  exit 2
fi

# Prove the test is in THIS binary rather than trusting that the feature flag
# reached it. Without this the check cannot tell a passing run from a kernel
# that was never built with the test at all.
# `grep -c` and not `grep -q`: under `set -o pipefail` a `-q` exits on the
# first match, `strings` dies of SIGPIPE, and the pipeline reports 141 -- so a
# successful match reads as a failure. Count first, test the count after.
marker_count="$(strings "$kernel" | grep -c 'uart-contract:')"
if [ "$marker_count" -eq 0 ]; then
  fail "$kernel does not contain the conformance test"
  note "built without --features uart_contract_test, or a stale artifact"
  exit 2
fi

console="$(timeout "$BOOT_SECONDS" qemu-system-riscv32 \
  -machine virt \
  -semihosting \
  -global driver=riscv-cpu,property=smepmp,value=true \
  -global virtio-mmio.force-legacy=false \
  -device virtio-rng-device \
  -device virtio-keyboard-device \
  -bios "$kernel" \
  -nographic < /dev/null 2>&1)"

verdict="$(printf '%s\n' "$console" | grep -m1 'uart-contract: [0-9]* clauses')"

if [ -z "$verdict" ]; then
  fail "the test did not report within ${BOOT_SECONDS}s"
  note "a stall is how a missing callback shows up: the test simply never"
  note "finishes. Treat this as broken, not as absent."
  printf '%s\n' "$console" | grep 'uart-contract:' | head -20
  exit 2
fi

if printf '%s\n' "$verdict" | grep -q 'all kept'; then
  printf '  pass  %s\n' "${verdict#uart-contract: }"
  exit 0
fi

fail "${verdict#uart-contract: }"
printf '%s\n' "$console" | grep 'uart-contract: FAIL' | sed 's/^uart-contract: FAIL/        broken:/'
exit 1
