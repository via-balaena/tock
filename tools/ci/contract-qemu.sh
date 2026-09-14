#!/usr/bin/env bash
#
# Run a HIL conformance test under QEMU and read its verdict.
#
#   contract-qemu.sh [rv32|q35] [uart|flash]     (default: rv32 uart)
#
# The test is a kernel test that prints at boot, so this needs neither apps nor
# tockloader nor QMP -- which is why it is not part of `qemu-virt-ci-runner`,
# whose job is installing libtock-c apps and driving them over QMP. Each
# platform takes a couple of seconds.
#
# Two platforms, two architectures, two different chip drivers:
#
#   rv32  qemu_rv32_virt   riscv32   qemu_virt_chip::uart, through a UartDevice
#                                    on the console's mux -- so it covers the
#                                    VIRTUALIZER as well as the chip driver.
#   q35   qemu_i486_q35    i486      x86_q35::serial::SerialPort on COM2,
#                                    against the chip driver directly.
#
# Exit status:
#   0  every clause held
#   1  a clause was broken
#   2  the test did not report -- it never ran, stalled, or the kernel does not
#      contain it. THIS IS A FAILURE. A conformance test that says nothing must
#      never be mistaken for one that passed.

set -uo pipefail

PLATFORM="${1:-rv32}"
TEST="${2:-uart}"
# The flash test erases and rewrites a 256 KiB sector through QEMU's pflash
# command interface, a word at a time. It finishes inside 15s on this machine;
# the uart one takes a couple of seconds.
case "$TEST" in
  flash) BOOT_SECONDS="${BOOT_SECONDS:-25}" ;;
  *)     BOOT_SECONDS="${BOOT_SECONDS:-10}" ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 2

fail() { printf '  FAIL  %s\n' "$*"; }
note() { printf '        %s\n' "$*"; }

case "$PLATFORM" in
  rv32)
    BOARD="qemu_rv32_virt"
    TARGET="riscv32imac-unknown-none-elf"
    QEMU="qemu-system-riscv32"
    ;;
  q35)
    BOARD="qemu_i486_q35"
    TARGET="i486-unknown-none"
    QEMU="qemu-system-i386"
    ;;
  *)
    fail "unknown platform '$PLATFORM' -- expected rv32 or q35"
    exit 2
    ;;
esac

case "$TEST" in
  uart) ;;
  flash)
    # Only the rv32 machine has a flash device Tock can drive: QEMU's `virt`
    # reserves two pflash banks, and `chips/qemu_virt_chip` has a driver for
    # them. The q35 board has no `hil::flash` implementation at all.
    if [ "$PLATFORM" != rv32 ]; then
      fail "the flash contract only runs on rv32 -- q35 has no hil::flash"
      exit 2
    fi
    ;;
  *)
    fail "unknown test '$TEST' -- expected uart or flash"
    exit 2
    ;;
esac

printf '%s contract, %s under qemu\n' "$TEST" "$BOARD"

command -v "$QEMU" > /dev/null 2>&1
if [ "$?" -ne 0 ]; then
  fail "$QEMU is not on PATH"
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
build_dir="target/$TEST-contract-$PLATFORM"
build_output="$(cd "boards/$BOARD" && cargo build --release \
  --features "${TEST}_contract_test" --target-dir "../../$build_dir" 2>&1)"
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
marker_count="$(strings "$kernel" | grep -c "$TEST-contract:")"
if [ "$marker_count" -eq 0 ]; then
  fail "$kernel does not contain the conformance test"
  note "built without --features ${TEST}_contract_test, or a stale artifact"
  exit 2
fi

if [ "$PLATFORM" = rv32 ]; then
  console="$(timeout "$BOOT_SECONDS" "$QEMU" \
    -machine virt \
    -semihosting \
    -global driver=riscv-cpu,property=smepmp,value=true \
    -global virtio-mmio.force-legacy=false \
    -device virtio-rng-device \
    -device virtio-keyboard-device \
    -bios "$kernel" \
    -nographic < /dev/null 2>&1)"
else
  # TWO serial devices, and the second is not optional.
  #
  # The test runs against COM2, because COM1 carries the process console. With
  # no chardev behind COM2, QEMU's 16550 never raises the transmit interrupt:
  # the test prints nine clauses, stops dead at the transmit completion, and
  # says nothing further. That is indistinguishable from a board that cannot
  # talk, which is what this one was taken for.
  #
  # `-display none` rather than `-nographic`, because `-nographic` claims
  # serial0 for stdio itself and leaves no way to place the second one.
  #
  # No `-device isa-debug-exit` here. It is in the board Makefile and it works,
  # but `exit_qemu()` is reached only from the panic handler, so a kernel that
  # boots normally never writes port 0xf4 and QEMU never exits on its own. The
  # timeout is the mechanism; the device would only make the run look like it
  # had one.
  console="$(timeout "$BOOT_SECONDS" "$QEMU" \
    -cpu 486 \
    -machine q35 \
    -net none \
    -device virtio-rng-pci,disable-legacy=on \
    -display none \
    -serial stdio \
    -serial null \
    -kernel "$kernel" < /dev/null 2>&1)"
fi

verdict="$(printf '%s\n' "$console" | grep -m1 "$TEST-contract: [0-9]* clauses")"

if [ -z "$verdict" ]; then
  fail "the test did not report within ${BOOT_SECONDS}s"
  note "a stall is how a missing callback shows up: the test simply never"
  note "finishes. Treat this as broken, not as absent."
  printf '%s\n' "$console" | grep "$TEST-contract:" | head -20
  exit 2
fi

if printf '%s\n' "$verdict" | grep -q 'all kept'; then
  printf '  pass  %s\n' "${verdict#"$TEST-contract: "}"
  exit 0
fi

fail "${verdict#"$TEST-contract: "}"
printf '%s\n' "$console" | grep "$TEST-contract: FAIL" | sed "s/^$TEST-contract: FAIL/        broken:/"
exit 1
