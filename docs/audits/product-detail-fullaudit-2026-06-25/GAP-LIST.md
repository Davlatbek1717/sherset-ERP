# /products/[id] FULL pixel-audit — GAP-LIST (2026-06-25)

## ✅ DONE THIS SESSION (commits c173e0ed · 649285d5 · labels in 52fcea3a)
- **HEADER**: title band removed · «Изменения»+avatar→toolbar rightSlot · «Активен» badge gone · name BOLD/larger. ✅
- **TABS**: Модификации (N) count · Модификации empty BLANK · «+»→circle (Модификации/Аналоги) · Аналоги hint left · **ОСТАТКИ rebuilt** (borderless·blue headers·totals+pager·«Показать по модификациям») · ФАЙЛЫ hideTitle. ✅
- **ЦЕНЫ**: sale currency→«сум (UZS)» (alpha-vs-numeric bug fixed) · «?» help icons · muted heading · blue pencil ·divider. ✅
- **LEFT label suffixes**: «Вес (г)»→«Вес», «Объём (мл)»→«Объем», «НДС (%)»→«НДС» (swept into parallel 52fcea3a, lossless). ✅
- Live re-captured on :3225 vs moysklad — header/Остатки/Цены confirmed.

## ✅ DONE 2026-06-25 (session 2 — left cards) — commits 22217911 (cosmetics) · 480302fc (functional)
- **D Контент**: «?» title icon + dismissable blue info-banner (full moysklad text) + Настроить not-greyed. ✅
- **D Изображения**: drop-zone → «⊕ Изображение» button (create-staging + ImageGallery); dropped «Изображений нет». ✅
- **D Неснижаемый остаток**: «?» title icon + blue info-banner + «sum» input inline on the radio row («Не указан»). ✅
- **D Общие данные**: dropped «?» on Внешний код + Страна; Вес/Объём right-aligned; uom glyph → Icons.edit. ✅
- **D НДС**: number input → SELECT «без НДС»(default) · «0%» · «12%» (LIVE-grounded `ms-product-nds-country-ground.mjs`, options confirmed in `moysklad/05-nds-open.png`). Backed by existing `vat` string ('' / '0' / '12') — no schema change; submit maps ''→null, '0'→0, '12'→12; legacy rate kept as extra option. ✅
- **D Поставщик «+»**: trailing blue «+» (Icons.create) opens the supplier picker. ✅
- Gate tc0(my files)·biome0·i18n6·label-grounding 121/121. Live capture :3242 vs moysklad — all render 1:1.

## ✅ DONE 2026-06-25 (session 3 — tabs/files/toolbar/Страна) — `d0fcec3b`·`30c571e0`·`14acf569`
- **G TABS**: product card → DS `boxed` variant (equal-width grey pills, active brand-blue) — moysklad product-card style (≠ underline DocumentTabs PO/CO keep). ✅
- **E ФАЙЛЫ table** (SHARED attachments-section): thin BLUE rule under (blue) headers · ▲/▼ only on the sorted column · «+»→filled circle-plus. + **Файлы (N)** count on the tab (dedup query sharing AttachmentsSection's key). moysklad-consistent across every entity Файлы tab. ✅
- **F TOOLBAR** (SHARED DetailToolbar): Сохранить drop check icon (plain green) · Закрыть tertiary→secondary (bordered) — global, moysklad-correct on PO/CO too · product right cluster reordered «Изменения+avatar · Печать · «...»» via opt-in `rightSlotFirst` + `dots` edit-menu LAST (PO/CO menu order unchanged, verified live). ✅
- **D Страна «+»**: trailing blue «+» added (opens the country picker via new opt-in Combobox `open`/`onOpenChange`; our list is the full ISO ref so «+»=choose, not create). ✅
- Gate tc0 (web+design-system)·biome0·detail-toolbar 27/27·combobox+label-grounding 140/140. Live :3243 captures — tab pills, Файлы table, toolbar order, Страна/Поставщик «+» all 1:1.

## ⏳ REMAINING (next session)
- **D LOW cosmetic only**: labels muted-grey nuance, group spacing, Вес/Объём show «0» (data — our test product is null, not structural). The product-detail page is otherwise element-by-element 1:1 (header · name · 7 tab contents · 8 left cards · toolbar · Файлы).
- **QA Phase-2**: real-browser adversarial QA of the product editor (save round-trip, НДС persistence, image upload, pack/barcode edits, concurrent edit) — none of this session is browser-adversarial-verified.

> ⚠️ PRE-EXISTING (NOT this work): `button-conventions.test.tsx` has 2 reds — `customer-orders/new/page.tsx` (lost `variant="link"`, now `variant="secondary"`) + `purchase-orders/page.tsx` (lost `data-test-id="filter-state-multi-clear"`). Both pages committed clean by other sessions; the MIGRATED registry (lines 240, 271) is stale. UI not broken (FilterToggleButton/secondary still present) — needs a registry update by the CO/PO owner.

---


> Ground: `tools/capture/ms-product-detail-full-ground.mjs` → `moysklad/` (toolbar·header·name·
> left-cards·7 tabs). Ours: `scripts/cap-our-product-detail-2026-06-25.mjs` → `ours/`. Audit by a
> 9-agent Workflow (each part: moysklad capture vs ours + code). I verify each before fixing.
> Упаковка + История already pixel-1:1 (commits 824c140f·d94893e7·b104bd7c·2485320b) — excluded.

Status: ☐ todo · ✅ done · ⏸ deferred (shared-component / needs decision)

## A. page.tsx — HEADER + NAME (product-specific, SAFE)
- ☐ **HIGH** Remove the title band (DetailHeader: «<name> · Код» heading + «Активен» badge) — moysklad has NO title band (toolbar → name field directly). `page.tsx:265-314`
- ☐ **HIGH** Move «Изменения: <name> <datetime>» + avatar into the TOOLBAR rightSlot (mirror PO), drop the second-row author block + «Основной» role line. `page.tsx:286-313` → `DetailToolbar rightSlot`
- ☐ **HIGH** Name input = BOLD + larger (~16px) + taller title field (moysklad name is title-styled). `page.tsx:322-328` (override className) — VERIFY control-h first

## B. product-detail-widget.tsx — TABS (product-specific)
- ☐ **HIGH** Tab counts always shown: «Модификации (N)», «Файлы (N)» (like Упаковка). `:603-605, :618-620`
- ☐ **HIGH** Модификации empty: REMOVE «Нет модификаций» text (moysklad blank). `:656-659`
- ☐ **MED** «+»→blue circle-plus (Icons.createCircle) on Модификация / Аналог buttons. `:698, :776`
- ☐ **MED** Аналоги empty hint: LEFT-align (drop `text-center`) + less padding. `:714` (muted `:477`)
- ☐ **HIGH** ОСТАТКИ: borderless table (no grey-fill/box), headers non-uppercase + blue + thin rule, store cell plain (not bold), + pager «‹‹ ‹ N-M из T › ››», + «Показать по модификациям» link. `:985-1023`
- ☐ **HIGH** ФАЙЛЫ: pass `hideTitle` to AttachmentsSection (drop card wrapper + bold «Файлы» h2). `:1043`

## C. product-price-editor.tsx — ЦЕНЫ
- ☐ **HIGH** Empty Розничная/Оптовая currency → «сум (UZS)» not «—». `:168` (saleCurrencyOf default baseCurrency)
- ☐ **HIGH** Add blue «(?)» help icons after «Минимальная цена»·«Закупочная цена»·«Цены продажи». `:50,94,141`
- ☐ **MED** «Цены продажи» heading → muted grey (not bold black). `:141`
- ☐ **MED** Rate-edit «✏» → real blue pencil icon. `:81,125,178`
- ☐ **LOW** Divider above «Запретить скидки» checkbox. `:216`

## D. product-form-left-cards.tsx + i18n — LEFT CARDS (shared w/ create — both match moysklad)
- ☐ **MED** Labels: «Вес (г)»→«Вес», «Объём (мл)»→«Объем», «НДС (%)»→«НДС». `ru.json weight/volume/vat_label`
- ☐ **MED** Контент hint: grey box → blue info-banner (ⓘ + ✕), full moysklad text. `:116-117`
- ☐ **MED** Изображения empty: drop-zone → «⊕ Изображение» button. `:132-180`
- ☐ **MED** Страна / Поставщик: add trailing blue «+» quick-add. `:233-257, :259-297`
- ☐ **LOW** Контент title «?» help icon; «Настроить» not greyed; «Внешний код» drop «?»; labels muted-grey; group spacing.

## E. attachments-section.tsx — ФАЙЛЫ table
- ☐ **MED** «Наименование» sort arrows «▲▼» only when sorted (not at rest). `:291,352-354`
- ☐ **MED** Header: drop vertical cell separators + trailing empty actions box (single blue rule). `:312,341,360`
- ☐ **LOW** «Файл» add «+» → filled circle-plus. `:479`

## F. DetailToolbar (SHARED — verify PO/CO impact before global change)
- ⏸ **MED** Print menu BEFORE «...» (order). `detail-toolbar.tsx:261-385`
- ⏸ **MED** «Печать» add printer icon + dark (not orange) text. `:346-349`
- ⏸ **LOW** «Сохранить» drop leading check icon. `:214`
- ⏸ **LOW** «Закрыть» bordered (not tertiary borderless). `:217-225`
- NB: these are GLOBAL toolbar — moysklad's toolbar is consistent across editors, so fixing improves all pages, BUT PO/CO were certed → verify they don't regress, OR product-specific override.

## G. Tabs visual style (SHARED DS Tabs — DECISION)
- ⏸ moysklad product-card tabs = raised grey segmented pills, active = solid-blue fill. Ours = flat text + blue underline. Big shared change → decide (product-specific tab variant vs global).
