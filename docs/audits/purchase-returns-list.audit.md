# purchase-returns — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Ground-truth (§4):** capture `02-module/purchasereturn` final list-grid `<th>` (read myself): `№·Время·Со склада·Организация·Контрагент·Сумма·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

- **FIXED — counterparty «Поставщик» → «Контрагент»** (`tFields('supplier')` → `tFields('agent')`, page.tsx:321). §4.
- **FIXED — date «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, :302).
- **FIXED — store «Склад» → «Со склада»** (`tFields('store')` → `tFields('store_from')`, :313; goods leave TO supplier → «Со склада»). §4 directional.
- **FIXED — hardcoded `header: 'Pos.'`** → `tFields('positions_count')` (:391).
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- **DEFER (low) — default column ORDER:** capture is `…Со склада·Организация·Контрагент…` (Организация before Контрагент); ours orders Контрагент before Организация. Cosmetic order; deferred.

## B. Interactive deltas

- **FIXED — hardcoded Latin-uz «Ha» badge** (:418, :426) → `{tCommon('yes')}`.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
