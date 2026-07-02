"""
Migrate raw form elements (`<select>`, `<textarea>`) and the per-page
`SELECT_CLASS` / `INPUT_CLASS` consts to design-system primitives.

Strategy:
- `<select className={SELECT_CLASS}>` → `<NativeSelect>` (drop-in,
  same `<option>` children, value/onChange unchanged)
- Raw `<select>` with no shared className → also `<NativeSelect>` so
  every dropdown has consistent focus ring + chevron + hover border
- `<textarea ... />` → `<Textarea>` (drop-in)
- `<input ... className={INPUT_CLASS}>` → `<Input>` (drop-in)

After migration:
- Remove dangling `const SELECT_CLASS = ...` and `const INPUT_CLASS = ...`
- Add the missing primitive imports

Idempotent: skips files that already use the primitive on the same line.
"""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def patch_file(path: str) -> dict[str, int]:
    counts = {"select": 0, "textarea": 0, "input": 0, "const": 0}
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return counts

    new = content

    # 1. <select> → <NativeSelect>. Match opening + closing tag.
    new, n = re.subn(r"<select(\s)", r"<NativeSelect\1", new)
    counts["select"] = n
    new = re.sub(r"</select>", "</NativeSelect>", new)

    # 2. <textarea> → <Textarea>. Both self-closing and paired.
    new, n = re.subn(r"<textarea(\s)", r"<Textarea\1", new)
    counts["textarea"] = n
    new = re.sub(r"</textarea>", "</Textarea>", new)

    # 3. <input className={INPUT_CLASS}> patterns → <Input>. Only swap when
    # className is exactly the const reference — otherwise the input has
    # custom styling we should leave alone.
    new, n = re.subn(
        r"<input(\s+[^>]*className=\{INPUT_CLASS\}[^>]*?)\s*/>",
        r"<Input\1 />",
        new,
    )
    counts["input"] = n
    new, n2 = re.subn(
        r"<input(\s+[^>]*className=\{INPUT_CLASS\}[^>]*?)>",
        r"<Input\1>",
        new,
    )
    counts["input"] += n2

    # 4. Drop the now-unused INPUT_CLASS / SELECT_CLASS const lines.
    # They're typically a single multiline const followed by `;`.
    for cls in ["INPUT_CLASS", "SELECT_CLASS"]:
        # Match `const NAME = '...';` or backtick-template across lines
        pat = re.compile(
            rf"const\s+{cls}\s*=\s*(?:'[^']*'|\"[^\"]*\"|`[^`]*`)\s*;\s*\n",
            re.DOTALL,
        )
        if cls in new:
            # Only drop if the const isn't referenced anywhere else after the migration.
            usage_after = len(re.findall(rf"\b{cls}\b", new))
            decl_count = len(pat.findall(new))
            if usage_after - decl_count == 0:
                new, dropped = pat.subn("", new)
                counts["const"] += dropped

    if new == content:
        return counts

    # Add primitive imports if used.
    needs = []
    if "<NativeSelect" in new and "NativeSelect" not in content:
        needs.append("NativeSelect")
    if "<Textarea" in new and "Textarea," not in content and "Textarea }" not in content:
        # Don't add if already imported (some pages already had Textarea import).
        if not re.search(r"\bTextarea\b\s*,", content) and not re.search(
            r"import\s+\{[^}]*\bTextarea\b", content
        ):
            needs.append("Textarea")
    if "<Input" in new and "<Input" not in content:
        if "Input," not in content and not re.search(r"\bInput\b\s*[,}]", content):
            needs.append("Input")

    for name in needs:
        # Add to existing @moysklad/ui import block. Pattern: `from '@moysklad/ui'`
        pattern = re.compile(r"(import\s+\{)([^}]*)(\}\s+from\s+'@moysklad/ui';)")
        m = pattern.search(new)
        if m:
            inside = m.group(2)
            # Append the new name at the end
            new_inside = inside.rstrip().rstrip(",") + ",\n  " + name + ",\n"
            new = new[: m.start()] + m.group(1) + new_inside + m.group(3) + new[m.end():]

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    return counts


def main() -> int:
    totals = {"select": 0, "textarea": 0, "input": 0, "const": 0, "files": 0}
    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        if path.endswith(".test.tsx"):
            continue
        c = patch_file(path)
        if any(c.values()):
            totals["files"] += 1
            for k in ("select", "textarea", "input", "const"):
                totals[k] += c[k]
            print(f"  + {path}: select={c['select']} textarea={c['textarea']} input={c['input']} const={c['const']}")

    print(
        f"\nTotal: {totals['files']} files | "
        f"{totals['select']} <select> | {totals['textarea']} <textarea> | "
        f"{totals['input']} <input> | {totals['const']} consts removed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
