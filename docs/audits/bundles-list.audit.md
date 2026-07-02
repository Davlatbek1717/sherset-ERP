# bundles — LIST parity audit (Cohort L6)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_cabc94da-b58`, 46 agents, 27 confirmed).
**Ground-truth (§4):** NO clean catalog capture (all 04-module captures CONTAMINATED). bundles = the SAME `/products` backend filtered `kind=bundle`, so its structural reference is **products/page.tsx** (sibling-parity); labels are products-parity, never capture-grounded.

## A. Structural / column / format deltas — FIXED
- **Money cell** bare `formatMoney(price)` (renders «64 000,00 сум») → `formatMoney(price,'UZS',{displayAs:'none'})` (no suffix) at both the `cell` and `cellText` sites — matches products (the reference) + the project-wide list convention (35 list pages use `displayAs:'none'`; bundles/services/variants were the 3 stragglers). format.ts documents: list cells render WITHOUT the «сум» suffix.
- **Folder column header** `t('folder')` resolved to «Папка» → i18n value changed to **«Группа»** (uz «Papka»→«Guruh»). products-parity: products column = literal «Группа», the «Группа товаров» filter + products_new.folder_label all use «Группа»; «Папка» was the lone outlier. (The shared key also titles the folder picker → «Группа», matching products' picker title.)

## B. Interactive / chrome deltas — FIXED
- Added `onRefresh={() => refetch()}` (refresh button; `refetch` already in scope), `selectionCount={bulk.selectedIds.size}` (moysklad always-on «☑ N» counter), and `createPosition="start"` (create button right of title) — all present on the products reference + ~all list pages; bundles/services were the outliers.

## DEFER / non-issues
- 🟢 `onHelp` NOT added — products' own `onHelp` opens `/help/products` (non-existent route, dead link); not propagated. DEFER (help-route feature).
- 🟢 **Empty-state**: bundles passes only `emptyTitle`; orphan `empty_rich_heading`/`empty_rich_helper` keys exist but are unwired, and there is no `emptyDescription`. Presentational, LOW, and the exact empty-state shape can't be ground-truthed (contaminated captures) → DEFER.
- 🟢 **Dead «Массовое редактирование»** (no `onMassEdit`) — cohort-wide catalog feature, BE `/products/mass-edit` exists. DEFER (same as L4/L5).
- 🟢 **LIMIT=25** vs products' 100 — the moysklad catalog default page-size is unverifiable without a clean capture → DEFER the number (§4).
- 🟢 archived **«Состояние» badge column** present on bundles (absent on products, which uses the archive filter) — kept; products' archive-via-filter decision is a products-specific D2 choice, the badge column is a harmless useful extra.

## Gates
typecheck 0 (web+api) · biome 0/0 (changed files) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (folder=«Группа» value-lock + displayAs wiring-lock) · web Vitest 1338 pass/1 skip (no regress).
