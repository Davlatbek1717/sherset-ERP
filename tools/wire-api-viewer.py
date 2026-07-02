#!/usr/bin/env python3
"""
Wire the apiData prop on every detail page that already uses
DetailToolbar — DetailToolbar owns the modal state internally so each
page just has to pass the loaded document object.

Skips:
  - customer-orders (already done manually as the reference impl)
  - opportunities / pipelines / tasks (custom CRM layouts)

Idempotent.
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('D:/projects/moysklad/apps/web/src/app/(app)')
SKIP = {'customer-orders', 'opportunities', 'pipelines', 'tasks'}


def patch(path: Path) -> tuple[bool, str]:
    src = path.read_text(encoding='utf-8')

    # idempotent skip
    if 'apiData=' in src:
        return True, 'already wired'

    # Anchor: the line `        onNext={detailNav.onNext}` injected by
    # the Sprint A1 sweep. We add `apiData={data}` right after it.
    anchor = '        onNext={detailNav.onNext}\n'
    if anchor not in src:
        return False, 'detail-nav anchor not found (Sprint A1 missing?)'

    src = src.replace(
        anchor,
        anchor + '        apiData={data}\n',
        1,
    )

    path.write_text(src, encoding='utf-8')
    return True, 'wired'


def main() -> int:
    rc = 0
    for entity_dir in sorted([d for d in ROOT.iterdir() if d.is_dir() and not d.name.startswith('(')]):
        if entity_dir.name in SKIP:
            continue
        page = entity_dir / '[id]' / 'page.tsx'
        if not page.exists():
            continue
        ok, msg = patch(page)
        flag = 'OK ' if ok else 'ERR'
        print(f'{flag} {entity_dir.name:<22} {msg}')
        if not ok:
            rc = 1
    return rc


if __name__ == '__main__':
    sys.exit(main())
