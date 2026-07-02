# factures-in — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Ground-truth (§4):** capture `02-module/facturein` final list-grid `<th>` (read myself): `№·Время·Контрагент·Организация·Сумма·Входящий номер·Входящая дата·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

- **FIXED — counterparty «Поставщик» → «Контрагент»** (`tFields('supplier')` → `tFields('agent')`, page.tsx:288). §4.
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- Date column already «Время»; facture-specific columns (incoming number/date) are confirmed_mirrors.
- **DEFER (uncertain) — default-visible column set vs capture** (vatSum present in ours, «Отправлено»/«Входящая дата» column presence/order): engine verdict UNCERTAIN → not applied; deferred for capture re-confirmation.

## B. Interactive deltas

- Toolbar/bulk via shared shell. No confirmed interactive deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
