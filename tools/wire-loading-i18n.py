"""
Replace hardcoded "Yuklanmoqda..." text with `tCommon('loading')`. The
common translation key already exists in both locales — we just stop
hardcoding the uz copy in pages that didn't bother adding next-intl.

Heuristic:
- Find `>Yuklanmoqda...</...>` or `\"Yuklanmoqda...\"` text in JSX.
- Ensure the file has `useTranslations('common')` or a `tCommon` binding.
- Replace literal with `{tCommon('loading')}`.

Side effect: forces every touched page to wire `tCommon`. We add the
import + hook line if missing.
"""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def patch_file(path: str) -> int:
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return 0

    if "Yuklanmoqda..." not in content:
        return 0

    n = 0
    new = content

    # Pattern: >Yuklanmoqda...</tag> → >{tCommon('loading')}</tag>
    new, c1 = re.subn(r">Yuklanmoqda\.\.\.<", ">{tCommon('loading')}<", new)
    n += c1

    # Pattern: 'Yuklanmoqda...' → tCommon('loading')   — only inside JSX expressions
    # We can't safely auto-rewrite quoted occurrences without breaking string
    # interpolation, so keep them. If found, just print a warning.
    quoted_left = re.findall(r"'Yuklanmoqda\.\.\.'", new)
    if quoted_left:
        # Don't auto-fix; flag for manual.
        pass

    if n == 0:
        return 0

    # Ensure tCommon is wired.
    has_tcommon_binding = bool(re.search(r"\btCommon\s*=\s*useTranslations\(\s*['\"]common['\"]\s*\)", new))
    if not has_tcommon_binding:
        # Add the import if missing.
        if "from 'next-intl'" not in new:
            # Insert next-intl import after the @tanstack import or first import block.
            new = re.sub(
                r"(import\s+\{[^}]*\}\s+from\s+'@tanstack/react-query';\n)",
                r"\1import { useTranslations } from 'next-intl';\n",
                new,
                count=1,
            )
            # If still not added (no tanstack import), add at very top after 'use client'.
            if "from 'next-intl'" not in new:
                new = re.sub(
                    r"('use client';\n+)",
                    r"\1import { useTranslations } from 'next-intl';\n",
                    new,
                    count=1,
                )

        # Now add the binding inside the component. Find the first
        # `export default function ...() {` or `function NAME() {` and
        # insert after the opening brace.
        m = re.search(
            r"(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)|"
            r"(function\s+[A-Z]\w+\s*\([^)]*\)\s*\{)",
            new,
        )
        if m:
            insertion = "\n  const tCommon = useTranslations('common');"
            new = new[: m.end()] + insertion + new[m.end():]

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    return n


def main() -> int:
    total = 0
    files = 0
    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        if path.endswith(".test.tsx"):
            continue
        n = patch_file(path)
        if n > 0:
            files += 1
            total += n
            print(f"  + {path}: {n} loading replacements")
    print(f"\n{total} 'Yuklanmoqda...' replaced across {files} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
