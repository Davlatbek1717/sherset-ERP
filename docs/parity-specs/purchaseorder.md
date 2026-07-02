# /purchase-orders parity spec

**Manba**: `docs/moysklad-reference/visual-captures/02-module/purchaseorder/`
**Tahriri**: 2026-04-30 sessiya 2
**Holat**: 🚧 Round 1 — list view spec yozildi; toolbar dropdownlar +
edit form spec keyingi sessiyada to'liq yoziladi.

> RULE 0 amal qiladi — har string capture'dan kelishi shart.
> Capture'da topilmagan stringlar foydalanuvchi screenshot manbasi
> bilan belgilanadi yoki "❓ TODO" deb qoldiriladi.

---

## 1. List view (`dom/49-default.html`, `capture.json`)

### Title row
- **H1 matni**: `Заказы поставщикам` _(source: capture.json `title` field
  va `dom/49-default.html` h1)_
- Refresh icon: ✅ (capture.json'da icon button)
- Help icon (?): ✅ (`dom/50-title-icon-help.html` capture'da `Помощь`
  title attribute)

### Sub-tabs (RU only, exact tartib)
> Sub-nav layout.tsx'da `purchasesSubNav`'da konfiguratsiyalashtirilgan,
> `subnav.purchases.*` i18n'da string'lar. Tartib commit `43e2ce6`'da
> moysklad bilan moslashtirilgan:
| # | Matn (ru) | Href | Source |
|---|---|---|---|
| 1 | Заказы поставщикам | /purchase-orders | foydalanuvchi screenshot 2026-04-30 |
| 2 | Счета поставщиков | /invoices-in | screenshot |
| 3 | Приёмки | /supplies | screenshot |
| 4 | Возвраты поставщикам | /purchase-returns | screenshot |
| 5 | Счета-фактуры полученные | /factures-in | screenshot |
| 6 | Управление закупками | /reports/purchase-management | screenshot |
| 7 | Обучение | /help/purchases | screenshot (`title="Обучение"` attr) |

### Toolbar (chap-o'ng)
> Source: `capture.json` title concatenation +
> `dom/03-dropdown-izmenit.html` / `dom/04-dropdown-status.html` /
> `dom/05-dropdown-sozdat.html` / `dom/06-dropdown-pechat.html`
| # | Element | Matn (ru) | Type |
|---|---|---|---|
| 1 | Primary CTA | `+ Заказ` | button |
| 2 | Filter button | `Фильтр` | button |
| 3 | Selection counter | `0` | text |
| 4 | Bulk dropdown | `Изменить ▾` | dropdown |
| 5 | Status dropdown | `Статус ▾` | dropdown |
| 6 | Create dropdown | `Создать ▾` | dropdown |
| 7 | Print dropdown | `Печать ▾` | dropdown |
| 8 | Solutions | `Решения ▾` | dropdown |
| 9 | Columns | settings icon | button |

### Search
- **Placeholder**: `Номер или комментарий` _(source: dom/49-default.html
  `placeholder="Номер или комментарий"`)_
- Position: inline-toolbar (search input toolbar ichida, alohida row emas)

### Columns (default visible — `title=` attributes)
Source: `dom/49-default.html` har `<th>` elementdagi `title=` attribute.
| Order | Key | Header (ru) | Type | Align |
|---|---|---|---|---|
| 1 | name | `№` | string | left |
| 2 | moment | `Время` | datetime | left |
| 3 | agent | `Контрагент` | string | left |
| 4 | organization | `Организация` | string | left |
| 5 | sum | `Сумма` | money | right |
| 6 | invoiced_sum | `Выставлено счетов` | money | right |
| 7 | payed_sum | `Оплачено` | money | right |
| 8 | received_sum | `Принято` | money | right |
| 9 | awaiting_sum | `В ожидании` | money | right |
| 10 | sent | `Отправлено` | bool/check | center |
| 11 | printed | `Напечатано` | bool/check | center |
| 12 | description | `Комментарий` | string | left |

### Empty state
> Capture'da empty rendered emas (account'da data bor).
> Source: foydalanuvchi screenshot 2026-04-30, online.moysklad.ru/app/#purchaseorder
- **Heading**: `Создавайте и отправляйте заказы поставщикам`
- **Primary CTA**: `+ Создать заказ` (katta tugma)
- **Helper link**: `Чтобы товар отобразился на складе, после закупки
  создайте приёмку` _(linked text: `приёмку` → /supplies/new)_
- **Resource cards** (3 ta, har birida icon):
  | Matn | Href | Icon |
  |---|---|---|
  | Руководство по заказам | (external help) | book-icon |
  | Обучающее видео | (external video) | play-icon |
  | Подробный видеокурс | (external course) | play-icon |
- **Illustration present**: ✅ (right side: orange box + cat)

### Pagination format
> Source: foydalanuvchi screenshot, `1-1 из 0` ko'rinishi (when 1 page,
> 0 records).
- **Format**: `{from}-{to} из {total}` (RU) / `{from}-{to} dan {total}` (UZ — taxmin, RULE 0 ogohlantirish)
- Footer sum row: ✅ — har money column uchun
  - sum / invoiced_sum / payed_sum / received_sum / awaiting_sum

---

## 2. Toolbar dropdowns

### "Изменить ▾" (`dom/03-dropdown-izmenit.html`)
> ❓ TODO: dom faylini chuqur o'qib har item matnini extract qilish
> kerak. Bu spec keyingi sessiyada to'ldiriladi.

### "Статус ▾" (`dom/04-dropdown-status.html`)
> ❓ TODO

### "Создать ▾" (`dom/05-dropdown-sozdat.html`)
> ❓ TODO. Avvalgi i18n keys'da:
> - "create_invoice": "+ Счёт"
> - "create_advance": "+ Аванс"
> - "create_supply": "+ Приёмка"
> Capture'dan tasdiqlash kerak.

### "Печать ▾" (`dom/06-dropdown-pechat.html`)
> ❓ TODO

### "Отправить ▾"
> ❓ TODO — capture file mavjud emas (purchaseorder'da yo'q —
> `dom/0X-edit-dropdown-otpravit.html` faqat edit form'da)

---

## 3. Edit form (`dom/09-edit-default.html`, `dom/14-edit-tab-positions.html`, ...)
> Round 4'da batafsil yoziladi.

---

## 4. Detail page (`dom/67-detail-default.html`)
> Round 4'da batafsil yoziladi.

---

## 5. Field modallar
- `dom/64-field-modal-agent-picker.html` — Контрагент catalog
- `dom/65-field-modal-org-picker.html` — Организация picker
- `dom/66-field-modal-store-picker.html` — Склад picker
- `dom/19-catalog-picker.html` — Tovar picker (positions)
> Round 4'da har modal'ning fields'i extract qilinadi.

---

## 6. Row context menu
> ❓ TODO: capture'da row-context-menu file purchaseorder'da chiqmadi
> (capture v2 run paytida — list bo'sh yoki right-click trigger
> ishlamadi). Re-capture kerak yoki manual screenshot.

---

## 7. Bulk action modallar
> ❓ TODO: capture'da action-modal-* file'lar bo'sh — list'da row
> bor edi lekin bulk action trigger ishlamadi (script issue).
> Re-capture kerak.

---

## 8. i18n string'lar (capture'dan extracted)

| Key | RU | UZ | Source |
|---|---|---|---|
| `pages.purchase_orders.title` | Заказы поставщикам | Ta'minlovchi buyurtmalari | capture.json title |
| `pages.purchase_orders.create_button` | Заказ | Buyurtma | capture.json toolbar |
| `pages.purchase_orders.search_placeholder` | Номер или комментарий | Raqam yoki izoh | dom/49-default.html input placeholder |
| `pages.purchase_orders.empty_title` | Нет заказов | Buyurtmalar yo'q | foydalanuvchi screenshot fallback |
| `pages.purchase_orders.empty_rich_heading` | **Создавайте и отправляйте заказы поставщикам** | **Ta'minlovchi buyurtmalarini yarating va yuboring** | foydalanuvchi screenshot 2026-04-30 |
| `pages.purchase_orders.empty_rich_helper` | **Чтобы товар отобразился на складе, после закупки создайте приёмку** | **Tovar omborga tushishi uchun xarid yaratgandan so'ng qabul ham yarating** | foydalanuvchi screenshot |
| `pages.purchase_orders.empty_resource_guide` | Руководство по заказам | Buyurtmalar bo'yicha qo'llanma | foydalanuvchi screenshot |
| `pages.purchase_orders.empty_resource_video` | Обучающее видео | O'qituvchi video | foydalanuvchi screenshot |
| `pages.purchase_orders.empty_resource_course` | Подробный видеокурс | Batafsil video kurs | foydalanuvchi screenshot |
| `fields.invoiced_sum` | Выставлено счетов | Schyotlar berilgan | dom/49-default.html column title |
| `fields.payed_sum` | Оплачено | To'langan | dom/49-default.html column title |
| `fields.received_sum` | Принято | Qabul qilingan | dom/49-default.html column title |
| `fields.awaiting_sum` | В ожидании | Kutilmoqda | dom/49-default.html column title |
| `fields.sent` | Отправлено | Yuborilgan | dom/49-default.html column title |
| `fields.printed` | Напечатано | Chop etilgan | dom/49-default.html column title |

> UZ tarjimasi: capture'da uz rejim yo'q (moysklad.uz interfeysi RU
> only). UZ'lar mening manual tarjimam — RULE 0 'ga ko'ra bu ham
> taxmin sanaladi. Aniqroq UZ string'lar uchun foydalanuvchi'dan
> moysklad'da uz toggle bormi yoki tarjimani tasdiqlashni so'rash
> kerak. Hozircha mavjud UZ string'lar saqlanadi.

---

## 9. Open questions / TODO

- ❓ Toolbar dropdownlar (Изменить / Статус / Создать / Печать /
  Решения) — har dropdown'ning items list'i capture'dan o'qib
  extract qilinishi kerak. Round 2'da batafsil.
- ❓ Edit form 30+ field — Round 4'da batafsil.
- ❓ Detail page tabs + body sections — Round 4.
- ❓ Field modal'larning content (catalog/agent/org picker) — Round 4.
- ❓ Row context menu va action modal capture'lari to'liq yo'q —
  re-capture kerak (Round 2 oldidan).
- ❓ UZ tarjimasi capture'da yo'q — foydalanuvchi tasdig'i bilan
  saqlanadi.

---

## 10. Round 1 Definition of Done (faqat list view)

- [x] Sub-tabs RU only, moysklad tartibi (commit 43e2ce6 + 50bca9b
      tugatdi)
- [x] Toolbar elementlari to'g'ri tartibda (capture moslashdi —
      `+ Заказ` / `Фильтр` / counter / `Изменить` / `Статус` / `Создать` /
      `Печать` / `Решения` / settings)
- [x] Search placeholder `Номер или комментарий` (commit 43e2ce6)
- [x] hideTitle (commit 43e2ce6)
- [x] filters: [] (commit 43e2ce6)
- [x] footerRow with money column sums (commit 43e2ce6)
- [ ] Empty state — `Создавайте и отправляйте заказы поставщикам`
      heading **CAPTURE-DRIVEN** (currently from add-empty-rich-keys.py
      taxmin pattern, **bu retake commit'da yangilanadi**)
- [ ] Empty state helper — `Чтобы товар отобразился на складе, после
      закупки создайте приёмку`
- [ ] 3 ta resource link (Руководство / Обучающее видео / Подробный
      видеокурс) — ListView.richEmpty.resources prop ishlatib
- [ ] Columns 12 ta (default 6 ta visible bo'lishi kerakmi yoki
      hammasi) — capture'dan aniqlash kerak
- [ ] typecheck + biome clean
- [ ] Manual smoke (lokal'da sahifani ochib, har element capture
      bilan side-by-side solishtirish)

Round 2-4 DOD keyingi sessiyalarda to'ldiriladi.
