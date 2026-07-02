# stores — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — CLEAN (no confirmed defect). Engine used it as a real-cursor settings-list reference.
**Ground-truth (§4):** capture CONTAMINATED (`06-module/store` body = «Заказы покупателей»). Sibling-parity (projects, the §4-clean settings-list shell). No label churn.
**DEDUP:** top-level form-audited. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN
- i18n-keyed headers (`pages.stores`); no hardcoded leak. No money column (correct). Real cursor pagination wired.

## B. Interactive chrome — CLEAN
- Search box wired; mass-edit/bulk dropdown present; row → `/settings/stores/[id]`. No FSM/doc-toolbar (correct settings-list absences).

## DEFER / Phase-2
- Browser-smoke: search + paging + CRUD round-trip (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
