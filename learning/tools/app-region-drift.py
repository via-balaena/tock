#!/usr/bin/env python3
"""Check a libtock-rs PLATFORMS row against the kernel that has to load its apps.

The two live in different repositories and nothing links them: the row hardcodes
addresses read off a kernel built at one commit, and if the kernel's app region
moves the app simply fails to load, with no error naming the cause.

Reads the app region from a linked kernel ELF (_sapps/_eapps/_sappmem/_eappmem,
which is what the kernel leaves rather than what layout.ld reserves) and the row
from build_scripts/src/lib.rs, and compares them.

    app-region-drift.py --elf <kernel.elf> --platforms <lib.rs> --platform <name>

Exits 0 if the row fits the kernel, 1 if it does not, 2 if it could not tell.
"""

import argparse
import re
import subprocess
import sys

SYMBOLS = ("_sapps", "_eapps", "_sappmem", "_eappmem")


def die(message):
    """Exit 2: could not tell, as distinct from 1, which means drifted."""
    print(f"error: {message}", file=sys.stderr)
    sys.exit(2)


def read_size(text):
    """Parse a PLATFORMS size field: 0x40000, 256K, 32M. Case insensitive."""
    text = text.strip()
    if text.lower().startswith("0x"):
        return int(text, 16)
    match = re.fullmatch(r"(\d+)([KM])", text, re.IGNORECASE)
    if not match:
        raise ValueError(f"cannot parse size {text!r}")
    scale = 1024 if match.group(2).upper() == "K" else 1024 * 1024
    return int(match.group(1)) * scale


def kernel_symbols(elf, nm):
    """Return the four app-region symbols from a linked kernel."""
    try:
        out = subprocess.run(
            [nm, elf], capture_output=True, text=True, check=True
        ).stdout
    except FileNotFoundError:
        die(f"{nm} not found; pass --nm")
    except subprocess.CalledProcessError as err:
        die(f"{nm} failed on {elf}: {err.stderr.strip()}")

    found = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[2] in SYMBOLS:
            found[parts[2]] = int(parts[0], 16)

    missing = [s for s in SYMBOLS if s not in found]
    if missing:
        die(f"{elf} defines no {', '.join(missing)} — is it a linked Tock kernel?")
    return found


def platform_row(path, name):
    """Return (flash_start, flash_len, ram_start, ram_len) for one PLATFORMS row."""
    source = open(path).read()
    pattern = (
        r'\(\s*"' + re.escape(name) + r'"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"'
        r'\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)'
    )
    match = re.search(pattern, source)
    if not match:
        die(f'no PLATFORMS row named "{name}" in {path}')
    flash_start, flash_len, ram_start, ram_len = match.groups()
    return (
        int(flash_start, 16),
        read_size(flash_len),
        int(ram_start, 16),
        read_size(ram_len),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--elf", required=True, help="linked kernel ELF")
    parser.add_argument("--platforms", required=True, help="build_scripts/src/lib.rs")
    parser.add_argument("--platform", required=True, help="PLATFORMS row name")
    parser.add_argument("--nm", default="arm-none-eabi-nm")
    args = parser.parse_args()

    sym = kernel_symbols(args.elf, args.nm)
    flash_start, flash_len, ram_start, ram_len = platform_row(args.platforms, args.platform)

    print(f"kernel {args.elf}")
    print(
        f"  _sapps   {sym['_sapps']:#010x}  _eapps   {sym['_eapps']:#010x}"
        f"  ({sym['_eapps'] - sym['_sapps']} bytes)"
    )
    print(
        f"  _sappmem {sym['_sappmem']:#010x}  _eappmem {sym['_eappmem']:#010x}"
        f"  ({sym['_eappmem'] - sym['_sappmem']} bytes)"
    )
    print(f'row    "{args.platform}"')
    print(f"  flash {flash_start:#010x} + {flash_len} = {flash_start + flash_len:#010x}")
    print(f"  ram   {ram_start:#010x} + {ram_len} = {ram_start + ram_len:#010x}")

    failures = []
    if flash_start != sym["_sapps"]:
        failures.append(
            f"flash start {flash_start:#010x} is not _sapps {sym['_sapps']:#010x} — "
            "an app links where the kernel is not looking, and silently fails to load"
        )
    if flash_start + flash_len > sym["_eapps"]:
        failures.append(
            f"flash end {flash_start + flash_len:#010x} runs past _eapps {sym['_eapps']:#010x}"
        )
    if ram_start < sym["_sappmem"]:
        failures.append(
            f"RAM start {ram_start:#010x} is below _sappmem {sym['_sappmem']:#010x} — "
            "app memory overlaps the kernel's"
        )
    if ram_start + ram_len > sym["_eappmem"]:
        failures.append(
            f"RAM end {ram_start + ram_len:#010x} runs past _eappmem {sym['_eappmem']:#010x}"
        )

    if failures:
        print("\nDRIFTED:")
        for failure in failures:
            print(f"  {failure}")
        return 1

    print("\nok: the row fits the kernel's app region")
    return 0


if __name__ == "__main__":
    sys.exit(main())
