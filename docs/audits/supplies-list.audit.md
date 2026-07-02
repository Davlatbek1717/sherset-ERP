# supplies — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_5450f535-0b7`). **Ground-truth (§4):** capture `02-module/supply` final list-grid `<th>` row (read myself, tail block): `№·Время·На склад·Контрагент·Организация·Сумма·Оплачено·Входящая дата·Входящий номер·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

**Whole-page hardcoded-language leak (gate-blind) — FIXED.** The page hardcoded EVERY column header + chrome as Uzbek-Latin / raw Cyrillic literals; all routed through i18n:
- counterparty `"Ta'minlovchi"` → `tFields('agent')` «Контрагент» (§4 universal); date `'Sana'` → `tFields('time')` «Время»; store `'Sklad'` → `tFields('store_to')` «На склад» (goods INTO stock); incoming-number `'Фактура №'` → `tFields('incoming_number')`; `'Pos.'` → `tFields('positions_count')`; sum/org/paid/incoming-date/published/printed/description/state → existing `tFields` keys.
- ListView chrome (title="Приёмки", createLabel, searchPlaceholder, empty) → `pages.supplies` keys (+15 filter/mass-edit keys added ru+uz in parity).
- **«Статус» (state) column added to default-visible** (capture grid includes it); **«Валюта» removed from default-visible** (capture has none; definition kept).
- **SavedFiltersPills wired** into the filter panel (mirrors purchase-orders).

## B. Interactive deltas

- `STATE_META` hardcoded Cyrillic labels → `states.supply` i18n (StateSelect given a `labels` prop). State badge + filter now localized.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz parity ✓ · web Vitest 1306 green (no regress).
