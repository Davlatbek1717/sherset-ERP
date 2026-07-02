# invoices-in — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Ground-truth (§4):** capture `02-module/invoicein` final list-grid `<th>` (read myself): `№·Время·Контрагент·Организация·На склад·Сумма·Оплачено·Принято·План. дата оплаты·Входящий номер·Входящая дата·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

- **FIXED — counterparty «Поставщик» → «Контрагент»** (`tFields('supplier')` → `tFields('agent')`, page.tsx:342). §4.
- **FIXED — date «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, :332).
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- **DEFER (BE-include gaps) — missing columns** present in the capture grid but not rendered: «На склад» (store_to), «План. дата оплаты», «Входящий номер» (full), «Входящая дата». Each needs a BE list-query include + the InvoiceRow type + an FE column → documented for a focused BE+FE follow-up, not faked.

## B. Interactive deltas

- **FIXED — hardcoded Latin-uz «Ha» badge** in Отправлено/Напечатано cells (:438, :446) → `{tCommon('yes')}` (gate-blind leak closed).

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
