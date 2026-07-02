# analitika/buyurtmalar/[id] — detail page parity audit

- **Module:** `analitika/buyurtmalar` (Аналитика заказов — read-only order analytics: meta + lines table + CSV export)
  (`apps/web/src/app/(app)/analitika/buyurtmalar/[id]/page.tsx`)
- **Date:** 2026-06-04 (Cohort J — Analytics)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_0d7f6fc7-956`). Premise established
  these are read-only analytics surfaces (no editor/FSM/DocumentTabs) and corrected the brief (the three analitika pages
  are different surfaces, not one template). Operator ground-truthed each delta.
- **Reference:** the `buyurtmalar` list page (label/format consistency); no document sibling (read-only view).

## Verdict

A correctly-scoped read-only order-analytics view (back link + CSV export + lines table). Two real display bugs FIXED:
a money formatter that float-coerced minor units + hardcoded a Latin «so'm», and a raw state-enum render.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| J-BU1 | order state (line 100) | a translated label | `<div>{data.state}</div>` rendered the raw BE enum `draft/formed/done` | delta | high | **FIXED** → added the list page's `stateLabel(s)` mapper (`t('state_draft/formed/done')`, keys exist) → `{stateLabel(data.state)}`. |
| J-BU2 | money (total + line price/sum + CSV) | BigInt-safe + moysklad currency suffix «сум» | local `fmtMoney = Number(minor)/100 .toLocaleString('ru-RU') + " so'm"` (JS float on BigInt-minor + hardcoded Latin «so'm») | delta | med | **FIXED** → deleted the local helper; use shared `formatMoney(minor)` from `@moysklad/ui` (BigInt-safe, «сум» suffix) at all sites incl. the CSV export. |

## B. Interactive deltas

(none — CSV export is a legitimate analytics affordance; no edit/save/FSM/positions-editor on a read-only view.)

## Confirmed mirrors (correct read-only-analytics specifics — NOT deltas)

- No DetailToolbar / createMenu / posting-FSM / PositionEditor / DocumentTabs-History / counterparty picker — correct for
  a read-only report. `counterpartyName` is a display string under `col_counterparty` (= «Контрагент»), not a relation field.

## Deferred

- 🟢 CSV money cells now export the `formatMoney` string («1 234,00 сум») — same as before (formatted, not a raw number);
  exporting parseable numbers is a minor Phase-2 data-quality improvement, not a parity/label bug.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
