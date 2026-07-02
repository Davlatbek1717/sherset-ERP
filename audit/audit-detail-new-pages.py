"""Programmatic audit of detail [id] and create new pages for chrome consistency."""
import re
import sys
from pathlib import Path

# Force UTF-8 stdout (Windows console default cp1252 chokes on arrows).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('D:/projects/moysklad/apps/web/src/app/(app)')


def audit_detail(path: Path) -> dict:
    src = path.read_text(encoding='utf-8', errors='ignore')
    return {
        'uses_detail_toolbar': 'DetailToolbar' in src,
        'uses_detail_header': 'DetailHeader' in src,
        'has_save_btn': 'onSave=' in src or 'onSave:' in src,
        'has_position_pagination': 'position={' in src,
        'has_unsaved_guard': 'useUnsavedGuard' in src or 'UnsavedChangesGuard' in src,
        'has_audit_log_tab': 'DocumentTabs' in src or 'HistoryTimeline' in src,
        'has_position_editor': 'PositionEditor' in src,
    }


def audit_new(path: Path) -> dict:
    src = path.read_text(encoding='utf-8', errors='ignore')
    return {
        'uses_edit_form': 'EditForm' in src,
        'uses_form_field': 'FormField' in src,
        'has_save_mutation': 'useSaveMutation' in src or 'useApiMutation' in src,
    }


details = []
news = []
for entity in sorted([d for d in ROOT.iterdir() if d.is_dir() and not d.name.startswith('(')]):
    detail_page = entity / '[id]' / 'page.tsx'
    new_page = entity / 'new' / 'page.tsx'
    if detail_page.exists():
        details.append((entity.name, audit_detail(detail_page)))
    if new_page.exists():
        news.append((entity.name, audit_new(new_page)))

# Detail report
print('=== DETAIL PAGES (entity/[id]/page.tsx) ===')
print(f"{'Entity':<22} {'Toolbar':<8} {'Header':<7} {'Save':<5} {'Pages':<6} {'Guard':<6} {'Audit':<6} {'Pos':<4}")
for name, a in details:
    print(f"{name:<22} {str(a['uses_detail_toolbar']):<8} {str(a['uses_detail_header']):<7} {str(a['has_save_btn']):<5} {str(a['has_position_pagination']):<6} {str(a['has_unsaved_guard']):<6} {str(a['has_audit_log_tab']):<6} {str(a['has_position_editor']):<4}")

# Inconsistencies
no_toolbar = [n for n, a in details if not a['uses_detail_toolbar']]
no_header = [n for n, a in details if not a['uses_detail_header']]
no_guard = [n for n, a in details if not a['has_unsaved_guard']]
no_audit = [n for n, a in details if not a['has_audit_log_tab']]
no_pagination = [n for n, a in details if not a['has_position_pagination']]

print(f"\n=== DETAIL INCONSISTENCIES ===")
print(f"No DetailToolbar: {len(no_toolbar)} → {no_toolbar}")
print(f"No DetailHeader: {len(no_header)} → {no_header}")
print(f"No UnsavedGuard: {len(no_guard)} → {no_guard}")
print(f"No DocumentTabs/HistoryTimeline: {len(no_audit)} → {no_audit}")
print(f"No 1-of-N pagination: {len(no_pagination)}/{len(details)} (P1 gap, ALL detail pages)")

# New pages report
print('\n=== NEW PAGES (entity/new/page.tsx) ===')
print(f"{'Entity':<22} {'EditForm':<9} {'FormField':<10} {'SaveMut':<8}")
for name, a in news:
    print(f"{name:<22} {str(a['uses_edit_form']):<9} {str(a['uses_form_field']):<10} {str(a['has_save_mutation']):<8}")

no_editform = [n for n, a in news if not a['uses_edit_form']]
no_formfield = [n for n, a in news if not a['uses_form_field']]
print(f"\n=== NEW PAGE INCONSISTENCIES ===")
print(f"No EditForm: {len(no_editform)} → {no_editform}")
print(f"No FormField: {len(no_formfield)} → {no_formfield}")
