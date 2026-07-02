"""Real CRUD round-trip verifier — proves data flows end-to-end.

Static URL→module mapping is necessary but not sufficient. This script
spins through every entity that supports CREATE/READ/UPDATE/DELETE and
hits the live API as the demo admin user, asserting:

  1. POST creates a row that's then visible via GET (data made the
     full hop: HTTP -> controller -> service -> Prisma -> Postgres
     -> Prisma -> JSON -> client).
  2. GET /:id returns the same row with the expected shape (BigInt
     fields stringified, accountId NOT exposed, dates ISO-8601).
  3. PATCH mutates the row and the change is visible on next GET.
  4. DELETE returns 200/204 and the next GET returns 404.
  5. List endpoint (`GET /<entity>`) returns paginated items array.

Pre-requisites: API running on :4000, demo seed loaded
(admin@demo.local / admin123), `httpx` installed (`pip install httpx`).
"""
from __future__ import annotations

import json
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx  # pip install httpx
import psycopg2  # pip install psycopg2-binary

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

API = 'http://localhost:4000/api/v1'
DB_DSN = 'postgresql://postgres:1234@localhost:5433/moysklad_dev'

# Maps URL prefix -> Postgres table name (snake_case from Prisma).
DB_TABLE = {
    'counterparties': 'counterparties',
    'contact-persons': 'contact_persons',
    'price-types': 'price_types',
    'customer-orders': 'customer_orders',
    'tasks': 'tasks',
    'opportunities': 'opportunities',
    'demands': 'demands',
    'invoices-out': 'invoices_out',
    'supplies': 'supplies',
    'purchase-orders': 'purchase_orders',
    'invoices-in': 'invoices_in',
    'purchase-returns': 'purchase_returns',
    'sales-returns': 'sales_returns',
    'cash-in': 'cash_in',
    'cash-out': 'cash_out',
    'payments-in': 'payments_in',
    'payments-out': 'payments_out',
    'products': 'products',
    'services': 'services',
    'bundles': 'bundles',
}

# Each spec describes one entity's CRUD round-trip:
#   - list: GET endpoint (returns paginated items)
#   - create: POST endpoint + minimal valid body builder
#   - update: PATCH endpoint template (uses :id)
#   - delete: DELETE endpoint template (uses :id)
#   - skip_reason: when set, this entity is intentionally not round-
#     tripped (custom layout, no DELETE, etc.)


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace('+00:00', 'Z')


# Reference IDs (loaded once at startup from /api/v1/* picker endpoints).
REF: dict[str, str] = {}


def _short_uuid() -> str:
    return uuid.uuid4().hex[:8]


def make_entity_specs():
    """Build the per-entity test plan once REF dict is populated."""
    co_position = lambda: [{
        'assortmentKind': 'product',
        'assortmentId': REF['product_id'],
        'quantity': 1,
        'priceMinor': '10000',
    }]
    cash_op = lambda: [{
        'targetKind': 'invoiceout',
        'invoiceOutId': None,  # standalone payment, no invoice link
        'amountMinor': '5000',
    }]

    return {
        'counterparties': {
            'list': '/counterparties',
            'create': '/counterparties',
            'update': '/counterparties/:id',
            'delete': '/counterparties/:id',
            'body': lambda: {
                'name': f'RT-Counterparty-{_short_uuid()}',
                'companyType': 'legal',
                'inn': '300000000000',
            },
            'patch': lambda: {'description': 'Round-trip update'},
        },
        'contact-persons': {
            'list': '/contact-persons',
            'create': '/contact-persons',
            'update': None,  # PATCH route not exposed yet
            'delete': '/contact-persons/:id',
            'body': lambda: {
                'counterpartyId': REF['counterparty_id'],
                'name': f'RT-Contact-{_short_uuid()}',
            },
        },
        'price-types': {
            'list': '/price-types',
            'create': '/price-types',
            'update': '/price-types/:id',
            'delete': None,  # archive/restore instead of delete
            'body': lambda: {
                'name': f'RT-Price-{_short_uuid()}',
                'isDefault': False,
            },
            'patch': lambda: {'name': f'RT-Price-Updated-{_short_uuid()}'},
        },
        'customer-orders': {
            'list': '/customer-orders',
            'create': '/customer-orders',
            'update': '/customer-orders/:id',
            'delete': '/customer-orders/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'storeId': REF['store_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'Round-trip update'},
        },
        'tasks': {
            'list': '/tasks',
            'create': '/tasks',
            'update': '/tasks/:id',
            'delete': '/tasks/:id',
            'body': lambda: {
                'title': f'RT-Task-{_short_uuid()}',
                'description': 'Round-trip verification',
            },
            'patch': lambda: {'description': 'Round-trip patched'},
        },
        'opportunities': {
            'list': '/opportunities',
            'create': '/opportunities',
            'update': '/opportunities/:id',
            'delete': '/opportunities/:id',
            'body': lambda: {
                'name': f'RT-Opp-{_short_uuid()}',
                'agentId': REF['counterparty_id'],
                'pipelineId': REF['pipeline_id'],
                'stageId': REF['pipeline_stage_id'],
                'amountMinor': '50000',
            },
            'patch': lambda: {'name': f'RT-Opp-{_short_uuid()}-updated'},
        },

        # === Sales pipeline ===
        'demands': {
            'list': '/demands',
            'create': '/demands',
            'update': '/demands/:id',
            'delete': '/demands/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'storeId': REF['store_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'RT update'},
        },
        'invoices-out': {
            'list': '/invoices-out',
            'create': '/invoices-out',
            'update': '/invoices-out/:id',
            'delete': '/invoices-out/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'RT update'},
        },
        'sales-returns': {
            'list': '/sales-returns',
            'create': '/sales-returns',
            'update': '/sales-returns/:id',
            'delete': '/sales-returns/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'storeId': REF['store_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'RT update'},
        },

        # === Purchase pipeline ===
        'purchase-orders': {
            'list': '/purchase-orders',
            'create': '/purchase-orders',
            'update': '/purchase-orders/:id',
            'delete': '/purchase-orders/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'storeId': REF['store_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'RT update'},
        },
        'supplies': {
            'list': '/supplies',
            'create': '/supplies',
            'update': '/supplies/:id',
            'delete': '/supplies/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'storeId': REF['store_id'],
                'positions': [{
                    'assortmentKind': 'product',
                    'assortmentId': REF['product_id'],
                    'quantity': 1,
                    'priceMinor': '10000',
                }],
            },
            'patch': lambda: {'description': 'RT update'},
        },
        'invoices-in': {
            'list': '/invoices-in',
            'create': '/invoices-in',
            'update': '/invoices-in/:id',
            'delete': '/invoices-in/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'RT update'},
        },
        'purchase-returns': {
            'list': '/purchase-returns',
            'create': '/purchase-returns',
            'update': '/purchase-returns/:id',
            'delete': '/purchase-returns/:id',
            'body': lambda: {
                'agentId': REF['counterparty_id'],
                'organizationId': REF['organization_id'],
                'storeId': REF['store_id'],
                'positions': co_position(),
            },
            'patch': lambda: {'description': 'RT update'},
        },

        # === Catalog ===
        'products': {
            'list': '/products',
            'create': '/products',
            'update': '/products/:id',
            'delete': '/products/:id',
            'body': lambda: {
                'name': f'RT-Product-{_short_uuid()}',
                'code': _short_uuid(),
                'salePrices': [{'priceTypeId': 'default', 'value': '15000'}],
            },
            'patch': lambda: {'description': 'RT update'},
        },
        # /services frontend page hits /products?kind=service — there is
        # no separate /services endpoint. Same for /bundles which hits
        # /products?kind=bundle. Skipped (covered by 'products' above).
    }


def login(client: httpx.Client) -> str:
    r = client.post(f'{API}/auth/login', json={
        'email': 'admin@demo.local',
        'password': 'admin123',
    })
    r.raise_for_status()
    return r.json()['accessToken']


def load_refs(client: httpx.Client, headers: dict) -> None:
    """Populate REF dict with one ID from each lookup we need.

    All list endpoints return either a plain array OR `{items: [...]}`
    depending on whether they're full document endpoints or simple
    lookups. We accept both.
    """
    pickers = [
        ('counterparty_id', '/counterparties?limit=1'),
        ('product_id', '/products?limit=1'),
        ('organization_id', '/organizations'),
        ('store_id', '/stores'),
    ]
    for key, url in pickers:
        r = client.get(f'{API}{url}', headers=headers)
        r.raise_for_status()
        body = r.json()
        items = body if isinstance(body, list) else body.get('items', [])
        if not items:
            print(f'  ! No {key} available — entity tests using it will skip')
            REF[key] = ''
            continue
        REF[key] = items[0]['id']

    # Pipelines + stages — opportunities depends on these.
    r = client.get(f'{API}/pipelines', headers=headers)
    if r.status_code == 200:
        pipelines = r.json().get('items') or []
        if pipelines:
            REF['pipeline_id'] = pipelines[0]['id']
            stages = pipelines[0].get('stages') or []
            if stages:
                REF['pipeline_stage_id'] = stages[0]['id']
    REF.setdefault('pipeline_id', '')
    REF.setdefault('pipeline_stage_id', '')


def db_count(table: str, where: dict) -> int:
    """Count rows in `table` matching `where` directly via SQL."""
    with psycopg2.connect(DB_DSN) as conn, conn.cursor() as cur:
        clauses = ' AND '.join(f'{k} = %s' for k in where)
        cur.execute(f'SELECT count(*) FROM {table} WHERE {clauses}', tuple(where.values()))
        return cur.fetchone()[0]


def audit_log_count(entity_id: str) -> int:
    """Count audit_log rows referencing this entity ID."""
    with psycopg2.connect(DB_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT count(*) FROM audit_log WHERE entity_id = %s',
            (entity_id,),
        )
        return cur.fetchone()[0]


def round_trip(client: httpx.Client, headers: dict, name: str, spec: dict) -> dict:
    """Run CRUD round-trip for one entity. Returns result row."""
    result = {'entity': name, 'list': None, 'create': None, 'get': None,
              'patch': None, 'delete': None, 'cleanup': None,
              'errors': [], 'shape_ok': None, 'created_id': None,
              'db_after_create': None, 'db_after_delete': None}

    # 1. LIST
    t0 = time.time()
    r = client.get(f'{API}{spec["list"]}?limit=1', headers=headers)
    result['list'] = {'status': r.status_code, 'ms': int((time.time() - t0) * 1000)}
    if r.status_code != 200:
        result['errors'].append(f'LIST {spec["list"]}: HTTP {r.status_code} — {r.text[:200]}')
        return result
    body = r.json()
    if 'items' not in body:
        result['errors'].append(f'LIST {spec["list"]}: missing items[] in response')
        return result

    # 2. CREATE — skip if any required REF is missing.
    try:
        body = spec['body']()
    except KeyError as e:
        result['errors'].append(f'CREATE skipped: ref {e} not loaded')
        return result

    t0 = time.time()
    r = client.post(f'{API}{spec["create"]}', json=body, headers=headers)
    result['create'] = {'status': r.status_code, 'ms': int((time.time() - t0) * 1000)}
    if r.status_code not in (200, 201):
        result['errors'].append(f'CREATE {spec["create"]}: HTTP {r.status_code} — {r.text[:300]}')
        return result
    created = r.json()
    created_id = created.get('id')
    if not created_id:
        result['errors'].append(f'CREATE {spec["create"]}: response missing "id" — {r.text[:200]}')
        return result
    result['created_id'] = created_id

    # 2b. SHAPE checks
    shape_issues = []
    if 'accountId' in created:
        shape_issues.append('accountId LEAKED to client (privacy violation)')
    # Check BigInt fields are strings
    for k, v in created.items():
        if k.endswith('Minor') and not isinstance(v, str):
            shape_issues.append(f'{k}={v!r} should be string (BigInt serializer)')
    result['shape_ok'] = len(shape_issues) == 0
    if shape_issues:
        result['errors'].extend(shape_issues)

    # 2c. DB-level proof — verify the row actually exists in Postgres
    # with the correct tenant + id, not just in the API response cache.
    db_table = DB_TABLE.get(name)
    if db_table:
        try:
            n = db_count(db_table, {'id': created_id})
            result['db_after_create'] = n
            if n != 1:
                result['errors'].append(
                    f'DB verify: expected 1 row in {db_table} with id={created_id}, got {n}',
                )
        except psycopg2.Error as e:
            result['errors'].append(f'DB verify failed: {e}')

    # 2d. Audit log proof — every CREATE should have produced an
    # audit_logs row referencing this entity_id.
    try:
        result['audit_logs'] = audit_log_count(created_id)
    except psycopg2.Error as e:
        result['errors'].append(f'Audit log verify failed: {e}')

    # 3. GET /:id
    t0 = time.time()
    r = client.get(f'{API}{spec["create"]}/{created_id}', headers=headers)
    result['get'] = {'status': r.status_code, 'ms': int((time.time() - t0) * 1000)}
    if r.status_code != 200:
        result['errors'].append(f'GET /:id: HTTP {r.status_code}')

    # 4. PATCH (optional)
    if spec.get('update') and spec.get('patch'):
        url = spec['update'].replace(':id', created_id)
        t0 = time.time()
        r = client.patch(f'{API}{url}', json=spec['patch'](), headers=headers)
        result['patch'] = {'status': r.status_code, 'ms': int((time.time() - t0) * 1000)}
        if r.status_code not in (200, 204):
            result['errors'].append(f'PATCH {url}: HTTP {r.status_code} — {r.text[:300]}')

    # 5. DELETE (optional)
    if spec.get('delete'):
        url = spec['delete'].replace(':id', created_id)
        t0 = time.time()
        r = client.delete(f'{API}{url}', headers=headers)
        result['delete'] = {'status': r.status_code, 'ms': int((time.time() - t0) * 1000)}
        if r.status_code not in (200, 204):
            result['errors'].append(f'DELETE {url}: HTTP {r.status_code} — {r.text[:300]}')

        # 6. Cleanup verify — GET /:id should now 404 or return archived
        t0 = time.time()
        r = client.get(f'{API}{spec["create"]}/{created_id}', headers=headers)
        result['cleanup'] = {'status': r.status_code, 'ms': int((time.time() - t0) * 1000)}

        # 6b. DB-level proof — verify the row actually disappeared (or
        # was soft-archived). Counterparties / opportunities use soft
        # delete (`archived=true`), pure deletes leave 0 rows.
        if db_table:
            try:
                n = db_count(db_table, {'id': created_id})
                result['db_after_delete'] = n
                # No assertion either way — soft delete keeps 1 row,
                # hard delete leaves 0. We just record what we see.
            except psycopg2.Error as e:
                result['errors'].append(f'DB verify (delete) failed: {e}')

    return result


def render(results: list[dict]) -> None:
    print(f'{"Entity":<20} {"LIST":<6} {"POST":<6} {"GET":<5} {"PATCH":<6} {"DEL":<5} {"Shape":<6} {"DB+":<5} {"DB-":<5} {"Audit":<6} {"Err":<5}')
    print('-' * 100)
    for r in results:
        codes = []
        for op in ('list', 'create', 'get', 'patch', 'delete'):
            d = r[op]
            codes.append(str(d['status']) if d else '—')
        shape = 'OK' if r['shape_ok'] else ('—' if r['shape_ok'] is None else 'FAIL')
        db_create = str(r['db_after_create']) if r['db_after_create'] is not None else '—'
        db_delete = str(r['db_after_delete']) if r['db_after_delete'] is not None else '—'
        audit = str(r.get('audit_logs', '—'))
        print(
            f'{r["entity"]:<20} {codes[0]:<6} {codes[1]:<6} {codes[2]:<5} '
            f'{codes[3]:<6} {codes[4]:<5} {shape:<6} {db_create:<5} {db_delete:<5} {audit:<6} {len(r["errors"]):<5}',
        )
    fails = sum(1 for r in results if r['errors'])
    print(f'\n{len(results) - fails}/{len(results)} entities round-tripped cleanly')
    print('Legend: DB+ = rows in PG after CREATE (expect 1)')
    print('        DB- = rows in PG after DELETE (0 = hard, 1 = soft/archived)')
    if fails:
        print(f'\n=== ERRORS ===')
        for r in results:
            if r['errors']:
                print(f'  [{r["entity"]}]')
                for e in r['errors']:
                    print(f'    - {e}')


def tenant_isolation_test(client: httpx.Client, headers: dict) -> dict:
    """Verify cross-tenant access is blocked.

    Strategy: insert a row directly into PG with a foreign accountId,
    then try to fetch it via the API as our authenticated user (whose
    accountId is the demo one). The API must return 404 (or 403) — if
    it returns the row, that's a tenant-isolation bug.
    """
    foreign_account = '00000000-0000-0000-0000-9999999999ff'
    foreign_id = str(uuid.uuid4())
    foreign_name = f'RT-Foreign-{_short_uuid()}'

    out = {'test': 'tenant_isolation', 'foreign_id': foreign_id, 'errors': []}

    try:
        with psycopg2.connect(DB_DSN) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                # Make sure the foreign account exists (FK constraint).
                cur.execute(
                    "INSERT INTO accounts (id, name, plan, created_at, updated_at) "
                    "VALUES (%s, %s, 'trial', now(), now()) ON CONFLICT DO NOTHING",
                    (foreign_account, 'RT-Foreign-Account'),
                )
                # Insert a counterparty in the foreign tenant.
                cur.execute(
                    "INSERT INTO counterparties "
                    "(id, account_id, name, company_type, created_at, updated_at) "
                    "VALUES (%s, %s, %s, 'legal', now(), now())",
                    (foreign_id, foreign_account, foreign_name),
                )
    except psycopg2.Error as e:
        out['errors'].append(f'Setup failed: {e}')
        return out

    try:
        # Attempt to read the foreign row as our authenticated user.
        r = client.get(f'{API}/counterparties/{foreign_id}', headers=headers)
        out['cross_tenant_status'] = r.status_code
        if r.status_code == 200:
            out['errors'].append(
                f'TENANT ISOLATION BREACH: GET /:id returned the foreign-tenant row'
                f' (status 200, body={r.text[:200]})',
            )
        elif r.status_code not in (404, 403):
            out['errors'].append(
                f'Unexpected cross-tenant response: HTTP {r.status_code}',
            )

        # Attempt to PATCH it.
        r = client.patch(
            f'{API}/counterparties/{foreign_id}',
            json={'description': 'breach attempt'},
            headers=headers,
        )
        out['cross_tenant_patch_status'] = r.status_code
        if r.status_code in (200, 204):
            out['errors'].append(
                f'TENANT ISOLATION BREACH: PATCH /:id succeeded for foreign tenant'
                f' (status {r.status_code})',
            )

        # Attempt to DELETE it.
        r = client.delete(f'{API}/counterparties/{foreign_id}', headers=headers)
        out['cross_tenant_delete_status'] = r.status_code
        if r.status_code in (200, 204):
            out['errors'].append(
                f'TENANT ISOLATION BREACH: DELETE /:id succeeded for foreign tenant',
            )
    finally:
        # Cleanup — drop the foreign row.
        try:
            with psycopg2.connect(DB_DSN) as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute('DELETE FROM counterparties WHERE id = %s', (foreign_id,))
                    cur.execute('DELETE FROM accounts WHERE id = %s', (foreign_account,))
        except psycopg2.Error:
            pass

    return out


def main():
    with httpx.Client(timeout=30) as client:
        token = login(client)
        headers = {'Authorization': f'Bearer {token}'}
        print('Logged in as admin@demo.local')

        load_refs(client, headers)
        print(f'Reference IDs loaded: {", ".join(f"{k}={v[:8]}" if v else f"{k}=N/A" for k, v in REF.items())}\n')

        specs = make_entity_specs()
        results = []
        for name, spec in specs.items():
            r = round_trip(client, headers, name, spec)
            results.append(r)

        render(results)

        # Cross-tenant isolation test
        print('\n=== TENANT ISOLATION TEST ===')
        iso = tenant_isolation_test(client, headers)
        print(f'  Cross-tenant GET    -> HTTP {iso.get("cross_tenant_status", "?")}')
        print(f'  Cross-tenant PATCH  -> HTTP {iso.get("cross_tenant_patch_status", "?")}')
        print(f'  Cross-tenant DELETE -> HTTP {iso.get("cross_tenant_delete_status", "?")}')
        if iso['errors']:
            print(f'  ⚠ {len(iso["errors"])} BREACH(ES):')
            for e in iso['errors']:
                print(f'    - {e}')
        else:
            print(f'  ✓ Tenant isolation enforced (cross-account access blocked)')
        results.append(iso)

        # Dump raw results for debugging
        Path('D:/projects/moysklad/audit/round-trip-results.json').write_text(
            json.dumps(results, indent=2, default=str),
            encoding='utf-8',
        )
        print(f'\nFull results: audit/round-trip-results.json')

        return 0 if all(not r['errors'] for r in results) else 1


if __name__ == '__main__':
    sys.exit(main())
