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
STLINK_SECONDS="${STLINK_SECONDS:-60}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 2

pass() { printf '  pass  %-44s %s\n' "$1" "$2"; }
fail() { printf '  FAIL  %-44s %s\n' "$1" "$2"; }
note() { printf '        %s\n' "$*"; }

broken=0
silent=0

# board | feature | target triple | binary | tty | marker | flash recipe | expect
#
# `expect` is `kept` for a run that must report every clause held, or
# `broken:<text>` for one that must report exactly one broken clause whose
# name contains <text>. The second is not a tolerated failure: it is a
# POSITIVE CONTROL. A clause that only ever passes has never been tested, and
# a guard that fires on no run in the suite can be deleted without anything
# noticing.
#
# It names the CLAUSE, not a count, and that is not fussiness. Removing one of
# the two Err(OFF) guards to check this control still produced "1 BROKEN" --
# a different clause, from the other guard, and the control passed anyway. A
# count is satisfied by the wrong failure.
RUNS=(
  "raspberry_pi_pico_2_w|uart_contract_test_pads|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|uart-contract|pico|kept"
  "raspberry_pi_pico_2_w|spi_contract_test|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|spi-contract|pico|kept"
  "raspberry_pi_pico_2_w|gpio_contract_test|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|gpio-contract|pico|kept"
  # Needs no wiring at all: every clause is a rejection the driver must make
  # before the buffer reaches the hardware, so no device and no pull-ups. It
  # runs here rather than in `all` only because nothing emulated has an I2C
  # controller, not because it needs the bench's jumper.
  "raspberry_pi_pico_2_w|i2c_contract_test|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|i2c-contract|pico|kept"
  "stm32f3discovery|uart_contract_test|thumbv7em-none-eabi|stm32f3discovery|/dev/ttyACM1|uart-contract|stlink|kept"
  # THIS ONE ERASES AND WRITES PAGE 120 on the Discovery. That page is inside
  # the region the board already hands to userspace for nonvolatile storage
  # (0x08038000 for 0x8000, which at 2 KiB pages is 112..127), so it destroys
  # only what an app using storage would already overwrite. Clause 6 reports
  # rather than judges: whether this chip accepts a write over un-erased flash
  # is the thing `hil::flash` deliberately does not settle.
  "stm32f3discovery|flash_contract_test|thumbv7em-none-eabi|stm32f3discovery|/dev/ttyACM1|flash-contract|stlink|kept"
  # The Err(OFF) control: the board skips configure(), so UART1 is never
  # enabled. Unguarded this stalled dead after nine clauses with the buffer
  # stranded, which the runner could only report as silence. Guarded it
  # refuses with OFF and says so. Exactly one clause may break -- the one that
  # asks an unconfigured UART to start a receive.
  "raspberry_pi_pico_2_w|uart_contract_test_unconfigured|thumbv8m.main-none-eabi|raspberry_pi_pico_2_w|/dev/ttyACM0|uart-contract|pico|broken:receive_buffer() on an idle UART"
)

printf 'hil conformance on the bench (%s)\n' "$BENCH"

ssh -o ConnectTimeout=8 -o BatchMode=yes "$BENCH" true 2>/dev/null
if [ "$?" -ne 0 ]; then
  note "skip  $BENCH is not reachable, so nothing on the bench was checked"
  note "      this is a hole, not a pass -- the QEMU gate covers uart only"
  exit 0
fi

for spec in "${RUNS[@]}"; do
  IFS='|' read -r board feature triple binary tty marker recipe expect <<< "$spec"
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
  # CONNECT UNDER RESET. A plain attach worked for months and then stopped:
  # "init mode failed (unable to connect to the target)", with the ST-LINK
  # enumerated and the target powered at 2.89 V. Whatever the running kernel
  # does, the debugger cannot attach to it while it runs -- and the runner
  # reports that as "the test did not report", which is a stall, which is what
  # a missing callback also looks like. Two Discovery rows failed that way and
  # neither had anything to do with the code under test.
  #
  # Holding SRST across the attach sidesteps it entirely: the core is halted
  # before it executes anything. Why the old recipe stopped working is NOT
  # established.
  openocd -c "source [find board/stm32f3discovery.cfg]; reset_config srst_only srst_nogate connect_assert_srst; init; reset halt; flash write_image erase /tmp/bench-under-test.elf; verify_image /tmp/bench-under-test.elf; reset run; shutdown" >/dev/null 2>&1
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

  if [ "$expect" = kept ]; then
    if printf '%s\n' "$verdict" | command grep -q 'all kept'; then
      pass "$label" "${verdict#*: }"
    else
      fail "$label" "${verdict#*: }"
      printf '%s\n' "$console" | command grep "$marker: FAIL" \
        | sed "s/^$marker: FAIL/        broken:/"
      broken=$((broken + 1))
    fi
  else
    # A control run. Exactly one clause must break, and it must be the named
    # one: "all kept" means the guard stopped firing, and a different clause
    # means something else broke and the control proved nothing.
    want="${expect#broken:}"
    count="$(printf '%s\n' "$console" | command grep -c "$marker: FAIL")"
    named="$(printf '%s\n' "$console" | command grep -c "$marker: FAIL.*$want")"
    if [ "$count" -eq 1 ] && [ "$named" -eq 1 ]; then
      pass "$label" "${verdict#*: } (control: $want)"
    else
      fail "$label" "${verdict#*: } -- wanted exactly 1 broken, \"$want\""
      note "this run exists to FAIL in one specific way; $count clause(s) broke,"
      note "$named of them the expected one. The control proved nothing."
      printf '%s\n' "$console" | command grep "$marker: FAIL" \
        | sed "s/^$marker: FAIL/        broken:/"
      broken=$((broken + 1))
    fi
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
