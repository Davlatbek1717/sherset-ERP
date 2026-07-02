#!/usr/bin/env python3
"""
Apply moysklad-toolbar treatment to list pages.

Targeted minimal change per page:
1. `hideTitle` → `moyskladToolbar` (and add onRefresh/onHelp/selectionCount)
2. After `createLabel=...`, insert `createPosition="start"` if missing
3. Replace `formatMoney(x)` patterns with `formatMoney(x, 'UZS', { displayAs: 'none' })`
   in money cell renders (heuristic — only `<span ...tabular-nums">{formatMoney(...)}</span>`)

Run from repo root:
  python tools/apply-moysklad-toolbar.py
"""
import re
from pathlib import Path

PAGES = [
    'apps/web/src/app/(app)/payments-in/page.tsx',
    'apps/web/src/app/(app)/payments-out/page.tsx',
    'apps/web/src/app/(app)/cash-in/page.tsx',
    'apps/web/src/app/(app)/cash-out/page.tsx',
    'apps/web/src/app/(app)/purchase-orders/page.tsx',
    'apps/web/src/app/(app)/purchase-returns/page.tsx',
    'apps/web/src/app/(app)/supplies/page.tsx',
    'apps/web/src/app/(app)/invoices-in/page.tsx',
    'apps/web/src/app/(app)/counterparties/page.tsx',
    'apps/web/src/app/(app)/products/page.tsx',
    'apps/web/src/app/(app)/moves/page.tsx',
    'apps/web/src/app/(app)/losses/page.tsx',
    'apps/web/src/app/(app)/enters/page.tsx',
    'apps/web/src/app/(app)/inventories/page.tsx',
]


def transform(content: str, slug: str) -> str:
    """Apply the minimal moysklad toolbar treatment."""
    # 1. Replace `hideTitle` with full moysklad set when present.
    if 'moyskladToolbar' in content:
        # already migrated
        return content

    has_refetch = 'refetch' in content
    has_bulk = 'bulk.selectedIds' in content or 'bulk.bar' in content
    has_help = f"/help/{slug}"

    replacement_lines = ['      moyskladToolbar']
    if has_refetch:
        replacement_lines.append('      onRefresh={() => refetch()}')
    replacement_lines.append(f"      onHelp={{() => window.open('{has_help}', '_blank')}}")
    if has_bulk:
        replacement_lines.append('      selectionCount={bulk.selectedIds.size}')
    replacement = '\n'.join(replacement_lines)

    if 'hideTitle' in content:
        content = re.sub(r'^      hideTitle\s*$', replacement, content, count=1, flags=re.MULTILINE)
    else:
        # Insert before createHref / createLabel block.
        content = re.sub(
            r'(\n      createHref=)',
            f'\n{replacement}\\1',
            content,
            count=1,
        )

    # 2. Add createPosition='start' after createLabel if missing.
    if 'createPosition' not in content:
        content = re.sub(
            r'(createLabel=\{[^}]+\})',
            r'\1\n      createPosition="start"',
            content,
            count=1,
        )

    # 3. Wrap money-cell formatMoney(x) → formatMoney(x, 'UZS', { displayAs: 'none' })
    #    only inside cell renderers (heuristic: `>{formatMoney(<expr>)}<`).
    content = re.sub(
        r'\{formatMoney\(([^,)]+)\)\}',
        r"{formatMoney(\1, 'UZS', { displayAs: 'none' })}",
        content,
    )

    return content


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    changed = 0
    for rel in PAGES:
        path = root / rel
        if not path.exists():
            print(f'  skip (not found): {rel}')
            continue
        original = path.read_text(encoding='utf-8')
        slug = path.parent.name
        new = transform(original, slug)
        if new == original:
            print(f'  no-op: {rel}')
            continue
        path.write_text(new, encoding='utf-8')
        print(f'  patched: {rel}')
        changed += 1
    print(f'\n{changed}/{len(PAGES)} files patched')


if __name__ == '__main__':
    main()
