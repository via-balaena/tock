"""Enough Rust lexing to ask what a function body returns.

Two gates need the same thing: find a function by name and look at what its
body contains, without a comment or a string literal being able to lie about
it. A `//` line mentioning `Ok(())` must not make a body look like it can
return one, and a `{` inside a comment must not end a body early.

`mask()` blanks comment and string contents while preserving length, so
offsets from the masked copy index the original. `body_at()` brace-matches on
the masked copy.
"""

import re

__all__ = ["mask", "body_at"]


def mask(src):
    """Return `src` with comment and string bodies blanked, length preserved."""
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            while i < n and src[i] != "\n":
                out[i] = " "
                i += 1
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            depth = 1
            out[i] = out[i + 1] = " "
            i += 2
            while i < n and depth:
                if src[i : i + 2] == "/*":
                    depth += 1
                    out[i] = out[i + 1] = " "
                    i += 2
                elif src[i : i + 2] == "*/":
                    depth -= 1
                    out[i] = out[i + 1] = " "
                    i += 2
                else:
                    if src[i] != "\n":
                        out[i] = " "
                    i += 1
        elif c in "\"'":
            # A lifetime (`&'static`) is an apostrophe with no closing quote.
            if c == "'" and re.match(r"'[A-Za-z_][A-Za-z0-9_]*\b(?!')", src[i:]):
                i += 1
                continue
            quote = c
            i += 1
            while i < n and src[i] != quote:
                if src[i] == "\\":
                    out[i] = " "
                    i += 1
                if i < n:
                    if src[i] != "\n":
                        out[i] = " "
                    i += 1
            i += 1
        else:
            i += 1
    return "".join(out)


def body_at(masked, start):
    """The text between the braces of the block beginning at or after `start`."""
    open_at = masked.find("{", start)
    if open_at < 0:
        return None
    depth, i = 0, open_at
    while i < len(masked):
        if masked[i] == "{":
            depth += 1
        elif masked[i] == "}":
            depth -= 1
            if depth == 0:
                return masked[open_at + 1 : i]
        i += 1
    return None
