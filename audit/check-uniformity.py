"""Verify behavior uniformity across detail/list/new pages.

Checks each page for the standard hooks/handlers it should use to
guarantee consistent UX across the app:
  - useSaveMutation       (every detail page that has a Save button)
  - useDestructiveMutation (every Delete handler)
  - useUnsavedGuard       (every form-bearing detail page)
  - useApiMutation        (FSM transitions, archive, restore)
  - useBulkDocumentActions (every list page)
  - useDetailNavigation   (every detail page that uses DetailToolbar)

Also verifies controller-side conventions:
  - @UseGuards(JwtAuthGuard) on every controller
  - accountId scope in every Prisma query inside services
  - BigInt -> string conversion in JSON outputs

Outputs an inconsistency report — pages that diverge from the
standard need either a fix or a documented exception.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

WEB = Path('D:/projects/moysklad/apps/web/src/app/(app)')
API = Path('D:/projects/moysklad/apps/api/src/modules')

# Detail pages where the full CRUD/FSM toolbar is expected.
DETAIL_TOOLBAR_ENTITIES = {
    'cash-in', 'cash-out', 'counterparties', 'customer-orders',
    'demands', 'enters', 'inventories', 'invoices-in', 'invoices-out',
    'losses', 'moves', 'payments-in', 'payments-out', 'products',
    'purchase-orders', 'purchase-returns', 'sales-returns', 'supplies',
}

# Detail pages with custom layouts (no DetailToolbar by design).
CUSTOM_DETAIL_ENTITIES = {'opportunities', 'pipelines', 'tasks'}

# Entities with FSM (post / unpost transitions).
FSM_ENTITIES = {
    'customer-orders', 'demands', 'invoices-out', 'sales-returns',
    'purchase-orders', 'supplies', 'invoices-in', 'purchase-returns',
    'enters', 'losses', 'moves', 'inventories',
    'cash-in', 'cash-out', 'payments-in', 'payments-out',
}


def check_detail_page(entity: str, path: Path) -> dict:
    """Return {check_name: bool} for a detail page."""
    src = path.read_text(encoding='utf-8', errors='ignore')
    is_custom = entity in CUSTOM_DETAIL_ENTITIES
    return {
        'has_DetailToolbar': 'DetailToolbar' in src,
        'has_DetailHeader': 'DetailHeader' in src,
        'uses_useSaveMutation': 'useSaveMutation' in src,
        'uses_useUnsavedGuard': 'useUnsavedGuard' in src,
        'uses_useDestructiveMutation': 'useDestructiveMutation' in src,
        'uses_useApiMutation': 'useApiMutation' in src,
        'uses_useDetailNavigation': 'useDetailNavigation' in src or is_custom,
        'has_apiData_prop': 'apiData={data}' in src or 'apiData=' in src,
        'is_custom_layout': is_custom,
    }


def check_list_page(entity: str, path: Path) -> dict:
    src = path.read_text(encoding='utf-8', errors='ignore')
    return {
        'uses_ListView': '<ListView' in src,
        'uses_moyskladToolbar': 'moyskladToolbar' in src,
        'uses_useBulkDocumentActions': 'useBulkDocumentActions' in src,
        'uses_useColumnVisibility': 'useColumnVisibility' in src,
        'has_search': 'useDebounce' in src or 'searchInput' in src,
        'has_pagination': 'cursor' in src or 'nextCursor' in src,
        'has_SavedFilters': 'SavedFiltersPills' in src,
    }


def check_new_page(entity: str, path: Path) -> dict:
    src = path.read_text(encoding='utf-8', errors='ignore')
    return {
        'uses_EditForm': 'EditForm' in src,
        'uses_FormField': 'FormField' in src,
        'uses_save_mutation': (
            'useSaveMutation' in src or 'useApiMutation' in src or 'useMutation' in src
        ),
    }


def check_controller(mod: Path) -> dict:
    """Verify NestJS controller conventions."""
    out = {
        'has_JwtAuthGuard': False,
        'has_RequirePermission': False,
        'has_CurrentUser': False,
    }
    for f in mod.glob('*.controller.ts'):
        src = f.read_text(encoding='utf-8', errors='ignore')
        if 'JwtAuthGuard' in src:
            out['has_JwtAuthGuard'] = True
        if 'RequirePermission' in src:
            out['has_RequirePermission'] = True
        if 'CurrentUser' in src:
            out['has_CurrentUser'] = True
    return out


def check_service(mod: Path) -> dict:
    """Verify NestJS service tenant conventions.

    Note: BigInt JSON serialization is handled GLOBALLY in
    apps/api/src/main.ts via `BigInt.prototype.toJSON`, so every
    Prisma response converts bigint -> string regardless of whether
    the per-module service has explicit conversion. We don't check
    that per-module here — it would always be a false positive.
    """
    out = {
        'uses_accountId': False,
        'uses_RLS_helper': False,
    }
    for f in mod.glob('*.service.ts'):
        src = f.read_text(encoding='utf-8', errors='ignore')
        if 'accountId' in src:
            out['uses_accountId'] = True
        if re.search(r'set_app\.account_id|withRls|rlsContext|rls\.', src):
            out['uses_RLS_helper'] = True
    return out


def has_global_bigint_serializer() -> bool:
    """Verify the global BigInt -> string hook is installed in main.ts."""
    main_ts = Path('D:/projects/moysklad/apps/api/src/main.ts').read_text(
        encoding='utf-8', errors='ignore',
    )
    return 'BigInt.prototype' in main_ts and 'toJSON' in main_ts


def main():
    detail_results = {}
    list_results = {}
    new_results = {}

    # Frontend audit
    for entity in sorted(d.name for d in WEB.iterdir() if d.is_dir() and not d.name.startswith('(')):
        list_p = WEB / entity / 'page.tsx'
        det_p = WEB / entity / '[id]' / 'page.tsx'
        new_p = WEB / entity / 'new' / 'page.tsx'
        if list_p.exists():
            list_results[entity] = check_list_page(entity, list_p)
        if det_p.exists():
            detail_results[entity] = check_detail_page(entity, det_p)
        if new_p.exists():
            new_results[entity] = check_new_page(entity, new_p)

    # Backend audit (frontend-reachable modules only)
    backend_results = {}
    for mod_name in [
        'cash-in', 'cash-out', 'counterparty', 'customer-order',
        'demand', 'enter', 'inventory', 'invoice-in', 'invoice-out',
        'loss', 'move', 'payment-in', 'payment-out', 'product',
        'purchase-order', 'purchase-return', 'sales-return', 'supply',
        'opportunity', 'pipeline', 'task', 'call', 'service-desk',
        'bundle', 'variant', 'product-folder', 'price-type',
    ]:
        mod = API / mod_name
        if not mod.is_dir():
            continue
        backend_results[mod_name] = {**check_controller(mod), **check_service(mod)}

    # Print report
    print('=== DETAIL PAGE UNIFORMITY ===')
    print(f'{"Entity":<22} {"Toolbar":<8} {"Header":<7} {"Save":<5} {"Guard":<6} {"Destrm":<7} {"FSM":<4} {"Nav":<4} {"Api":<4}')
    print('-' * 80)
    for entity, r in sorted(detail_results.items()):
        marks = (
            r['has_DetailToolbar'], r['has_DetailHeader'],
            r['uses_useSaveMutation'], r['uses_useUnsavedGuard'],
            r['uses_useDestructiveMutation'], r['uses_useApiMutation'],
            r['uses_useDetailNavigation'], r['has_apiData_prop'],
        )
        chars = ['+' if m else '-' for m in marks]
        prefix = '*' if r['is_custom_layout'] else ' '
        print(f'{prefix}{entity:<21} {chars[0]:<8} {chars[1]:<7} {chars[2]:<5} {chars[3]:<6} {chars[4]:<7} {chars[5]:<4} {chars[6]:<4} {chars[7]:<4}')

    print('\n=== DETAIL INCONSISTENCIES ===')
    for check in ['has_DetailToolbar', 'has_DetailHeader', 'uses_useSaveMutation',
                  'uses_useUnsavedGuard', 'uses_useDestructiveMutation', 'uses_useApiMutation',
                  'uses_useDetailNavigation', 'has_apiData_prop']:
        missing = [e for e, r in detail_results.items()
                   if not r[check] and not r['is_custom_layout']]
        if missing:
            print(f'  {check:<32} -> {len(missing)} pages missing: {missing}')

    print('\n=== LIST PAGE UNIFORMITY ===')
    print(f'{"Entity":<22} {"ListView":<9} {"Moysklad":<9} {"Bulk":<5} {"ColV":<5} {"Search":<7} {"Cursor":<7} {"Saved":<5}')
    print('-' * 80)
    for entity, r in sorted(list_results.items()):
        marks = (
            r['uses_ListView'], r['uses_moyskladToolbar'],
            r['uses_useBulkDocumentActions'], r['uses_useColumnVisibility'],
            r['has_search'], r['has_pagination'], r['has_SavedFilters'],
        )
        chars = ['+' if m else '-' for m in marks]
        print(f'{entity:<22} {chars[0]:<9} {chars[1]:<9} {chars[2]:<5} {chars[3]:<5} {chars[4]:<7} {chars[5]:<7} {chars[6]:<5}')

    print('\n=== LIST INCONSISTENCIES ===')
    for check in ['uses_ListView', 'uses_moyskladToolbar', 'uses_useBulkDocumentActions',
                  'uses_useColumnVisibility', 'has_search', 'has_pagination', 'has_SavedFilters']:
        missing = [e for e, r in list_results.items() if not r[check]]
        if missing:
            print(f'  {check:<32} -> {len(missing)} pages missing: {missing}')

    print('\n=== NEW PAGE UNIFORMITY ===')
    for check in ['uses_EditForm', 'uses_FormField', 'uses_save_mutation']:
        missing = [e for e, r in new_results.items() if not r[check]]
        print(f'  {check:<32} -> {len(missing)} pages missing: {missing}')

    print('\n=== BACKEND CONTROLLER UNIFORMITY ===')
    print(f'{"Module":<22} {"JwtGuard":<10} {"Permission":<11} {"CurrUser":<10} {"AcctId":<8}')
    print('-' * 70)
    for mod, r in sorted(backend_results.items()):
        chars = [
            '+' if r['has_JwtAuthGuard'] else '-',
            '+' if r['has_RequirePermission'] else '-',
            '+' if r['has_CurrentUser'] else '-',
            '+' if r['uses_accountId'] else '-',
        ]
        print(f'{mod:<22} {chars[0]:<10} {chars[1]:<11} {chars[2]:<10} {chars[3]:<8}')

    bigint_ok = has_global_bigint_serializer()
    print(f'\nGlobal BigInt -> string serializer in main.ts: {"INSTALLED" if bigint_ok else "MISSING"}')

    print('\n=== BACKEND INCONSISTENCIES ===')
    for check in ['has_JwtAuthGuard', 'has_RequirePermission', 'has_CurrentUser',
                  'uses_accountId']:
        missing = [m for m, r in backend_results.items() if not r[check]]
        if missing:
            print(f'  {check:<32} -> {len(missing)} modules missing: {missing}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
