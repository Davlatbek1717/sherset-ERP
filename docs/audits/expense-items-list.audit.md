# expense-items — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`). Critic-vetted CLEAN; ground-truthed by Opus.
**Ground-truth (§4):** NO moysklad capture → sibling-parity ONLY, no label churn. expense-items is the **correctly-wired template** for the settings-finance list family (`moyskladToolbar` + `InlineFilterPanel`); it was the reference used to fix the sibling `tax-rates` dead-search defect.
**DEDUP:** detail/labels covered in cohort K (2026-06-04). This pass = LIST axis only.

## A. Structural / columns + i18n — CLEAN
- Columns name(link→detail)/code/state(badge); all headers + empty-state + placeholder routed through `t()`/`tCommon()`/`tFields()`/`tFilters()` — no hardcoded Cyrillic or Latin-uz leak. No money/date cell → no `Number()/100` or raw `toLocaleDateString` risk.

## B. Interactive chrome — CLEAN
- Search WIRED end-to-end: `searchInput` + `useDebounce(300)` + threaded `search` param + queryKey + `emptyTitle` no_results branch; BE `expense-item.service.ts` applies `name: { contains, mode:'insensitive' }`. `InlineFilterPanel` (Фильтр + Статус) + `hasActiveFilter` correct. Sortable name column, default name/asc.
- Confirmed-correct (refuted): no bulk-action bar / status-pill / counterparty-date-store filter — all legitimate settings-list absences.

## DEFER / Phase-2
- Pagination: BE `take:200` + `total:items.length`, FE `hasNext={false}` — dead pagination, but low-cardinality (expense categories) → L8-discounts DEFER class. Browser-smoke = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1361 (0 regress). No code change on this page (audit-only).
