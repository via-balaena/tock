#!/usr/bin/env bash
#
# Run every hil conformance test that needs real hardware, on the bench.
#
# The QEMU-based uart check (`uart-contract-qemu.sh`) runs on every gate
# because an emulated board exposes a UART. Nothing emulates SPI or GPIO, and
# the pad-level uart clauses need a wire, so those three run here or not at
# all.
#
# Expects, on the bench host:
#   * a Pico 2 W on the Debug Probe, console on /dev/ttyACM0, with GP20 WIRED
#     TO GP21 -- the uart pads and gpio tests both use that jumper, which is
#     why they cannot run in the same build
#   * an STM32F3 Discovery on its own ST-LINK, console on /dev/ttyACM1
#
# Exit status:
#   0  every clause held, on every board that answered
#   1  a clause was broken
#   2  a test did not report, or could not be built or flashed
#
# A test that says nothing is a failure, not an absence: a missing callback
# shows up as a stall, so silence and success must never look alike.

set -uo pipefail

BENCH="${BENCH_HOST:-jon@192.168.60.110}"
# The Pico flashes over SWD at 5 MHz and is quick. The Discovery's ST-LINK
# runs at 950 kHz and writes plus verifies the whole image, which takes far
# longer -- a single global budget fails one or wastes time on the other.
PICO_SECONDS="${PICO_SECONDS:-12}"
STLINK_SECONDS="${STLINK_SECONDS:-40}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 2

pass() { printf '  pass  %-44s %s\n' "$1" "$2"; }
fail() { printf '  FAIL  %-44s %s\n' "$1" "$2"; }
note() { printf '        %s\n' "$*"; }

broken=0
silent=0

# board | feature | target triple | binary | tty | marker | flash recipe
RUNS=(
  "raspberry_pi_pico_2_w|uart_contract_test_pads|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|uart-contract|pico"
  "raspberry_pi_pico_2_w|spi_contract_test|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|spi-contract|pico"
  "raspberry_pi_pico_2_w|gpio_contract_test|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|gpio-contract|pico"
  "stm32f3discovery|uart_contract_test|thumbv7em-none-eabi|stm32f3discovery|/dev/ttyACM1|uart-contract|stlink"
)

printf 'hil conformance on the bench (%s)\n' "$BENCH"

ssh -o ConnectTimeout=8 -o BatchMode=yes "$BENCH" true 2>/dev/null
if [ "$?" -ne 0 ]; then
  note "skip  $BENCH is not reachable, so nothing on the bench was checked"
  note "      this is a hole, not a pass -- the QEMU gate covers uart only"
  exit 0
fi

for spec in "${RUNS[@]}"; do
  IFS='|' read -r board feature triple binary tty marker recipe <<< "$spec"
  label="$board/$feature"
  if [ "$recipe" = pico ]; then budget="$PICO_SECONDS"; else budget="$STLINK_SECONDS"; fi

  # One target directory for the whole script. Sharing the ordinary one is
  # what let a `make` overwrite a featured binary while cargo still believed
  # its own build current; the marker check below is the backstop.
  out="$(cd "boards/$board" && cargo build --release --features "$feature" \
          --target-dir "$root/target/bench" 2>&1)"
  if [ "$?" -ne 0 ]; then
    fail "$label" "did not build"
    printf '%s\n' "$out" | command grep -E '^error' | head -3
    silent=$((silent + 1)); continue
  fi

  elf="target/bench/$triple/release/$binary"
  if [ ! -f "$elf" ]; then
    fail "$label" "no artifact at $elf"
    silent=$((silent + 1)); continue
  fi

  # Prove the test is in THIS binary. `grep -c` and not `-q`: under pipefail a
  # `-q` exits on the first match, `strings` dies of SIGPIPE, and the pipeline
  # reports 141 -- a successful match reading as a failure.
  markers="$(strings "$elf" | command grep -c "$marker:")"
  if [ "$markers" -eq 0 ]; then
    fail "$label" "the built artifact does not contain the test"
    silent=$((silent + 1)); continue
  fi

  scp -q "$elf" "$BENCH:/tmp/bench-under-test.elf"
  if [ "$?" -ne 0 ]; then
    fail "$label" "could not copy to the bench"
    silent=$((silent + 1)); continue
  fi

  # The capture starts BEFORE the reset, or the first clauses are gone by the
  # time anything is listening.
  console="$(ssh "$BENCH" "bash -s" <<REMOTE 2>/dev/null
set -uo pipefail
stty -F $tty 115200 raw -echo
cap=\$(mktemp)
timeout $budget cat $tty > "\$cap" 2>/dev/null &
capture_pid=\$!
sleep 1
if [ "$recipe" = pico ]; then
  ~/flash-tock.sh /tmp/bench-under-test.elf 0x10090000 0x40000 >/dev/null 2>&1
else
  openocd -c "source [find board/stm32f3discovery.cfg]; init; reset halt; flash write_image erase /tmp/bench-under-test.elf; verify_image /tmp/bench-under-test.elf; reset; shutdown" >/dev/null 2>&1
fi
wait \$capture_pid
cat "\$cap"
rm -f "\$cap"
REMOTE
)"

  verdict="$(printf '%s\n' "$console" | command grep -m1 "$marker: [0-9]* clauses")"
  if [ -z "$verdict" ]; then
    fail "$label" "the test did not report within ${budget}s"
    note "a stall is how a missing callback shows up -- treat this as broken"
    printf '%s\n' "$console" | command grep "$marker:" | head -6
    silent=$((silent + 1)); continue
  fi

  if printf '%s\n' "$verdict" | command grep -q 'all kept'; then
    pass "$label" "${verdict#*: }"
  else
    fail "$label" "${verdict#*: }"
    printf '%s\n' "$console" | command grep "$marker: FAIL" \
      | sed "s/^$marker: FAIL/        broken:/"
    broken=$((broken + 1))
  fi
done

printf '\n'
if [ "$silent" -gt 0 ]; then
  printf '  %s test(s) said nothing\n' "$silent"; exit 2
fi
if [ "$broken" -gt 0 ]; then
  printf '  %s test(s) reported a broken clause\n' "$broken"; exit 1
fi
exit 0
