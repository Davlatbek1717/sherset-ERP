# services — LIST parity audit (Cohort L6)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_cabc94da-b58`, 46 agents, 27 confirmed).
**Ground-truth (§4):** NO clean catalog capture (all 04-module captures CONTAMINATED). services = the SAME `/products` backend filtered `kind=service` and is a near-line-for-line mirror of bundles; structural reference = **products/page.tsx** (sibling-parity), labels products-parity.

## A. Structural / column / format deltas — FIXED
- **Money cell** bare `formatMoney(price)` → `formatMoney(price,'UZS',{displayAs:'none'})` (cell + cellText) — same fix as bundles; drops the «сум» suffix to match products + the list-view convention.
- **Folder column header** `t('folder')` «Папка» → **«Группа»** (uz «Papka»→«Guruh») — products-parity (shared `pages.services.folder` key; same change as bundles).

## B. Interactive / chrome deltas — FIXED
- Added `onRefresh={() => refetch()}`, `selectionCount={bulk.selectedIds.size}`, `createPosition="start"` — mirrors the products reference; services was an outlier.

## DEFER / non-issues
- 🟢 `onHelp` NOT added (products' `/help/products` is a dead route). DEFER.
- 🟢 **Empty-state**: only `emptyTitle` wired; `empty_rich_heading`/`empty_rich_helper` keys exist but are orphaned (no `richEmpty`/`emptyDescription`). Presentational, LOW, no clean capture to ground the shape → DEFER.
- 🟢 **Dead «Массовое редактирование»** (no `onMassEdit`) — cohort-wide catalog feature. DEFER.
- 🟢 **LIMIT=25** vs products' 100 — moysklad catalog default unverifiable → DEFER the number (§4).
- 🟢 archived **«Состояние» badge column** present (absent on products) — kept as a harmless useful extra.
- 🟢 services detail/new FORM picker title/placeholder («Выбор папки»/«Выберите папку») still say «папка» — detail scope, out of L6 list axis (the shared `folder` key fix DID relabel the form FIELD label to «Группа»). Phase-2 detail polish.

## Gates
typecheck 0 (web+api) · biome 0/0 (changed files) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (folder=«Группа» value-lock + displayAs wiring-lock) · web Vitest 1338 pass/1 skip (no regress).
