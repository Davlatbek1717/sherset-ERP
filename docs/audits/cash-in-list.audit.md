# cash-in — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_91bf549d-576`, 30 confirmed / 4 refuted / 0 uncertain).
**Reference:** capture `07-module/cashin/dom-default.html` (`<title>Приходные ордеры</title>` — real list grid) + twin cash-out.
**Ground-truth (§4):** the list-grid header row in the capture is `Тип документа · № · Время · Организация · Счет организации · Контрагент · Счёт контрагента · Приход · Расход · Назначение платежа · Отправлено · Напечатано · Комментарий` — verified by reading the `<th>` element content, NOT grep-count.

## A. Structural / column deltas

- **FIXED — counterparty column header «Плательщик» → «Контрагент»** (`tFields('payer')` → `tFields('agent')`, page.tsx:243). Capture grounds the list-grid column as «Контрагент» (the universal term; direction-names «Плательщик»/«Получатель» are detail-form-only). The premise flagged this as a possible false-delta; the capture resolved it.
- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, :224). Capture grid header = «Время».
- **FIXED — amount column «Сумма» → «Приход»** (`tFields('sum')` → `tFields('income')`, :270; new key `fields.income`=«Приход»/«Kirim»). The cash-receipt list column is «Приход».
- **FIXED — purpose column «Назначение» → «Назначение платежа»** (`tFields('purpose')` → `tFields('payment_purpose')`, :283).

## B. Interactive deltas

- Edit/print toolbar already routed through the shared i18n-clean `useDocEditMenuItems`/`useMoneyPrintMenuItems` (reference page) — no change.
- Bulk-delete + mass-edit + saved-filters + status filter + row→detail wired. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n-key-existence ru+uz ✓ (+2 keys income/expense) · web Vitest 1306 green (no regress).
