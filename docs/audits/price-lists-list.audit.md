# price-lists — LIST parity audit (Cohort L8 · E-commerce/pricing)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_bcfd35ce-83f`). Premise-phase references/bias/extra-checks; analyze/verify degraded → ground-truthed by Opus directly.
**Ground-truth (§4):** the `04-module/pricelist/dom/00-clean-default.html` capture has `<title>Прайс-листы` but its **body is a customer-order form** (Контрагент / План. дата отгрузки / Адрес доставки) — **CONTAMINATED**, not a price-list grid. → NO capture-grounding; price-lists is THIS cohort's mature doc-style reference (mirrors the Move gold-standard). No label churn.

## A. Structural / columns + money/date — CLEAN (mature reference)
- Columns name(sortable→detail)/moment(`formatDate`)/organization(sortable)/«Тип цены»(`default_price_type`)/products-count(`Object.keys(pricesJson).length`)/state(`tStates` badge) — all i18n-routed (`tFields`/`t`/`tPO`/`tStates`/`tFilters`); no hardcoded leak. Money/date helpers already shared (`formatDate`; no Number()/100).
- Confirmed-correct (refuted as deltas): NO counterparty/store/project/sum-aggregate column — PriceList is a **snapshot publication** (prices live in a per-product `pricesJson` map); these absences are correct and documented in-file. «Тип цены»/priceTypeId is PriceList-specific, not an extra column.

## B. Interactive / filter + bulk + toolbar chrome — CLEAN
- Full Move-pattern InlineFilterPanel (Период/Организация/Тип цены/Валюта/Статус/Проведено/Напечатано/Отправлено/Владелец-сотрудник/Владелец-отдел/Когда изменен) + SavedFiltersPills + bulk FSM + bulk-print + mass-edit + cursor pagination + `onRefresh` + `createPosition="start"` — all wired (`useBulkDocumentActions('price-lists', …, { hasFSM:true, hasBulkPrint:true, onMassEditClick })`).

## DEFER / Phase-2
- Bulk FSM / bulk-print / mass-edit endpoint liveness not browser-verified (the FE wiring is present and shared with the other doc lists). Pagination liveness not browser-verified. `LIMIT=100` kept.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1352 pass/1 skip (0 regress). No code change on this page (audit-only).
