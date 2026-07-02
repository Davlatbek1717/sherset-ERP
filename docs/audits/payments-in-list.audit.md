# payments-in — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** capture `07-module/paymentin` (unified money-order list grid) + structural twin payments-out.
**Ground-truth (§4):** column labels grounded against the capture list-grid header row (`Время`/`Контрагент`/`Приход`/`Назначение платежа`), read from `<th>` content.

## A. Structural / column deltas

- **FIXED — counterparty column «Плательщик» → «Контрагент»** (`tFields('payer')` → `tFields('agent')`, page.tsx:241).
- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, :222).
- **FIXED — amount column «Сумма» → «Приход»** (`tFields('sum')` → `tFields('income')`, :261).
- **FIXED — purpose column «Назначение» → «Назначение платежа»** (`tFields('purpose')` → `tFields('payment_purpose')`, :274).
- **FIXED — hardcoded `header: 'Op.'`** (gate-blind ASCII literal, operations-count column) → `tFields('operations')` (new key «Опер.»/«Oper.», :308).
- **DEFER (BE gap)** — amount cell hardcodes `formatMoney(p.sumMinor, 'UZS', …)` because the payments row type has no `currency` field (documented `// Missing in backend (TODO): currency, …`, :187). NOT a float bug (uses formatMoney). Multi-currency display needs BE to return `currency` → Phase-2/BE-backlog.
- **DEFER (parity)** — the operations-count column is an app-extra (no such column in the moysklad list grid). Removal is a feature-judgment → deferred to Phase-2 review (header now i18n'd so no gate-blind leak remains).

## B. Interactive deltas

- Shared i18n-clean toolbar; bulk-delete + mass-edit + filters + row→detail wired. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ (+operations key) · web Vitest 1306 green (no regress).
