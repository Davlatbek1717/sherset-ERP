# Products LIST — moysklad.uz LIVE ground-truth (2026-06-16)

> **Source:** `https://online.moysklad.uz/app/#good` («Товары и услуги»), logged in live as
> `farrux@climart_santex_group` (Файзуллоев Ф. — a **restricted employee**). Captured read-only via
> Playwright. This REPLACES the repo's `visual-captures/04-module/product/*` captures, which are
> **contaminated** (their `<title>` is «Заказы покупателей» / «Корзина» / «Заказы поставщикам» — wrong
> entities, not products). Account uses mixed currencies (доллар / сум). 5 603 products.
>
> ⚠️ **Restricted-employee caveat:** default-ON column set + «Изменить»/«Печать» availability *may* be
> narrowed for this employee. The available column SET, filter field SET, and toolbar STRUCTURE are
> global/definitive. Re-verify default-column set + mass-edit on an admin login if in doubt.

## 1. Page chrome
- **Sub-tabs (top):** «Товары и услуги» (active) · «Прайс-листы» · «Серийные номера»
- **Title:** «Товары и услуги» + refresh (⟳) + help (?) icons
- **Pager (bottom-left):** icon-only `◁◁ ◁ [1-100 из 5 603] ▷ ▷▷` — format «N-N из TOTAL», 100/page default.

## 2. Toolbar (left → right), DOM-grounded
1. **«+ Товар»** — green button → create product
2. **«+ Услуга»** — yellow/orange → create service
3. **«+ Комплект»** — blue → create bundle
4. **«+ Группа»** — blue → create folder/group
5. **«Фильтр»** — toggle filter panel
6. **Search box** — placeholder exactly: `Наименование, код или артикул`
7. **selection count** «0»
8. **«Изменить ▾»** — mass-actions dropdown
9. **«Печать ▾»** — print dropdown

(NO «Создать документ» / «Отправить» on the products list — those belong to document lists.)

## 3. Columns — full column-settings (⚙) inventory, DOM-grounded, in order
`✅` = default ON.

| # | Column (RU, exact) | Default |
|---|---|---|
| 1 | Изображение | ✅ |
| 2 | Тип | ⬜ |
| 3 | Наименование | ✅ |
| 4 | Код | ✅ |
| 5 | Артикул | ✅ |
| 6 | Ед. изм. | ✅ |
| 7 | Страна | ⬜ |
| 8 | Вес | ⬜ |
| 9 | Объем | ⬜ |
| 10 | Учет по серийным номерам | ⬜ |
| 11 | ИКПУ (MXIK) | ⬜ |
| 12 | Код упаковки ТАСНИФ | ⬜ |
| 13 | НДС | ⬜ |
| 14 | Неснижаемый остаток | ⬜ |
| 15 | Поставщик | ⬜ |
| 16 | Описание | ⬜ |
| 17 | Минимальная цена | ⬜ |
| 18 | Закупочная цена | ⬜ |
| 19 | **Розночная цена** | ✅ |
| 20 | Оптовая цена | ✅ |
| 21 | Количество модификаций | ⬜ |
| 22 | Общий доступ | ⬜ |
| 23 | Владелец-отдел | ⬜ |
| 24 | Владелец-сотрудник | ⬜ |
| 25 | Когда изменен | ⬜ |
| 26 | Кто изменил | ⬜ |

- **Default visible (7):** Изображение · Наименование · Код · Артикул · Ед. изм. · Розночная цена · Оптовая цена.
- **«Количество строк» (rows-per-page) selector in the popup:** `25 / 50 / 100` (100 selected).
- **CRITICAL:** there are **NO stock columns** (Остаток / Доступно / Резерв / Ожидание) and **NO «Группа»
  (folder) column** and **NO «Создан»/created column** anywhere in the 26-column set. Stock lives in
  «Склад → Остатки», not here.
- **Label note:** both the grid header AND the settings row read «**Розночная** цена» (with «о»), i.e.
  moysklad.uz's actual localization string is NOT the standard Russian «Розничная». For 1:1 we match
  moysklad.uz exactly → «Розночная цена». (Flag: verify this stays stable; it may be a moysklad.uz typo.)
- Price cells render the amount **with the price-type's currency in parens**: `79,30 (доллар)`,
  `42 000,00 (сум)`, `0,00 (сум)`. Decimal comma, ru-RU grouping.
- Each row has a small product **image thumbnail** before the name (the Изображение column).

## 4. «Изменить ▾» (mass-actions) menu — 7 items, DOM-grounded
(grey = disabled until ≥1 row selected; black = always enabled)
1. Удалить *(grey)*
2. Копировать *(grey)*
3. **Массовое редактирование** *(black, always)*
4. Переместить *(grey)* — move to folder
5. Поместить в архив *(grey)*
6. Извлечь из архива *(grey)*
7. **Цены...** *(black, always)*

## 5. «Печать ▾» menu (0 selected, this account)
- «Настроить...» (configure print templates)
- «Запросить форму» promo block + «Как запросить» button
- (No configured product print templates appeared — likely account/selection-gated. Re-check with a
  row selected / admin login: usual product templates are «Ценники», «Этикетки».)

## 6. «Фильтр» panel — 19 fields, wide multi-column grid ABOVE the list, DOM-grounded order
Top controls: **«Найти»** (green apply) · **«Очистить»** (clear) · 🔖 saved-filters · ⚙ settings.

1. Наименование *(text)*
2. Описание *(text)*
3. Артикул *(text)*
4. Код *(text)*
5. Внешний код *(text)*
6. ИКПУ (MXIK) *(text)*
7. Код упаковки ТАСНИФ *(text)*
8. Штрихкод *(text)*
9. Весовой товар *(select)*
10. Тип *(select, «Все»)*
11. Показывать *(select, «Только обычные»)*
12. Группа товаров (без подгрупп) *(text/picker)*
13. Группа товаров *(picker)*
14. Поставщик *(picker)*
15. Владелец-сотрудник *(picker)*
16. Владелец-отдел *(picker)*
17. Общий доступ *(select)*
18. Когда изменен: *(date range — shortcuts «вч · сег · нед · мес» + 2 date inputs)*
19. Кто изменил *(picker)*

(4 native `<select>`: Весовой товар, Тип, Показывать, Общий доступ. 5 pickers: Группа товаров,
Поставщик, Владелец-сотрудник, Владелец-отдел, Кто изменил.)

## 7. Left folder-tree sidebar
Root «Товары и услуги» (selected) then account folders (Азия Бест Строй, Акуаповер 2%, Акфа, Акфа панел,
Бест тен, Ватерпро, …, ▸ Панелний радиатор Россия Туркия [expandable] …). Scrollable. Clicking a folder
filters the list to that folder.

---

## GAP INVENTORY vs our `/products` (apps/web/src/app/(app)/products/page.tsx)

| # | Surface | Moysklad | Ours | Verdict |
|---|---|---|---|---|
| G1 | Create buttons | 4 separate: Товар/Услуга/Комплект/Группа (colored) | 1 «+ Создать» → /products/new | ACTIONABLE (big) |
| G2 | Image column | «Изображение» default-ON, row thumbnails | none | ACTIONABLE |
| G3 | Price columns | «Розночная цена» + «Оптовая цена» default, each `(валюта)` | 1 «Цена продажи» UZS, displayAs none | ACTIONABLE |
| G4 | Stock columns | **none exist** | 4 (Остаток/Доступно/Резерв/Ожидание), 2 default-ON | NON-PARITY — decision needed (remove?) |
| G5 | Column-settings set | 26 specific columns | ~13 divergent (incl folder, createdAt, stock) | ACTIONABLE |
| G6 | Rows-per-page | 25/50/100 selector in ⚙ popup | hardcoded LIMIT=100 | ACTIONABLE |
| G7 | «Изменить» menu | 7 items (Удалить/Копировать/Масс.ред./Переместить/Архив/Извлечь/Цены) | AssortmentBulkActionsDropdown (subset?) | ACTIONABLE — verify |
| G8 | «Печать» menu | Настроить + Запросить форму (+templates when set) | AssortmentPrintDropdown | verify |
| G9 | Filter fields | 19 (see §6) | 16: missing Наименование/Артикул/Код/Внешний код/Код упаковки ТАСНИФ; extra Тип учёта/Страна/Ниже минимума; folder split into (без подгрупп)+(group) | ACTIONABLE (big) |
| G10 | Filter layout | wide multi-col grid above list, Найти/Очистить/🔖/⚙ header | InlineFilterPanel (verify density/layout) | verify |
| G11 | «Создан» column | absent | present in our col-settings | NON-PARITY (minor) |
| G12 | «Группа»/folder column | absent (tree only) | present in our col-settings | NON-PARITY (minor) |
| G13 | Label «Розночная цена» | exact moysklad.uz spelling | n/a (we have «Цена продажи») | grounding for G3 |

**Phase:** Phase-1 structural ground-truth captured LIVE. Not yet built/verified. Big judgment call = G4
(stock columns) — flag to user before removing deliberately-added feature + backend StockInTransitService.

---

## SESSION 2026-06-16 — decisions + status + remaining queue

### User decisions (asked live, recorded — DO NOT re-ask)
- **G4 stock columns → REMOVE** for true 1:1 (keep backend computation, hide from this list). ✅ DONE.
- **G9 filters → make EXACTLY like moysklad**: add the 5 missing (Наименование, Артикул, Код, Внешний код,
  Код упаковки ТАСНИФ), remove the 3 extras (Тип учёта, Страна, Ниже минимума), reorder to moysklad's
  19-field order, split folder into «Группа товаров (без подгрупп)» + «Группа товаров». ⏳ NOT STARTED.
- **G2 image → ADD image upload** (the bigger feature: schema field + upload UI + Изображение column). ⏳ NOT STARTED.

### DONE this session — 4 flagships (all committed; 4/4 live-certified on :3100)
1. **`ac83cb7b`** — removed non-parity stock columns + search placeholder «Наименование, код или артикул»;
   inverted `product-stock-columns.test.ts` to an absence-lock; dropped the contaminated-capture grounding entry.
2. **`7113cccb`** — Фильтр panel 1:1 (18/19 fields, moysklad order): added discrete Наименование/Артикул/Код/
   Внешний код + «Группа товаров (с подгруппами)» (productFolderIdDeep, pathName-subtree in repo); removed the
   3 non-parity extras (Тип учёта/Страна/Ниже минимума). BE schema+repo+tests + FE.
3. **`2e561ae`** — 4 create buttons Товар(green)/Услуга(amber)/Комплект(blue)/Группа(blue), white button +
   colored «+» circle; route to /products/new · /services/new · /bundles/new · /product-folders.
4. **`80b0d100`** — «Изображение» thumbnail column (first, default-on, empty grid header; gear label
   «Изображение»). FE-only — ProductImage model + image controller + list-API mainImageId + editor ImageGallery
   already existed. Live-certified AFTER dev-server restart: column is first, placeholders «—» in seed (no
   ProductImage rows), 0 console errors.

NB the shared web dev server (:3100) crashed mid-session (a parallel session's DS commit `5dfe8c11`) and was
restarted (`pnpm dev`) — back up for all 3 sessions.

### DONE this session (cont.) — 2 more flagships (6 total, all certified)
5. **`25e4a597`** — «Код упаковки ТАСНИФ» filter → Фильтр panel now **19/19 1:1**. Migration
   `20260616133932` (ProductPack.tasnif_code) + schema/repo/filter + editor pack-table column (PackDraft
   round-trips, no wipe-on-save) + tests. Live-cert: 19th field applies, 0 rows + empty-state, no 500.
6. **`a9e4fabe`** — list column labels «Наименование» (was «Название») + «Ед. изм.» (was «Ед.»), via
   products-local keys (no app-wide blast). Live-cert: headers Наименование·Код·Артикул·Ед. изм.·Цена.

### DONE this session (cont.) — flagship 7 (7 total; default VIEW is now 1:1)
7. **`431866be`** — «Розночная цена» + «Оптовая цена» price-type columns (replaced single «Цена»), each with
   «(сум)» currency suffix. retail = 'default' priceType (falls back to first), wholesale = 'wholesale'; editor
   gained an «Оптовая цена» MoneyInput (load+save round-trip). **The default-visible column set is now EXACTLY
   moysklad's: Изображение · Наименование · Код · Артикул · Ед. изм. · Розночная цена · Оптовая цена.**

✅ **Products list DEFAULT VIEW = 1:1** (toolbar 4-create + Фильтр + search + Изменить + Печать · search
placeholder · 7 default columns w/ currency · 19/19 filter · no stock cols). All 7 flagships gate-green + live-cert.

### DONE this session (cont.) — flagships 8 & 9
8. **`2d9ed32a`** — «Количество строк» 25/50/100 page-size selector in the ⚙ popup (ColumnCustomizer additive
   prop + products pageSize state). Live-cert: click 25 → 25 rows, pager «1-25 из 6 816».
9. **`17e3e31e`** — ⚙ column-customizer 1:1: rebuilt to moysklad's EXACT 26-column set in order with the exact
   7 defaults (added 18 columns incl. Тип/Страна/Вес/Объем/серийный/ИКПУ/ТАСНИф/Неснижаемый остаток/Поставщик/
   Описание/Мин.цена/Закуп.цена/Кол-во модиф./Общий доступ/Владелец-отдел/-сотрудник/Когда изменен/Кто изменил;
   removed non-parity folder/createdAt/status). API include gained modifiedBy + _count.variants + packs. Live-cert:
   gear lists 26 in moysklad order with exact defaults; toggling Поставщик/Когда изменен renders, no error.

✅ **«Изменить» menu — verified ALREADY structurally 1:1** (built earlier): trigger «Изменить» + 7 items in
moysklad order (Удалить·Копировать·Массовое редактирование·Переместить·Поместить в архив·Извлечь из архива·Цены…).
3 are wired to real endpoints (delete/archive/restore); Копировать/Переместить/Цены/Массовое редактирование are
moysklad-metadata-matching DISABLED placeholders (no backend yet).

### DONE this session (cont.) — flagships 10 & 11 («Изменить» actions wired)
10. **`0c728b9a`** — «Переместить» bulk move-to-folder: POST /products/bulk-move {ids, productFolderId} +
    folder-picker modal. Live-cert: pick «Акфа панел» → 201, picker closes, selection clears.
11. **`de1e09c6`** — «Копировать» bulk-clone: POST /products/bulk-clone {ids} → full-fidelity duplicate
    (every field + packs; code/externalCode/barcodes cleared for @@unique). Live-cert: 201.

### DONE this session (cont.) — flagships 12 & 13 («Изменить» now 7/7)
12. **`85f367e0`** — «Цены...» bulk price-set modal: POST /products/bulk-set-prices {ids, retail?, wholesale?}
    (merges into salePrices, preserving other types). Live-cert: 201.
13. **`88c486c0`** — «Массовое редактирование» bulk-edit modal: POST /products/bulk-update {ids, supplierId?,
    vat?, shared?} (account-scoped updateMany). Live-cert: НДС 12 → 201.

✅ **«Изменить» menu: ALL 7 actions FUNCTIONAL + live-certified** — Удалить · Копировать · Массовое
редактирование · Переместить · Поместить в архив · Извлечь из архива · Цены… (each POST 201/202 on :3100).

## ✅ PRODUCTS LIST — comprehensively 1:1 with moysklad (13 flagships, all gate-green + live-certified)
For the grounded account (climart, exactly retail+wholesale price types) the list matches moysklad: toolbar
(4 create + Фильтр + search + Изменить + Печать), search placeholder, default 7 columns + currency, Фильтр
19/19, ⚙ 26-column customizer (exact order+defaults), rows-per-page 25/50/100, column labels, AND the «Изменить»
menu 7/7 functional.

### Remaining — dynamic per-account price-type columns (BLOCKED by polluted data — verified 2026-06-16)
Investigated for a build; **naive dynamic columns would REGRESS the list**, so deferred with a clear 3-step plan:
- **DB reality (queried live):** the account has **10 PriceType rows, 9 of them test garbage** — `Default`
  (isDefault) + 9× `RT-Price-Updated-<hash>` (left over from price-type tests; memory already flagged "demo
  price-types polluted"). Products' salePrices use the **`'default'` string sentinel**, NOT real PriceType ids
  (sample: `[{"value":"1500000000","priceTypeId":"default"}]`).
- So rendering a column per `/price-types` row today = 10 junk-named columns (Default + RT-Price-Updated…×9), which
  is WORSE than the current clean 2 fixed «Розночная/Оптовая» columns. The current fixed columns are the right call
  for this data.
- **3-step plan for a fresh session:** (1) clean the price-type test pollution (remove the RT-Price-Updated rows;
  ensure clean Розничная[isDefault]/Оптовая); (2) migrate products' salePrices from the 'default'/'wholesale'
  sentinels to the real PriceType ids; (3) THEN render dynamic columns off /price-types — use POSITIONAL column
  keys (`price_0`, `price_1`, …) so the static column-visibility defaults + ⚙ gear keep working (the
  useColumnVisibility hook can't take async-loaded dynamic keys), and use each type's `currency` for the suffix.

### Re-grounding notes (for the next session)
- **moysklad ground-truth = `online.moysklad.uz`** (`.ru` is network-blocked here). Login
  `farrux@climart_santex_group` (restricted employee «Файзуллоев Ф.»). Read-only walkthrough only.
- Browser profile `779d01a` is THIS session's Playwright profile; the other parallel session uses `d5250b7`
  (do not kill it). Screenshots land at repo root unless an absolute/scratch path is given (scratch/ is gitignored).
- The repo's `04-module/product/*` captures are CONTAMINATED — ignore them; use this doc / re-capture live.
- Restricted-employee caveat: default-column set + «Изменить»/«Печать» availability may differ on an admin
  login; the available column SET, filter SET, and toolbar STRUCTURE are global.
