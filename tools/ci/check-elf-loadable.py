#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Tock Contributors 2026.

"""
Check that no ELF claims file content for uninitialized memory.

A PT_LOAD segment's p_filesz is the number of bytes a loader copies out of
the file. If part of that span lands in a NOBITS section, the file is
telling the loader to copy bytes that do not exist. Flashing tools reject
such a file, and they are right to.

The invariant holds for every board the kernel builds today. It is checked
here so that it cannot stop holding without CI saying so, and so that a
tool which produces a flashable image can be pointed at its own output.

Pass explicit paths, or none to walk target/ for release ELFs.
"""

import os
import struct
import sys

SHT_NOBITS = 8
SHF_ALLOC = 0x2
PT_LOAD = 1

ELFCLASS32, ELFCLASS64 = 1, 2
ELFDATA2LSB = 1


def read_elf(path):
    """Return (sections, segments) for a little-endian ELF.

    sections are (name, sh_type, sh_flags, sh_addr, sh_size);
    segments are (p_type, p_vaddr, p_paddr, p_filesz, p_memsz).
    """
    with open(path, "rb") as f:
        d = f.read()

    if d[:4] != b"\x7fELF":
        raise ValueError("not an ELF file")
    if d[5] != ELFDATA2LSB:
        raise ValueError("only little-endian ELF files are handled")

    elfclass = d[4]
    if elfclass == ELFCLASS32:
        e_phoff, e_shoff = struct.unpack_from("<II", d, 0x1C)
        e_phentsize, e_phnum = struct.unpack_from("<HH", d, 0x2A)
        e_shentsize, e_shnum, e_shstrndx = struct.unpack_from("<HHH", d, 0x2E)
        # Elf32_Shdr: name type flags addr offset size ...
        shdr = "<IIIIII"
        # Elf32_Phdr: type offset vaddr paddr filesz memsz ...
        phdr = "<IIIIII"
        strsz_at = 16
        strsz = "<II"
    elif elfclass == ELFCLASS64:
        e_phoff, e_shoff = struct.unpack_from("<QQ", d, 0x20)
        e_phentsize, e_phnum = struct.unpack_from("<HH", d, 0x36)
        e_shentsize, e_shnum, e_shstrndx = struct.unpack_from("<HHH", d, 0x3A)
        # Elf64_Shdr widens flags/addr/offset/size to 64 bits.
        shdr = "<IIQQQQ"
        phdr = None  # Elf64_Phdr reorders p_flags; unpacked below by hand.
        strsz_at = 24
        strsz = "<QQ"
    else:
        raise ValueError("unknown ELF class {}".format(elfclass))

    # The section name table, so a violation can name the section.
    off = e_shoff + e_shstrndx * e_shentsize
    str_off, str_size = struct.unpack_from(strsz, d, off + strsz_at)
    strtab = d[str_off : str_off + str_size]

    sections = []
    for i in range(e_shnum):
        off = e_shoff + i * e_shentsize
        name, sh_type, sh_flags, sh_addr, _off, sh_size = struct.unpack_from(
            shdr, d, off
        )
        end = strtab.index(b"\0", name)
        sections.append(
            (strtab[name:end].decode(), sh_type, sh_flags, sh_addr, sh_size)
        )

    segments = []
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        if elfclass == ELFCLASS32:
            p_type, _off, p_vaddr, p_paddr, p_filesz, p_memsz = struct.unpack_from(
                phdr, d, off
            )
        else:
            (p_type,) = struct.unpack_from("<I", d, off)
            _off, p_vaddr, p_paddr, p_filesz, p_memsz = struct.unpack_from(
                "<QQQQQ", d, off + 8
            )
        segments.append((p_type, p_vaddr, p_paddr, p_filesz, p_memsz))

    return sections, segments


def violations(path):
    """Every span of file content that lands in memory with no content."""
    sections, segments = read_elf(path)

    # Only a NOBITS section that is actually loaded occupies an address a
    # segment could overlap. A non-ALLOC one takes up no address space.
    blank = [
        (name, addr, size)
        for name, sh_type, sh_flags, addr, size in sections
        if sh_type == SHT_NOBITS and (sh_flags & SHF_ALLOC) and size > 0
    ]

    found = []
    for p_type, p_vaddr, p_paddr, p_filesz, _p_memsz in segments:
        if p_type != PT_LOAD or p_filesz == 0:
            continue
        lo, hi = p_vaddr, p_vaddr + p_filesz
        for name, addr, size in blank:
            overlap = min(hi, addr + size) - max(lo, addr)
            if overlap > 0:
                found.append((p_vaddr, p_paddr, p_filesz, name, addr, size, overlap))
    return found


def find_elfs():
    """Release ELFs under target/, the way collect-artifacts finds .bin files."""
    out = []
    for subdir, _dirs, files in os.walk("target"):
        if os.sep + "release" not in subdir + os.sep:
            continue
        for name in files:
            if name.endswith(".elf"):
                out.append(os.path.join(subdir, name))
    return sorted(out)


def main(argv):
    paths = argv[1:] or find_elfs()

    # An empty run must never read as a pass. The defect this checks for is
    # a file that fails quietly; a checker that finds nothing and says
    # "all clear" would be the same bug in a different place.
    if not paths:
        print("ERROR: no ELF files to check.")
        print("Build at least one board first, or pass paths explicitly.")
        return -1

    bad = 0
    skipped = []
    for path in paths:
        try:
            found = violations(path)
        except (ValueError, IndexError, struct.error) as e:
            skipped.append((path, str(e)))
            continue
        if not found:
            continue
        bad += 1
        print("{}:".format(path))
        for p_vaddr, p_paddr, p_filesz, name, addr, size, overlap in found:
            print(
                "  PT_LOAD vaddr 0x{:x} paddr 0x{:x} claims 0x{:x} bytes of "
                "file content,".format(p_vaddr, p_paddr, p_filesz)
            )
            print(
                "  but 0x{:x} of them land in {} (NOBITS, 0x{:x} + 0x{:x}), "
                "which has none.".format(overlap, name, addr, size)
            )

    for path, why in skipped:
        print("Skipped {}: {}".format(path, why))

    # Every input unreadable is not a clean run either.
    if len(skipped) == len(paths):
        print("ERROR: no ELF file could be read.")
        return -1

    if bad > 0:
        print(
            "ERROR: {} ELF file(s) claim file content for uninitialized "
            "memory.".format(bad)
        )
        return -1

    print(
        "Checked {} ELF file(s); none claim file content for uninitialized "
        "memory.".format(len(paths) - len(skipped))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
