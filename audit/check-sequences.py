"""Verify document-to-document sequences (1:1 moysklad parity).

Moysklad lets the user create downstream documents from a source via
"Создать документ ▾" dropdown:
  - Customer order  → Demand, Invoice-out, Payment-in
  - Demand          → Sales-return, Invoice-out
  - Invoice-out     → Payment-in
  - Purchase order  → Supply, Invoice-in, Payment-out
  - Supply          → Purchase-return, Invoice-in, Payment-out
  - Invoice-in      → Payment-out

This script verifies:
  1. The frontend has the create-related menu item wired (CreateMenuItem)
  2. The backend has the from-XYZ endpoint to actually create the
     downstream document with reference to the source
  3. The Prisma model on the downstream side has a back-reference
     (e.g. Demand.customerOrderId on Demand)
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

WEB = Path('D:/projects/moysklad/apps/web/src/app/(app)')
API = Path('D:/projects/moysklad/apps/api/src/modules')
SCHEMA = Path('D:/projects/moysklad/packages/db/prisma/schema.prisma')

# (source-entity, downstream-entity, expected-from-endpoint, expected-fk-field)
SEQUENCES = [
    # Sales pipeline
    ('customer-orders', 'demands', '/demands/from-customer-order/:id', 'customerOrderId'),
    ('customer-orders', 'invoices-out', '/invoices-out/from-customer-order/:id', 'customerOrderId'),
    ('customer-orders', 'payments-in', '/payments-in/from-customer-order/:id', 'customerOrderId'),
    ('demands', 'sales-returns', '/sales-returns/from-demand/:id', 'demandId'),
    ('demands', 'invoices-out', '/invoices-out/from-demand/:id', 'demandId'),
    ('invoices-out', 'payments-in', '/payments-in/from-invoice-out/:id', 'invoiceOutId'),

    # Purchase pipeline
    ('purchase-orders', 'supplies', '/supplies/from-purchase-order/:id', 'purchaseOrderId'),
    ('purchase-orders', 'invoices-in', '/invoices-in/from-purchase-order/:id', 'purchaseOrderId'),
    ('purchase-orders', 'payments-out', '/payments-out/from-purchase-order/:id', 'purchaseOrderId'),
    ('supplies', 'purchase-returns', '/purchase-returns/from-supply/:id', 'supplyId'),
    ('supplies', 'invoices-in', '/invoices-in/from-supply/:id', 'supplyId'),
    ('invoices-in', 'payments-out', '/payments-out/from-invoice-in/:id', 'invoiceInId'),
]


def find_frontend_create_menu(source_entity: str, expected_endpoint: str) -> bool:
    """Check if the source entity's detail page wires the downstream
    create flow.

    Two valid wiring patterns:
      A) Direct POST /from-X/:id                — one-shot create
      B) Navigate /downstream/new?fromX=:id     — pre-fill new page,
         user clicks Save which then POSTs /downstream
    Either pattern counts as "wired".
    """
    detail = WEB / source_entity / '[id]' / 'page.tsx'
    if not detail.exists():
        return False
    src = detail.read_text(encoding='utf-8', errors='ignore')

    # Pattern A: direct endpoint call
    needle = expected_endpoint.replace(':id', '')
    if needle in src:
        return True

    # Pattern B: navigate to /downstream/new?fromX=...
    # Convert "/payments-in/from-customer-order/:id" -> downstream
    # "payments-in" + source slug "customer-order".
    parts = expected_endpoint.split('/')
    if len(parts) >= 4 and parts[2].startswith('from-'):
        downstream = parts[1]
        # Convention: /downstream/new?fromX=... where X is the source
        # entity in camel case (fromDemand, fromCustomerOrder, ...).
        # Easiest test: look for the downstream new path + a fromX query.
        if re.search(rf'/{downstream}/new\?from[A-Z]', src):
            return True
    return False


def find_backend_endpoint(downstream_entity: str, expected_endpoint: str) -> bool:
    """Check if a Nest controller for the downstream entity actually
    has a @Post('from-...') route handler."""
    # Map plural URL prefix to singular module folder.
    PREFIX_TO_MOD = {
        'demands': 'demand',
        'invoices-out': 'invoice-out',
        'invoices-in': 'invoice-in',
        'payments-in': 'payment-in',
        'payments-out': 'payment-out',
        'sales-returns': 'sales-return',
        'purchase-returns': 'purchase-return',
        'supplies': 'supply',
    }
    mod_name = PREFIX_TO_MOD.get(downstream_entity, downstream_entity)
    mod = API / mod_name
    if not mod.is_dir():
        return False
    # Pull the path token from the endpoint, e.g. "from-customer-order"
    m = re.search(r'/from-([a-z-]+)/', expected_endpoint)
    if not m:
        return False
    suffix = f'from-{m.group(1)}'
    for ctrl in mod.glob('*.controller.ts'):
        src = ctrl.read_text(encoding='utf-8', errors='ignore')
        if re.search(rf"@Post\(['\"]{re.escape(suffix)}/", src):
            return True
    return False


_SCHEMA_TEXT = None


def find_prisma_back_reference(downstream_entity: str, fk_field: str) -> bool:
    """Verify the downstream Prisma model has the foreign-key field.

    Uses a loose match within the model block — Prisma model blocks
    contain nested braces (relation declarations like
    `@relation(fields: [...], references: [id])`) so a strict
    `[^}]` cap on the body misses the FK if it appears after a
    relation. Instead we slice from the model line to the next
    top-level `^model` and grep within that slice.
    """
    global _SCHEMA_TEXT
    if _SCHEMA_TEXT is None:
        _SCHEMA_TEXT = SCHEMA.read_text(encoding='utf-8', errors='ignore')

    PREFIX_TO_MODEL = {
        'demands': 'Demand',
        'invoices-out': 'InvoiceOut',
        'invoices-in': 'InvoiceIn',
        'payments-in': 'PaymentIn',
        'payments-out': 'PaymentOut',
        'sales-returns': 'SalesReturn',
        'purchase-returns': 'PurchaseReturn',
        'supplies': 'Supply',
    }
    model_name = PREFIX_TO_MODEL.get(downstream_entity, downstream_entity.title())

    # Find the model start, then the next ^model (or end of file).
    start_pat = re.compile(rf'^model\s+{model_name}\s*\{{', re.M)
    m = start_pat.search(_SCHEMA_TEXT)
    if not m:
        return False
    body_start = m.end()
    next_pat = re.compile(r'^model\s+\w+\s*\{', re.M)
    n = next_pat.search(_SCHEMA_TEXT, body_start)
    body_end = n.start() if n else len(_SCHEMA_TEXT)
    body = _SCHEMA_TEXT[body_start:body_end]
    return bool(re.search(rf'\b{fk_field}\b', body))


def main():
    print(f'{"Source -> Downstream":<40} {"Frontend":<10} {"Backend":<9} {"Schema":<8}')
    print('-' * 75)

    total = 0
    ok_frontend = 0
    ok_backend = 0
    ok_schema = 0
    gaps = []

    for source, dest, endpoint, fk in SEQUENCES:
        total += 1
        f_ok = find_frontend_create_menu(source, endpoint)
        b_ok = find_backend_endpoint(dest, endpoint)
        s_ok = find_prisma_back_reference(dest, fk)
        ok_frontend += f_ok
        ok_backend += b_ok
        ok_schema += s_ok
        flags = ['+' if x else '-' for x in (f_ok, b_ok, s_ok)]
        line = f'{source:>16} -> {dest:<19} {flags[0]:<10} {flags[1]:<9} {flags[2]:<8}'
        if not (f_ok and b_ok and s_ok):
            gaps.append((source, dest, endpoint, fk, f_ok, b_ok, s_ok))
        print(line)

    print(f'\n=== SEQUENCE COVERAGE ===')
    print(f'Frontend create-related menu items: {ok_frontend}/{total}')
    print(f'Backend /from-* endpoints:           {ok_backend}/{total}')
    print(f'Prisma back-reference fields:        {ok_schema}/{total}')

    if gaps:
        print(f'\n=== {len(gaps)} GAP(S) FOUND ===')
        for source, dest, endpoint, fk, f_ok, b_ok, s_ok in gaps:
            print(f'  {source} -> {dest}:')
            if not f_ok:
                print(f'    ! Frontend missing endpoint call: {endpoint}')
            if not b_ok:
                print(f'    ! Backend missing /from-* route handler')
            if not s_ok:
                print(f'    ! Prisma missing FK field: {fk}')

    return 0 if not gaps else 1


if __name__ == '__main__':
    sys.exit(main())
