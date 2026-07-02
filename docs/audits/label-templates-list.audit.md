# label-templates — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff flagged dead sort config (LOW). Opus verified the BE supports `sortBy`.
**Ground-truth (§4):** NO moysklad capture; partially-bespoke template-admin list. Sibling = publications (the wired template-admin shell). No label churn.
**DEDUP:** detail/[id]+new i18n'd in cohort L. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN
- Columns name(link)/description/paper/grid/size/state/createdAt; headers via `t()`/`tCommon()` — no hardcoded leak. Active/Archived filter pills + search wired; dates via shared `formatDate`.

## B. Interactive chrome — 1 fix (dead sort threaded)
- **Bug:** the `name` and `createdAt` columns carried `sortable: true` (`createdAt` also `sortField`), but `ListView` was given no `sortKey`/`sortDir`/`onSortChange` — so per `DataTable` (`isSortable = !!col.sortable && !!onSortChange`) the headers rendered NON-sortable (dead config, no user-visible broken affordance, hence LOW).
- **Fix (thread sort, BE supports it):** `LabelTemplateFilterSchema.sortBy` enum = `['name','createdAt','updatedAt']` (default name asc) → added `sortKey`/`sortDir` state, `sortBy`/`sortDir` params, sort in queryKey, and `onSortChange` — the sortable headers are now functional (matches the publications sibling).

## DEFER / Phase-2
- Browser-smoke: click the name/created headers → list re-sorts (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
