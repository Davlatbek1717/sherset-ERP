# mxik — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`). Critic-vetted CLEAN; ground-truthed by Opus.
**Ground-truth (§4):** NO moysklad capture (МХИК / ТН ВЭД is a UZ-specific tax-code reference, no moysklad analogue) → sibling-parity ONLY, no label churn. Sibling for the `ListView` cursor pattern = `settings/bank-accounts` / products. (Reference `tracking-codes` DEMOTED — it carried a fixed dead-pagination bug, so it is a bad cursor baseline.)

## A. Structural / columns + i18n — CLEAN
- Columns code(mono)/name_uz/name_ru/unit/source(toned badge); headers via `t('pages.mxik_admin.*')`/`tCommon()` — no hardcoded leak. Source badge tone map (soliq/manual/override) falls through correctly.

## B. Interactive chrome — CLEAN
- Search WIRED (`searchInput` + `useDebounce(300)` + threaded param + queryKey). **Real cursor pagination** `hasNext={!!data?.nextCursor}` + BE `total` from `count()`. Source pills + active/archived toggle filters, sortable code/name_uz columns, default code/asc.
- Create is **import-only** via `/settings/mxik/import` (bulk import) with NO inline add — INTENTIONAL for an admin reference list (refuted as a "missing create" delta).

## DEFER / Phase-2
- Import-flow + cursor-advance browser-smoke = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1361 (0 regress). No code change on this page (audit-only).
