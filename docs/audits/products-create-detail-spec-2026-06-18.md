# /products/new + /products/[id] — 1:1 build spec (live-grounded 2026-06-18)

> Item 6 of the /products 1:1 campaign. Grounded on online.moysklad.uz (farrux@climart),
> new-product form `#good/edit?`. **This is a GIANT rebuild, not a tweak** — honest scope below.

## moysklad new-product form = rich 2-COLUMN layout (ground truth)

**Top bar:** «Сохранить» (green) · «Закрыть» · right: «Печать ▾» · «…» more-menu.
**Title:** `* Наименование товара` (required) + full-width input.

**LEFT column — stacked collapsible cards:**
1. **Контент для разных торговых площадок** ⓘ — AI marketplace-content card + «Настроить». (niche; low priority / maybe skip)
2. **Изображения** — «➕ Изображение» upload (we have image infra: mainImageId + /images/:id/raw).
3. **Общие данные**: Описание (textarea) · Группа (combo) · Страна (combo + [+]) · Поставщик (combo + [+]) ·
   Артикул ⓘ · Код ⓘ (auto-filled) · Внешний код · Единица измерения (combo + ✏).
4. **Дополнительные поля** — account custom fields (доп.поля).
5. **Особенности учета**: ИКПУ (MXIK) · Код упаковки ТАСНИФ · Штрихкод ТАСНИФ · Код вида продукции ·
   Коды ЕГАИС · Маркировка (Подключить маркировку) · Штрихкоды товара (Штрихкод add-rows) ·
   Неснижаемый остаток · Фасовка.

**RIGHT column — tabbed:**
- **Цены** (active): Минимальная цена ⓘ · Закупочная цена ⓘ — each = input(0) + currency dropdown «сум (UZS)» + ✏.
  «Цены продажи» ⓘ: Розничная цена · Оптовая цена (same row shape). ☐ Запретить скидки при продаже в розницу.
  (Dynamic per-account price types → one row each, like the list columns.)
- **Модификации (N)** — variants grid.
- **Аналоги** — analog products.
- **Упаковка (N)** — packs (ProductPack: name/uom/multiplier/barcode/tasnifCode).
- **Остатки** — stock by warehouse (new product = empty).
- **История** — audit log.
- **Файлы (N)** — attachments.
- (**Дополнительные расходы** — additional-cost allocation, seen in DOM.)

## OUR current /products/new (568 lines) = FLAT single-column basic form
FormField list: name · code · article · external_code · folder · supplier · barcodes · description ·
buy/sale/min price · vat · uom · mxik · weight · volume · country · min_balance · payment_item.
No 2-column layout · no cards · no tabs · no image upload · no per-price currency · no Особенности-учета
section · no ЕГАИС/marking/код-вида · no custom-fields · no variants/packs/analogs tabs.

## Build plan (each a focused fresh session — DO NOT cram; live-ground each tab first)
1. **Shell + layout**: 2-column page; left card stack, right tab strip. Ideally SHARE one `<ProductForm>`
   between /new and /[id] (our [id] is 875 lines + already has Остатки/История/Файлы/Упаковка — reuse it,
   make /new render the same form empty). This is the biggest architectural step.
2. **Цены tab**: per-price-type rows + currency dropdown + ✏ (mirror the list's dynamic price-type columns
   + the «Изменить цены» currency work; BE salePrices already store by real PriceType id).
3. **Особенности учета**: add Код упаковки ТАСНИФ + Штрихкод ТАСНИФ (BE ready — ProductPack, item 5) ·
   ИКПУ · Фасовка · Неснижаемый остаток · (ЕГАИС/Маркировка/Код вида = UZ-fiscal, scope with user — may be
   out-of-market for .uz; ground whether the .uz account even shows them as active).
4. **Изображения** card (reuse detail-card upload). 5. **Дополнительные поля** (custom fields — detail card
   already wires доп.поля; reuse). 6. Tabs: Модификации/Аналоги/Упаковка/Остатки/История/Файлы (several
   already exist on /[id]).

## Honest scope
/products/new to 1:1 ≈ a multi-flagship rebuild (shell + 7 tabs + 4 left cards). The cleanest route is to
unify /new and /[id] on one shared rich form, then close gaps tab-by-tab. NOT a single-session job; ground
each tab on live moysklad before building (visual≠functional lesson). Reference shot: repo-root
`ms-product-new-live.png`.
