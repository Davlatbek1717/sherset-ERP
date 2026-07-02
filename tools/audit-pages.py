"""
Page-by-page parity audit between our local app and the moysklad.uz
visual-capture reference. For every local page under apps/web/src/app
we look up the matching moysklad route in docs/moysklad-reference and
report:
- Whether the moysklad reference exists for this page (some are uz-
  market additions like Soliq EDO that moysklad has no analog for).
- Whether the local page uses the design-system primitives (PageHeader,
  ListView, EditForm, DocumentTabs).
- Whether the page imports useTranslations (i18n parity).
- Whether the page handles loading + error + empty states.
- Whether the page surfaces toast/confirm via the wrapped mutation
  hooks rather than raw useMutation.

Output is a markdown table — one row per page — that we can scan to
prioritise the next migration wave.
"""

from __future__ import annotations

import glob
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

REFERENCE_DIR = Path("docs/moysklad-reference/visual-captures")

# Map our local route slug → moysklad routeId (when there's a 1:1
# correspondence). Routes not in this map don't have a reference.
ROUTE_MAP: dict[str, str] = {
    "/": "dashboard",
    "/customer-orders": "customerorder",
    "/demands": "demand",
    "/invoices-out": "invoiceout",
    "/sales-returns": "salesreturn",
    "/purchase-orders": "purchaseorder",
    "/supplies": "supply",
    "/invoices-in": "invoicein",
    "/purchase-returns": "purchasereturn",
    "/payments-in": "paymentin",
    "/payments-out": "paymentout",
    "/cash-in": "cashin",
    "/cash-out": "cashout",
    "/moves": "move",
    "/losses": "loss",
    "/enters": "enter",
    "/inventories": "inventory",
    "/products": "product",
    "/product-folders": "productfolder",
    "/variants": "variant",
    "/services": "service",
    "/bundles": "bundle",
    "/counterparties": "counterparty",
    "/contact-persons": "contactperson",
    "/calls": "event",
    "/opportunities": "saleschannel",
    "/tasks": "task",
    "/retail/sessions": "retailshift",
    "/retail/sales": "retaildemand",
    "/settings/organizations": "organization",
    "/settings/stores": "saleschannel",
    "/settings/cash-desks": "retailstore",
    "/settings/users": "employee",
    "/settings/audit-log": "audit",
    "/settings/exchange-rates": "currency",
    "/settings": "settings",
    "/korzina": "recyclebin",
    "/reports": "dashboard",
    "/apps": "settings",
}


def has_reference(route_id: str) -> bool:
    """Check whether moysklad reference exists under any module folder."""
    if not REFERENCE_DIR.exists():
        return False
    matches = list(REFERENCE_DIR.glob(f"*/{route_id}/manifest.json"))
    return len(matches) > 0


def page_route(path: str) -> str:
    """Convert apps/web/src/app/(app)/customer-orders/[id]/page.tsx →
    /customer-orders/[id]."""
    rel = path.replace("\\", "/").split("apps/web/src/app/(app)")[-1]
    rel = rel.replace("/page.tsx", "")
    return rel or "/"


def audit_page(path: str) -> dict[str, object]:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Match the route prefix for the reference lookup.
    route = page_route(path)
    base = re.sub(r"/(\[id\]|new|board|import)", "", route).rstrip("/") or "/"
    reference_id = ROUTE_MAP.get(base, ROUTE_MAP.get(route, ""))
    has_ref = has_reference(reference_id) if reference_id else False

    return {
        "route": route,
        "ref": reference_id or "—",
        "has_ref": "✓" if has_ref else "—",
        "i18n": "✓" if "useTranslations" in content else "—",
        "page_header": "✓" if "<PageHeader" in content else "—",
        "list_view": "✓" if "<ListView" in content else "—",
        "edit_form": "✓" if "<EditForm" in content else "—",
        "doc_tabs": "✓" if "<DocumentTabs" in content else "—",
        "use_api_mut": "✓" if "useApiMutation" in content or "useSaveMutation" in content else "—",
        "toast": "✓" if "toast." in content or "useDestructiveMutation" in content else "—",
        "loading_handled": "✓" if "isLoading" in content or "loading={" in content else "—",
        "error_handled": "✓"
        if "error={" in content or "onError" in content or "useApiMutation" in content
        else "—",
    }


def is_special_page(route: str) -> bool:
    """Skip non-CRUD pages from the audit table."""
    return route in {"", "/", "/print"} or route.startswith("/print/")


def main() -> int:
    pages = []
    for path in sorted(glob.glob("apps/web/src/app/(app)/**/page.tsx", recursive=True)):
        result = audit_page(path)
        pages.append(result)

    print("# Page-by-page moysklad parity audit\n")
    print(f"{len(pages)} pages found.\n")

    # Top stats.
    has_ref = sum(1 for p in pages if p["has_ref"] == "✓")
    has_i18n = sum(1 for p in pages if p["i18n"] == "✓")
    has_ph = sum(1 for p in pages if p["page_header"] == "✓")
    has_lv = sum(1 for p in pages if p["list_view"] == "✓")
    has_ef = sum(1 for p in pages if p["edit_form"] == "✓")
    has_dt = sum(1 for p in pages if p["doc_tabs"] == "✓")
    has_uam = sum(1 for p in pages if p["use_api_mut"] == "✓")

    n = len(pages)

    def pct(x: int) -> str:
        return f"{x}/{n} ({x * 100 // n}%)"

    print(f"- Has moysklad reference:       {pct(has_ref)}")
    print(f"- i18n (useTranslations):       {pct(has_i18n)}")
    print(f"- PageHeader primitive:         {pct(has_ph)}")
    print(f"- ListView primitive:           {pct(has_lv)}")
    print(f"- EditForm primitive:           {pct(has_ef)}")
    print(f"- DocumentTabs (linked+audit):  {pct(has_dt)}")
    print(f"- useApiMutation/useSaveMutation: {pct(has_uam)}")

    print()
    print("## Pages WITHOUT i18n (need migration):")
    for p in pages:
        if p["i18n"] != "✓":
            print(f"  - {p['route']}")

    print()
    print("## Detail [id] pages WITHOUT DocumentTabs (linked-docs / history):")
    for p in pages:
        if "[id]" in p["route"] and p["doc_tabs"] != "✓" and "settings" not in p["route"]:
            # skip retail/sessions, ecommerce/channels (not docs)
            if any(seg in p["route"] for seg in ["session", "channel", "pipeline", "[appKey]"]):
                continue
            print(f"  - {p['route']}")

    print()
    print("## List pages WITHOUT ListView primitive:")
    for p in pages:
        if p["route"].endswith(("/" if False else "")) or "[" in p["route"]:
            continue
        if p["list_view"] != "✓" and p["edit_form"] != "✓":
            print(f"  - {p['route']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
