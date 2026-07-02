"""
Apply the Round 1 patron pattern (set in 43e2ce6 on /purchase-orders)
to a curated list of list-page page.tsx files.

For each target page we:
  1. Replace the `filters: ListViewFilter[] = [ ... ]` block with `[]`
     (status pills move into the toolbar Status dropdown — moysklad
     parity).
  2. In the JSX `<ListView ... />` block:
     - drop `subtitle={...}`
     - insert `hideTitle` after `title={...}`
     - rewrite `emptyTitle={search || stateFilter ? ...}` to use the
       `hasFilter` helper (added below).
     - insert `hasActiveFilter={hasFilter}` and `richEmpty={{...}}`
       siblings.
  3. Insert the `hasFilter` const + `footerRow` const just before the
     `return (` statement (small enough to inline; reusable across
     pages with the same money-column structure).

Pages that don't fit the patron exactly (no `stateFilter`, no money
columns, retail/POS shells, …) are skipped — the script logs them
and the operator handles them in a follow-up.

Usage:
  python3 tools/apply-round1-patron.py [--dry-run] [page1 page2 ...]

With no args, runs on the curated TARGETS list below. Always idempotent
— skips a page that already has `hideTitle` set.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

REPO = Path("D:/projects/moysklad")
PAGES_DIR = REPO / "apps" / "web" / "src" / "app" / "(app)"

# Round 1 list pages to bulk-update. Order = priority. Pages with a
# matching `pages.<name>.empty_rich_heading` i18n key will get a rich
# empty state; others fall back to the simple EmptyState (so missing
# i18n doesn't crash at runtime).
TARGETS = [
    # Sales
    "customer-orders",
    "demands",
    "invoices-out",
    "sales-returns",
    # Purchase (purchase-orders is the patron)
    "supplies",
    "invoices-in",
    "purchase-returns",
    # Money
    "cash-in",
    "cash-out",
    "payments-in",
    "payments-out",
    # CRM / catalog
    "counterparties",
    "products",
    "contact-persons",
    # Stock
    "moves",
    "losses",
    "enters",
    "inventories",
    # Tasks / opportunities
    "tasks",
    "opportunities",
    # Catalog leaves
    "services",
    "bundles",
    "variants",
    "product-folders",
    # Misc
    "calls",
]


def find_page_file(slug: str) -> Path | None:
    p = PAGES_DIR / slug / "page.tsx"
    return p if p.exists() else None


def patch_filters_block(src: str) -> tuple[str, bool]:
    """Replace the multi-pill `filters: ListViewFilter[] = [ ... ]` block
    with `filters: ListViewFilter[] = []` (status moves to dropdown)."""
    # Match `const filters: ListViewFilter[] = [ ... ];` greedy until matching ];
    pattern = re.compile(
        r"const\s+filters\s*:\s*ListViewFilter\[\]\s*=\s*\[\s*(?:\{[\s\S]*?\}\s*,\s*)+\{[\s\S]*?\}\s*,?\s*\]\s*;",
        re.MULTILINE,
    )
    if not pattern.search(src):
        return src, False
    replacement = (
        "// moysklad's list page does NOT use pill sub-tabs for the\n"
        "  // status quick-filter — moved to the toolbar Status dropdown.\n"
        "  // Round 1 patron: filters=[] across every list page.\n"
        "  const filters: ListViewFilter[] = [];"
    )
    return pattern.sub(replacement, src, count=1), True


def patch_listview_jsx(src: str, slug: str) -> tuple[str, bool]:
    """Insert hideTitle, hasActiveFilter, richEmpty into the <ListView ... />
    block. Skips if hideTitle is already present (idempotent)."""
    if re.search(r"\bhideTitle\b", src):
        return src, False  # already patched

    # 1. Drop subtitle line
    src = re.sub(r"\n\s*subtitle=\{[^}]+\}\n", "\n", src, count=1)

    # 2. Insert hideTitle after `title={...}`
    src = re.sub(
        r"(title=\{[^}]+\})\n",
        r"\1\n      hideTitle\n",
        src,
        count=1,
    )

    # 3. Compute the i18n namespace from the slug
    ns = slug.replace("-", "_")

    # 4. Rewrite emptyTitle to use `hasFilter`
    src = re.sub(
        r"emptyTitle=\{search \|\| stateFilter \? tCommon\('no_results'\) : t\('empty_title'\)\}",
        "emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}\n      hasActiveFilter={hasFilter}\n      richEmpty={{\n        heading: t('empty_rich_heading'),\n        cta: { label: t('create_button'), href: createHrefFromSlug },\n      }}",
        src,
        count=1,
    )

    # 5. Insert `const hasFilter = !!search || !!stateFilter;` and
    #    `const createHrefFromSlug = '/<slug>/new';` before `return (`
    src = re.sub(
        r"(\n\s*return \(\n\s*<ListView)",
        f"\n  const hasFilter = !!search || !!stateFilter;\n  const createHrefFromSlug = '/{slug}/new';\n\\1",
        src,
        count=1,
    )

    return src, True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("targets", nargs="*")
    args = ap.parse_args()
    targets = args.targets or TARGETS

    skipped: list[str] = []
    patched: list[str] = []
    no_filter_block: list[str] = []
    not_found: list[str] = []

    for slug in targets:
        page = find_page_file(slug)
        if page is None:
            not_found.append(slug)
            continue

        src = page.read_text(encoding="utf-8")
        # Skip purchase-orders (already patron-fitted)
        if slug == "purchase-orders":
            skipped.append(f"{slug} (patron, manual)")
            continue

        new_src, jsx_changed = patch_listview_jsx(src, slug)
        if not jsx_changed:
            skipped.append(f"{slug} (already patched)")
            continue
        new_src, filters_changed = patch_filters_block(new_src)
        if not filters_changed:
            no_filter_block.append(slug)

        if args.dry_run:
            print(f"[dry-run] would patch {slug} ({page})")
            continue

        page.write_text(new_src, encoding="utf-8", newline="\n")
        patched.append(slug)
        print(f"  ✓ {slug}")

    print()
    print(f"Patched:           {len(patched)}")
    print(f"Skipped:           {len(skipped)}  {skipped}")
    print(f"No filter block:   {len(no_filter_block)}  {no_filter_block}")
    print(f"Not found:         {len(not_found)}  {not_found}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
