# /products 1:1 gap inventory — 2026-06-17 (multi-agent audit)

> Phase-1 STRUCTURAL audit (code + screenshot grounded vs live moysklad). **browser-smoke: NONE** for most items.
> Source: workflow `products-1to1-gap-audit` (8 surface agents + completeness critic). 54 gaps (16 high — but 1 is a
> stale false-positive, see below). NOT «done» / NOT «1:1» — this is the honest remaining-work list.

## PROGRESS — 2026-06-17 session (fixing «ketma ketlikda barchasini»)

- ✅ **Item 1 — «Изменить цены»** (`d6ad2eb6`): default mode «На основании другой цены», greyed «Выберите тип
  цены» placeholders, plural «Выбран N товар» pill, blue «Обновленные цены», 3 circled «?» help marks. Browser-cert.
- ✅ **Item 2 — Серийные номера** (`3c7203ff`): dd.MM.yyyy DatePicker for «На дату»; 5 entity fields → real
  CatalogPicker autocompletes (+ «По умолчанию содержит» tooltips). Browser-cert.
- ✅ **Item 3 — grid: re-grounded as ALREADY 1:1** (no code change). Live-clicked the «Оптовая цена ⚙» →
  it opens the standard **26-column customizer + rows 25/50/100**, NOT a price-switcher → the [high] «⚙▾ switcher»
  gap was a MISINTERPRETATION (we have this gear). The 26-column list order/defaults **match our `columns[]` 1:1**
  (verified). «Blue row-links» was also a FALSE gap — names are DARK in moysklad too, ours match. (image/Оптовая
  «—» = data, band 6.)
- ✅ **Item 4 — filter «Когда изменен»** (`7d2eb909`): вч·сег·нед·мес shortcuts now INLINE with the label
  (PeriodShortcuts via inlineSuffix + PeriodInputs body). Browser-cert. [deferred: bookmark/gear = saved-filters
  FEATURE; selective «●» dots = low/uncertain.]
- ✅ **Item 5 — «Массовое редактирование» full-page rebuild** (`9c60e160` BE + `1ee742d2` FE). Drawer → moysklad
  full-page #bulkEdit overlay (below the 42px nav, «Закрыть» top-left), ⓘ title, dismissable info box + «Читать
  инструкцию» link, vertical wizard, «Выбран N товар» plural pill, red section label. Да/Нет **radios** + «Да»
  defaults (Архивный/Запретить скидки/Общий доступ); Страна curated-ISO2 combo + Единица /uoms combo (+ «+»
  affordance); Вес/Объём «0»; Неснижаемый остаток **3-radio** (В сумме wired, per-warehouse modes disabled);
  required «*» (Фасовка/Маркированная/Владелец-отдел); «Как изменить цены?» link; 2-col rows + auto-tick on touch.
  **NEW BE**: «Код упаковки ТАСНИФ» → ProductPack.tasnifCode, «Штрихкод ТАСНИФ» → ProductPack.barcode via a
  tenant-scoped position-0 updateMany inside the bulk-update transaction (+4 schema tests, no migration).
  **Browser-certified** on :3100: render 1:1 vs ms-massovoe-redakt/-markirovka, auto-enable→Далее→confirm→Применить
  → POST {ids, tasnifCode} 201, 0 console errors. (Per-warehouse min-balance modes remain disabled — need a
  stock-level model; honest «скоро».)
- ⏳ **Item 6 — big surfaces** — NOT started. Product DETAIL card (`/products/[id]`, multi-tab), CREATE editor
  (`/products/new`), «Прайс-листы» tab, and Импорт/Экспорт (absent feature). Each is a separate flagship — needs
  a live element-by-element moysklad walkthrough first (per the «visual≠functional parity» lesson).
  - Current state (surveyed 2026-06-18): detail card `[id]/page.tsx` **875 lines** (multi-tab, B5-grounded
    Остатки/История/Файлы widget + Упаковка), create `new/page.tsx` **568 lines**, `price-lists/page.tsx`
    **712 lines** (+ `[id]` + `new`). All three EXIST but are un-audited for 1:1. Импорт/Экспорт = genuinely absent.
  - **Item-6 execution order (each = own focused session, live-moysklad ground FIRST):**
    1. `/products/new` create editor (smallest; field-set + sections + «Тип» selector + validation vs moysklad).
    2. `/products/[id]` detail card (tab-by-tab: Основное/Цены/Себестоимость/Остатки/Документы/Производство/Файлы/Модификации).
    3. `/price-lists` (list + `[id]` + `new` — never audited).
    4. Импорт/Экспорт (Excel/CSV/1С/ЭДО) — whole feature; scope with the user (adversarial-QA: axios-timeout,
       mapping, race, big-file per global CLAUDE.md before building).

**Net after the 2026-06-18 session:** item 1 residuals (account currencies + «0,00» placeholders, `d601bca7`) and
**item 5 fully done + browser-certified** (`9c60e160` + `1ee742d2`) — the LIST surface + its «Изменить цены» /
serial filter / grid / «Когда изменен» / «Массовое редактирование» are now materially 1:1. **Item 6 remains** (the
4 big surfaces above) — large, needs live-moysklad grounding, honestly a fresh-session-per-surface effort (NOT
done here to avoid rushing 4 flagships in one large context = the 34-bug risk). /products is **NOT yet fully 1:1**.

## ⚠️ One false-positive to discard
- list-chrome flagged «Серийные номера» 3rd nav tab as MISSING [high] — **WRONG**: the audit read a screenshot taken
  BEFORE band-1 + `page.tsx` (which doesn't render the nav). The tab IS present (`layout.tsx:341-345`, browser-verified
  this session). Critic caught this. → 15 real high gaps, not 16.

## HIGH — real, current (15)

### Grid columns
1. «Оптовая цена» header missing the in-header **⚙▾ price-type-column switcher** moysklad shows.

### «Изменить цены» drawer
2. Wrong **default mode**: moysklad defaults to «На основании другой цены»; we default to «Задать конкретную».
3. Target price-type select should show greyed placeholder **«Выберите тип цены»** (unselected), we pre-select the account default.
4. Base (other-price) select — same placeholder gap.

### «Массовое редактирование» (biggest cluster)
5. **STRUCTURAL**: ours is a right-side Drawer wizard; moysklad is a **full page** (#bulkEdit) with «Закрыть» top.
6. Missing **info box** + «Читать инструкцию» link.
7. Missing field **«Код упаковки ТАСНИФ»** (packaging-level / ProductPack).
8. Missing field **«Штрихкод ТАСНИФ»** (packaging-level).
9. «Архивный» wrong control (select vs **Да/Нет radios**) + wrong default (Нет vs **Да**).
10. «Запретить скидки…» wrong control + default (same as Архивный).
11. «Неснижаемый остаток» missing **3-radio** structure (В сумме / Одинаковый / Задать для каждого + Добавить склад).
12. «Страна» should be combo **+ [+]**, we use plain text input.
13. «Единица измерения» should be combo **+ [+]**, we use plain text input.

### Серийные номера page
14. Entity filters (Товар/Склад/Контрагент/Поставщик) are plain text inputs, not **autocomplete pickers**.
15. «На дату» uses native US `mm/dd/yyyy` input, not **dd.MM.yyyy DatePicker**.

## MEDIUM (~18)
- Filter: «Когда изменен» вч·сег·нед·мес shortcuts stacked below vs **inline** with label.
- Filter: 🔖 bookmark + ⚙ gear icons **non-functional** (disabled «Tez orada»); moysklad's are active (save/settings).
- Grid: Наименование row-links not **blue at rest** (only on hover).
- Grid: image column renders «—» (data — no seeded images); Оптовая цена «—» (data — no 2nd price seeded).
- Grid: 26-column ⚙ customizer **exact order/default-set** unverified vs moysklad.
- Изменить цены: missing «?» help markers (×2: cost radio, rounding); pill «Выбран 1 товар» vs ours «Выбрано товаров: N»; «Обновленные цены» should be a **blue link**.
- Массовое ред: «Группа»/«Поставщик» combo+[+] mismatches; «Вес»/«Объём» missing default `0`; «Общий доступ» select vs radios; «Маркированная» options guessed (GWT-blocked); confirm-step layout unverified; missing «Как изменить цены?» link.
- Серийные: empty-state illustration vs moysklad's «1-1 из 0» footer; pagination footer format «{count} записей» vs «1-1 из 0».

## ✅ LIST PAGE COMPLETED to achievable 1:1 (2026-06-18)
After live-grounding, the two remaining LIST gaps are closed + browser-certified:
- **Saved filters (🔖)** wired into the products list (`7e9af02a`) — serialises the flat
  product filter to/from a query string (picker `__label` companions) and feeds the existing
  `SavedFiltersPills` via `InlineFilterPanel.pills`. Live-cert: save→POST 201→pill→apply→DELETE 200, 0 console err.
- **«●» filter-label bullets removed** (`b66b8fa9`) — moysklad has NONE (DOM-verified across
  ::before/::after/bg/list-marker on 6 labels); products-only `expandable={false}` on all 19 fields.
- **Net: the `/products` LIST route is now functionally + structurally 1:1** with moysklad (items 1-5 +
  saved-filters + dots). The ONLY residual is moysklad's **proprietary icon sprites** — literally not
  pixel-copyable (honest limit; ours are close lucide equivalents). Items 1-5 detail above.
- **STILL REMAINING for «/products family 100%» = ITEM 6** (separate ROUTES, each its own flagship needing
  a live-moysklad walkthrough): `/products/new` · `/products/[id]` · `/price-lists` · Импорт/Экспорт.

## LIVE-GROUNDED on online.moysklad.uz (2026-06-18 session, farrux@climart)
Logged into real moysklad, opened Товары и услуги + its Фильтр. Findings (DOM-grounded, §4-honest):
- **«●» filter-label dots = FALSE GAP.** No products-filter label carries a «●» in moysklad's DOM (no leading
  char, no `::before` content) — verified across all 23 labels. The marks read off the screenshot were a
  misread (e.g. «Внешний код» is an `<a class="external-code-link">`, not a bulleted label). **Our shared
  `InlineFilterPanel` DOES prepend a «●»** (line ~210, `expandable` default, with tests). That is an app-wide
  divergence from moysklad — BUT removing it touches every filter page (incl. the parallel session's
  purchase-orders) and an existing guard test, and may match a DIFFERENT moysklad filter (document «Период»)
  the prefix was originally grounded on. **DEFER to a focused cross-cutting decision** (check a document filter
  on live moysklad first; coordinate — do not flip the shared default unilaterally mid-parallel-session).
- **Saved-filters (🔖 bookmark + ⚙ gear) = REAL GAP, confirmed.** Both icons sit in moysklad's filter action row
  (after «Найти»/«Очистить») and are active. Ours are disabled («Tez orada»). The exact UX (save-as-named dialog,
  where saved filters surface, the ⚙ settings) is **GWT-opaque to DOM probing** — needs an interactive live
  walkthrough (likely operator-assisted) before building. This is the single biggest remaining LIST gap and is a
  genuine BE (persist named filters per user/entity) + FE (save dialog · saved-filter list · apply · settings)
  **flagship** — not a residual. Reference shot: repo-root `ms-products-list-live.png`.
- Structure otherwise MATCHES: create buttons (Товар/Услуга/Комплект/Группа), 19 filter fields, Оптовая ⚙▾
  column gear, row layout — all 1:1 with ours.

## LOW (~13)
- Create-button «+» glyph (CSS text vs SVG sprite); selective filter-label «●» dots (we apply uniformly); «Тип» plural re-verify (§4 history); bookmark/gear shape (round vs square); required-asterisks on Фасовка/Маркированная/Владелец-отдел; serial filter «По умолчанию содержит» tooltips; serial filter default-expanded; etc.

## 🔴 BIG un-audited surfaces (the real elephant — critic)
- **Product DETAIL card** `/products/[id]` (875 lines) — multi-tab (Основное/Цены/Себестоимость/Остатки/Документы/Производство/Файлы/Модификации). Essentially **un-audited** for 1:1.
- **Product CREATE editor** `/products/new` (568 lines) — field set / sections / validation / «Тип» selector un-audited.
- **«Прайс-листы»** sibling tab — never audited.
- **Импорт / Экспорт** (Excel / CSV / 1С / ЭДО) — moysklad has it prominently; **we have NONE** (whole feature absent).
- Row-selection runtime (select-all-across-pages semantics, bulk-bar, confirm-dialog wording); column resize/sort parity; folder-tree deep behaviour (context-menu CRUD, counts); right-click context menu; barcode scan; rich empty-state onboarding; detail-card label print.

## Behavioural gaps needing LIVE browser (not provable from code/screenshot)
- «Тип» dropdown exact options (§4-risky); filter apply semantics (debounce-auto vs click-Найти); selective «●» dots; image/price «—» render path on a seeded account; 26-col gear popover exact order; row-link blue; massovoe combo data sources + «Маркированная» live options; serial pickers/date widget.

## Honest completeness estimate
- **LIST surface**: roughly structurally complete (Phase-1) with ~50 open deltas (15 high) + many behaviours unverified in a browser.
- **DETAIL card / CREATE editor / Прайс-листы / Import-Export**: essentially **un-audited or absent**.
- **Overall /products is NOT near 1:1.** Honest label: «list mostly structurally audited; card/editor/import-export unaudited or missing; runtime unverified.» Per MEMORY, moysklad icons are proprietary sprites → literal pixel-100% is not achievable for icon chrome.
