"""
One-shot aria-label patcher for icon-only Buttons. Walks every .tsx under
apps/web/src and finds `<Button ...>` tags carrying `size="icon..."` but
neither `aria-label=` nor `title=`. Adds `aria-label="Qatorni o'chirish"`
to those — they're all row-removal buttons in the position editor lists.

The regex-only approach broke earlier because `[^>]*` stops at the first
`>` and a multi-line button typically has `=>` arrow functions inside the
onClick handler. This walker correctly tracks `{...}` brace depth and
string boundaries when scanning to the closing `>` of the JSX tag.
"""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def find_button_close(s: str, start: int) -> int:
    """Scan forward from `start` (inside `<Button ...`) and return the index
    of the closing `>` of the JSX opening tag, ignoring `>` inside braces
    or quoted strings."""
    i = start
    depth_brace = 0
    in_string: str | None = None
    backslash = "\\"
    while i < len(s):
        c = s[i]
        if in_string is not None:
            if c == backslash and i + 1 < len(s):
                i += 2
                continue
            if c == in_string:
                in_string = None
            i += 1
            continue
        if c in '"\'`':
            in_string = c
            i += 1
            continue
        if c == "{":
            depth_brace += 1
        elif c == "}":
            depth_brace -= 1
        elif c == ">" and depth_brace == 0:
            return i
        i += 1
    return -1


def main() -> int:
    fixes = 0
    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except OSError:
            continue

        new_content: list[str] = []
        i = 0
        changed = False
        while i < len(content):
            idx = content.find("<Button", i)
            if idx < 0:
                new_content.append(content[i:])
                break
            if idx > 0 and content[idx - 1].isalnum():
                new_content.append(content[i : idx + 1])
                i = idx + 1
                continue
            close = find_button_close(content, idx + len("<Button"))
            if close < 0:
                new_content.append(content[i:])
                break
            attrs = content[idx + len("<Button") : close]
            has_icon = bool(re.search(r'\bsize="icon', attrs))
            has_label = bool(re.search(r"\baria-label\s*=", attrs))
            has_title = bool(re.search(r"\btitle\s*=", attrs))
            if has_icon and not has_label and not has_title:
                line_start = content.rfind("\n", 0, close) + 1
                indent = content[line_start:close]
                # Drop the closing-trim portion if attrs already ends with whitespace
                insert = f"\n{indent}aria-label=\"Qatorni o'chirish\""
                new_content.append(content[i:close])
                new_content.append(insert)
                new_content.append(">")
                i = close + 1
                fixes += 1
                changed = True
            else:
                new_content.append(content[i : close + 1])
                i = close + 1

        if changed:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write("".join(new_content))

    print(f"Patched {fixes} buttons")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
