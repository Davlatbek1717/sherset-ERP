# counterparties — LIST parity audit (Cohort L7 · CRM)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_e11d6251-8c3`, 25 agents, 15 confirmed / 3 refuted / 0 uncertain).
**Ground-truth (§4):** counterparties IS the cohort master-data reference (only L7 list with a real moysklad screenshot capture: `docs/moysklad-reference/counterparties/states/01-default.png`). The default columns (Наименование · Код · Создан · Телефон · E-mail · Сумма продаж) match moysklad; the 4 fixed headers below are OUR gear-only columns (not moysklad columns), so they are form-/standard-grounded, not capture-grounded.

## A. Structural / column labels + i18n — FIXED (medium, gate-blind leak)
**Bug-class:** the no-hardcoded gate (`i18n-no-hardcoded.test.ts`) only scans **document forms** (`<route>/new` + `/[id]`), NEVER the list `page.tsx`. So hardcoded labels on a list page are entirely gate-invisible.
- **4 hardcoded Cyrillic column headers** (object-property `header:` values, gear-only columns): `'Юр. название'` → `t('col_legal_title')` · `'Тип'` → `t('col_company_type')` · `'STIR / ИНН'` → `t('col_inn')` · `'Контакт'` → `t('col_contact')`. Under the **uz locale** these rendered Russian while every sibling header was Uzbek = ru/uz parity break.
  - **`STIR / ИНН` was mixed-script** (Latin «STIR» + Cyrillic «ИНН») shown to all locales. Corrected to per-locale **ru «ИНН» / uz «STIR»**, grounded on the counterparty form sibling (`counterparty_new.inn_label` = ru «ИНН» / uz «STIR»). Other 3 RU values unchanged (only keyed).
- **`typeLabel` map was module-level hardcoded Latin-Uzbek** (`'Yuridik shaxs'`, `'YaTT'`, `'IP'`, …), rendered in the «Тип контрагента» filter dropdown + companyType badge → RU users saw Uzbek type options. Moved into the component as `t('type_*')` (6 keys, ru+uz). RU grounded on the form (`company_type_*`) + standard legal forms; the legalUZ-vs-legal distinction preserved via «(UZ)»/«(RU)» suffixes. UZ values = the prior map values (already correct Uzbek).
- New keys (ru+uz): `pages.counterparties.col_legal_title/col_company_type/col_inn/col_contact` + `type_legalUZ/type_entrepreneurUZ/type_individualUZ/type_legal/type_entrepreneur/type_individual` (10).
- Money: salesAmount uses `formatMoney(..., 'UZS', { displayAs: 'none' })` (no suffix) — correct list convention; `salesAmount` is a single-currency base-currency roll-up, so the hardcoded `'UZS'` is by design (cellText keeps the suffix for CSV).

## B. Interactive / toolbar + filters — no delta (reference page)
- counterparties already has the full chrome set the rest of the cohort was aligned to: `onRefresh` · `selectionCount={bulk.selectedIds.size}` · `createPosition='start'` · import link · print dropdown · CSV export · `richEmpty` (heading+cta+helper). Inline filter panel (тип/CRM status/метки/владелец/состояние), click-to-sort, bulk delete/archive — all correct. **No interactive change needed.**

## DEFER (Phase-2 / out of scope)
- 🟢 `onHelp` → `/help/counterparties` is a dead route (noted L6) — feature, not parity.
- 🟢 Pagination liveness (cursor/total) not browser-verified — Phase-2.

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ (303 files, parity) · no-hardcoded ✓ · label-grounding ✓ (L7 header + type-label + col_inn value-lock) · web Vitest 1349 pass/1 skip (0 regress).
