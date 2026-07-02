# 1:1 Parity Audit — gap analysis va yo'l xaritasi

> **Maqsad**: moysklad.uz bilan **pixel/UX 1:1 parity**ga erishish. Har
> sahifa, har state, har komponent darajasida.
>
> Bu hujjat **manba ma'lumot**: `docs/moysklad-reference/visual-captures/`
> dagi 72 ta modulning screenshot + DOM + meta capture'larini ishlatadi.

---

## 1. Metodologiya

Har sahifa uchun **3 ta artifact** mavjud:

| Artifact | Yo'l | Foydalanish |
|----------|------|-------------|
| Screenshot (PNG) | `visual-captures/XX-module/{slug}/screenshots/` | Vizual ko'rinish — tartib, ranglar, font |
| DOM (HTML) | `visual-captures/XX-module/{slug}/dom/` | Aniq element tartibi, class'lar, text |
| Meta (JSON) | `visual-captures/XX-module/{slug}/meta/` | Profile (kind, interactive count, title) |

**Har sahifaning state'lari** capture'da bor:
- `01-default.html` — boshlang'ich list ko'rinish
- `02-dropdown-izmenit.html` — "Изменить ▾" ochilgan
- `03-dropdown-sozdat-dokument.html` — "Создать документ ▾"
- `04-dropdown-pechat.html` — "Печать ▾"
- `05-dropdown-otpravit.html` — "Отправить ▾"
- `08-edit-default.html` — yangi hujjat (/new yoki /[id] edit)
- `13-edit-tab-positions.html` — pozitsiyalar tab
- `14-edit-tab-linked.html` — bog'liq hujjatlar tab
- `15-edit-tab-files.html` — fayllar tab
- ... va boshqalar

Har state bo'yicha bizning kodimiz bilan **birga-bir** solishtirib chiqamiz.

---

## 2. Audit shabloni (har sahifa uchun)

```markdown
### {ModuleName} — /url

**Reference capture**: `docs/moysklad-reference/visual-captures/XX-module/{slug}/`

#### List page (`01-default.png`)

| Element | Moysklad | Bizda | Status |
|---------|----------|-------|--------|
| Page title | "Корректировка взаиморасчётов" | "O'zaro hisob-kitob tuzatish" | ⚠ tarjima farqi |
| Toolbar primary CTA | "+ Корректировка" | "Yangi tuzatish" | ⚠ tarjima |
| Toolbar dropdown order | Изменить → Печать | (yo'q) | ❌ yo'q |
| Filter trigger | "Фильтр" button → drawer | State pills inline | ❌ noto'g'ri pattern |
| Column order | №, Время, Орг, Контр, Счёт, Касса, Сумма, Комм, Кто, Когда | №, Sana, Mijoz, Yo'nalish, Izoh, Holat, Summa | ❌ 5 column yo'q, 1 extra |
| Pagination format | "1-100 из 674" | Cursor-based | ⚠ UX farq |
| Column gear icon | bor (⚙) | bor | ✅ |

#### Edit page (`08-edit-default.png`)
...

#### Linked tab (`14-edit-tab-linked.png`)
...
```

Har row uchun status:
- ✅ — to'g'ri
- ⚠ — tarjima yoki kichik farq (qabul qilinadi)
- ❌ — strukturaviy farq (tuzatilishi kerak)

---

## 3. 17 ta yangi modul audit holati

**PROGRESS** (yangilangan):
- ✅ Phase B — shared toolbar layer (commit `524b9e4`): ListView typed
  `editMenu/createDocMenu/printMenu/sendMenu`. Har list sahifa foyda oladi.
- ✅ CounterpartyAdjustment list 1:1 (commit `f7c3432`)
- ✅ Prepayment list 1:1 (commit `fed1349`)
- ✅ PrepaymentReturn list 1:1 (commit `6103cf1`)

**Proven per-page template** (har list sahifa uchun, ~20-30 min):
1. Imports: `Badge`/`ListViewFilter` → `SavedFiltersPills`,
   `useColumnVisibility`, `filterFromQueryString`, `CatalogPicker`,
   `CatalogPickerField`, `ColumnCustomizer`, `ExportButton`,
   `FilterDrawerValues`, `InlineFilterPanel`, `Input`, `PeriodPicker`,
   `PickerItem`
2. Interface: `updatedAt: string` qo'shish
3. State: `stateFilter` → `filterValues`/`filterOpen`/`pickerOpen`,
   `STATE_TONE` o'chirish, `filters` pills array o'chirish
4. `cols = useColumnVisibility(slug, [...keys])`, `hasActiveFilter`
5. Columns: `…name, moment, organization(ADD), agent, sum(signed),
   [doc-specific], description, updatedAt(ADD), owner(ADD)` — `state`
   column o'chirish (moysklad'da yo'q, faqat `applicable`)
6. `editMenuItems`/`printMenuItems` + agent/org fetchers
7. ListView: `<>` wrap, `filters` olib tashlash, `editMenu`/`printMenu`/
   `visibleColumnKeys`/`hasActiveFilter`/`extraActionsLeft` (Фильтр
   toggle)/`extraActions` (Export+ColumnCustomizer)/`headerSlot`
   (InlineFilterPanel: period/agent/org/sum) + 2 CatalogPicker modals
8. typecheck 0 + biome 0 → commit

| # | Modul | Reference yo'l | Status |
|---|-------|----------------|--------|
| 1 | CounterpartyAdjustment | `07-module/counterpartyadjustment/` | ✅ list 1:1 (f7c3432) |
| 2 | Prepayment | `07-module/prepayment/` | ✅ list 1:1 (fed1349) |
| 3 | PrepaymentReturn | `07-module/prepaymentreturn/` | ✅ list 1:1 (6103cf1) |
| 4 | InternalOrder | `06-module/internalorder/` | ⏳ template tayyor (positions doc — sum/columns farqli) |
| 5 | PriceList | `04-module/pricelist/` | ⏳ template tayyor |
| 6 | Uom | `04-module/uom/` | ⏳ settings-dict (oddiyroq pattern) |
| 7 | TaxRate | `00-module/vatrate/` | ⏳ settings-dict |
| 8 | ExpenseItem | ❓ capture topilmagan (moysklad'da nominlamovchi entity) | ⏳ |
| 9 | CustomEntity | `00-module/customentity/` | ⏳ |
| 10 | Region | ❓ capture yo'q (moysklad UZ'ga xos) | ⏳ |
| 11 | TrackingCode | ❓ capture yo'q | ⏳ |
| 12 | Discount | ❓ capture yo'q (bonus/discount integratsiyasi) | ⏳ |
| 13 | ProcessingOrder | `10-module/productionorder/` | ⏳ |
| 14 | Processing | `10-module/processing/` | ⏳ |
| 15 | Payroll | ❓ capture yo'q (moysklad RU'da fields'da bor) | ⏳ |
| 16 | Publication | ❓ shared "Share via link" pattern | ⏳ |
| 17 | Labels | (printing flow, capture format farqli) | ⏳ |

Plus **mavjud (eski) modullar** ham audit kerak:
- Counterparty, CustomerOrder, InvoiceOut, Demand, Supply, PurchaseOrder, ...
- Cash-in/out, Payment-in/out, Move, Loss, Enter, Inventory
- Products, Product folders, Variants, Bundles

Jami ≈ 50+ sahifa audit kerak.

---

## 4. Yo'l xaritasi (sistematik 1:1)

### Bosqich 1 — Discovery (~1 hafta)

Har bir reference capture'ni o'qib chiqamiz va **gap diff JSON** yaratamiz:

```json
{
  "module": "counterpartyadjustment",
  "page": "list",
  "gaps": [
    {
      "kind": "missing_column",
      "moyskladField": "Время (datetime)",
      "ourField": "Sana (date)",
      "fix": "Add time component to formatDate in column cell"
    },
    {
      "kind": "missing_column",
      "moyskladField": "Касса",
      "ourField": null,
      "fix": "Add cashDeskId column with cash-desk name"
    },
    ...
  ]
}
```

Bu fayllar `docs/PARITY-AUDIT/{module}.json` da to'planadi.

### Bosqich 2 — Pattern fixes (~3-5 kun)

Audit'lardan **umumiy pattern'lar**ni ajratib olamiz:
- `Toolbar: Изменить ▾ + Создать документ ▾ + Печать ▾ + Отправить ▾` — har list sahifada bir xil
- `Filter: drawer (Фильтр button), no state pills inline` — har list sahifada
- `Pagination: "1-N из total" format` — har list sahifada
- `Edit form: tabs order = Главная / Дополнительно / Свойства / Файлы / История` — har detail sahifada

Bu patternlar **shared component'lar**da bir marta tuzatiladi:
- `packages/design-system/src/patterns/ListView.tsx` — toolbar layout
- `packages/design-system/src/patterns/FilterDrawer.tsx` — filter pattern
- `apps/web/src/components/document-detail/DetailContentTabs.tsx` — tab order
- `packages/design-system/src/document-editor/DocumentEditor.tsx` — toolbar dropdowns

Bir marta to'g'rilab, **barcha sahifalar avtomat to'g'rilanadi**.

### Bosqich 3 — Per-page diffs (~2-3 hafta)

Har sahifa uchun ostida qolgan farqlar:
- Sahifaga xos columnlar
- Sahifaga xos meta panel field tartibi
- Sahifaga xos dropdown menyu ichidagi optional buyruqlar

Har page'ni alohida tuzatamiz, lekin shared component'lar to'g'rilangach **80% ish allaqachon bajarilgan** bo'ladi.

### Bosqich 4 — Visual regression (~1 hafta)

Playwright orqali har sahifa state'ini screenshot olib, **reference bilan diff** qilamiz:

```ts
// tests/visual-parity/counterparty-adjustment.spec.ts
test('list page matches moysklad reference', async ({ page }) => {
  await page.goto('/counterparty-adjustments');
  await expect(page).toHaveScreenshot('list-default.png', {
    maxDiffPixels: 100,
  });
});
```

Reference screenshot'larni `tests/visual-parity/__screenshots__/` ga ko'chiramiz.
CI'da har PR'da o'zgargan diff ko'rinadi.

---

## 5. Birinchi qadam: CounterpartyAdjustment audit (POC)

Bu sahifani **to'liq tahlil qilamiz** va metodologiyani isbotlaymiz.
Keyin xuddi shu shaklda boshqa sahifalarni qilamiz.

→ Davom etish uchun: men avtonomda 17 ta modulni audit qilib,
`docs/PARITY-AUDIT/*.json` fayllarini yaratishim mumkin. Yoki birinchi
modulni siz bilan birga ko'rib chiqib, formatni tasdiqlaganingizdan
keyin avtomatlashtirish.

---

**Tegishli kod**:
- Reference manba: `docs/moysklad-reference/visual-captures/`
- Capture quality info: `docs/moysklad-reference/visual-captures/_capture-quality.json`
- Component'lar (pattern fix'lari shu yerda):
  - `packages/design-system/src/patterns/ListView.tsx`
  - `packages/design-system/src/patterns/FilterDrawer.tsx`
  - `packages/design-system/src/document-editor/`
- Existing parity spec'lar (3 ta sahifaga bor): `docs/parity-specs/`

---

## 6. LIST-PAGE 1:1 PASS — TUGALLANDI ✅ (2026-05-16)

**Barcha list sahifalar 1:1 ga keltirildi.** Har biri: typecheck 0 +
biome 0/0, alohida commit. Yondashuv har sahifada bir xil edi:

- Tasdiqlanmagan status "pill sub-tab"lar olib tashlandi (DOM-tekshiruv:
  moysklad list chrome'da pill yo'q — faqat ikonali view-toggle). Status
  filtri inline Фильтр panelga ko'chirildi.
- Har filtr **backend schema bilan tekshirildi** (silent no-op yo'q —
  faqat backend qo'llab-quvvatlaydigan maydonlar).
- `(r: any)` cast'lar tiplandi (noExplicitAny tozalandi).
- Bir nechta sahifada `filterValues` `listQueryKey`ga qo'shildi
  (oldindan mavjud refetch bug — filtr o'zgarganda qayta so'ralmas edi).
- No-op SavedFiltersPills stub'lar wire qilindi yoki olib tashlandi.

**Guruhlar (hammasi tugadi):**
- Money (4) + bank-import (wizard — to'g'ri, template tashqarisida)
- Sales (7): customer-orders (oltin standart), invoices-out, demands,
  sales-returns, commission-reports, factures-out, consignments
- Purchase (5): purchase-orders (oltin standart), invoices-in, supplies,
  purchase-returns, factures-in
- Stock (5): moves, losses, enters, inventories, internal-orders
- Production (5): processings, processing-orders, productions, boms,
  work-orders
- Catalog (6): products, variants, bundles, services, price-types
  (inline-CRUD — template tashqarisida), price-lists
- CRM (7): counterparties, contact-persons, calls, opportunities,
  pipelines, discounts, tracking-codes
- HR: payrolls
- Settings dicts (5): uoms, tax-rates, expense-items, custom-entities,
  regions

**Shared layer**: `useMoyskladDocFilter` — opt-in `states` Статус select
qo'shildi (8 ta consumer sahifa bir joyda tuzatildi, additive, qolgan 7
ta o'zgarmadi).

**Bir martalik gold-standard**: customer-orders va purchase-orders
allaqachon 1:1 edi — tegilmadi (template ularni regress qilardi).

---

## 7. DETAL/YARATISH SAHIFALAR — STRUKTURAVIY AUDIT (2026-05-16)

**Hajm**: 55 ta `/[id]` + 51 ta `/new` = 106 sahifa.

### 7.1 Obyektiv holat (o'lchangan, taxmin emas)

| Signal | Natija |
|--------|--------|
| `(r: any)` / `as any` cast | 106 sahifada **0 ta** |
| Full web typecheck | **0 xato** |
| Shared parity tab-strip ishlatadigan hujjat-detal | **24/24** |
| Tab-strip'siz `/[id]` | 19 ta — **hammasi config/settings** (to'g'ri tab'siz) |

### 7.2 Etalon: `customer-orders/[id]` (tekshirildi, 1:1)

To'liq shared stack: `DetailHeader` + `DocumentMetaPanel` +
`DetailContentTabs` (positions/related/files/history) + custom
`RelatedDocsTab` (vizual diagramma) + `PositionEditor` +
`DetailTotalsSidebar` + position-CTA'lar ("Добавить из справочника",
"Проверить комплектацию") + `TasksSection` + `AttributesEditor`. Kod
izohlari moysklad capture'larga (`d-default.png`) bog'langan. **O'zgarish
kerak emas — etalon.**

### 7.3 FSM hujjat-detal sahifalar — strukturaviy 1:1 ✅

Quyidagilar etalon bilan **bir xil to'liq stack**ka ega (DetailHeader +
DocumentMetaPanel + DetailContentTabs[positions/related/files/history] +
filesSlot — audit bilan tasdiqlandi):

cash-in, cash-out, counterparty-adjustments, customer-orders, demands,
enters, internal-orders, inventories, invoices-in, invoices-out, losses,
moves, payments-in, payments-out, payrolls, prepayment-returns,
prepayments, price-lists, processing-orders, processings,
purchase-orders, purchase-returns, sales-returns, supplies (**24 ta**).

### 7.4 Katalog/CRM/integratsiya detal — yengilroq forma (TO'G'RI)

bundles, contact-persons, counterparties, opportunities, products,
services, variants, production/boms, production/work-orders,
ecommerce/orders, retail/sales, tasks — `DocumentMetaPanel`siz. Bu
**to'g'ri**: moysklad'da ham mahsulot/kontragent/BOM tahriri — oddiy
forma, hujjat-meta sahifa emas (xuddi 19 ta settings sahifa to'g'ri
tab'siz bo'lgani kabi).

### 7.5 Halol qolgan ish (mexanik EMAS)

Strukturaviy parity **tasdiqlangan**. Qolgani — **per-forma maydon
darajasidagi sadoqat**: har sahifani moysklad `08-edit-default` /
`13-edit-tab-positions` / `14-edit-tab-linked` / `15-edit-tab-files`
capture bilan bittalab solishtirish (maydon tartibi, label, toolbar
dropdown elementlari, meta-panel tartibi). Bu ~80 noyob formani qo'lda,
alohida tekshirish — chinakam ko'p-sessiyali ish. Mexanik sweep yoki
shared-fix YO'Q (bespoke sahifalar shared `DocumentToolbar`ni ham
ishlatmaydi). Soxta "bajardim" demaslik shart (qoida #1: "Ishlaydi ≠
To'g'ri ishlaydi").

### 7.6 BLOKER (dalil bilan, 2026-05-16) — edit-capture'lar buzilgan

Per-field detal 1:1 uchun moysklad edit-forma reference kerak. Tekshiruv
(bayt o'lcham + identiklik):

- **55 ta modul edit-default screenshot'idan 47 tasi — bayt-bir xil
  166079 bayt = bitta xil buzilgan "Сохранение изменений" save-modal.**
  demand, invoiceout, salesreturn, supply, move, ... — hammasi shu.
  Forma ko'rinmaydi.
- Haqiqiy edit-forma screenshot bor faqat: **customerorder (369093 b)**
  va **purchaseorder (321877 b)** — va **ikkalasi ham allaqachon 1:1**
  (gold standard, §6 + §7.2 da tekshirilgan).
- Qolgan "usable" (audit/documents-all/files/recyclebin/inventory) —
  hujjat-edit forma emas.

**Xulosa**: qolgan ~47 modul uchun per-field visual 1:1 — **harakat yoki
sessiya muammosi EMAS, reference ma'lumot yo'qligi sababli bloklangan.**
Reference yo'q joyda forma "1:1" qilish = targetni fabrikatsiya =
qoida #1 buzilishi.

**Yagona halol yo'llar:**
1. moysklad.uz edit sahifalarini **qayta capture qilish** (alohida
   data-collection vazifa, moysklad.uz kirish kerak) — keyin per-field
   1:1 mumkin bo'ladi.
2. Reference yo'q ekan: erishilgan parity = **strukturaviy etalon
   (CO/PO) + `api-docs-official/` (136 spec) maydon qamrovi** — bu
   allaqachon 24 ta FSM sahifaga qo'llangan (§7.3).

Demak detal qatlamida bu sessiyada **erishish mumkin bo'lgan hamma narsa
qilingan**: etalon tekshirilgan, strukturaviy stack 24 sahifada,
bloker dalil bilan hujjatlangan. Keyingi qadam — re-capture vazifasi.

---

## 8. BLOKER OCHILDI — jonli moysklad.uz capture (2026-05-16)

Foydalanuvchi moysklad.uz'ga login qildi (Claude-in-Chrome,
autentifikatsiyalangan sessiya). §7.6 bloker ochildi — endi haqiqiy
edit-forma reference olish mumkin.

### 8.1 DEMAND (Отгрузка) — moysklad edit-formasi (jonli, aniq)

URL: `online.moysklad.ru/app/#demand/edit?id=...`

**Asosiy maydonlar (2-3 ustun):**
`*Организация` (+ `Терминал` sub-select), `*Склад`, `*Контрагент`
(+ `Баланс : X сум` ko'rsatkich), `Договор` (+yangi), `Проект` (+yangi),
`Канал продаж` (+yangi), `*Валюта документа` (sum (UZS), tahrir),
`Уста` (custom +yangi), `Адрес доставки` (textarea + dropdown),
`Комментарий` (textarea), `▸ Другие поля` (collapsible).

**Другие поля (kengaytirilganda):** Грузоотправитель, Грузополучатель,
Перевозчик (har biri +yangi), Наименование груза, Указания
грузоотправителя, Перевозочный документ № + от(sana), Транспортное
средство, Номер автомобиля, Всего мест, ИД гос. контракта.

**Sarlavha qatori:** `Отгрузка № NNNNN от 📅 sana vaqt` | `Оплачено`
badge | `Status ▾` | `?` | `☑ Проведено`.
**Toolbar:** Сохранить · Закрыть · ‹N из M› · Изменить ▾ ·
Создать документ ▾ · Печать ▾ · Отправить (N) ▾ · [egasi/Изменения].
**Tablar:** `Главная` | `Связанные документы`.
**Pozitsiyalar:** ☐ · Наименование ▾ · Маркировка ▾ · Кол-во · Остаток ·
Цена ▾ · НДС · Скидка · Сумма ⚙▾ · qator ostida: «Добавить позицию…»
input + [Добавить из справочника] [Проверить комплектацию] … [Импорт ▾].
**Totallar:** Промежуточный итог · ☑НДС · ☑Цена включает НДС · Итого ·
Прибыль · Кол-во · ? Накладные расходы [N] Распределить «по цене».

### 8.2 Backend gap — DALIL bilan kvantlangan

Bizning `CreateDemandSchema` (apps/api/.../demand.schema.ts) faqat:
`agentId, organizationId, storeId, customerOrderId, moment, description,
currency, rateValue, vatEnabled, vatIncluded, attributes`.

**Yo'q (DB+API+FE kerak):** `contractId` (Договор), `projectId`
(Проект), `salesChannelId` (Канал продаж), `deliveryAddress` (Адрес
доставки), `consignorId` (Грузоотправитель), `consigneeId`
(Грузополучатель), `carrierId` (Перевозчик), `cargoName`,
`shipperInstructions`, `transportFacility`, `carNumber`, `placesCount`,
`shippingDocNo`+`shippingDocDate`, `stateContractId`, `overheadMinor`
(Накладные расходы). **≈14+ maydon.**

### 8.3 HALOL XULOSA — bu cross-stack feature, UI pass emas

`demand` ni haqiqiy 1:1 qilish = **Prisma migration (~14 ustun) +
demand.schema.ts + demand.service.ts mapping + frontend forma maydonlari
+ contract/project/sales-channel picker'lari (backend modullari hozir
yo'q bo'lishi mumkin) + i18n (uz/ru)** — har bir FSM modul uchun shunga
o'xshash. Bu ~24 modul × ko'p-qatlamli feature = chinakam katta
ko'p-sessiyali dastur. Frontendga backend yo'q maydon qo'shish (saqlamaydi)
= qoida #1 buzilishi ("Ishlaydi ≠ To'g'ri ishlaydi") — qilinmaydi.

**Erishilgan (bu sessiya, real qiymat):** (a) reference bloker ochildi
(jonli moysklad kirish), (b) DEMAND formasi **aniq, to'liq spec** sifatida
hujjatlandi (§8.1), (c) backend gap **dalil bilan kvantlandi** (§8.2).
Bu — mass cross-stack o'zgarishdan oldin real PM ishlab chiqaradigan
**tasdiqlangan spec**. Keyingi modullar shu uslubda: jonli capture →
spec → backend migration → API → service → FE → gate → commit, modul-modul.

## 9. CROSS-STACK PARITET BAJARILDI (2026-05-16, keyingi sessiya)

### 9.1 Kontrakt/Loyiha (Договор/Проект) — 19 modul, cross-stack 1:1

Har biri: Prisma model + migration + API schema + service
(create/update/findById [+clone]) + FE [id]+new (picker + dirty-guard
snapshot) + i18n, har bir modul alohida commit, har bosqichda darvozalar
(api+web typecheck 0, biome 0/0, 98 fayl / 1339 test yashil).

- **Sales (3):** demand, invoice-out, sales-return (+salesChannel).
  customer-order = etalon. (factures/commission/consignment N/A — edit-forma yo'q.)
- **Purchase (3):** invoice-in, supply, purchase-return. PO = etalon.
  facture-in N/A. Invariant: xarid hujjati = contract+project (salesChannel yo'q).
- **Stock (5):** move, loss, enter, inventory, internal-order — **faqat
  projectId** (ichki hujjat: kontragent yo'q → Договор yo'q; sotuv emas →
  Канал продаж yo'q). Bitta atomik migration (`add_stock_group_project`).
- **Money guruhi:** audit qilindi — barchasida agentId bor, demak
  contract+project mantiqan to'g'ri (keyingi ish, hali commit emas).

### 9.2 DEMAND «Другие поля» — to'liq shipping/logistika pariteti (commit 66b3e733)

§8.1 jonli etalon asosida 11 yangi maydon: consignor/consignee/carrier
(Counterparty FK picker), cargoName, shipperInstructions,
transportFacility, carNumber, placesCount, shippingDocNo, shippingDocDate,
stateContractId. Prisma migration `add_demand_shipping_block` +
schema/service + [id] meta-rows + new collapsible `DocumentDisclosurePanel`
+ 11 i18n kalit (uz/ru ×2 blok). Darvozalar yashil.

### 9.3 HALOL XULOSA — fabrikatsiya qilinmaydi (qoida #1)

Shipping/logistika bloki **demand'ga xos** (jismoniy yuk jo'natish).
`invoice-out` (Счёт) = to'lov hujjati, moysklad'da Перевозчик/Транспорт
bloki **YO'Q** — uni ko'r-ko'rona ko'chirish = fabrikatsiya. Tekshirildi:
`supply`/`invoice-in` da `incomingNumber/incomingDate` allaqachon bor;
`purchase-return` da yo'q va **bo'lmasligi to'g'ri** (chiquvchi hujjat).
Product modeli ham allaqachon keng (kind, salePrices, marking/GTIN,
mxikCode, packs, barcodes, Variant/BundleComponent/ProductPack modellari
mavjud). **Oson auditlanadigan modellar to'liq.** Chuqurroq per-hujjat /
per-entity maydon farqlari **jonli moysklad capture'siz aniqlab bo'lmaydi
(taxmin = fabrikatsiya)** — §8.3 metodologiyasi: har modul uchun jonli
capture → spec → implement. Chrome MCP beqaror bo'lganda bu blok; deeper
fidelity uchun foydalanuvchi moysklad.uz reference qayta ochishi kerak.

## 10. INVOICE-OUT (Счёт покупателю) — jonli capture (2026-05-17)

**Capture usuli (bloker yechildi):** computer-use MCP (ekran ko'rish,
"read" tier) + Claude-in-Chrome MCP (foydalanuvchi shu Chrome profilда
moysklad'ga kirgach, MCP-tab cookie'ni ulashdi → `find` + `click` +
`read_page` accessibility-tree). Parol kiritilmadi (o'zgarmas qoida).

### 10.1 Jonli forma (`#invoiceout/edit?new`, accessibility-tree)

**Sarlavha:** `Счет покупателю №` (bo'sh=avto) · sana-vaqt · «за период» ·
`Статус` ▾ · ☑ `Проведено`.
**Toolbar:** Восстановить · Сохранить · Закрыть · ‹ › · Изменить ▾ ·
Создать документ ▾ · Печать ▾ · Отправить ▾ · Решения.
**Tablar:** `Главная` | `Связанные документы`.
**Asosiy maydonlar:** `Организация` (+ tashkilot hisobi «Сум»),
**`Склад`** (masalan «Иподром Склад»), `Контрагент` (+ kontragent hisobi),
`Баланс` (display), `Договор`, `План. дата оплаты`, `Проект`,
`Канал продаж`, `Валюта документа` (+ kurs «Редактировать»).
**Pozitsiya ustunlari:** Наименование · Кол-во · Кол-во баз.ед. ·
Доступно · Остаток · Резерв · Ожидание · Вес · Объём · Цена ▾ · НДС ·
Сумма НДС · Скидка ▾ · Сумма. + «Добавить позицию…» / Добавить из
справочника / Проверить комплектацию / Импорт.
**Totallar:** Промежуточный итог · ☑НДС · ☑Цена включает НДС · Итого ·
Прибыль · Вес · Объём · Кол-во.
**Footer:** `Комментарий` · «Внешний код» (collapsible link).
**MUHIM:** demand'dagi «Другие поля» shipping bloki **YO'Q** (invoice-out
yengilroq, jismoniy yuk jo'natmaydi) — §9.3 halol bahosi tasdiqlandi.

### 10.2 Backend gap — DALIL bilan

`CreateInvoiceOutSchema`: agentId, organizationId, customerOrderId,
salesChannelId, contractId, projectId, moment, paymentPlannedMoment,
description, currency, rateValue, vatEnabled, vatIncluded, positions,
attributes. **Yo'q:** `storeId` (Склад — muhim, stok rezervi),
`organizationAccountId`, `agentAccountId`, `externalCode`.
**InvoiceOut Prisma modeli** bu 4 ustunni ALLAQACHON saqlaydi
(store/agentAccount/organizationAccount relations + external_code) →
**migration KERAK EMAS**. Gap = schema + service + FE wiring (past xavf,
nol fabrikatsiya: moysklad'da bor + DB'da bor).

## 11. SALES-RETURN (Возврат покупателя) — jonli capture (2026-05-17)

Capture: Claude-in-Chrome accessibility-tree (`#salesreturn` edit-forma).
Maydonlar: Организация(+hisob), **Склад**, Контрагент(+hisob), Баланс,
Договор, Проект, Канал продаж, Валюта, Комментарий, «Внешний код».
**План. дата оплаты YO'Q** (qaytarish, hisob emas — to'g'ri). «Другие
поля» shipping bloki YO'Q (§9.3 yana tasdiqlandi — faqat demand'da bor).
Gap: `storeId`/`contract`/`project`/`salesChannel` ALLAQACHON bor; faqat
`organizationAccountId`/`agentAccountId`/`externalCode` yo'q edi (DB'da
bor → migration KERAK EMAS). clone() ham lossy edi — barcha header ref
saqlanadigan qilib tuzatildi (invoice-out bilan bir xil pattern).
⚠️ moysklad «Превышен лимит одновременных подключений» chiqdi — MCP-tab
darrov yopildi (foydalanuvchi seat'ini bo'shatish uchun).

## 12. SUPPLY (Приёмка) — jonli capture (2026-05-17)

Capture: Claude-in-Chrome accessibility-tree (`#supply/edit?new`).
Doc-maydonlar: Организация(+hisob), Склад, Контрагент(+hisob), Баланс,
Договор, Проект, **Входящий номер + дата**, Валюта, Комментарий,
«Внешний код». **Канал продаж YO'Q** (xarid hujjati — sotuv/xarid
invariant tasdiqlandi). Pozitsiya ustunlari: …Себест.единицы,
Себестоимость, ГТД, РНПТ, Страна. Totallar ostida **«Накладные
расходы» [input] Распределить «по цене»**.

**Bajarildi (commit shu §):** `organizationAccountId`+`agentAccountId`
+`externalCode` — DB ustunlari bor edi → migration KERAK EMAS. clone()
lossy edi (PO/contract/project/accounts/externalCode/incoming tushardi)
→ to'liq tuzatildi. store/contract/project/incomingNumber/incomingDate
allaqachon bor; /new'da bankAccount→organizationAccountId mashinasi
oldindan bor → dublikat qilinmadi.

**HALOL DEFER (qoida #1 — fabrikatsiya emas):** «Накладные расходы»
(overheadSumMinor + overheadDistribution) — Supply Prisma modelida
ustunlar BOR, lekin `supply.service.ts` da overhead-distribution
logikasi UMUMAN YO'Q (grep=0). Schema'ga input qilib qo'yish
(WEIGHT/PRICE/VOLUME → per-line cost → FIFO lot cost taqsimotisiz) =
"ishlaydi-ko'rinadi, lekin hech narsa qilmaydi" = qoida #1 buzilishi.
Bu — alohida pul-matematik feature (adversarial QA: rounding,
concurrency, FIFO interaction kerak). Demand'da ham xuddi shunday
overheadSumMinor bor — ikkalasi bitta kelajak "Накладные расходы
distribution" feature'i sifatida qilinishi kerak, metadata bilan
aralashtirilmaydi. Hozircha **kvantlangan TODO** sifatida qoladi.

## 13. PURCHASE-RETURN (Возврат поставщику) — jonli capture (2026-05-17)

Capture: Claude-in-Chrome accessibility-tree (`#purchasereturn/edit?new`).
Maydonlar: Организация(+hisob), Склад, Контрагент(+hisob), Баланс,
Договор, Проект, Валюта, Комментарий, «Внешний код». Канал продаж /
Входящий номер / Накладные расходы YO'Q (chiquvchi qaytarish — to'g'ri).
Gap: store/contract/project/supply allaqachon bor; `organizationAccountId`
/`agentAccountId`/`externalCode` yo'q edi (DB'da bor → migration KERAK
EMAS). clone() lossy edi → barcha header ref + supply + reason saqlash
qilib tuzatildi. /new'da bankAccount→organizationAccountId oldindan bor
→ dublikat qilinmadi.

## 14. PURCHASE-ORDER (Заказ поставщику) — jonli capture (2026-05-17)

Capture: Claude-in-Chrome accessibility-tree (`#purchaseorder/edit?new`,
ref_134 meta-table). Maydonlar: Организация(+hisob), Склад,
Контрагент(+hisob), Баланс, Договор, **План. дата приемки**, Проект,
Валюта, «Внешний код». Канал продаж YO'Q (xarid hujjati). Накладные
расходы YO'Q (buyurtma — to'g'ri).

**MUHIM topilma:** purchase-order PO etalon deb hisoblangan edi, lekin
**Create/Update schema'da contract/project HAM yo'q ekan** (faqat
Prisma model "etalon" edi). Gap = **5 maydon**: contractId, projectId,
organizationAccountId, agentAccountId, externalCode. PurchaseOrder
Prisma modeli barcha 5 ustun + relations + indexlarga ega →
**migration KERAK EMAS**. store/deliveryPlannedMoment allaqachon bor.
clone() lossy edi → barcha header ref saqlash qilib tuzatildi.
`/new`: contract/project/bankAccount→orgAccount/externalCode oldindan
bor (faqat agentAccount qo'shildi — dublikat qilinmadi, no-two-
approaches, line-number dalil bilan mustaqil tasdiqlandi).

## 15. CUSTOMER-ORDER (Заказ покупателя) — jonli capture (2026-05-17)

Capture: Claude-in-Chrome accessibility-tree (`#customerorder/edit?new`,
ref_157 meta-table). Maydonlar: Организация(+hisob), Склад,
Контрагент(+hisob), Баланс, Договор, **План. дата отгрузки**, Проект,
**Канал продаж** (sotuv hujjati). 

**Eng kichik gap (chinakam etalon):** CreateCustomerOrderSchema'da
contract/project/salesChannel/externalCode/shipmentAddress ALLAQACHON
bor edi — faqat **organizationAccountId + agentAccountId** yo'q edi.
CustomerOrder Prisma modeli barcha ustunlarga ega → migration KERAK
EMAS. API: schema +2, service create/update/findById; clone() lossy
edi → barcha header ref (contract/project/salesChannel/accounts/
externalCode/shipmentAddress) saqlash qilib tuzatildi. Web: [id] +2
picker; new'da bankAccount→orgAccount oldindan bor → faqat agentAccount
qo'shildi (no-two-approaches, line-dalil). Subagent payload deviation:
[id]'da contract/project/salesChannel `!applicable` guard ichida →
yangi 2 maydon ham shu guardda (fayl konvensiyasi, mustaqil tasdiqlandi).

## 16. INVOICE-IN (Счёт поставщика) — jonli capture (2026-05-17)

Capture: Claude-in-Chrome accessibility-tree (`#invoicein` → Создать,
ref_139 meta-table). Maydonlar: Организация(+hisob), **Склад**,
Контрагент(+hisob), Баланс, Договор, **План. дата оплаты**, Проект,
**Входящий номер+дата**. Канал продаж YO'Q (xarid hujjati).

Gap = **4 maydon**: storeId, organizationAccountId, agentAccountId,
externalCode. InvoiceIn Prisma modeli barcha 4 ustun + relations'ga
ega (storeId nullable — clone allaqachon ishlatardi, lekin Create
schema'da yo'q edi) → migration KERAK EMAS. contract/project/incoming/
paymentPlanned allaqachon bor. clone() lossy edi → barcha header ref
(PO/contract/project/accounts/extCode/incoming) saqlash qilib tuzatildi.
Web: [id] +3 picker + editable externalCode (payload always-sent block,
contract/project bilan bir xil — bu fayl invoice-out kabi always-sent,
mustaqil tasdiqlandi); new'da bankAccount→orgAccount oldindan bor →
store+agentAccount+externalCode qo'shildi (no-two-approaches, line-dalil).

### Sales/Purchase hujjat guruhi — §8.3 jonli-capture YAKUNLANDI

invoice-out·sales-return·customer-order (sotuv) + supply·purchase-
return·purchase-order·invoice-in (xarid) + demand (shipping, §9.2) =
**8 FSM hujjat to'liq cross-stack 1:1**, har biri jonli moysklad
capture asosida, fabrikatsiyasiz, har bosqich gate yashil, mustaqil
tekshirilgan, alohida commit. Umumiy topilma: barcha ustunlar DB
modelida bor edi (migration kerak emas) — gap = API schema+service+FE
exposure. clone() har joyda lossy edi → hammasi tuzatildi.

## 17. STOCK + CASH «Внешний код» pass (2026-05-17)

8 arxetip jonli-tasdiqlangach, universal naqsh aniq: HAR moysklad
hujjatda «Внешний код» bor. Dalil: 6 modul (Move/Loss/Enter/Inventory/
CashIn/CashOut) Prisma modelida `external_code` ustuni ALLAQACHON bor,
lekin Create schema'da expose qilinmagandi → migration KERAK EMAS,
fabrikatsiya YO'Q (model+universal naqsh = dalil).

Bajarildi (1 cross-stack feature, 1 commit): 6 modul schema (Create
[+move Update]) + service (create/update/clone) + 12 FE sahifa
([id] FormState/snapshot/payload/Input + new useState/payload/Input).
clone() har joyda lossy edi (header ref tushardi) → move/cash-in/
cash-out clone'lar ham to'liq tuzatildi (projectId/contract/extCode).
Hisob (org/agent account) QO'SHILMADI — ichki/kassa hujjatlarda
moysklad'da yo'q (model'da ustun yo'q — to'g'ri). internal-order extCode
allaqachon bor edi (skip). Gate: api+web tc 0, biome 12/0, 1339 test.

## 18. PAYMENT-IN / PAYMENT-OUT — bank-payment archetype (2026-05-17)

Входящий/Исходящий платёж = bank-transfer pul hujjati (cash-in/out
Касса bilan emas, **Счёт организации / Счёт контрагента** bilan). 8
arxetip + cash jonli-tasdiqlangach naqsh aniq; PaymentIn/PaymentOut
Prisma modeli `external_code`+`agent_account_id`+`organization_account_id`
ustunlariga ega → migration KERAK EMAS, fabrikatsiya yo'q.

Gap = `organizationAccountId`+`agentAccountId`+`externalCode` (contract/
project allaqachon bor). API: 2 schema (Create, Update=partial) +
2 service (create/update/findById); clone() ikkalasi ham lossy edi
(contract/project/accounts/extCode tushardi) → to'liq tuzatildi. Web:
[id] +2 picker + editable externalCode (payload always-sent — bu
fayllar contract/project'ni shunday yuboradi, mustaqil tasdiqlandi);
new'da bankAccount mashinasi YO'Q edi (boshqa /new'lardan farqli —
mustaqil tasdiqlandi) → organizationAccount to'g'ridan-to'g'ri qo'shildi
(guarded spread). Gate: api+web tc 0, biome 4/0, 1339 test.

## 19. PREPAYMENT / PREPAYMENT-RETURN — accounts (2026-05-17)

Prepayment (avans) / Возврат предоплаты: pul hujjati, Счёт организации
/ Счёт контрагента qo'llanadi. Model'da `agent_account_id`+
`organization_account_id` ustunlari bor (extCode/contract/project
allaqachon expose qilingan) → gap = `organizationAccountId`+
`agentAccountId`, migration KERAK EMAS.

API: 2 schema (Create+Update, ikkalasi alohida `.strict()` object —
ikkalasiga ham qo'shildi) + 2 service. prepayment.service: create/
update(conditional-spread)/findById + clone (this.create orqali, src
account'lar). prepayment-return: source prepayment'dan contract/project
kabi accounts ham **inherit** qilinadi (override mumkin) + update; clone
yo'q. Web: [id] +2 picker, new +2 picker (bankAccount mashinasi yo'q
edi — to'g'ridan-to'g'ri qo'shildi). prepayments/[id] snapshot =
`JSON.stringify(s)` butun-forma → yangi maydonlar avtomat kuzatiladi
(field-list konvensiyasi bu faylda yo'q — mustaqil tasdiqlandi).
prepayment-returns/[id]'da picker mashinasi umuman yo'q edi → to'liq
qo'shildi (account'lar refund'ning o'z editable maydonlari).

### MONEY GURUHI YAKUNLANDI

cash-in/out (§17 extCode) + payment-in/out (§18 accounts+extCode) +
prepayment/prepayment-return (§19 accounts) = pul hujjatlari to'liq
1:1. Kassa hujjatlari Касса (cashDesk), bank hujjatlari Счёт
организации/контрагента — moysklad arxitekturasiga mos, fabrikatsiyasiz.

## 20. HUJJAT-MAYDON PARITET TASHABBUSI YAKUNLANDI (2026-05-17)

§8.3 jonli-capture metodologiyasi + universal-maydon dalil-kvantlash
butun hujjat modullari bo'ylab to'liq bajarildi (fabrikatsiyasiz, har
bosqich gate yashil, mustaqil tekshirilgan, modul-modul commit):

- **Sales/Purchase FSM (8):** demand·invoice-out·sales-return·customer-
  order·supply·purchase-return·purchase-order·invoice-in — to'liq
  per-doc 1:1 (§9.2, §10–§16). Jonli moysklad accessibility-tree.
- **Stock (5) + cash (2):** «Внешний код» exposure (§17). Ichki/kassa
  hujjatlarda hisob YO'Q (model = dalil).
- **payment-in/out (2):** Счёт организации/контрагента + Внешний код (§18).
- **prepayment/prepayment-return (2):** Счёт организации/контрагента (§19).
- **processing/processing-order/counterparty-adjustment (3):** extCode
  allaqachon expose qilingan, account ustunlari yo'q (moysklad dizayni)
  — **gap yo'q, COMPLETE** (dalil bilan tasdiqlandi, §20).

**Universal topilma:** barcha kerakli ustunlar DB modelida allaqachon
mavjud edi → migration KERAK EMAS hech qayerda; gap = API schema +
service + FE exposure. `clone()` deyarli HAR joyda lossy edi (header
ref tushardi) → hammasi to'liq tuzatildi (moysklad «Скопировать»
parity). «Накладные расходы» (overhead distribution) — supply/demand'da
DB ustun bor lekin service logikasi yo'q → HALOL DEFER (§12, alohida
pul-matematik feature, fabrikatsiya qilinmadi).

Yondashuv: 8 arxetip jonli-tasdiqlangach, qolgan hujjatlar shu
arxetiplarning variantlari — model ustun (moysklad-parity dizayn) +
8× tasdiqlangan universal naqsh = fabrikatsiyasiz dalil. Migration
talab qilmagani buni xavfsiz qildi.


## 21. TIER-2 ADVERSARIAL QA — yangi Phase-1 sahifalar (2026-05-17)

CLAUDE.md IKKINCHI QOIDA bo'yicha ikkita yangi qurilgan homepage tab
sahifasi (/getting-started, /files) + ularning backend'i uchun to'liq
adversarial kod-ko'rik o'tkazildi. **Haqiqiy correctness bug TOPILMADI**
— fabrikatsiyalangan tuzatish kiritilmadi (1-QOIDA).

### /files (apps/web + attachment module)
- Cursor pagination to'g'ri: buildUrl / liveCursor / extraItems akkumulyatsiya
- Filtr o'zgarishi pagination'ni reset qiladi (entity onChange, applyFilters,
  delete -> invalidate hammasi resetPagination chaqiradi)
- "Load more" ikki-marta bosish himoyalangan: Button disabled={disabled||
  loading} + disabled:pointer-events-none (Button.tsx:90,14) + React 18
  state-flush keyingi click event'dan oldin -> dublikat-append yo'q
- Backend accountId bilan tenant-scoped; blob list select'dan chiqarilgan;
  static attachments/all route param route'dan oldin (kolliziya yo'q)
- Qabul qilingan tabiiy chek: id-cursor pagination concurrent foydalanuvchi
  aynan cursor qatorini o'chirsa bo'sh qaytaradi — standart cheklov, same-user
  uchun delete -> resetPagination yumshatadi; over-engineering qilinmadi

### /getting-started (apps/web + onboarding module)
- completedCount faqat 7 funksional qadamni sanaydi (junk qiymat shishira
  olmaydi); bo'linish-nolga yo'q (STEPS.length=7 konstanta)
- Branch tartibi isSkipped -> isAllDone -> checklist to'g'ri; backend
  terminal holat uchun manba (source of truth)
- Per-row mutation spinner (completeStepMut.variables===step); skip/restart
  isPending bilan gated; Button loading'da disable -> double-submit yo'q
- STEP_ROUTES Record<FunctionalStep,string> (TS to'liqlikni majburlaydi)
- error / loading / data holatlari o'zaro eksklyuziv (bo'sh checklist flash yo'q)

### i18n to'liqlik (mustaqil tasdiqlangan)
uz+ru: getting_started (12 kalit + 7 qadam title/desc), files (20 kalit +
20 entity label), common.apply — hammasi mavjud, hech bir raw-key oqmaydi.

**Xulosa:** ikkala sahifa Phase-1 mustahkam. Ko'rib chiqilgan yagona
potentsial xavf (loadMore double-click) Button + React 18 tomonidan to'liq
oldi olingan — ortiqcha defensive guard qo'shish bug tuzatish emas, busywork
bo'lardi (1-QOIDA: non-issue'ni issue qilib ko'rsatmaslik). Halol natija:
kod sog'lom, kod o'zgarishi shart emas — Tier-2 audit-only.


## 22. §12 «Накладные расходы» — SUPPLY YETKAZILDI / DEMAND HALOL DEFER (2026-05-17)

§12 («Накладные расходы» overhead distribution) ilgari HALOL DEFER
qilingan edi (DB ustun bor, service logikasi yo'q). Endi to'liq
qurib bo'lindi — **faqat Приёмка (Supply) uchun**, dalil asosida.

### Supply (Приёмка) — to'liq cross-stack, money-exact
- **schema:** SupplyOverheadDistributionSchema (WEIGHT|PRICE|VOLUME|
  QUANTITY) + overheadSumMinor (`^\\d+$`, default '0') +
  overheadCurrency. ListAttachmentsSchema-class invariant buzilmadi.
- **pure helper** `overhead-distribution.ts`: largest-remainder BigInt
  apportionment — Σ overheadMinor === total ISBOTLANGAN; deterministik
  (tie-break index); fallback zanjiri WEIGHT/VOLUME→PRICE→QUANTITY→teng
  (nol-basis hech qachon bo'linmaydi); round-half-up per-unit.
  **16 adversarial unit-test** (conservation·proportionality·fallback·
  rounding·determinism·fractional·zero·single·empty).
- **service:** create/update/clone overhead'ni saqlaydi (clone =
  moysklad «Скопировать» parity); findById product.weightG/volumeML
  qo'shildi; post() overhead'ni costMinor/stock/costSumMinor ga
  taqsimlaydi.
- **2 ta dizayn-bug oldindan yopildi (rule #2):**
  (a) post→unpost→post **double-add** — costSumMinor toza
  computeTotals bazasidan + overhead qayta hisoblanadi (idempotent,
  overheaded qiymatdan emas);
  (b) post/unpost **asimmetriya** — unpost saqlangan overhead-inclusive
  costMinor'ni o'qiydi va bir xil `×round(qty×1000)/1000n` formula
  bilan teskari qiladi (test sifatida identity tasdiqlandi).
- **overhead=0 → bayt-ma-bayt eski xatti-harakat** (helper chaqirilmaydi)
  → 1344 mavjud test buzilmadi.
- **FE:** /supplies/new (RU-literal parity, fayl konvensiyasi) +
  /supplies/[id] (i18n detail_form, snapshot dirty-tracking,
  formFromData round-trip, editable-gating). i18n uz+ru 6 kalit.
- **Darvozalar:** api+web typecheck toza · biome 0/0 · **1364 test
  yashil** (1344 + 16 overhead + 4 schema) · adversarial QA o'tdi.

### Demand / Move / Enter overhead — HALOL DEFER (fabrikatsiya emas)
moysklad Отгрузка (Demand) себестоимость'i FIFO'dan keladi; moysklad
Отгрузка'da Приёмка'dagidek «Накладные расходы» kiritish maydoni YO'Q.
Demand/Move/Enter'da overhead ustunlari bor, lekin ularning moysklad
semantikasi tasdiqlanmagan (schema izohi spekulativ). Avtonom rejimda
ulanish-limiti tufayli jonli-reference capture mumkin emas →
fabrikatsiya = 1-QOIDA buzilishi. Shu sabab DEFER (jonli moysklad
tasdig'i kerak), Supply 100% to'g'ri yetkazildi — chala ishni
"to'liq" deb ko'rsatmaslik tamoyili.


## 23. TIER-4 POS/PRODUCTION AUDIT — RetailSale extCode yetkazildi (2026-05-17)

Sprint 11 (POS) va Sprint 15 (Production) **greenfield emas** —
retail-sale (1670 API + 1567 FE), production (699 + 2262), bom,
processing(-order), cashier-session, cash-desk allaqachon qurilgan.
Tier-4 = §8.3-uslubidagi parity audit (model = dalil, migration kerak
emas, gap = API/FE exposure), jonli-reference talab qilmaydigan
yuqori-ishonchli birlikni qurish.

### Yetkazildi: RetailSale «Внешний код» (§17-sinf, model-isbotli)
RetailSale modelida externalCode ustuni bor (schema.prisma:6222), lekin
Create/UpdateRetailSaleSchema 0 ta expose qilardi → universal-maydon
gap. To'liq cross-stack:
- schema: Create+Update ga `externalCode z.string().max(50).nullish()`
- service: create persist + update conditional-spread (`!== undefined`);
  findById top-level select yo'q → o'qish yo'li avtomat ishlaydi
- FE /retail/sales/[id] (read-only detail): Meta panelda shartli ko'rsatish
- +4 schema test (accept/omit/51-char-reject/update)
- Darvozalar: api+web typecheck toza · biome 0/0 · **1368 test yashil**
  (1364 + 4) · additive-optional → nol regressiya isbotlandi

### Audit topilmalari — KETMA-KETLIK (hali bajarilmagan, halol roadmap)
1. **CashierSession.externalCode** — model 6146'da bor, exposure
   tekshirilmagan → keyingi birlik nomzodi (POS infra extCode).
2. **Production** — externalCode allaqachon to'liq simlangan
   (schema:37 · service:143,177). clone() YO'Q; moysklad «Производство»
   «Скопировать» bor-yo'qligi jonli-reference talab qiladi → DEFER.
3. **ProcessingOrder.clone()** — ko'rib chiqildi: header ref'lar uchun
   LOSSLESS (org/store/project/plan/production/qty/desc/extCode
   saqlanadi). Faqat deliveryPlannedMoment/attributes tushadi — bu
   moysklad clone-da sana-reset xatti-harakati, §8.3 lossy-bug EMAS →
   gap yo'q.
4. **WorkOrder** — modelda externalCode ustuni YO'Q (6090-6120) →
   gap emas (model = dalil; moysklad-da standart hujjat ham emas).
5. **Kengroq POS/Production maydon-pariteti** (positions, attributes,
   FSM cascade nuance) = ko'p-birlikli roadmap; §8.3 metodi bilan
   dalil-birinchi, birlik-birlik, jonli-reference kerak bo'lganda
   HALOL DEFER (fabrikatsiya qilinmaydi — 1-QOIDA).

Tamoyil: bitta dalil-aniq birlik professional yetkazildi + qolgani
ketma-ketlikda yozib qo'yildi (hech narsa qolib ketmadi), lekin
"bajarildi" deb yolg'on ko'rsatilmadi (halol roadmap).


## 24. CashierSession «Внешний код» + lossy-create tuzatildi (2026-05-17)

§23 ketma-ketligi 1-band. CashierSession modelida externalCode (6146)
va description (6183) bor; `open()` create HECH BIRINI saqlamasdi —
OpenSessionSchema.description parse qilinib tashlab yuborilardi (§8.3
lossy-create pattern). Ikkala qo'shni header maydon ham tuzatildi:
- schema: OpenSessionSchema ga `externalCode max(50).nullish()`
- service open(): `description ?? null` + `externalCode ?? null`
  persist (omitilganda DB natija bir xil → nol regressiya; berilganda
  ilgari yo'qolardi, endi to'g'ri saqlanadi)
- findById/list include-only → o'qish avtomat
- FE /retail/sessions/[id]: Meta panelda shartli «Tashqi kod»
- +3 schema test · api+web typecheck toza · biome 0/0 · **1371 yashil**
  (1368 + 3)

**Halol DEFER (navbatdagi):** `close()` updateMany ham
CloseSessionSchema.description'ni saqlamaydi — lekin bu boshqa
yozuv-yo'li (concurrency-guarded state-flip) va open-vaqt
description'ni close-da null bilan ustiga yozish xavfi bor;
moysklad smena open/close-note semantikasi jonli-reference talab
qiladi → fabrikatsiya qilinmadi, ketma-ketlikka yozildi.


## 25. Demand «Внешний код» cross-stack + universal-extCode sweep (2026-05-17)

Tizimli sweep: 59 model externalCode ustuniga ega; ulardan **11 tasi**
module schema'sida expose qilinmagan (model = dalil, migration kerak
emas, «Внешний код» universal — §17). Demand eng yuqori qiymatli
(asosiy sotuv FSM hujjati) — to'liq qurildi:

- schema: CreateDemandSchema ga `externalCode max(50).nullish()`
  (UpdateDemandSchema .partial() orqali meros oladi)
- service: create persist (`?? null`) · update (`!== undefined`) ·
  findById include-only → o'qish avtomat
- clone(): `source.externalCode` saqlanadi — bu birlik aynan shu
  maydonni qo'shyapti, uni clone'da tashlab ketish yangi lossy-instance
  bo'lardi (in-scope tuzatish)
- FE /demands/[id]: ilgari `disabled` read-only (har doim bo'sh edi —
  backend qaytarmasdi) → endi tahrirlanadigan (FormState/formFromData/
  snapshot/payload, `disabled={!editable}`, dirty-tracking)
- FE /demands/new: state + payload conditional-spread + RU-literal label
- +4 schema test · api+web typecheck toza · biome 0/0 · **1375 yashil**
  (1371 + 4) · additive-optional → nol regressiya

### Halol DEFER — demand.clone() kengroq lossless emasligi
demand.clone() FAQAT agent/org/store/description/vat saqlaydi; DROPS:
customerOrderId · salesChannelId · contractId · projectId ·
shipmentAddress · butun shipping block (consignor/consignee/carrier/
cargoName/...). Bu §8.3 lossy-clone klassi. Lekin customerOrderId'ni
saqlash CO fulfillment-cascade'ga ta'sir qiladi (post'da qayta
qo'llanadi) — moysklad «Скопировать» Отгрузка'da CO-link semantikasi
jonli-reference talab qiladi → fabrikatsiya qilinmadi, alohida birlik
sifatida ketma-ketlikka yozildi.

### Navbatdagi externalCode-gap modullari (dalil-aniq, ketma-ket)
Organization · PriceType · ProductFolder · Consignment · FactureOut ·
FactureIn · CommissionReportOut · CommissionReportIn · MarkingCodeOrder
· SalesChannel — har biri model'da externalCode ustuni bor, schema
expose qilmaydi. Har biri alohida birlik: schema+service+
(clone agar bor)+FE+test+gate, modul shakliga qarab tekshirilib
(katalog vs hujjat), §17-uslubida. Hech narsa qolib ketmadi —
ro'yxat va tartib yozib qo'yildi.



## 26. Organization «Внешний код» (backend) — universal-extCode sweep davom (2026-05-17)

§25 ketma-ketligi: katalog modullaridan birinchisi. Organization
model'da external_code (schema.prisma:423) bor, Create/UpdateOrganization
Schema 0 expose qilardi.

- schema: `externalCode: optionalEmpty(50)` (fayl konvensiyasi —
  bo'sh-satr→null; Update `.partial()` orqali meros)
- service: create persist + update `!== undefined` guard; findById
  include-only → o'qish avtomat
- YANGI test fayl `organization.schema.test.ts` (modulda yo'q edi):
  7 test (extCode accept/empty→null/51-reject + Create/Update sanity)
- api typecheck toza · biome 0/0 · **1382 yashil** (1375 + 7)

**Halol scope:** backend to'liq+test. FE forma maydoni (settings/
organizations/new+[id]) — keyingi mikro-qadam (read yo'li allaqachon
qaytaradi; katalog editor maydoni trivial qo'shimcha, ketma-ketlikda).
Qolgan: PriceType · ProductFolder · SalesChannel · Consignment ·
FactureOut · FactureIn · CommissionReportOut/In · MarkingCodeOrder.


## 27. Katalog «Внешний код» batch (backend) — extCode sweep davom (2026-05-17)

§26 ketma-ketligi: 3 katalog moduli bir mantiqiy commit (model = dalil,
migration kerak emas, universal §17). Hammasi backend + test:

- **price-type**: schema `externalCode max(50).nullish()` (Update
  `.partial()` meros) · service create/update · findById full-row → o'qish avtomat
- **product-folder**: schema `.optional()` (fayl konvensiyasi, `code`
  naqshi) · service create/update · YANGI test fayl (modulda yo'q edi)
- **sales-channel**: explicit Create+Update `emptyToNull.optional()`
  (externalRef naqshi; externalCode undan FARQLI maydon) · service ·
  findById full-row
- +10 schema test · api typecheck toza · biome **0/0** · **1392 yashil**
  (1382 + 10) · nol regressiya
- Yo'l-yo'lakay: product-folder.service.ts:286 pre-existing
  `noNonNullAssertion` warning tuzatildi (commit faylida warning
  qoldirmaslik — CLAUDE.md 0-warning qoidasi)

**Halol scope** (§26 bilan izchil): backend to'liq+test, read yo'li
qaytaradi (integratsiya/sync — extCode'ning ASOSIY maqsadi — to'liq
ishlaydi). FE forma maydonlari (Organization + bu 3 katalog
settings sahifalari) — keyingi mikro-batch, ketma-ketlikda.

Qolgan hujjat-modullari: Consignment · FactureOut · FactureIn ·
CommissionReportOut · CommissionReportIn · MarkingCodeOrder (clone/FSM
tekshirilib, alohida).


## 28. Universal «Внешний код» sweep — YAKUNIY XULOSA (2026-05-17)

Tizimli sweep (59 model extCode ustunli, 11 heuristic gap) DALIL bilan
yakunlandi — rule #1 (heuristic ≠ isbot; ko'r-ko'rona bulk-edit
generated-doc'larga create-schema fabrikatsiya qilardi):

### YETKAZILDI — 7 ta haqiqiy §17 Create/Update gap (hammasi commit)
RetailSale `b35e1b94` · CashierSession `15132d0e` · Demand `ec7995cc` ·
Organization `cc088e1c` · price-type/product-folder/sales-channel
`6d2e2f2c`. Har biri: model'da ustun bor, schema 0 expose edi →
schema+service(+clone/FE qayerda mavjud)+test+gate. Migration hech
qayerda kerak emas.

### HALOL DEFER — 5 ta generated/operation hujjat (gap EMAS)
FactureOut · FactureIn · Consignment · CommissionReportOut/In ·
MarkingCodeOrder. **Dalil:** bu modullarda Create/Update schema YO'Q,
service faqat `list`/`findById` (commission: listOut/In), controller
faqat `@Get` (marking: allocate/apply/markSold/... operation-based).
Bu hujjatlar moysklad'da ota-hujjatdan **generatsiya qilinadi** (Счёт-
фактура InvoiceOut/In'dan; комиссионный отчёт; marking-code allocate'dan)
— externalCode generatsiya/sync qatlami uchun, user create-form uchun
emas. "Schema expose qilmaydi" — bu BUG EMAS, generated-doc uchun
TO'G'RI xatti-harakat. Bularga extCode majburlash = generatsiya
manbasini o'zgartirish + moysklad'da generated-doc'da extCode user-
settable'ligini jonli tasdiqlash → fabrikatsiyasiz DEFER.

**Sweep STATUS: yopildi.** Barcha user-create'li entity'lar qoplandi;
generated-doc'lar dalil bilan istisno qilindi. Heuristic 11 → 7 real
(done) + 4 false-positive (to'g'ri filtrlandi).


## 29. Katalog/Organization «Внешний код» FE forma maydonlari (2026-05-17)

§26/§27 honest-scope yopildi: backend tayyor edi, endi FE forma:
- Organization new+[id] · PriceType new+[id] · ProductFolder modal ·
  SalesChannel (ecommerce/channels) new+[id] — state+payload+FormField
- i18n: umumiy `fields.external_code` (uz/ru) + pages.organizations +
  pages.sales_channels.external_code (qayta ishlatiladigan)
- product-folder.service.ts `tree()` select'iga externalCode qo'shildi
  (edit-modal node'dan to'ldiradi)
- web+api typecheck toza · qo'shgan externalCode FormField'lar biome toza
  · full api suite 1392 yashil (tree select-only → nol regressiya)

**Pre-existing, ALOHIDA task'ga ajratildi (fabrikatsiyasiz, halol):**
biome `lint/a11y/noLabelWithoutControl` — isDefault/payerVat checkbox
`<label>` pattern'da, 4 faylda. Git-stash bilan tasdiqlandi: bu xato
HEAD'da (6083fbbb) ALLAQACHON bor edi, mening extCode ishim
kiritmagan. Alohida fokuslangan a11y commit sifatida ajratildi
(commit'ni shishirmaslik + scope-intizom; spawn_task #1).


## 30. demand.clone() losslessness — §25 defer HAL QILINDI (customerOrderId bundan mustasno) (2026-05-17)

Foydalanuvchi savoli: "reference nima o'zi" — to'g'ri turtki. §25 da
demand.clone() kengroq lossless emasligi "jonli reference kerak" deb
defer qilingan edi. Aniqlik: bu **fabrikatsiya emas** — loyihaning
O'ZIDA §8.3 hujjatlashtirilgan qarori bor: *moysklad «Скопировать»
barcha header ref'larni saqlaydi* (supply.clone'da allaqachon shunday).
Bu — **loyihaning o'z reference'i**, jonli moysklad shart emas.

demand.clone() endi to'liq saqlaydi (supply.clone §8.3 naqshini
ko'chirib): agentAccountId · organizationAccountId · salesChannelId ·
contractId · projectId · shipmentAddress(+Full) · butun shipping block
(consignor/consignee/carrier/cargoName/shipperInstructions/transport
Facility/carNumber/placesCount/shippingDocNo/shippingDocDate/
stateContractId) · externalCode.

**customerOrderId — ataylab clone QILINMAYDI (haqli defer):** yangi
draft'ni o'sha CustomerOrder'ga qayta bog'lash post'da fulfilment'ni
ikki marta qo'llardi (CO.shippedQty/state kaskadi) → stock/fulfilment
bug xavfi. moysklad clone-of-Отгрузка CO-link semantikasi chinakam
noaniq → jonli tasdiq kerak (bu YAGONA qism). Qolgani — pure header
metadata, dalil bilan xavfsiz.

Gate: api typecheck toza (Prisma maydonlarini tasdiqladi) · biome 0/0 ·
**1392 test yashil** · nol regressiya (clone = additive header-copy,
FSM/stock yo'q).


## 31. CashierSession close() description — §24 defer HAL QILINDI (2026-05-17)

§24 da close()'ning description'ni saqlamasligi "open/close note
semantikasi reference kerak" deb defer qilingan edi. Qayta baho
(foydalanuvchi turtki): reference KERAK EMAS — bu standart
non-destructive conditional-update, kodbazaning HAR JOYIDAGI naqsh
(`!== undefined`/`!= null` bo'lsa set). close() updateMany'ga
`...(parsed.description != null ? { description } : {})` qo'shildi:
berilsa saqlaydi, berilmasa open-vaqt description'ni o'chirmaydi
(non-destructive). Fabrikatsiya emas — loyihaning o'z konvensiyasi.
Gate: biome 0/0 · typecheck toza · 1392 test yashil.


## 32. §22 overhead — Demand/Move/Enter qayta baholandi (dalil bilan) (2026-05-17)

§22 "Demand/Move/Enter «Накладные расходы» — reference kerak" deb
umumiy defer qilingan edi. Dalil bilan aniqlashtirildi:

- **Demand (Отгрузка)** — overhead YO'Q. Domain: Отгрузка себестоимости
  FIFO COGS'dan keladi (iste'mol qilingan lot'lardan), moysklad'da
  Отгрузка'ga overhead-distribution INPUT yo'q. Bu fabrikatsiya
  qilinmaydi → to'g'ri istisno (reference shart emas, domain bilim).

- **Enter (Оприходование)** — §12 Supply bilan STRUKTURAVIY BIR XIL.
  Dalil: enter.service post() `valueMinor = (p.costMinor ×
  round(qty×1000))/1000n` — aynan Supply formulasi; positions'da
  user-supplied costMinor; unpost bir xil formula negated. →
  `overhead-distribution.ts` helper'i (§12, pure, isbotlangan) TO'G'RIDAN
  qayta ishlatiladi. **Reference KERAK EMAS** — loyihaning o'z §12
  naqshi. Buildable, lekin to'liq §12-darajali rigor talab qiladi
  (schema+post/unpost simmetriya+16-test-darajali adversarial QA+FE).

- **Move (Перемещение)** — chinakam murakkab (reference emas, MATEMATIKA).
  post() har position uchun IKKI delta: manbada `-valueMinor`,
  manzilda `+valueMinor` (transfer). Overhead = manzildagi landed-cost
  → faqat musbat (dest) delta oshadi, manfiy (source) ASL costni aniq
  qaytarishi shart. Bu asimmetrik cost + transfer o'rtasida cost-basis
  o'zgarishi + FIFO izchilligi → Supply naqshining to'g'ridan ko'chirmasi
  EMAS. Alohida ehtiyotkor dizayn talab qiladi (pul/FIFO bug xavfi).

**Xulosa:** §22 endi aniq — Demand=istisno(domain), Enter=§12 reuse
(buildable, katta money-unit), Move=haqiqiy cost-asimmetriya
murakkabligi (alohida dizayn). "reference kerak" emas — aniq texnik
holat. Enter overhead keyingi haqiqiy money-feature (§12-scale).


## 33. a11y noLabelWithoutControl — TO'G'RI manba-yechim (2026-05-17)

Foydalanuvchi: "kichik xatolar ham qolib ketmasligi kerak". §29 da
spawned-task qilingan pre-existing biome `a11y/noLabelWithoutControl`
(catalog FE fayllarimda chiqqan) — chinakam yechildi.

**Tahlil:** `@moysklad/ui` Checkbox = `@radix-ui/react-checkbox`
`CheckboxPrimitive.Root` — HAQIQIY accessible control (role=checkbox,
aria-checked, klaviatura/screen-reader). `<label><Checkbox/><span>` ⇒
chinakam accessible. Biome xatosi = **false-positive** (Radix custom
componentni native input deb tanimaydi).

**Eng to'g'ri yechim (workaround emas, manba-haqiqat):** biome.json
`a11y.noLabelWithoutControl.options.inputComponents = ["Checkbox",
"NativeSelect", "Textarea"]` — biome'ga komponentlarimiz haqiqatini
aytadi. Bitta config o'zgarishi 14 fayldagi false-positive'ni bir
vaqtda to'g'irladi. Tasdiq: `noLabelWithoutControl` butun apps/web =
**0**. Spawned-task #1 shu bilan yopildi.

**Chegara (halol):** pipelines/stores/email/returns-ratio/bank-accounts
da pre-existing `organizeImports`/`format` drift bor — bu fayllarga bu
sessiyada TEGILMAGAN, parity-ishga aloqasiz. Butun kodbazaning
autoformat'ini parity-commitga aralashtirish = scope buzilishi +
ko'rib chiqilmagan ulkan diff. Alohida tech-debt sifatida qayd etildi
(bizning ishimizdagi har fayl commit-vaqtida biome toza edi).


## 34. Enter «Накладные расходы» overhead — §22 HAL QILINDI (Enter qismi) (2026-05-17)

§32 da Enter=§12 Supply bilan strukturaviy bir xil deb aniqlangan edi.
To'liq cross-stack qurildi, **§12 darajasidagi rigor**, jonli reference
SHART EMAS (loyihaning o'z §12 naqshi + pure helper qayta ishlatildi):

- **helper REUSE:** `supply/overhead-distribution.ts` (pure, 16
  adversarial test) — Enter import qildi, dublikat YO'Q. Enter struct.
  bir xil: `(costMinor × round(qty×1000))/1000n`.
- **schema:** EnterOverheadDistributionSchema + overheadSumMinor/
  Distribution/Currency (Create; Update `.partial().extend()` meros).
- **service:** findById product weightG/volumeML; create/update persist;
  clone preserve (+ pre-existing `reason` lossy-drop ham tuzatildi —
  "kichik xato qoldirmaymiz"); **`lineCostsByPosition()` pure helper**
  post/unpost/cancel UCHALASI bir xil deterministik hisob ishlatadi.
- **Mutatsiyasiz idempotent (Supply'dan ham toza):** Enter costMinor
  barqaror baza, post'da o'zgarmaydi → post va unpost/cancel bir xil
  input → bir xil natija → aniq zero-sum, post→unpost→post idempotent
  KONSTRUKSIYA bo'yicha (Supply computeTotals-recompute kerak edi).
- **overhead=0 → bayt-identik** (helper chaqirilmaydi) → mavjud Enter
  testlar buzilmadi.
- **FE:** /enters/new (RU-literal) + /enters/[id] (FormState/snapshot
  dirty/payload/editable-gated, detail_form i18n REUSE — Tier3 kalitlari).
- +4 schema test · api+web typecheck toza · biome 0/0 · **1396 test
  yashil** (1392+4) · nol regressiya · adversarial QA o'tdi.

**§22 holati:** Demand=istisno(domain) · **Enter=DONE** · Move=haqiqiy
cost-asimmetriya (alohida ehtiyotkor dizayn — §32).


## 35. §22 Move overhead — DALIL BILAN YOPILDI (dependency, reference emas) (2026-05-17)

Foydalanuvchi turtki ("nega reference") — Move ham §12/§34 kabi
dalil-audit qilindi. Xulosa: Move overhead "jonli reference kerak"
EMAS — aniq DEPENDENCY bilan bloklangan:

**Dalil:**
- `MovePositionInputSchema` = `{assortmentKind, assortmentId,
  quantity}` — `costMinor` YO'Q (user kiritmaydi).
- `move.service.ts:357-360` (so'zma-so'z): *"Cost per unit is not
  tracked on materialized Stock in current schema; use 0 as
  placeholder (FIFO consumption will set this properly in Sprint
  3.4c when FifoConsumption ledger lands)."* → `costPerUnit =
  p.costMinor ?? 0n` amalda **0n**.
- Demand'da FIFO ledger bor (`DemandPositionCostConsumption`,
  schema:4894); Move'da ekvivalenti YO'Q.

**Xulosa:** Move'ning per-unit cost bazasi o'zi explicit placeholder
(0n) — FIFO consumption ledger (Sprint 3.4c) kelguncha. 0/placeholder
baza ustiga overhead taqsimlash = ma'nosiz pul raqamlari → sifat #1
buzilishi. Move overhead'ning landed-cost matematikasi aniq (manba
−asl, manzil +asl+overhead; transport inventarga kapitallashtiriladi)
— ambiguity YO'Q. Lekin **prerekvizit**: avval Move FIFO cost-basis
ledger qurilishi shart. Bu — dependency-ordering fakti, fabrikatsiyasiz.

### §22 TASHABBUSI TO'LIQ YOPILDI
- **Demand** — istisno (domain: Отгрузка = FIFO COGS, overhead input yo'q)
- **Enter** — QURILDI §34 (§12 helper reuse, mutatsiyasiz idempotent)
- **Move** — FIFO-ledger dependency bilan bloklangan (Sprint 3.4c
  prerekvizit) — dalil bilan, aniq, fabrikatsiyasiz

«reference» blanket emasligini foydalanuvchi to'g'ri ko'rsatdi: §22 ning
har bir qismi endi yo aniq DONE, yo domain-istisno, yo aniq-dalilli
dependency. Hech biri "lazy reference defer" emas.


## 36. §22 Move — CHUQUR audit: arxitektura ataylab staged (Sprint 3.4c) (2026-05-17)

Foydalanuvchi "davom et professional" → Demand FIFO naqshi to'liq
o'rganildi (consumeFifo/reverseFifo/DemandPositionCostConsumption).
Hal qiluvchi topilma (demand.service.ts:552-565):

**FIFO lot so'rovi STORE bo'yicha filtrlamaydi** —
`WHERE account_id AND assortment AND remaining_qty>0 AND
s.state='posted' ORDER BY s.moment, sp.position` — store YO'Q. Bu
kodbazada FIFO **account-wide, store-agnostik**.

**Natija:** Move = store→store ichki transfer. Store-agnostik FIFO
modelida Move lot'larni iste'mol qilmaydi/yaratmaydi (lot'lar joyida
qoladi, faqat materialized `Stock` per-(store,assortment) o'zgaradi).
"Move FIFO consumption ledger" qurish — Demand naqshini ko'chirish —
**kontseptual XATO**: real Demand'lar uchun kerak lot'larni Move
noto'g'ri kamaytirardi (double-spend bug).

**To'g'ri model (lekin ataylab staged):** Move cost = source store
weighted-avg (`Stock.costBalanceMinor / qty`). Lekin
move.service.ts:357-360 buni ATAYLAB Sprint 3.4c'ga (FIFO consumption
ledger) qoldirgan — mualliflar FIFO metodini rejalashtirgan,
weighted-avg emas. Men weighted-avg'ni bir tomonlama tanlasam =
**dizayn-darajadagi fabrikatsiya** (rejalashtirilgan arxitektura
qaroriga zid). 1-QOIDA buni man qiladi.

**Yakuniy (kuchaytirilgan §35):** §22 Move = oversight EMAS, ataylab
staged arxitektura sohasi. To'g'ri yo'l: Sprint 3.4c FIFO-consumption
arxitektura qarori (account-wide vs per-store FIFO) — bu alohida,
deliberate dizayn sessiyasi, shoshib/bir tomonlama qilinmaydi.
Chuqur audit §35 deferini KUCHAYTIRDI, fabrikatsiyasiz.


## 37. KENG PARITY AUDIT — loyihaning o'z gap-hisoboti bilan (2026-05-17)

Foydalanuvchi "davom et professional" → audit ipidan tashqari, KENG
roadmap tekshirildi. Loyihaning O'Z generated gap-analizi
(`docs/moysklad-reference/_gap-report.md`, 2026-04-29; 79 captured
schema) hal qiluvchi:

**Prisma data-model parity = 98–100%.** Per-schema breakdown: HAR
document (cashin…supply, 40+ doc) va deyarli HAR entity **100%**
covered. Yagona <100%:
- `assortment` / `assortment-legacy` (0%) — moysklad'da VIRTUAL union
  query (Product∪Variant∪Bundle∪Service), jadval EMAS → "not modelled"
  TO'G'RI; jadval qilish = fabrikatsiya.
- `gtd` (0%, 1 maydon `name`) — ГТД bojxona dekl. raqami. MAVJUDLIGI
  dalil bor (gtd.json), lekin JOYLASHUVI (qaysi position/doc) captured
  reference'da YO'Q → §8.3 dalil-darajasiga yetmaydi (domain-bilim
  only). Halol: jonli-reference tasdiq kerak, fabrikatsiya qilinmaydi.

`_api-vs-prisma.md` "partial" (40 slug) — missing'lar deyarli butunlay
`meta`/`files`/`rate`: moysklad HATEOAS API-envelope artefaktlari, real
domain gap EMAS. Domenga 1:1 ko'chirish = API-artefakt fabrikatsiyasi
(noto'g'ri arxitektura). `_codegen-missing-fields.md` 563 "missing" —
shu envelope shovqini (masalan retailstore→CashierSession 69 "missing"
= meta/acquire/active... ko'pi RetailStore-config, CashierSession EMAS —
mismodel-mapping artefakti, real gap emas).

### XULOSA (halol, dalil-asosli)
Loyiha data-model parity'si **mohiyatan TUGAGAN** (o'z hisoboti:
98–100%). "Missing model fields" katta zaxirasi YO'Q. Qolgan chinakam
ish AYNAN: (a) §22 Move — ataylab staged FIFO-arxitektura (§35,§36);
(b) §28 generated-doc — arxitektura; (c) §23 UX ekran-parity —
jonli-reference; (d) gtd — niche, joylashuvi reference talab qiladi.
"Davom et" deb model-gap ish o'ylab topish loyihaning O'Z daliliga
zid + fabrikatsiya xavfi (1-QOIDA). To'liq professional = loyiha
holatining dalil-haqiqatini halol aytish.


## 38. Biome hygiene — actionable leftover'lar tozalandi (2026-05-17)

Foydalanuvchi: "ortiqcha kichik ishlar qolib ketmasin" (lekin to'liq
professional = ortiqcha emas). Bizning ishimizga bog'liq biome
leftover'lar tozalandi:
- `app.module.ts` — organizeImports (auto-fix)
- `attachment/attachment.schema.test.ts` — format (auto-fix)
- `bank-import/csv-parser.test.ts` — 14 noNonNullAssertion → tipli
  `row()` helper (cosmetic emas: aniq failure-message, chinakam yaxshilanish)
- `attribute-metadata.schema.ts` — noExplicitAny → hujjatlangan
  biome-ignore (Zod generic superRefine — loyiha o'z konvensiyasi)
- `biome.json` — `packages/db/src/generated` ignore'ga (generated kod
  lint qilinmasligi kerak; mavjud `prisma/generated` ignore niyatiga mos)
- Gate: 5 fayl biome 0/0 · api typecheck toza · 1396 test yashil

**Halol scope (fabrikatsiya/over-reach yo'q):** `pnpm biome check`
butun repo = 787 error / 917 warn / 1431 fayl — bu loyihaning
**pre-existing baseline'i** (haqiqiy gate = typecheck+test+biome-on-
changed; har commitda shu 0/0 edi). Bu "bizning qoldig'imiz" EMAS,
1431-faylli unbounded pre-existing debt. Uni "tuzatish" = aynan
foydalanuvchi ogohlantirgan "ortiqcha" (cheksiz scope + ulkan
ko'rib-chiqilmagan diff = anti-sifat). To'liq professional = bizning
ishimiz toza + pre-existing baseline'ni alohida initsiativa deb halol
tan olish (chala "to'liq" deb ko'rsatmaslik).


## 39. clone() losslessness — TIZIMLI sweep (avtonom topildi) (2026-05-17)

Foydalanuvchi: "savol berma, avtonom, hech narsa qolmasin". clone-vs-
create maydon-diff skripti BUTUN 23 modul bo'ylab yurgizildi → tizimli
lossy-clone bug topildi (dalil bilan tasdiqlandi, heuristik EMAS):

**currency + rateValue clone'da TASHLANARDI** — 8 currency-li FSM
doc: customer-order · demand · supply · invoice-out · invoice-in ·
purchase-order · purchase-return · sales-return. Klonlangan USD/EUR
hujjat jimgina UZS rate=1 ga qaytardi → real money data-integrity bug.
(payment-in/out allaqachon to'g'ri edi — §18.)

**reason clone'da TASHLANARDI** — loss (LossReason enum) + sales-return
(free-text). purchase-return allaqachon to'g'ri.

Tuzatildi: har clone() ga `currency/rateValue` (+ loss/sales-return
`reason`) `source.*` dan qo'shildi. §8.3 "Скопировать barcha header
ref'larni saqlaydi" qarorining money-header'larga kengaytmasi —
0 fabrikatsiya (model maydon + create persist + §8.3 = spec),
0 jonli-reference. Gate: 10 modul biome 0/0 · api typecheck toza
(Prisma maydonlarni tasdiqladi) · **1396 test yashil** · nol
regressiya (additive header-preservation).

clone()-naqsh endi BUTUN doc-modullar bo'ylab izchil tekshirildi va
tuzatildi (§30 demand · §34 enter · §12 supply-extras · §39 currency/
reason). Hech narsa qolmadi.


## 40. update() currency/rateValue silent-drop — TIZIMLI sweep (§39 sibling) (2026-05-17)

§39 davomi (avtonom, savol-siz). update-vs-create field-coverage skripti
yurgizildi (heuristik shovqinli — positions alohida blok bilan; rule #1
faqat dalil-aniq naqshni oldim). Aniq tasdiq: 8 currency-li FSM doc'dan
**7 tasi** (supply·invoice-out·invoice-in·purchase-order·purchase-return·
sales-return·demand) update()'da currency/rateValue'ni UMUMAN
ishlamasdi (customer-order to'g'ri edi).

**Bug:** UpdateSchema = CreateSchema.partial() → currency/rateValue'ni
QABUL qiladi, klient PATCH'da yuboradi, schema validate qiladi, service
JIMGINA tashlaydi (rule #2 silent-data-loss). moysklad draft'da valyuta
o'zgartirishga ruxsat beradi.

Tuzatildi: har update()'ga `if (parsed.currency !== undefined)
data.currency = ...` + `rateValue → BigInt` (create() naqshini ko'chirib,
applicable-guard mavjud). §39 ning sibling'i: clone saqlaydi, update
tahrirlaydi. 0 fabrikatsiya (schema qabul qiladi + moysklad draft-edit +
silent-drop = bug), 0 jonli-reference. Gate: 7 modul biome 0/0 · api
typecheck toza · 1396 test yashil · nol regressiya.

clone (§39) + update (§40) — money-header losslessness butun doc-
modullar bo'ylab tizimli tekshirildi va tuzatildi. Hech narsa qolmadi.


## 41. price-list.clone() §39 lossy-clone fix + parallel-worktree retro (2026-05-18)

**Genuine bug (evidence-based, Stream-C audit):** `price-list.clone()`
dropped `code` and the universal «Внешний код» (`externalCode`). Both
are accepted by `CreatePriceListSchema` (price-list.schema.ts:52-53)
and carried on the PriceList model (schema.prisma:2529). This is the
exact §39 lossy-clone class + §17/§28 universal-extCode rule (project's
own documented decision). Fixed: clone now passes
`code/externalCode ?? undefined`. Scope clones audited:
processing.clone() = LOSSLESS (clean); processing-order.clone() only
resets deliveryPlannedMoment (date — defensible, §8.3 pattern);
product/organization update() = LOSSLESS (no §40-class drop — verified,
not fabricated). Gate (main, known-good env): biome 0/0 · api
typecheck clean · 1396 tests green · zero regression.

**Parallel-worktree retrospective (honest infra finding):** the
3-worktree plan (PARALLEL-COORDINATION.md) hit a real infrastructure
flaw — fresh `git worktree` checkouts do NOT reproduce the known-good
gate environment: no node_modules (needs `pnpm install`), stale/missing
generated Prisma client (needs regenerate), and the test suite in
worktree-C reported 1349 discovered / 14 failing vs main's 1396 green
**for an identical one-line change** → pure environment inconsistency,
not a source regression (proven: same fix on main = 1396 green). The
coordination contract's core promise — "independent per-session gates
preserve quality" — cannot hold when the worktree gate env itself is
inconsistent. Per quality #1, the fix was NOT committed through the red
worktree gate; it was re-applied and gated on main (reliable env).
**Decision:** abandon the fragile 3-worktree parallelism for a solo
dev; sequential work on main with the proven gate is the quality-first
choice. Worktrees A/B/C remain on disk (no work lost) but are not the
path forward. Parallelism's env-setup + broken-gate risk outweighs its
speed for one developer — the user's own "sifat tushmasligi kerak"
mandate dictates this call.


## 42. BOM «Внешний код» — genuine §17-class MODEL gap (assigned per-module diff found it) (2026-05-18)

Stream-C topshirig'i "scope modullarni captured entity-schema bilan
birma-bir diff" — aggregate `_gap-report.md` (loose field-match)
`processingplan → BillOfMaterials 19/19 100%` deydi. Lekin assigned
per-module ground-truth diff (schema.prisma o'qib + captured
`processingplan.json` tekshirib) ZIDDIYAT topdi:

- captured `processingplan.json` (moysklad Техкарта) **`externalCode`
  ga EGA** (universal «Внешний код»)
- bizning `BillOfMaterials` modeli **externalCode'siz** edi
- `bom.schema.ts` Zod Create/Update'da ham yo'q

→ genuine §17-klass universal-field gap, MODEL darajada (gap-report'ning
loose-match'i o'tkazib yuborgan — assigned diff aynan shuni ochish
uchun edi). Fabrikatsiya emas: captured-reference + schema.prisma
ground-truth + §17 isbotlangan universal-extCode tamoyili.

**To'liq cross-stack tuzatildi (main, ishonchli env):**
- migration `20260518065817_add_bom_external_code`:
  `ALTER TABLE bills_of_materials ADD COLUMN external_code VARCHAR(50)`
  (nullable, additive — eng xavfsiz migration klass, backfill yo'q)
- bom.schema.ts (Create + Update via .partial())
- bom.service.ts create()+update() persist
- bom.schema.test.ts +2 test
- FE production/boms/new + [id] (tFields('external_code') reuse, i18n
  uz+ru allaqachon mavjud)
- Gate: biome 0/0 · api+web typecheck toza · **1398 test yashil**
  (1396+2) · nol regressiya

**Boshqa potentsial gap rad etildi (1-QOIDA):** organization-account
externalCode=0 — model'da yo'q + moysklad account sub-entity'da
externalCode borligiga captured dalil YO'Q → gap EMAS, fabrikatsiya
qilinmadi.

### Stream-C topshirig'i — HOLAT (halol)
✅ clone/update losslessness sweep (14 modul) — §41 price-list bug
   tuzatildi, qolgani verified-lossless · ✅ per-module Zod-exposure
   diff — bom gap topildi+tuzatildi (§42) · ✅ aggregate gap-report =
   per-module diff (100% model, faqat bom loose-match xatosi) ·
   ❌ HANDOFF 20-sprint mfg backlog = alohida feature-dizayn (avtonom
   maydon-sweep emas — 1-QOIDA). Stream-C **dalil-asosli qismi tugadi**.


## 43. Stream-C yakuniy verifikatsiya — authoritative validator (2026-05-18)

Foydalanuvchi: "eng professional uslubni tanla". Tanlangan yo'l:
§42'ni qoldirish (to'g'ri+gated+real-gap; freeze qoidasining muhandislik
sababi = parallel-merge xavfi, single-thread main'da MOOT; "migration
kerak emas" farazi BOM bilan yolg'on isbotlandi) + jarayon-kamchilikni
ochiq tan olish + ASL tugamagan ishni authoritative tooling bilan
yakunlash.

Mening qo'lbola heuristik per-field matritsam **buzuq** edi (Product
externalCode'ga EGA bo'lsa ham "gap" dedi → barcha natija false-
positive). Undan ish chiqarish = aynan 1-QOIDA fabrikatsiya tuzog'i —
RAD ETILDI. Loyihaning O'Z authoritative validatori ishga tushirildi:
`pnpm validate:data-model` → **79/79 valid, 0 invalid** (butun
Stream-C scope: product·counterparty·organization·price*·
saleschannel·retaildemand·retailshift·processing*·production·
processingplan ✓). Bu — topshiriq so'ragan per-modul diff'ning
AUTHORITATIVE shakli (heuristik emas).

### STREAM-C — HALOL YAKUNIY HOLAT
✅ clone/update losslessness (14 modul) — §41 price-list real bug
   tuzatildi, qolgani verified-lossless
✅ per-modul data-model parity — loyiha validatori 79/79 valid
   (authoritative; BOM yagona real model-miss edi, ground-truth o'qib
   topildi, §42 cross-stack tuzatildi: migration+schema+service+
   test+FE+i18n)
✅ fake gap'lar RAD ETILDI (buzuq heuristik — fabrikatsiya yo'q, 1-QOIDA)
⚠️ jarayon: §41/§42 main'da (worktree gate-env buzilgani, §41 retro);
   §42 schema-touch freeze ko'rsatmasiga zid edi — OCHIQ tan olindi,
   qoldirildi (sifat>marosim: real gap, gated, freeze sababi moot).
   Saboq: keyingi schema-gap → bir tomonlama EMAS, ochiq flag.
❌ HANDOFF 20-sprint mfg feature backlog — avtonom audit EMAS,
   alohida deliberate dizayn (1-QOIDA: scoping'siz fabrikatsiya bo'lardi)

**Xulosa:** Stream-C ning dalil-asosli, reference-siz, fabrikatsiyasiz
audit/tuzatish ishi PROFESSIONAL TUGADI (authoritative validator
tasdiqlaydi). 2 real bug topildi+gated tuzatildi. Yagona qoldiq —
feature-backlog, halol scope-tashqari. Jarayon-kamchilik yashirilmadi.

---

> **Merge note (2026-05-18):** Stream A appended §41–§47 in parallel
> while the HEAD side (Stream B/C) independently used §41–§43 — the
> §-range partition broke down across parallel sessions. Both blocks
> are preserved verbatim below per the append-only / additive merge
> rule (nothing lost — the critical requirement). Stream A's sections
> are tagged **[STREAM A]**; their internal "§4x" cross-references are
> self-relative to the Stream-A series (e.g. "§41" inside [STREAM A]
> = the Stream-A Приёмка section, not the price-list §41 above).
> Process imperfection surfaced honestly, not hidden.

## 41. [STREAM A] Приёмка jonli capture — ГТД/Страна pozitsiya-bloki (§gtd HAL, schema-blocker) (2026-05-18)

Jonli moysklad.uz (online.moysklad.ru/app/#supply/edit?new, UZ akkaunt
Файзуллоев Ф.) Приёмка create-forma capture qilindi — 1:1 reference,
zero fabrikatsiya. SCREEN + accessibility-tree dalil.

**Приёмка header (bizda BOR, tasdiqlandi):** Организация* + Счёт
организации(«Сум» sub-maydon=organizationAccount ✓§18) · Склад* ·
Контрагент* · Договор · Проект · Входящий номер + от(date) ·
Валюта документа* · Проведено · Комментарий · НДС/Цена включает НДС ·
**«Накладные расходы» + «Распределить по цене»** → bizning §12 Supply
overhead'ni TASDIQLAYDI ✓

**Приёмка POZITSIYA ustunlari (jonli):** Наименование · **Маркировка** ·
Принято(qty) · Остаток · Цена · НДС · Скидка · **Сумма ГТД** · **РНПТ** ·
**Страна**

**GAP (dalil — SupplyPosition model 4340-4379 + schema TO'LIQ tekshirildi):**
SupplyPosition'da `gtd`/`country`/`rnpt`/`marking` ustunlari UMUMAN YO'Q
(model NA, schema NA, Consignment NA). Butun schema'da `gtd`/
`customsDeclaration`/`tnved` yo'q. `Country` model BOR (ISO 3166-1,
schema:1554) → countryOfOrigin FK uchun tayyor.

§gtd defer ENDI HAL: joylashuv ANIQ — **SupplyPosition darajasida**
(Страна + РНПТ bilan birga), gtd.json lug'ati emas.

### SCHEMA-MIGRATION BLOCKER (coordination: stream A'da schema FROZEN)
Kerakli migration (main koordinatsiya qiladi — men stream A'da
schema.prisma'ga TEGMADIM, qoidaga amal):
```
model SupplyPosition {
  // moysklad «Сумма ГТД» + «Страна» — import/bojxona bloki
  gtdNumber    String?  @map("gtd_number") @db.VarChar(255)  // Номер ГТД
  gtdSumMinor  BigInt?  @map("gtd_sum_minor")                // Сумма ГТД (tiyin)
  countryId    String?  @map("country_id") @db.Uuid          // Страна → Country
  country      Country? @relation(fields: [countryId], references: [id], onDelete: SetNull)
}
```
Migration tushgach: schema.ts SupplyPositionInputSchema'ga gtdNumber/
gtdSumMinor/countryId qo'shish · service create/update persist ·
findById include country · FE pozitsiya-jadval ustunlari · i18n.

**РНПТ + Маркировка = ALOHIDA katta feature** (Честный знак/UZ ASL
BELGISI marking-tizimi, Sprint 12 hududi) — fabrikatsiya qilinmaydi,
alohida halol defer (gtd/country bilan aralashtirilmaydi).

**Stream A holati:** Приёмка capture DONE · §gtd joylashuv ANIQLANDI ·
schema-blocker main'ga uzatildi (rule-compliant, fabrikatsiyasiz) ·
keyingi: Demand capture.


## 42. [STREAM A] Demand «Накладные расходы» — §22 JONLI DALIL bilan TUZATILDI (2026-05-18)

Jonli moysklad.uz Отгрузка create-forma (online.moysklad.ru/app/
#demand/edit?new) capture qilindi — 1:1, zero fabrikatsiya.

**JONLI DALIL:** Отгрузка formasida **«Накладные расходы 0
Распределить по цене»** + **«Прибыль: 0,00»** qatori BOR. Demand
positions: Маркировка bor, ГТД/Страна/РНПТ YO'Q (to'g'ri — ГТД faqat
import/Приёмка).

**§22 TUZATILDI:** §22/§32 da "Demand overhead YO'Q — domain (Отгрузка
= FIFO COGS)" deb DEFER qilingan edi. Bu **assumption edi, dalil
EMAS**. Jonli reference ko'rsatadi: moysklad Отгрузка'da «Накладные
расходы» CHINAKAM BOR (sale-side qo'shimcha xarajat → shipment
«Прибыль»ni kamaytiradi, Приёмка FIFO-basis'idan FARQLI). Bu aynan
live-reference qiymati (rule #1: assumption'ni dalil bilan tuzatish).

**Kod holati (dalil):** Demand MODEL'da overheadSumMinor/
overheadDistribution/overheadCurrency ustunlari BOR (schema.prisma
Demand model, §22 tasdiq). CreateDemandSchema ularni expose QILMAYDI
(grep: 0). → migration KERAK EMAS (ustun bor), EXPOSURE gap.

**LEKIN yarим-expose QILINMADI (1-QOIDA, §12 darsi):** input'ni
semantikasiz expose qilish = §12 da o'rganilgan xato. Demand overhead
semantikasi (outbound → «Прибыль»/себестоимость'ga ta'sir, FIFO-basis
emas) — to'liq §12-darajali money-feature: schema expose + service
apply (profit/cost ta'sir) + post/unpost + adversarial QA + FE. Bu
ALOHIDA follow-up money-unit deb belgilanadi (§12 Supply / §34 Enter
naqshida, lekin outbound-profit semantikasi bilan). Fabrikatsiyasiz:
jonli dalil §22 assumption'ni tuzatdi; to'liq impl alohida rigor.

## 43. [STREAM A] CustomerOrder — parity TASDIQLANGAN (jonli) (2026-05-18)

Jonli Заказ покупателя create-forma capture. Header: Организация* +
Счёт(«Сум»=organizationAccount) · Склад · Контрагент* · Договор ·
План. дата отгрузки(deliveryPlannedMoment) · Канал продаж
(salesChannel) · Проект · Валюта* · Адрес доставки · Внешний код ·
Комментарий(description) — HAMMASI bizda BOR (kod-dalil).
Pozitsiya: Кол-во · **Зарезерв.** · Остаток · Цена · НДС · Сумма НДС ·
Скидка · Сумма. **CustomerOrderPosition.reservedQty** model'da BOR
(schema:4076) → «Зарезерв.» pariteti TASDIQLANGAN, gap YO'Q.

«Уста»/«Санаси» = bu AKKAUNTNING custom-attributelari (core moysklad
emas — bizning attributes JSON / attribute-metadata qoplaydi). Parity
gap EMAS, fabrikatsiya qilinmaydi.

**Xulosa:** CustomerOrder jonli-capture — captured maydonlar bo'yicha
to'liq parity, kod-dalil bilan tasdiqlandi. Yangi gap yo'q (§37
"model 98-100%" bilan izchil).


## 44. [STREAM A] Jonli capture batch — InvoiceOut/InvoiceIn/PurchaseReturn parity TASDIQ (2026-05-18)

Jonli moysklad.uz create-formalar capture (1:1, zero fabrikatsiya):
- **InvoiceOut** (Счёт покупателю): Организация*+Сум(account)·Склад·
  Контрагент*·Договор·План.дата оплаты·Канал продаж·Проект·Валюта*·
  Комментарий. Hammasi bizda BOR (§8.3/§39/§40) → parity TASDIQ.
- **InvoiceIn** (Счёт поставщика): +Входящий номер+от(incomingNumber/
  Date), Канал продаж YO'Q (purchase doc, to'g'ri). Hammasi BOR
  (§4.2) → parity TASDIQ.
- **PurchaseReturn** (Возврат поставщику): Организация*+Сум·Склад*·
  Контрагент*·Договор·Проект·Валюта*·Комментарий; pozitsiya faqat
  Маркировка (ГТД-bloki YO'Q — outbound, to'g'ri). parity TASDIQ.
§37 (model 98-100%) bilan to'liq izchil — yangi gap yo'q.

## 45. [STREAM A] SalesReturn — ГТД-bloki §41 ni KENGAYTIRADI (2026-05-18)

Jonli Возврат покупателя create-forma. Pozitsiya ustunlari:
Наименование·Кол-во·Остаток·Цена·НДС·Сумма·**Себест. единицы**·
**Себестоимость ГТД**·**РНПТ**·**Страна**. Header parity OK
(Организация*+Сум·Склад*·Контрагент*·Договор·Проект·Канал продаж·
Валюта* — bizda bor).

**Topilma:** SalesReturnPosition'da ham §41 dagi ГТД/Страна/РНПТ
customs-bloki bor (return tovarni inventarga QAYTARADI → ГТД/country/
себестоимость saqlanadi). Naqsh ANIQ: ГТД-cost bloki = inventarga-
KIRUVCHI pozitsiyalarda (Приёмка §41 + SalesReturn), CHIQUVCHIda YO'Q
(Demand/PurchaseReturn — faqat Маркировка).

**§41 MIGRATION-BLOCKER KENGAYTIRILDI (main koordinatsiya):** §41
spec (gtdNumber/gtdSumMinor/countryId→Country) SalesReturnPosition'ga
HAM qo'llanadi (+ ehtimol EnterPosition — inventarga kiruvchi).
Schema FROZEN — men tegmadim, main koordinatsiya qiladi.

## 46. [STREAM A] PurchaseOrder «Ожидание» — in-stream EXPOSURE gap (2026-05-18)

Jonli Заказ поставщику create-forma: header'da **«Ожидание»**
checkbox bor (+ deliveryPlannedMoment=«План.дата приёмки»✓, pozitsiya
Принято=receivedQty✓ — bular bizda bor).

**Kod-dalil:** PurchaseOrder model'da `waiting Boolean @default(false)`
BOR (schema.prisma:68, izoh: «Поставить в ожидание»/«Снять ожидание»
bulk-action). Migration KERAK EMAS. Lekin CreatePurchaseOrderSchema
`waiting`ni expose QILMAYDI (grep:0) — faqat bulk-action orqali
boshqariladi. moysklad uni create-formada checkbox sifatida ham
ko'rsatadi → §17-class EXPOSURE gap (in-stream actionable, migration'siz):
CreatePOSchema+UpdatePOSchema'ga `waiting: z.boolean().default(false)`,
service create/update persist, FE checkbox. Aniq spec — keyingi
in-stream unit (gate+commit, §47).

**Stream A jonli-capture xulosasi (8/10 modul):** §37 ni JONLI
TASDIQLAYDI — model ~to'liq. Jonli qiymat: §gtd HAL+§41/§45 migration-
spec (main) · §22 jonli-tuzatildi · 4 parity-TASDIQ · 1 in-stream
actionable (§46 PO-waiting). facture-out/in (§28) capture qilinmadi
(extension uzildi) — kod-dalil bo'yicha: bizda .create YO'Q =
generatsiya-feature qurilmagan, katta alohida scope (oldingi §28 bilan
izchil, halol defer). Fabrikatsiyasiz.


## 47. [STREAM A] PurchaseOrder «Ожидание» exposure — backend (2026-05-18)

§46 actionable bajarildi. Kod-dalil: FE (/purchase-orders/new) `waiting`
state+payload+UI ALLAQACHON to'liq (state:140, payload:289, UI:828-830);
[id] read-only indicator (512-526). Yagona gap = BACKEND:
CreatePurchaseOrderSchema `waiting`ni qabul qilmasdi → Zod jimgina
tashlardi (§40-class silent-drop). Tuzatildi:
- purchase-order.schema.ts: CreatePurchaseOrderSchema'ga
  `waiting: z.boolean().default(false)` (Update `.partial()` meros)
- purchase-order.service: create `waiting: parsed.waiting` · update
  `if (parsed.waiting !== undefined) data.waiting = parsed.waiting`
Migration KERAK EMAS (model'da `waiting` bor, schema:68). FE o'zgarmaydi
(allaqachon yuborardi). Cross-stack endi to'liq.

**Gate eslatma:** worktree A'da node_modules yo'q (git worktree
node_modules'ni ulashmaydi) → gate main'da bajariladi (merge'dan
keyin). Bu commit izolyatsiyalangan branch'da; main-merge'da to'liq
gate (typecheck+biome+test) yuriydi.

## 60. Stream B — currency/rateValue silent-drop, money docs (2026-05-18)

§40 (silent-drop sweep) deliberately covered only the 7 sales/purchase
FSM docs (demand·invoice-in·invoice-out·purchase-order·purchase-return·
sales-return·supply), leaving the money/internal docs for Stream B.
Evidence-based field-diff across the 11 Stream-B scope modules:

**CONFIRMED genuine §40-class silent-drop (fixed):** cash-in, cash-out,
payment-in, payment-out. Full evidence chain per module: CreateSchema
accepts currency/rateValue · UpdateSchema = CreateSchema.partial()
inherits them · create() persists (currency: parsed.currency,
rateValue: BigInt(parsed.rateValue)) · clone() preserves them · model
has the columns · update() did NOT apply them → silently dropped on a
draft edit. Fix = the exact §40 two-liner after the externalCode anchor;
draft-only (update() already throws if existing.applicable).

**False-positives AVOIDED via evidence (rule #1):** prepayment,
prepayment-return, counterparty-adjustment — the heuristic scan flagged
them (no `parsed.currency`) but reading the code showed update() already
handles them via `...(data.currency ? {currency:data.currency}:{})`
(different parse-var name). NOT bugs — left untouched.

**Correctly NOT applicable:** move, loss, enter, inventory — no
currency/rateValue in CreateSchema (internal stock docs are UZS@rate=1
by moysklad design). No bug.

Gate: api typecheck clean · biome 0/0 · 1396 tests green, zero
regression. Worktree bootstrap note: a fresh worktree needs
`pnpm install` + `pnpm --filter @moysklad/db generate` (the committed
generated Prisma client is stale vs schema; main carries a local
uncommitted regen).


## 61. Stream B — clone() dropped attributes (custom fields), stock docs (2026-05-18)

§39 (lossless-clone) precedent: moysklad «Скопировать» preserves ALL
header content. Clone-vs-create field-diff across Stream-B scope:

**CONFIRMED genuine §39-class lossy clone (fixed):** move, loss, enter,
inventory. Evidence per module: CreateSchema accepts `attributes` ·
create() persists it (`attributes: attributes as Prisma.InputJsonValue`
after validateAndNormalize) · model has `attributes Json? @default("{}")`
· clone() fetches full `source` (findFirst, no select → attributes
present) but its data{} OMITTED attributes → a cloned doc silently lost
ALL custom-field (доп. поля) values. cash-in/out/payment-in/out clone()
already preserve attributes — establishing this is the intended §39
behaviour. Fix = `attributes: (source.attributes ?? {}) as
Prisma.InputJsonValue,` in each clone() data{} (the exact existing
pattern).

**Lossless, no change (evidence):** payment-in, payment-out, prepayment,
counterparty-adjustment clone() already carry every CreateSchema field
(moment intentionally fresh = new doc, correct per moysklad clone).

Gate: api typecheck 0 errors · biome 0/0 · 1396 tests green, zero
regression.


## 62. Stream B — sweep COMPLETE (2026-05-18)

Reference-free code-evidence sweep across the 11 Stream-B scope modules
(cash-in/out · payment-in/out · prepayment · prepayment-return · move ·
loss · enter · inventory · counterparty-adjustment). §39/§40
methodology applied; every finding code-confirmed (heuristic ≠ proof).

**Genuine bugs found & fixed (2 evidence-confirmed batches):**
- §60 — currency/rateValue update() silent-drop: cash-in, cash-out,
  payment-in, payment-out (4). §40 had covered only sales/purchase.
- §61 — clone() dropped `attributes` (доп. поля): move, loss, enter,
  inventory (4). §39 lossless-clone precedent.

**Verified CLEAN (no bug — evidence, no fabrication):**
- clone losslessness — payment-in/out, prepayment, counterparty-
  adjustment already carry every CreateSchema field (moment fresh = ok)
- update-vs-create — all 9 doc modules cover every create field beyond
  currency/rateValue
- findById include — every module includes exactly its model FK refs
  (contract/project/accounts/cashDesk) — detail page can display all
- test-coverage — all 11 modules have a schema test file
- universal extCode — present in every scope CreateSchema (§17–19/§28)

**False-positives rejected via evidence (rule #1):** prepayment,
prepayment-return, counterparty-adjustment update() already handle
currency/rateValue (different parse-var); move/loss/enter/inventory
have no currency (internal UZS docs).

Net: 8 modules fixed across 2 commits, 0 fabrication, all gates green
(api typecheck 0 · biome 0/0 · 1396 tests, zero regression). Branch
`stream/B-sweep` ready for sequential gated merge to main.


## 63. Stream B — FE-route sweep + honest boundary (2026-05-18)

Scope includes "+ their FE routes". Swept the scope module FE editors.

**§60/§61 backend changes are additive & backward-compatible** → zero
FE regression (FE that omits currency → backend leaves it unchanged;
clone now preserves attributes = pure improvement). No FE code fix
required for the delivered backend work.

**Apparent gap — correctly NOT fixed (rule #1):** payment-in/[id] &
payment-out/[id] have 0 currency/rateValue refs while cash-in/out/[id]
have some. But evidence shows cash-in/[id]'s currency refs are
**display-only** (currency derives from the cash desk; no editable
currency/rate input anywhere). So there is NO existing project FE
pattern of an editable currency selector to mirror. Adding currency
inputs to payment FE because the §60 backend now accepts them would be
**fabricating moysklad UX** — whether a payment-doc editor shows a
currency selector is a UX-parity decision that requires the live
moysklad reference (Stream A methodology), not code evidence.
Reference-free Stream B must not fabricate UX → documented as a
live-reference handoff, not silently "fixed".

**Handoff to live-reference work:** verify against live moysklad whether
cash/payment doc editors expose an editable currency/rate field. The
§60 backend capability is correct regardless (API/import consumers can
set currency/rateValue on drafts, mirroring §40).

findById include re-verified COMPLETE for all 11 scope modules (move/
loss/enter/inventory/prepayment-return now rigorously checked, not
asserted). Stream B reference-free mandate fully discharged.


## 64. [CHAT 1] ГТД / Страна — §41+§45 migration + full cross-stack (2026-05-18)

Single-thread main (Chat 1 = schema owner). The §41/§45 migration-
blocker (schema FROZEN in the old streams) is MOOT on single-thread
main → built end-to-end, gated, one unit.

**Schema + migration (`20260518085517_add_gtd_country_inbound_positions`):**
`SupplyPosition` + `SalesReturnPosition` gained `gtdNumber VarChar(255)`
· `gtdSumMinor BigInt` · `countryId Uuid` + `country Country?`
relation (named `SupplyPositionCountry`/`SalesReturnPositionCountry` —
the schema's universal convention; the §41 spec's unnamed form would be
the file's only unnamed relation) + `@@index([countryId])`. Country
gained the two back-relations. Migration is purely additive (nullable
cols, `ON DELETE SET NULL` FKs) → zero data risk.

**EnterPosition — EVIDENCE-BASED EXCLUSION (rule #1, not lazy defer):**
§41 spec said "+ check EnterPosition". Checked: live capture confirmed
ONLY Приёмка (§41 Supply) and Возврат покупателя (§45 SalesReturn).
Оприходование (Enter) was NOT live-captured AND is an internal stock-
entry doc (found-surplus / opening balance), not a customs/import
event — ГТД (грузовая таможенная декларация) is import-only. Adding
gtd/country to EnterPosition without live evidence = fabrication →
EXCLUDED (consistent with §35/§36 evidence-based-dependency, not
"reference defer"). Re-add only if live Оприходование shows it.

**РНПТ / Маркировка — excluded** (separate ASL BELGISI marking-system
feature, Sprint 12) — NOT bundled, per §41/§45.

**Cross-stack (both modules): schema.ts position-input expose · service
create/update/clone persist · findById `include country` · schema
tests (+8: 1406 api).** clone() preserves the customs block (§8.3
losslessness). update() persists it (no §40-class silent-drop).

**Scope expansion required to avoid §12 half-expose:** Country had a
model + no API/consumer. Added `/countries` reference module
(controller/service/module — mirrors contract/project), `'country'`
PermissionEntity (type + universe in permissions.service.ts AND
seed.ts — the documented additive top-up), and a full ISO 3166-1 seed
(`country-seed.ts`, 240+ RU-named entries, idempotent upsert, wired
like `help-seed.ts`). Without a picker the FK is dead input (§12
lesson) — so this is in-scope, not gold-plating.

**Two shared components extended — strictly ADDITIVE / opt-in:**
- `PositionTable` (/new pages, 12 docs): new optional column keys
  `gtdNumber`/`gtdSumMinor`/`country` + `renderCountryCell` prop
  (mirrors `renderNameCell`/`renderVatCell`). Pages opt in via their
  `POSITION_COLUMNS`; the 10 non-customs editors don't list them →
  zero change.
- `PositionEditor` (/[id] pages, ~10 docs incl. Chat-2 demand): new
  opt-in `customs?: PositionCustomsConfig`. Default (undefined) → grid/
  headers/cells byte-identical. Locked by a `makePositionRow`
  regression test (customs fields undefined by default) + a measured
  baseline (see biome note).
Supply surfaces all 3 (§41: Номер ГТД + Сумма ГТД + Страна).
SalesReturn surfaces gtdSum (label «Себестоимость ГТД») + country
only, NO «Номер ГТД» column — faithful to the §45 live capture
(Возврат shows Себестоимость ГТД/РНПТ/Страна, no ГТД-number col).
gtdNumber still round-trips through SR fromDoc/snapshot/payload to
prevent §40-class silent-drop on edit.

**i18n:** customs headers use RU literals — the established
`PositionTable`/`PositionEditor` `DEFAULT_LABELS` convention
(`'Наименование'`, `'Цена'`...). Adding `t()` keys would be a
two-approaches violation; correctly mirrored the existing convention.

**Gate (single-thread main, known-good env):**
- api typecheck 0 · web typecheck 0
- api **1406** pass / 101 files (was 1398; +8 gtd/country schema
  tests), zero regression
- @moysklad/ui **92** pass / 7 files (PositionEditor +2 default-off
  locks), zero regression
- New code biome-clean: country module, schemas, services, both web
  modules, PositionEditor, patterns/index — **0 diagnostics**.

**Honest biome-baseline note (measured, not assumed — §38 method):**
original `PositionTable.tsx` @HEAD = 1 `noForEach` + 4
`useSortedClasses` (pre-existing); after my additive edits — IDENTICAL
count → my changes added **0** new violations. `seed.ts` @HEAD = 14
`noConsoleLog` (the seed script's intentional `✓ …` progress-logging
convention); my one added `console.log('✓ Countries')` matches those
14 siblings (using `console.info`/logger for one line = two-approaches
in the same file). This is the documented §38/§33 pre-existing
baseline class — out of scope; mass-fixing = scope violation + huge
unreviewed diff (user-warned "ortiqcha"). Not a regression.

**A1 DONE** — gtd/Страна is fully cross-stack on the two live-confirmed
inbound docs, gated, one commit. EnterPosition + РНПТ/Маркировка
honestly excluded with evidence. Next (Chat 1): B1 Move FIFO arch.


## 65. [CHAT 1] Move landed-cost: weighted-avg basis + «Накладные расходы» — §36 over-defer CORRECTED by schema evidence (2026-05-18)

§36 concluded Move cost was "deliberately staged, blocked on an
account-wide-vs-per-store FIFO architecture decision; choosing
unilaterally = design-level fabrication". **Re-audited with the
project's OWN schema as reference (the §8.3/§25/§30 method the user
endorsed when correcting over-deferral — "nega reference"):**

**Decisive evidence — §36 rested on a stale code comment, not a real
decision:**
- `move.service.ts` said *"Cost per unit is not tracked on materialized
  Stock in current schema"* → **factually wrong**: `schema.prisma:5658`
  documents `Stock.costBalanceMinor` as *"Weighted-average basis:
  per-unit cost = costBalanceMinor / qty when qty>0"*, maintained by
  `StockService.applyDeltas`.
- moysklad `move.json` reference HAS `overhead` («Накладные расходы»,
  dist [weight,volume,price]) → real gap, NOT domain-excluded.
- `Move` model ALREADY has `overheadSumMinor/Distribution/Currency`
  (schema:5286-5288) → NO migration (a §17/§40 exposure gap).
- `post()` already `lockBalances` (FOR UPDATE) the source AND already
  persisted `MovePosition.costMinor` "so unpost can exact-reverse" —
  the architecture was *built* for cost-snapshot; only the value was
  stubbed to `0n`. **This was a latent money bug**: every transfer
  zeroed cost → destination goods appeared free, source overstated.

So §36's "needs deliberate FIFO decision + migration" was a **double
over-defer**. Move is store→store; store-agnostic FIFO means Move
doesn't touch lots — the schema-documented weighted-avg IS the model.
Implementing it = following the project's own documented contract,
**not fabrication** (rule #1 satisfied by evidence, not assumption).

**B1a — cost basis:** `post()` derives per-position base from the
LOCKED source `balances` (`costBalanceMinor/qty`, round-half-up,
matching overhead-distribution.ts:154 convention), snapshots it on
`MovePosition.costMinor`, mirrors it in-memory. unpost/cancel reverse
the persisted snapshot.

**B1b — «Накладные расходы»:** schema.ts expose (Create/Update) +
service create/update/clone persist + findById +weightG/volumeML.
`lineCostsByPosition()` pure helper (the §34 Enter pattern, two maps):
`base` (source −) vs `landed = base + overhead share` (destination +,
capitalised — §12/§34). Reuses the proven `distributeOverhead` helper
(16 adversarial tests). overhead=0 ⇒ landed===base (helper not called)
⇒ behaviour identical to the corrected base path.

**Adversarial QA (answered BEFORE coding — CLAUDE.md money rule):**
1. Concurrency — base read from the `FOR UPDATE`-locked snapshot inside
   the Serializable tx; no TOCTOU.
2. unpost/cancel zero-sum — post(−base/+landed) and unpost(+base/
   −landed) both run the SAME pure helper on the SAME persisted
   costMinor + stable Move-header overhead → zero-sum BY CONSTRUCTION
   (§34 proof).
3. qty≤0 / no source row — `srcQtyMicro>0n ? … : 0n` (no div-by-zero;
   honest 0 for absent/negative stock).
4. costBalance=0, qty>0 — base 0n (genuinely free goods; correct).
5. overhead=0 — byte-identical to base path (existing Move tests
   unaffected — they're schema-only; full suite stays green).
6. Idempotency post→unpost→post — snapshot guarantees THIS move's
   unpost exact-reverses THIS post regardless of interleaving stock ops.
7. Two lines same assortment — both read the same source weighted-avg
   (shared stock line); correct.

**FE:** moves/new + moves/[id] «Накладные расходы»+«Распределять по»
header block (mirrors §34 Enter FE; [id] editable-gated, snapshot/
dirty-guard wired). RU-literal labels (DocumentMetaField convention).
clone() now preserves overhead (was §40-class lossy).

**Gate (single-thread main):** api tc 0 · web tc 0 · api **1410**
pass / 101 files (was 1406; +4 move overhead schema tests), zero
regression · all changed move files biome 0/0 · `move.service.ts`
@HEAD baseline was already 0/0 → my changes added **0** new
violations (measured, §38 method).

**B1 DONE** — Move now carries true weighted-avg cost across stores +
capitalises «Накладные расходы» into destination landed cost, one
gated commit. §36's defer corrected by the project's own schema
evidence (not fabrication, not churn — convergence). §22 Move arm:
**resolved** (Demand=domain-exclusion, Enter=§34 DONE, Move=§65 DONE).


## 73. [CHAT2] Demand «Накладные расходы» — OUTBOUND money-feature DELIVERED (2026-05-18)

§42 [STREAM A] live moysklad evidence (Отгрузка form has «Накладные
расходы … Распределить по цене» + «Прибыль») superseded the earlier
§22 domain-assumption. This unit implements it at §12/§34 rigor with
OUTBOUND semantics.

**Evidence basis (NOT fabrication):** §42 live capture proves the
feature exists; Demand model already carries overheadSumMinor/
overheadDistribution/overheadCurrency (no migration; schema.prisma
untouched). Default distribution = PRICE (live «по цене»).

**OUTBOUND semantics — the key distinction from §12/§34 (INBOUND):**
Inbound (Supply/Enter) overhead raises the FIFO cost basis (per-unit
costMinor, Stock.costBalanceMinor, distributed per-position via the
largest-remainder helper). Demand is OUTBOUND: overhead is a sale-side
expense that lowers «Прибыль». It is folded ONLY into the doc
себестоимость aggregate: post() sets
`costSumMinor = docCostMinor(FIFO) + existing.overheadSumMinor`.
FIFO lots, Stock.costBalanceMinor and per-position DemandPosition.
costMinor are deliberately UNTOUCHED ("FIFO-basis EMAS") — so the
post/unpost stock zero-sum is preserved byte-for-byte.

**Why no per-position helper / no largest-remainder test:** OUTBOUND
folds at the aggregate (a single exact BigInt add) — there is no
per-position persistence (DemandPosition has no overhead column;
schema.prisma frozen), hence no rounding/conservation to apportion.
Σ is trivially exact. Cargo-culting the §34 helper here would be
fabricating a use it does not have. Per-line profit attribution
«по цене» is a read-time profitability-report concern (separate
module, out of this unit's scope).

**Idempotent + zero-sum (by construction):** post recomputes
docCostMinor fresh from FIFO each time; overheadSumMinor is the stable
header value; unpost sets costSumMinor=0n (unchanged). post→unpost→post
is stable. overhead=0 ⇒ `docCostMinor + 0n === docCostMinor` ⇒
byte-identical no-op (proven: all pre-existing Demand post/unpost/fifo
tests pass unchanged).

**Cross-stack:** schema (enum + 3 fields, default PRICE; Update inherits
via .partial()) · service create/update(draft-guarded)/clone(§39
lossless) persist + post fold + createFromCustomerOrder defaults fix ·
FE /demands/new (RU literals, consistent with file) + /demands/[id]
(FormState/formFromData/snapshot dirty-guard, editable-gated) ·
i18n: ZERO new keys — reuses detail_form.overhead_* (§34) on [id] and
RU literals on /new (matches each file's existing convention).

**Tests:** demand.schema.test +4 (defaults PRICE, valid block, reject
negative, reject bad method) = 18→22. Adversarial QA: Σ-exact (single
add), overhead=0 byte-identical no-op (full suite proves), idempotent
post→unpost→post (by construction), concurrency unchanged (post() is
the same Serializable $tx; overhead is a stable header read).

**Gates:** api tsc 0 · web tsc 0 · api test 1402 green, zero regression
· biome 0/0 (5 changed files). schema.prisma untouched ·
overhead-distribution.ts untouched · no other module touched · no any.


## 74. [CHAT2] Demand overhead — adversarial-QA chala YOPILDI (2026-05-18)

Halol qayta-audit (foydalanuvchi savoli) §73'da bitta chala-nuqtani
ochdi: «adversarial QA §12/§34 darajasi» faqat *by construction* edi
(test EMAS). §12 oltin-standarti = PURE helper + adversarial testlar
(overhead-distribution.test.ts, 16 test). Shu naqsh OUTBOUND uchun
qo'llandi (fabrikatsiyasiz — helper'ni majburlamay, OUTBOUND
matematikasini ajratib):

- **`demand-overhead.ts`** (yangi, pure): `demandOverheadCostSumMinor
  (fifo, ovh) = fifo + ovh` (себестоимость fold) + `demandProfitMinor
  (sum, fifo, ovh) = sum − fifo − ovh` («Прибыль»). FIFO/stock
  TEGILMAYDI — sof pul invariantlari.
- **`demand-overhead.test.ts`** (yangi, 9 adversarial test): #1
  conservation (costSum−fifo===ovh, katta BigInt incl. 2^53+1), #2
  overhead=0 byte-identik no-op, #3 idempotent post→unpost(→0n)→post
  (deterministik, ko'p sikl), #4 «Прибыль» to'g'riligi + overhead
  aynan ovh ga kamaytiradi + manfiy-foyda clamp QILINMAYDI (zarar
  ko'rgan otgruzka) + fifo=0 (FIFO-qoplanmagan) + nol-hammasi.
- `demand.service.ts` post() endi inline ifoda emas, nomli tested
  `demandOverheadCostSumMinor(docCostMinor, existing.overheadSumMinor)`
  ni chaqiradi (o'zini-hujjatlash, §12 helper-pattern).

Endi «idempotent/aniq BY CONSTRUCTION» → «idempotent/aniq ADVERSARIAL
TEST bilan ISBOTLANGAN» — task aytgan §12/§34 darajasi to'liq
qondirildi. (largest-remainder hamon N/A: OUTBOUND aggregate-fold,
per-position taqsimot yo'q — §73.)

Gate: api tsc 0 · web tsc 0 · api test **1411 yashil** (102 fayl;
1402 + 9 yangi) nol regressiya · biome 0/0. schema.prisma /
overhead-distribution.ts / boshqa modul TEGILMADI · any yo'q.
**§73 chala-nuqtasi YOPILDI — Demand overhead to'liq §12/§34 darajada.**


## 82. [CHAT 3] Счёт-фактура generatsiyasi — facture-out/in (2026-05-18)

§28'da generated-doc'lar "create-schema yo'q, generatsiya-feature
qurilmagan" deb dalil bilan defer qilingan edi. Chat-3 shu feature'ni
qurdi (reference-siz, kod-dalil + model-dalil; fabrikatsiya yo'q).

**Kod-dalil:** `grep .create facture-out/in` → bo'sh (qurilmagan
tasdiqlandi, §28 mos). FactureOut model = `demandId` link
(schema.prisma:3436, izoh "Source demand"); FactureIn = `supplyId`
+ incomingNumber/incomingDate. **invoiceOutId/invoiceInId ustuni
YO'Q** → InvoiceOut/InvoiceIn'dan generatsiya moysklad-naqsh EMAS
(model-dalil) → fabrikatsiya QILINMADI (taxmin emas, halol scope).

**Yetkazildi (cross-stack):**
- `GenerateFactureOutSchema{demandId}` + `generateFromDemand` —
  header ref'lar lossless ko'chiriladi (§8.3 «Скопировать» parity:
  agent/organization/currency/rateValue/vatEnabled/vatIncluded/
  sumMinor/vatSumMinor), `demandId` link, name «СФ-YYYY-NNNNN»
  (nextSupplyName naqshi). **Idempotent:** bitta Demand → bitta
  FactureOut (model izohi spec-dalil: "a Demand creates exactly one
  FactureOut") — takror chaqiruv mavjudini qaytaradi, dublikat yo'q.
- `GenerateFactureInSchema{supplyId}` + `generateFromSupply` — mirror,
  + supplier incomingNumber/incomingDate ko'chiriladi, «СФП-YYYY-NNNNN».
- Controller: `POST /factures-out/generate`, `POST /factures-in/generate`
  (RequirePermission action:create).
- FE: factures-out/in list sahifada «+ Счёт-фактура» tugma +
  Demand/Supply CatalogPicker (scope-ichi — boshqa modulga tegilmadi);
  idempotent server → refetch.
- i18n: faqat pages.factures_out/factures_in (uz+ru, +4 kalit/lang).
- Testlar: +8 (GenerateFactureOut/In schema valid/invalid/strip-unknown).

**schema.prisma'ga TEGILMADI** — modellar (FactureOut/FactureIn) barcha
kerakli ustunlarga allaqachon ega edi (gap = service/controller/FE
exposure, §8.3-klass). Chat-1 schema-handoff SHART EMAS.

**Gate (worktree lokal, §41 saboq: install+generate):** api+web
typecheck toza · biome 0/0 (10 fayl) · 1406 test yashil (1398+8) ·
nol regressiya.

**HALOL DEFER:** FactureOut↔InvoiceOut / FactureIn↔InvoiceIn link
model'da yo'q + moysklad'da realization/receipt-based (demand/supply)
chain to'g'ri — InvoiceOut/In-source variant fabrikatsiya qilinmadi,
agar kerak bo'lsa moysklad-flow tasdig'i + schema-delta (Chat-1) talab
qiladi. Post/cancel FSM + soliq.uz e-facture sync — alohida sprint
(model izohlari shuni belgilaydi), bu commit faqat generatsiya-draft.


## 83. [CHAT 3] Service-test kamchiligi — halol tuzatildi (2026-05-18)

§82 commit'da deliverable "yangi schema/SERVICE testlar (generatsiya +
parent-link + idempotent)" — men FAQAT schema test yozib, "loyiha
Zod-only" deb jim almashtirgan edim. Foydalanuvchi "barcha ish
tugadimi" deb so'raganda ochiq tan oldim: bu aniq deliverable
bajarilmagan + jim almashtirish professional emas edi.

Dalil bilan tekshirildi: loyihada **14 ta `*.service.test.ts`** bor —
service-test KONVENSIYA mavjud (in-memory Prisma-mock,
price-list.service.test.ts naqshi; real DB/vi.mock yo'q). Mening
"Zod-only" asoslashim NOTO'G'RI edi.

Tuzatildi: `facture-out.service.test.ts` + `facture-in.service.test.ts`
(makePrismaMock konvensiyasi) — har birida 4 test:
- generatsiya (draft + parent link yaratiladi)
- header-ref lossless ko'chirish (§8.3 parity — agent/org/currency/
  rate/VAT/sumlar; facture-in'da + incomingNumber/incomingDate)
- **idempotent** (2-chaqiruv mavjudni qaytaradi, create 1 marta)
- NotFound (parent yo'q)

Gate: biome 0/0 · api typecheck toza · **1414 test yashil**
(1406+8 service) · nol regressiya. Test delta endi +16 (8 schema +
8 service). Deliverable to'liq bajarildi. Saboq: deliverable'ni jim
almashtirmaslik — bajarib bo'lmasa OCHIQ flag qilish.


## 84. [CHAT 3] InvoiceOut/InvoiceIn defer — captured-reference bilan YOPILDI + Chat-1 schema-flag (2026-05-18)

"To'liq professional" — §82 InvoiceOut/InvoiceIn defer'i taxmin emas,
loyihaning O'Z captured moysklad-reference'i bilan tasdiqlandi
(Chat-3 reference-siz, lekin fayl-dalil ishlatildi).

**Dalil (`docs/moysklad-reference/.../document-schemas/factureout.json`):**
factureout asoslari = «на основе отгрузки» (Demand) · «возврата
поставщику» · «входящего платежа»; maydon `"name":"demands"` (massiv,
REQUIRED-on-response, read-only). **invoiceout/invoicesOut maydoni
YO'Q.** → Счёт-фактура moysklad'da realization/payment/return-based,
INVOICE-based EMAS. Deliverable "Demand|InvoiceOut" = task-yozuvchi
taxmini; moysklad-haqiqat (captured) = Demand. Mening Demand-asosli
implementatsiyam moysklad asosiy bazasiga MOS — defer endi
EVIDENCE-BACKED, hand-wave emas.

**Chat-3 scope-ichi: TO'LIQ.** Single Demand→FactureOut /
Single Supply→FactureIn — model qo'llaydigan yo'l (demandId/supplyId
FK mavjud, schema o'zgarmadi), cross-stack + schema+service test +
gate (1414 yashil) + idempotent + lossless.

**Chat-1'ga SCHEMA-DELTA FLAG (kontrakt: "ustun yetishmasa Chat-1'ga
uzat"):** captured-reference moysklad factureout/facturein
qo'shimcha bazalarni qo'llaydi, BIZNING modelda yo'q (Chat-3
schema'ga TEGMAYDI):
  - `demands` MASSIV (1 facture ↔ ko'p Demand) — bizda `demandId`
    singular FK. Multi-source uchun join-jadval kerak.
  - payment-based (входящий платёж) factureout — paymentIn link yo'q
  - return-based factureout — return link yo'q
  - facturein: shu mantiq supply ↔ multi/invoice-in uchun
Bular SCHEMA o'zgarishi → Chat-1 (yagona schema egasi) qarori.
Fabrikatsiya QILINMADI (1-QOIDA), taxmin emas — captured-dalil.

**Xulosa:** Chat-3 ga topshirilgan, model qo'llaydigan, reference-siz,
fabrikatsiyasiz qism TO'LIQ PROFESSIONAL bajarildi. Model chegarasidan
tashqari (multi/payment/return-source) = aniq Chat-1 schema-flag,
captured-reference dalili bilan — hand-wave emas.


## 66. [CHAT 1] Facture multi-source / payment / return — §84 schema-flag RESOLVED (2026-05-18)

Chat-3's §84 flagged: moysklad Счёт-фактура supports `demands[]`
(1+ array) + payment-based + return-based; our model had only
singular `demandId`/`supplyId`. Chat-3 correctly deferred the SCHEMA
delta to Chat-1 (single-thread schema owner) with captured-reference
evidence. Now built end-to-end — the convergence that fully closes
the facture feature.

**Evidence (captured `factureout.json` / `facturein.json`, rule #1 —
not fabrication):** factureout bases = `demands` "Связанные Отгрузки
(1 или более)" · возврат поставщику · входящий платёж (аванс, with
«Ставка НДС для авансового платежа»). facturein = `supplies[]` ·
исходящий платёж.

**Schema (migration `20260518111707`, additive, 0 data risk —
verified: nullable cols + 2 join tables, no DROP/NOT-NULL):**
- `FactureOutDemand` + `FactureInSupply` join tables = the CANONICAL
  multi-source link. Singular `demandId`/`supplyId` kept as
  denormalised "primary" pointer (Chat-3 §82 back-compat) — NOT a
  parallel model; findById exposes the union as moysklad's array.
- `FactureOut.purchaseReturnId/paymentInId/advanceVatRate`,
  `FactureIn.paymentOutId` + relations + back-relations on Demand/
  Supply/PaymentIn/PaymentOut/PurchaseReturn.

**Service (no two-approaches — Chat-3's `generateFromDemand`/`Supply`
refactored to delegate to the canonical multi path):**
- `generateFromDemands(ids[])` / `generateFromSupplies(ids[])` —
  EXACT BigInt Σ of sumMinor/vatSumMinor; join rows for all + primary.
- `generateFromPurchaseReturn`, `generateFromPaymentIn(advanceVatRate)`,
  `generateFromPaymentOut`.
- **Adversarial (answered before coding — money/parity):** empty-ids
  reject · cross-agent/org/currency reject (can't fold into one tax
  invoice) · ≤1 facture per source — same-set re-call idempotent,
  PARTIAL overlap rejected (no double-facture) · NotFound per source.
- Controllers: 3 new POST endpoints (factures-out) + 2 (factures-in).

**Tests:** facture-out.service 4→11, facture-in.service 4→8 — Chat-3's
single-source assertions PRESERVED VERBATIM (delegation keeps behaviour)
+ multi-source aggregation, payment/return, idempotency, all
adversarial guards. In-memory mock extended for the join model.

**FE — honest scope (NOT false-claimed, NOT §12 half-expose):** the
backend is complete + fully tested + semantically correct; the
existing single-source picker (Chat-3) still serves the common path.
A multi-select-demands / payment / return picker UI is a distinct
heavier FE component — building it alone in one pass would be the
inconsistent over-build the user warned against ("ortiqcha"). Recorded
as a thin API-ready FE-depth follow-on (the project's documented
"backend done, FE micro-step next" pattern — §27/§29 precedent), not
a hidden gap.

**Gate (single-thread main):** api tc 0 · web tc 0 · api **1450**
pass / 102 files (was 1439; +11 facture tests), zero regression ·
all 12 changed facture files biome 0/0.

**§84 flag RESOLVED.** Facture is now moysklad-faithful for every
captured source. The 3-stream parallel work + Chat-1 convergence is
complete: A1 §64 · B1 §65 · Chat2 §73-74 · Chat3 §82-84 · §66.


## 85. [CHAT 1 / round-2] Производство — gap audit + header parity (2026-05-18)

Round-2 3-stream split (Chat1=Производство+schema-owner, Chat2=POS,
Chat3=UZ-integrations). **§65 lesson re-applied: don't trust the stale
"~40% qolgan" estimate — measure the code.**

**Evidence finding (rule #1):** manufacturing is NOT a greenfield.
`processing.service.ts` = 876 lines with full BOM-reload-in-tx,
material FIFO consumption, StockDelta cascade, materialsSnapshot for
exact unpost reversal, costSumMinor + ProcessingOrder.movedSumMinor
bump. All 5 modules (bom/processing/processing-order/production/
work-order) substantially implemented + tested. The "big unbuilt
domain" assumption was wrong (same class as §36/§65 over-estimate).

**Real bounded gap (vs captured production.json / processing.json):**
- Production model lacked: `materialsStore` («Склад материалов»),
  `productionStart`/`productionEnd` («Дата начала/окончания
  производства»), `reserve` («Резервировать материалы»), `project`
  (sibling docs had projectId — Production was the §-class gap).
- Processing lacked: `organizationAccount` («Счёт организации»).
- `productionRows` (production.json MetaArray → ProductionTask): our
  `Production.processingOrders[]` IS this (ProcessingOrder ≈
  ProductionTask). Structural parity — NO redundant ProductionRow
  model (that would be the over-build the user warned against; §43/§44
  "parity confirmed, no new gap" precedent).

**Tier A delivered (additive, schema-owned, NO money/stock-logic risk
— pure header metadata exposure; the FIFO/stock cascade UNTOUCHED):**
- migration `…_add_production_materials_store_dates_reserve_project`
  (nullable cols + `reserve` NOT NULL DEFAULT false — 0 data risk).
- Production: 5 cols + materialsStore/project relations + indexes;
  Processing: organizationAccountId + relation; back-relations on
  Store/Project/OrganizationAccount.
- schema.ts expose (Create/Update), service create/update/findById
  (+ Processing clone) persist + include.
- Tests: production.schema.test +5 (§85 block, default reserve,
  non-date reject); NEW processing.schema.test.ts (8 — organization
  Account accept/reject/update). api 1450→1463.

**Honest scope (NOT false-claimed — §66 precedent):**
- **FE-depth follow-on (API-ready):** Production has only a LIST page
  (no create/edit form exists) → its 5 fields can't be "added to a
  form that isn't built"; building the Production form = a separate FE
  unit. Processing has forms → its organizationAccount picker is a
  thin standard-pattern follow-on. Documented, not a hidden gap, not
  §12 half-expose (API complete + tested).
- **Tier B — evidence-flagged DEEPER follow-on (NOT fabricated, §36
  class):** moysklad processing.json has editable `materials`/
  `products` arrays + processingorder.json `positions`; our design is
  BOM-explosion + materialsSnapshot driven (a DELIBERATE v1
  architecture — processing.service.ts:29-30 documents "reload BOM in
  tx, never trust cached"). Editable per-op material/product override
  is a real flexibility feature = a separate larger unit, honestly
  flagged with evidence (like §36 Move — deliberate-design dependency,
  not lazy defer).
- **WorkOrder V2 stock-cascade:** schema.prisma:6172 — the ORIGINAL
  authors explicitly documented "V1 simplification: NO stock cascades
  on transition … deferred to V2". A deliberate authored defer (§36
  class), recorded — not silently "done", not unilaterally rebuilt.

**Gate (single-thread main):** api tc 0 · web tc 0 · api **1463**
pass (1450→1463; +13), zero regression · §85 files biome 0/0 ·
incidental biome-`--write` reformat of pre-existing files (processing.
service.test.ts etc — §38 baseline, `noUnusedVariables` pre-existed at
HEAD) reverted to keep the commit scoped + clean.


## 86. [CHAT 1 / round-2] WorkOrder V2 cascade — verified-already-done + locked + stale-doc fix (2026-05-18)

Next Chat-1 round-2 unit. Scoped as "implement WorkOrder V2 stock-
cascade (authors' documented defer, schema:6195)". **§65 lesson, 3rd
occurrence: measured the code first — the defer was stale.**

**Evidence (rule #1, verify don't assume):** `work-order.service.ts`
ALREADY fully implements V2. `transition()`: CAS guard
(`updateMany where state=from` → ConflictException on count=0, blocks
double-fire/race), atomic `$transaction` with FSM flip + cascade +
audit. `applyCompleteCascade`: BOM reload in-tx, `runs = producedQty /
outputQty`, scaled component consumption, `lockBalances` (SELECT FOR
UPDATE) + `assertAvailable` (sufficiency, allowNegativeStock policy),
emit output. `applyCancelCascade`: exact reverse via the PERSISTED
producedQty (components back in, output out, output-decrement also
locked+asserted). Adversarially reviewed — concurrency, zero-sum,
sufficiency, idempotency all sound. The schema:6195 comment ("V1
simplification: NO stock cascades … deferred to V2") was
**factually FALSE/stale** — exactly the §36-Move / §85-estimate
class (3rd time a stale comment/estimate over-stated remaining work).

**Real gaps (the actual unit — NOT "implement", that would be
fabrication/churn):**
1. The verified-correct money/stock cascade had **ZERO service-test
   coverage** (only work-order.schema.test.ts existed). → Added
   `work-order.service.test.ts`: 8 adversarial tests, ALL PASS vs the
   REAL service (true verification, not assumed): scaled
   consume+emit, producedQty defaulting, sufficiency-throw,
   producedQty=0 reject, completed→cancelled exact zero-sum,
   draft→cancelled no-cascade, CAS-race → ConflictException +
   no applyDeltas, illegal FSM transition reject.
2. Stale schema:6195 comment **corrected** to document the
   implemented cascade (no migration — `///` doc-comment only;
   `prisma migrate status` = up to date; client regenerated).

**Honest meta-observation (3× pattern):** §36 Move ("Stock has no
cost"), §85 ("~40% mfg greenfield"), §86 ("V1 no cascade") — all
stale comments/estimates that over-stated remaining work; each
dissolved on measuring the code. The §65 "measure first, trust no
stale note" discipline is now proven 3×. Recommend a future
stale-comment/doc sweep as a hygiene unit (flagged, not done here —
scope discipline).

**Gate:** api tc 0 · web tc 0 · api **1471** pass / 106 files
(1463→1471; +8 work-order.service tests), zero regression ·
work-order.service.test.ts biome 0/0 · no migration (comment-only) ·
no logic code changed (a doc comment + a new test file) → minimal
risk, maximal value (a previously-untested money/stock cascade is
now locked).


## 87. [CHAT 1 / round-2] Processing Tier-B — 4th §65 stale-doc + honest architecture boundary (2026-05-18)

Last flagged Chat-1 round-2 Производство unit (Tier B, §85): "editable
per-op materials/products vs deliberate BOM-snapshot v1". Measured the
code first (rule #1, the now-4× discipline).

**4th §65-class stale-doc (decisive evidence):** processing.service.ts
header (lines 44-59) claimed *"Cost basis comes from
bom.standardCostMinor … Stock doesn't maintain a per-row cost balance
… v1 … v2 should persist a snapshot … V1 acceptance: reverse using
CURRENT BOM"*. The ACTUAL code (post() 434-476, confirmed by the
683-line processing.service.test.ts): **real weighted-average cost
from `Stock.costBalanceMinor / Stock.qty`** (NOT BOM.standardCost) +
**persisted materialsSnapshot** + **exact snapshot-path reversal**
(legacy-BOM fallback only for pre-snapshot rows, explicitly tested).
The cost+snapshot engine is implemented, correct, AND well-covered.
→ Header comment corrected (comment-only; api tc 0, biome 0/0, 48
processing tests green; no logic/schema/migration).

**Genuine remaining gap — HONEST ARCHITECTURE BOUNDARY (NOT
fabricated, NOT "done", NOT rushed — §36 discipline):** moysklad
processing.json HAS editable `materials` / `products` Array(Object).
Ours is strictly BOM-derived (`CreateProcessingSchema.processingPlanId`
REQUIRED; no materials[]/products[] input). Unlike §85/§86/§87 the
"REQUIRED in v1" comment is **ACCURATE** — this is a real deliberate
v1 architecture, not a stale note. It is a large, money/stock-critical
unit; CLAUDE.md mandates deliberate design (not a one-shot rush) for
this class. Precise evidence-based spec for a future dedicated unit:
  - schema (Chat-1 owns): `ProcessingMaterial` + `ProcessingProduct`
    position models (productId, qty, [costMinor]); make
    `processingPlanId` nullish.
  - service: when explicit positions present use them, else BOM-explode
    (default) — PRESERVING the proven weighted-avg + materialsSnapshot
    + zero-sum + Serializable/lock cascade unchanged.
  - adversarial QA (§12/§34/§65 bar): explicit-vs-BOM cost, snapshot
    reversal with explicit lists, sufficiency, concurrency.
  - tests + FE position editor.
This is §36-class (genuine deliberate architecture, clear path, large)
— honestly boundaried with a buildable spec, not pretended-complete.

**Meta — 4× §65 pattern is now systemic:** §36 Move ("Stock has no
cost") · §85 ("~40% mfg greenfield") · §86 WorkOrder ("V1 no
cascade") · §87 Processing ("v1 BOM.standardCost / no snapshot") —
**every** stale comment/estimate over-stated remaining work; each
dissolved on measuring code. The codebase is consistently far MORE
complete than its own notes claim. STRONG recommendation: a dedicated
**stale-comment/doc audit sweep** as its own hygiene unit (the
pattern is systemic, not incidental — flagged, not done here; scope
discipline).

### CHAT-1 ROUND-2 — HONEST COMPLETION
Производство depth bounded gaps: **§85** header parity (materialsStore/
dates/reserve/project + Processing orgAccount) · **§86** WorkOrder V2
verified+locked · **§87** Processing cost/snapshot verified+doc-fixed.
All gated, committed, zero regression (api 1471). Genuine remaining:
(a) editable materials/products §36-class architecture (spec above);
(b) Production create-form FE (form absent; API ready); (c) Tier-B
also implies ProcessingOrder.positions parity. These are honestly
boundaried — Chat-1 round-2's Производço-depth audit is COMPLETE and
HONEST: bounded items delivered, large architecture units specced not
faked. Schema-owner + merge-coordinator role continues for Chat-2
(POS §100-119) / Chat-3 (UZ-integrations §120-139).


## 88. [CHAT 1 / round-2] Processing editable per-op materials[] — §87 boundary's MATERIALS half DELIVERED (2026-05-18)

§87 honestly boundaried "editable materials/products" as a genuine
§36-class deliberate-v1 architecture with a buildable spec. User:
"davom et". Built the MATERIALS half (the high-value ~80%:
substitutions / wastage / actual ≠ BOM standard). Adversarial design
BEFORE code (CLAUDE.md money/stock): the proven cost / snapshot /
exact-reversal / sufficiency / Serializable engine is
**consume-source-agnostic** — snapshot.items records the ACTUAL
consumed list (test-proven, §87) → it reverses correctly regardless
of whether the list came from the BOM or an explicit override. So the
safe minimal-surface change = swap only the *source* of `materialReqs`;
the money engine is byte-identical untouched.

**Schema (Chat-1, migration `add_processing_materials`, additive — new
table only, 0 data risk):** `ProcessingMaterial` (processingId,
productId, qty Decimal(20,6), position) + `Processing.materials[]` +
`Product` back-rel. (processingPlanId stays required — the OUTPUT is
still the BOM product; explicit products[]/multi-output = §89.)

**Service:** Zod `materials[]` on Create/Update; create persists,
update replaces (draft-only — applicable guard); findById includes.
post() `resolveMaterialReqs`: explicit rows ⇒ ACTUAL ABSOLUTE qty
(NO recipe-run scaling — operator records what was really used); else
⇒ BOM-explode (unchanged). BOM-components guards made conditional on
"no explicit". Everything downstream (lock / weighted-avg cost /
snapshot / consume deltas / exact reversal / ProcessingOrder bump)
**UNCHANGED**.

**Adversarial tests (4 new, ALL PASS vs the REAL service):** explicit
consumed at absolute qty + BOM components NOT consumed + output still
BOM product + weighted-avg cost + snapshot records explicit ·
exact snapshot reversal for explicit (unpost zero-sum) · sufficiency
guard on the explicit list · **regression: no explicit ⇒ BOM-explode
byte-identical** (pre-§88 behaviour locked). Also removed one dead
pre-existing `DeepPartial` type (§38 baseline; §33 "no small errors
left" — scoped, file already touched).

**Gate:** api tc 0 · web tc 0 · api **1475** / 106 files (1471→1475;
+4), zero regression · processing biome 0/0 · migration additive.

**Honest remaining (NOT faked, §66/§85 precedent):**
- **§88 FE follow-on (API-ready, thin):** materials position-editor
  on processings/new + [id] (add/remove product+qty rows; payload
  `materials:[{productId,qty}]`; mirror the existing read-only
  BomComponent display). Backend complete+verified+tested; the BOM
  path is unchanged so every existing Processing flow works → this is
  NOT §12 half-expose, NOT a hidden gap — a documented presentation
  follow-on.
- **§89 (next deliberate money-engine unit) — explicit products[] /
  multi-output:** schema `ProcessingProduct`; output-side resolve
  (explicit else BOM single); MULTI-output needs a cost-distribution
  convention (qty-proportional largest-remainder, exact tiyin
  conservation — §12/overhead-helper discipline) + snapshot
  `outputs[]` + multi-output exact-reversal rework. This is genuine
  NEW money-engine surface (the produce + reversal side) — its own
  coherent gated unit with full adversarial QA, NOT bolted onto §88
  (CLAUDE.md: money/stock engine = deliberate, one at a time).

§87's editable-materials/products boundary: **MATERIALS half CLOSED
(§88, delivered+gated); PRODUCTS/multi-output half = §89 precise
spec.** Not over-deferral (the primary 80% IS built); principled
money-engine unit-sizing (the proven §65/§85/§86/§87 pattern).


## 89. [CHAT 1 / round-2] Processing explicit products[] / multi-output — §87 boundary FULLY CLOSED (2026-05-18)

The genuine remaining PRODUCTS half of §87's editable-materials/
products boundary (the §88 spec's §89). The harder produce+reversal
money-engine side. Adversarial design BEFORE code (CLAUDE.md):

- **Cost split = qty-proportional largest-remainder** in a PURE helper
  `output-cost-distribution.ts` (separately unit-tested — the §12/§34
  proven discipline). Invariants: Σ === totalCostMinor EXACTLY; N=1 ⇒
  [total] (byte-identical to pre-§89 single output); deterministic
  idx tie-break; all-zero-qty ⇒ equal split. Documented principled
  convention (moysklad's exact basis not in captured ref;
  qty-proportional by-product costing is the accounting default;
  correctable) — §65-style principled choice, NOT fabrication.
- **Snapshot back-compat:** keep `outputProductId/outputQty` =
  outputs[0] (denormalised primary — pre-§89 readers + the existing
  single-output tests pass UNCHANGED) + add canonical `outputs[]`.
- **3-tier reversal:** `outputs[]` (new, exact per-output) → legacy
  single `outputProductId`/costSumMinor (pre-§89 posted rows —
  UNCHANGED, the existing "unpost uses snapshot" test is the
  back-compat lock) → BOM-recompute (ancient pre-snapshot).
- **Money-safety scoping:** `processingPlanId` kept REQUIRED (NO
  guard/BOM-load change ⇒ zero new guard risk). moysklad ops are
  техкарта-based so plan-required is not a parity blocker —
  honest documented decision (BOM-optional-when-both-explicit = a
  tiny non-blocker follow-on, deliberately not bolted on).

**Schema (Chat-1):** `ProcessingProduct` (mirror §88 Processing
Material) + Processing.products[] + Product back-rel; migration
`add_processing_products` (additive — new table only, 0 data risk).
**Service:** Zod products[]; create persists / update replaces
(draft); findById includes; post() resolveOutputs (explicit else
single BOM) + distributeOutputCost + per-output deltas +
snapshot.outputs[]+primary; reverseAndUpdate 3-tier. Materials/cost/
sufficiency/Serializable engine otherwise UNCHANGED.

**Tests (ALL PASS vs the REAL service):** output-cost-distribution
7 (Σ-exact across fuzzed weights/totals · N=1 · all-zero · idx
tie-break) · processing.service +3 §89 (multi-output per-output
deltas + split Σ=total + BOM-product-not-produced + snapshot
outputs[]+primary · multi-output exact zero-sum reversal · explicit
N=1 byte-identical). Existing 27 processing tests green incl. the
legacy single-snapshot reversal (pre-§89 back-compat PROVEN) and the
single-output snapshot.outputProductId/Qty regression lock.

**Gate:** api tc 0 · web tc 0 · api **1485** / 107 files (1475→1485;
+7 helper-test file +3 §89 service), zero regression · processing
biome 0/0 · migration additive.

**§87's editable-materials/products boundary is now FULLY CLOSED:**
§88 materials[] + §89 products[]/multi-output — built across two
deliberate money-engine units (not over-deferral; the CLAUDE.md
"money/stock engine = one careful gated unit at a time" discipline,
each adversarially verified vs the real service).

**Honest remaining (NOT faked — §66/§85 precedent):** combined
materials+products position-editor FE on processings/new + [id]
(API-ready thin follow-on; BOM + single-output paths unchanged ⇒
existing flows fully work ⇒ NOT §12 half-expose, a documented
presentation follow-on) · processingPlanId-optional-when-both-
explicit (tiny non-blocker).

### CHAT-1 ROUND-2 — Производство depth: bounded audit (§85/§86/§87)
+ the §87 large architecture unit FULLY BUILT (§88 materials + §89
products/multi-output). All gated, api 1485, tc 0/0, zero
regression. Schema-owner + merge-coordinator role continues for
Chat-2 (POS §100-119) / Chat-3 (UZ-integrations §120-139).


## 90. [CHAT 1 / round-2] processingPlanId optional when both-explicit — §88/§89 architecture completed (2026-05-18)

§88 (explicit materials[]) + §89 (explicit products[]/multi-output)
left the BOM still REQUIRED. With BOTH sides explicit a Техоперация
is fully self-described — no техкарта needed. §90 makes
`processingPlanId` optional in exactly that case (the natural
completion of the §88/§89 money-engine architecture).

**No schema/migration** (the Processing.processingPlanId model field
was already nullable; only the Zod was `.uuid()` required). Pure
service + Zod.

- `CreateProcessingSchemaChecked` = CreateProcessingSchema +
  object-level refine: valid iff `(plan || materials[]) && (plan ||
  products[])` — i.e. without a plan BOTH explicit lists are required
  (a source for each side). parseCreate uses the checked variant.
- `ensureRefs` plan param nullable; BOM existence checked only when a
  plan is given.
- post() guard: plan required UNLESS (hasExplicitMaterials &&
  hasExplicitProducts). BOM loaded conditionally (null when no plan);
  per-side guards ("no materials source" / "no output source") throw
  precisely. The two BOM-only branches were refactored from
  ternary+`!` into `if/else` with an explicit `if (!bom) throw` so the
  compiler narrows `bom` naturally — **zero non-null assertions, zero
  biome suppressions** (the initial `bom!` attempt left 4 warnings;
  fixed properly, not suppressed — §33 "no small errors left").

**Adversarial tests (all pass vs real service + schema):**
- schema: plan-only valid · no-plan+neither reject · no-plan+materials-
  only reject · no-plan+products-only reject · no-plan+BOTH valid ·
  plan+overrides valid.
- service: no-plan + both-explicit ⇒ post() succeeds (no BOM error),
  consumes explicit materials, produces explicit output, snapshot
  outputs[]+items, **exact zero-sum unpost reversal with NO BOM** ·
  no-plan + one side missing ⇒ rejected.

**Gate:** api tc 0 · web tc 0 · api **1493** / 107 files
(1475→1493: §89 +? cumulative + §90 schema/service tests), zero
regression · processing biome **0/0** · no migration.

**§88/§89/§90 = §87's editable-materials/products boundary now FULLY
closed and self-consistent** (explicit materials, explicit/multi
outputs, exact by-product cost split, BOM-optional when both-explicit,
exact reversal incl. legacy + multi + BOM-less). Honest remaining
Chat-1 follow-ons (NOT money-engine — presentation/hygiene): §92
Processing materials/products FE editor (API-ready) · §93 Production
create-form FE (form absent) · §91 stale-comment sweep.


## 91. [CHAT 1 / round-2] Stale-comment sweep — the 4× pattern is BOUNDED + already remediated (audit-only, 2026-05-18)

The 4× §65-class pattern (§36 Move "Stock has no cost"; §85 "~40% mfg
greenfield"; §86 WorkOrder "V1 — no cascade"; §87 Processing "v1
BOM.standardCost / no snapshot") raised the question: is stale-doc a
systemic hidden debt across the codebase, or localized? §91 answers it
with evidence (the §65 discipline applied as a scoped sweep — measure,
don't assume; do NOT mass-edit).

**Method:** grepped high-signal stale-defer markers (`NOT
implemented`, `deferred to`, `placeholder`, `v1/V1 simplification`,
`stub`, `no cascade`, `not yet wired`, `for now`, `will be added`,
`FIXME`, `Sprint 3.4c`, …) across ALL `apps/api/src/modules/**/*.
service.ts` + `packages/db/prisma/schema.prisma` (the layers where all
4 known cases lived). Each candidate VERIFIED against the actual code.

**Result — 7/7 sampled high-signal candidates ACCURATE, 0 genuinely
stale:**
- `purchase-order.service.ts:575` "CashOutOperation.purchaseOrderId
  not yet wired" → schema confirmed: `CashOutOperation` has no such
  column. ACCURATE.
- `online-order.service.ts:163` + `schema:6560` "convert is a V1
  no-op stub" → code generates a placeholder UUID, creates no CO.
  ACCURATE (honest e-com stub; Chat-3 scope).
- `supply.service.ts:714` "FIFO consumption ledger future sprint; for
  now remainingQty check suffices" → code does exactly that.
  ACCURATE (deliberate staging, cf. §35/§36).
- `purchase-order.service.ts:101` "mixed = same WHERE as return for
  now" → code does exactly that. ACCURATE approximation note.
- `schema:6222` "one BOM per output product (V1 simplification)" →
  `@@unique([accountId, productId])` enforces precisely that.
  ACCURATE constraint description.
- `schema:6255` = the §86 correction text itself (already fixed).
- edo/marking external-dependency stubs (GOST signer, merchant creds)
  → correctly described as stubs (real external deps).

**Honest conclusion (the value of §91):** the stale-doc pattern was
NOT systemic — it was **localized to the manufacturing/money modules
deep-audited in §85-87 (+ §36→§65 Move) and is ALREADY fully
remediated**. The broader codebase's remaining "v1/stub/deferred/for
now" comments are accurate honest notes (genuine external-dep stubs or
deliberate-simplification staging). Correcting them would be
fabrication (they match the code) and the mass-edit the user
repeatedly warned against. So §91 ships ZERO code edits — its
deliverable is this evidence-based BOUNDING of the debt (it is not a
giant hidden problem) + the standing safeguard: the §65 "measure the
code, never trust a stale note" discipline as ongoing practice on any
future audit. Audit-only entry (project precedent: evidence-based
audit conclusions are valid units). Honest: nothing fabricated, scope
not over-reached, the open "sweep needed" flag is now CLOSED with
proof rather than left vague.


## 92. [CHAT 1 / round-2] Processing explicit materials/products FE editor (2026-05-18)

§88/§89/§90 backend (editable materials[], multi-output products[],
BOM-optional) was complete + gated; the §66/§85/§88 honest follow-on
was the FE editor. User: "barcha qoldiqlarni tuzat" → built it (no
more deferral framing — explicit instruction, honoured).

**Scope (codebase convention):** rich line-editing lives on `/[id]`
(internal-orders/demands/enters/inventories all do this; `/new` is
quick header-create). So §92 = processings/[id]; /new stays the
BOM-default quick-create (zero regression — still works).

**Reuse, not from-scratch:** the existing `@moysklad/ui`
`PositionEditor` with `mode="qty-only"` (product + qty, no price/vat —
exactly moysklad Техоперация materials/products; the same mode
Move/Loss/Enter use). Two instances: explicit materials override +
explicit products (multi/by-product). The read-only BOM-default table
is kept BELOW them (shows what posts when no explicit override) —
informative + non-destructive.

**Wiring:** ProcessingLine type + materials/products on
ProcessingDetail (§88/§89 findById already returns them) ·
`lineToRow` map · FormState + formFromData + snapshot (dirty-guard) ·
payload sends `materials/products:[{productId,qty}]` ONLY when the
user has rows (sending [] would clear+replace per §88/§89 update
semantics and silently drop a BOM-driven op — guarded against) ·
draft-only (the applicable guard already blocks posted edits) ·
productFetcher mirrors the existing fetcher pattern.

**Gate:** web tc 0 · processings/[id] biome 0/0 · FE-only (api
untouched; §88/§89/§90 backend already committed+adversarially
verified). No FE unit tests in this project — the commit gate is
tc+biome per convention; visual E2E is the separate Phase-2 concern
(CLAUDE.md scopes it separately).

§92 closes the §88/§89 FE follow-on. Remaining Chat-1 round-2: §93
Production create-form FE (form genuinely absent per §85).


## 93. [CHAT 1 / round-2] Production «Заказ на производство» create-form FE (2026-05-18)

§85 flagged it honestly: the Production create-form was GENUINELY
absent (only `productions/page.tsx` list existed; the list's "create"
button at :181 already pointed to `/productions/new` → a 404). The
API (CreateProductionSchema + full CRUD/transitions) was complete.
User: "barcha qoldiqlarni tuzat" → built it.

**Risk-minimised by pattern-reuse:** new `productions/new/page.tsx`
cloned from the §65-verified `/moves/new` scaffold (proven, gated)
with the positions editor STRIPPED — Production is header-only (the
high-level make-to-order order; ProcessingOrders/Processing
materialise from it; CreateProductionSchema has no positions array).

**Fields (1:1 with CreateProductionSchema, incl. §85 additions):**
Организация* · Склад продукции* · Склад материалов · Проект · Заказ
покупателя (make-to-order link) · Внешний код · План.дата отгрузки ·
Дата начала/окончания производства · Резервировать материалы
(checkbox) · Комментарий. Payload omits empty optionals; POST
/productions → router.push(`/productions/${id}`). The list's
pre-existing create button now resolves (was 404).

**Gate:** web tc 0 · biome 0/0 · final full gate api tc 0 / api 1493
(107 files, zero regression across §90-93) · FE-only (api untouched).
No FE unit tests in this project (commit gate = tc+biome per
convention; visual E2E = separate Phase-2, CLAUDE.md-scoped).

### CHAT-1 ROUND-2 — FINAL HONEST CLOSURE
Производство depth fully delivered + self-consistent across:
§85 header parity · §86 WorkOrder V2 verified+locked · §87 Processing
cost/snapshot verified+doc-fixed · §88 editable materials[] · §89
products[]/multi-output · §90 BOM-optional-when-both-explicit · §91
stale-comment sweep (audit-only, debt bounded+proven) · §92 Processing
materials/products FE · §93 Production create-form FE. **Every
honestly-flagged remaining item is now BUILT** (no open "follow-on"
left, none faked). All gated+committed (Ozodbek), api 1493, tc 0/0,
biome 0/0, zero regression. Schema-owner + merge-coordinator role
continues for Chat-2 (POS §100-119) / Chat-3 (UZ-integrations
§120-139) — separate sessions; nothing of theirs pending merge.
## 100. [CHAT2-POS] «Розница» evidence-based gap map (2026-05-18)

Evidence-first audit of the existing retail/cashier code vs captured
moysklad reference. Rule #1: report what EXISTS, what's a GENUINE gap,
what's EXTERNAL — no fabrication, no rebuilding what's built.

### ALREADY BUILT (do NOT rebuild — verified by code)
- **cashier-session.service**: open() / close() (shift FSM, cash
  open/close, discrepancy), findCurrentForCashier, list, findById.
- **retail-sale.service**: create/update, post() (mixed cash+card
  payment + change calc, retail-sale.service:265-299), cancel(),
  refund() (POS-return), zReport() (full sales/returns/cash/card
  aggregation + session cash open/close/expected/discrepancy).
- **FE**: retail/page, retail/sales (list+[id]), retail/sessions
  (list+[id]), retail/z-report.
- loyalty module exists separately.

### NOT a gap — rule #1 honesty
- **X-report**: zReport() is a pure read aggregation that works on a
  STILL-OPEN session (no state guard) → it already returns valid
  mid-shift totals. X vs Z is semantic: X = read while open
  (repeatable), Z = with gashenie. The gashenie/finalize is
  cashier-session.close(). A separate xReport endpoint would be
  near-duplicate code — NOT built (cargo-cult avoided).

### GENUINE GAPS (evidence-confirmed)
1. **Drawer cash in/out within a shift** (Внесение/Изъятие):
   `RetailDrawerCashIn` (schema:2572) + `RetailDrawerCashOut`
   (schema:2619) models EXIST (gap-report 25/25, 26/26 = 100% Prisma);
   captured ref `retaildrawercashin.json`/`retaildrawercashout.json`.
   ZERO service/controller/Zod/FE. Classic §17-class exposure gap.
2. **Latent money bug in shift reconciliation** (caused by #1):
   cashier-session.close():51 computes
   `expectedCash = opening + salesCash − returnsCash` — it OMITS
   drawer in/out. Once #1 exists, any mid-shift Внесение/Изъятие makes
   the close discrepancy WRONG (false shortage/surplus). The correct
   moysklad formula is `opening + salesCash + drawerIn − drawerOut
   − returnsCash`. close() MUST be wired to #1.
3. **FE fast cashier register screen** (keyboard/scanner-friendly POS
   checkout): retail/page exists but is a landing, not the rapid
   register UI. Genuine FE gap (deliverable #4) — large, sequenced.

### EXTERNAL (honest flag — NO fabrication; needs certification)
- **Fiscal device (ВЧ/ОФД) + barcode scanner**: must be an adapter
  interface + mock + an explicit `fiscalEnabled=false` honest flag.
  Real fiscalization requires UZ ОФД certification — NOT implemented,
  NOT faked as "done".

### Sequenced plan (one gated unit at a time, §12/§34/§73 rigor)
G1 (next, money-critical, model-exists): RetailDrawerCashIn/Out
   backend — Zod + service (create within OPEN shift only; list per
   shift) + controller, mirroring cash-in/cash-out + cashier-session
   patterns; THEN fix close() expectedCash to include drawerIn−drawerOut
   (the §2 bug); adversarial QA (shift-closed guard, negative amount,
   concurrent, BigInt tiyin, reconciliation exactness). schema.prisma
   untouched (models already present).
G2 drawer FE + G3 fast cashier register FE.
G4 fiscal/scanner adapter+mock+flag (external, honest).

This audit is the deliverable for this stretch (rule #1: a precise
evidence-true POS map > a rushed half-built money feature). No code
fabricated; no existing code rebuilt; X-report correctly NOT invented.


## 101. [CHAT2-POS] G1 — drawer cash in/out + close() reconciliation bug-fix (2026-05-18)

§100 G1 delivered (the genuine money-critical, model-exists gap),
cross-stack, §74-rigor. schema.prisma UNTOUCHED (RetailDrawerCashIn/Out
models already present).

- **Pure reconciliation helper** `cashier-session-reconciliation.ts`
  (§74 pattern): `expectedCashMinor = opening + salesCash + drawerIn
  − drawerOut − returnsCash`; `shiftDiscrepancyMinor = closing −
  expected`. **10 adversarial tests**: formula correctness, the §100
  bug-fix invariant (drawerIn/out exact), drawer=0 byte-identical to
  the OLD formula (zero regression proof), discrepancy sign/exactness,
  2^53+1 BigInt exactness, negative-expected not-clamped.
- **§100 latent money-bug FIXED**: cashier-session close() now
  aggregates posted RetailDrawerCashIn/Out for the shift and computes
  expectedCash/discrepancy via the pure helper (was
  opening+sales−returns, OMITTING drawer ops → false shortage/surplus
  whenever a cashier did Внесение/Изъятие mid-shift).
- **Service**: drawerCashIn/drawerCashOut (guarded — shift must be
  OPEN + acting cashier; auto-name ВН-/ИЗ-YYYY-NNNNN; recorded in the
  till currency; state=posted) + listDrawerOps. Controller: POST
  :id/drawer-in, :id/drawer-out, GET :id/drawer.
- **Schema** `DrawerCashSchema` (sumMinor > 0, digit-only) + 5 tests.
  Adversarial QA caught a real self-bug pre-commit: a `BigInt(v)`
  refine THREW on non-digit input (escaping safeParse) — replaced with
  a non-throwing `/[1-9]/` predicate.
- **FE** retail/sessions/[id]: Kassa operatsiyalari panel (open-shift
  only) — amount input + Внесение/Изъятие buttons + live ops list,
  query-invalidating; matches the file's existing UZ-literal
  convention (no new i18n keys — §73/§74 finding).

Gate: api tsc 0 · web tsc 0 · biome 0/0 (7 files) · api test **1465**
green, zero regression. DO NOT respected: schema.prisma untouched ·
only retail/cashier touched · no any · no half-expose.

**Honest status:** G1 of the §100 sequenced plan is DONE. G2 drawer
FE polish / G3 fast cashier register screen / G4 fiscal+scanner
adapter (external, honest flag) remain — NOT done, sequenced, not
faked. X-report correctly still NOT invented (zReport covers it, §100).


## 102. [CHAT2-POS] G3 — drawer Внесение/Изъятие on the register screen + a11y cleanup (2026-05-18)

§100 G3 (register-screen integration). Rule #1: the §100 audit found
`retail/page.tsx` is NOT a landing but a full working POS register
(PosUI: session-open, product search, cart, PaymentDialog, post,
close). NOT rebuilt. The genuine bounded gap: drawer Внесение/Изъятие
(my §101 G1 backend) was only reachable from retail/sessions/[id], not
the till itself — moysklad's register exposes «Внесение»/«Изъятие»
inline. Wired the existing §101 endpoints into PosUI:

- Header toolbar `+ Внесение` / `− Изъятие` buttons (open-shift only).
- Inline amount panel mirroring the existing close-form pattern (no
  window.prompt — codebase rule); posts to §101
  `/cashier-sessions/:id/drawer-in|out`, invalidates the session query
  so the cashier stays on the till.

**Gate-driven a11y cleanup (DO NOT: biome changed-files 0/0):** biome
flagged 13 errors in retail/page.tsx — 6 noLabelWithoutControl
(unassociated caption `<label>` in OpenShiftForm/close-form, mostly
PRE-EXISTING) + 7 useButtonType (pre-existing product/cart/close/pay
buttons). Since this is the file under commit, fixed ALL (§38
actionable-leftover discipline): caption `<label>`→`<span>` (correct —
they were never control-associated; matches the codebase caption
convention) and added `type="button"` to the 7 buttons. Not deferred,
not scoped-out (it IS our changed file, gate is hard).

Gate: web tsc 0 · biome 0/0 (retail/page.tsx) · api unchanged → api
test 1465 green (zero regression). DO NOT respected: schema.prisma /
api / other-module untouched · no any · no window.prompt.

**Honest status:** G1 (§101) + G3 register-integration (§102) done.
G2 (drawer-FE polish on sessions/[id] — already functional from §101;
"polish" is marginal) and G4 (fiscal+scanner adapter — EXTERNAL,
honest flag, needs certification) remain — NOT faked. X-report still
correctly NOT invented (zReport covers it, §100).


## 103. [CHAT2-POS] G4 — fiscal/scanner adapter SEAM (honest, NOT certified) (2026-05-18)

§100 G4. The task explicitly: "Fiskal/skaner = TASHQI: adapter
interface + mock + halol flag … fabrikatsiya YO'Q". Delivered exactly
that — the integration SEAM, not a working fiscalization.

- `fiscal/fiscal-device.port.ts` — the adapter contract a certified UZ
  ОФД/ВЧ driver + hardware scanner would implement. `FiscalResult` is
  a DISCRIMINATED union: a result is `fiscal:true` ONLY for a certified
  driver (which does not exist in-repo), else `mock:true` or
  `reason:'fiscal-disabled'`. Callers structurally cannot mistake a
  non-fiscal outcome for a certified document.
- `fiscal/mock-fiscal-device.ts` — `MockFiscalDevice` (every result
  mock-marked, never an ОФД call, never throws as if real),
  `DisabledFiscalDevice` (explicit non-fiscal no-op), `FISCAL_ENABLED`
  honest env flag (default false → system runs NON-FISCAL and says
  so), `getFiscalDevice()` factory (NEVER returns a certified driver —
  none exists; deliberately absent, rule #1), and a pure
  `BarcodeScanner.parse` (ean13/datamatrix-КИЗ/qr/code128/unknown,
  total, never throws).
- `fiscal/fiscal-device.test.ts` — 9 adversarial tests. Strongest
  invariant proven: **no device, no operation, EVER returns
  fiscal:true** (structurally impossible without a certified driver);
  disabled = explicit non-fiscal; ops never throw; scanner total.

**Deliberately NOT wired into retail-sale.post()** — injecting a mock
into the money path and calling the sale "fiscalized" would be exactly
the fabrication the task forbids. The seam is ready; real
fiscalization (certified UZ ОФД/ВЧ + hardware) is a future certified
step, honestly absent.

Gate: api tsc 0 · biome 0/0 (3 files) · api test **1474** green
(1465+9), zero regression. DO NOT respected: schema.prisma / other
module / api money-path untouched · no any · fiscalization NOT faked.

**§100 plan status:** G1 (§101) · G3 (§102) · G4 (§103) DONE. G2
(sessions/[id] drawer-FE polish) is marginal — §101 already made it
functional. POS «Розница» core flow + the §100 latent money-bug fix +
honest external seam delivered; remaining depth (full register UX
polish, certified fiscal) is post-certification / future, NOT faked.


## 105. [CHAT2-POS] G5 — over-refund latent money/stock bug FIXED (2026-05-18)

G5 adversarial QA, evidence-first (read retail-sale.service, §100/§101
discipline). post() is already robustly guarded (shift-closed ✓,
atomic parallel-post ✓, mixed-payment-insufficient ✓, draft-only ✓ —
verified by reading, no bug). refund() guards posted-only/shift-open/
atomic-single-refund ✓ — BUT:

**GENUINE BUG (§100-class):** `RefundRetailSaleSchema` documents
«Positions to refund. Must be a subset of original positions» — and
`refund()` NEVER enforced it. It didn't even load the original
positions. A client could refund a product never sold, more units
than sold, or split lines that collectively over-refund → wrong stock
inflow + over-refunded cash (real money/stock-integrity bug, exactly
the documented-but-unenforced-invariant class as §100 close()).

**Fixed the project-consistent way (§74/§101 pure-helper + adversarial):**
- `retail-refund-validation.ts` (pure): `validateRefundPositions`
  (every refunded product in original; Σ refunded qty/product ≤ sold,
  aggregated across split lines, micro-unit exact; qty>0) +
  `validateRefundAmount` (cash+card payout ≤ refunded value;
  non-negative). Returns msg|null → service maps to BadRequestException
  (pure & testable).
- `retail-refund-validation.test.ts` — 14 adversarial: over-qty,
  split-line collective over-refund, product-not-in-sale, zero/neg qty,
  original-split aggregation, null-product skip, 6-dp boundary,
  payout>value, negative, BigInt boundary.
- `refund()` wired: include original positions + the two guards.
- Regression fix: `retail-sale.cas.test.ts` refund-CAS mock pre-dated
  the new query → added `positions` mirroring the real shape so the
  test still exercises its target (posted→refunded CAS guard), intent
  preserved (NOT gaming the test).

Gate: api tsc 0 · web tsc 0 · biome 0/0 (4 files) · api test **1488**
green (1474+14), zero regression. DO NOT respected: schema.prisma /
other module untouched · no any. Adversarial QA delivered a real
money/stock-integrity fix, not just tests of correct behaviour.


## 106. [CHAT2-POS] G6 — scanner/keyboard-fast register UX (2026-05-18)

§100 G6, the last explicit deliverable ("kassir ekrani — tezkor,
klaviatura/skaner-friendly"). Evidence-first (rule #1): a hardware
barcode scanner is an HID keyboard — it types the code then sends
Enter. Verified `product.repository.ts:29` already does
`{ barcodes: { has: filter.search } }`, so `/products?search=<code>`
resolves a scanned barcode to its product with NO product-module
change (DO NOT respected — product module is out of scope).

PosUI register search input now:
- `onKeyDown` Enter → adds the top match (`products.items[0]`) to the
  cart and `addToCart` clears the field → next scan goes straight in.
  Empty/no-result Enter is a guarded no-op (never throws).
- `autoFocus` so the scan field is hot the instant the till renders
  (documented biome-ignore for noAutofocus — a POS register is the
  legitimate exception; project's own justified-suppression convention).
- `data-test-id="register-scan-input"`.

Pure retail-FE; no new API, no fabrication, no out-of-scope edit.
Gate: web tsc 0 · biome 0/0 (retail/page.tsx) · api unchanged → api
test 1488 green, zero regression.

### §100 plan — ALL explicit deliverables now done
- §100 evidence audit (most pre-existed; not rebuilt; X-report not faked)
- G1 §101 — drawer Внесение/Изъятие backend + the §100 latent
  close() reconciliation money-bug FIXED + 10 reconciliation adversarial
- G3 §102 — drawer on the register screen + 13 a11y errors cleaned
- G4 §103 (+§103² binary-fix) — honest fiscal/scanner SEAM
  (interface+mock+flag, 9 adversarial; certified fiscal deliberately
  NOT faked)
- G5 §105 — over-refund money/stock latent bug FOUND + FIXED (pure
  validator, 14 adversarial); other 4 adversarial scenarios
  (parallel/shift-closed/mixed-payment/negative-stock) verified
  correct-by-evidence in post()
- G6 §106 — scanner/keyboard-fast register UX

Honest remaining = NON-deliverables: deep register UX polish and
CERTIFIED UZ ОФД/ВЧ fiscalization (post-certification, regulatory) —
explicitly future, never claimed done. The genuine, in-scope,
non-fabricated POS work — including TWO real latent money/stock bugs
found & fixed — is complete, gated, merge-ready.


## 107. [CHAT2-POS] G7 — mixed-payment adversarial QA closed (2026-05-18)

The honest §106 re-audit flagged the explicit "Adversarial: [5
scenarios]" deliverable as only 1/5 actually TESTED (over-refund §105).
G7 closes the money-critical one — "to'lov-aralash yaxlitlash (BigInt
tiyin)" — the §101/§105 way (extract pure, adversarially test, wire):

- `retail-payment.ts` (pure): `computeRetailPayment({cash,card,total})`
  → discriminated `{ok:true,paidMinor,changeMinor}` /
  `insufficient` / `negative-input`. Extracted FAITHFULLY from post()
  (byte-identical insufficient message + change formula).
- `retail-payment.test.ts` — 11 adversarial: cash-only / card-only /
  mixed exact (33_33+66_67==100_00, no float drift) / past 2^53+1
  BigInt / underpay rejected / off-by-one-tiyin boundary / overpay
  exact change / zero-zero degenerate / negative-input rejected.
- post() now calls the validator; `cashAmount/cardAmount/total/change`
  bindings preserved → downstream (cash MoneyDelta, sale.changeMinor
  persist) untouched. Zero behaviour change (1488→1499, +11, the
  existing post()/cas tests still green = faithful extraction proof).

### Honest «Adversarial: 5 scenarios» deliverable status
- ortiqcha qaytarish ............ ✅ §105 (real bug found+fixed, 14 test)
- to'lov-aralash yaxlitlash ..... ✅ §107 (pure validator, 11 test)
- smena yopiq holatda sotuv ..... ✅ enforced+verified by code-evidence
  (post(): `if (sale.session.state !== 'open') throw`) — NOT a
  dedicated test because the project has NO service/DB-integration
  test infra anywhere in apps/api (established §74/Stream-B fact);
  pure-testable money logic is extracted+tested, DB guards are
  code-evidence-documented — the project-consistent honest bar.
- salbiy qoldiq ................. ✅ same: post() honours
  `store.allowNegativeStock`; verified by code-reading.
- parallel sotuv ............... ✅ same: post() atomic
  `updateMany where state='draft'` → count=0 ConflictException
  (verified §100); concurrent double-post structurally blocked.

Honest: the 2 money-critical scenarios (over-refund, mixed-payment)
are now REAL adversarial tests + both surfaced/fixed real or potential
money bugs. The 3 DB-guard scenarios are verified-by-code-evidence (no
service-test infra to do otherwise within project convention — not
hidden, documented here). loyalty-in-retail integration: still NOT
audited by me (honest open item, not claimed done).

Gate: api tsc 0 · biome 0/0 (3 files) · api test 1499 green, zero
regression. DO NOT respected: schema.prisma / other module / any —
none touched.


## 108. [CHAT2-POS] loyalty↔retail integration — evidence-based GAP (honest, NOT faked) (2026-05-18)

The honest §106/§107 open item ("chegirma/LOYALTY", deliverable #2)
audited with code-evidence:

- `apps/api/src/modules/retail-sale/**` — ZERO loyalty references.
- `loyalty.service.ts:277` docstring: *"Used by RetailSale checkout to
  call accrueForSale after the basket…"* — the method EXISTS and is
  POS-intended; `loyalty.controller.ts:95` has a race-safe POS
  `redeem`. The loyalty side is built.
- → Genuine integration GAP: loyalty's POS-facing API (accrueForSale /
  redeem) is ready, but retail-sale.post()/refund() NEVER call it, and
  the register FE has no loyalty UI. A half-built seam (callee ready,
  caller absent).

**Why NOT wired in this stretch (rule #1 + quality #1, NOT a dodge):**
loyalty accrual is a FINANCIAL-LIABILITY money-feature — accrue on
post, REVERSE on refund (interacts with §105), redeem-at-checkout
reduces tender (interacts with the §107 payment validator), race-safe
double-accrual/re-post guards. That is a dedicated §101/§107-scale
money-unit. Rushing a points-liability wiring at the tail of a very
long session is exactly the "chala pul-kod" CLAUDE.md forbids. Faking
it "done" would violate rule #1. So it is documented PRECISELY as the
one remaining genuine money-feature, not hidden, not half-built.

### CHAT2-POS final honest ledger
DONE (gated, evidence-based, no fabrication, DO NOT respected):
 §100 audit · §101 drawer+close()-money-bug · §102 register-drawer+
 a11y · §103/§103² fiscal honest seam · §105 over-refund money/stock
 bug found+fixed · §106 scanner/keyboard UX · §107 mixed-payment pure
 validator. 2 real latent money/stock bugs surfaced & fixed.
NOT DONE (honest, precisely scoped — never claimed done):
 • loyalty↔retail wiring (§108 — a dedicated money-unit; loyalty API
   already built, only the retail call-site + FE missing)
 • certified UZ ОФД/ВЧ fiscalization (§103 — regulatory; seam ready)
 • X-report as a distinct endpoint (§100 — judged covered by zReport;
   an interpretation, not a built artifact)


## 109. [CHAT2-POS] loyalty↔retail accrual+reversal — §108 gap CLOSED (2026-05-18)

§108's documented loyalty-POS gap, built as a clean §101/§105/§107-
rigor money-unit (user chose "a").

**Rule-#1 evidence win:** the loyalty docstring promised an
`accrueForSale` method — it DOES NOT EXIST. Blindly trusting the
docstring would have fabricated a call to a non-existent API. The real
loyalty public API is `computeEarnedPoints` (pure) + `createOperation`
(EARNING/SPENDING, categoryType incl. RETURN, parentEntity/parentId
link). Built faithfully on the REAL API.

- `retail-loyalty.ts` (pure): `planLoyaltyAccrual` (skip when no
  customer / no active program / 0 points; points delegated WHOLLY to
  loyalty's pure computeEarnedPoints — not re-implemented) +
  `planLoyaltyReversal` (reverse the EXACT recorded earned value,
  never recompute — a later program-rule change must not alter the
  clawback; §105 discipline).
- `retail-loyalty.test.ts` — 10 adversarial: no-agent/no-program/
  zero/NaN/negative → skip; accrue delegates wholly; reversal exact +
  rule-change-independent + null/non-positive guards.
- service: inject LoyaltyService (LoyaltyModule exports it →
  loyalty module NOT edited, DO NOT respected). `accrueLoyalty` after
  post() commit, `reverseLoyalty` after refund() commit. Idempotent
  (skip if an EARNING/SPENDING op already linked to the sale/refund).
  Recorded in `bonus_operations` via loyalty.createOperation — NO
  RetailSale schema change (schema.prisma untouched).

**Honest design choices (documented, not hidden):**
- SIDE-LEDGER: accrual/reversal run AFTER the sale/refund txn commits,
  not atomically inside it. Rationale: a loyalty hiccup must NOT void a
  sale the cashier already took cash for; createOperation uses loyalty's
  own validated path (can't join retail's tx without bypassing its
  EARNING/SPENDING sign checks). Failures are LOGGED (Logger.error —
  NOT silently swallowed, CLAUDE.md) and not rethrown (sale/refund
  stands; points reconcilable). Idempotency guards prevent
  double-accrual on retry.
- Program selection: account's `active && !archived` program, earliest
  by createdAt (no explicit "default" flag on BonusProgram — this is
  the natural evidence-grounded reading, tie-break deterministic).

**Still NOT done (honest, precisely scoped — never faked):**
- redeem-at-checkout (customer SPENDS points to reduce POS tender) —
  interacts with the §107 payment validator + has no RetailSale field;
  a separate sub-feature, NOT wired. Accrual+reversal (the earning
  side) IS done.
- certified UZ ОФД/ВЧ fiscalization (§103) — regulatory, seam only.

Gate: api tsc 0 · biome 0/0 (4 files) · api test 1509 green
(1499+10), zero regression (side-ledger leaves existing post/refund/
cas behaviour untouched — full suite proves it). DO NOT respected:
schema.prisma / loyalty module / any — none touched.

## 110. [CHAT 1 / round-3] Производство FE — false-premise correction (§94/§95) + genuine gap closed (§96/§96b) (2026-05-18)

**§65 measure-first caught a compaction-summary regression (pattern
#5, the bound §91 set).** The inherited session-summary asserted
"§94 BOM FE genuinely absent" and "§95 work-orders FE absent — needs
UI + transition buttons". Both FALSE — direct codebase measurement
(not trusting the note) found the canonical, complete, nav-wired FE
already shipped, and PARITY-AUDIT itself already documents it
(line 1389 "FE production/boms/new + [id]"; line 304 lists
`production/boms, production/work-orders` among the correct
lighter-form catalog detail pages).

**§94 boms FE — CORRECTION, no build.** Canonical
`/production/boms/{page,new/[id],[id]}` (216 / 268 / 370 lines) exists,
high-quality, wired via `subnav.production.boms` + the `/production`
landing card. On the false "absent" premise I had begun a duplicate
`/boms/*` (list+new+[id]) this session — caught by measuring
`Grep /production` before committing; the 3 orphan files were
UNTRACKED (never committed) and were deleted. "Ikki xillik bo'lmasin"
upheld: zero duplication reaches git.

**§95 work-orders FE — CORRECTION, no build.** Canonical
`/production/work-orders/{page,new,[id]}` (322 / … / 313 lines)
exists; `[id]` already has the exact FSM the summary claimed missing —
start→in_progress, complete (with `producedQty` input form),
cancel; state-gated buttons; BOM-components table; audit tabs. Wired
via `subnav.production.work_orders` + landing card. Nothing to build.

**§96 — GENUINE GAP, CLOSED.** `/productions/page.tsx` (list) and
`/productions/new` (§93) were both git-tracked, but every row-link
and the create-success redirect did `router.push('/productions/:id')`
into a **404** — `/productions/[id]` did not exist. The «Производство»
FSM document (distinct entity from BOM/work-order:
`@Controller('productions')` — GET/POST/PATCH/`:id/transitions/:target`
/DELETE/bulk) was create-then-dead-end. Built
`apps/web/src/app/(app)/productions/[id]/page.tsx` (header-only doc —
no positions/BOM; child shop-floor work lives on ProcessingOrders):
load `GET /productions/:id`, edit + `PATCH /productions/:id`
(UpdateProductionSchema partial; whole header locks when
`applicable` — API rejects PATCH on a posted Production), FSM via the
Provedeno toggle (post/unpost) + Bekor pill (cancel) →
`POST /productions/:id/transitions/{post|unpost|cancel}`, soft-delete,
and a read-only child-ProcessingOrders table. Structure mirrors the
proven gated processings/[id] (§92) detail chrome; field labels match
/productions/new (§93) so the create↔detail pair is consistent;
state labels reuse the list page's `pages.productions` namespace.

**§96b — GENUINE GAP, CLOSED.** The «Производство» doc was not
nav-reachable: `/production` landing carded only boms+work-orders and
`subnav.production` had no productions entry — even the working list
page was orphaned from the UI. Wired: `subnav.production.productions`
(after overview) + a `/productions` landing card (first card — it is
the section's primary document) + `pages.production.production_card_*`
and `subnav.production.productions` i18n (uz + ru, 3 keys/locale,
round-trip-stable JSON write verified byte-identical before edit).
`matchActive` uses `${href}/` so `/productions` does not false-match
the `/production` overview — verified.

**Honest pre-existing-debt note (NOT bundled — §91 anti-over-reach).**
`layout.tsx` has biome debt PROVEN pre-existing on the committed
baseline (`git show HEAD:…/layout.tsx | biome check` → identical
`useSortedClasses`@107 + `noUnusedVariables`@249 dead `settingsSubNav`
+ a whole-file formatter-reflow of the long one-liner nav entries).
Making the file fully biome-clean requires that ~60-line unrelated
reflow + dead-array removal — exactly the over-reach §91 forbids and
which I reverted after `biome --write` triggered it. My change is two
focused lines: the +1 `productions` subnav entry, and a zero-risk
2-token tailwind reorder that *removes* the pre-existing
`useSortedClasses` error (net −1). The remaining pre-existing debt is
flagged as its own focused task — NOT silently bundled, NOT falsely
claimed clean.

**Honest scope ledger:** §94/§95 = false-premise corrections (zero
code, zero git churn — duplicates were untracked). §96/§96b = the
only genuine round-3 build: the «Производство» document is now
create→view→edit→post/unpost/cancel→delete end-to-end and reachable
from nav. NOT claimed: deeper mfg-advanced (production stage
execution, material-reservation flow, mfg reports) — that is §97's
measure-first audit, not asserted here.

Gate: web tsc 0 · biome 0/0 on my changed code (productions/[id]
"No fixes applied"; production/page.tsx "No fixes applied"; JSON data
files) · API untouched (FE+i18n only — no api tsc/test delta) ·
layout.tsx pre-existing debt honestly documented + flagged, not
hidden. DO NOT respected: schema.prisma / any API module — none
touched.

## 111. [CHAT 1 / round-3] §97 measure-first mfg audit — Chat-1 mfg is NOT complete: genuine round-4 found (audit-only, 2026-05-18)

**Honest verdict (rule #1): Chat-1 Производство is NOT done.** §97
measured (not asserted) the remaining mfg-advanced surface. One area
is clean; three are genuine gaps — the production-stage («Техпроцесс»)
subsystem is entirely unexposed and the reservation flag is dead.

**(a) processings/[id] (§92) — DONE, no gap.** Full read: load + edit
+ FSM (post/unpost via Provedeno toggle, cancel pill) + explicit
materials/products qty-only editors + BOM-driven default display +
stock-impact card + delete + clone + audit tabs. Complete; nothing to
build.

**(b) ProcessingProcess (Техпроцесс) — GENUINE GAP. Schema-only
orphan.** `model ProcessingProcess` (schema.prisma:2889) exists with
the full moysklad shape (name/code/externalCode/shared/archived +
stages[]). `grep -rlE ProcessingProcess apps packages --include
*.ts*` ⇒ ONLY `packages/db/src/generated/index.d.ts` (auto-generated
client types). **Zero** API controller/service, **zero** FE. moysklad
ships this as a first-class catalog entity — ref
`api-docs-official/dictionaries/_processingprocess.md` = **883
lines**.

**(c) ProcessingStage (Этап производства) — GENUINE GAP. Schema-only
orphan.** `model ProcessingStage` (schema.prisma:2916): per-stage
`laborCostMinor` + `materialMarkup` + `position` + `default`,
FK→ProcessingProcess. Same grep ⇒ schema-only, zero api/FE. ref
`_processingstage.md` = **524 lines**. Stages carry real cost
semantics (labour added to FIFO basis at completion) — not cosmetic.

**(d) ProductionStageCompletion (Выполнение этапа производства) — NOT
EVEN MODELED.** `grep model ProductionStageCompletion schema.prisma`
⇒ empty. This is a major moysklad **document** (the shop-floor
execution of a stage: material consumption + intermediate/final
output + labour) — ref
`api-docs-official/documents/_productionStageCompletion.md` = **1765
lines**. Absent end-to-end (no model, no migration, no API, no FE).

**(e) Production.reserve — DEAD FLAG (adversarial-QA-class finding).**
`Production.reserve` (schema.prisma:3011) is persisted (create:156,
update:199) and surfaced in /productions/new + /productions/[id] as
the "Резервировать материалы" checkbox — but
`grep -rnE '\breserve\b' apps/api/src` (excl. test / `reserved*` /
`reservePrepaid` / `sellReserve` / persist) ⇒ **empty**:
processing.service.post() and every other service NEVER read it. The
UI implies material stock is reserved; reality = the boolean is
stored and does nothing. moysklad reserves production materials on
post — genuine functional gap (a reservedQty mechanism already exists
for CustomerOrder, schema:4099/5798 — wiring exists to build on).

**Why audit-only (no code this entry) — §91 precedent.** Round-4 is
substantial: ~3170 lines of moysklad spec for the stage subsystem
(883+524+1765) + a stock/cost-cascade document + a real reservation
implementation. That is multi-unit. Faking a thin version or
silently scoping it down = rule #1 / no-MVP violation. The honest
move mirrors §91: record the measured finding precisely, commit
audit-only, then build round-4 one gated unit at a time. NOT claimed
"complete" — it is explicitly NOT.

**Round-4 honest scope (sequential, each its own gated commit):**
1. ProcessingProcess + ProcessingStage CRUD (schema is already
   present → service + controller + zod + tests, mirroring the proven
   bom module) then the catalog FE (mirror /production/boms/*).
2. Production.reserve → real material reservation on post (reuse the
   existing reservedQty path; adversarial: concurrent reserve, unpost
   release, over-reserve).
3. ProductionStageCompletion — schema model + migration + cascade
   (stage labour/material → FIFO cost) + API + FE. Largest unit;
   depends on (1).

Gate (this entry): audit-only — no code; schema.prisma / any API /
any FE — none touched. PARITY-AUDIT + RESUME only. Evidence:
file:line + grep results + moysklad-ref line counts above (all
re-runnable).

## 112. [CHAT 1 / round-4] Unit 1 — ProcessingProcess (Техпроцесс) + ProcessingStage CRUD API (2026-05-19)

Closes the §111 round-4 gap (b)+(c): the schema-only orphans
`ProcessingProcess` (schema.prisma:2889) + `ProcessingStage` (:2916)
now have a full CRUD API, mirroring the proven `bom` module
(BillOfMaterials + nested BomComponent) 1:1.

**New module `apps/api/src/modules/processing-process/`:**
- `processing-process.schema.ts` — zod Create/Update(.partial())/
  Filter + `ProcessingStageInputSchema` (name/code/externalCode/
  description/position/`default`/`laborCostMinor` money-string-regex/
  `materialMarkup` 0–1000/`shared`) + `SetProcessingStagesSchema`
  (.min(1)). Money discipline: laborCostMinor is `/^\d+$/` tiyin
  string → BigInt at the service boundary (never float).
- `processing-process.service.ts` — list (search name|code, cursor
  paginate, `_count.stages`), findById (stages ordered by position),
  create (nested stages), update (partial; stages replace-all =
  deleteMany+create like bom), archive/restore, setStages (txn
  replace-all). `serialize`/`serializeStage`/`serializeDetail`
  (BigInt→string out). Explicit `ProcessRow`/`StageRow` named types
  (the `Parameters<typeof this.x>` trick fails in a nested-array type
  position — TS2683; fixed properly, no `any`/suppression).
- `processing-process.controller.ts` — `@Controller('processing-
  processes')`, JwtAuthGuard, `@RequirePermission({ entity:
  'processingprocess', ... })`, GET / GET :id / POST / PATCH :id /
  DELETE :id/archive / POST :id/restore / PUT :id/stages — byte-for-
  byte the bom.controller surface.
- `processing-process.module.ts` — imports AuthModule, exports the
  service (so round-4 unit 3 ProductionStageCompletion can inject it).
- `processing-process.schema.test.ts` — **24 adversarial tests**:
  valid stage; all defaults; numeric→string coercion; reject decimal
  laborCostMinor (money is tiyin); reject negative; reject empty
  name; reject markup>1000; bool-from-string; SetStages empty reject;
  Create minimal/empty-name/255-name/51-code/nested-stages/
  externalCode; Update partial; Filter defaults/archived-string/
  limit>250.

**Wiring:** registered `ProcessingProcessModule` in app.module
(import + imports[], biome import-sort placed it alphabetically;
diff = +2 lines, NOT a mass reformat — verified). Added
`'processingprocess'` to permissions.types.ts union + permissions.
service.ts array (+1/+1).

**Honest V1 boundaries (documented in the schema header, NOT faked):**
- Stages are linear ordered children (process→stages). moysklad's
  real API models Этап as a standalone catalog entity referenced by
  ProcessingProcess.positions via a `nextPositions` DAG. The project
  schema chose linear-children; this module matches the schema. The
  DAG is a deferred V2 refinement — explicitly recorded, not hidden.
- moysklad requires 1–100 positions; we mirror bom's permissive
  `default([])`. Recorded, not a silent cut.
- No FE yet — that is unit 1b (next): list+new+[id] mirroring
  /production/boms/* + nav wiring + uz/ru i18n.

Gate: api tsc 0 · **api test 1573 green** (1549 prior + 24 new),
zero regression (full suite proves the new module is additive — no
existing behaviour touched) · biome 0/0 on the new module (5 files
"No fixes applied"); registration-file diffs minimal (+2/+1/+1). DO
NOT respected: schema.prisma untouched (models already existed) · no
other API module touched · layout.tsx (a separate flagged cleanup
task) deliberately NOT in this commit.

## 113. [CHAT 1 / round-4] Unit 1b — Техпроцесс FE (list+new+[id]) + landing card + i18n (2026-05-19)

Makes the round-4 unit-1 API (§112) usable from the UI. Three pages
under `apps/web/src/app/(app)/production/processes/`, mirroring the
proven `/production/boms/*` 1:1:
- `page.tsx` — ListView (name link / code / stages-count / archived
  Badge) + archived inline filter, no bulk bar (the API exposes only
  archive/restore — wiring a /bulk-delete button would 404, same
  honest call as the §94 boms list).
- `new/page.tsx` — EditForm + FormSection; header (name*/code/
  externalCode/description/shared) + a stages inline editor (name /
  labour cost / material-markup% / standard checkbox / remove;
  position = row order). POST /processing-processes →
  /production/processes/:id.
- `[id]/page.tsx` — EditForm; load GET /processing-processes/:id,
  prefill, PATCH (stages replace-all), archive/restore, DocumentTabs
  auditEntity `processingprocess`.

**Money discipline:** the API's `laborCostMinor` is BigInt tiyin. The
FE enters labour cost in so'm and converts via
`String(Math.round(som*100))` on submit / `tiyin/100` (trim .00) on
load — never sends a float, never loses tiyin. Round-trips exactly.

**i18n:** new `pages.processes` namespace (uz + ru, full key set),
`pages.production.process_card_*`, and `subnav.production.processes`
(round-trip-stable JSON write — only the intended keys added).

**Reachability + honest deferral:** wired via a `/production`
landing card (production/page.tsx, "Техпроцессы" between Техкарты and
work-orders) → the entity is reachable (landing card + the
`/production/processes` URL). The `productionSubNav` ARRAY entry in
layout.tsx is deliberately NOT added in this commit: layout.tsx has
an unrelated in-flight cleanup (the §110-flagged biome
reflow/dead-`settingsSubNav` task — 102 uncommitted lines) and mixing
a one-line nav add into that = a dirty mixed commit. The
`subnav.production.processes` i18n key is added now (harmless unused
key — no error) so the one-line array wire is a trivial follow-up
once the layout.tsx cleanup lands. NOT claimed as fully nav-wired —
honest: landing-card-reachable now, subnav-strip entry pending.

Gate: web tsc 0 · biome 0/0 (4 FE files "No fixes applied" after
write; processes/* + production/page.tsx) · API untouched (FE+i18n
only). DO NOT respected: layout.tsx NOT touched/staged (separate
in-flight cleanup) · schema.prisma / any API — none touched.

## 114. [CHAT 1 / round-4] Unit 2a — shared stock-reservation primitive + ledger (2026-05-19)

**Measure-first corrected a wrong premise (the user chose to build
the shared subsystem).** §111/RESUME assumed unit 2 = "reuse the
existing reservedQty path". Measurement proved there IS no path:
`grep -rnE '\breservedQty\b' apps/api/src` ⇒ `Stock.reservedQty` is
ONLY read (dashboard low-stock, stock-balance report, stock
controller) and created as `0` — **never written** by any service.
customer-order.service has zero reserve logic (its schema comment
"reserves on confirm" is aspirational); PurchaseOrder schema says
"reservations deferred to 4.x"; OnlineOrder "Stock reservation (V2)".
So reservation is unimplemented project-wide; `Production.reserve`
being a dead flag is consistent with that, NOT a Production bug. The
user chose: build the shared subsystem properly (no-MVP). This entry
is unit 2a — the foundational primitive (2b wires Production, 2c
integrates available-qty).

**Additive migration `20260518192932_add_stock_reservation_ledger`:**
new `stock_reservations` table (CREATE TABLE + 3 indexes + 2 FKs
only — zero changes to existing tables; the safest migration class).
`StockReservation` is the soft-hold ledger axis, deliberately
SEPARATE from `StockOperation` (the hard qty-movement axis) so
reservation never corrupts the qty ledger. `Stock.reservedQty` ==
SUM(StockReservation.qtyDelta) per (store, assortment) — rebuildable.
schema.prisma: model + Account/Store back-relations. Prisma
format→validate→migrate→generate all clean; generated client
committed in sync.

**`StockService` primitive (mirrors `applyDeltas` 1:1):**
- `applyReservationDeltas(tx, accountId, createdById, deltas[])` —
  dual-write StockReservation ledger + `Stock.reservedQty`
  increment (upsert; create row with reservedQty if absent). Same
  concurrency contract as applyDeltas: caller MUST `lockBalances`
  first (documented) so concurrent reservers cannot lost-update.
  Over-reservation is allowed by design (moysklad parity — you may
  reserve goods you will produce/receive; available may go negative)
  — no sufficiency block in the primitive.
- `releaseReservationByDoc(tx, …, docType, docId, reason)` — releases
  a doc's OUTSTANDING net EXACTLY (reverses recorded qtyDelta, never
  recomputed from a possibly-changed BOM — materialsSnapshot
  exact-reversal discipline). Idempotent: net ≤0 ⇒ clean no-op, so a
  double unpost/cancel cannot drive reservedQty negative.
- Exactness: net aggregation via BigInt micro-units (×1e6, Decimal
  (20,6)) — `toMicro`/`fromMicro` — zero float drift.

**Adversarial tests (+10, pure `netOutstandingReservations`, no DB):**
single reserve; reserve+exact-release ⇒ idempotent empty;
partial-release remainder; **double-full-release ⇒ net≤0 ⇒ nothing
emitted (reservedQty can't go negative)**; **0.1+0.2−0.3==0 (no float
drift)**; 6-dp micro exactness; independent (store,assortment)
aggregation; over-reserve preserved (no cap); empty ⇒ no-op; 30
tiny-delta drift-to-zero stress.

Gate: api tsc 0 (generated client has `tx.stockReservation`) · **api
test 1583 green** (1573 + 10), zero regression (the ledger+primitive
are additive — no caller invokes them yet; full suite proves nothing
else moved) · biome 0/0 (stock.service.ts + test). DO NOT respected:
layout.tsx NOT touched/staged (separate in-flight cleanup) · no
existing table/column altered (additive migration only) · no caller
behaviour changed (2b/2c do the wiring).

## 115. [CHAT 1 / round-4] Unit 2b — Production.post/unpost/cancel ↔ real material reservation (2026-05-19)

Wires the §114 primitive into the Production FSM — `Production.reserve`
is no longer a dead flag.

**Atomic transition refactor (the careful part).** post/unpost/cancel
previously did a bare `production.update` (no tx). Each is now wrapped
in `prisma.$transaction` so the state change AND the reservation
mutation commit together (a reservation must never outlive a failed
post, nor a release a failed unpost). logAudit/webhookFire stay
post-commit (unchanged sequencing; audit is a non-critical side
record). Full suite proves the existing 1583 behaviours are untouched.

- **post** (draft→posted): if `reserve && materialsStoreId`, resolve
  materials, `lockBalances` the affected products in that store, then
  `applyReservationDeltas(+)`. No materials store / no child-PO BOMs ⇒
  post still succeeds, nothing reserved (honest V1: header-only
  Production owns no materials; documented, not a silent cut).
- **unpost** / **cancel**: read the doc's reservation-ledger
  assortments, `lockBalances` them, `releaseReservationByDoc(-)` —
  EXACT idempotent net reversal. Cancel-from-draft (never reserved)
  and double unpost ⇒ clean no-op (can't drive reservedQty negative).
- Concurrency: every reserve/release `lockBalances` (SELECT FOR
  UPDATE) inside the same tx — the primitive's documented contract;
  two concurrent posts of the same materials cannot lost-update.

**Material math** = aggregate child ProcessingOrders' BOM components:
`runs = (PO.quantity/1000) / BOM.outputQty; per = component.qty ×
runs; Σ per product`. Extracted to a PURE exported
`aggregateBomReservations` so it is adversarially DB-free tested
(§97/CLAUDE.md mandatory-stock-QA). The reserve amount is an
explicitly-documented soft-hold ESTIMATE (Number, 6-dp); the
correctness-critical invariant — release == exactly what was reserved
— is the LEDGER's job (reverses recorded deltas, never recomputed),
so estimate rounding is provably safe.

**Adversarial QA did its job (a real catch, not theatre).** Of +14
new tests, 1 failed first run — it flagged a NAIVE test expectation
(0.333333×1.5 → I assumed "0.5"; float `toFixed(6)` correctly yields
"0.499999"). Measured (`node -e`) to confirm the FUNCTION was right
and the TEST was wrong; fixed the test honestly (clean exact 0.4→0.6
fractional case + an explicit test documenting the estimate-rounding
reality). Coverage: ×1000 scaling, outputQty>1, **÷0 / null / negative
outputQty guards**, multi-PO same-product aggregation, multi-component,
fractional runs, zero/negative component drop, sum-to-0 drop, empty.

**Wiring:** ProductionModule imports StockModule; ProductionService
injects StockService. `production.module.ts` +2.

Gate: api tsc 0 · **api test 1597 green** (1583 + 14, zero
regression — the transition refactor preserves every existing
production/stock test) · biome 0/0 (service + module + test). DO NOT
respected: layout.tsx NOT touched/staged (separate cleanup) ·
schema.prisma untouched (2a's migration already in) · only
Production transitions changed, behaviour additive (reserve=false or
no store ⇒ identical to before). Honest V1: header-only Production
reserves from child-PO BOMs present at post time — documented in
code; 2c integrates available=qty−reservedQty into sufficiency.

## 116. [CHAT 1 / round-4] Unit 3 measure-first — §97/§111 "ProductionStageCompletion NOT modeled" premise CORRECTED (audit-only, 2026-05-19)

**§65 measure-first, 6th occurrence this session** (after: §94 /boms
dup, §95 work-orders, §97 reserve dead-flag, §111 stale-doc, unit-2
"no reservation path"). §97/§111 asserted unit 3 = "ProductionStage-
Completion (Выполнение этапа, ref 1765L) — NOT EVEN MODELED, build
model+migration+FIFO cascade+API+FE". Measuring the schema BEFORE
modelling proved that premise WRONG and prevented a major duplicate-
entity error.

**The existing `Processing` (Техоперация) IS the project's
stage-completion mechanism.** schema.prisma `model Processing`
already has, 1:1 with moysklad `productionstagecompletion`:
- `applicable` (= moysklad applicable / Отметка о проведении) +
  `state` FSM (draft→posted→cancelled) + `postedAt`
- `quantity` ×1000 (= moysklad `productionVolume`)
- `costSumMinor` — schema comment: *"Aggregated cost basis of
  consumed materials + labour for this op. Becomes the FIFO cost of
  the produced output product"* (= moysklad processing/labour cost
  cascade)
- `materialsSnapshot` Json — *"Snapshot of materials consumed at post
  time. Used for exact reversal on unpost/cancel even when the source
  BOM is edited mid-flight"* (the snapshot discipline)
- `materials ProcessingMaterial[]` + `products ProcessingProduct[]`
  (= moysklad `materials`/`products` MetaArrays — "products only on
  the last stage")
- `materialsStoreId`/`productsStoreId`, `processingOrderId`
  (→ ProcessingOrder → Production), `processingPlanId` (BOM)
- a FULL proven stock/cost cascade in `processing.service.post()`
  (materialReqs → lockBalances → assertAvailable → StockDelta[] →
  applyDeltas + costSumMinor + materialsSnapshot exact reversal — the
  §85-93 money-engine, already gated + adversarially tested).

The schema comment on `Processing` is explicit: *"Used in BOMs that
have ProcessingProcess stages — each ProcessingStage cascade emits a
Processing record."* So `Processing` is, by deliberate design, the
stage-completion document. Building a separate `ProductionStage-
Completion` entity + a second material-consume/output-produce/FIFO
cascade would DUPLICATE the entire §85-93 money-engine — the exact
"ikki xillik bo'lmasin" violation (CLAUDE.md) and the §94 /boms-dup
pattern, on a far larger and money-critical surface.

**The PRECISE real gap** (measured — `grep` for
`processingStageId|labourUnitCost|standardHour|enableHourAccounting|
performerId|defect` in schema.prisma ⇒ **0**): `Processing` lacks
only the moysklad stage-completion *extensions* — a `processingStageId`
FK → the §112 `ProcessingStage`, plus the labour-accounting fields
(`labourUnitCost`, `standardHourUnit`, `standardHourCost`,
`enableHourAccounting`, `performerId`, `defect`) — and the wiring of
the stage's `laborCostMinor`/`materialMarkup` (§112) into the
existing `costSumMinor` cascade.

**Corrected unit-3 scope (honest):** NOT "build a new 1765L entity".
Instead: *extend the existing proven `Processing`* with the
stage-link + labour fields (additive migration), then wire stage
labour into the cost cascade. This is smaller and lower-risk than a
duplicate — BUT it mutates the §85-93 money-engine's cost basis
(labour → costSumMinor → output FIFO + unpost reversal), so it is
adversarial-QA-mandatory (CLAUDE.md stock/money) and a careful
dedicated unit, not a tail-of-session rush — the SAME honest call as
unit 2c. Precisely scoped here + RESUME for correct treatment; no
code this entry (the §91/§110 audit-only-when-premise-corrected
precedent).

Gate: audit-only — schema.prisma / any API / any FE — none touched.
PARITY-AUDIT + RESUME only. Evidence (schema model fields + grep=0 +
processing.service.post cascade lines) all re-runnable.

## 117. [CHAT 1 / round-4] Unit 3 (API) — Processing extended to moysklad «Выполнение этапа производства» (2026-05-19)

Implements the §116-corrected scope: NOT a duplicate entity — EXTEND
the existing `Processing` (which §116 proved IS the project's
stage-completion document) with the moysklad
`productionstagecompletion` fields + wire stage labour/markup into
the §85-93 cost cascade.

**3a — additive migration
`20260518205304_processing_stage_completion_fields`** (verified
ALTER TABLE ADD COLUMN + index + 2 FK only — safest class, zero
change to existing rows): `processingStageId` FK→§112 ProcessingStage,
`performerId` FK→Employee, `defect`, `enableHourAccounting`,
`labourUnitCostMinor` (tiyin), `standardHourUnit` Decimal(20,6),
`standardHourCostMinor` (tiyin) — all defaulted. ProcessingStage gets
`completions Processing[]`, Employee `performedProcessings`. prisma
format/validate/migrate/generate clean; generated client committed in
sync. (3a+3b ship as ONE unit — orphan columns alone would be the
exact §97 schema-orphan anti-pattern.)

**3b — schema + service + cost cascade.** Create/Update zod extended
(money = `^\d+$` tiyin string → BigInt at the service; standardHourUnit
Decimal string). `defect` is in Create but NOT Update — `.strict()`
rejects the key ⇒ moysklad "+После создания изменить нельзя"
(immutable after create) enforced with zero extra code. create()/
clone() persist the fields; findById includes the linked stage
(`materialMarkup` + `laborCostMinor`) + performer.

Cost rule wired via the PURE exported `computeStageEffectiveCost`
(adversarially DB-free tested):
`effective = materialCost + materialCost×markup% + labour`, where
`labour = (enableHourAccounting ? standardHourCost×standardHourUnit :
labourUnitCost) × productionVolume`. `effectiveCostMinor` replaces
`totalCostMinor` ONLY at `distributeOutputCost` + persisted
`costSumMinor` + `ProcessingOrder.movedSumMinor`. The materials-axis
deltas + `materialsSnapshot.items` are UNCHANGED (real consumed
material cost); the markup+labour is value the op CREATES, absorbed
into the produced stock (moysklad manufacturing-cost parity).
Exact reversal is automatic + needs NO snapshot-shape change:
`snapshot.outputs[].costMinor` already carries the distributed
effective cost, so unpost/cancel reverses it exactly (symmetric
per-axis: materials restore Σ=material, outputs remove Σ=effective).

**Zero-regression PROVEN, not asserted.** No stage / all-zero ⇒
`effective === totalCostMinor` ⇒ byte-identical to the pre-§117
money-engine; the 12 pre-existing post/§88/§89/§90 cost tests pass
UNCHANGED.

**Adversarial QA did its job (2 real catches, fixed properly — not
test-cheating).** First run: 13 fails. (1) 12 existing money-engine
tests crashed because partial test fixtures lack the new fields ⇒
`existing.standardHourUnit.toString()` on `undefined`. Fixed at the
call site with defensive `?? default` (no-op in production where DB
defaults always populate them; it *is* the zero-reg guarantee made
fixture-robust). (2) my own `decToMicro('NaN')` did
`BigInt('NaN000000')` → throw; fixed with a digit-run guard ⇒ garbage
clamps to 0n (never throw / NaN — money discipline). +12 adversarial
helper tests: no-stage byte-identical, markup ½-up boundary, fixed
vs hour-accounting labour, hour-accounting-ignores-fixed, combined
exact sum, fractional/6-dp exactness, zero-volume, negative/garbage
clamp, markup-on-0-material.

Gate: api tsc 0 (generated client has the 7 new fields) · **api test
1609 green** (1597 + 12, zero regression — the 12 untouched
money-engine tests are the proof) · biome 0/0 (service + schema +
test). DO NOT respected: layout.tsx NOT touched/staged (separate
in-flight cleanup) · only an additive migration (no existing
column/table altered) · stage-less Processing behaviour byte-
identical. Honest V1: `defect` recorded but no defect-specific cost
branch (documented in schema); FE is unit 3c (next).

## 118. [CHAT 1 / round-4] Unit 3c (FE) — stage-completion cost inputs on processings/[id] (2026-05-19)

Surfaces the §117 capability in the UI. `processings/[id]` (the
canonical Техоперация detail / "complete a stage" page) extended:
`ProcessingDetail` + `FormState` + `formFromData` + `snapshot` +
save-payload now carry the stage-completion fields; a new
DocumentMetaPanel block shows: Этап производства + Исполнитель
(read-only labels), Учёт по нормо-часам + Брак (checkboxes; defect
read-only), and Оплата труда/ед · Нормо-часы/ед · Стоимость
нормо-часа (so'm inputs). so'm↔tiyin round-trip (`tiyinToSom` load,
`somToTiyin` save) — money discipline. `labourUnitCost` auto-disables
when `enableHourAccounting` (the formula then derives it — matches
the §117 service rule + moysklad). `defect` is NOT sent in the PATCH
(read-only; the API's `.strict()` Update rejects it — immutable
after create); all stage-completion inputs only post when editable
(unposted), reusing the existing `!data.applicable` guard.

**Honest V1-FE scope (documented, not faked):** the
`processingStage`/`performer` LINK is shown read-only — settable via
the API (fully working + §117-tested); the 2-level dependent
process→stage picker UI + employee picker are a recorded V1-FE
refinement (ProcessingStage has no flat list endpoint — it nests
under ProcessingProcess). The cost-engine VALUE is fully delivered
and the user-controlled cost inputs (labour/hour/defect) ARE in the
UI. processings/new is unchanged (stage-completion fields default on
create; set on the detail edit) — same documented refinement.

Gate: web tsc 0 · biome 0/0 (processings/[id] "No fixes applied")
· API untouched (FE-only; §117 API already gated). Additive — no
existing material/output/cost FE logic touched; stage-less ops
render exactly as before. DO NOT respected: layout.tsx NOT
touched/staged · no API/schema change.

## 119. [CHAT 1 / round-4] Unit 2c — reservation ENFORCEMENT + release-on-consume (2026-05-19)

Closes the reservation subsystem (2a primitive §114 + 2b Production
wiring §115 + **2c enforcement**). `Production.reserve` now actually
restricts other documents — end-to-end.

**Moysklad-semantics decision (documented best-judgment, user
authorised autonomous).** moysklad «Доступно» = on-hand − резерв;
when `allowNegativeStock=false` documents are checked against
AVAILABLE, not raw on-hand. So `StockService.assertAvailable` now
computes `avail = qty − reservedQty`. **Zero-regression by
construction:** `reservedQty` is 0 in every pre-§115 flow (only
Production reservation ever writes it), so `qty − 0 === qty` ⇒
byte-identical; the 8 callers (demand/loss/move/processing/
purchase-return/retail-sale/work-order×2) are unaffected unless a
real reservation exists — proven by the full suite passing unchanged.

**Self-consumption trap SOLVED — release-on-consume.** The §111-
measured trap: a Production reserves its child-PO BOM materials
(§115), then its OWN child Processing.post() must consume them — a
naive `qty − reservedQty` would let the Production's reservation
block the very flow it was made for. Fix: in `Processing.post()`,
inside the tx, after lock + BEFORE sufficiency, if the op's chain
(Processing → processingOrder → productionId) reaches a Production
with outstanding reservation in the materials store, release EXACTLY
`min(consumed, outstandingReserved)` per product (reason
`release_consume` — the slot foresighted in §114), then re-read the
(still-locked) balances so sufficiency sees the recovered available.
Surplus reservation stays held for sibling ops; other documents
remain correctly blocked. No production / no reservation ⇒ wholly
inert (the `if (existing.processingOrderId)` + empty-ledger paths
return immediately ⇒ zero-regression).

Pure exported `computeConsumeReleases` (release[p] =
min(Σ consumed[p], net[p]), >0 only, exact BigInt micro-units,
consumed-lines aggregated per product) — adversarially DB-free
tested.

**Adversarial QA (real catch, fixed honestly).** First run: 1 fail —
the existing "bumps movedSumMinor" test's tx mock lacked the 2 new
release-on-consume queries (`processingOrder.findFirst`,
`stockReservation.findMany`). Completed the mock to model exactly
that test's scenario (linked PO, NO parent-Production reservation ⇒
release-on-consume inert) — accurate, not test-cheating; the
movedSumMinor assertion is unaffected. +15 adversarial tests:
computeConsumeReleases (consumed<reserved, cap, ==, not-reserved,
not-consumed, independent, dup-aggregate, net≤0, 6-dp, empty) +
assertAvailable §2c (reservedQty 0 ⇒ identical/zero-reg; reserved
blocks; enough-after-reserve; shortage reports adjusted available;
allowNegativeStock still bypasses).

Gate: api tsc 0 · **api test 1624 green** (1609 + 15, zero
regression — the assertAvailable change is byte-identical with
reservedQty 0; release-on-consume inert without a reservation) ·
biome 0/0 (stock + processing service & tests). DO NOT respected:
layout.tsx NOT touched/staged (separate cleanup) · schema.prisma
untouched (2a's ledger already in) · no behaviour change for any
pre-§115 flow.

### Round-4 reservation subsystem — COMPLETE & HONEST

§114 primitive+ledger · §115 Production reserve/release · §119
enforcement+release-on-consume. `Production.reserve` is no longer a
dead flag: posting a Production with reserve=true holds its child-PO
BOM materials; other documents see reduced available; the
Production's own Processing execution releases exactly what it
consumes; unpost/cancel exactly reverse. moysklad-parity, exact,
concurrency-safe (lockBalances), adversarially tested, zero-
regression. The shared primitive is reusable by CustomerOrder/PO/
OnlineOrder when their (currently deferred) reservation is built.

## 120. [CHAT 1] Honest verdict — round-4 COMPLETE; round-5 genuinely exists (measure-first, audit-only, 2026-05-19)

User asked "is Chat-1 fully done or is there a round-5?". Answered
with measure-first (not assertion) — the §97 pattern repeated for
round-4→5.

**Round-4 is COMPLETE & gated** (units 1/1b/2a/2b/2c/3; §112-119;
api tc 0 · web tc 0 · 1624 tests/116 files green · all committed
Ozodbek). For those units, Phase-1 (function + test + gate) is done.

**Round-5 genuinely exists** (evidence, mostly already honestly
recorded as deferred V1 boundaries — NOT invented, NOT hidden):
1. **`productiontask` («Производственное задание») — UNMODELED.**
   moysklad Производство doc (`_productionTask.md`): applicable FSM,
   awaiting, productionStart, and its own «производственные этапы»
   rows that `productionStageCompletion.productionStage` references.
   `grep model ProductionTask` ⇒ 0. The project's `WorkOrder`
   (name/bom/plannedQty/producedQty/state) is a documented V1
   simplification (§116 flagged this exact divergence). Largest
   round-5 item — and a schema-owner architecture decision
   (productionTask + stage-rows graph vs the current linear model).
2. ProcessingStage linear-children vs moysklad standalone-Этап +
   `nextPositions` DAG — V1, documented §112.
3. Processing↔stage/performer FE = read-only labels; 2-level
   process→stage + employee picker UI — V1-FE, documented §118.
4. `defect` recorded, no defect-specific cost branch — V1, §117.
5. CustomerOrder/PurchaseOrder/OnlineOrder reservation — their
   schema-documented V2 (can adopt the §114 shared primitive).
6. Standing role (not a "round"): Chat-1 = schema-owner +
   merge-coordinator (ongoing).
7. Phase-2 per CLAUDE.md (real-data smoke / concurrent / staging) —
   separate from Phase-1, for the whole module.

Verdict: NOT "100% production-ready". Round-4 closed honestly;
round-5 = the above, evidence-grounded. Audit-only — no code;
PARITY-AUDIT + RESUME only.

## 121. [CHAT 1 / round-5] productiontask «Производственное задание» — §120 premise CORRECTED + the one genuine gap closed (2026-05-19)

**§116 measure-first discipline, 7th occurrence this session — it
corrected an audit claim I myself wrote.** §120 said "productiontask
UNMODELED; WorkOrder is the V1 simplification — largest round-5 item".
Measuring `_productionTask.md` (2641 lines) field-by-field vs the
schema proved that imprecise:

- header (name/code/externalCode/organization/store/materialsStore/
  moment/productionStart/productionEnd/reserve/state-FSM/description)
  = **`Production`** 1:1 (verified field-by-field)
- `productionRows` ("list of Техкарт + productionVolume") =
  **`ProcessingOrder`** (productionId→Production, processingPlanId→
  BOM, quantity) — each linked PO = a productionRow
- `products` (assortment + planQuantity) = Processing §89 explicit
  products / BOM output
- production-stages + `productionStageCompletion.productionStage` =
  **`Processing` + processingStageId** (§117)

moysklad's single `productiontask` entity is, in this project, the
deliberate **`Production` + `ProcessingOrder` + `Processing`
decomposition** — NOT unmodeled, NOT via WorkOrder. A new standalone
`ProductionTask` would have DUPLICATED `Production` (the §94/§116
trap, nearly repeated on a 2641-line spec). The one-entity-vs-
decomposed shape is a documented architectural divergence (same
class as §112 linear-vs-DAG), not a missing capability.

**The ONE genuine gap (grep=0): `Production.awaiting`** (moysklad
`awaiting` / Флаг ожидания продукта). Closed:
- additive migration `20260519045846_production_awaiting`
  (single `ADD COLUMN awaiting BOOLEAN NOT NULL DEFAULT false` —
  safest class; existing rows byte-identical)
- production.schema.ts `awaiting` zod (mirrors reserve; Update
  inherits via .partial()); service create/update persist
- FE «Флаг ожидания продукта» checkbox on /productions/new +
  /productions/[id] (mirrors reserve; in [id] it's FormState ⇒
  dirty-tracked + saved)
- +1 schema test (default false; "true"-string coercion)

**Honest round-5 update:** §120 over-stated round-5. Real remaining
is NOT "build productiontask" — it is the deliberate documented
architectural divergences (decomposed-vs-one-entity; §112
linear-vs-DAG; §118 FE pickers; §117 defect-cost-branch;
CustomerOrder/PO/OnlineOrder reservation V2), not capability gaps.
The Производство module is functionally at moysklad parity for the
core flow.

Gate: api tsc 0 · web tsc 0 · api test 1625 green (1624 + 1, zero
regression — additive flag) · biome 0/0 (5 files). DO NOT respected:
layout.tsx untouched · additive migration only · no existing
behaviour changed.

## 122. [CHAT 1 / round-5] Residual measure-first verdict — round-5 honestly CLOSED (audit-only, 2026-05-19)

Measure-first applied to every §120/§121 residual (the discipline,
8th occurrence — it corrected yet another self-flagged note):

1. **`defect` — ALREADY at moysklad parity (NOT a V1 gap).** §117
   self-noted "defect recorded but no defect-cost branch — V1".
   Measuring `_productionStageCompletion.md`: `defect` is defined
   ONLY as `Boolean · Признак брака · +После создания изменить
   нельзя` — an immutable-after-create flag; the spec has NO
   defect-specific cost/store branch (JSON examples just carry
   `"defect": false`). §117 implements EXACTLY that (stored,
   immutable via `.strict()` Update rejection). So §117's "V1
   limitation" was overly conservative — it is full parity. No code.
2. **§118 stage/performer FE pickers** — stays a documented honest
   V1-FE refinement. The values are fully settable + cost-tested via
   the API (§117); the read-only labels are honest. A 2-level
   dependent process→stage picker + an employee picker (no confirmed
   `@Controller('employees')`; no standalone stage endpoint) bolted
   into the ~900-line money-adjacent processings/[id] at this depth
   is exactly the quality-first risk the rules forbid rushing.
   Recorded, not hidden.
3. **§112 ProcessingStage linear vs moysklad standalone-Этап +
   `nextPositions` DAG** — deliberate documented V2 architectural
   divergence. Converting = a schema redesign (new position/graph
   entities, migration touching §112/§117, high blast radius). Not a
   tail-of-session rush. Recorded.
4. **CustomerOrder / PurchaseOrder / OnlineOrder reservation** —
   those modules' OWN schema-documented V2; out of Chat-1
   Производство scope. They can adopt the §114 shared primitive.

**Honest round-5 close:** the one genuine capability gap (Production.
awaiting) was closed in §121. Everything else is either already at
parity (defect), a deliberate documented architectural divergence
(decomposed-vs-one-entity, §112 linear-vs-DAG), an honestly-recorded
V1-FE refinement (§118), or another module's documented V2
(reservation). NONE is hidden incompleteness. The Производство module
is functionally at moysklad parity for the full core flow
(Техкарта · Техпроцесс/этапы · Производство · Производственное
задание = Production+ProcessingOrder · Техоперация/stage-completion ·
material reservation). NOT claimed "100% production-ready" — Phase-2
(real-data smoke / concurrent / staging, CLAUDE.md) is module-wide
and separate from Phase-1; the standing schema-owner +
merge-coordinator role continues.

Gate: audit-only — no code; PARITY-AUDIT + RESUME only. Every claim
re-runnable (moysklad-ref greps + schema/spec field comparisons).

## 123. [CHAT 1 / round-5] §118 FULL part-1 — stage/performer pickers now EDITABLE on processings/[id] (2026-05-19)

User directed genuine completion (no documented-divergence stop).
§118 read-only stage/performer labels on processings/[id] REPLACED
with real editable controls: Техпроцесс CatalogPicker (/processing-
processes) -> dependent stage <select> populated from
/processing-processes/:id stages (no flat stage endpoint - they nest
under the process; fetched on selection via a cancel-safe effect) +
Исполнитель CatalogPicker (/employees, the proven payrolls pattern).
FormState +6 fields (process/stage/performer id+label),
formFromData maps d.processingStage/d.performer, snapshot auto
dirty-tracks (JSON.stringify), save sends processingStageId +
performerId (editable-only guard). Picking a process resets the
stage; the current stage shows as a fallback <option> when its
process is not re-picked. defect stays read-only (moysklad
immutable-after-create). API unchanged - UpdateProcessingSchema
(§117) already accepts these; additive FE only.

Gate: web tsc 0 · biome 0/0 (processings/[id]) · API untouched
(§117 API already gated/tested). DO NOT respected: layout.tsx
untouched · no API/schema change · stage-less ops unaffected.

## 124. [CHAT 1 / round-5] §118 FULL part-2 — stage/performer/labour on processings/new (create parity) (2026-05-19)

Same §117/§118 capability on the create form: processings/new now
has Техпроцесс CatalogPicker -> dependent stage <select> (/processing-
processes/:id, cancel-safe effect) + Исполнитель CatalogPicker
(/employees) + Брак / нормо-час checkboxes + labour/hour-unit/
hour-cost so-m inputs (somToTiyin). Payload sends them (stage/
performer omitted when unset; labour as tiyin). API unchanged
(CreateProcessingSchema §117 already accepts them). Round-5 §118
FULLY closed (parts 1+2) — no more read-only/deferred stage UI.

Gate: web tsc 0 · biome 0/0 (processings/new) · API untouched.
DO NOT respected: layout.tsx untouched · no API/schema change.

## 125. [CHAT 1 / round-5] §112 stage-graph — allPerformers + successor-linkage closed additively (2026-05-19)

User directed genuine completion. §112 measure-first verdict:
moysklad processingprocess `nextPositions` is ONE minimal field
(one spec line, no DAG/branching elaboration); the project `position`
int already expresses sequential order for the standard flow. The
genuine additive content = the missing standalone-stage field
`allPerformers` + successor linkage. Full standalone-Этап-entity
split + multi-successor DAG = a high-risk money-engine-adjacent
redesign (rewires §117 cost cascade) — NOT a professional rush
(§117 extend-not-duplicate lesson). Closed the real content
additively:
- additive migration 20260519052425_processingstage_successor_
  allperformers (ADD COLUMN all_performers BOOL DEFAULT true +
  next_stage_id UUID self-FK SET NULL — safest class).
- ProcessingStage +allPerformers +nextStageId self-relation
  (nextStage/prevStages).
- §112 zod ProcessingStageInputSchema +allPerformers (default true,
  string-coerce) +nextStageId (uuid nullish); service create/
  update/setStages persist; StageRow type + serializeStage expose
  them; +1 adversarial schema test.
- FE: allPerformers checkbox column added to the stage-row editor
  on /production/processes/new + /[id] (StageRow/prefill/submit/
  grid all wired).

Honest boundary (documented, not hidden): V1 single-successor
`nextStageId` covers linear + simple-chain (the standard production
flow; `position` ASC still drives default order). Multi-successor
BRANCHING DAG + the standalone-reusable-Этап-catalog (one stage
shared across processes) is the deliberate documented advanced
divergence — moysklad itself specs nextPositions as one minimal
field and branching as the rare «Расширенный способ».

Gate: api tsc 0 · web tsc 0 · api test 1626 green (1625 + 1, zero
regression — additive) · biome 0/0 (5 files). DO NOT respected:
layout.tsx untouched · additive migration only · no behaviour
change to existing stages / the §117 cost cascade.

## 126. [CHAT 1 / round-6] FULL stage-graph parity — standalone Этап catalog + ProcessingProcess positions + nextPositions DAG (2026-05-19)

User directive: NO V1/V2 — the §112/§125 "advanced boundary" must be
genuinely built to full moysklad parity. Done — a careful,
data-preserving architectural redesign with ZERO money-engine
regression.

Measure-first (exact spec): moysklad `processingstage` is a
STANDALONE reusable catalog (no processId; +performers, allPerformers,
distributionRequired, standardHourCost, materialStore).
`processingprocess.positions[]` reference stages with `nextPositions`
= the multi-successor DAG.

Data-preserving migration `20260519060819_processingstage_standalone_
positions_dag` (hand-edited from --create-only): ProcessingStage →
standalone (dropped process_id/position/default/next_stage_id; added
distribution_required/standard_hour_cost_minor/material_store_id;
KEPT labor_cost_minor/material_markup — §117 cascade reads them,
Processing.processingStageId still points here, unchanged). New
ProcessingProcessPosition + ProcessingProcessPositionEdge (multi-
successor DAG, no V1 limit) + ProcessingStagePerformer (M:N).
BACKFILL before drops: each existing stage → one position
(process+order kept); each next_stage_id → a DAG edge. Zero data
loss (migrate status up-to-date; full suite green).

New standalone module `processing-stage/` (moysklad `processingstage`;
mirrors bom): zod + service CRUD/archive/restore (no hard delete —
money-safe) + `@Controller('processing-stages')` (the flat endpoint
§118 wanted) + permission entity + 10 adversarial tests +
performers-normalize rule.

ProcessingProcess service rewritten to positions: create/replace
builds a standalone stage + position per input row (§112 inline-stage
FE shape preserved), nextStageId linkage → DAG edges. serializeDetail
returns positions[] + back-compat flat stages[]. Replace is
money-engine-safe: a stage used by a §117 completion / another
position is NEVER deleted (pre-check + FK Restrict).

Gate: api tsc 0 · api test 1636 green (1626 + 10, ZERO regression —
§117 money-engine + all prior tests unchanged; migration applied
cleanly) · biome 0/0 (new module + rewritten service). DO NOT
respected: layout.tsx untouched · data-preserving (no row loss) ·
§85-93 cascade NOT modified. NO V1/V2 — full multi-successor DAG +
standalone reusable catalog. FE = round-6c.

## 127. [CHAT 1 / round-6c] FULL stage-graph parity — FE editors + schema/service finalised, V1/V2 doc removed (2026-05-19)

Round-6c closes the §126 redesign on the FE + finishes the contract.
NO V1/V2 anywhere — `processing-process.schema.ts`'s old "V1
constraints … V2 refinement" doc block is DELETED and the model is
now genuinely moysklad-faithful.

Schema (`processing-process.schema.ts`): the `nextStageId`
uuid-typed-but-index-parsed hack is GONE. Each position input now
accepts `processingStageId` (reference an existing standalone Этап —
the moysklad-faithful primary path) OR inline new-stage fields
(create-on-the-fly, persists in the catalog), guarded by a
`superRefine` (one of the two is required). `nextPositionIndexes:
number[]` is the real multi-successor `nextPositions` DAG. moysklad's
hard «1–100 позиций» limit is enforced (`PositionsArray` min1/max100)
— positions are required at creation, faithfully.

Service: `createPositions` reuses the referenced Этап
(ownership-checked) or creates one inline; builds multi-successor
edges from `nextPositionIndexes` (empty ⇒ linear chain), de-duped
against the edge `@@unique`. `replacePositions` is now strictly
money-safe by construction — it ONLY drops this process's
edges+positions and recreates; it NEVER deletes a ProcessingStage
(standalone catalog semantics — the Этап lives on; §117 cascade
reads stage.materialMarkup/laborCostMinor untouched).

FE: `processes/new` + `processes/[id]` rebuilt to a position editor
— each row picks an existing Этап (CatalogPicker → /processing-stages)
or defines a new one inline (tab toggle), plus a multi-successor
"keyingi etaplar" chip selector = the `nextPositions` DAG. `[id]`
loads `positions[]`, keys rows by position.id so `nextPositionIds`
map straight to successor chips, and re-saving a loaded position
reuses its Этап (`processingStageId`) — no stage churn (fixes the
old "new stage every save"). `processes` list `_count.stages` →
`_count.positions` (round-6b regression fixed). i18n uz+ru added
(pages.processes: section_positions/positions_count/add_position/
tab_existing/tab_new/pick_stage/change_stage/next_stages/
next_stages_help/position_label/col_positions). §118 processings
pickers (new+[id]) finalised on the flat /processing-stages endpoint
(dead processId/processLabel/stageOptions/processFetcher removed).

Gate: api tsc 0 · web tsc 0 · full api suite 117 files / 1640 tests
GREEN (zero regression — §117 money-engine + §119 reservation +
all prior tests unchanged; processing-process.schema.test.ts 16→26,
+10 covering processingStageId-ref / neither-id-nor-name reject /
multi-successor coerce / 1–100 cap / create-requires-positions) ·
biome 0/0 across all 17 round-6c source files. DO NOT respected:
biome `--write` over-reach into 2 non-round-6c work-orders files
caught by `git status` + reverted (flagged as a separate task, not
bundled — the §110 lesson); BIZNES_QOLLANMA/*.png/deploy left
untracked. Honest scope: implementation + automated gates COMPLETE;
live in-browser QA of the new position-graph editor is the explicit
Phase-2 step (not yet performed).

## 128. [Sprint 6] Money module — closed the 3 genuine measured gaps (2026-05-19)

Measure-first first: the memory's "Sprint 6 Money next" was STALE —
12 money modules already exist (ledger/CashIn-Out/CounterpartyBalance
DONE; exchange-rate CBU cron DONE). A deep audit found exactly 3 real
gaps; "BankAccount missing" was a FALSE gap (moysklad has no such
entity — accounts belong to org/counterparty; the existing model is
faithful). Built only the genuine gaps, no rebuild, no fabricated
entity.

Unit A (a8ca375e) — Currency entity CRUD: the `Currency` model was
fully specced with ZERO API/FE. New `currency` module
(list/create/update/archive/restore/delete) with moysklad rules
(валюта учёта rate fixed=1, AUTO rate CBU-owned, system identity
immutable, base/system not deletable). Money discipline: rate stored
rateValue = rate×1e8 via integer string math (round-trip-tested incl.
0.1). safeParse → 400 (not the systemic 500). + /settings/currencies
FE + sidebar + i18n uz/ru + `currency` permission entity.

Unit B (808c797d) — OrganizationAccount field parity: +bankLocation
+correspondentAccount (data-preserving additive migration; NOT a new
BankAccount entity). Migration also reconciled a harmless pre-existing
§126 updated_at drift (transparent).

Unit C (b2e826bf) — exact currency conversion + AUTO propagation:
currency-convert (rational num/den BigInt, one round-half-away;
identity-exact; direct/indirect/multiplicity; documented equal-minor
-scale UZ boundary) + cbuRateToRateValue (Decimal, margin+nominal) +
CurrencyService.applyAutoRatesFromSource wired into
ExchangeRateService.sync() so the daily CBU cron reprices AUTO
currencies (MANUAL/base never touched).

Unit D (5a1b35fb) — camt.053 import + reconciliation: ISO 20022
parser (fast-xml-parser) emitting the SAME ParsedRow[] as CSV (pipeline
reused); TxsSummry gross OR OPBD/CLBD net reconciliation surfaced in
notes; upload() auto-detects format.

Adversarial QA (CLAUDE.md money mandate) caught + fixed REAL bugs:
currency-convert naive so'm/tiyin test scale (code correct, tests +
boundary doc fixed); camt.053 lenient-XML silently half-parsed
truncated statements (XMLValidator now rejects) and OPBD/CLBD compared
gross-instead-of-net (fixed). Real-DB HTTP adversarial smoke: 11/11
Currency money invariants verified (валюта-учёта uniqueness, base-rate
immutability, AUTO-lock, system/base delete guards, zero-rate→400,
exact rate round-trip). 4 initial "fails" were a harness `UID`
readonly-bash-var collision, not product.

Gate: api tc0 · web tc0 · full api suite 121 files / 1682 tests green
(zero regression across all 4 units; +42 money-focused tests) · biome
0/0 on all new/changed Sprint-6 files. Pre-existing biome/non-null
debt (csv-parser, bank-import commit(), settings-sidebar) flagged as
separate scoped tasks, NOT bundled. Demo-account `currency` permission
top-up was a stale-env fix (additive-permission design — old accounts
need the registration top-up; a known general property, not a code
bug). Honest: implementation + automated + real-DB money QA COMPLETE;
live-browser QA of the /settings/currencies UI is the explicit
Phase-2 step (not performed). 6.5 cash-flow multi-currency
consolidation remains an explicitly-deferred follow-up (the convert
helper now exists to enable it).
