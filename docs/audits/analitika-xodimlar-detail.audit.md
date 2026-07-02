# analitika/xodimlar/[id] — detail page parity audit

- **Module:** `analitika/xodimlar` (Аналитика сотрудников — employee profile card: position/email/phone/username/last-login
  + HR roles + an Edit button) (`apps/web/src/app/(app)/analitika/xodimlar/[id]/page.tsx`)
- **Date:** 2026-06-04 (Cohort J — Analytics)
- **Protocol:** Cohort batch audit (`wf_0d7f6fc7-956`). Premise corrected the brief: this is an employee PROFILE card with
  an Edit affordance (→ staff edit modal), NOT a pure read-only metric view, and has no money/counterparty. Operator
  ground-truthed.
- **Reference:** the staff list/form (`xodimlar/page.tsx` + `_components/staff-form.tsx`); no money/counterparty bug-class applies.

## Verdict

A correctly-scoped employee profile card. UI strings are `t()`-wired (uz+ru). One LOW display gap (HR roles shown as raw
codes) is DEFERRED — it needs role code→label resolution, not a simple literal swap.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| J-XO1 | HR roles badges (L113-119) | a human role label («Администратор»/«Кассир»…) | maps `data.hrRoles` and prints each raw code `{r}` verbatim (e.g. `admin`/`cashier`) | delta | low | **DEFERRED** — proper fix resolves codes→labels via `hrRoleApi` (a query + map), not a literal swap; do it with the `hr/employees/[id]/permissions` subroute audit (Phase-2). Not an i18n-literal leak. |

## B. Interactive deltas

(none — the Edit button (L83) opens the real staff edit modal [`edit_title`], correctly wired; no document interactions.)

## Confirmed mirrors (correct profile-card specifics — NOT deltas)

- No money/sum/balance metric, no counterparty, no positions, no posting-FSM, no DocumentTabs — correct for a staff
  profile. The Edit affordance is intentional (not an out-of-parity extra).

## Deferred (Phase-2)

- 🟡 **J-XO1** HR roles → resolved labels (with `hrRoleApi`), bundled with the `hr/employees/[id]/permissions` subroute audit.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
