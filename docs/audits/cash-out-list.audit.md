# cash-out — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** capture `07-module/cashout` + structural twin cash-in; the shared unified money-order list grid grounds all column labels.
**Ground-truth (§4):** same list-grid header row as cash-in, verified from the capture `<th>` content. The disbursement amount column is «Расход».

## A. Structural / column deltas

- **FIXED — counterparty column «Получатель» → «Контрагент»** (`tFields('payee')` → `tFields('agent')`, page.tsx:246). List grid uses the universal «Контрагент» (direction-name is detail-only).
- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, :227).
- **FIXED — amount column «Сумма» → «Расход»** (`tFields('sum')` → `tFields('expense')`, :273; new key `fields.expense`=«Расход»/«Chiqim»).
- **FIXED — purpose column «Назначение» → «Назначение платежа»** (`tFields('purpose')` → `tFields('payment_purpose')`, :286).

## B. Interactive deltas

- Shared `useDocEditMenuItems`/`useMoneyPrintMenuItems` toolbar (i18n-clean) — no change. Bulk-delete + mass-edit + filters + row→detail wired. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
