# payments-out — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** capture `07-module/paymentout` (unified money-order list grid) + structural twin payments-in.
**Ground-truth (§4):** column labels grounded against the capture list-grid header row; the outbound amount column is «Расход».

## A. Structural / column deltas

- **FIXED — counterparty column «Получатель» → «Контрагент»** (`tFields('payee')` → `tFields('agent')`, page.tsx:239).
- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, :220).
- **FIXED — amount column «Сумма» → «Расход»** (`tFields('sum')` → `tFields('expense')`, :259).
- **FIXED — purpose column «Назначение» → «Назначение платежа»** (`tFields('purpose')` → `tFields('payment_purpose')`, :272).
- **FIXED — hardcoded `header: 'Op.'`** → `tFields('operations')` (:306).
- **DEFER (BE gap)** — amount cell hardcodes `'UZS'` (payments row lacks `currency`; same as payments-in). Phase-2/BE-backlog.
- **DEFER (parity)** — operations-count column is an app-extra; removal deferred to Phase-2.

## B. Interactive deltas

- Shared i18n-clean toolbar; bulk-delete + mass-edit + filters + row→detail wired. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
