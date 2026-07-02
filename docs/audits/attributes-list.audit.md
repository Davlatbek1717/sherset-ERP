# attributes — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — CLEAN (no confirmed defect). Engine used it as a bespoke thin-list reference for webhooks/print-templates.
**Ground-truth (§4):** NO moysklad capture; partially-bespoke «Дополнительные поля» settings list. Sibling-parity (print-templates/webhooks bespoke shell). No label churn.
**DEDUP:** detail-audited in cohort L. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN
- i18n-keyed headers (`pages.attribute_admin` + `attribute_entity`); the `header: '#'` index column is a benign symbol (not a translatable label). No hardcoded Cyrillic/Latin-uz leak. No money column (correct).

## B. Interactive chrome — CLEAN
- Bespoke entity-scoped attribute list (thin shell, no search/cursor box — legitimate for a small per-entity field list). Row actions use `useApiMutation`/`useDestructiveMutation` → failures surface (critic confirmed). No FSM/doc-toolbar (correct settings-list absences).

## DEFER / Phase-2
- Browser-smoke: per-entity attribute CRUD round-trip (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
