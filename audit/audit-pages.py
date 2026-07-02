"""Programmatic chrome audit — scan every list page and categorize."""
import os
import re
import sys
from pathlib import Path

# Force UTF-8 stdout (Windows console default cp1252 chokes on emoji/arrows).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('D:/projects/moysklad/apps/web/src/app/(app)')


def audit_page(path: Path) -> dict:
    """Return dict of feature flags for a page.tsx."""
    src = path.read_text(encoding='utf-8', errors='ignore')
    return {
        'uses_listview': '<ListView' in src,
        'moyskladToolbar': 'moyskladToolbar' in src,
        'has_filters_array': re.search(r'filters:\s*ListViewFilter\[\]\s*=', src) is not None,
        'has_inline_filter': 'InlineFilterPanel' in src or 'useMoyskladDocFilter' in src,
        'has_create_btn': 'createHref' in src or 'createLabel' in src,
        'has_filter_chevron': "filterOpen ? '▲'" in src,
        'rich_empty': 'richEmpty' in src,
        'state_filter': 'stateFilter' in src,
    }


pages = []
for p in sorted(ROOT.glob('*/page.tsx')):
    if 'new' in p.parent.name or '[id]' in p.parent.name:
        continue
    name = p.parent.name
    pages.append((name, audit_page(p)))

# Categorize
print('=== ALL LIST PAGES ===')
print(f"{'Page':<24} {'ListView':<9} {'Moysklad':<9} {'FilterArr':<10} {'InlinePnl':<10} {'CreateBtn':<10} {'Chevron':<8} {'Empty':<6} {'StateF':<7}")
for name, a in pages:
    print(f"{name:<24} {str(a['uses_listview']):<9} {str(a['moyskladToolbar']):<9} {str(a['has_filters_array']):<10} {str(a['has_inline_filter']):<10} {str(a['has_create_btn']):<10} {str(a['has_filter_chevron']):<8} {str(a['rich_empty']):<6} {str(a['state_filter']):<7}")

# Find inconsistencies
print('\n=== INCONSISTENCIES ===')
non_moysklad = [n for n, a in pages if a['uses_listview'] and not a['moyskladToolbar']]
print(f"Pages using ListView but NOT moyskladToolbar mode: {len(non_moysklad)}")
for n in non_moysklad:
    print(f"  - {n}")

state_no_tabs = [n for n, a in pages if a['state_filter'] and not a['has_filters_array']]
print(f"\nPages with stateFilter but NO FSM tabs: {len(state_no_tabs)}")
for n in state_no_tabs:
    print(f"  - {n}")

still_chevron = [n for n, a in pages if a['has_filter_chevron']]
print(f"\nPages STILL with ▲/▼ filter chevron: {len(still_chevron)}")
for n in still_chevron:
    print(f"  - {n}")

no_inline = [n for n, a in pages if a['uses_listview'] and a['moyskladToolbar'] and not a['has_inline_filter']]
print(f"\nMoysklad-mode pages without inline filter panel: {len(no_inline)}")
for n in no_inline:
    print(f"  - {n}")
