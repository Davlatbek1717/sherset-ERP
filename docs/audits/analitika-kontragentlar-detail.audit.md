# analitika/kontragentlar/[id] — detail page parity audit

- **Module:** `analitika/kontragentlar` (Аналитика контрагентов — counterparty assortment + order-forming analytics)
  (`apps/web/src/app/(app)/analitika/kontragentlar/[id]/page.tsx`)
- **Date:** 2026-06-04 (Cohort J — Analytics)
- **Protocol:** Cohort batch audit (`wf_0d7f6fc7-956`). Premise corrected the brief: this is NOT a pure read-only report —
  it has a period filter + a useConfirm action bar + per-product order-qty (an assortment-ordering tool). The counterparty
  is the page SUBJECT (not a labeled relation field) so the «Контрагент»-label check is N/A. Operator ground-truthed.
- **Reference:** the kontragentlar list/analytics page (label/format) + `analitika/buyurtmalar/[id]` (same money-helper bug).

## Verdict

A correctly-scoped counterparty-analytics + assortment-ordering view. Two real bugs FIXED: the float/hardcoded-«so'm»
money formatter (8 sites), and a UTC date-range conversion that shifts the period filter by a day in +5/Tashkent.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| J-KO1 | money (StatsCards + buy/sell/sold/order columns) | BigInt-safe + «сум» | local `fmtMoney = (minor/100).toLocaleString('ru-RU') + " so'm"` (JS float + hardcoded Latin «so'm»), used at 8 sites | delta | high | **FIXED** → deleted the local helper; shared `formatMoney(minor)` from `@moysklad/ui`. |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| J-KO2 | date-range filter | the picked local date is the queried date | `toISODate = d.toISOString().slice(0,10)` (UTC) → in +5/Tashkent the period boundary shifted a day | delta | low | **FIXED** → local YYYY-MM-DD from `getFullYear/getMonth/getDate` (mirrors cash-in/new). |

## Confirmed mirrors (correct specifics — NOT deltas)

- The period filter, useConfirm clear/form-order action bar, and per-product order-qty inputs are intentional analytics
  affordances — not out-of-parity extras. The counterparty is the page subject (H1 + INN), not a «Контрагент» field.

## Deferred

- 🟢 None. (Verify `form_order_btn` / `clear_btn` wiring in Phase-2 browser smoke.)

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
