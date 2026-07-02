# sales-returns — LIST parity audit (Cohort L2)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** capture `03-module/salesreturn/dom-default.html` — grounded vs its OWN final list-grid `<th>` row.
**Ground-truth (§4):** capture list header = `№·Время·На склад·Контрагент·Организация·Сумма·Отправлено·Напечатано·Комментарий` (read myself, tail block). The SIMPLEST sales list — no payment/shipped/reserve/status columns (returns are simpler) — so their absence is NOT a delta.

## A. Structural / column deltas

- **FIXED — date column «Дата» → «Время»** (`header`+`headerText` `tFields('moment')` → `tFields('time')`, page.tsx:266-267).
- **FIXED — store column «Склад» → «На склад»** (`tFields('store')` → `tFields('store_to')`, :279-280; goods return INTO a store → «На склад», not «Со склада»). §4 directional.
- **FIXED — counterparty «Покупатель» → «Контрагент»** (`tFields('customer')` → `tFields('agent')`, :288-289). §4.
- **FIXED — hardcoded `header/headerText: 'Pos.'`** → `tFields('positions_count')` (=«Позиции»), :365-366.
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).

## B. Interactive deltas

- **FIXED — hardcoded Latin-uz badge «Ha»** in the Отправлено/Напечатано cells (page.tsx:395, 404) → `{tCommon('yes')}` (renders «Да» ru / «Ha» uz, matching the demands/customer-orders siblings). Gate-blind Latin-uz leak closed.
- **DEFER (real gap, needs Phase-2) — no bulk-action toolbar surface.** The page renders row checkboxes (`selectionCount` + `bulk.listViewProps`, `hasFSM:true`) but NO edit/status menu — so a selection has no action. The capture toolbar shows Изменить + Статус. Wiring it needs the mass-edit machinery (state + MassEditModal, which this page lacks) + an FSM action set whose backend support is unverified (shared hook post/unpost are disabled placeholders). Deferred to Phase-2 (verify endpoints + add mass-edit machinery), not guessed here.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
