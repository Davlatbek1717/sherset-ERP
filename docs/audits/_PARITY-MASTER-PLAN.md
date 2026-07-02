# 🎯 PARITY MASTER-PLAN — moysklad bilan chinakam 1:1 (professional reja)

> **2026-06-15.** Bu — butun ilovani moysklad.uz bilan **piksel + xulq + ma'lumot-modeli** bo'yicha 1:1 qilishning
> yagona reja-hujjati. Avvalgi «taxmin→qur→xato top→qaytar» usuli **tugamasdi** — bu reja **yaqinlashuvchi**
> (convergent) usulга o'tadi. Manba: jonli inventarizatsiya (246 marshrut · 9 umumiy namuna · jonli moysklad audit).
> Status-ledger: `docs/progress.json` + per-page audit doc + bu rejaning §9 jadvali.

---

## 0. ASOSIY TAMOYIL (o'zgarmas)

> **Real moysklad = YAGONA HAQIQAT-MANBA.** Hech narsa xotiradan/taxmindan/screenshotdan emas — har ish jonli
> moysklad bilan **yonma-yon** isbotlanadi.

**Har ish-birligi 4 qadamdan o'tadi (qisqartirilmaydi):**
1. **SPEC** — jonli moyskladni (read-only, `.env.local` creds, **URL = moysklad.UZ**) element-by-element aylanib, to'liq spec yozish (har dropdown ICHI, har modal, xulq-modeli, ma'lumot-modeli, lokal).
2. **QUR** — spec'ga aniq mos qurish (gate: tsc0 · biome0 · vitest · i18n).
3. **SELF-VERIFY** (§1) — MEN o'zim yonma-yon adversarial tasdiqlayman, **0 farq** topmagunimcha.
4. **ARTEFAKT** — yonma-yon screenshot/yozuv repoда saqlanadi; ledger «verified» bo'ladi.

---

## 1. «VERIFIED» TA'RIFI + SELF-VERIFY DARVOZASI ⭐ (eng muhim — user qoidasi 2026-06-15)

**User talabi:** «oxirida sen O'ZING tasdiqlashing shart, keyin men tekshiraman; lekin men tekshirganда 1-2 ta xato
ko'rishim kerak, ko'p emas — shuning uchun sifatli ishla.»

**Demak sahifa «verified» bo'lishi uchun:**
1. **MEN sizga ko'rsatishdan OLDIN — o'zim, element-by-element, jonli moysklad bilan YONMA-YON tekshiraman**
   (xotiramdan emas — ikkala oynani ochib, har elementни taqqoslab).
2. **Adversarial:** men faol *farq qidiraman* (har dropdown ochaman, har modal, har holat, har lokal) — nafaqat
   «render bo'ldimi». O'zim **0 farq** topmagunimcha — «tayyor» demayman.
3. **Siz tekshirganда ≤1-2 narsa** = qabul qilinadigan qoldiq. **Ko'p chiqsa = MEN sifat-darvozasidan o'tmadim**
   → xato menда, qaytadan (bu menga «done» deyish huquqini bermaydi).
4. **Artefakt majburiy:** har «verified» da'vo yonma-yon isbotni (screenshot/recording) repoда ko'rsatadi.

**TAQIQ:** «deyarli tayyor / ~90% / ko'rinadigan farq yo'q» — bularni ishlatmayman. «100%» — **faqat siz tasdiqlasangiz.**
*(Sabab: `feedback-visual-parity-not-functional-parity` — vizual audit ≠ funksional parity.)*

---

## 2. USUL: VERTIKAL PILOT → GORIZONTAL PAGE-PAGE (sizning «page-page mi yoki umumiy?» savolingizga javob)

**Ikkalasi qarama-qarshi EMAS.** To'g'ri javob — **ikkalasi, shu tartibda:**

- **Avval 1 ta to'liq sahifa-oilasi (PILOT) = customer-order** (list + filtr + new + detail). Bu **umumiy
  komponentlarni** (picker, filtr, sana, mahsulot-modali, lokal) to'g'ri qurishga **majbur qiladi** — chunki ular shu
  sahifада ishlatiladi.
- **Pilot yonma-yon tasdiqlangach** → o'sha **tayyor umumiy namunalar bilan** qolgan sahifalar **page-page, TEZ** ketadi
  (ular 80%ni baham ko'radi).

> **Demak:** umumiy ish ≠ alohida bosqich — u pilotни qurganда **avtomat** bo'ladi. Pilotni «vertical slice» deб
> quramiz; keyin gorizontal yoyamiz.

**Keyingi sessiya = customer-order pilotini sinash.** Siz «o'xshadi» desangiz → ketma-ket barcha bo'limlar.

---

## 3. HAJM (inventarizatsiya) — 246 marshrut · 17 modul

> Bu — to'liq qamrov (parity-ledger qatorlari). Har marshrut = list / new / detail.
> **Jami: 97 list · 61 new · 88 detail = 246 marshrut.**

| Modul | List | New | Detail | Asosiy hujjat/entity |
|---|---|---|---|---|
| **Продажи** (Sales) | customer-orders · invoices-out · demands · commission-reports · sales-returns · factures-out · consignments | customer-orders · invoices-out · demands · sales-returns | customer-orders · invoices-out · demands · sales-returns · factures-out | CustomerOrder, InvoiceOut, Demand, SalesReturn |
| **Закупки** (Purchases) | purchase-orders · invoices-in · supplies · purchase-returns · factures-in | purchase-orders · invoices-in · purchase-returns | + supplies · factures-in | PurchaseOrder, InvoiceIn, Supply |
| **Товары** (Goods) | products · product-folders · variants · services · bundles · price-types · price-lists · tracking-codes | products · variants · services · bundles · price-lists · tracking-codes | (mos detail'lar) | Product, Variant, Service, Bundle |
| **CRM** | counterparties · contracts · contact-persons · calls · opportunities(+board) · pipelines · discounts | (mos new) | (mos detail) | Counterparty, Contract, Opportunity |
| **Склад** (Stock) | moves · internal-orders · losses · enters · inventories | (5 new) | (5 detail) | Move, Enter, Loss, Inventory, InternalOrder |
| **Деньги** (Money) | money · payments-in · payments-out · cash-in · cash-out · bank-import · prepayments · prepayment-returns · counterparty-adjustments · payrolls | (8 new) | (8 detail) | PaymentIn/Out, CashIn/Out, Prepayment |
| **Розница** (Retail) | retail · retail/sessions · retail/sales · retail/z-report | — | sessions/[id] · sales/[id] | RetailShift, RetailDemand |
| **Онлайн** (Ecommerce) | ecommerce · channels · orders | channels | channels/[id] · orders/[id] | SalesChannel |
| **Производство** (Production) | productions · boms · processes · stages · work-orders · processing-orders · processings | (7 new) | (7 detail) | Processing, BOM, WorkOrder |
| **Задачи** (Tasks) | tasks | tasks | tasks/[id] | Task |
| **Решения** (Apps) | apps | — | apps/[appKey] | — |
| **HR** (Команда) | hr + 10 sub (employees/attendance/payroll/...) | — | employees/[id](+salary,permissions) | Employee |
| **Аналитика** | analitika + ~16 sub (kontragentlar/mahsulotlar/buyurtmalar/inventerizatsiya/xodimlar/sozlamalar/rollar...) | (2 new) | (4 detail) | Reports, Roles |
| **Отчеты** (Reports) | reports + ~16 (sales/cash-flow/pnl/stock-balance/abc/aging/...) | — (read-only) | — | — |
| **Настройки** (Settings) | settings + ~26 (users/organizations/stores/cash-desks/bank-accounts/.../customer-order-statuses) | (14 new) | (15 detail) | Org, Store, CashDesk, ... |
| **Показатели** (Dashboard) | / | — | — | KPI widgets |
| **Boshqa** | getting-started · files · korzina · labels/print · help | — | — | — |

---

## 4. UMUMIY POYDEVOR — 9 namuna (Bosqich 1, eng yuqori leverage; pilotда quriladi)

> Bular har sahifada takrorlanadi → bitta tuzatish ~hamma sahifaga. **Pilot avvalo shularni to'g'rilaydi.**

| # | Namuna (fayl) | Hozirgi xulq | moysklad (target) | Ish |
|---|---|---|---|---|
| 1 | **Picker** `CatalogPicker`/`CatalogPickerField` | bosish → modal qidiruv | input'ga **yozsang jonli filtr** + **ikon → modal**; modal ham bir xil | 🔴 xulq-model + modal qayta |
| 2 | **Filtr panel** `InlineFilterPanel`/`FilterDrawer` | bosish → modal/drawer; tiqilgan | **input'ga yozib-filtrlash** + joylashuv/oraliq | 🔴 model + layout |
| 3 | **Mahsulot-qidiruv** `PositionInlineAdd` | oddiy ro'yxat; ota-div overflow bug | rasmдеki (kod+nom+**qoldiq-belgi**+«Еще N»+«Создать новый»); overflow tuzatish | 🔴 |
| 4 | **Tovar-modali** «Добавить из справочника» | bo'sh qator + per-qator qidiruv | **papka-daraxt + stok-ustunlar (Остаток/Резерв/Ожидание/Доступно) + bulk-qty + Создать/Фильтр** | 🔴 (eng katta) |
| 5 | **Sana** `DatePicker` | bosish → kalendar | **ikon → kalendar; YOZUV → sana+vaqt tahrir** | 🟡 ikon-vs-yozuv |
| 6 | **Modal** `Modal` | markaziy modal | moysklad modal-stili (nesting: modal ichida modal) | 🟡 stil + nesting |
| 7 | **DropdownMenu** | radix dropdown | moysklad toolbar-menyu stili | 🟡 |
| 8 | **PositionTable** | qat'iy ustunlar | **⚙ ustun-customizer** + Вес/Объем/Отгружено/Резерв/Ожидание/Доступно/Остаток · «Цена ▾» bulk | 🔴 |
| 9 | **i18n/lokal** `messages/*` | default uz; RU sizadi | **default = RU** (moysklad); UZ to'liq; pozitsiya-jadval RU-leak tuzatish | 🔴 lokal-leak + strategiya |
| + | **DocumentEditor/Header/Toolbar** · **ListView** | bor | egasi-popover · «Создать документ» menyu · ✎ ruchkalar · org/agent default · ↑ shular bilan | 🔴/🟡 |

---

## 5. BOSQICHLAR

### Bosqich 0 — ASBOB (poydevor, bir marta)
- **Ground-truth yig'uvchi:** jonli moyskladdan har element + dropdown ICHI + modal + computed stil + **API/tarmoq
  chaqiruvlari** (default org/agent qayerdan — ma'lumot-modeli) + screenshot. (`tools/capture/` ni kuchaytirish.)
- **Yonma-yon diff:** bizniki `:3100` ↔ moysklad jonli (piksel + element-ro'yxat farqi, ikki tomonlama: yetishmagan VA **ortiqcha** — masalan «CSV import»).
- **Parity-ledger:** har marshrut/namuna holati = boshlanmagan→spec→qurilgan→**verified** (mashina-tekshiriladigan, falsifiable).

### Bosqich 1 — UMUMIY POYDEVOR (§4 — pilotда)
Picker/filtr/sana/mahsulot-modali/lokal/PositionTable/egasi/«Создать документ»/✎/default — har biri SPEC→QUR→SELF-VERIFY.

### Bosqich 2 — SAHIFA-SAHIFA (modul bo'yicha, pilotдan keyin)
Pilot (customer-order) tasdiqlangach, §3 jadvalini **modul-prioritet** bilan kechib o'tamiz (§9). Har sahifa: SPEC→QUR→SELF-VERIFY→ledger.

### Bosqich 3 — CHUQUR XULQ QA
Validatsiya · xato-xabar · hisob-kitob (НДС 3-tomonlama) · «Создать документ» nima yaratadi · print · konkurensiya — jonli bilan.

---

## 6. PILOT GAP-RO'YXATI — customer-order (jonli auditdan; `customer-order-new-moysklad-live-audit.md`)

**🔴 BLOCKING:** (1) tovar-modali (papka+stok+bulk-qty) · (2) «Создать документ» 11-menyu · (3) ✎ ruchkalar
(Орг/Контр/Склад) · (4) egasi «Владелец» popover · (5) «Цена» bulk (Расценить/Сохранить цены) · (8) PositionTable
ustun-customizer + Вес/Объем/Отгружено/Резерв/Ожидание/Доступно/Остаток.
**🟡 HIGH:** Адрес доставки strukturali-expand (/new) · Изменить→Копировать · «+» inline-create (Канал/Договор/Проект/Уста).
**Bug/aniq:** mahsulot-qidiruv overflow · «CSV import» OLIB TASHLASH (moyskладда yo'q) · «Уста» turi (reference'mi? login bilan
aniqla) · sana ikon-vs-yozuv · ro'yxat-filtr tiqilgan + xulq-model · org/agent default-manba · RU-leak (pozitsiya-jadval).

---

## 7. BOSHQARUV (governance — eski tuzoq qaytmasin)

1. **«Verified» = §1** (yonma-yon artefakt, adversarial, men 0-farq, siz ≤1-2).
2. **Hisobot:** faqat ledgerда «verified» bo'lgani — «verified». Artefaktsiz «tayyor» YO'Q. «100%» faqat siz aytganда.
3. **Halollik-gate:** har parity-da'vo yonma-yon isbotни ko'rsatadi. Honesty-commit-gate kuchda.
4. **Hajm halolligi:** moysklad ulkan; bu **oylab, ko'p-sessiyalik** ish — «deyarli tayyor» emas. Status doim halol ko'rinadi.

---

## 8. KEYINGI SESSIYA — PILOT REJA (customer-order)

1. **SPEC:** login bilan jonli moysklad — customer-order **list + filtr + new + detail** ni to'liq aylanib, har elementни spec'ga yoz.
2. Asbob (Bosqich 0) ni qur (ground-truth + yonma-yon diff + ledger) — minimal, ishlaydigan.
3. **Umumiy namunalardan boshla** (eng ko'p ta'sir): picker (yozib-filtr+ikon→modal) → filtr-panel → mahsulot-qidiruv/modali → sana → lokal-strategiya (RU-default) → PositionTable (customizer+ustunlar).
4. Keyin customer-order'ga xos: «Создать документ» menyu · ✎ ruchkalar · egasi-popover · «Цена» bulk · Адрес-expand · «CSV import» olib tashlash · «Уста» turi · default-manba.
5. **Har bo'lakdan keyin SELF-VERIFY** (yonma-yon, 0-farq). Pilot to'liq bo'lgach → SIZGA ko'rsataman (≤1-2 xato kutilma).

---

## 9. PAGE-PAGE TARTIBI (pilotдan keyin — modul prioritet)

> Umumiy namunalar tayyor bo'lgach, har modul **tezlashadi** (80% baham ko'rilgan). Tartib (foydalanish-chastotasi bo'yicha):

1. **Продажи** (pilot shu yerda) → invoices-out · demands · sales-returns · factures-out · consignments · commission-reports
2. **Закупки** → purchase-orders · supplies · invoices-in · purchase-returns · factures-in
3. **Склад** → moves · enters · losses · inventories · internal-orders
4. **Деньги** → payments-in/out · cash-in/out · prepayments · prepayment-returns · counterparty-adjustments · payrolls · bank-import
5. **Товары** → products · variants · services · bundles · price-lists · tracking-codes · product-folders
6. **CRM** → counterparties · contracts · contact-persons · opportunities · pipelines · discounts · calls
7. **Розница** · **Онлайн** · **Производство** · **HR** · **Задачи**
8. **Аналитика** · **Отчеты** (read-only — yengilroq)
9. **Настройки** (~26 sahifa — ko'p, lekin oddiy CRUD pattern)
10. **Показатели** (dashboard) · boshqa

> Har modul ichида: avval **list+filtr**, keyin **new**, keyin **detail** — chunki ular pattern baham ko'radi.

---

*Bu reja har sessiyada yangilanadi (ledger + holat). Asosiy hand-off: `NEXT.md`. Jonli audit: `docs/audits/customer-order-new-moysklad-live-audit.md`.*
