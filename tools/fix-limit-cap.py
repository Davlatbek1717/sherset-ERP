"""
Bump every list-filter schema's `.max(100)` to `.max(500)` so the
production list pages (which request `limit=200` to fit a full page on
screen without paginate-clicks) no longer trip Zod validation.

The current cap was hard-set to 100 in the original schema scaffold.
Frontend list pages have used 200 since Sprint 5; the mismatch became
visible the moment we ran the local server with real data.

Why bump to 500 not 200: leaves headroom for an admin who pastes a
larger limit into the URL bar without breaking server-side defaults.
500 rows is still well within Postgres / heap limits at our scale
(< 1 MB JSON for typical document rows).
"""

from __future__ import annotations

import glob
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def main() -> int:
    fixed = 0
    files = 0
    for path in glob.glob("apps/api/src/**/*.schema.ts", recursive=True):
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        new_content, n = re.subn(
            r"(limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.)max\(100\)",
            r"\1max(500)",
            content,
        )
        if n > 0:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(new_content)
            files += 1
            fixed += n
            print(f"  + {path}: {n} cap(s) raised")
    print(f"\n{fixed} `.max(100)` → `.max(500)` across {files} schema files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
