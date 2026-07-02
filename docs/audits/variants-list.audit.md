# variants — LIST parity audit (Cohort L6)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_cabc94da-b58`, 46 agents, 27 confirmed).
**Ground-truth (§4):** NO clean catalog capture (all 04-module captures CONTAMINATED). variants is a **separate `Variant` entity** (own `/variants` + `/variants/bulk-*` endpoints) — products is the shared-chrome/format reference ONLY. The documented legitimate differences were NOT flagged: no AssortmentBulk/Print dropdown (those POST to `/products/bulk-*` — wrong entity; see docs/moysklad-reference/variants/FINDING.md), and a smaller filter set (the Variant model lacks ownerId/supplierId/productFolderId/country/trackingType).

## A. Structural / format deltas — FIXED
- **Money cell** bare `formatMoney(price)` / `formatMoney(p)` → `formatMoney(…, 'UZS', { displayAs: 'none' })` (cell + cellText) — drops the «сум» suffix to match products + the list-view convention (same cohort-wide fix as bundles/services).

## B. Interactive / wiring deltas — FIXED
- **Stale «Ниже минимума» comment** (page.tsx:143-147) claimed `belowMinimum` was SKIPPED / "out of scope … Re-add once VariantFilterSchema gains belowMinimum" — but the filter is **fully wired end-to-end**: state + URL param + the 3rd InlineFilterPanel.Field select (UI), `VariantFilterSchema.belowMinimum` (schema), and `VariantService.list` Prisma field-reference stock comparison (service). Corrected the comment to list it as the 3rd supported filter.
- **onClear gap**: the "Clear" handler reset archived/productFilter/cursor but NOT `belowMinimum` → added `setBelowMinimum(undefined)` so Clear actually clears the wired filter.

## DEFER / non-issues
- 🟢 No assortment bulk/print dropdown — LEGITIMATE (separate entity; wiring `/products/bulk-*` would corrupt variant data). NOT flagged.
- 🟢 Smaller filter set (only Основной товар + Состояние + Ниже минимума) — LEGITIMATE (Variant model lacks the other columns). NOT flagged.
- 🟢 No folder/vat/state grid columns — variant grid is name/code/barcode/characteristics/parent-product/price; not a products column-for-column diff.

## Gates
typecheck 0 (web+api) · biome 0/0 (changed files) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (variants displayAs wiring-lock) · web Vitest 1338 pass/1 skip (no regress).
