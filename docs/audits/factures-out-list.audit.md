# factures-out — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Ground-truth (§4):** capture `03-module/factureout` final list-grid `<th>` (read myself): `№·Время·Контрагент·Организация·Сумма·Отправлено·Напечатано·Комментарий` (the SIMPLEST — no store/payment/vat columns).

## A. Structural / column deltas

- **FIXED — counterparty «Покупатель» → «Контрагент»** (`tFields('customer')` → `tFields('agent')`, page.tsx:262; outgoing-facture counterparty is still the universal list term, NOT «Клиент»/«Покупатель»). §4.
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- Date column already «Время».
- **DEFER (uncertain) — default-visible extras vs capture** (vatSum + «Комментарий»/«Отправлено» presence/order): engine verdict UNCERTAIN → not applied; deferred for capture re-confirmation.

## B. Interactive deltas

- Toolbar/bulk via shared shell. No confirmed interactive deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
