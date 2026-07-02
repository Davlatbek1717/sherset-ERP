# audit-customer-orders.md — Заказы покупателей 1:1 audit

**Sana:** 2026-05-29 · **Reference:** `moysklad-reference/customer-orders/states/` (`0d08dfaf`) · **DoD:** `templates/page-audit-DoD.md`
**App:** online.moysklad.uz/app/#customerorder (GWT) · **Bizniki:** /customer-orders (`apps/web/src/app/(app)/customer-orders/page.tsx`)

> Status: **P1+P2 (LIST+DETAIL) keng audit + NEW forma i18n — 8 real fix.** P3 state-capture + P4 pixel side-by-side qoldi (working web server + live moysklad capture kerak). DoD HALI yopilmagan (halol).

## A1 umumiy holat (2026-05-29(b) sessiya yakuni)
| Faza | Holat | Izoh |
|------|-------|------|
| P0 reference | ✅ | `0d08dfaf` (Изменить+Печать DOM); Статус/Столбцы/detail capture-refinement qoldi |
| P1 structural | ✅ | LIST + DETAIL + NEW struktura moysklad bilan mos |
| P2 interactive | ✅ keng | LIST (4 dropdown+pagination+saved-filter+14 picker+totals+columns) + DETAIL (toolbar+status+4 tab+externalCode) + NEW (i18n) — **8 real fix** |
| P3 stateful (S1-S13) | 🚧 | pagination/selection/empty/error/saved-filter jonli ko'rildi (P2 davomida); to'liq state-screenshot qoldi |
| P4 side-by-side | ⏳ | jonli moysklad capture (Статус/Столбцы/detail) + bizning screenshot kerak |
| DoD | ⏳ | P3 to'liq + P4 yopilmaguncha emas |

**8 fix:** LIST 6 (Копировать/Статус-500/Создать-Отгрузка/pagination/saved-filter/groups-404) + DETAIL externalCode-editable + NEW-forma i18n. ⚠️ Sessiya oxirida web dev server (:3100) javob bermay qoldi (environment) — qolgan jonli render/P3/P4 keyingi sessiyaga (server restart kerak).

## Phase 1 — Structural delta (LIST)
| # | Element | moysklad | bizda | delta | holat |
|---|---------|----------|-------|-------|-------|
| 1 | Title | Заказы покупателей | t('title') | ok | ✅ |
| 2 | Toolbar tugmalari | Фильтр·Изменить·Заказ·Статус·Печать·Столбцы·Найти·Очистить (role=button) | Filter·Изменить·Создать·Статус·Печать·+Заказ·Столбцы | struktura mos | ✅ |
| 3 | Filter panel | ~18-20 maydon | ~22 maydon (InlineFilterPanel) | bizda ortiqcha bor (Склад, Sum from/to) — moysklad'da ham bor, ok | ✅ |
| 4 | Columns (default) | №·Время·Контрагент·Организация·Сумма·Валюта·Выставлено·Оплачено·Отгружено·Зарезервировано·Статус·Отправлено·Напечатано·Комментарий | name·moment·agent·organization·sum·currency·invoicedSum·payedSum·shippedSum·reservedSum·state·published·printed·description | mos (unpaidSum default'da yashirin — to'g'ri) | ✅ |

## Phase 2 — Interactive delta (silent-no-op + dropdown items)

### Изменить dropdown (moysklad 8 item — metadata.json'dan tasdiqlangan)
moysklad: `Удалить · Копировать · Массовое редактирование · Провести · Снять проведение · Объединить · Зарезервировать · Очистить резерв`

| # | Item | moysklad | bizda (`bulk-actions-dropdown.tsx`) | delta | holat |
|---|------|----------|------|-------|-------|
| 1 | Удалить | ishlaydi | ✅ wired (bulk-delete) | ok | ✅ |
| 2 | Копировать | ishlaydi | ✅ wired → per-id `:id/clone` fan-out (allSettled) | tuzatildi (clone endpoint allaqachon bor edi) | ✅ |
| 3 | Массовое редактирование | ishlaydi | ✅ wired → MassEditModal (`7becded9`) | tuzatildi | ✅ |
| 4 | Провести | ishlaydi | ✅ wired (→'confirmed') | ok | ✅ |
| 5 | Снять проведение | ishlaydi | ✅ wired (→'draft') | ok | ✅ |
| 6 | Объединить | ishlaydi | ❌ disabled "soon" | gap: merge feature yo'q (murakkab — defer, halol) | ⏳ |
| 7 | Зарезервировать | ishlaydi | ❌ disabled "soon" | gap: reserve endpoint (reservedSumMinor bor) | ⏳ |
| 8 | Очистить резерв | ishlaydi | ❌ disabled "soon" | gap: clear-reserve endpoint | ⏳ |

**Qo'shimcha P2a kamchilik — TUZATILDI:** "soon" suffiksi avval `tCommon('not_found') ?? 'soon'` HACK edi → endi to'g'ri `common.coming_soon` kaliti (uz "tez orada" / ru "скоро") uz+ru'da qo'shildi. Faqat 3 ta endpoint-siz item (Объединить/Зарезервировать/Очистить резерв) shu suffiksni ko'rsatadi.

### Печать dropdown (moysklad 4 item)
moysklad: `Список заказов · Заказ · Комплект... · Настроить...`

| # | Item | moysklad | bizda (`print-dropdown.tsx`) | delta | holat |
|---|------|----------|------|-------|-------|
| 1 | Список заказов | ishlaydi | ✅ wired (CSV export) | ok | ✅ |
| 2 | Заказ | ishlaydi (PDF) | ✅ wired → bulk-print (ЗАКАЗ PDF, tanlangan buyurtmalar) | tuzatildi | ✅ |
| 3 | Комплект... | ishlaydi | ❌ disabled placeholder | gap: bundle template | ⏳ |
| 4 | Настроить... | ishlaydi | ✅ wired (→/settings/print-templates) | ok | ✅ |
| + | Запросить форму | info card | ✅ mavjud (support link → moysklad.ru) | ⚠️ tashqi link moysklad.ru'ga — bizning support emas | ⏳ |

### Статус dropdown (StatusChangeDropdown) — AUDIT QILINDI

**Adversarial topilma (jonli isbotlangan):** komponent avval `/states?entityType=customerorder` so'rab, mavjud bo'lsa har holatni `name.toLowerCase()` qilib `bulk-transition` `target`'iga yuborardi. Lekin:
- `CustomerOrder`'da custom-status FK **yo'q** — faqat FSM `state String` (8 enum) bor.
- `State` entity (rangli custom holatlar) faqat `counterparties` bilan bog'langan, hech qaysi hujjat bilan emas.
- `bulk-transition` `OrderStateSchema.safeParse(target)` qiladi; non-enum nom (masalan kirill "новый") → **HTTP 500** (`curl` bilan isbotlandi).

**Tuzatildi (bu round):**
- Frontend: buzilgan `tenantStates` shoxi olib tashlandi → endi faqat FSM 8 holat ko'rsatiladi (xavfsiz, mavjud testlar yashil). Docstring to'g'rilandi.
- Backend: `throw new Error` → `BadRequestException` (2 joy: bulk-transition + single transition) → non-enum target endi **400** (500 emas), jonli tasdiqlandi.
- Test: `OrderStateSchema` custom/kirill nomlarni rad etishini isbotlovchi schema test qo'shildi (20 test).

**Halol feature defer (kvantlangan):** moysklad'ning tahrirlanadigan «Статус» (account-defined rangli workflow holatlari, «Настроить статусы») customer-orders uchun **modellashtirilmagan**. To'liq 1:1 uchun kerak: (1) `CustomerOrder.statusId` FK → `State` + migration; (2) `State.entityType='customerorder'` qo'llab-quvvatlash; (3) FSM `state`'dan mustaqil status o'rnatish service; (4) list «Статус» ustuni custom statusni ko'rsatishi; (5) Sozlamalarda status CRUD. Hozir FSM holati «Статус» sifatida ko'rsatiladi (oddiy setuplar uchun maqbul approksimatsiya).

### Filter picker popuplari (CatalogPicker ×14) — AUDIT QILINDI

14 ta picker tekshirildi (agent/org/store/project/owner/contract/agentGroup/agentAccount/orgAccount/salesChannel/group/product/massEditOwner/massEditProject). Har birining fetcher endpointi + onSelect (filter state'ga yozish) ko'rildi.

**Adversarial topilma (jonli isbotlangan):** `agentGroup` («Группа контрагента») va `group` («Владелец-отдел») pickerlari **`/groups`** endpointini chaqirardi — bu endpoint **YO'Q edi → HTTP 404** (jonli tasdiqlandi). Natija: ikkala group-filter o'lik (popup ochiladi, hech narsa kelmaydi, group bo'yicha filtrlash imkonsiz). Bu aynan `/employees` picker'i bilan bo'lgan silent-404 sinfi (controller'da hujjatlangan).

**Tuzatildi (bu round):** `reference.controller.ts`'ga `GET /groups` qo'shildi (generic `Group` entity, accountId tenant-guard, search, index→name order, `{items:[{id,name}]}` shape — boshqa reference endpointlar bilan bir xil pattern). Jonli: `/groups` endi **HTTP 200** (404 emas). Backend filtri allaqachon to'g'ri edi (agentGroupId→`agent.groupId`, groupId→`CustomerOrder.groupId`) — faqat lookup endpoint yetishmasdi.

**Qolgan 12 picker:** endpointlari to'g'ri (counterparties/organizations/stores/projects/users/contracts/sales-channels/products + counterparties|organizations/:id/accounts), onSelect filter state'ga to'g'ri yozadi. Dev akkauntda group=0 (endpoint bo'sh list qaytaradi — to'g'ri); group CRUD UI yo'q (alohida masala).

### Saqlangan filter pill (SavedFiltersPills) — AUDIT QILINDI

Komponent o'zi to'liq: list/create(+)/rename(✏ inline)/delete(🗑)/apply, `/saved-filters` GET/POST/PATCH/DELETE endpointlar bor.

**Adversarial topilma (jonli isbotlangan):** pill bosilganda `onApply` faqat 7 ta BASIC maydonni (moment/agent/org/store/sum) tiklardi, LEKIN:
- `extFilter` (advanced) maydonlari — paymentStatus/shippedStatus/reservedStatus/project/contract/state/product/agentGroup/agentAccount/salesChannel/group/orgAccount/applicable/printed/published/shared/updated* — **umuman tiklanmasdi** (saqlangan query'da bor edi, lekin yo'qolardi).
- `ownerId` va barcha label'lar ham tushib qolardi.
- eski `extFilter` tozalanmasdi → saqlangan filter ustiga eski advanced filter qolib ketardi.
Sabab: list query `filterValues + extFilter` STATE'dan quriladi, saqlangan query'dan emas — shuning uchun tiklanmagan maydon "keyingi GET'da yuboriladi" degan izoh **noto'g'ri** edi.

**Tuzatildi (bu round):** `onApply` endi ikkala state'ni to'liq tiklaydi — basic uchun shared `filterFromQueryString` (ownerId + label'lar ham), advanced uchun inline decode; ikkalasi ham to'liq almashtiriladi (eski tozalanadi).

**Jonli smoke (Playwright + network):** `paymentStatus=paid` advanced field'li saqlangan pill yaratildi → bosildi → list so'rovi `GET /customer-orders?...&paymentStatus=paid` bilan ketdi (avval bu maydon tushib qolardi). QA filter o'chirildi.

**Halol minor follow-up:** advanced picker label'lari saqlangan query'da yo'q (faqat id'lar API'ga ketadi) → tiklanganda chip id bilan ko'rinishi mumkin (filtrlash to'g'ri, faqat ko'rinish). Label hydration (id→nom fetch) keyingi qadam.

### Pagination (sahifalash) — AUDIT QILINDI

**Adversarial topilma (jonli brauzerda isbotlandi):** ro'yxat cursor-based paging ishlatadi (`hasNext`/`onNext`=nextCursor). LEKIN `onPrevious={() => setCursor(undefined)}` — istalgan sahifadan **1-sahifaga** sakrardi, oldingi sahifaga emas. `hasPrevious={!!cursor}` esa ishlaydigan "Oldingi" tugmasini ko'rsatardi (aslida buzilgan).

**Tuzatildi (bu round):** cursor-history stack qo'shildi (`prevCursors`). onNext joriy cursor'ni stack'ga qo'shadi; onPrevious bittasini pop qiladi; `hasPrevious = prevCursors.length > 0`. Barcha reset yo'llari (filter/sort/search/saved-filter → `setCursor(undefined)`) bitta effekt orqali stack'ni markazlashgan tozalaydi (15 ta call-site tahrir qilinmadi).

**Jonli brauzer smoke (Playwright, >100 buyurtma bor):** 1-sahifa (02518, prev disabled) → next → 2-sahifa (01676, prev enabled) → next → 3-sahifa (02271) → **prev → 2-sahifa (01676)** → **prev → 1-sahifa (02518, prev disabled)**. To'liq oldinga/orqaga sikl to'g'ri. (API forward-cursor zanjiri ham tasdiqlandi: 1∩2 overlap=0.)

**Halol gap (kvantlangan):** moysklad offset/raqamli paginatsiya + **25/50/100 qator-soni selektori** beradi; bizda fiqslangan `LIMIT=100` + faqat next/prev. Page-size selektori qo'shilishi kerak (P2 delta).

### Создать dropdown (CreateRelatedDropdown) — AUDIT QILINDI

**Adversarial topilma (jonli isbotlangan):** komponent har item'da `/<doc>/new?fromOrder=<ids>` ga navigatsiya qilardi, LEKIN `fromOrder` (va `available`) parametrini **hech bir /new forma o'qimaydi** (`grep` bilan tasdiqlandi — faqat yozuvchilar bor, o'quvchi yo'q). Ya'ni har bosish **bo'sh forma** ochib, tanlangan buyurtma kontekstini yo'qotardi — silent no-op. moysklad esa kontragent + pozitsiyalarni oldindan to'ldiradi.

**Mavjud isbotlangan endpointlar (server-side prefill):** faqat `POST /demands/from-customer-order/:id` va `POST /invoices-out/from-customer-order/:id` (detail sahifa shularni ishlatadi — Sotuv E2E kaskadi). cash-in / payment-in / purchase-order uchun from-CO endpoint **YO'Q**.

**Tuzatildi (bu round):**
- "Отгрузка" (demand) endi `POST /demands/from-customer-order/:id` orqali REAL prefill qiladi (bitta buyurtma tanlanganda), yaratilgan demand'ga o'tadi — detail sahifadagi "Отгрузить" oqimi bilan bir xil. Endpoint jonli tasdiqlandi (bogus id → 404, 500 emas).
- Ko'p tanlovda "Отгрузка" disabled + `coming_soon` (bir nechta buyurtmani birlashtirib bitta demand = «Объединить» bilan bir xil defer).
- Docstring to'g'rilandi (stale "Round 3-4 / forma fromOrder o'qiydi" da'vosi olib tashlandi).
- Test: from-customer-order chaqiruvi + yaratilgan demand'ga navigatsiya + multi-select disabled (6 test).

**Halol gap (kvantlangan, hali ⏳):**
- Заказ поставщику ×2 / Приходный ордер / Входящий платёж — from-CO endpoint yo'q → hozircha bo'sh /new ga o'tadi (prefill emas). Har biri uchun backend `from-customer-order` create endpoint kerak.
- Item to'plami moysklad bilan tekshirilishi kerak: "supply" (Приёмка) CO Создать menyusiga begona ko'rinadi; "Счёт покупателю" (invoice-out, endpoint bor!) yo'q. Aniq item ro'yxati uchun yangi jonli capture kerak (P0 metadata faqat Изменить+Печать DOM'ini saqlagan).
- Detail sahifa: "Входящий платёж" tugmasi ham (`[id]/page.tsx:546`) bo'sh `/payments-in/new?fromOrder=` ga o'tadi — xuddi shu silent no-op (detail audit'ida hal qilinadi).

## A1 TO'LIQ SIRTLAR RO'YXATI (hech biri tushib qolmasin)

Foydalanuvchi talabi: eng kichik joy ham, **filter bosilganda chiqadigan picker/popup'lar ham** qolmasligi kerak. A1 quyidagi HAMMA sirtdan o'tishi shart:

### LIST sahifa
- [x] Toolbar struktura (P1) ✅
- [x] Изменить dropdown — 8 item ✅ (3 fix: Массовое редактирование, Печать→Заказ, Копировать)
- [x] Печать dropdown — 4 item ✅ (1 fix)
- [x] **Статус dropdown** (StatusChangeDropdown) — audit qilindi: 500-crash bug tuzatildi (FSM-only), custom-status feature halol defer ✅ (yuqoriga qarang)
- [x] **Создать dropdown** (CreateRelatedDropdown) — audit qilindi: silent-no-op topildi, "Отгрузка" REAL prefill ulandi; qolgan 4 item from-CO endpoint kutadi (gap, yuqoriga qarang) 🚧
- [x] **Столбцы** (ColumnCustomizer) — show/hide/reset + localStorage persist (`useColumnVisibility`, 15-sahifa shared pattern) ✅; gap: moysklad'da ustun panelida 25/50/100 qator-soni yo'q (u paginatsiyada — pastga qarang)
- [x] **Har filter picker popup** (CatalogPicker ×14) — audit qilindi: `agentGroup`+`group` `/groups` 404 (o'lik) topildi → `GET /groups` reference endpoint qo'shildi, jonli 404→200 ✅; qolgan 12 picker endpoint+onSelect to'g'ri
- [ ] **PeriodPicker** (Период / Когда изменен) — moysklad sana-picker bilan ⏳
- [x] **Saqlangan filter pill** (✏ edit/rename/delete) — audit qilindi: apply advanced-field'larni tushirib qoldirardi → to'liq tiklash fix, jonli network smoke o'tdi ✅ (minor: label hydration follow-up)
- [x] **Pagination** — audit qilindi: "Oldingi" buzilgan (1-sahifaga sakrardi) → cursor-stack fix, jonli brauzer smoke o'tdi ✅. Gap: 25/50/100 page-size selektori yo'q ⏳
- [x] **Footer totals** (ShowTotalsLink → `/aggregate/totals`) — jonli tasdiqlandi: filtersiz count 20405, `paymentStatus=paid` → 15826 (filter hurmat qilinadi, sumMinor farq qiladi) ✅
- [ ] **Sort** har header (▲▼) + **resize** — wired (`onSortChange`/`onColumnResize`); jonli tekshiruv qoldi ⏳

### DETAIL sahifa (`/customer-orders/[id]`) — AUDIT BOSHLANDI (P2)
Toolbar: Изменить (Save/Copy→clone/Delete/Prev/Next) · Создать документ · Печать · Отправить.
- [x] Toolbar **Создать документ** dropdown: Отгрузка→`shipMut` (from-CO demand) ✅ · Счёт→`invoiceMut` (from-CO invoice-out) ✅ · **Входящий платёж = no-op** (`onSelect: undefined` placeholder) ⏳
- [x] **Status dropdown** (inline «Новый ▾`) — FSM slug'lar (`ORDER_STATES`)→`transitionMut`, custom-status bug YO'Q (LIST'dagidan farqli) ✅
- [x] **Tablar** (4): Pozitsiyalar (PositionEditor) · Bog'liq (RelatedDocsTab: demand+invoice) · Fayllar (AttachmentsSection) · Tarix (audit-log) — hammasi real, no-op yo'q ✅
- [x] **«Внешний код»** maydon avval read-only (`disabled`) edi → **editable qilindi** (FormState+formFromData+snapshot+payload+input); jonli PATCH tasdiqlandi (200, persist, revert) ✅
- [x] **check_bundle** tugmasi `title={tCommon('not_found')}` HACK (chalg'ituvchi "Topilmadi" tooltip) → `coming_soon` ✅ (feature defer)
- [ ] Side summary (DetailTotalsSidebar) + Vazifalar paneli — wired ko'rinadi, jonli tekshir qoldi ⏳

**Halol gap (DETAIL, kvantlangan):**
- «Запросить оплату» header tugmasi (`[id]:546`) + Создать→Входящий платёж = bo'sh `/payments-in/new` ga o'tadi (prefill yo'q, from-CO payment endpoint yo'q) — LIST'dagi bilan bir xil gap.
- RelatedDocsTab faqat demand+invoice ko'rsatadi (boshqa bog'liq turlar yo'q).
- Создать документ menyusi 3 item (moysklad'da ko'proq: Заказ поставщику/Возврат/...) — aniq to'plam capture kutadi.

### NEW forma (`/customer-orders/new`) — AUDIT QILINDI (866 satr)

**Adversarial topilma:** butun forma i18n'siz edi — `useTranslations` umuman yo'q, ~31 user-facing string **hardcoded** (aralash uz+ru: "Tovar tanlang", "Покупатель", "Комментарий", "Задачи", STATUS_OPTIONS "Черновик/Подтверждён/Отменён", validatsiya xatolari "Kontragent tanlang" ...). Natija: **ru locale buzilgan** (uz stringlar ko'rinadi) va nomuvofiq aralash til.

**Tuzatildi (bu round):** to'liq i18n migratsiya — `tForm`/`tFields`/`tStates` hooklar; 31 string almashtirildi (8 label→`fields.*`, 9 placeholder + 8 picker title→`form.*` mavjud kalitlar reuse, STATUS_OPTIONS→`states.customer_order`, 6 validatsiya xatosi→`form.*`). 19 yangi `form` kalit qo'shildi (uz+ru) — qolgani mavjud kalitlardan reuse.

**Sifat darvozalari:** web typecheck 0 · biome 0 · uz+ru JSON valid · **40/40 referenslangan i18n kalit ikkala localeда mavjud** (statik tekshiruv — missing-key render-xatosi yo'qligini isbotlaydi). ⚠️ Jonli brauzer-render smoke bu sessiyada bloklandi (web dev server javob bermay qoldi — environment, kod emas; list sahifa ham timeout berdi). Statik i18n tekshiruvi aynan shu fail-mode'ni qoplaydi.

**Halol minor qoldiq:** `<option>` valyuta nomlari (сум/доллар/евро/руб) hali hardcoded (kod ham ko'rsatiladi — past prioritet).
- [x] Field layout + validatsiya + picker'lar — i18n migratsiya + statik tekshiruv ✅ (jonli render smoke environment sabab bloklandi)

### STATELAR (S1-S13)
- [ ] default·empty·loading·error·filter·sel-0/1/many·saved-filter·pagination·sort·col-hidden·mobile ⏳

## Phase 3 — Stateful (S1-S13)
Yuqoridagi ro'yxat bo'yicha ketma-ket — browser interaction kerak.

## Phase 4 — Reference side-by-side
01-default + dropdown screenshotlar `moysklad-reference/customer-orders/states/` da bor; piksel-diff alohida pass.

## Xulosa (LIST P2 — keng audit, 2026-05-29(b))
LIST sahifaning HAMMA interaktiv sirti tekshirildi (depth-first). **6 ta real bug topildi va tuzatildi**, 4 tasi jonli tasdiqlandi:

| # | Bug | Commit | Tasdiq |
|---|-----|--------|--------|
| 1 | Изменить→Копировать silent no-op (clone endpoint bor edi) + "soon" i18n hack | `53f29c5e` | unit test |
| 2 | **Статус dropdown HTTP 500** (custom status nomi → throw) | `de65799f` | jonli curl 500→400 |
| 3 | Создать→Отгрузка silent no-op (bo'sh forma, prefill yo'q) | `eea26e3f` | endpoint jonli |
| 4 | **Pagination "Oldingi"** 1-betga sakrardi | `4fe27460` | to'liq brauzer smoke |
| 5 | **Saqlangan filter apply** advanced-field'larni tushirardi | `4cbd82f9` | network smoke |
| 6 | **Filter group pickerlari** `/groups` 404 (o'lik) | `66bfb4a2` | jonli 404→200 |

**Audited-OK (bug yo'q):** Печать (4 item, oldingi round) · footer totals (filter hurmat) · Столбцы (localStorage persist) · 12/14 picker · sort/resize wired.

**Halol defer (haqiqiy feature work, endpoint/feature YO'Q — kvantlangan):** Объединить(merge) · Зарезервировать/Очистить резерв · Комплект print · Запросить форму support link · custom «Статус» entity (CO statusId FK) · cash-in/payment-in/purchase-order from-CO prefill endpointlari · paginatsiya 25/50/100 page-size selektor · advanced picker label hydration · group CRUD UI.

**LIST P2 ~ yakunlandi** (interaktiv sirtlar audit + bug-fix). Qoldi: sort/resize jonli smoke · P3 statelar (S1-S13) · **DETAIL sahifa** · **NEW forma** · P4 reference side-by-side (Статус/Столбцы/detail capture-refinement). DoD HALI yopilmagan.
