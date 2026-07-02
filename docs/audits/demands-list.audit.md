# demands — LIST parity audit (Cohort L2)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** capture `03-module/demand/dom-default.html` — grounded vs its OWN final list-grid `<th>` row.
**Ground-truth (§4):** capture list header = `№·Время·Со склада·Контрагент·Грузополучатель·Организация·Сумма·Оплачено·Отправлено·Напечатано·Комментарий` (read myself, tail block).

## A. Structural / column deltas

- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, page.tsx:311).
- **FIXED — store column «Склад» → «Со склада»** (`tFields('store')` → `tFields('store_from')`, :323; goods ship FROM a store).
- **FIXED — counterparty «Покупатель» → «Контрагент»** (`tFields('customer')` → `tFields('agent')`, :331). §4.
- **FIXED — hardcoded `header: 'Pos.'`** (gate-blind ASCII positions-count column) → `tFields('positions_count')` (=«Позиции»), :402.
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- **DEFER (real gap, BE+FE) — missing «Грузополучатель» (consignee) column.** The capture list grid has a Грузополучатель column (col 5). Adding it needs a BE list-query include (`demand.service.ts list()`) + the demand row type + an FE column — backend-shaped/additive. Documented for a focused follow-up (Phase-2/BE-backlog), not faked here.

## B. Interactive deltas

- Toolbar + bulk wired via the shared list shell. No interactive deltas beyond the deferred consignee column.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
