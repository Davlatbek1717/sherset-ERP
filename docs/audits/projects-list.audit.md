# projects — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — CLEAN (no confirmed defect). The mature reference shell for the cohort.
**Ground-truth (§4): CLEAN capture — one of only two groundable L12 pages.** `docs/moysklad-reference/visual-captures/00-module/project/dom/00-clean-default.html` renders the grid header row as `>LABEL<` + `title="LABEL"` (DOM-role verified 2026-06-05; added to the GROUNDING-LOCK registry: Наименование · Код · Описание). PNG `screenshots/00-clean-default.png` confirms «+ Проект», search «Наименование, код или описание», «Изменить».
**DEDUP:** top-level form-audited. This pass = LIST axis.

## A. Structural / columns + i18n — CLEAN (DOM-grounded)
- Columns Наименование(link)/Код/Описание/state(badge) — labels match the §4 clean capture (`col_name`/`col_code`/`col_description`); no hardcoded leak. The extra `state` badge column is a benign enhancement (archive filter is inline). No money column (correct).

## B. Interactive chrome — CLEAN
- Search wired (name/code/description); real cursor pagination (`hasNext={!!data?.nextCursor}`); `ProjectBulkActionsDropdown` + `MassEditModal` (owner) wired; `InlineFilterPanel` (Состояние = active/archived). Row → `/settings/projects/[id]`.

## DEFER / Phase-2
- Browser-smoke: search + paging + mass-edit round-trip (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
