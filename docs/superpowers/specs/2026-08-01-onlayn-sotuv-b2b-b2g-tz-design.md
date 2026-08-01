# TZ — 2-bo'lim: ONLAYN SOTUV / B2B / B2G

**Sana:** 2026-08-01 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> 7 bo'limli tizim TZ'sining **2-qismi**. 1-qism: [Kassa](2026-08-01-kassa-tz-design.md).
> Keyingilari: 3) Analitika, 4) Menejer, 5) Ta'minotchilar, 6) HR, 7) Ombor.

---

## 0. Kontekst — nima allaqachon qurilgan

| Qism | Joyi | Holat |
|---|---|---|
| CRM voronka | `pipeline`, `opportunity` modullari | CRUD bor |
| Qo'ng'iroq / vazifa | `call`, `task`, `task-type` | CRUD bor |
| Sotuv kanallari | `sales-channel` | CRUD bor |
| Onlayn buyurtma | `online-order` | **V1 stub** — quyida |
| To'lov shlyuzi | `payment-gateway` — `click.protocol.ts`, `payme.protocol.ts` | protokollar yozilgan |
| EDO | `edo` — `didox` / `edocs` / `soliq_direct` + `ehf-builder.ts` | integratsiya yozilgan |
| MXIK | `mxik` | CRUD bor |
| Shartnoma | `contract` | CRUD bor |
| Ochiq havola | `publication` — 256-bit token, argon2 | B2B kabinet uchun poydevor |
| Mijoz egasi | `Counterparty.ownerId` (+ `groupId`, `priceTypeId`) | **maydon mavjud** |
| KPI / bonus | `hr/hr-kpi`, `hr/hr-bonus-fine` | modullar mavjud |
| Marketing sayti | `apps/marketing` (Next.js) | **do'kon emas** — about/blog/pricing |

### 0.1 Aniqlangan uzilishlar

1. **`online-order.convertToCustomerOrder` — soxta UUID yozadi.** V1 stub `customerOrderId` ga
   **generatsiya qilingan tasodifiy UUID** qo'yadi (`online-order.service.ts:164-169`) — ya'ni bazada
   **hech qayerga ishora qilmaydigan** havola qoladi. Bu shunchaki «bajarilmagan funksiya» emas,
   **ma'lumot yaxlitligi buzilishi** — TZ buni birinchi navbatda tuzatadi.
2. **Webhook qabul qilish yo'q** (imzo tekshiruvi + navbat kerak — V2 deb qoldirilgan).
3. **Tovar rezervlanmaydi** — onlayn buyurtma qoldiqni band qilmaydi.
4. **Mijoz kiradigan do'kon (storefront) umuman yo'q.**
5. **`ownerId` maydoni bor, lekin mantiq yo'q** — biriktirish, bildirishnoma, muddat, bonus bog'lanishi.

---

## 1. Maqsad va fazalar

**Maqsad:** onlayn/B2B/B2G savdoni ERP ichida to'liq boshqariladigan va nazorat qilinadigan qilish.

Egasining qarori: **marketplace oxirida**, hozir ustuvorlik — **sotuvchilar ishini yuritish va nazorat qilish tizimi**.

| Faza | Mazmun | Foydalanuvchi | Bu TZ'da |
|---|---|---|---|
| **F1** | ERP ichida «Onlayn sotuv» ish o'rni (B2B/B2G sotuvchi paneli) | ichki xodim | **to'liq** |
| **F2** | B2B dilerlar kabineti — mijoz o'zi kiradi | doimiy mijoz | arxitektura darajasida |
| **F3** | B2C onlayn do'kon — ochiq katalog, Click/Payme, yetkazish | har kim | arxitektura darajasida |
| **F4** | Marketplace platformasi — tashqi sotuvchilar savdo qiladi | tashqi sotuvchi | faqat eslatib o'tiladi |

**F2–F4 nega hozir arxitekturada hisobga olinadi:** F1 da yaratiladigan buyurtma modeli, narx hisoblash
va rezerv mantiqi keyin F2/F3 tomonidan **qayta ishlatilishi** kerak. Agar F1 faqat «ichki» deb yozilsa,
F2 kelganda hammasi qayta yoziladi.

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Qamrov | B2C do'kon + B2B kabinet + o'z marketplace'i — **lekin marketplace oxirida** |
| Q2 | Ustuvorlik | **F1** — B2B/B2G sotuvchilar uchun ERP ish o'rni |
| Q3 | B2G | **Hujjat oqimi**: EDO + elektron faktura + MXIK (portal integratsiyasi emas) |
| Q4 | Onlayn buyurtma bajarilishi | **Alohida onlayn-buyurtma bo'limi** (operator tasdig'i bilan) |
| Q5 | Operator kim | **Biriktirilgan sotuvchining o'zi** |
| Q6 | Yetkazish | **Ikkalasi** — yetkazib berish (o'z haydovchi) yoki o'zi olib ketish |
| Q7 | Sotuvchi ish oqimi | Mijoz bazasi + voronka · KP yasash · qo'ng'iroq/vazifa rejasi |
| Q8 | Hujjat rasmiylashtirish | **Aralash** — hisob va faktura sotuvchida (avtomatik), shartnoma buxgalter/yuristda |
| Q9 | Narx | **Guruh narx turi + shartnoma istisnolari** (shartnoma ustun) |
| Q10 | Nazorat | Oylik plan (KPI) · foydadan bonus · faoliyat jurnali |
| Q11 | Egalik va bonus | **§3 dagi 4 qoida** (Claude taklifi, egasi tasdiqlagan) |

---

## 3. Mijoz egaligi va bonus — 4 qoida

> Bu qism egasining topshirig'i bilan alohida ishlab chiqildi. Muammoning mohiyati: kassir ham,
> sotuvchi ham **narxni erkin tushira oladi** va **qarzga erkin sota oladi** (1-bo'lim, Q4/Q8).
> Agar bonus tushumdan hisoblansa, sotuvchi uchun eng foydali xatti-harakat — **arzon narxda,
> qarzga ko'p sotish** bo'ladi, ya'ni bonus sxemasi kompaniyaga qarshi ishlaydi. Quyidagi
> 4 qoida shu xavfni manfaat darajasida yopadi.

### Qoida 1 — Bonus bazasi = yalpi foyda, tushum emas
```
bonus = Σ (sotuv narxi − muzlatilgan tan narx) × bonus%
```
Sotuvchi chegirma bersa — **o'z bonusini kamaytiradi**. Nazorat taqiq bilan emas, manfaat bilan.
Texnik shart: 1-bo'limdagi muzlatilgan `costMinor` (`RetailSalePosition` va shu bilan birga
`CustomerOrderPosition` / `DemandPosition`).

### Qoida 2 — Bonus pul tushganda hisoblanadi (cash-basis)
Qarzga sotilgan tovardan bonus **darhol yozilmaydi**. Mijoz to'lagach, **to'langan ulush** bo'yicha
yoziladi:
```
tan_olingan_bonus = umumiy_bonus × (to'langan_summa ÷ hujjat_summasi)
```
Natija: sotuvchi o'z mijozining qarzini o'zi undiradi. Qarzga sotishdagi erkinlik xavfsiz bo'ladi.

### Qoida 3 — Yumshoq egalik (soft ownership)
- Har mijozda `Counterparty.ownerId` — biriktirilgan sotuvchi (maydon mavjud).
- **Sotish bloklanmaydi** — istalgan xodim sota oladi (ega ta'tilda bo'lsa mijoz kutmasligi kerak).
- **Bonus standart holatda egaga** — munosabat, qo'ng'iroq va qarz undirish ishi uniki.
- Boshqa sotuvchi ega mijoziga hujjat ochsa → **egaga va menejerga bildirishnoma**.
- Hujjatda **`bonusToId`** maydoni: menejer istisno holatda bonusni boshqasiga o'tkazadi yoki
  bo'ladi — **har o'zgarish audit jurnaliga** yoziladi.

### Qoida 4 — Egalik muddati: 90 kun
Sotuvchi mijozga 90 kun ichida hech narsa qilmasa (sotuv yo'q, qo'ng'iroq yo'q, vazifa yo'q) →
mijoz **«erkin havza»ga** qaytadi (`ownerId = null`), menejer qayta taqsimlaydi. Sabab: aks holda
sotuvchilar mijozlarni «yig'ib qo'yadi» va xizmat qilmaydi.
Amalga oshirish: `Counterparty.lastActivityAt` maydoni + kunlik cron (`@Cron` naqshi kodda bor).

**Bu 4 qoida bir tizim.** Bittasini olib tashlash qolganlarini zaiflashtiradi:
1-siz chegirma nazoratsiz, 2-siz qarz o'sadi, 3-siz nizo, 4-siz mijozlar «qotib qoladi».

---

## 4. F1 — Sotuvchi ish o'rni

### 4.1 Mijoz bazasi va voronka
- Kanban: **yangi → aloqada → taklif yuborildi → muzokara → shartnoma → doimiy** (bosqichlar
  sozlanadigan — `pipeline` moduli ustiga).
- Har kartada: mijoz, summa, ehtimol %, keyingi qadam sanasi, **egasi**.
- Sotuvchi **standart holatda faqat o'z mijozlarini** ko'radi; «Barcha mijozlar» ko'rinishi menejer ruxsati bilan.
- **Erkin havza** ro'yxati alohida — egasiz mijozlar, har kim o'ziga biriktira oladi (menejer nazorati bilan).

### 4.2 Kommersiya taklifi (KP)
- Tovar tanlash → narx (§4.6 bo'yicha avtomatik) → chegirma → **amal qilish muddati**.
- **PDF** yaratiladi (mavjud `print-template` / PDF infratuzilmasi ustiga).
- Yuborish: **Telegram** (mavjud `telegram` moduli) yoki email (`email` moduli).
- Holatlar: `qoralama → yuborildi → ko'rildi → qabul qilindi → rad etildi → muddati o'tdi`.
- **«Ko'rildi»** — `publication` moduli tokeni orqali (mijoz havolani ochganda qayd etiladi).
- Qabul qilingan KP → **bitta tugma bilan** `CustomerOrder` ga aylanadi (pozitsiyalar va narxlar ko'chadi).

### 4.3 Qo'ng'iroq va vazifalar rejasi
- Sotuvchining kunlik ro'yxati: bugungi qo'ng'iroqlar, eslatmalar, muddati kelgan takliflar.
- **Bajarilmagan vazifa** — ertasiga qizil bo'lib qoladi va **menejer panelida ko'rinadi** (4-bo'lim).
- Har qo'ng'iroq natijasi yoziladi (`call` moduli): javob berdi / bermadi / keyin / rad.

### 4.4 Onlayn buyurtmani qabul qilish (Q4 + Q5)
```
online_order: pending ──accept──► accepted ──convert──► CustomerOrder yaratiladi
                  │                                        (rezerv qilinadi)
                  └──reject──► rejected
```
- Buyurtma **biriktirilgan sotuvchiga** yo'naltiriladi (`Counterparty.ownerId`); egasi yo'q bo'lsa —
  umumiy navbatga, birinchi olgan sotuvchi egasi bo'ladi.
- Sotuvchi qo'ng'iroq qilib tasdiqlaydi → `CustomerOrder` yaratiladi → **tovar rezervlanadi** →
  yig'ish varaqalari omborlarga ketadi (1-bo'lim §10 dagi bir xil mexanizm).
- **Soxta UUID tuzatiladi:** `customerOrderId` faqat **haqiqiy** `CustomerOrder` yaratilgandan keyin
  yoziladi; yaratish muvaffaqiyatsiz bo'lsa holat `accepted` da qoladi (tranzaksiya ichida).
- **Webhook qabul qilish:** `POST /webhooks/online-orders/:channelId` — HMAC imzo tekshiruvi,
  `externalOrderId` bo'yicha **idempotentlik** (takroriy webhook ikkinchi buyurtma yaratmaydi),
  xatolikda navbatga qo'yish va qayta urinish.

### 4.5 Hujjatlar (Q8 — aralash model)

| Hujjat | Kim | Qanday |
|---|---|---|
| **Hisob (schyot)** | sotuvchi | shablondan avtomatik: mijoz rekvizitlari, tovarlar, narxlar, bank ma'lumotlari |
| **EDO faktura** | sotuvchi (avtomatik) | jo'natma (`Demand`) rasmiylashgach → `edo` moduli orqali ketadi (MXIK kodlari bilan) |
| **Shartnoma** | buxgalter / yurist | `contract` moduli; sotuvchi «shartnoma kerak» deb so'rov yuboradi |
| **Akt-sverka** | sotuvchi | mavjud `counterparty-statement` / akt-sverka Excel eksporti |

- **MXIK majburiyligi:** yuridik shaxs/davlat mijoziga faktura chiqarishdan oldin har tovarda MXIK
  kodi borligi tekshiriladi; yo'q bo'lsa — **aniq xato xabari** (qaysi tovarda yo'qligi ko'rsatiladi),
  jim o'tkazib yuborilmaydi.
- EDO jo'natish **muvaffaqiyatsiz bo'lsa** — hujjat `sent` deb belgilanmaydi, xato saqlanadi va
  qayta urinish tugmasi chiqadi (kodda `submit()` naqshi bor).

### 4.6 Narx hisoblash (Q9)
Ustuvorlik tartibi (yuqoridagi g'olib):
```
1. Shartnoma narxi (shu mijoz + shu tovar uchun aniq narx)
2. Mijoz kartasidagi narx turi (Counterparty.priceTypeId)
3. Mijoz guruhi narx turi (Counterparty.groupId → guruh narx turi)
4. Default narx turi («Розничная цена»)
```
- Hisoblangan narx **qayerdan kelgani UI'da ko'rsatiladi** («Shartnoma narxi» / «Optom») — sotuvchi
  nima uchun shu raqam chiqqanini bilishi kerak.
- Sotuvchi narxni qo'lda o'zgartira oladi (1-bo'lim falsafasi), lekin **foyda va bonusi darhol
  qayta hisoblanadi va ekranda ko'rinadi** — Qoida 1 shu yerda ishlaydi.

### 4.7 Yetkazish (Q6)
- Buyurtmada: **yetkazib berish** yoki **o'zi olib ketish**.
- Yetkazib berishda: manzil, sana/vaqt oynasi, yetkazish narxi.
- Haydovchiga biriktirish → `hr/driver-tracking` (haydovchi tizimi mavjud, 6-bo'limda batafsil).
- Haydovchi «yetkazdim» deb belgilaydi; naqd olgan bo'lsa — **kassaga topshirish** yozuvi hosil bo'ladi
  (1-bo'lim §8.3 inkassatsiya bilan bog'lanadi).
- Yetkazish holati mijozga ko'rinadi (F2 kabinetida yoki `publication` tokenli havola orqali).

### 4.8 Nazorat va KPI (Q10)
- **Oylik plan** har sotuvchiga: summa yoki foyda bo'yicha. Panelda: `plan / fakt / % / qolgan kun`,
  sur'at ko'rsatkichi («shu sur'atda oyni 78% bilan yopasiz»).
- **Bonus** — §3 dagi 4 qoida bo'yicha, `hr/hr-bonus-fine` va `hr/hr-kpi` modullariga ulanadi
  (6-bo'lim: oylik hisobiga tushadi).
- **Faoliyat jurnali** — har qo'ng'iroq, taklif, chegirma, shartnoma, narx o'zgarishi, egalik
  o'zgarishi: kim, qachon, nima. Menejer istalgan mijoz tarixini to'liq ko'radi (4-bo'lim).

---

## 5. F2 — B2B dilerlar kabineti (arxitektura darajasida)

Hozir qurilmaydi, lekin F1 shunga tayyor bo'lib qurilishi kerak:
- Mijoz login'i **kontragent** darajasida (xodim emas) — alohida autentifikatsiya konturi.
- Kabinet ko'radi: **o'z narxi** (§4.6 bilan bir xil hisob), qoldiq, **qarz balansi va muddati**,
  buyurtma tarixi, akt-sverka, hisob va fakturalar (PDF).
- Buyurtma berish → xuddi §4.4 dagi oqim (rezerv + yig'ish varaqalari).
- **Talab:** narx hisoblash va buyurtma yaratish mantiqi F1 da **umumiy servis** sifatida yozilsin
  (`lib/pricing`, `order-intake` servisi) — F2 uni chaqiradi, qayta yozmaydi.

## 6. F3 — B2C do'kon (arxitektura darajasida)
- Ochiq katalog + savat + Click/Payme (`payment-gateway` protokollari tayyor) + yetkazish.
- Buyurtma → §4.4 oqimi, lekin egasi yo'q → umumiy operator navbatiga.
- `apps/marketing` — marketing sayti, do'kon **alohida ilova** (`apps/shop`) bo'ladi yoki
  marketing sayti ichida `/shop` bo'limi — bu F3 TZ'sida hal qilinadi.

## 7. F4 — Marketplace platformasi
Eng katta faza: sotuvchi kabineti, komissiya, moderatsiya, o'zaro hisob-kitob, reyting.
**Bu TZ'da faqat qayd etiladi** — o'z vaqtida alohida TZ yoziladi.

---

## 8. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `Counterparty.lastActivityAt` | `Timestamptz?` — egalik muddati (Qoida 4) uchun |
| `CustomerOrder.bonusToId` | `uuid?` — bonus kimga (Qoida 3); default = mijoz egasi |
| `CustomerOrderPosition.costMinor` | `BigInt?` — muzlatilgan tan narx (Qoida 1) |
| `CustomerOrderPosition.basePriceMinor` | `BigInt?` — muzlatilgan asos narx |
| `CommercialOffer` (+ `Position`) | yangi: KP — holat, muddat, PDF, ko'rilgan vaqti |
| `ContractPrice` | yangi: shartnoma bo'yicha tovar narxi (§4.6/1-ustuvorlik) |
| `SalesPlan` | yangi: xodim × oy × plan turi (summa/foyda) × qiymat |
| `BonusAccrual` | yangi: hujjat, xodim, bonus bazasi, %, **to'langan ulush**, hisoblangan summa |
| `OnlineOrder.customerOrderId` | FK qilinadi (hozir bog'lanmagan uuid) + soxta UUID tozalash migratsiyasi |
| `SalesActivityLog` | yangi: qo'ng'iroq/taklif/chegirma/egalik hodisalari (4-bo'lim uchun xom ashyo) |

**Muhim migratsiya eslatmasi:** `OnlineOrder.customerOrderId` da hozir mavjud **soxta UUID'lar**
FK qo'yishdan oldin tozalanishi kerak (`NULL` ga o'tkazish + holatni `accepted` ga qaytarish).
Aks holda migratsiya FK xatosi bilan yiqiladi.

---

## 9. Testlash

### 9.1 Unit
- Narx ustuvorligi (§4.6) — 4 pog'onaning har biri va ular orasidagi ustunlik
- Bonus hisobi: foyda bazasi, qisman to'lov ulushi, `bonusToId` istisnosi
- Egalik muddati: 90 kun hisobi, faollik turlari (sotuv/qo'ng'iroq/vazifa)
- Webhook idempotentligi: bir xil `externalOrderId` ikkinchi buyurtma yaratmaydi
- MXIK yo'qligida faktura bloklanishi (aniq xato matni bilan)

### 9.2 E2E (Playwright)
Voronka: yangi mijoz → qo'ng'iroq → KP yuborish → «ko'rildi» → qabul → `CustomerOrder` →
rezerv → yig'ish varaqalari → jo'natma → EDO faktura → to'lov → **bonus hisoblanishi**.

### 9.3 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz. **Phase-2 QA** — real brauzer +
EDO test-konturi bilan tekshirilmaguncha «Phase-1» yorlig'i saqlanadi.

---

## 10. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `online-order` soxta UUID tuzatish + haqiqiy `CustomerOrder` yaratish + rezerv | Ma'lumot yaxlitligi buzilgan — birinchi shu |
| **B2** | Narx dvigateli (§4.6) umumiy servis sifatida + `ContractPrice` | F1/F2/F3 hammasi shunga tayanadi |
| **B3** | Mijoz egaligi: `ownerId` mantiqi, bildirishnoma, 90-kun cron | Bonus shusiz hisoblanmaydi |
| **B4** | Bonus dvigateli (4 qoida) + `BonusAccrual` + HR ulanishi | Nazorat yadrosi |
| **B5** | Voronka + qo'ng'iroq/vazifa rejasi (sotuvchi paneli) | Kundalik ish o'rni |
| **B6** | Kommersiya taklifi (KP) + PDF + Telegram + «ko'rildi» | Sotuv quroli |
| **B7** | Hujjatlar: hisob avtomatik + EDO faktura + MXIK tekshiruvi | B2G talabi |
| **B8** | Webhook qabul qilish (imzo + idempotentlik + navbat) | Tashqi kanallar |
| **B9** | Yetkazish: haydovchi biriktirish + holat + naqd topshirish | Yakuniy halqa |

Har bosqich — alohida sessiya, alohida commit, o'z gate'i bilan.

---

## 11. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| Muzlatilgan `costMinor` (bonus bazasi) | **1-bo'lim (Kassa)** — bir xil mexanizm |
| Yig'ish varaqalari, rezerv, `mark-ready` | **7-bo'lim (Ombor)** |
| Sotuvchi reytingi, plan/fakt, chegirma tahlili | **3-bo'lim (Analitika)** |
| Plan qo'yish, egalik taqsimlash, bonus istisnosi tasdig'i | **4-bo'lim (Menejer)** |
| Bonus → oylik, haydovchi yetkazish | **6-bo'lim (HR)** |
| Ta'minotchidan tovar kelishi (mavjudlik va'dasi) | **5-bo'lim (Ta'minotchilar)** |
