# purchase-orders — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Ground-truth (§4):** capture `02-module/purchaseorder` final list-grid `<th>` (read myself): `№·Время·Контрагент·Организация·Сумма·Выставлено счетов·Оплачено·Принято·В ожидании·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

- **FIXED — counterparty «Поставщик» → «Контрагент»** (`tFields('supplier')` → `tFields('agent')`, page.tsx:790). The list grid uses the universal term; «Поставщик» is the doc/menu name. §4.
- **FIXED — hardcoded `header: 'Pos.'`** → `tFields('positions_count')` «Позиции» (:991, gate-blind ASCII).
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- Date column already `tFields('time')`=«Время»; Принято/В ожидании/Выставлено счетов columns are confirmed_mirrors of the capture — no change.

## B. Interactive deltas

- Bulk/status toolbar via `extraActions` already wired. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
