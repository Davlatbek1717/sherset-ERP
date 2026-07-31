# Customer-orders ↔ moysklad parity — delta ro'yxati (2026-07-31)

**Ground truth:** jonli `online.moysklad.uz` (tenant `elektro_sentr`), Playwright bilan olingan
2026-07-31. Bizniki: lokal `localhost:3100`, DB `climart_adopt`.

**Skriptlar** (qayta yugurtirish mumkin):
- `scripts/co-capture-ours.mjs` — biznikini oladi (list + new + detail)
- `scripts/co-capture-moysklad.mjs` — moysklad list + new
- `scripts/co-capture-ms-detail.mjs` — moysklad detail (00002 = Отгружен+Оплачено, 00005 = Новый)

**Dalil fayllari:** `.audit-co/` (scratchpad) — har delta yonida ekran nomi ko'rsatilgan.

**Status:** Phase-1 — strukturaviy audit. Bajarilgan bandlar render-darajasida live
browser smoke bilan tekshirilgan; to'liq Phase-2 QA (klik → saqlash → BE) YO'Q.

---

## BAJARILGANLAR (2026-07-31 sessiyasi)

| Commit | Bandlar | Natija |
|---|---|---|
| `f9cb42a` | #25 #26 #27 #28 | Detail tab-strip → `Главная \| Связанные документы \| События`; `Задачи`/`Файлы` pastdagi bo'limlarga. `DetailContentTabs.bottomSections` opt-in prop (20+ qardosh sahifa tegilmadi) |
| `3c6535e` | #29 #49 | «Резерв» checkbox — detail + /new. Yo'l-yo'lakay: `DocumentEditor` prop-uzatish bug'i (#55) |
| `add1d31` | #35 #51 | Org-hisob ost-qatori bo'sh ko'rinishi — caption `accountNumber \|\| name`; default hisob ustunligi. Cert: `tools/capture/cert-co-org-account-2026-07-31.mjs` |
| `d22e022` | #39 #40 | Pozitsiyalarda «Доступно» + «Отгружено» default ON |
| `079436f` | #13 | Filtr paneli 10 → 20 maydon ochiq (yashirin to'plam bo'shatildi) |

| `982fc80` | #5 #4 #3 | List gridi sig'adi (overflow 475px → 6px, o'lchangan) · «Итого» qatori avtomat (hajm-himoyasi ≤500 qator) · header ⚙ ko'rindi |
| `483ef10` | #22 | «Счёт» → «Счет» — 4 umumiy i18n kaliti |

**Yopilgan: 13 band.** Qolgan: **43**.

---

### ⚠️ Qolgan ishning haqiqiy hajmi (2026-07-31 da o'lchangan)

**#14–#21 — 8 ta yetishmayotgan filtr — bu UI ishi EMAS.** API'ning
`CustomerOrderFilterSchema` qo'llab-quvvatlaydigan kalitlari tekshirildi:

```
search state statusId agentId agentIds agentGroupId agentAccountId
organizationId organizationIds organizationAccountId storeId projectId
contractId salesChannelId groupId productId paymentStatus shippedStatus
reservedStatus applicable printed published shared ownerId
momentFrom/To updatedFrom/To sumMinorFrom/To
```

Yetishmayotgan 8 tasining **birortasi ham yo'q**. Har biri BE ishi talab qiladi:

| Band | Filtr | BE hajmi |
|---|---|---|
| #14 | План. дата отгрузки | **Kichik** — `deliveryPlannedMoment` ustuni MAVJUD (schema.prisma:4840). Faqat `deliveryPlannedFrom/To` + where-clause |
| #17 | Адрес доставки | **Kichik** — `shipmentAddress` ustuni MAVJUD (schema.prisma:4862). `contains` filtri |
| #18 | Комментарий к адресу доставки | **Kichik** — ustun bor-yo'qligi tekshirilsin |
| #16 | Владелец контрагента | **O'rta** — `agent.ownerId` bo'yicha join-filtr |
| #19 | Кто изменил | **O'rta** — CO'da `updatedById` yo'q, avval model kengaytirilishi kerak |
| #15 | Тип возврата | **Katta** — qaytarilgan miqdor agregatsiyasi |
| #20 | Ближайшая задача | **Katta** — Task join + «eng yaqin» tanlash |
| #21 | Срок задачи | **Katta** — yuqoridagi bilan birga |

**Tavsiya:** #14 · #17 · #18 ni bitta BE sessiyasida (kichik uchlik), #16 · #19 ni
keyingisida, #15 · #20 · #21 ni alohida feature sifatida.

### Keyingi tartib
1. **#14 · #17 · #18** — arzon BE filtrlar uchligi
2. **#31 #32 #33** — sarlavha: raqam matn bo'lishi · bitta sana-vaqt maydoni · status pill
3. **#36 #37 #38** — balans yo'nalishi «(нам должны)» · «Склад» yulduzchasi · «Договор» disabled
4. **#42 #43 #46 #48** — pozitsiya: tovar kodi · «без НДС» · «Импорт» · «Цена включает НДС» default
5. **#56** — `docs/moysklad-reference/` yo'qligi label-grounding himoyasini o'chirib qo'ygan
6. **#55** — DocumentEditor prop-drop bug-class'iga guard test

---

**Eskirgan da'volar (bu audit RAD ETDI):** kod izohlarida «live-grounded» deb yozilgan
3 ta da'vo bugungi capture bilan ziddiyatda chiqdi — filtr «~10 maydon», pozitsiya
«available/shipped OFF», va detail «5 tab». Uchalasi ham tuzatildi va izohlar
bugungi dalil bilan almashtirildi.

---

## ⚠️ Avval RAD ETILGAN gumonlar (ko'r-ko'rona tuzatilmasin)

Bular dastlab «delta» deb gumon qilingan, jonli capture ularni **rad etdi** — bizniki to'g'ri:

| Gumon | Jonli haqiqat |
|---|---|
| `/new` birinchi tab «Главная» noto'g'ri | moysklad'da ham «Главная \| Связанные документы» — ✅ bizniki to'g'ri |
| Detail'da «Комментарий» ikki marta | moysklad'da ham ikkita (yuqori-o'ng input + past textarea) — ✅ to'g'ri |
| Totals «Сумма НДС»/«Общая стоимость» bo'lishi kerak | jonli: «Промежуточный итог / НДС: / Итого:» — ✅ bizniki to'g'ri |
| Totals'da «Прибыль/Вес/Объем» yetishmaydi | CO detail'da yo'q (arxiv DOM boshqa hujjat turlaridan edi) — ✅ to'g'ri |

---

## A. LIST sahifa — `/customer-orders`

Dalil: `ms/10-list-default.png` vs `ours/list.png`

### A1. Grid kolonkalari

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 1 | «Зарезервировано» kolonkasi default ko'rinmaydi | Default KO'RINADI (5 qatorda qiymat bilan) | ⚙ ostiga yashirilgan | O'rta |
| 2 | «Не оплачено» ortiqcha kolonka | YO'Q | Default ko'rinadi | O'rta |
| 3 | Header oxiridagi ⚙ (kolonka-tanlash) tugmasi | Grid header o'ng chetida ⚙▾ | Yo'q | O'rta |
| 4 | Doimiy «Итого» footer qatori | Har doim ko'rinadi (802 000,00 · 0,00 · 30 000,00 …) | «Показать итоги» havolasi ortida | Yuqori |
| 5 | Gorizontal sig'dirish | Barcha kolonka 1680px'ga sig'adi | Kolonkalar kesiladi (Отгружено'dan keyin ko'rinmaydi) | Yuqori |
| 6 | «Напечатано» ustunida ko'k «Напечатан» pill | Bor | Tekshirilmagan/yo'q | Past |
| 7 | Оплачено/Отгружено summasi ostida yashil progress-chiziq | Bor (qator 00002) | Yo'q | Past |

### A2. Toolbar

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 8 | «Бизнес-процессы» tugmasi | `⚙ Бизнес-процессы` (Печать'dan keyin) | Yo'q | O'rta |
| 9 | Toolbar oxiridagi ⚙ tugmasi | Bor | Yo'q | Past |
| 10 | «Столбцы» joylashuvi | Печать'dan KEYIN | Фильтр'dan keyin, qidiruvdan OLDIN | Past |
| 11 | «Список» tugmasi | Yo'q (faqat «Столбцы») | Bor («Список \| Столбцы» toggle) | Past — qaror kerak |
| 12 | «Печать» printer ikonkasi | 🖨 ikonka bor | Ikonkasiz | Past |

### A3. Filtr paneli

**Jonli moysklad 29 maydonni HAMMASINI ochiq ko'rsatadi.** Bizda `page.tsx:477` dagi izoh
«jonli CO ro'yxati ~10 maydon ko'rsatadi» deydi — bu **jonli capture bilan rad etildi**.

| # | Delta | Og'irlik |
|---|---|---|
| 13 | 14 maydon default yashirilgan (`filterHidden` massivi) — moysklad hammasini ochiq ko'rsatadi | Yuqori |
| 14 | «План. дата отгрузки» maydoni umuman yo'q | Yuqori |
| 15 | «Тип возврата» (Частично возвращено / Без возвратов / Полностью возвращено) yo'q | O'rta |
| 16 | «Владелец контрагента» yo'q | O'rta |
| 17 | «Адрес доставки» yo'q | O'rta |
| 18 | «Комментарий к адресу доставки» yo'q | Past |
| 19 | «Кто изменил» yo'q | O'rta |
| 20 | «Ближайшая задача» yo'q | Past |
| 21 | «Срок задачи» yo'q | Past |
| 22 | «Счёт организации» / «Счёт контрагента» — **ё** ishlatilgan; moysklad: «Сч**е**т» | O'rta (label-grounding) |
| 23 | «Оплата» variantlar tartibi teskari (bizda Не оплачено→Оплачено; moysklad Оплачено→Не оплачено) | Past |
| 24 | Ortiqcha maydonlar: «Резерв», «Сумма (from/to)» — moysklad'da yo'q | Past — qaror kerak |

---

## B. DETAIL sahifa — `/customer-orders/[id]`

Dalil: `ms/40-detail-00002.png` vs `ours/detail.png`

### B1. Tab strukturasi — eng katta delta

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 25 | Tab to'plami | **«Главная \| Связанные документы»** — atigi 2 ta | «Позиции \| Связанные документы \| Файлы \| Задачи \| События» — 5 ta | **Yuqori** |
| 26 | «Задачи» / «Файлы» — tab emas, pastdagi yig'iladigan bo'limlar (`▾ Задачи [+ Задача]`, `▾ Файлы [+ Файл]`) | Bo'lim | Tab | **Yuqori** |
| 27 | «События» tab | YO'Q | Bor | O'rta |
| 28 | Bizning `/new` allaqachon «Главная \| Связанные документы» ishlatadi — detail bilan MOS EMAS (ichki nomuvofiqlik) | — | — | **Yuqori** |

### B2. Sarlavha qatori

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 29 | «Резерв» checkbox | `? ☑ Резерв` — «Проведено» yonida | Umuman yo'q | **Yuqori** |
| 30 | Ikkinchi «?» help ikonkasi (Резерв uchun) | Bor | Yo'q | Past |
| 31 | Hujjat raqami saqlangach | Oddiy matn `00002` | Hamon input maydoni | O'rta |
| 32 | Sana/vaqt | Bitta maydon `10.09.2025 15:16` | Ikkita alohida maydon (`31.07.2026` + `14:00`) | O'rta |
| 33 | Status pill nomi/rangi | Custom-status: «Новый» (to'q sariq) / «Отгружен» (binafsha) / «Отменен» (qizil) | «Черновик» (kulrang) | O'rta |
| 34 | Ortiqcha «1 из 1» + oldingi/keyingi navigatsiya | Yo'q | Bor | Past |

### B3. Maydonlar bloki

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 35 | Организация ostidagi ikkinchi combobox | «Перечисление» (tashkilot hisob-raqami / to'lov turi) — qiymat bilan | **Bo'sh, labelsiz** combobox | **Yuqori** |
| 36 | Kontragent balansi | «Баланс (нам должны): 5 070 850,00 сум» — **qizil**, yo'nalish ko'rsatkichi bilan | «Баланс: 0,00 сум» — yo'nalishsiz, rangsiz | O'rta |
| 37 | «Склад» majburiyligi | Majburiy EMAS (yulduzchasiz) | Detail'da `*Склад`, /new'da yulduzchasiz — ichki nomuvofiqlik | O'rta |
| 38 | «Договор» maydoni holati | Kontragent tanlanmaguncha kulrang/disabled | Har doim faol | Past |

### B4. Pozitsiyalar jadvali

moysklad: `№ · Наименование · Кол-во · Отгруж. · Доступно · Цена · НДС · Скидка · Сумма`
Bizda:    `№ · Наименование · Кол-во · Зарезерв. · Остаток · Цена · НДС · Сумма НДС · Скидка · Сумма`

| # | Delta | Og'irlik |
|---|---|---|
| 39 | «Отгруж.» kolonkasi yo'q (nechta jo'natilgani) | **Yuqori** |
| 40 | «Доступно» kolonkasi yo'q (moysklad'da «Остаток» o'rniga shu) | **Yuqori** |
| 41 | «Сумма НДС» ortiqcha kolonka — moysklad'da yo'q | O'rta |
| 42 | Tovar nomidan oldin KOD ko'rsatilmaydi (moysklad: `01698 Aelifv Germetichni karobka 15x10`) | O'rta |
| 43 | НДС yo'q bo'lganda «без НДС» matni (bizda har doim foiz) | O'rta |
| 44 | «Сумма» header'ida ⚙ (pozitsiya-kolonka tanlash) | O'rta |
| 45 | Qator fon rangi — bizda pushti/qizil (zaxira yetishmasligi?), moysklad'da oq | Past |

### B5. Pozitsiya qo'shish qatori va totals

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 46 | «Импорт ▾» dropdown | Bor (o'ng chekka) | Yo'q | O'rta |
| 47 | «Договорная цена» tugmasi | Yo'q | Bor (jadval ustida) | Past — qaror kerak |
| 48 | «Цена включает НДС» default holati | ☑ belgilangan | ☐ belgilanmagan | O'rta |

---

## C. NEW sahifa — `/customer-orders/new`

Dalil: `ms/20-new-default.png` vs `ours/new.png`

| # | Delta | moysklad | Bizda | Og'irlik |
|---|---|---|---|---|
| 49 | «Резерв» checkbox | Bor (belgilanmagan) | Yo'q | **Yuqori** |
| 50 | «Импорт ▾» tugmasi | Bor | Yo'q | O'rta |
| 51 | Организация ostidagi hisob-combobox | «Перечисление» to'ldirilgan | Bo'sh | Yuqori |
| 52 | Pozitsiya kolonkalari — B4 dagi bilan bir xil (Отгруж./Доступно yo'q) | — | — | Yuqori |

---

## C1. Ikkinchi to'lqinda RAD ETILGAN bandlar (allaqachon to'g'ri ekan)

Kodni o'qib + runtime tekshirib, quyidagilar **noto'g'ri pozitiv** chiqdi. Sabab bir xil:
test-ma'lumotim o'sha holatni yuzaga keltirmagan edi.

| # | Nega «delta» ko'ringan | Haqiqat |
|---|---|---|
| 36 | Capture'da «Баланс: 0,00 сум» — yo'nalishsiz, rangsiz | To'liq implement qilingan: `owed_to_us`/`we_owe` qo'shimchasi + `--ms-action-destructive` qizil rang (`agent-balance`). Test-kontragent balansi **0** bo'lgani uchun qo'shimcha bo'sh chiqqan — to'g'ri xulq |
| 43 | Capture'da «12%» ko'rindi | `fmtVat` bo'sh qiymat uchun «без НДС» qaytaradi. Test-pozitsiyada НДС=12 bo'lgan. НДС-siz buyurtma yaratib tekshirildi → «без НДС» chiqdi ✅ |

## C1b. DEFER qilinganlar (sabab bilan)

| # | Band | Nega defer |
|---|---|---|
| 48 | «Цена включает НДС» default ☑ | **Pul semantikasi.** `vatIncluded` 8+ hujjat modelida DB darajasida `false`; hisob-sozlamasi yo'q. Faqat CO uchun teskari qilish terilgan narx ma'nosini o'zgartiradi va boshqa hujjat turlaridan ajratadi. Owner qarori kerak: akkaunt-darajasidagi sozlama qilinsinmi? |
| 37 (yarmi) | «Склад» moysklad'da majburiy EMAS | Bizda BE talab qiladi (`CreateCustomerOrderSchema.storeId: uuid`) va pozitsiyalar omborga zaxiralanadi. Ixtiyoriy qilish BE + zaxira mantiqi o'zgarishi. **Ichki nomuvofiqlik yarmi tuzatildi** — `/new` endi detail kabi yulduzcha ko'rsatadi (oldin saqlamaguncha bilinmasdi) |
| 18, 19 | Комментарий к адресу доставки · Кто изменил | Ustun yo'q → migratsiya. Ikkalasi BITTA migratsiyada qilinadi |

## C2. Ish davomida topilgan yangi bandlar

| # | Delta | Holat |
|---|---|---|
| 54 | Pozitsiya kolonkasi sarlavhasi: moysklad **«Отгруж.»** (qisqartma), bizda «Отгружено» (to'liq). moysklad list-gridida esa to'liq shakl ishlatiladi — ya'ni ikki kontekstda ikki xil | **DEFER** — `position_cols.shipped` kaliti **invoices-out** bilan bo'lishiladi, unga grounding yo'q. CLAUDE.md §4: capture'da yo'q → ko'r-ko'rona yozma. Invoices-out capture qilingach hal qilinsin |
| 55 | `DocumentEditor` prop'larni aniq destructure qiladi; `DocumentEditorProps` `DocumentHeaderProps`dan meros olgani uchun **yangi header-prop typecheck'dan jim o'tadi, lekin render'ga yetmaydi** | ✅ `reserve*` uchun tuzatildi (`3c6535e`). **Bug-class saqlanib qolgan** — kelasi har qanday yangi prop uchun takrorlanadi. Guard test kerak |
| 56 | `label-grounding.test.ts` — 25 test `ENOENT` bilan yiqiladi, `docs/moysklad-reference/` bu checkout'da hech qachon bo'lmagan (git tarixi yo'q) | **OCHIQ** — ya'ni label-grounding himoyasi hozir **ishlamayapti** |

## D. Sahifadan qat'i nazar

| # | Delta | Og'irlik |
|---|---|---|
| 53 | Har sahifada `401 GET /api/v1/permissions/me` — console-error | O'rta (alohida tekshirish kerak) |

---

## Bajarish tartibi (taklif)

1. **Yuqori (12 ta):** #25–28 tab strukturasi · #29 Резерв · #35 org-account · #39/40 Отгруж./Доступно · #4 totals footer · #5 gorizontal sig'dirish · #13 filtr default · #14 План. дата отгрузки
2. **O'rta (24 ta)**
3. **Past (13 ta)**
4. **Qaror kerak (#11, #24, #47):** moysklad'da yo'q, lekin bizda ataylab qo'shilgan — o'chirilsinmi yoki qoldirilsinmi?
