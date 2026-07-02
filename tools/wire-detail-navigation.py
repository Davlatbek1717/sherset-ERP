#!/usr/bin/env python3
"""
Wire useDetailNavigation hook into every detail page that already
uses DetailToolbar — adds import, hook call, and 3 props to the
toolbar so prev/next "1 of N" pagination lights up automatically.

Skips:
  - customer-orders (already done manually as the reference impl)
  - opportunities / pipelines / tasks (custom CRM layouts — no DetailToolbar)

Idempotent: re-runs are a no-op.
"""
import re
import sys
from pathlib import Path

# Force UTF-8 stdout for Windows console.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('D:/projects/moysklad/apps/web/src/app/(app)')

SKIP = {'customer-orders', 'opportunities', 'pipelines', 'tasks'}

IMPORT_LINE = "import { useDetailNavigation } from '@/hooks/use-detail-navigation';"
PROPS_BLOCK_TEMPLATE = (
    "        position={detailNav.position}\n"
    "        onPrev={detailNav.onPrev}\n"
    "        onNext={detailNav.onNext}\n"
)


def patch(path: Path, entity_key: str) -> tuple[bool, str]:
    src = path.read_text(encoding='utf-8')
    original = src

    # 1) Add the import — slot it next to the other @/hooks/* imports.
    if IMPORT_LINE in src:
        # already present — idempotent skip
        pass
    else:
        # find any @/hooks/use-* import and add the new line right
        # before it (alphabetical-ish placement, keeps diffs small).
        m = re.search(r"^(import [^\n]+ from '@/hooks/use-save-mutation';)", src, re.M)
        if not m:
            # fallback to use-api-mutation
            m = re.search(r"^(import [^\n]+ from '@/hooks/use-api-mutation';)", src, re.M)
        if not m:
            # fallback to first @/hooks/* import
            m = re.search(r"^(import [^\n]+ from '@/hooks/use-[a-z-]+';)", src, re.M)
        if not m:
            return False, 'no @/hooks import found'
        insert_at = m.start()
        src = src[:insert_at] + IMPORT_LINE + '\n' + src[insert_at:]

    # 2) Add the hook call after `const { id } = useParams<{ id: string }>();`
    hook_call = f"  const detailNav = useDetailNavigation('{entity_key}', id);"
    if hook_call in src:
        pass
    else:
        m = re.search(
            r"^(  const \{ id \} = useParams<\{ id: string \}>\(\);)",
            src,
            re.M,
        )
        if not m:
            return False, 'useParams<{ id: string }> not found'
        end = m.end()
        src = src[:end] + '\n' + hook_call + src[end:]

    # 3) Add position/onPrev/onNext props inside the <DetailToolbar ...>
    #    block. We look for the existing onSave={...} line as the
    #    anchor and inject right before onClone={...} or after onClose
    #    (whichever is more reliable).
    if 'position={detailNav.position}' in src:
        pass
    else:
        # Anchor: the line containing onClose={...} inside the
        # DetailToolbar prop list. Insert the 3 props on the next line.
        # We scope the search to the DetailToolbar JSX block.
        # Strategy: find `<DetailToolbar` then locate the first `onClose=`
        # following it.
        toolbar_match = re.search(
            r"(<DetailToolbar\b[^<]*?\n        onClose=\{[^\n]*\}\r?\n)",
            src,
            re.S,
        )
        if not toolbar_match:
            return False, '<DetailToolbar ... onClose={...}> not found'
        end = toolbar_match.end()
        src = src[:end] + PROPS_BLOCK_TEMPLATE + src[end:]

    if src == original:
        return True, 'already wired (idempotent skip)'

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
        ok, msg = patch(page, entity_dir.name)
        flag = 'OK ' if ok else 'ERR'
        print(f'{flag} {entity_dir.name:<22} {msg}')
        if not ok:
            rc = 1
    return rc


if __name__ == '__main__':
    sys.exit(main())
