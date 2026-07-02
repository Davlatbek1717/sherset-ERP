# customer-orders — LIST parity audit (Cohort L2)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_0152de61-253`, 25 confirmed / 8 refuted / 0 uncertain).
**Reference:** capture `03-module/customerorder/dom-default.html` — anchor, grounded vs its OWN final list-grid `<th>` row.
**Ground-truth (§4):** the capture's final list-grid header (read myself, the repeated tail block, not the embedded docEditor forms) is `№·Время·Контрагент·Организация·Сумма·Выставлено счетов·Оплачено·Отгружено·Зарезервировано·Статус·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

- **FIXED — counterparty column «Покупатель» → «Контрагент»** (`tFields('customer')` → `tFields('agent')`, page.tsx:349). Capture grid header = «Контрагент» (universal; «Покупатель» is the doc/menu name, not the list column). §4.
- **FIXED — invoiced column «Выставлено» → «Выставлено счетов»** (ru.json `fields.invoiced_sum` value; capture `<th>` = «Выставлено счетов»). Also corrects the show-totals-link row label (same meaning).
- **FIXED — currency column removed from default-visible** (removed `'currency'` from `useColumnVisibility` defaults; column DEFINITION kept → still available via the column customizer). The capture grid has no «Валюта» column.
- Date column already `tFields('time')`=«Время» (matches capture) — confirmed_mirror, no change.

## B. Interactive deltas

- Toolbar (Фильтр·Изменить·Статус·Создать·Печать·Решения·Столбцы) + bulk status via `extraActions` already wired. No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
