"""
Smart `<input className={INPUT_CLASS}>` → `<Input>` migration that
correctly walks past `=>` arrow functions and `{...}` expressions inside
multi-line JSX tags. Same approach as `tools/fix-aria-labels.py`.

Also drops the dangling `const INPUT_CLASS = ...;` and `const SELECT_CLASS
= INPUT_CLASS;` declarations once they are unreferenced.
"""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

BACKSLASH = "\\"


def find_close(s: str, start: int) -> int:
    """Find the closing `>` of a JSX opening tag. Skips `>` inside `{...}`
    blocks and quoted strings."""
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


def patch_file(path: str) -> dict[str, int]:
    counts = {"input": 0, "const": 0}
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return counts

    # Find every <input ... > (or <input ... /> for self-closing) and rename
    # to <Input> when its className references INPUT_CLASS.
    out: list[str] = []
    i = 0
    while i < len(content):
        idx = content.find("<input", i)
        if idx < 0:
            out.append(content[i:])
            break
        # Word-boundary check: char after must not be alphanum (so we
        # don't match a hypothetical `<inputfield>`).
        end_of_tagname = idx + len("<input")
        if end_of_tagname < len(content) and content[end_of_tagname].isalnum():
            out.append(content[i : end_of_tagname])
            i = end_of_tagname
            continue
        close = find_close(content, end_of_tagname)
        if close < 0:
            out.append(content[i:])
            break
        attrs = content[end_of_tagname:close]
        if "className={INPUT_CLASS}" in attrs:
            # Check if it's self-closing — last non-whitespace char before `>`
            # is `/`. We want to preserve that.
            new_attrs = attrs
            out.append(content[i:idx])
            out.append("<Input")
            out.append(new_attrs)
            out.append(">")
            i = close + 1
            counts["input"] += 1
        else:
            out.append(content[i : close + 1])
            i = close + 1
    new = "".join(out)

    # Also handle </input> if any (rare — usually self-closing)
    new = new.replace("</input>", "</Input>")

    # Drop unused INPUT_CLASS / SELECT_CLASS consts.
    for cls in ["INPUT_CLASS", "SELECT_CLASS"]:
        ref_count = len(re.findall(rf"\b{cls}\b", new))
        decl_pat = re.compile(
            rf"^\s*const\s+{cls}\s*=[^;]*;\s*\n",
            re.MULTILINE | re.DOTALL,
        )
        decls = decl_pat.findall(new)
        if ref_count == len(decls):
            new, dropped = decl_pat.subn("", new)
            counts["const"] += dropped

    if new == content:
        return counts

    # Add Input import if needed.
    if "<Input" in new and "<Input" not in content:
        # Add to existing @moysklad/ui import.
        m = re.search(r"(import\s+\{)([^}]*)(\}\s+from\s+'@moysklad/ui';)", new)
        if m and "Input" not in m.group(2):
            new = (
                new[: m.start()]
                + m.group(1)
                + m.group(2).rstrip().rstrip(",")
                + ",\n  Input,\n"
                + m.group(3)
                + new[m.end():]
            )

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    return counts


def main() -> int:
    totals = {"input": 0, "const": 0, "files": 0}
    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        if path.endswith(".test.tsx"):
            continue
        c = patch_file(path)
        if any(c.values()):
            totals["files"] += 1
            totals["input"] += c["input"]
            totals["const"] += c["const"]
            print(f"  + {path}: input={c['input']} const={c['const']}")
    print(f"\n{totals['input']} <input> migrated, {totals['const']} consts removed across {totals['files']} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
