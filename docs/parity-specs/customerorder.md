# /customer-orders parity spec

**Manba**: `docs/moysklad-reference/visual-captures/03-module/customerorder/`
**Tahriri**: 2026-04-30 sessiya 2
**Holat**: 🚧 Round 1 — list view spec yozildi.

> RULE 0 amal qiladi — har string capture'dan kelishi shart.

---

## 1. List view (`dom/19-default.html`, `capture.json`, **foydalanuvchi screenshot 2026-04-30 sessiya 2 — REAL DATA bilan, 27,295 ta zakaz**)

### Yangi deltalar (foydalanuvchi screenshot 2026-04-30 sessiya 2)

Bu screenshot — `online.moysklad.ru/app/#customerorder` real account
(`farrux@climart_santex_group`, 27,295 ta zakaz) — to'liq production
ko'rinishini ko'rsatadi. Avvalgi spec faqat capture.json + DOM'dan
edi; endi real UI elementlari ham aniqlandi:

1. **Sub-nav 10-chi tab**: `Юнит-экономика` _(source: screenshot
   bottom row, alohida sub-nav strip)_ — bizda yo'q.
2. **Saved filter chips**: 2 ta pill'lar sub-nav tagida —
   `ипадром` + `Фаррухбек касса` _(source: screenshot)_. Bu user'ning
   saqlangan filterlari (per-account custom). Implement: yangi
   `SavedFilters` komponent + CRUD endpoint kerak.
3. **Pagination limit 100**: `1-100 из 27 295` — moysklad default
   100 per page _(source: screenshot bottom-left)_. Bizda 25.
   Yangilash: `LIMIT = 100` (avvalgi 25).
4. **Pagination format**: `{from}-{to} из {total}` — space-separated
   thousands `27 295` (NBSP yoki regular space) _(source: screenshot)_.
5. **"Показать итоги" link**: right-bottom — clickable, totals
   panelini ochadi _(source: screenshot bottom-right)_. Bizda yo'q.
6. **Column "Валюта"** (Currency): alohida column, har qator'da
   `сум` matni _(source: screenshot column header)_. Bizning
   schema'da `currency` field bor (default 'UZS'), lekin column
   render emas. Qo'shilishi kerak.
7. **Column "Не оплачено"**: alohida, red color _(source: screenshot
   column header + red value `−37 971,13`)_. Hisob: `sumMinor -
   payedSumMinor`. Bizda yo'q.
8. **Status badges**:
   - `Текширилмаган` (red/orange chip) _(source: screenshot row 3
     status column)_ — moysklad'ning custom workflow status.
   - `Напечатан` (teal chip) _(source: screenshot column "Напечатано")_
     — har "1" qator uchun. Bizda boolean check icon.
9. **Cell visualization**: row'larda **horizontal bar lines** ostida
   raqam ko'rinadi _(source: screenshot — har money column ostida
   yashil/sariq chiziq)_. Bu moysklad'ning custom progress
   indicator (oplata progress bar). Bizda yo'q.

### Title row
- **H1 matni**: `Заказы покупателей` _(source: capture.json `title`
  field + screenshot 2026-04-30 sessiya 2 h1)_
- Refresh icon: ✅ _(screenshot — Title yonida ↻ icon)_
- Help icon (?): ✅ _(screenshot — Title chap yonida ⓘ icon)_
- **`?` icon**: title'ning chap tomonida _(screenshot)_

### Title row
- **H1 matni**: `Заказы покупателей` _(source: capture.json `title` field
  + foydalanuvchi screenshot 2026-04-30 — moysklad sahifa h1)_
- Refresh icon: ✅
- Help icon (?): ✅ (`title="Помощь"` attribute capture'da)

### Sub-tabs (RU only, exact tartib — 10 ta!)
> Source: foydalanuvchi screenshot 2026-04-30 sessiya 2
| # | Matn (ru) | Href |
|---|---|---|
| 1 | Заказы покупателей | /customer-orders |
| 2 | Счета покупателям | /invoices-out |
| 3 | Отгрузки | /demands |
| 4 | Отчёты комиссионера | /commission-reports |
| 5 | Возвраты покупателей | /sales-returns |
| 6 | Счета-фактуры выданные | /factures-out |
| 7 | Прибыльность | /reports/profitability |
| 8 | Товары на реализации | /consignments |
| 9 | Воронка продаж | /sales-funnel |
| **10** | **Юнит-экономика** | **/reports/unit-economics** _(❓ TODO: real href tasdiqlash)_ |

### Saved filter chips (sub-nav ostida)
> Source: foydalanuvchi screenshot 2026-04-30 sessiya 2
> Bu user-spesifik saved filters (har account o'z 0-N ta pill yaratadi).
| Pill | Manba |
|---|---|
| `ипадром` | screenshot, account `farrux@climart_santex_group` |
| `Фаррухбек касса` | screenshot, same |

❗ **Yangi feature kerak**: SavedFilter CRUD endpoint + UI komponent.
Round 3'da implement qilinadi.

### Toolbar (chap-o'ng)
> ✅ Source: `screenshots/37-default.png` (PNG ko'rinishidan)
| # | Element | Matn (ru) | Type |
|---|---|---|---|
| 1 | Primary CTA | `+ Заказ` | button |
| 2 | Filter button | `Фильтр` | button |
| 3 | Search input | `Номер или комментарий` placeholder | input |
| 4 | Selection counter | `0` | text |
| 5 | Bulk dropdown | `Изменить ▾` | dropdown |
| 6 | Status dropdown | `Статус ▾` | dropdown |
| 7 | Create dropdown | `Создать ▾` | dropdown |
| 8 | Print dropdown | `Печать ▾` | dropdown |
| 9 | Columns | `Столбцы ▾` | dropdown |
| 10 | Settings icon | gear icon | icon button |

❌ **`Решения` toolbar'da YO'Q** (avval capture.json title
concatenation'dan taxmin qilgan edim — DOM bilan PNG bir-biriga mos
kelmadi). Real toolbar yuqorida.

### Search
- **Placeholder**: `Номер или комментарий` _(source: purchase-orders'dagi
  bir xil pattern, customer-orders capture moment'da search input
  rendered emas edi — placeholder='' capture'da, lekin dom o'qish
  paytida default pattern saqlangan)_
- Position: inline-toolbar

### Columns (default visible — 14 ta, screenshot bilan tasdiqlangan)
> Source: foydalanuvchi screenshot 2026-04-30 sessiya 2 — real
> data bilan har column ko'rinadi
| Order | Key | Header (ru) | Type | Align | Screenshot value namuna |
|---|---|---|---|---|---|
| 1 | name | `№` | string (link) | left | `00004` (clickable, underlined) |
| 2 | moment | `Время` | datetime | left | `07.03.2025 08:51` |
| 3 | agent | `Контрагент` | string (link) | left | `Молхонага Кодир...` (truncate) |
| 4 | organization | `Организация` | string | left | `Кассир Молиячи` / `Бекзод касса` |
| 5 | sum | `Сумма` | money | right | `1 908 000,00` |
| 6 | **currency** | **`Валюта`** | string | center | `сум` _(yangi — capture.json'da yo'q)_ |
| 7 | invoiced_sum | `Выставлено сче...` (truncated header) | money | right | `0,00` (default 0) |
| 8 | payed_sum | `Оплачено` | money | right | `60 000,32` _yashil bar ostida_ |
| 9 | **unpaid_sum** | **`Не оплачено`** | money | right | `−37 971,13` _(red, negative when overpaid)_ — yangi |
| 10 | shipped_sum | `Отгружено` | money | right | `60 000,32` _yashil bar ostida_ |
| 11 | state | `Статус` | badge | left | `Текширилмаган` (red), bo'sh / `Подтверждён` |
| 12 | sent | `Отправлено` | bool | center | empty / check |
| 13 | printed | `Напечатано` | badge | center | `Напечатан` (teal chip har row uchun) |
| 14 | description | `Комментарий` | string | left | `Списками йигиб так` / `Телефон: 91444252` |

❗ **Yangi columnlar (bizda yo'q)**:
- `currency` — alohida column. Schema'da bor, render kerak.
- `unpaid_sum` — hisob: `sumMinor - payedSumMinor`. Backend'da
  endpoint qaytarsin.

❗ **Status badge'lar moysklad'da** rang bilan: red `Текширилмаган`,
teal `Напечатан`, yashil va h.k. Mavjud `STATE_TONE` map bizda bor,
lekin moysklad'ning aniq state nomlari bilan tekshirilishi kerak.

❗ **Money cell visualization**: progress bar ostida son ko'rinadi
_(yashil bar = paid, sariq = partial, qizil = overdue/unpaid)_.
Yangi `MoneyProgressCell` komponent kerak (Round 4).

### Empty state
> ✅ Source: `screenshots/37-default.png` (capture v2 sweep,
> 2026-04-30) — men PNG'ni Read tool bilan ko'rdim. Capture moment'da
> sahifa **bo'sh edi** (yangi sub-account ehtimol), demak empty state
> render bo'lgan va PNG'da aniq ko'rinmoqda.
- ✅ **Heading**: `Добавляйте и получайте заказы от покупателей`
  _(eski taxmin "Создавайте и принимайте..." YANGLISH edi)_
- ✅ **Primary CTA**: `+ Создать заказ` (katta blue tugma + "+" icon)
- ✅ **Helper**: `Чтобы создавать заказы автоматически, настройте
  интеграции с интернет-магазинами, маркетплейсами и социальными
  сетями` _(`настройте интеграции` blue link → /settings/integrations)_
- ✅ **3 ta resurs link**:
  1. 📖 `Руководство по заказам покупателей` (book icon)
  2. ▶️ `Обучающее видео` (play icon)
  3. ▶️ `Подробный видеокурс` (play icon)
- ✅ **Illustration**: Mushuk qutida o'tirgan (cat on box, blue
  watercolour)

### Pagination format
> Source: foydalanuvchi screenshot 2026-04-30 sessiya 2 — bottom-left
- **Format**: `{from}-{to} из {total}` — `1-100 из 27 295`
- **Default limit**: 100 _(bizda 25 → o'zgartirish kerak)_
- **Thousands separator**: NBSP (`27 295`) yoki regular space
- Footer sum row: ❓ TODO — screenshot'da bo'sh state ko'rinmadi
  (faqat 27,295 row bilan). "Показать итоги" link bilan totals
  panel ochiladi (yangi feature).

### "Показать итоги" link
> Source: foydalanuvchi screenshot 2026-04-30 sessiya 2 — bottom-right
- Matn: `Σ Показать итоги` (sigma icon + matn)
- Joylashuv: pagination'ning o'ng tomonida
- Action: bosilganda totals panel ochilib, har money column'ning
  sum'i ko'rinadi (footer sum row'ga o'xshash, lekin on-demand).
- Implement: ListView'ga yangi `onShowTotals` callback yoki
  `showTotalsLink` boolean prop. Round 3.

---

## 2. Toolbar dropdowns (ROUND 2 — capture-driven, 2026-04-30 final run)

> Source: `screenshots/i-default.dom.html` + `i-dropdown-{izmenit,status,sozdat,pechat}.dom.html`
> Captured 2026-04-30 22:38-22:39 with `screenshot-interactions.ts`
> after fixing GWT-aware selector (span.text === label) + 14s render
> wait + data-safe row-select cleanup.

### 2.1 `Изменить ▾` (Bulk Actions menu) — needs ≥1 row selected

**Trigger**: `<span class="text">Изменить</span>` at toolbar position
[171, 723] (default Moysklad ru-RU layout). Width ~54px.

**Popup**: `<div class="popup-button-popup popup-button-popup-menu">`
with `<table>`/`<tr>`/`<td class="gwt-MenuItem">` rows. Position
absolute, anchored below the trigger.

**Menu items** (verbatim from `i-dropdown-izmenit.dom.html`):
| # | RU | Action | Notes |
|---|----|--------|-------|
| 1 | Удалить | bulk-delete (soft) | always enabled |
| 2 | Копировать | bulk-clone | always enabled |
| — | (separator) | — | `gwt-MenuItemSeparator` |
| 3 | Массовое редактирование | bulk-edit modal | always enabled |
| 4 | Провести | bulk-confirm | **disabled** when all selected rows are already confirmed |
| 5 | Снять проведение | bulk-unconfirm | enabled when ≥1 row is confirmed |
| 6 | Объединить | bulk-merge into single doc | needs ≥2 rows |
| 7 | Зарезервировать | bulk-reserve stock | enabled |
| 8 | Очистить резерв | bulk-clear-reserve | enabled when ≥1 row has reserve |

### 2.2 `Статус ▾` (Status quick-change) — needs ≥1 row selected

**Trigger**: `<span class="text">Статус</span>` at [171, 812], w=38.

**Popup**: `<div class="popup-button-popup">` containing
`<div class="b-color-list-box-popup">` and per-status entries:

```html
<div class="item-status">
  <div class="b-color-square" style="background-color: rgb(R,G,B);"></div>
  <span class="label">{status name}</span>
</div>
```

**Menu items** (verbatim from `i-dropdown-status.dom.html`,
account-specific custom statuses):
| # | RU/UZ-translit name | Color (rgb) | Hex |
|---|---|---|---|
| 1 | Текширилмаган | 233,41,25 | `#e92919` red |
| 2 | Карз колди | 230,129,22 | `#e68116` orange |
| 3 | Туланди Накт | 0,135,57 | `#008739` green |
| 4 | Туланди Клик | 162,198,23 | `#a2c617` lime |

❗ **Tenant-specific**: bu 4 ta status faqat
`farrux@climart_santex_group` accountda. Default moysklad `state`'lari
schema-driven (FSM'da). Implement:
- Render all account-defined `OrderState` rows in a popup with their
  `colorHex` and `label` (i18n bilan tarjima qilingan).
- Click on item → API call `PATCH /customer-orders/bulk { state }`
- Existing endpoint already supports this; just need new dropdown UI.

### 2.3 `Создать ▾` (Create related document) — needs ≥1 row selected

**Trigger**: `<span class="text">Создать</span>` at [171, 885], w=46.

**Popup**: same `popup-button-popup-menu` pattern.

**Menu items** (verbatim from `i-dropdown-sozdat.dom.html`):
| # | RU | Target document |
|---|----|-----------------|
| 1 | Заказ поставщикам | New `purchase-order` from selection |
| 2 | Заказ поставщикам (с учетом «доступно») | Same but only items below stock |
| 3 | Волна отбора | New `picking-wave` |
| 4 | Отгрузки | New `demand` (shipment) |
| 5 | Приходные ордеры | New `cash-in` for prepayment |
| 6 | Входящие платежи | New `payment-in` |
| 7 | Снабжение | Auto-supply plan |

❗ Tenant scope: items 4, 6 are most common (shipment + payment). Items
1, 2, 3, 5, 7 are advanced — implement in Round 3 follow-up.

### 2.4 `Печать ▾` (Print templates)

**Trigger**: `<span class="text">Печать</span>` at [171, 987], w=39.
**Always available** (no row selection required).

**Popup**: `popup-button-popup-menu` with
`print-popup-menu-bar` class.

**Menu items** (verbatim from `i-dropdown-pechat.dom.html`,
account-specific templates marked):
| # | RU | Type | State |
|---|----|------|-------|
| 1 | Список заказов | List export | enabled (always available) |
| 2 | Йиллик Усталар | Custom user template | enabled (account-specific) |
| — | (separator) | — | — |
| 3 | Чек_сум_(FerroSoft) (1) | Custom (paid) | **disabled** — needs purchase |
| 4 | Заказ | Built-in template | **disabled** — needs at least 1 row selected (or in different context) |
| — | (separator) | — | — |
| 5 | Комплект... | Bundle/zip | **disabled** in this context |
| — | (separator) | — | — |
| 6 | Настроить... | Manage templates | enabled (opens settings) |
| — | (separator) | — | — |
| 7 | Запросить форму | Promo: request custom template | enabled |
|   | (description) | "Вы можете запросить индивидуальную печатную форму у нашей службы поддержки" | — |
|   | (CTA) | `Как запросить` (external support link) | — |

### 2.5 `Столбцы ▾` (Column visibility) — BLOCKED in old design

**Trigger**: `<span class="text">Столбцы</span>` at [171, 1072], w=50.

❗ **Capture limitation (verified twice with retry-after-dismiss)**:
clicking the trigger opens a `confirm-modal`
(`data-test-id="confirm-modal"`) titled **"Столбцы по статусам"** with body:

> "Чтобы работать с группировкой по статусам Заказов покупателя,
> включите новый дизайн. Переключиться на старый дизайн можно через
> иконку в правой части экрана."

CTAs: **`Новый дизайн`** + (after our dismissal patch) **`Старый дизайн`**.

Once the modal is dismissed via "Старый дизайн" the trigger no longer
opens any popup at all on subsequent clicks — i.e. **the old GWT UI
on this account exposes column-visibility through a different control**
(likely the gear icon mentioned in the modal text), not through the
Столбцы trigger. The Столбцы trigger is exclusively a "switch to new
design" prompt in this layout.

**Implementation parity**: column show/hide is already wired through
the existing `<ColumnCustomizer>` primitive (icon-only trigger to the
right of Печать) which mirrors the same intent without the modal
detour. No further moysklad screenshot would change the
implementation, so this is closed as a documented capture-limitation
rather than a blocker.

The capture script (`screenshot-interactions.ts`) was extended to
detect and dismiss this modal automatically, then retry the trigger
click — confirming via the retry that no second-click popup appears.

### 2.6 `Отправить` — N/A on customer-orders

❌ Bu dropdown bu sahifa'da **mavjud emas** (probe-after-select.ts
2026-04-30 — span.text triggers row in toolbar zone'da yo'q).
`Отправить` faqat `demand` va `factureout` sahifalarida bor (email/
SMS jo'natish). Customer-orders'da bu funksiya **kerak emas**.

---

## 3. Filter panel (inline, always visible)

> Source: `i-default.dom.html` (filter form is rendered inline above
> the table, NOT a separate slide-in panel)

Customer-orders'ning filter panel'i moysklad's GWT app'da **default
ko'rinadi** — `Фильтр` button uni ko'rsatish/yashirish uchun toggle
qiladi, lekin default state — open.

### Top filter row (12 fields visible at default 1440x900 viewport)

| # | Label (ru) | Type | Field key (api) | Source |
|---|---|---|---|---|
| 1 | Период | DateRange | `momentFrom`, `momentTo` | `gwt-Label title="Период"` |
| 2 | Оплата | Select (Не оплачен / Частично / Полностью) | `paymentStatus` | `title="Оплата"` |
| 3 | Отгружено | Select (Не отгружен / Частично / Полностью) | `shippedStatus` | `title="Отгружено"` |
| 4 | Товар или группа | EntityPicker (product/group) | `productId\|groupId` | `title="Товар или группа"` |
| 5 | Склад | EntityPicker (warehouse) | `storeId` | `title="Склад"` |
| 6 | Проект | EntityPicker (project) | `projectId` | `title="Проект"` |
| 7 | Контрагент | EntityPicker (counterparty) | `agentId` | `title="Контрагент"` |
| 8 | Организация | EntityPicker (org) | `organizationId` | `title="Организация"` |
| 9 | Счет организации | EntityPicker (org account) | `organizationAccountId` | `title="Счет организации"` |
| 10 | Статус | EntityPicker (state) | `state` | `title="Статус"` |
| 11 | Уста | Custom field (account-specific) | `customField.usta` | `title="Уста"` — account-defined custom field |
| 12 | (Free numeric range) | Min/Max input | `sumMinorFrom`, `sumMinorTo` | seen in `i-dropdown-izmenit.png` filter row |

### Filter action buttons (below filter row)

| # | Label | Action |
|---|---|---|
| 1 | `Найти` | Apply filter (green button, `<span class="text">Найти</span>`) |
| 2 | `Очистить` | Clear all (gray button, `<span class="text">Очистить</span>`) |

### Custom fields ("Уста")

`Уста` — account `farrux@climart_santex_group`'da yaratilgan custom
field (Uzbek "master/craftsman"). moysklad'da har account o'z custom
field'larini schema'ga qo'shadi (per-entity). Implement:
- `CustomFieldDefinition` model (allaqachon bor)
- Filter panel custom field'larni schema'dan render qiladi
- API: `?customField.{key}={value}` query

---

## 4. Detail page (ROUND 3 — capture-driven, 2026-04-30)

> Source: `screenshots/d-default.{png,dom.html}` captured by
> `screenshot-detail.ts` (new GWT-aware detail-page capture script
> using `.tabName` selector — discovered via probe that moysklad uses
> `<div class="tabName">` not `<span class="tabName">` for detail tabs).

### 4.1 Layout overview

Customer-order detail page is a **single combined detail+edit view**
(no separate read-only / edit modes). Header has the doc number/date
+ status pills + action toolbar. Body has 3 form columns + a position
table tab area + totals sidebar + bottom collapsibles.

### 4.2 Top toolbar (above the form header)

| # | Element | Type | Notes |
|---|---|---|---|
| 1 | Сохранить | primary green button | save changes |
| 2 | Закрыть | gray button | back to list |
| 3 | `1 из 27295` | text + chevrons | document position counter; arrows navigate prev/next |
| 4 | Изменить ▾ | dropdown | bulk actions (same as list view) |
| 5 | Создать документ ▾ | dropdown | label is "Создать документ" here (not "Создать") |
| 6 | Печать ▾ | dropdown | print templates |
| 7 | Отправить ▾ | dropdown | (PRESENT on detail page, unlike list) — email/sms |
| 8 | (right) Author block | avatar + name + dates | "Сардор Х" + "Изменено DD.MM.YYYY HH:MM" + creator |

### 4.3 Document header

| Field | Type | Sample value |
|---|---|---|
| Заказ покупателя № `{name}` от `{moment}` | h1 line | `Заказ покупателя № 04796 от 04.06.2025 09:39` |
| Не оплачено | badge | red/orange (calculated from sums) |
| Запросить оплату | inline button | opens payment-link modal |
| `{state.label}` | colored badge | `Текширилмаган` (red — user state) |
| Проведено | checkbox | document state toggle |

### 4.4 Form fields (3-column layout)

**Column 1 (left, "core")**:
| Field | Required | Type | Notes |
|---|---|---|---|
| Организация | * | select | account organizations |
| Контрагент | * | entity-picker | with **Баланс: X сум** info-line below |
| План. дата отгрузки | — | date | planned shipment |
| Канал продаж | — | select | sales channel |
| Валюта документа | * | select | currency (default UZS) |
| Уста | — | custom field | account-defined custom field |

**Column 2 (middle, "logistics")**:
| Field | Required | Type | Notes |
|---|---|---|---|
| Склад | — | entity-picker | warehouse |
| Договор | — | entity-picker | contract |
| Проект | — | entity-picker | project |

**Column 3 (right, "delivery+notes")**:
| Field | Required | Type | Notes |
|---|---|---|---|
| Адрес доставки | — | expandable address group | Город / Улица / Дом / Кв. или офис / Индекс / Страна / Другое |
| Комментарий | — | textarea | document comment |
| Санаси | — | date | account custom date field (Uzbek "Date") |

### 4.5 Tab strip (`<div class="tabName">`)

| # | Tab label | Slug | Captured |
|---|---|---|---|
| 1 | Главная | glavnaya | ✅ d-default.png (active by default) |
| 2 | Связанные документы | svyazannye-dokumenty | ⏳ click did not save extra shot in this run |

> ❌ **Not separate tabs** (despite earlier assumption from old captures):
> Файлы, События, Задачи. These are **inline collapsible sections**
> under the Главная tab content, NOT siblings of Главная. They appear
> at the bottom of the page with their own +Add buttons.

### 4.6 Главная tab — position table

| # | Column | Type |
|---|---|---|
| 1 | (checkbox) | row select |
| 2 | № | row index (auto, 1, 2, ...) |
| 3 | Наименование | product link + code |
| 4 | Кол-во | number input + unit |
| 5 | Зарезерв. | reserved qty |
| 6 | Остаток | available qty |
| 7 | (action) | inline edit/del |

**Below table**:
- Add-line input: placeholder `"Добавить позицию — введите наименование, код, штрихкод или артикул"`
- Buttons: `Добавить из справочника`, `Проверить комплектацию`
- Comment textarea (placeholder `Комментарий`)
- `Внешний код` field

### 4.7 Totals sidebar (right column)

| Row | Type |
|---|---|
| Промежуточный итог: `X` | computed sum |
| ☐ НДС: `X` | checkbox + amount |
| ☐ Цена включает НДС | checkbox |
| Итого: `X` | grand total |
| Кол-во: `N` | total qty |

### 4.8 Bottom collapsibles

| Section | Default state | Action button |
|---|---|---|
| Задачи | empty `Нет задач` | `+ Задача` |
| Файлы | table headers | `+ Файл` |

### 4.9 Detail-page modal (one-time)

❗ moysklad shows a one-time "Попробуйте новый дизайн" modal on first
detail-page open per session. Title: **"Попробуйте новый дизайн"**.
Body: `"Мы обновили дизайн для этого типа документов. Если вы заметите
какие-то проблемы, переключитесь на старый дизайн в этом окне. Чтобы
не потерять данные, перед переключением дизайна сохраните документ."`
CTAs: `Новый дизайн`, `Старый дизайн`. We ignore this for parity (we
don't offer alternate designs).

---

## 5. Field modallar (Round 4 — TBD)

> Capture'lar mavjud (eski):
> - `dom/52-field-modal-agent-picker.html` ... `dom/57-field-modal-channel-picker.html`
> - YANGI: `d-default.dom.html` field skeleton

---

## 8. i18n string'lar (capture'dan extracted)

### 8.1 Page-level
| Key | RU | UZ | Source |
|---|---|---|---|
| `pages.customer_orders.title` | Заказы покупателей | Mijoz buyurtmalari | capture.json title |
| `pages.customer_orders.create_button` | Заказ | Buyurtma | capture.json toolbar |
| `pages.customer_orders.search_placeholder` | Номер или комментарий | Raqam yoki izoh | purchase-orders bir xil pattern |
| `pages.customer_orders.empty_title` | Нет заказов | Buyurtmalar yo'q | hozirgi i18n + foydalanuvchi screenshot |
| `fields.shipped_sum` | Отгружено | Otgruzilgan | capture.json column |
| `fields.reserved_sum` | Зарезервировано | Bron qilingan | capture.json column |

### 8.2 Изменить (bulk action) menu — `bulk_actions.*`
| Key | RU | UZ | Source |
|---|---|---|---|
| `bulk_actions.delete` | Удалить | O'chirish | i-dropdown-izmenit.dom.html gwt-uid-167 |
| `bulk_actions.copy` | Копировать | Nusxa olish | gwt-uid-168 |
| `bulk_actions.mass_edit` | Массовое редактирование | Ommaviy tahrirlash | gwt-uid-169 |
| `bulk_actions.confirm` | Провести | Tasdiqlash | gwt-uid-170 |
| `bulk_actions.unconfirm` | Снять проведение | Tasdiqlanishni olib tashlash | gwt-uid-171 |
| `bulk_actions.merge` | Объединить | Birlashtirish | gwt-uid-172 |
| `bulk_actions.reserve` | Зарезервировать | Bron qilish | gwt-uid-173 |
| `bulk_actions.clear_reserve` | Очистить резерв | Bronni tozalash | gwt-uid-174 |

### 8.3 Создать (create related) menu — `create_related.*`
| Key | RU | UZ | Source |
|---|---|---|---|
| `create_related.purchase_order` | Заказ поставщикам | Yetkazib beruvchiga buyurtma | i-dropdown-sozdat gwt-uid-175 |
| `create_related.purchase_order_with_available` | Заказ поставщикам (с учетом «доступно») | Yetkazib beruvchiga buyurtma («mavjud») | gwt-uid-176 |
| `create_related.picking_wave` | Волна отбора | Tanlov to'lqini | gwt-uid-177 |
| `create_related.demand` | Отгрузки | Yuk berishlar | gwt-uid-178 |
| `create_related.cash_in` | Приходные ордеры | Kirim orderlar | gwt-uid-179 |
| `create_related.payment_in` | Входящие платежи | Kiruvchi to'lovlar | gwt-uid-180 |
| `create_related.supply` | Снабжение | Ta'minlash | gwt-uid-181 |

### 8.4 Печать (print) menu — `print_menu.*`
| Key | RU | UZ | Source |
|---|---|---|---|
| `print_menu.list_export` | Список заказов | Buyurtmalar ro'yxati | i-dropdown-pechat gwt-uid-927 |
| `print_menu.configure` | Настроить... | Sozlash... | gwt-uid-932 |
| `print_menu.request_form` | Запросить форму | Forma so'rash | gwt-uid-608 |
| `print_menu.request_form_description` | Вы можете запросить индивидуальную печатную форму у нашей службы поддержки | Bizning yordam xizmatimizdan individual chop etish formasini so'rashingiz mumkin | print-custom-template-text |
| `print_menu.request_form_cta` | Как запросить | Qanday so'rash | print-custom-template-button-text |

> Custom user templates (`Йиллик Усталар`, `Чек_сум_(FerroSoft)`) —
> tenant-defined, NOT translated. Default tarjima'sini bermaydi.

### 8.5 Filter panel — `filters.*`
| Key | RU | UZ | Source |
|---|---|---|---|
| `filters.period` | Период | Davr | gwt-Label title="Период" (capture'da yo'q, default ru-RU) |
| `filters.payment_status` | Оплата | To'lov | title="Оплата" |
| `filters.shipped_status` | Отгружено | Yuk berildi | title="Отгружено" |
| `filters.product_or_group` | Товар или группа | Mahsulot yoki guruh | title="Товар или группа" |
| `filters.store` | Склад | Ombor | title="Склад" |
| `filters.project` | Проект | Loyiha | title="Проект" |
| `filters.agent` | Контрагент | Kontragent | title="Контрагент" |
| `filters.organization` | Организация | Tashkilot | title="Организация" |
| `filters.organization_account` | Счет организации | Tashkilot hisobi | title="Счет организации" |
| `filters.state` | Статус | Holat | title="Статус" |
| `filters.find` | Найти | Topish | filter-action span.text |
| `filters.clear` | Очистить | Tozalash | filter-action span.text |

> NOTE: `Уста` — bu account-defined custom field, default tarjima
> qilinmaydi. CustomFieldDefinition.label foydalaniladi.

### 8.6 Status popup — already in `states.customer_order.*`

Mavjud `states.customer_order` namespace'da default state'lar bor.
Account custom state'lari `OrderState.label` field'idan render qilinadi.

> ❓ TODO: empty_rich_heading + helper'ni foydalanuvchi screenshot
> bilan tasdiqlash kerak (moysklad.uz/app/#customerorder ochib,
> agar list bo'sh bo'lsa screenshot olish).

---

## 9. Open questions / TODO (foydalanuvchi screenshot 2026-04-30 sessiya 2 dan keyin)

### Yangi (screenshot'dan kelgan)
- ❓ `Юнит-экономика` 10-chi sub-nav tab — bizda yo'q. Yangi sahifa
  `/reports/unit-economics` qo'shish kerak (Round 5'da).
- ❓ **SavedFilter CRUD** (`ипадром`, `Фаррухбек касса` chip'lari)
  — yangi feature. Backend endpoint + UI komponent (Round 3).
- ❓ **`currency` column** — schema'da bor, render qo'shish.
- ❓ **`unpaid_sum` column** — `sumMinor - payedSumMinor`. Backend
  hisoblash + frontend column.
- ❓ **MoneyProgressCell** komponent — money cell ostida yashil/sariq/
  qizil progress bar. Round 4.
- ❓ **`Показать итоги` link** + totals panel. Round 3.
- ❓ **Pagination LIMIT 100** (bizda 25). O'zgartirish.
- ❓ **Status custom badge'lar**: `Текширилмаган` (red),
  `Напечатан` (teal). Moysklad'ning real state list'i kerak — agar
  customer order FSM'da default state'lar bo'lsa, bizning ham
  STATE_TONE'ni yangilash.

### Avvalgi (saqlandi)
- ❓ Empty state heading + helper + resource'lar — capture'da yo'q
  (data bor edi). Foydalanuvchi screenshot empty state uchun ham
  jo'natishi kerak.
- ❓ "Создать ▾" dropdown items capture extract — Round 2
- ❓ Edit form 30+ field — Round 4
- ❓ UZ tarjima moysklad'da yo'q — manual

---

## 10. Round 1 DOD (faqat list view) — DONE

- [x] Sub-tabs RU only, moysklad tartibi (commit 3872de3 + 50bca9b)
- [x] Toolbar elementlari to'g'ri tartibda
- [x] Search placeholder `Номер или комментарий`
- [x] hideTitle (commit 6900865)
- [x] filters: [] (commit 19660dd)
- [x] footerRow with money column sums (commit 6900865)
- [x] Empty state heading + helper (37-default.png — verified)
- [x] Empty state resource links (3 ta) — 37-default.png
- [x] Columns 13 ta — capture bilan mos
- [x] typecheck + biome clean
- [ ] Manual smoke (Round 5'da, visual baseline bilan)

## 11. Round 2 DOD (toolbar dropdowns + filter panel)

### Capture-driven inputs
- [x] `i-default.dom.html` (567KB) — default state DOM with full
      filter panel + table headers
- [x] `i-dropdown-izmenit.dom.html` — bulk actions menu (8 items)
- [x] `i-dropdown-status.dom.html` — status quick-change popup
      (color-list-box-popup with 4 user-defined statuses)
- [x] `i-dropdown-sozdat.dom.html` — create-related menu (7 items)
- [x] `i-dropdown-pechat.dom.html` — print templates menu
      (7 items + request-form CTA)
- [ ] `i-dropdown-stolbcy.dom.html` — **BLOCKED**: moysklad shows
      "Столбцы по статусам" use-new-design modal. Workaround:
      column visibility derived from default-state table headers.
- [N/A] `i-dropdown-otpravit` — not present on customer-orders

### Spec sections
- [x] §2.1 Изменить bulk-action menu (8 items + states)
- [x] §2.2 Статус popup (color-list-box-popup, 4 sample statuses)
- [x] §2.3 Создать related-doc menu (7 items)
- [x] §2.4 Печать templates menu (7 items + request CTA)
- [x] §2.5 Столбцы — limitation documented + workaround
- [x] §2.6 Отправить N/A — documented
- [x] §3 Filter panel inline fields (12 fields + 2 actions)

### Implementation (next)
- [ ] §8.2 i18n keys `bulk_actions.*` (8 keys × uz+ru)
- [ ] §8.3 i18n keys `create_related.*` (7 keys × uz+ru)
- [ ] §8.4 i18n keys `print_menu.*` (5 keys × uz+ru)
- [ ] §8.5 i18n keys `filters.*` (12 keys × uz+ru)
- [ ] `<Dropdown>` primitive in design-system (gwt-MenuItem mirror:
      enabled/disabled state, separator, group)
- [ ] `<StatusColorPopup>` primitive (color-square + label, click →
      bulk PATCH state)
- [ ] Wire toolbar in `apps/web/src/app/(app)/customer-orders/page.tsx`:
      Изменить + Статус + Создать + Печать dropdowns visible at
      toolbar (replace current buttons + bulk action bar bits)
- [ ] Filter panel: render 12 fields inline (NOT slide-in panel) —
      replace current `FilterDrawer` for this page
- [ ] typecheck + lint + test green
- [ ] Manual smoke (every dropdown opens + every filter applies)
