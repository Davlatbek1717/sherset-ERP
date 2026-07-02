# payrolls/[id] — detail page parity audit

- **Module:** `payrolls` (Зарплаты / payroll document — period + per-employee accrual/deduction amount rows) detail page
  (`apps/web/src/app/(app)/payrolls/[id]/page.tsx` + `/new`)
- **Date:** 2026-06-04 (Cohort I — HR)
- **Protocol:** Cohort batch audit (`wf_ef7df3c0-a3c`). Premise classified payroll as a non-sales DOCUMENT (amount-rows,
  no product positions / counterparty / VAT) and demoted sales money-docs to feature-source. Operator ground-truthed.
- **Reference:** an amount-rows document shell (inventories/internal-orders) + no gold capture (sibling-parity + critic).

## Verdict

payrolls is a correctly-scoped payroll document (period + accrual/deduction lines + earnings/deductions/net totals +
draft→posted→cancelled FSM). **History tab is correctly wired** (`auditEntity="Payroll"` matches the backend, which
writes `auditLog.create({entity:'Payroll'})` at 6 sites — NOT a feature-gap). One real money-display fix.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I-PR1 | money rendering (per-line + earnings/deductions/net) | label with the document's currency | local `fmtMoney(minor, currency='UZS')` always called WITHOUT a currency arg → every amount suffixed «UZS» regardless of `data.currency` | delta | low | **FIXED** (`[id]`) → threaded `data.currency` at the 4 call sites. (`/new` has no currency value yet — the creation preview keeps the UZS default; the saved doc gets the org currency server-side.) |

## B. Interactive deltas

(none — the post/unpost/cancel transitions map to real backend routes; the DetailTotalsSidebar VAT toggles are
intentionally inert [`vatEnabled=false`] for a non-VAT doc; `totalQty = lines.length` is by design.)

## Confirmed mirrors (correct payroll specifics — NOT deltas)

- No «Контрагент»/agent picker (the employee is its party), no product PositionEditor (lines = accrual/deduction amount
  rows with `itemType` enum + free-text name + `sumMinor`), no VAT/store/price/qty/discount columns — all legitimate.
- `auditEntity="Payroll"` matches `payroll.service.ts` audit writes → History populates (correctly wired).
- `signedMinor()` applies the deduction sign client-side; the period uses distinct `periodStart`/`periodEnd` + read-only `postedAt`.

## Deferred

- 🟢 None blocking. (Optional: verify the backend independently derives the deduction sign from `itemType` rather than
  trusting a client-sent value — a Phase-2 backend check, not a label/parity gap.)

**Gates:** web tc 0 · biome 0 · web Vitest 1306 pass/1 skip (0 regress) · i18n key-existence ru+uz + no-hardcoded
(payrolls registered). **HONEST: Phase-1 — NOT browser-smoked.** Live smoke owed: a non-UZS payroll → amounts show the
right currency suffix.
