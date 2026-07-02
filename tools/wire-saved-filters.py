#!/usr/bin/env python3
"""
Replace the stub `<SavedFiltersPills entity="..." currentQueryString=""
onApply={() => undefined} />` pattern with a real wire-up that uses
`params.toString()` for the current query and the shared
`filterFromQueryString` decoder for `onApply`.

Skips any file that doesn't have the stub pattern (idempotent).
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('D:/projects/moysklad/apps/web/src/app/(app)')

IMPORT_LINE = "import { filterFromQueryString } from '@/lib/filter-from-query';"

STUB_RE = re.compile(
    r'<SavedFiltersPills entity="(?P<entity>[a-z]+)" currentQueryString="" onApply=\{\(\) => undefined\} />',
)


def replacement(entity: str) -> str:
    return (
        f'<SavedFiltersPills\n'
        f'              entity="{entity}"\n'
        f'              currentQueryString={{params.toString()}}\n'
        f'              onApply={{(qs) => {{\n'
        f'                setFilterValues(filterFromQueryString(qs));\n'
        f'                setCursor(undefined);\n'
        f'              }}}}\n'
        f'            />'
    )


def patch(path: Path) -> tuple[bool, str]:
    src = path.read_text(encoding='utf-8')

    if not STUB_RE.search(src):
        return True, 'no stub (skip)'

    # Add import once, just below the existing SavedFiltersPills import.
    if IMPORT_LINE not in src:
        anchor = "import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';\n"
        if anchor not in src:
            return False, 'no SavedFiltersPills import anchor'
        src = src.replace(anchor, anchor + IMPORT_LINE + '\n', 1)

    # Replace each stub with the real wire-up.
    src = STUB_RE.sub(lambda m: replacement(m.group('entity')), src)

    path.write_text(src, encoding='utf-8')
    return True, 'wired'


def main() -> int:
    rc = 0
    for entity_dir in sorted([d for d in ROOT.iterdir() if d.is_dir() and not d.name.startswith('(')]):
        page = entity_dir / 'page.tsx'
        if not page.exists():
            continue
        ok, msg = patch(page)
        if msg == 'no stub (skip)':
            continue
        flag = 'OK ' if ok else 'ERR'
        print(f'{flag} {entity_dir.name:<22} {msg}')
        if not ok:
            rc = 1
    return rc


if __name__ == '__main__':
    sys.exit(main())
