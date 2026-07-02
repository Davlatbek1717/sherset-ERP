"""Trace data flow per page: page.tsx -> API URLs -> controller/service/Prisma model.

Walks every (app)/.../page.tsx (recursive), extracts the HTTP calls
made through `api.*`, and maps the URL prefix to a NestJS controller
in apps/api/src/modules/. Outputs both a JSON snapshot and a
human-readable Markdown report grouped by feature area.
"""
import json
import re
import sys
from pathlib import Path
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

WEB_ROOT = Path('D:/projects/moysklad/apps/web/src/app/(app)')
API_ROOT = Path('D:/projects/moysklad/apps/api/src/modules')
PRISMA_SCHEMA = Path('D:/projects/moysklad/packages/db/prisma/schema.prisma')

API_CALL = re.compile(
    r'api\.(?P<verb>get|post|patch|put|delete)<[^>]*>?\s*\(\s*[`\'"](?P<url>[^`\'"]+)[`\'"]',
)
TEMPLATE_PARAM = re.compile(r'\$\{[^}]+\}|\{[^}]+\}')


def extract_calls(src: str):
    out = set()
    for m in API_CALL.finditer(src):
        verb = m.group('verb').upper()
        raw = m.group('url').split('?')[0]
        norm = TEMPLATE_PARAM.sub(':id', raw)
        out.add((verb, norm))
    return sorted(out)


def url_prefix(url: str) -> str:
    """Take the first 1-2 URL segments as the entity prefix.

    Most endpoints look like /counterparties or /demands/:id; for
    those the first segment is the entity. But the admin-area
    endpoints live under /admin/cash-desks, /admin/organizations,
    etc. — for those we need both segments to find the right module.
    """
    parts = [p for p in url.split('/') if p]
    if not parts:
        return ''
    if parts[0] == 'admin' and len(parts) > 1:
        return f'admin/{parts[1]}'
    return parts[0]


def module_for_prefix(prefix: str):
    candidates = [prefix, prefix.rstrip('s')]
    SUFFIX_MAP = {
        '-orders': '-order',
        '-returns': '-return',
        '-out': '-out',
        '-in': '-in',
        'ies': 'y',
    }
    for old, new in SUFFIX_MAP.items():
        if prefix.endswith(old):
            candidates.append(prefix.removesuffix(old) + new)
    HARD_MAP = {
        'invoices-in': 'invoice-in',
        'invoices-out': 'invoice-out',
        'payments-in': 'payment-in',
        'payments-out': 'payment-out',
        'losses': 'loss',
        'service-requests': 'service-desk',
        'employees': 'reference',
        'organizations': 'reference',
        'organization-accounts': 'reference',
        'stores': 'reference',
        'cash-desks': 'reference',
        'bank-accounts': 'reference',
        'inventories': 'inventory',
        'work-orders': 'work-order',
        'boms': 'bom',
        'sessions': 'cashier-session',
        'channels': 'sales-channel',
        'orders': 'online-order',
        # Admin endpoints (settings pages) — controller decorators use
        # admin/* prefix but the modules live under their entity name.
        'admin/cash-desks': 'cash-desk',
        'admin/organizations': 'organization',
        'admin/organization-accounts': 'organization-account',
        'admin/stores': 'store',
        'admin/api-tokens': 'moysklad-compat',
        'admin/audit-logs': 'audit-log',
        'admin/users': 'user',
        'admin/permissions': 'permissions',
        'admin/roles': 'permissions',
    }
    if prefix in HARD_MAP:
        candidates.insert(0, HARD_MAP[prefix])
    for cand in candidates:
        path = API_ROOT / cand
        if path.is_dir():
            return path
    return None


_MODEL_NAMES = None


def models_for_module(mod: Path):
    global _MODEL_NAMES
    if _MODEL_NAMES is None:
        schema = PRISMA_SCHEMA.read_text(encoding='utf-8', errors='ignore')
        _MODEL_NAMES = re.findall(r'^model\s+(\w+)\s*\{', schema, re.M)
    used = set()
    for f in mod.rglob('*.ts'):
        try:
            src = f.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        for name in _MODEL_NAMES:
            client_name = name[0].lower() + name[1:]
            if re.search(
                rf'\b{client_name}\.(findMany|findUnique|findFirst|create|update|delete|upsert|aggregate|count|deleteMany|updateMany|createMany)\b',
                src,
            ):
                used.add(name)
    return sorted(used)


def discover_pages():
    """Return {route_path: page_file} for every page.tsx under (app)/."""
    pages = {}
    for tsx in WEB_ROOT.rglob('page.tsx'):
        rel = tsx.relative_to(WEB_ROOT).parent.as_posix()
        if rel == '.':
            rel = '<root>'
        pages[rel] = tsx
    return pages


def feature_area(route: str) -> str:
    """Group routes by top-level segment."""
    if route == '<root>':
        return 'home'
    head = route.split('/')[0]
    return head


def run() -> int:
    pages = discover_pages()
    print(f'Discovered {len(pages)} page.tsx files')

    rows = []
    prefix_index = {}

    for route, path in sorted(pages.items()):
        try:
            src = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        endpoints = []
        for verb, url in extract_calls(src):
            prefix = url_prefix(url)
            if prefix not in prefix_index:
                mod = module_for_prefix(prefix)
                prefix_index[prefix] = {
                    'module': mod.name if mod else None,
                    'module_path': str(mod.relative_to(Path('D:/projects/moysklad'))) if mod else None,
                    'models': models_for_module(mod) if mod else [],
                }
            endpoints.append({
                'verb': verb,
                'url': url,
                'prefix': prefix,
                **prefix_index[prefix],
            })
        rows.append({
            'route': route,
            'page_file': str(path.relative_to(Path('D:/projects/moysklad'))),
            'feature': feature_area(route),
            'endpoints': endpoints,
        })

    Path('D:/projects/moysklad/audit/data-flow.json').write_text(
        json.dumps({'rows': rows, 'prefix_index': prefix_index}, indent=2, ensure_ascii=False),
        encoding='utf-8',
    )

    # Coverage summary
    total = sum(len(r['endpoints']) for r in rows)
    unmapped = [(r['route'], ep['url']) for r in rows for ep in r['endpoints'] if ep['module'] is None]
    pages_no_calls = [r['route'] for r in rows if not r['endpoints']]

    print(f'Total endpoint calls (with dupes per page): {total}')
    print(f'Unmapped endpoints: {len(unmapped)}')
    if unmapped:
        for route, url in sorted(set(unmapped))[:10]:
            print(f'  - {route}: {url}')
    print(f'Pages with NO API calls (static / placeholder): {len(pages_no_calls)}')
    for r in pages_no_calls:
        print(f'  - {r}')

    # Summary per feature area
    by_feature = defaultdict(list)
    for r in rows:
        by_feature[r['feature']].append(r)
    print('\nBy feature area:')
    for feat, group in sorted(by_feature.items()):
        endpoints = sum(len(r['endpoints']) for r in group)
        print(f'  {feat:<14} {len(group):>3} pages, {endpoints:>4} endpoint calls')

    return 0


if __name__ == '__main__':
    sys.exit(run())
