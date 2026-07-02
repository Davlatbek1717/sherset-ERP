# custom-entities — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — CLEAN (no confirmed defect). Engine used it as the WIRED simple-catalog reference for regions/task-types.
**Ground-truth (§4):** capture CONTAMINATED (`00-module/customentity` body = «Заказы покупателей»). Sibling-parity only; no label churn.
**DEDUP:** detail-audited in cohort L. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN
- i18n-keyed headers (`pages.custom_entity_admin`); no hardcoded Cyrillic/Latin-uz leak. Default sort `name`. No money column (correct).

## B. Interactive chrome — CLEAN
- Search box wired full-stack (`searchInput`+`useDebounce`; BE `name contains`). Inline/drawer CRUD (legitimate — no `/[id]` route). No bulk/FSM/doc-toolbar (correct settings-list absences, refuted as false-deltas).

## DEFER / Phase-2
- Pagination: BE `take:200`, FE `hasNext={false}` — low-cardinality → DEFER class.
- Browser-smoke: search + CRUD round-trip (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
