# hr/employees/[id] — detail page parity audit

- **Module:** `hr/employees` (Сотрудники / employee record — bespoke read-only entity card) detail page
  (`apps/web/src/app/(app)/hr/employees/[id]/page.tsx` + `_components/{EmployeeModal,role-multi-select,TabBar}` +
  `[id]/permissions` + `[id]/salary` subroutes)
- **Date:** 2026-06-04 (Cohort I — HR)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_ef7df3c0-a3c`). Premise established
  that an employee is a **bespoke staff-record card** (Avatar + InfoRow grid + TabBar subroutes + a modal editor), NOT a
  document-detail — so it legitimately lacks ALL document scaffolding. Operator ground-truthed each delta.
- **Reference:** GOLD capture `00-module/employee` for field/label parity only (no document-detail sibling).

## Verdict

hr/employees is a correctly-scoped staff-record card (avatar + email/phone/telegram/department/role/login meta + an
edit modal + permissions/salary subroutes). One real i18n leak (FIXED). No counterparty/positions/money/posting — all
legitimate for a person record.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I-EM1 | `role-multi-select` (EmployeeModal) aria-labels | i18n via t() | hardcoded English `aria-label={`Remove ${labelOf(v)}`}` + `aria-label="Toggle role picker"` (the Cyrillic-only gate misses English too) | delta | low | **FIXED** → `t('role_remove_aria',{role})` + `t('role_picker_toggle')`; +`pages.hrEmployees.{role_remove_aria,role_picker_toggle}` (ru+uz). |

## B. Interactive deltas

(none — the «Tahrirlash» (`action_edit`) button opening `EmployeeModal` IS the edit affordance [correct, not a dead
button]; delete → `hrEmployeeApi.remove`; TabBar links resolve to the real `permissions/` + `salary/` subroutes.)

## Confirmed mirrors (correct staff-record specifics — NOT deltas)

- No DetailToolbar/DetailHeader/DetailContentTabs/DetailTotalsSidebar/createMenu/print/posting-FSM/History, no
  counterparty/positions/money/VAT/store/currency — all legitimate; an employee is not a document.
- Save lives in `EmployeeModal` (not on the page); `lastLoginAt`/`createdAt` via `toLocaleString` is intentional read-only.

## Deferred (Phase-2 — not audited this pass)

- 🟡 **`hr/employees/[id]/permissions` and `/salary` subroutes** — separate detail surfaces (the dvigatel scoped to the
  main `[id]` card). Audit them in a follow-up (label-grounding + i18n) with the same discipline.

**Gates:** web tc 0 · biome 0 · web Vitest 1306 pass/1 skip (0 regress) · i18n key-existence ru+uz + no-hardcoded
(hr/employees page.tsx registered; the `_components/*` leak was caught by manual grep, not the page-only gate).
**HONEST: Phase-1 — NOT browser-smoked.**
