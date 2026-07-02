# invoices-out — LIST parity audit (Cohort L2)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** capture `03-module/invoiceout/dom-default.html` — grounded vs its OWN final list-grid `<th>` row.
**Ground-truth (§4):** capture list header = `№·Время·Контрагент·Организация·Со склада·Сумма·План. дата оплаты·Оплачено·Отгружено·Отправлено·Напечатано·Комментарий` (read myself, tail block).

## A. Structural / column deltas

- **FIXED — counterparty «Покупатель» → «Контрагент»** (`tFields('customer')` → `tFields('agent')`, page.tsx:320). §4.
- **FIXED — store column «Склад-источник» → «Со склада»** (`tFields('source_store')` → `tFields('store_from')`, :348; capture `<th>` = «Со склада»).
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- Date column already `tFields('time')`=«Время» (matches capture) — confirmed_mirror, no change.

## B. Interactive deltas

- Edit menu wired via the shared i18n-clean `useDocEditMenuItems` (`editMenu` prop). Bulk-delete + mass-edit reachable.
- **DEFER (real gap, needs Phase-2) — no «Статус» bulk-transition toolbar control.** Capture toolbar shows a «Статус» button; the page passes `hasFSM:true` but renders no status-transition control (customer-orders has it via `extraActions`). Mirroring it requires the InvoiceOut FSM action set, and the shared edit-menu currently renders post/unpost as *disabled placeholders* (backend FSM-transition support unverified). Deferred to Phase-2 (runtime verify the FSM endpoints before wiring), not guessed here.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
