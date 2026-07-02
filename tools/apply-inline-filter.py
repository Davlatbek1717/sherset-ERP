#!/usr/bin/env python3
"""
Apply the full customer-orders inline-filter treatment to list pages
that already have the moysklad toolbar (from the earlier bulk pass).

Per page:
  1. Adjust imports — drop FilterDrawer, add InlineFilterPanel +
     PeriodPicker + CatalogPicker + CatalogPickerField + Input +
     PickerItem; pull SavedFiltersPills from the customer-orders
     components folder.
  2. Add `filterOpen` and `pickerOpen` state hooks.
  3. Add `tFilters = useTranslations('filters')` next to the existing
     ones.
  4. Wrap the page's return in a fragment so picker mounts can sit
     alongside <ListView />.
  5. Inject `headerSlot={<InlineFilterPanel ...>}` with the standard
     6-field set (Period / Agent / Organization / Store / Sum from /
     Sum to). Pages without an organization picker simply inherit the
     same filter shape — backend will ignore unknown query params.
  6. Inject `extraActionsLeft={<Filter toggle>}`.
  7. Remove the existing <FilterDrawer> from extraActions.
  8. Append CatalogPicker mounts (Agent / Organization / Store) after
     the ListView close tag.

This script is *targeted* at the bulk-patched pages — it skips files
that already use InlineFilterPanel (customer-orders / demands /
invoices-out) and any page where the structural prerequisites aren't
met. Idempotent on re-runs.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "apps" / "web" / "src" / "app" / "(app)"

TARGET_PAGES = [
    "payments-in",
    "payments-out",
    "cash-in",
    "cash-out",
    "purchase-orders",
    "purchase-returns",
    "supplies",
    "invoices-in",
    "invoices-out",
    "sales-returns",
    "moves",
    "losses",
    "enters",
    "inventories",
]


def patch(file: Path) -> bool:
    text = file.read_text(encoding="utf-8")
    original = text
    if "InlineFilterPanel" in text and "extraActionsLeft" in text:
        # Already migrated.
        return False
    if "moyskladToolbar" not in text:
        # Toolbar baseline missing — skip.
        return False
    has_filter_drawer = "<FilterDrawer" in text
    has_filter_values = "FilterDrawerValues" in text
    if not has_filter_values:
        # No filter state at all — skip; can't add inline filter
        # without somewhere to store its values.
        return False

    # 1. Imports — drop FilterDrawer, add new symbols. Keep
    #    FilterDrawerValues type since pages still use it for
    #    filter state shape.
    text = re.sub(
        r"^\s*FilterDrawer,\n",
        "",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    # Inject the new imports right after `Badge,` line for stability.
    text = re.sub(
        r"(\s*)Badge,\n",
        (
            r"\1Badge,\n"
            r"\1CatalogPicker,\n"
            r"\1CatalogPickerField,\n"
        ),
        text,
        count=1,
    )
    # Insert InlineFilterPanel + PeriodPicker + Input + PickerItem
    # near ListView.
    text = re.sub(
        r"(\s*)ListView,\n",
        (
            r"\1InlineFilterPanel,\n"
            r"\1Input,\n"
            r"\1ListView,\n"
            r"\1PeriodPicker,\n"
            r"\1type PickerItem,\n"
        ),
        text,
        count=1,
    )
    # Add SavedFiltersPills import at the very top of the file's
    # imports.
    if "SavedFiltersPills" not in text:
        text = re.sub(
            r"(import \{ useBulkDocumentActions } from)",
            (
                "import { SavedFiltersPills } from "
                "'@/components/customer-orders/saved-filters-pills';\n"
                r"\1"
            ),
            text,
            count=1,
        )

    # 2. State — add filterOpen + pickerOpen right after
    #    filterValues hook.
    text = re.sub(
        r"(useState<FilterDrawerValues>\(\{\}\);)",
        (
            r"\1\n"
            "  const [filterOpen, setFilterOpen] = useState(true);\n"
            "  const [pickerOpen, setPickerOpen] = useState<\n"
            "    null | 'agent' | 'org' | 'store'\n"
            "  >(null);"
        ),
        text,
        count=1,
    )

    # 3. tFilters hook.
    text = re.sub(
        r"(const tStates = useTranslations\([^\)]+\);)",
        r"\1\n  const tFilters = useTranslations('filters');",
        text,
        count=1,
    )

    # 4. Wrap return.
    text = re.sub(
        r"return \(\s*\n\s*<ListView",
        "return (\n    <>\n    <ListView",
        text,
        count=1,
    )

    # 5+6. Replace the FilterDrawer block inside extraActions with
    #      headerSlot + extraActionsLeft. The block to match starts
    #      with `<FilterDrawer` and ends with the closing `/>`
    #      followed by the next element start.
    if has_filter_drawer:
        fd_pattern = re.compile(
            r"\s*<FilterDrawer[\s\S]*?testId=\"[^\"]+-filter\"\s*\/>",
            re.MULTILINE,
        )
        fd_match = fd_pattern.search(text)
        if not fd_match:
            return False

    inline_block = """      headerSlot={
        <InlineFilterPanel
          hidden={!filterOpen}
          applyLabel={tFilters('find')}
          clearLabel={tFilters('clear')}
          onClear={() => {
            setFilterValues({});
            setCursor(undefined);
          }}
          pills={
            <SavedFiltersPills
              entity={ENTITY_NAME}
              currentQueryString=""
              onApply={() => undefined}
            />
          }
          testId="ENTITY_NAME-inline-filter"
        >
          <InlineFilterPanel.Field label={tFilters('period')} expandable>
            <PeriodPicker
              from={filterValues.momentFrom}
              to={filterValues.momentTo}
              onChange={({ from, to }) => {
                setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
                setCursor(undefined);
              }}
              labels={{
                yesterday: tFilters('period_yesterday'),
                today: tFilters('period_today'),
                week: tFilters('period_week'),
                month: tFilters('period_month'),
              }}
              testId="filter-period"
            />
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={tFilters('agent')} expandable>
            <CatalogPickerField
              value={
                filterValues.agentId
                  ? { id: filterValues.agentId, label: filterValues.agentLabel ?? filterValues.agentId }
                  : null
              }
              placeholder=""
              onPick={() => setPickerOpen('agent')}
              onClear={() => {
                setFilterValues({ ...filterValues, agentId: undefined, agentLabel: undefined });
                setCursor(undefined);
              }}
              testId="filter-agent"
            />
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={tFilters('organization')} expandable>
            <CatalogPickerField
              value={
                filterValues.organizationId
                  ? { id: filterValues.organizationId, label: filterValues.organizationLabel ?? filterValues.organizationId }
                  : null
              }
              placeholder=""
              onPick={() => setPickerOpen('org')}
              onClear={() => {
                setFilterValues({ ...filterValues, organizationId: undefined, organizationLabel: undefined });
                setCursor(undefined);
              }}
              testId="filter-org"
            />
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={tFilters('sum_from')} expandable>
            <Input
              type="number"
              value={filterValues.sumMinorFrom !== undefined ? String(filterValues.sumMinorFrom) : ''}
              onChange={(e) => {
                const v = e.target.value;
                setFilterValues({
                  ...filterValues,
                  sumMinorFrom: v === '' ? undefined : Number(v),
                });
                setCursor(undefined);
              }}
              data-test-id="filter-sum-from"
            />
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={tFilters('sum_to')} expandable>
            <Input
              type="number"
              value={filterValues.sumMinorTo !== undefined ? String(filterValues.sumMinorTo) : ''}
              onChange={(e) => {
                const v = e.target.value;
                setFilterValues({
                  ...filterValues,
                  sumMinorTo: v === '' ? undefined : Number(v),
                });
                setCursor(undefined);
              }}
              data-test-id="filter-sum-to"
            />
          </InlineFilterPanel.Field>
        </InlineFilterPanel>
      }
      extraActionsLeft={
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1.5 text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-muted)]"
          data-test-id="filter-toggle"
        >
          {filterOpen ? '▲' : '▼'} {tFilters('trigger')}
        </button>
      }"""

    entity_name = file.parent.name  # e.g. "payments-in"
    inline_block = inline_block.replace("ENTITY_NAME", entity_name)

    # The FilterDrawer block lives inside extraActions={ <> ... — we
    # remove just the FilterDrawer portion. The headerSlot and
    # extraActionsLeft props are inserted just BEFORE extraActions={.
    if has_filter_drawer:
        text = text.replace(fd_match.group(), "", 1)
    text = re.sub(
        r"(\s*)extraActions=\{",
        f"\n{inline_block}\\1extraActions={{",
        text,
        count=1,
    )

    # 8. Append picker mounts after the closing `</ListView>` tag.
    picker_mounts = """    <CatalogPicker
      open={pickerOpen === 'agent'}
      onClose={() => setPickerOpen(null)}
      title={tFilters('agent')}
      fetcher={async (q): Promise<PickerItem[]> => {
        const r = await api.get<{ items: { id: string; name: string }[] }>(
          `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
        );
        return r.items.map((x) => ({ id: x.id, primary: x.name }));
      }}
      onSelect={(item) => {
        setFilterValues({
          ...filterValues,
          agentId: item.id,
          agentLabel: String(item.primary),
        });
        setCursor(undefined);
      }}
    />
    <CatalogPicker
      open={pickerOpen === 'org'}
      onClose={() => setPickerOpen(null)}
      title={tFilters('organization')}
      fetcher={async (q): Promise<PickerItem[]> => {
        const r = await api.get<{ items: { id: string; name: string }[] }>(
          `/organizations?search=${encodeURIComponent(q)}&limit=20`,
        );
        return r.items.map((x) => ({ id: x.id, primary: x.name }));
      }}
      onSelect={(item) => {
        setFilterValues({
          ...filterValues,
          organizationId: item.id,
          organizationLabel: String(item.primary),
        });
        setCursor(undefined);
      }}
    />
    <CatalogPicker
      open={pickerOpen === 'store'}
      onClose={() => setPickerOpen(null)}
      title={tFilters('store')}
      fetcher={async (q): Promise<PickerItem[]> => {
        const r = await api.get<{ items: { id: string; name: string }[] }>(
          `/stores?search=${encodeURIComponent(q)}&limit=20`,
        );
        return r.items.map((x) => ({ id: x.id, primary: x.name }));
      }}
      onSelect={(item) => {
        setFilterValues({
          ...filterValues,
          storeId: item.id,
          storeLabel: String(item.primary),
        });
        setCursor(undefined);
      }}
    />
    </>"""

    # ListView in the patched files is a self-closing tag `/>`. We
    # need to swap the trailing `</ListView>` OR `/>` followed by `)`.
    # All bulk-patched pages have `/>` self-close; replace the first
    # occurrence that precedes a `\n  );` block.
    closing_pattern = re.compile(
        r"(\n\s*\/>)\s*\n\s*\);\s*\n\}",
        re.MULTILINE,
    )
    closing_match = closing_pattern.search(text)
    if not closing_match:
        return False
    text = text[: closing_match.start()] + closing_match.group(1) + "\n" + picker_mounts + "\n  );\n}" + text[closing_match.end() :]

    if text == original:
        return False
    file.write_text(text, encoding="utf-8")
    return True


def main() -> None:
    patched = 0
    skipped: list[str] = []
    for slug in TARGET_PAGES:
        f = APP_DIR / slug / "page.tsx"
        if not f.exists():
            skipped.append(f"missing: {slug}")
            continue
        try:
            ok = patch(f)
        except Exception as e:
            skipped.append(f"error {slug}: {e}")
            continue
        if ok:
            patched += 1
            print(f"  patched: apps/web/src/app/(app)/{slug}/page.tsx")
        else:
            skipped.append(slug)

    if skipped:
        print(f"\nskipped: {', '.join(skipped)}")
    print(f"\n{patched}/{len(TARGET_PAGES)} files patched")


if __name__ == "__main__":
    main()
