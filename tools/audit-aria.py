"""Verify there are no remaining icon Buttons without aria-label/title."""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

BACKSLASH = "\\"


def find_close(s: str, start: int) -> int:
    i, brace = start, 0
    in_str: str | None = None
    while i < len(s):
        c = s[i]
        if in_str is not None:
            if c == BACKSLASH and i + 1 < len(s):
                i += 2
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue
        if c in '"\'`':
            in_str = c
            i += 1
            continue
        if c == "{":
            brace += 1
        elif c == "}":
            brace -= 1
        elif c == ">" and brace == 0:
            return i
        i += 1
    return -1


def main() -> int:
    issues: list[tuple[str, int]] = []
    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except OSError:
            continue
        i = 0
        while i < len(content):
            idx = content.find("<Button", i)
            if idx < 0:
                break
            if idx > 0 and content[idx - 1].isalnum():
                i = idx + 1
                continue
            close = find_close(content, idx + 7)
            if close < 0:
                break
            attrs = content[idx + 7 : close]
            has_icon = bool(re.search(r'\bsize="icon', attrs))
            has_label = bool(re.search(r"\baria-label\s*=", attrs))
            has_title = bool(re.search(r"\btitle\s*=", attrs))
            if has_icon and not has_label and not has_title:
                line = content[:idx].count("\n") + 1
                issues.append((path, line))
            i = close + 1
    print(f"True missing aria-label icon Buttons: {len(issues)}")
    for p, ln in issues:
        print(f"  {p}:{ln}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
