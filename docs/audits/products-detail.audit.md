# products/[id] — detail page parity audit

- **Module:** `products` (Товар) detail/edit card (`apps/web/src/app/(app)/products/[id]/page.tsx`) + its mirror
  `apps/web/src/app/(app)/products/new/page.tsx`.
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit — **second CATALOG-card detail** (8th detail page overall; first was
  counterparties/[id]). Two-column card like the counterparty card: LEFT = editable product form (collapsible
  sections), RIGHT = a tabbed widget (Цены/Модификации/Анализ/Наличие/Остатки/История/Файлы).
- **Reference:** `docs/moysklad-reference/products/detail/` — live `--detail` capture (reused the `f0ffa01f`
  openFirstRow catalog-row patch). `edit-default.html` (full card DOM) + `edit-default.png` + `extra-menus.json`
  (toolbar/right-tabs/section facts). The generic dropdown/tab loop misses on a catalog card.
- **Method:** DOM/screenshot label extraction → full i18n migration → adversarial RU-label verification agent (5
  polish fixes) → gates. Locale = Russian (`ru.json`).

## Verdict

**DOMINANT FINDING: the entire products form was HARDCODED UZBEK** — both `products/[id]` and `products/new` (mirrors)
had zero i18n on the form (only `tCommon`/`tDetailHeader` chrome). In the RU UI the whole product form rendered in
Uzbek. Fixed by creating a `pages.product_new` namespace (**59 keys, ru+uz**) and wiring both pages: section titles,
field labels, hints, picker titles/placeholders, the barcode add-button + aria, the fiscal-type `<option>`s, the
header (new page), and the Zod validation messages (via a `makeProductFormSchema(t)` factory). RU labels were matched
to the moysklad product-card DOM; UZ values preserve the original Uzbek strings (uz UI unchanged). Structural deltas
(right CRM/prices widget, section regrouping, missing fields) are DEFERRED.

**LOCALIZATION (not a delta):** moysklad.uz product card has «Поиск по ТАСНИФ» (IKPU/MXIK lookup) + «ИКПУ (MXIK)»
field — UZ-specific. Our clone keeps the `mxikCode` (ИКПУ) field + a UZ `paymentItemType` («Признак предмета расчета»)
select. These are correct UZ localization.

## A. Structural

| # | Element | moysklad | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | **Whole form i18n** | fully Russian | **hardcoded Uzbek** (every section/field/hint/option/zod msg) | delta | high | **FIXED** — `pages.product_new` namespace (59 keys ru+uz); both `[id]` + `new` wired. The dominant fix. |
| S2 | Name field label | «Наименование товара» | «Nomi» (hardcoded) | delta | high | **FIXED** — `name_label` = «Наименование товара» (verified verbatim in DOM; adversarial polish). |
| S3 | Field labels (Код/Артикул/Внешний код/Группа/Поставщик/Штрихкоды/Описание) | RU | hardcoded Uzbek | delta | high | **FIXED** — all → `pages.product_new.*`, RU verified in DOM. |
| S4 | Price labels (Закупочная цена/Цена продажи/Минимальная цена) | RU | hardcoded Uzbek | delta | high | **FIXED** — `buy_price_label`/`sale_price_label`/`min_price_label`. |
| S5 | НДС / Единица измерения / Вес / Объем / Страна | RU | hardcoded Uzbek | delta | high | **FIXED** — `vat_label`/`uom_label`/`weight_label`/`volume_label`(«Объем», no ё)/`country_label`. |
| S6 | ИКПУ field label | «ИКПУ (MXIK)» (Latin MXIK) | «MXIK (IKPU)» (hardcoded) | delta | medium | **FIXED** — `mxik_label` = «ИКПУ (MXIK)» (verified Latin in DOM; adversarial polish). |
| S7 | Неснижаемый остаток / Признак предмета расчета | RU | hardcoded Uzbek | delta | high | **FIXED** — `min_balance_label`/`payment_item_label` (no-ё «расчета», internal consistency). |
| S8 | Discount checkbox label | «Запретить скидки при продаже в розницу» | «Chegirmalar taqiqlangan» (hardcoded) | delta | medium | **FIXED** — `discount_prohibited_label` full RU (verified verbatim; adversarial polish). |
| S9 | Section grouping | Общие данные / Особенности учёта / Маркировка / Штрихкоды товара / Доступ + right Цены widget | section_main/section_prices/section_physical/section_warehouse/section_images | delta | medium | **PARTIAL** — section RU titles i18n'd («Общие данные» verbatim; others are our groupings, natural RU). Full regroup DEFERRED. |
| S10 | RIGHT widget (Цены/Модификации/Анализ/Наличие/Остатки/История/Файлы) | right-column tabbed widget | prices in a LEFT form section; Attachments/audit-tabs stacked below | missing_in_ours | high | DEFERRED — big structural refactor (variants/analytics/stock tabs + backend). |
| S11 | «Тип товара» / «Особенности учёта» (serial/batch tracking) / «Маркировка» | present | not modeled as such (trackingType/partialDisposal exist in API, no editor) | missing_in_ours | medium | DEFERRED — needs tracking/marking editors. |
| S12 | «Доступ» (Сотрудник/Отдел/Общий доступ) | editable | owner read-only in header; no editor | missing_in_ours | medium | DEFERRED — same as counterparties S15 (owner/group/shared editors). |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Fiscal-type `<option>`s | — (UZ-specific) | hardcoded Uzbek options | delta | high | **FIXED** — `payment_item_{default,commodity,excisable,compound,another}` (RU + uz). |
| I2 | Barcode add button + remove aria | — | «Qo'shish» / «{bc} o'chirish» (hardcoded) | delta | medium | **FIXED** — `barcode_add` / `barcode_remove_aria` (parametrized). |
| I3 | Picker titles/placeholders/search (Группа, Поставщик) | RU | hardcoded Uzbek | delta | high | **FIXED** — `folder_*` / `supplier_*` keys. |
| I4 | New-page header (titlePrefix «Товар», state «Новый», title «Новый товар») | RU | hardcoded Uzbek | delta | high | **FIXED** — `title_prefix`/`state_new`/`title_new`. |
| I5 | Zod validation messages | RU | hardcoded Uzbek ('Faqat raqam', etc.) | delta | medium | **FIXED** — `makeProductFormSchema(t)` factory → `number_invalid`/`country_invalid`/`mxik_invalid`/`min_balance_invalid`/`name_required`. |
| I6 | Toolbar buttons (Печать ▾ · Изображение · Настроить · Поиск по ТАСНИФ · Штрихкод · Файл) | catalog-card toolbar | generic document `<DetailToolbar/>` (Изменить/Создать документ/Печать/Отправить); no Изображение/ТАСНИФ/Штрихкод/Файл quick-adds | delta | medium | DEFERRED — catalog-card toolbar variant + «Поиск по ТАСНИФ» (UZ IKPU lookup service). |
| I7 | «...» overflow | {Копировать, Поместить в архив, Удалить} (convention; not cleanly captured) | Копировать (disabled)/Удалить in «Изменить» dropdown; archive as header pill `tCommon('archive')`/`('restore')` → «Поместить в архив»/«Извлечь из архива» | delta | medium | **FIXED** (archive label; backlog #9, `c2aa5722`) — shared-key sweep unified `common.archive`/`common.restore` app-wide; products/[id]:388 uses the same key as counterparties I5. Copy-disabled + overflow-shape still deferred (catalog-card toolbar variant). |
| I8 | «· Код: <code>» title suffix | «Код» as a field | «Kod:» (hardcoded) | delta | low | **FIXED** — `code_prefix` = «Код». |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1–S8, I1–I5, I8 | Full i18n migration of the product form (59-key `pages.product_new` ru+uz) wired across BOTH `products/[id]` and `products/new` (mirrors); Zod messages via `makeProductFormSchema(t)` factory | both product pages + ru.json + uz.json |
| polish | 5 adversarial RU-label fixes verified against DOM: name «Наименование товара», mxik «ИКПУ (MXIK)», volume «Объем» (no ё), payment-item «расчета» (no ё), discount «…при продаже в розницу» | ru.json (+2 uz mirrors: name «Tovar nomi», discount full) |

**Gates:** web typecheck 0 · biome clean (2 pre-existing `useTemplate` warnings in unchanged helper fns) · web
**1214 pass / 1 skip** (no regression) · ru/uz key sets identical (59) · key-existence check (every `t()` key exists) ·
no hardcoded UI strings remain. Adversarial verification agent: structurally complete + correct wiring; 5 polish items
applied. **HALOL:** not browser-smoked (pure i18n/label/schema-factory change; no logic/picker-wiring change).

## Deferred (documented for follow-up)

- **S9–S10** right CRM/prices/variants widget + full section regrouping — large structural + backend.
- **S11** «Тип товара» / serial-batch tracking / marking editors.
- **S12** «Доступ» owner/department/shared-access editors (shared with counterparties S15).
- **I6** catalog-card toolbar variant + «Поиск по ТАСНИФ» (UZ IKPU/MXIK lookup service) + Изображение/Штрихкод/Файл quick-adds.
- ~~**I7** archive label «Поместить в архив» — shared `common.archive`/`restore` sweep (backlog #9).~~ ✅ **FIXED** `c2aa5722` (app-wide shared-key sweep; products/[id] uses `tCommon('archive')`).

## 2026-06-03i update (Cohort F) — 🔴 HIGH runtime save-method bug FIXED

- **P-PUT (HIGH, runtime, FIXED):** `products/[id]/page.tsx:279` saved via `api.put('/products/:id')`, but the NestJS
  controller declares only `@Patch(':id')` — there is **no `@Put(':id')`** (and no `@All`/method-override). NestJS uses
  method-specific routing, so **every product detail-page Save 404'd at runtime.** It was invisible to typecheck/lint/
  unit-tests, and `product-crud.spec.ts` (the only e2e) covers create→archive→restore→delete but **never the edit/Save
  path** — a textbook "browser-smoke YO'Q" runtime gap. The sibling bundles/services pages already (correctly) `api.patch`
  the same `/products/:id` endpoint, confirming PATCH is the contract. **Fix:** `api.put` → `api.patch` (one line).
  Found during the Cohort F ground-truth pass (the cohort engine treats products as the parity *reference*, so it did not
  audit products itself — this is exactly why the protocol re-verifies the reference). **Regression guard added:**
  `apps/web/src/__tests__/catalog-api-method.test.ts` source-scans products/services/bundles/variants for
  `api.put('/products|/variants/:id')` (must be PATCH to match `@Patch`). **HONEST: Phase-1 — a live edit+Save smoke is
  Phase-2 QA.**

