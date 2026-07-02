# /products/new — LIVE ground-truth (online.moysklad.uz, farrux@climart, 2026-06-19)

> Captured element-by-element from the REAL create-product form
> (`#good/edit?new&type=Good`, reached by clicking the green «Товар» button on the list).
> Screenshots (repo root): `ms-live-top.png` · `ms-live-mid.png` · `ms-live-low.png` · `ms-live-bottom.png`
> · `ms-live-product-new-full.png`. Per CLAUDE.md §4 the screenshots are the authoritative basis.
> This SUPERSEDES the partial spec in `products-create-detail-spec-2026-06-18.md` (which missed several cards).

## Toolbar (NEW product)
`Сохранить` (green) · `Закрыть`  |  right: `Печать ▾` · `…` (more). **No Изменить/Создать/Отправить** on create.
→ OUR shell currently shows O'zgartirish/Chop etish/Yuborish (DetailToolbar default) — **GAP: hide those on /new.**

## Title
`* Наименование товара` (red asterisk, label above) + full-width input, blue focus border. ✅ ours matches.

## LEFT column = 7 stacked collapsible cards (label-LEFT layout: label column + field right)

1. **Контент для разных торговых площадок** ⓘ — AI banner: dismissable info box + greyed «Настроить» button.
   → OUR shell: **MISSING.**
2. **Изображения** — «➕ Изображение» button only. → ours = placeholder button (real upload = backend infra exists).
3. **Общие данные**:
   - Описание [textarea]
   - Группа [combo ▾]
   - Страна [combo ▾] **[+]**
   - Поставщик [combo ▾] **[+]**
   - Артикул ⓘ [input]
   - Код ⓘ [input, auto-filled e.g. 07711]
   - Внешний код [input]
   - Единица измерения [combo «шт» ✕ ▾] **[✏]**
   - **Вес** [input, 0]
   - **Объём** [input, 0]
   - **НДС** [small input]
   → OUR shell: has Описание/Группа/Страна/Поставщик/Артикул/Код/Внешний код/Ед.изм, but **Вес/Объём are in our
     «Особенности учета» (WRONG — belong here)**, **НДС is in our Цены tab (WRONG — belongs here)**, Страна is a
     plain text input (no combo/[+]), Поставщик has no [+], Ед.изм is a plain input (no combo/✏). Layout = label-ABOVE
     (moysklad = label-LEFT).
4. **Неснижаемый остаток** ⓘ — own card: info banner + 3 radios:
   ● В сумме на всех складах [input «Не указан»] · ○ Одинаковый на всех складах · ○ Задать для каждого склада.
   → OUR shell: a single «minimumBalance» field inside «Особенности учета». **GAP: own card + 3 modes** (only the
     "sum across all stores" mode maps to our single `minimumBalanceMinor`; per-store modes need backend).
5. **Особенности учета**:
   - Фасовка [combo «Штучная» ▾]   *(no backend field)*
   - Тип учета [combo «Без специализированного учета» ▾]   *(no backend field)*
   - [🔍 Поиск по ТАСНИФ] button
   - ИКПУ (MXIK) [input]   → ours has this (mxikCode)
   - Код упаковки ТАСНИФ [input]   *(backend: ProductPack.tasnifCode exists for packs; product-level needs check)*
   - Штрихкод ТАСНИФ [input]   *(no product-level backend field)*
   - **Маркировка** (sub-heading): Тип продукции [combo «Не маркируется» ▾]   *(no backend field)*
   → OUR shell «Особенности учета» currently = ИКПУ + barcodes(WRONG) + minBalance(WRONG) + paymentItemType(NOT in
     moysklad here) + Вес/Объём(WRONG). Needs a full rework to match.
6. **Штрихкоды товара** ⓘ — own card: GTIN info banner + typed rows `[EAN13 ▾] [value input] [… menu]` + «➕ Штрихкод».
   → OUR shell: barcodes live inside «Особенности учета» as plain chips. **GAP: own card + per-row GTIN type**
     (backend stores `barcodes: string[]` — no type; typed rows need backend or a chosen encoding).
7. **Доступ** — own card: Сотрудник [combo ✕ ▾] · Отдел [combo ▾] · Общий доступ [☑ checkbox].
   → OUR shell: **MISSING.** (backend: product has ownerId/groupId/shared — present on the entity; create-accept needs check.)

**NO «Дополнительные поля» card** in this account (no custom attributes defined) → it only appears when the account
has product custom fields. OUR shell shows an always-empty «Дополнительные поля» card → **should be conditional**
(hide when none).

## RIGHT column = tab strip
`Цены` [active] · `Модификации (0)` · `Аналоги` · `Упаковка (0)` · `Остатки` · `История` · `Файлы (0)`. ✅ ours matches order.

### Цены tab (active)
- Минимальная цена ⓘ  `[input 0] [сум (UZS) ▾] [✏]`
- Закупочная цена ⓘ   `[input 0] [сум (UZS) ▾] [✏]`
- **Цены продажи** ⓘ
- Розничная цена `[input 0] [сум (UZS) ▾] [✏]`
- Оптовая цена  `[input 0] [сум (UZS) ▾] [✏]`
- ☐ Запретить скидки при продаже в розницу
- **No НДС here** (НДС is in Общие данные).
→ OUR shell: raw integer inputs + «(UZS)» suffix text, **no currency dropdown, no ✏**; labels label-above; **has an
  НДС field (move to Общие данные)**.

Other tabs (Модификации/Аналоги/Упаковка/Остатки/История/Файлы) on a brand-new product = empty/inert (no id yet).
Ours shows "available after save" placeholders — acceptable pre-create.

## GAP SUMMARY → path to 100% 1:1
**Frontend (no backend needed):** (a) move Вес/Объём/НДС into Общие данные; (b) label-LEFT layout in all cards;
(c) Цены rows → MoneyInput (human amount) + currency dropdown + ✏ pencil; (d) hide toolbar Изменить/Создать/Отправить
on /new; (e) split barcodes into their own «Штрихкоды товара» card; (f) «Неснижаемый остаток» own card (sum-mode
wired, other modes structural); (g) add «Контент» + «Доступ» cards (structural); (h) hide empty «Дополнительные поля».
**Backend needed for full functional 1:1:** Фасовка · Тип учета · Тип продукции (Маркировка) · per-row barcode GTIN
type · per-store min-balance modes · Доступ create-accept (ownerId/groupId/shared) · product-level ТАСНИФ codes ·
Поиск по ТАСНИФ lookup. These render as structural controls until backend columns/endpoints land.

**Honest scope:** literal 100% 1:1 = a left-column rebuild + ~8 new field-groups, several requiring NEW backend
columns/migrations → multi-session. Each increment: gate + browser-smoke + commit; Phase-1 structural until backend lands.

---

## API GROUNDING ADDENDUM (2026-06-20) — moysklad's REAL product data model

> Source: moysklad **REST API** (`https://api.moysklad.ru/api/remap/1.2/entity/product`), real climart account
> token (`.env.local` MOYSKLAD_REAL_API_TOKEN, **read-only**), 6924 products, 1000 scanned. This is the
> AUTHORITATIVE data model (structured JSON, no GWT-opacity, no guessing) — it supersedes assumptions about
> which create-form controls actually PERSIST. The web-UI capture above is the visual target; this addendum is
> what moysklad's data layer actually stores.

**Authoritative product field set** (every top-level key the API returns):
`accountId, archived, barcodes, buyPrice, code, discountProhibited, effectiveVat, effectiveVatEnabled,
externalCode, files, group, id, images, isSerialTrackable, meta, minPrice, name, owner, pathName,
paymentItemType, salePrices, shared, trackingType, uom, updated, useParentVat, variantsCount, vat, vatEnabled,
volume, weight` (+ `article`, `description`, `minimumBalance`, `country`, `things`, `attributes` appear when set;
moysklad OMITS null/zero fields, so absence ≠ "no such field").

### What this CHANGES about the backend plan (prevents speculative work)

1. **🔴 «Фасовка» and «Тип учета» are NOT in moysklad's product data model.** They do not appear as fields, and
   this account has NO custom attributes (`attributes: (none)`). → They are **moysklad.uz web-UI-only controls**
   (fiscal/localization affordances), not persisted product data. **DO NOT build speculative `packaging` /
   `accountingType` backend columns.** For 1:1 with what the user SEES, they'd be **structural UI controls**
   (their default «Штучная» / «Без специализированного учета» = no-op) — confirm the dropdown option lists +
   whether they persist anywhere via a **.uz web walkthrough** before building anything. Likely out-of-scope for
   data parity. (This is exactly the §4 bug-class the grounding discipline exists to prevent.)

2. **typed-barcode** = `barcodes: [{ <type>: "value" }]` — the barcode TYPE is the object **key**. climart uses
   **only `ean13`** (897/1000 products; 0 of any other type). Our model stores `barcodes: string[]` (UNTYPED) →
   for literal 1:1 (the «Штрихкоды товара» card with `[EAN13 ▾]` per-row type) the backend needs a **typed**
   structure (`{type,value}[]` or JSON). The form's full type dropdown (ean13/ean8/code128/gtin/upc/…) must be
   ground from the .uz UI; the DATA only ever uses ean13 here. NB: changing `string[]`→typed touches the list
   filter (`barcodes: { has }`) + search → its own careful flagship (regression risk).

3. **🔴 `paymentItemType` VALUE MISMATCH.** moysklad real value = **`GOOD`** (1000/1000). OUR enum =
   `COMMODITY | EXCISABLE_GOODS | COMPOUND_PAYMENT_ITEM | ANOTHER_PAYMENT_ITEM` — we use **`COMMODITY`** where
   moysklad uses **`GOOD`** (and `EXCISABLE_GOODS` vs moysklad `EXCISABLE_GOOD`). Our codes were invented, not
   grounded. → Align `PaymentItemTypeSchema` + the `payment_item_type` column to moysklad's actual codes (full
   list to confirm: GOOD, EXCISABLE_GOOD, COMPOUND_PAYMENT_ITEM, ANOTHER_PAYMENT_ITEM, …). Migration + data
   backfill of any existing rows.

4. **`trackingType` (= Маркировка / «Тип продукции»)** is a real moysklad field; climart = all `NOT_TRACKED`.
   Our enum's `NOT_TRACKED` matches; the rest of our list (SHOES/TOBACCO/…) should be re-aligned to moysklad's
   actual marking codes (full domain via the .uz UI / metadata) before the «Маркировка» combo claims 1:1.

5. **«Неснижаемый остаток» 3-mode (per-store) UI** has NO analog in moysklad's API (single scalar
   `minimumBalance`, which we already have as `minimumBalanceMinor`). The «Одинаковый/Задать для каждого склада»
   modes are again **.uz-web-UI-only** → confirm persistence via the .uz walkthrough before building a per-store
   table. Likely structural-only.

6. **«Доступ» (owner / group / shared)** all exist in moysklad's model (`owner`, `group`, `shared`) — matches
   ours. ✅ **ownerId create/edit-accept + cross-tenant FK guards SHIPPED 2026-06-20 (`284f29a7`).**

### LIVE-GROUNDED combo options (moysklad.uz create form, 2026-06-20, browser)

Opened each GWT combo on the real .uz create form (`.gwt-PopupPanel.selector-popup div[title]`):
- **Фасовка** (Особенности учета): `Штучная` · `Весовая` · `Разливная`  (default Штучная). UI-only (no API field).
- **Тип учета** (Особенности учета): `Без специализированного учета` · `Учет по серийным номерам`
  (default first). UI-only-ish — the serial-number mode ≈ our `isSerialTrackable`, but the .uz combo isn't
  an API field; treat as structural (wire to isSerialTrackable later if desired).
- **Тип продукции** (Маркировка sub-heading): `Не маркируется` · `Табачная продукция` ·
  `Вода и прохладительные напитки` · `Бытовая техника` · `Алкогольная продукция` · `Пивная продукция`
  (default Не маркируется). 🔴 These do NOT match our `TrackingTypeSchema` (SHOES/PERFUME/TIRES/DAIRY/
  LP_CLOTHES) — a DIFFERENT marking regime (.uz vs .ru) → wiring to `trackingType` would store wrong codes.
  Render structural with these exact labels; the trackingType-enum alignment is a backend follow-up.
- **Штрихкоды товара** GTIN banner: "Код GTIN … 8, 12, 13 или 14 цифр" → barcode types span EAN8(8)/UPC(12)/
  EAN13(13)/GTIN-14(14); the row type dropdown defaults `EAN13`. (Display-only until typed-barcode backend.)

→ All three combos render as **structural look-alikes** (grounded options, NOT persisted) for visual 1:1 —
matching reality (moysklad's own data layer doesn't store Фасовка/Тип учета, and our marking enum mismatches).

### Revised backend reality

The only DATA-MODEL-BACKED backend deltas left for /products/new 1:1 are: **typed-barcode structure** (its own
flagship — list/search regression risk) and **paymentItemType code alignment** (+ trackingType code alignment).
**Фасовка / Тип учета / per-store-min-balance are NOT moysklad data fields** → either structural UI-only (copy
the look) or out-of-scope; needs a **user decision** + a .uz web walkthrough of the exact dropdown option lists.
Method proven: the REST API grounds the data model cheaply and reliably — prefer it over the GWT browser for
anything the data layer stores; use the browser only for UI-only controls' option lists.
