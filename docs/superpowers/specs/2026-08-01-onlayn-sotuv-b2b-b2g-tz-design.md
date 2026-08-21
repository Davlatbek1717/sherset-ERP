# TZ — 2-bo'lim: ONLAYN SOTUV / B2B / B2G

**Sana:** 2026-08-01 · **Qayta ko'rib chiqildi:** 2026-08-21 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> 🔴 **2026-08-21 egasi qarori — TZ sezilarli QISQARTIRILDI:**
> **(1) mijozga xodim biriktirilmaydi** («mijoz egasi» tushunchasi yo'q) va
> **(2) shaxsiy bonus umuman hisoblanmaydi**, **(3) marketplace qurilmaydi (F4)** va
> **(4) mijoz o'zi kiradigan hech qanday tashqi kontur qurilmaydi — F2 (B2B kabinet) va
> F3 (B2C do'kon) ham bekor.** ⇒ **Faqat F1 qoladi: ERP ichidagi sotuvchi ish o'rni.**
> Shuning uchun eski §3 dagi 4 qoida, B3 va B4 bosqichlari bekor qilindi. O'zgargan
> joylar quyida belgilangan. Nazorat endi **taqiq bilan ham, bonus bilan ham emas** —
> *ko'rinuvchanlik* bilan: foyda ekranda, faoliyat jurnali, menejer ko'rib chiqish navbati.

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
| Ochiq havola | `publication` — 256-bit token, argon2 | ~~B2B kabinet poydevori~~ → 2026-08-21: kabinet bekor; **mijozga hujjat/holat ko'rsatishning yagona yo'li** |
| ~~Mijoz egasi~~ | `Counterparty.ownerId` | 🔴 **olib tashlanadi (2026-08-21)** — §3. `groupId`/`priceTypeId` qoladi (narx uchun kerak) |
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
5. ~~**`ownerId` maydoni bor, lekin mantiq yo'q**~~ — 🔴 2026-08-21 da bu **uzilish emas, qaror**
   bo'ldi: mantiq yozilmaydi, maydonning o'zi olib tashlanadi (§3).

---

## 1. Maqsad va fazalar

**Maqsad:** onlayn/B2B/B2G savdoni ERP ichida to'liq boshqariladigan va nazorat qilinadigan qilish.

Egasining qarori: hozir ustuvorlik — **sotuvchilar ishini yuritish va nazorat qilish tizimi**.
*(2026-08-21: avvalgi «marketplace oxirida» qarori **butunlay bekor qilindi** — marketplace qurilmaydi.)*

| Faza | Mazmun | Foydalanuvchi | Bu TZ'da |
|---|---|---|---|
| **F1** | ERP ichida «Onlayn sotuv» ish o'rni (B2B/B2G sotuvchi paneli) | ichki xodim | **to'liq** |
| ~~**F2**~~ | ~~B2B dilerlar kabineti~~ | — | 🔴 **BEKOR (2026-08-21)** |
| ~~**F3**~~ | ~~B2C onlayn do'kon~~ | — | 🔴 **BEKOR (2026-08-21)** |
| ~~**F4**~~ | ~~Marketplace platformasi~~ | — | 🔴 **BEKOR (2026-08-21)** — qurilmaydi |

🔴 **2026-08-21: F2/F3/F4 ning hammasi bekor ⇒ ularning arxitektura talablari ham yo'q.**
Eski matn F1 ni «kelajakdagi tashqi konturlar chaqiradigan **umumiy servis**» qilib yozishni
talab qilardi (`lib/pricing`, `order-intake`). **Endi bu talab yo'q** — narx va buyurtma
mantiqi to'g'ridan-to'g'ri ERP hujjatlari ichida yozilaveradi. Bu B2 bosqichini sezilarli
soddalashtiradi. Xuddi shunday: kontragent darajasidagi **alohida login konturi**,
**ochiq katalog/savat**, **mijozga qaratilgan Click/Payme oqimi** — hech biri kerak emas.

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Qamrov | 🔴 **2026-08-21 da qayta belgilandi: FAQAT F1** — ERP ichidagi B2B/B2G sotuvchi ish o'rni. ~~B2C do'kon~~ · ~~B2B kabinet~~ · ~~marketplace~~ — hammasi bekor |
| Q2 | Ustuvorlik | **F1** — B2B/B2G sotuvchilar uchun ERP ish o'rni |
| Q3 | B2G | **Hujjat oqimi**: EDO + elektron faktura + MXIK (portal integratsiyasi emas) |
| Q4 | Onlayn buyurtma bajarilishi | **Alohida onlayn-buyurtma bo'limi** (operator tasdig'i bilan) |
| Q5 | Operator kim | **Biriktirilgan sotuvchining o'zi** |
| Q6 | Yetkazish | **Ikkalasi** — yetkazib berish (o'z haydovchi) yoki o'zi olib ketish |
| Q7 | Sotuvchi ish oqimi | Mijoz bazasi + voronka · KP yasash · qo'ng'iroq/vazifa rejasi |
| Q8 | Hujjat rasmiylashtirish | **Aralash** — hisob va faktura sotuvchida (avtomatik), shartnoma buxgalter/yuristda |
| Q9 | Narx | **Guruh narx turi + shartnoma istisnolari** (shartnoma ustun) |
| Q10 | Nazorat | Oylik plan (KPI) · faoliyat jurnali · ~~foydadan bonus~~ **(2026-08-21: bonus bekor)** |
| Q11 | ~~Egalik va bonus~~ | 🔴 **BEKOR (2026-08-21)** — mijozga ega biriktirilmaydi, shaxsiy bonus yo'q. Batafsil §3 |

---

## 3. ~~Mijoz egaligi va bonus — 4 qoida~~ → BEKOR QILINDI (2026-08-21)

> **Egasining qarori:** «mijozlarga kassir odam biriktirish kerak emas» va bonus
> **umuman hisoblanmasin**. Shu bilan eski §3 ning to'rt qoidasi ham tushadi — ular
> bir tizim edi (2-si 1-siz, 3-si 4-siz ma'nosiz), shuning uchun qismini saqlash
> mumkin emas.

**Nima olib tashlandi:**

| Eski qoida | Holati |
|---|---|
| Q1 — bonus bazasi = yalpi foyda | ❌ bonus yo'q |
| Q2 — bonus pul tushganda (cash-basis) | ❌ bonus yo'q |
| Q3 — yumshoq egalik (`ownerId`, `bonusToId`) | ❌ mijozga ega biriktirilmaydi |
| Q4 — egalik muddati 90 kun (`lastActivityAt` + cron) | ❌ egalik bo'lmagach ma'nosiz |

**Muammo qolди, yechim o'zgardi.** Eski qoidalar bitta xavfni yopardi: sotuvchi
narxni erkin tushira oladi va qarzga erkin sota oladi (1-bo'lim Q4/Q8), bonus esa
tushumdan hisoblansa unga **arzon va qarzga ko'p sotish** foydali bo'lardi. Bonus
umuman bo'lmagach **bu rag'bat ham yo'qoladi** — ya'ni xavfning manbai o'z-o'zidan
yopiladi. Qolgan xavf — beparvolik yoki suiiste'mol, va u **ko'rinuvchanlik** bilan
boshqariladi:

1. **Foyda savatda darhol ko'rinadi** — sotuvchi narxni tushirganda qancha foyda
   qolayotganini ekranda ko'radi (§4.6). Buning uchun muzlatilgan tan narx kerak,
   shuning uchun `CustomerOrderPosition.costMinor` **saqlanib qoladi** (§8).
2. **Faoliyat jurnali** (`SalesActivityLog`) — har chegirma, narx o'zgarishi, qarzga
   sotuv: kim, qachon, qancha. Menejer ko'radi (4-bo'lim).
3. **Oylik plan (KPI)** — plan/fakt/% (§4.8). Rag'bat pul bilan emas, **ko'rsatkich
   bilan**; oylik va mukofot masalasi 6-bo'lim (HR) ixtiyorida qoladi.
4. **Menejer ko'rib chiqish navbati** — `ApprovalRule{mode: review}`, bloklamaydi.

**Texnik oqibatlari** (§8 va §10 da aks etgan):
- `Counterparty.ownerId` — **butunlay olib tashlanadi** (egasi qarori). Prodda
  o'lchandi: 1797 kontragentdan 12 tasida to'ldirilgan, `record_scope_enforced = false`,
  ya'ni amalda ishlatilmayapti. ⚠️ Bu maydon `permissions.service.ts` dagi **umumiy**
  record-scope filtriga (`{ownerId, groupId, shared}`) va MoySklad «Владелец»
  parity'siga ham tegishli — olib tashlashda o'sha qatlam ham tuzatiladi
  (typecheck buni tutadi). MoySklad'dagi egalar `attributes.msOwner` da saqlanib qoladi.
- `bonusToId`, `lastActivityAt`, `BonusAccrual` — **yaratilmaydi**.
- «Yo'qolgan mijoz» hisoboti (`manager/customers/lost-customers`) **qoladi** — u
  faktdan hisoblaydi va egalikka bog'liq emas.

---

## 4. F1 — Sotuvchi ish o'rni

### 4.0 B2B/B2G ish oqimi — qaysi MAVJUD bo'lim, unda nima qilinadi (2026-08-21)

> **Egasi aniqlashtirdi:** B2B va B2G alohida kontur emas — **saytdagi shu bo'limlardan**
> foydalaniladi. Quyida haqiqiy ish ketma-ketligi, har qadamda ishlatiladigan **mavjud
> sahifa** va o'sha bo'limda **qilinishi kerak bo'lgan ish**.
>
> O'lchangan (prod, 2026-08-21): **1797 kontragentdan 1784 tasi yuridik shaxs**
> (`legalUZ` 1432 + `legal` 352) ⇒ B2B qo'shimcha kanal emas, **asosiy biznes**.

| # | Qadam | Mavjud bo'lim | Bor | Qilinishi kerak |
|---|---|---|---|---|
| 1 | Mijoz kartasi (rekvizitlar) | `/counterparties` | `legalTitle`, `legalAddress(Full)`, `companyType`, STIR (regional JSON), `bankAccounts` | Yuridik shaxsda **STIR majburiy** qilish (hozir tekshirilmaydi) |
| 2 | Shartnoma | `/contracts` | CRUD bor | **`ContractPrice`** — shartnoma bo'yicha tovar narxi (§4.6 ning 1-pog'onasi). **Yo'q** |
| 3 | Narx | `/price-types` · `/price-lists` | narx turlari, `Counterparty.priceTypeId`, `groupId` | **Narx dvigateli**: shartnoma → mijoz → guruh → default; va **«narx qayerdan keldi»** ko'rsatkichi. **Yo'q** (B2) |
| 4 | Voronka / imkoniyat | `/pipelines` · `/opportunities` | CRUD + sahifalar | Sotuvchi ish o'rni ko'rinishi (§4.1) — *tekshirilmadi* |
| 5 | Qo'ng'iroq / vazifa | `/calls` · `/tasks` | CRUD + sahifalar | Muddati o'tgan vazifa qizil + menejerda ko'rinishi — *tekshirilmadi* |
| 6 | **Kommersiya taklifi (KP)** | — | ❌ **umuman yo'q** | To'liq qurish: model, PDF, Telegram yuborish, «ko'rildi» (`publication`), qabul → buyurtmaga aylantirish (B6) |
| 7 | Buyurtma | `/customer-orders` | CRUD · **rezerv ISHLAYDI** (`bulk-reserve` → `Stock.reservedQty`) · `deliveryPlannedMoment`, `shipmentAddress` | `costMinor`/`basePriceMinor` **muzlatish** ⇒ savatda **foyda** ko'rinsin (B4′) |
| 8 | Hisob (schyot) | `/invoices-out` | CRUD, `customerOrderId` bog'lanishi bor | Buyurtmadan **avtomatik to'ldirish** + bank rekvizitlari shabloni — *tekshirilmadi* |
| 9 | Jo'natma | `/demands` | CRUD, qoldiqdan yechadi | — |
| 10 | **EDO faktura** | `/factures-out` | `generate/from-demands` bor · didox/edocs/soliq_direct · `ehf-builder` | 🔴 **MXIK bloklovchi tekshiruvi yo'q** — `edo.service.ts:403` `mxikCode ?? ''` bilan **jimgina bo'sh** yuboradi (B7) |
| 11 | **MXIK katalogi** | `/settings/mxik` | CRUD bor | 🔴 **Prodda 4726 tovardan 0 tasida MXIK kodi bor** ⇒ B2G faktura amalda chiqmaydi. **Tovarlarga MXIK biriktirish — B2G ning 1-shartи** |
| 12 | To'lov | `/payments-in` · `/cash-in` | CRUD | — |
| 13 | Qarz · akt-sverka | `/debts` · `counterparty-statement` | modul + sahifa bor | — |
| 14 | Yetkazish | buyurtma maydonlari + HR haydovchi | manzil/sana bor, `hr/driver-tracking` bor | Haydovchiga biriktirish → «yetkazdim» → naqdni kassaga topshirish halqasi (B9) |
| 15 | Nazorat | `/menejer` · `/analitika` · `/reports` | `SalesPlan` (MK37) qurilgan | `SalesActivityLog` — chegirma/narx o'zgarishi jurnali (B4′) |

**Ishlatilmaydigan bo'lim:** `/ecommerce` (kanallar + onlayn buyurtmalar) va webhook —
tashqi kanal bo'lmagach **keraksiz**. Kodi joyida qoladi, lekin menyudan **yashiriladi**
(o'chirilmaydi — kelajakda tashqi kanal paydo bo'lsa tayyor turadi).

**Shu xaritadan kelib chiqadigan ustuvorlik** (§10 dagi bosqichlardan farqli, amaliy tartib):
1. **MXIK** (11) — B2G umuman ishlamayapti, bu eng qattiq to'siq
2. **MXIK tekshiruvi** (10) — kodsiz tovar fakturaga jimgina tushmasin
3. **Narx dvigateli + `ContractPrice`** (2–3) — B2B narxining yuragi
4. **Foyda ko'rsatkichi** (7) — nazoratning yangi asosi (§3)
5. **KP** (6) — B2B sotuvining asosiy quroli

---


### 4.1 Mijoz bazasi va voronka
- Kanban: **yangi → aloqada → taklif yuborildi → muzokara → shartnoma → doimiy** (bosqichlar
  sozlanadigan — `pipeline` moduli ustiga).
- Har kartada: mijoz, summa, ehtimol %, keyingi qadam sanasi. *(«egasi» — 2026-08-21 da olib tashlandi)*
- **Hamma sotuvchi hamma mijozni ko'radi** — mijoz taqsimoti yo'q (2026-08-21 qarori).
  Kim bo'sh bo'lsa o'sha xizmat qiladi; kim ish qilgani **faoliyat jurnalidan** ko'rinadi.
- ~~Erkin havza~~ — egalik bo'lmagach bunday ro'yxat kerak emas.

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
- Buyurtma **umumiy navbatga** tushadi (2026-08-21: `Counterparty.ownerId` bo'yicha yo'naltirish
  bekor qilindi). Sotuvchi navbatdan o'ziga oladi — «kim oldi» faqat **shu buyurtmaga**
  biriktiriladi (`OnlineOrder.assignedToId`), mijozga EMAS.
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
- Sotuvchi narxni qo'lda o'zgartira oladi (1-bo'lim falsafasi), lekin **foyda darhol qayta
  hisoblanib ekranda ko'rinadi** — nazoratning asosiy vositasi shu (§3). Bonus hisoblanmaydi.

### 4.7 Yetkazish (Q6)
- Buyurtmada: **yetkazib berish** yoki **o'zi olib ketish**.
- Yetkazib berishda: manzil, sana/vaqt oynasi, yetkazish narxi.
- Haydovchiga biriktirish → `hr/driver-tracking` (haydovchi tizimi mavjud, 6-bo'limda batafsil).
- Haydovchi «yetkazdim» deb belgilaydi; naqd olgan bo'lsa — **kassaga topshirish** yozuvi hosil bo'ladi
  (1-bo'lim §8.3 inkassatsiya bilan bog'lanadi).
- Yetkazish holati mijozga **`publication` tokenli havola** orqali ko'rsatiladi *(2026-08-21: F2 kabinet bekor bo'lgani uchun yagona yo'l shu)*.

### 4.8 Nazorat va KPI (Q10)
- **Oylik plan** har sotuvchiga: summa yoki foyda bo'yicha. Panelda: `plan / fakt / % / qolgan kun`,
  sur'at ko'rsatkichi («shu sur'atda oyni 78% bilan yopasiz»).
- ~~**Bonus**~~ — 🔴 **bekor (2026-08-21)**: shaxsiy bonus hisoblanmaydi. `hr/hr-bonus-fine` va
  `hr/hr-kpi` modullari o'z holicha qoladi (6-bo'lim), bu bo'lim ularga bonus yozmaydi.
- **Faoliyat jurnali** — har qo'ng'iroq, taklif, chegirma, shartnoma, narx o'zgarishi:
  kim, qachon, nima. Menejer istalgan mijoz tarixini to'liq ko'radi (4-bo'lim).
  *(«egalik o'zgarishi» hodisasi — egalik bo'lmagach yozilmaydi.)*

---

## 5–6. ~~F2 (B2B kabinet)~~ va ~~F3 (B2C do'kon)~~ → BEKOR QILINDI (2026-08-21)

**Egasi qarori:** mijoz o'zi kiradigan hech qanday kontur qurilmaydi — na doimiy
mijozlar uchun kabinet, na ochiq onlayn do'kon. Butun ish **ERP ichida sotuvchi
tomonidan** yuritiladi.

**Nima soddalashadi:**
- **Kontragent-login konturi kerak emas** — autentifikatsiya faqat xodimlar uchun
  qoladi (hozirgi holat o'zgarmaydi).
- **`apps/shop` yaratilmaydi** — `apps/` da `api` · `marketing` · `web` qoladi.
  `apps/marketing` marketing sayti bo'lib qolaveradi (do'kon emas).
- **Narx va buyurtma mantiqi «umumiy servis» bo'lishi shart emas** — B2 bosqichi
  faqat ERP hujjatlari ehtiyoji bo'yicha yoziladi.
- Mijozga hujjat/holat ko'rsatish kerak bo'lsa — mavjud **`publication` tokenli
  havola** yetarli (kabinet o'rniga; masalan akt-sverka yoki hisobni yuborish).

**Nima QOLADI (chalkashmasin):**
- `payment-gateway` (Click/Payme) — moduli o'z holicha qoladi, lekin bu bo'limda
  **mijozga qaratilgan onlayn to'lov oqimi qurilmaydi**.
- **Tashqi kanaldan buyurtma qabul qilish** (`sales-channel` + webhook, §4.4/B8) —
  bu «o'z do'konimiz» EMAS, balki **boshqa joyda** (masalan tashqi marketplace yoki
  boshqa yasalgan sayt) berilgan buyurtmani ERP'ga olib kirish. Allaqachon qurilgan.
  ⚠️ Agar bunday tashqi kanal umuman bo'lmasa — `online-order` yo'nalishi ham
  keraksiz bo'ladi; buni egasi tasdiqlashi kerak.

---

## 7. ~~F4 — Marketplace platformasi~~ → BEKOR QILINDI (2026-08-21)

**Egasi qarori:** marketplace qurilmaydi. Tashqi sotuvchilar, komissiya, moderatsiya,
o'zaro hisob-kitob, reyting — bu TZ'dan **butunlay chiqarildi**.

**Amaliy foydasi (nima soddalashadi):** marketplace yagona narsa ediki, u tizimdan
**ko'p-sotuvchili** bo'lishni talab qilardi — har tovar/buyurtma/pul harakati «qaysi
sotuvchiniki» degan o'lchov bilan yurishi kerak bo'lardi. F4 bekor bo'lgach:
- tovar va qoldiq **bitta korxonaniki** bo'lib qoladi (hozirgi model o'zgarmaydi);
- pul oqimida komissiya/split-payment qatlami **kerak emas**;
- `payment-gateway` (Click/Payme) faqat **o'z savdosi** uchun ishlatiladi.

⚠️ Bu **ko'p filiallilik** (8-bo'lim) bilan ARALASHTIRILMASIN — u bir korxonaning
bir necha filiali haqida va o'z kuchida qoladi.

---

## 8. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| ~~`Counterparty.lastActivityAt`~~ | 🔴 **yaratilmaydi** (2026-08-21) — egalik muddati bekor |
| ~~`CustomerOrder.bonusToId`~~ | 🔴 **yaratilmaydi** (2026-08-21) — bonus yo'q |
| **`Counterparty.ownerId` — O'CHIRILADI** | mavjud maydon olib tashlanadi (2026-08-21). Prodda 1797 dan 12 tasi to'la, `record_scope_enforced=false`. `permissions.service.ts` record-scope filtri va MoySklad «Владелец» parity'si shu bilan birga tuzatiladi |
| `CustomerOrderPosition.costMinor` | `BigInt?` — muzlatilgan tan narx. **Qoladi** — endi bonus uchun emas, savatda **foyda ko'rsatish** uchun (§3/1) |
| `CustomerOrderPosition.basePriceMinor` | `BigInt?` — muzlatilgan asos narx (chegirma o'lchash uchun) |
| `CommercialOffer` (+ `Position`) | yangi: KP — holat, muddat, PDF, ko'rilgan vaqti |
| `ContractPrice` | yangi: shartnoma bo'yicha tovar narxi (§4.6/1-ustuvorlik) |
| `SalesPlan` | xodim × oy × plan turi (summa/foyda) × qiymat — **mavjud** (4-bo'lim MK37 da qurilgan) |
| ~~`BonusAccrual`~~ | 🔴 **yaratilmaydi** (2026-08-21) — bonus yo'q |
| `OnlineOrder.customerOrderId` | FK qilinadi (hozir bog'lanmagan uuid) + soxta UUID tozalash migratsiyasi |
| `SalesActivityLog` | yangi: qo'ng'iroq / taklif / chegirma / narx o'zgarishi hodisalari (4-bo'lim uchun xom ashyo). **Endi nazoratning asosiy vositasi** — bonus o'rnini shu va foyda ko'rsatkichi bosadi |
| `OnlineOrder.assignedToId` | yangi `uuid?` — buyurtmani navbatdan kim olgani. **Mijozga emas, buyurtmaga** biriktiriladi (§4.4) |

**Muhim migratsiya eslatmasi:** `OnlineOrder.customerOrderId` da hozir mavjud **soxta UUID'lar**
FK qo'yishdan oldin tozalanishi kerak (`NULL` ga o'tkazish + holatni `accepted` ga qaytarish).
Aks holda migratsiya FK xatosi bilan yiqiladi.

---

## 9. Testlash

### 9.1 Unit
- Narx ustuvorligi (§4.6) — 4 pog'onaning har biri va ular orasidagi ustunlik
- ~~Bonus hisobi~~ · ~~Egalik muddati~~ — 🔴 bekor (2026-08-21)
- Foyda ko'rsatkichi: chegirma berilganda savatdagi foyda darhol qayta hisoblanishi
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
| **B1** | `online-order` → haqiqiy `CustomerOrder` **avtomatik qurish** (`items` dan) + FK + **rezerv** | Ma'lumot yaxlitligi. *Soxta UUID allaqachon tuzatilgan* |
| **B2** | Narx dvigateli (§4.6) + `ContractPrice` + «narx qayerdan» ko'rsatkichi | Sotuvchi nima uchun shu raqam chiqqanini bilishi kerak. *(2026-08-21: «umumiy servis» talabi olib tashlandi — F2/F3 bekor)* |
| ~~B3~~ | ~~Mijoz egaligi~~ | 🔴 **BEKOR (2026-08-21)** — mijozga ega biriktirilmaydi |
| ~~B4~~ | ~~Bonus dvigateli~~ | 🔴 **BEKOR (2026-08-21)** — shaxsiy bonus yo'q |
| **B3′** | `Counterparty.ownerId` ni **olib tashlash** + record-scope qatlamini tuzatish | Egasi qarorini kodga tushirish (eski B3 o'rniga) |
| **B4′** | Savatda **foyda ko'rsatkichi** (`costMinor` muzlatish) + `SalesActivityLog` | Bonus o'rnini bosuvchi nazorat (§3) |
| **B5** | Voronka + qo'ng'iroq/vazifa rejasi (sotuvchi paneli) | Kundalik ish o'rni |
| **B6** | Kommersiya taklifi (KP) + PDF + Telegram + «ko'rildi» | Sotuv quroli |
| **B7** | Hujjatlar: hisob avtomatik + EDO faktura + **MXIK bloklovchi tekshiruvi** | B2G talabi. *Hozir `edo.service.ts:403` MXIK'siz tovarni jimgina `''` bilan yuboradi* |
| **B8** | ~~Webhook qabul qilish~~ | ✅ **BAJARILGAN** — HMAC + `(channelId, externalOrderId)` idempotentlik + testlar |
| **B9** | Yetkazish: haydovchi biriktirish + holat + naqd topshirish | Yakuniy halqa |

Har bosqich — alohida sessiya, alohida commit, o'z gate'i bilan.

---

## 11. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| Muzlatilgan `costMinor` (bonus bazasi) | **1-bo'lim (Kassa)** — bir xil mexanizm |
| Yig'ish varaqalari, rezerv, `mark-ready` | **7-bo'lim (Ombor)** |
| Sotuvchi reytingi, plan/fakt, chegirma tahlili | **3-bo'lim (Analitika)** |
| ~~Bonus → oylik~~ | 🔴 bekor (2026-08-21) — bu bo'lim HR'ga bonus yozmaydi |
| Plan qo'yish, faoliyat jurnalini ko'rish, chegirma ko'rib chiqish | **4-bo'lim (Menejer)** |
| Haydovchi yetkazish | **6-bo'lim (HR)** |
| Ta'minotchidan tovar kelishi (mavjudlik va'dasi) | **5-bo'lim (Ta'minotchilar)** |
