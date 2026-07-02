"""
Migrate every `useMutation({...})` whose options block has no `onError`
property to `useApiMutation({...})`. Scope: every page/component file
that imports `useMutation` from @tanstack/react-query.

Why a wrapper instead of editing each call site to add an inline
toast.error: 42 silent mutations across 30 files would each need an
import of useToast + an onError block — verbose and easy to forget. A
hook centralises the policy so future call sites only need to use the
right import.

Skip rules:
- File already uses useApiMutation / useSaveMutation / useDestructiveMutation
  on the same identifier — leave those alone.
- A mutation block already declares `onError` — caller chose explicit
  handling, respect it.
- Test files (*.test.ts).
"""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def find_block_close(s: str, start: int) -> int:
    """Find matching closing brace for the `{` at position `start`."""
    depth = 0
    in_str: str | None = None
    backslash = "\\"
    i = start
    while i < len(s):
        c = s[i]
        if in_str is not None:
            if c == backslash and i + 1 < len(s):
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
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def patch_file(path: str) -> int:
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return 0
    if "useMutation" not in content:
        return 0

    # Find every `useMutation({` with its full options block.
    new_content = ""
    last = 0
    n_patched = 0
    pattern = re.compile(r"\buseMutation\s*(?:<[^>]*>)?\s*\(\s*\{")
    for m in pattern.finditer(content):
        # Match starts at "useMutation"; the `{` is at m.end() - 1.
        brace_open = m.end() - 1
        brace_close = find_block_close(content, brace_open)
        if brace_close < 0:
            continue
        block = content[brace_open + 1 : brace_close]
        # Skip if this useMutation block already has onError.
        if re.search(r"\bonError\s*:", block):
            continue
        # Replace just the function name "useMutation" with "useApiMutation"
        new_content += content[last : m.start()]
        new_content += content[m.start() : m.end()].replace("useMutation", "useApiMutation", 1)
        last = m.end()
        n_patched += 1

    if n_patched == 0:
        return 0

    new_content += content[last:]

    # Add the import. Place it next to the existing tanstack import or
    # next to use-destructive-mutation if present.
    if "from '@/hooks/use-api-mutation'" not in new_content:
        if "from '@/hooks/use-destructive-mutation';" in new_content:
            new_content = new_content.replace(
                "from '@/hooks/use-destructive-mutation';",
                "from '@/hooks/use-destructive-mutation';\n"
                "import { useApiMutation } from '@/hooks/use-api-mutation';",
                1,
            )
        elif "from '@/hooks/use-save-mutation';" in new_content:
            new_content = new_content.replace(
                "from '@/hooks/use-save-mutation';",
                "from '@/hooks/use-save-mutation';\n"
                "import { useApiMutation } from '@/hooks/use-api-mutation';",
                1,
            )
        else:
            # Insert after the @tanstack/react-query import line.
            new_content = re.sub(
                r"(import\s+\{[^}]*\}\s+from\s+'@tanstack/react-query';\n)",
                r"\1import { useApiMutation } from '@/hooks/use-api-mutation';\n",
                new_content,
                count=1,
            )

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)
    return n_patched


def main() -> int:
    total = 0
    files_touched = 0
    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        if path.endswith(".test.tsx"):
            continue
        n = patch_file(path)
        if n > 0:
            files_touched += 1
            print(f"  + {path}: {n} mutation(s) wrapped")
            total += n
    for path in glob.glob("apps/web/src/**/*.ts", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        if path.endswith(".test.ts"):
            continue
        if "use-api-mutation.ts" in path or "use-save-mutation.ts" in path:
            continue
        n = patch_file(path)
        if n > 0:
            files_touched += 1
            print(f"  + {path}: {n} mutation(s) wrapped")
            total += n
    print(f"\n{total} silent mutations wrapped in useApiMutation across {files_touched} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
