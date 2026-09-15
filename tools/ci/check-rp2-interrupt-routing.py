#!/usr/bin/env python3
"""A peripheral the chip crate HOLDS must have its interrupt line routed.

`Chip::service_pending_interrupts` panics when `service_interrupt` returns
false (`chips/rp2350/src/chip.rs`), and the poll path that feeds it reads
**ISPR, never ISER** (`arch/cortex-m/src/nvic.rs:183`). So a line the NVIC has
disabled still reaches `service_interrupt` the moment its peripheral asserts
it. "Nobody enabled that line" is therefore not a defence: unmasking the
interrupt inside the peripheral is enough to take the board down.

That is how `chips/rp2040` came to hold a `uart1` field whose driver sets
`UARTIMSC::TXIM` while `UART1_IRQ` was routed nowhere. No board in the tree
uses UART1, so nothing had ever hit it.

THE RULE: for a field named `foo` on a `*DefaultPeripherals` struct, every
constant in that chip's `interrupts.rs` named `FOO_IRQ` or `FOO_IRQ_*` must
appear in `service_interrupt` -- or be listed in ALLOWED below with the reason
it cannot fire. The allowlist is the useful half: it is the inventory of lines
that are declared, held, and deliberately unrouted, each with the register
write that would have to exist for them to assert.

WHAT THIS CANNOT CHECK: a peripheral the struct does NOT hold. `new_spi1`,
`new_i2c1`, `new_pio1` and `new_pio2` each build a peripheral carrying its own
NVIC line, and a board that uses one must supply its own `InterruptService`;
nothing here can tell whether it did. Nor does it check that a routed arm
calls the right handler.

Exit 0 if every held peripheral is routed or allowed, 1 if one is not, 2 if
the scan found too few pairs to have run.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

CHIPS = ["rp2040", "rp2350"]

# (chip, constant) -> why it can never assert, or why it is a known hazard.
# Every reason names the register write that would be needed for the line to
# become pending, so it can be re-checked rather than believed.
ALLOWED = {
    ("rp2040", "TIMER_IRQ_1"): "timer.rs:187 only ever writes INTE::ALARM_0; alarms 1-3 stay masked",
    ("rp2040", "TIMER_IRQ_2"): "timer.rs:187 only ever writes INTE::ALARM_0; alarms 1-3 stay masked",
    ("rp2040", "TIMER_IRQ_3"): "timer.rs:187 only ever writes INTE::ALARM_0; alarms 1-3 stay masked",
    ("rp2040", "RTC_IRQ"): "rtc.rs never writes `inte`; its handle_set_interrupt/handle_get_interrupt have no callers anywhere",
    ("rp2350", "TIMER0_IRQ_1"): "timer.rs:188 only ever writes INTE::ALARM_0; alarms 1-3 stay masked",
    ("rp2350", "TIMER0_IRQ_2"): "timer.rs:188 only ever writes INTE::ALARM_0; alarms 1-3 stay masked",
    ("rp2350", "TIMER0_IRQ_3"): "timer.rs:188 only ever writes INTE::ALARM_0; alarms 1-3 stay masked",
    ("rp2350", "SIO_IRQ_BELL"): "the SIO driver defines the doorbell registers and never writes doorbell_out_set, so no bell is rung",
    ("rp2350", "SIO_IRQ_FIFO_NS"): "non-secure alias; this kernel runs secure",
    ("rp2350", "SIO_IRQ_BELL_NS"): "non-secure alias; this kernel runs secure",
    ("rp2350", "SIO_IRQ_MTIMECMP"): "the RISC-V machine timer on the Hazard3 cores, which this kernel does not run on",
    # NOT benign. Kept here because closing it needs a PWM interrupt handler
    # that does not exist, not because the line is unreachable.
    ("rp2350", "PWM_IRQ_WRAP_0"): "HAZARD: pwm.rs:541 enable_interrupt writes INTE, and `pub fn test::run` calls it. No board calls that today; one that did would panic the kernel",
    ("rp2350", "PWM_IRQ_WRAP_1"): "HAZARD: same as PWM_IRQ_WRAP_0, for channels 8-11",
}

# What a working scan finds today. Far fewer means the struct or the match
# stopped parsing, not that the tree got tidier.
FLOOR = 25

CONST = re.compile(r"^pub const ([A-Z][A-Z0-9_]*): u32 = \d+;", re.M)
ARM = re.compile(r"interrupts::([A-Z][A-Z0-9_]*)")


def fields_of_struct(text):
    """Field names of the `*DefaultPeripherals` struct, doc comments skipped."""
    m = re.search(r"pub struct [A-Za-z0-9_]*DefaultPeripherals[^{]*\{(.*?)\n\}", text, re.S)
    if not m:
        return []
    return re.findall(r"^\s*pub ([a-z][a-z0-9_]*)\s*:", m.group(1), re.M)


def routed_in_service(text):
    """Constants named inside the body of `fn service_interrupt`."""
    i = text.find("fn service_interrupt")
    if i < 0:
        return set()
    return set(ARM.findall(text[i:]))


def main():
    pairs = 0
    bad = []
    allowed_hit = []
    for chip in CHIPS:
        src = ROOT / "chips" / chip / "src"
        consts = CONST.findall((src / "interrupts.rs").read_text())
        chip_rs = (src / "chip.rs").read_text()
        fields = fields_of_struct(chip_rs)
        routed = routed_in_service(chip_rs)
        if not fields or not consts:
            print(f"  {chip}: parsed {len(fields)} fields, {len(consts)} constants")
            return 2
        for f in fields:
            prefix = f.upper() + "_IRQ"
            for c in consts:
                if c != prefix and not c.startswith(prefix + "_"):
                    continue
                pairs += 1
                if c in routed:
                    continue
                reason = ALLOWED.get((chip, c))
                if reason:
                    allowed_hit.append((chip, f, c, reason))
                else:
                    bad.append((chip, f, c))

    for chip, f, c, reason in allowed_hit:
        mark = "HAZARD" if reason.startswith("HAZARD") else "ok    "
        print(f"  {mark}  {chip} holds `{f}`, {c} unrouted -- {reason}")
    for chip, f, c in bad:
        print(f"  FAIL    {chip} holds `{f}` and does not route {c}")

    if pairs < FLOOR:
        print(f"  only {pairs} (field, interrupt) pairs found, expected at least {FLOOR}")
        return 2
    if bad:
        print(f"  {len(bad)} held peripheral(s) whose interrupt would panic the kernel")
        return 1
    print(f"  ok      {pairs} (field, interrupt) pairs across {len(CHIPS)} chips, "
          f"every one routed or accounted for")
    return 0


if __name__ == "__main__":
    sys.exit(main())
