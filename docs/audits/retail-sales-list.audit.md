# retail/sales — LIST parity audit (Cohort L10 · Retail)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_8396e50e-8bc`, 17 agents). DEDUP cohort: retail/sales was DETAIL-audited in Cohort E (2026-06-03h) as a POS read-only view — this pass covers ONLY the **list axis**.
**Ground-truth (§4):** the clean PNG `08-module/retaildemand/screenshots/00-clean-default.png` shows the demo account's **empty-state promo** («Продавайте через приложение / Скачать Кассу») — so **NO grid-column parity** can be derived; toolbar = Фильтр + search «Номер или комментарий» + Изменить + Печать. Column set is **sibling-parity vs retail/sessions** only. The contaminated `dom/01-default.html` (`<title>Корзина</title>`) was ignored.

## A. Structural / columns + i18n — 1 fix

- **LOW — uz double-plural typo «Cheklarlar» → «Cheklar».** `Chek`+`-lar`+`-lar` stacks the Uzbek plural suffix twice (grammatically invalid). Fixed all 3 occurrences in `uz.json`: `subnav.retail.sales`, `pages.retail_sales.title`, `pages.retail_sales.empty_title` («Cheklarlar yo'q» → «Cheklar yo'q»). RU «Чеки»/«Чеков нет» were already correct. Gate-blind (pure-Latin token: Cyrillic-only no-hardcoded gate misses it; key-existence checks presence not value).
- **Search box is correct** (BE retail-sale supports `search` on name + agent; FE threads it) — placeholder «Номер чека или контрагент…» is honest. The «Чеки»/«Cheklar» rename from moysklad «Продажи» is a deliberate consistent redesign, not a delta.
- **State filter chips** all/posted/refunded/draft/cancelled + the extra state Badge column = accepted redesign (moysklad shows state via chips); header already `t('state')` = «Статус» (correctly keyed — the sessions sibling's `'Holat'` leak does NOT exist here).

## B. Interactive / money — 2 fixes (cohort money bug-class)

- **MED — money cell dropped the per-row «сум» suffix.** `sum` cell (`formatMoney(BigInt(row.sumMinor))`) appended the suffix on every row, unlike ~35 sibling lists. Switched to `formatMoney(row.sumMinor, row.session.cashDesk.currency, { displayAs: 'none' })`. The list BE include did NOT fetch the till currency — added `currency` to the retail-sale list `session.cashDesk` select (minimal additive BE change) so the cell uses the **real** currency instead of hard-coding 'UZS' (money-integrity: a till may not be UZS).
- **LOW — CSV cellText exported the raw minor-unit string** (`cellText: (r) => r.sumMinor`, e.g. "6400000"). Now `formatMoney(r.sumMinor, r.session.cashDesk.currency)` (formatted, correct currency, with suffix for CSV readability per the demands/customer-orders cellText convention).

## DEFER / Phase-2
- No grid-column ground-truth (demo empty-promo) → column-set stays sibling-parity vs retail/sessions; revisit if a seeded «Продажи» list capture becomes available.
- Pagination liveness + search round-trip = Phase-2 browser-QA.

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 92 · web Vitest 1360 pass/1 skip (0 regress) · api Vitest 2603 pass/2 skip (0 regress).
