# TZ — 3-bo'lim: ANALITIKA

**Sana:** 2026-08-01 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> 7 bo'limli tizim TZ'sining **3-qismi**. Oldingilari: [1) Kassa](2026-08-01-kassa-tz-design.md) ·
> [2) Onlayn sotuv / B2B / B2G](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md).
> Keyingilari: 4) Menejer, 5) Ta'minotchilar, 6) HR, 7) Ombor.

---

## 0. Kontekst — nima allaqachon qurilgan

`apps/api/src/modules/report` da **17 ta ishlaydigan hisobot**:

| Hisobot | Fayl |
|---|---|
| P&L (foyda va zarar) | `pnl.service.ts` |
| Rentabellik | `profitability.service.ts` |
| Pul oqimi | `cash-flow.service.ts` |
| ABC-tahlil | `abc-analysis.service.ts` |
| Sekin harakatlanuvchi tovarlar | `slow-movers.service.ts` |
| Aylanma | `turnover.service.ts` |
| O'rtacha savat | `average-basket.service.ts` |
| Soatlar bo'yicha sotuv | `sales-by-hour.service.ts` |
| Kanallar bo'yicha sotuv | `sales-by-channel.service.ts` |
| Qaytarish nisbati | `returns-ratio.service.ts` |
| Unit-ekonomika | `unit-economics.service.ts` |
| Qoldiqlar | `stock-balance.service.ts` |
| Kontragent balansi | `counterparty-balance.service.ts` |
| Qarz yoshi (aging) | `aging.service.ts` |
| Xarid boshqaruvi | `purchase-management.service.ts` |
| Inventarizatsiya og'ishlari | `inventory-variance.service.ts` |
| Kontragent akti | `counterparty-act.service.ts` |

Yordamchi infratuzilma (tayyor va ishlatiladi): `report-date-bounds.util.ts` (Toshkent UTC+5 chegaralari,
TZ-testlari bilan) · `report-rate-ctx.util.ts` (valyuta kursi konteksti) · `dashboard.service.ts` ·
`analitika/report-export.service.ts` + `report-pdf.service.ts` (Excel/PDF eksport).

Web: `apps/web/src/app/(app)/reports/*` — 17 sahifa · `apps/web/src/app/(app)/analitika/*` —
inventarizatsiya/sikl-sanash tahlili (alohida yo'nalish).

### 0.1 Aniqlangan xatolar

1. **Rentabellik hisoboti kassa sotuvida NOTO'G'RI natija beradi.**
   `profitability.service.ts:576` da SQL to'g'ridan-to'g'ri `0::bigint AS cost` qaytaradi
   (izoh: *«revenue/qty/documents only (no cost)»*). Natija: **har bir kassa cheki 100% marja bilan
   ko'rsatiladi.** Bu to'liqsizlik emas — **noto'g'ri raqam**, va u asosida qaror qabul qilinadi.
   Sabab 1-bo'limda: `RetailSalePosition` da `costMinor` yo'q.
2. **Xodim kesimi kassa sotuvida `rs.owner_id` bo'yicha** (`profitability.service.ts:551`) — bu
   **hujjat egasi**, sotuvni amalga oshirgan **kassir emas**. Kassir bo'yicha kesim yo'q.
3. **Chegirma/og'ish o'lchovi umuman yo'q** — «kim qancha tushirib berdi» hisoblab bo'lmaydi
   (`basePriceMinor` yozilmaydi).
4. **Bonus va plan o'lchovi yo'q** — 2-bo'limdagi `BonusAccrual` / `SalesPlan` hali yaratilmagan.

---

## 1. Asosiy tamoyil — «o'lchov shartnomasi»

> Analitika bo'limi **o'zi hech narsa hisoblay olmaydi**. U faqat boshqa bo'limlar yozgan ma'lumotni
> o'qiydi. Yozilmagan narsa hisobotda **yo'q** emas — u ko'pincha **noto'g'ri** bo'lib chiqadi
> (0 = «tan narx yo'q» emas, 0 = «tan narx nol», ya'ni 100% foyda).

Shuning uchun bu TZ birinchi navbatda **shartnoma** o'rnatadi: qaysi bo'lim qaysi maydonni yozishi shart.

| # | Kerakli ma'lumot | Kim yozadi | Nimani ochadi |
|---|---|---|---|
| M1 | `RetailSalePosition.costMinor`, `basePriceMinor` | 1-bo'lim | kassa foydasi, chegirma |
| M2 | `CustomerOrderPosition.costMinor`, `basePriceMinor` | 2-bo'lim | B2B foydasi, chegirma |
| M3 | `CashierAuditEvent` | 1-bo'lim | narx og'ishi, zarar, bekor qilish |
| M4 | `CashierSessionVariance` | 1-bo'lim | kassa kamomadi |
| M5 | `SalesActivityLog` | 2-bo'lim | sotuvchi faolligi, voronka konversiyasi |
| M6 | `BonusAccrual` | 2-bo'lim | bonus (hisoblangan / to'langan) |
| M7 | `SalesPlan` | 2-bo'lim | plan/fakt |
| M8 | Qarz jurnali **simmetriyasi** | 1-bo'lim | qarz yozilishi va undirilishi |
| M9 | Davomat, jarima, vazifa natijasi | 6-bo'lim | intizom va faollik |
| M10 | Yig'ish vaqti, yacheyka harakati | 7-bo'lim | ombor samaradorligi |
| M11 | Ta'minotchi muddati va sifati | 5-bo'lim | ta'minot ishonchliligi |

**Amaliy natija:** Analitika 1/2/5/6/7-bo'limlar bilan **parallel** quriladi. Har bo'lim o'z «o'lchov
qarzi»ni yopadi; Analitika bo'limi ularni yig'adi. Hisobot yozishdan oldin uning **manba maydonlari
mavjudligi tekshiriladi** — manba yo'q bo'lsa hisobot yozilmaydi (soxta raqam chiqarishdan ko'ra
«ma'lumot yig'ilmagan» deyish yaxshiroq).

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Format | Boshqaruv paneli + detal hisobotlar + **har xodimga shaxsiy ekran** |
| Q2 | Telegram xabarnomalari | **tanlanmadi** — analitika «tortiladi», o'zi bosmaydi (4-bo'limda qayta ko'riladi) |
| Q3 | Xodim kesimi | sotuv va foyda · chegirma va og'ishlar · qarz va undirish · intizom va faollik |
| Q4 | Tovar tahlili | o'lik zaxira · tugab qolish xavfi · marja tahlili · yo'qotishlar |
| Q5 | Hisoblash | **aralash** — panel oldindan hisoblangan, detal jonli |
| Q6 | Foyda ta'rifi | **yalpi foyda** (tushum − tan narx) operativ qaror va bonus uchun; umumiy xarajatlar P&L'da |

**Q6 sababi:** ijara/oylik kabi umumiy xarajatlarni tovarga taqsimlash har doim **shartli** (qaysi
baza bo'yicha — summami, hajmmi, vaqtmi?). Shartli raqamni bonusga ulash xodimlar bilan nizo
keltirib chiqaradi. Shuning uchun: **bonus va operativ qaror — yalpi foydadan**, korxona sof
natijasi — `pnl` hisobotida.

---

## 3. Uch qatlam

### 3.1 Boshqaruv paneli (rol bo'yicha, oldindan hisoblangan)

| Rol | Panelda |
|---|---|
| **Egasi** | tushum · yalpi foyda · marja % · qarz va uning yoshi · ombor qiymati · **o'lik zaxira** · kunlik/oylik dinamika · eng yaxshi va eng yomon ko'rsatkichlar |
| **Menejer** | plan/fakt (bo'lim va xodim kesimida) · xodimlar reytingi · og'ishlar (chegirma, zarar, kamomad) · tugab qolayotgan tovarlar · muddati o'tgan qarzlar |
| **Sotuvchi** | o'z plani/fakti · o'z foydasi va bonusi · voronkasi · bugungi vazifalari |
| **Kassir** | o'z smenasi: cheklar, tushum, o'rtacha chek (kiosk rejimda faqat shu) |
| **Omborchi** | yig'ilgan zakaslar, o'rtacha yig'ish vaqti, xatolar (7-bo'lim) |

Panel **ochilishi 1 soniyadan kam** bo'lishi kerak — shuning uchun rollup jadvallaridan o'qiydi (§5).

### 3.2 Detal hisobotlar (jonli, filtr + eksport)
- Mavjud 17 hisobot saqlanadi; §0.1 dagi xatolar tuzatiladi.
- Har hisobotda: davr, kesim, filtrlar, **Excel/PDF eksport** (infratuzilma bor).
- Har hisobot sarlavhasida: **qaysi kursda**, **qaysi vaqt mintaqasida**, **qaysi ma'lumot manbasidan**
  hisoblangani ko'rsatiladi (ishonch uchun).

### 3.3 Xodimning shaxsiy ekrani («Mening natijam»)
- Bugun / shu oy: sotuv, foyda, o'rtacha chek, mijozlar soni.
- Plan bajarilishi: `fakt / plan / %` + sur'at bashorati («shu sur'atda oyni 78% bilan yopasiz»).
- **Bonus**: hisoblangan (jo'natilgan) va **tan olingan** (pul tushgan) — 2-bo'lim Qoida 2.
- Reytingdagi o'rni (ism ko'rsatilmagan holda: «12 xodim ichida 4-o'rin»).
- **Bu hisobot emas — motivatsiya vositasi.** Xodim o'z raqamini ko'rsa, uni yaxshilashga harakat qiladi.

---

## 4. O'lchov modeli (yagona kesim/ko'rsatkich to'plami)

Har hisobot o'z formulasini yozmaydi — hammasi bitta modeldan quriladi. Aks holda ikki hisobot
bir xil savolga ikki xil javob beradi (ERP'larda eng ko'p uchraydigan ishonchsizlik sababi).

**Kesimlar (dimensions):** vaqt (kun/hafta/oy/chorak/yil) · xodim · mijoz va guruhi · tovar va guruhi ·
ombor va yacheyka · kanal (kassa / onlayn / B2B / B2G) · organizatsiya · to'lov turi.

**Ko'rsatkichlar (metrics):**

| Ko'rsatkich | Formula |
|---|---|
| Tushum | `Σ sum_minor` (posted hujjatlar) |
| Tan narx | `Σ costMinor × qty` (muzlatilgan) |
| **Yalpi foyda** | tushum − tan narx |
| Marja % | yalpi foyda ÷ tushum |
| **Chegirma summasi** | `Σ (basePriceMinor − priceMinor) × qty` |
| Qaytarish | `Σ` qaytarilgan summa; nisbati = qaytarish ÷ tushum |
| Qarz yozilgan / undirilgan | qarz jurnalidan (M8) |
| O'rtacha chek | tushum ÷ hujjatlar soni |
| Aylanma tezligi | sotilgan tan narx ÷ o'rtacha qoldiq qiymati |
| **O'lik zaxira qiymati** | `Σ qoldiq × tan narx` (N kundan beri sotilmaganlar) |
| Yo'qotishlar | inventarizatsiya kamomadi + yaroqsiz + sabab kodlari bo'yicha |

**Qoida:** bu formulalar **bitta joyda** (`report/metrics/`) yoziladi va barcha hisobotlar shuni chaqiradi.

---

## 5. Texnik yechim — aralash hisoblash (Q5)

### 5.1 Rollup jadvallari
| Jadval | Kesim | Mazmun |
|---|---|---|
| `DailySalesRollup` | kun × kanal × ombor × xodim | tushum, tan narx, foyda, chegirma, hujjat soni, qaytarish |
| `DailyStockRollup` | kun × ombor × tovar | qoldiq, qoldiq qiymati, oxirgi sotuv sanasi |
| `EmployeeDailyRollup` | kun × xodim | sotuv, foyda, chegirma, qarz yozilgan/undirilgan, vazifa, davomat |
| `CounterpartyDailyRollup` | kun × mijoz | sotuv, to'lov, qarz balansi |

### 5.2 Hisoblash qoidalari
- Kechasi (Toshkent bo'yicha 00:30) cron **kechagi kunni** rollup qiladi (`@Cron` naqshi kodda bor).
- **Bugungi kun rollup'ga tushmaydi** (hali tugamagan). Panel: *«kechagacha rollup + bugun jonli»*.
  Bu — tezlik va aniqlikning to'g'ri muvozanati.
- Hujjat **orqaga sanaga** o'zgartirilsa/o'chirilsa → o'sha kun rollup'i **qayta hisoblanishga**
  navbatga qo'yiladi (`RollupRebuildQueue`). Jim eskirib qolish taqiqlanadi.
- Rollup **hosila** — u yo'qolsa to'liq qayta qurish mumkin bo'lishi shart (`rebuild --from=<sana>` CLI).

### 5.3 Vaqt va valyuta
- **Toshkent UTC+5** — mavjud `report-date-bounds.util.ts` ishlatiladi (o'z sana mantiqini yozish taqiqlanadi;
  kodda buning uchun TZ-testlari bor: `report-date-tz-class.test.ts`, `list-date-tz-class.test.ts`).
- **Valyuta** — `report-rate-ctx.util.ts`; har hisobot qaysi kurs kontekstida hisoblangani ko'rsatiladi.
  Tarixiy hujjat **o'z kursida** qoladi (qayta baholanmaydi).

### 5.4 Ruxsat
- Har hisobot `RolePermission(entity='report:<nom>', action='read')` bilan himoyalanadi.
- **Xodim faqat o'z ma'lumotini** ko'radi (shaxsiy ekran); boshqalarnikini ko'rish — alohida ruxsat.
- Kiosk kassir (1-bo'lim §3) faqat o'z smenasi ko'rsatkichini ko'radi.

---

## 6. Tovar tahlili (Q4 — 4 ta yo'nalish)

### 6.1 O'lik zaxira — «qancha pul qotib qolgan»
- Filtr: N kundan beri sotilmagan (30/60/90/180/365 — sozlanadigan).
- **Asosiy ko'rsatkich — pul**: `Σ qoldiq × tan narx`, nafaqat dona.
- Kesim: ombor · yacheyka · tovar guruhi · ta'minotchi (kim keltirgan).
- Harakat: chegirma ro'yxatiga qo'shish / qaytarish / hisobdan chiqarish tavsiyasi.
- Asos: mavjud `slow-movers.service.ts` — pul o'lchovi va yacheyka kesimi qo'shiladi.

### 6.2 Tugab qolish xavfi + buyurtma tavsiyasi
- Sotuv sur'ati (kunlik o'rtacha, mavsumiylik hisobga olingan) × ta'minotchi yetkazish muddati (M11).
- Chiqadi: **«necha kunda tugaydi»**, **«qancha buyurtma qilish kerak»**, xavf darajasi (qizil/sariq/yashil).
- Asos: mavjud `purchase-management.service.ts` kengaytiriladi.

### 6.3 Marja × aylanma matritsasi
4 kvadrant — har tovar/guruh joylashtiriladi:

| | **Tez aylanadi** | **Sekin aylanadi** |
|---|---|---|
| **Yuqori marja** | ⭐ Yulduzlar — zaxirani ko'paytirish | 💎 Foydali lekin sekin — nazorat qilish |
| **Past marja** | 🐎 Ishchi otlar — aylanmani ushlab turish | ⚠️ **Balast** — birinchi navbatda chiqarish |

Bu bitta ekranda «nimani ko'paytirish, nimadan qutulish» savoliga javob beradi.

### 6.4 Yo'qotishlar
- Inventarizatsiya kamomadi (`inventory-variance` + `reason-code` bor) · yaroqsiz/buzilgan ·
  qaytarish sabablari · kassa kamomadi (M4).
- Kesim: **ombor · xodim · sabab · vaqt**. Xodim kesimi — takrorlanuvchi yo'qotish manbasini ochadi.

---

## 7. Xodim kesimidagi hisobotlar (Q3)

| Blok | Ko'rsatkichlar | Manba |
|---|---|---|
| **Sotuv va foyda** | tushum, yalpi foyda, o'rtacha chek, mijozlar soni, reyting, dinamika | M1, M2 |
| **Chegirma va og'ishlar** | o'rtacha chegirma %, jami «yo'qotilgan foyda», zararga sotilgan cheklar, tan narxdan past sotuvlar | M1, M2, M3 |
| **Qarz va undirish** | yozilgan qarz, undirilgan ulush, muddati o'tganlar, o'rtacha undirish muddati | M8 |
| **Intizom va faollik** | davomat, kechikish, bajarilgan/bajarilmagan vazifa, qo'ng'iroqlar, smena farqlari, jarima/bonus | M4, M5, M9 |

**Muhim:** bu hisobotlar 1-bo'limdagi «kassirga erkinlik» va 2-bo'limdagi «sotuvchiga erkinlik»
qarorining **juftligi**. Erkinlik + o'lchov = boshqariladigan tizim. Erkinlik − o'lchov = nazoratsizlik.

---

## 8. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `DailySalesRollup` | yangi (§5.1) |
| `DailyStockRollup` | yangi (§5.1) |
| `EmployeeDailyRollup` | yangi (§5.1) |
| `CounterpartyDailyRollup` | yangi (§5.1) |
| `RollupRebuildQueue` | yangi — orqaga sanaga o'zgarish navbati |
| `SlowMoverConfig` | yangi — o'lik zaxira chegaralari (30/60/90/180/365) |
| `report/metrics/` | yangi kod qatlami — yagona formulalar (jadval emas) |

**Eslatma:** rollup jadvallari — **hosila ma'lumot**. Ular biznes haqiqati emas; har doim
hujjatlardan qayta qurilishi mumkin bo'lishi shart.

---

## 9. Tuzatiladigan mavjud xatolar

| # | Xato | Tuzatish |
|---|---|---|
| X1 | `profitability`: kassa sotuvida `0::bigint AS cost` | M1 kelgach haqiqiy `costMinor` bilan almashtiriladi |
| X2 | Kassa xodim kesimi `rs.owner_id` (hujjat egasi) | **kassir** kesimi `cashier-session.cashierId` orqali qo'shiladi; ikkalasi alohida kesim sifatida saqlanadi |
| X3 | Chegirma o'lchovi yo'q | M1/M2 (`basePriceMinor`) kelgach qo'shiladi |
| X4 | Hisobotlar formulalari tarqoq | `report/metrics/` ga yig'iladi |

**Oraliq holat qoidasi:** M1 kelgunga qadar rentabellik hisoboti kassa sotuvlarini
**«tan narx yig'ilmagan»** deb ochiq belgilaydi (0 deb ko'rsatib, 100% marja chiqarmaydi).
Noto'g'ri raqam ko'rsatishdan ko'ra ma'lumot yo'qligini aytish afzal.

---

## 10. Testlash

### 10.1 Unit
- Har ko'rsatkich formulasi (`report/metrics/`) — chegaraviy holatlar: nol tushum, nol qoldiq,
  manfiy foyda, qaytarilgan hujjat
- Rollup ↔ jonli hisob **mos kelishi** (bir davr uchun ikki usul bir xil raqam berishi shart) — bu
  eng muhim test: rollup «jim ravishda» og'ib ketmasligi kerak
- Orqaga sanaga o'zgarish → rollup qayta hisoblanishi
- Vaqt mintaqasi chegaralari (kun/oy boshi va oxiri, UTC+5)
- Valyuta: tarixiy kurs saqlanishi

### 10.2 E2E
Kassa sotuvi (chegirma bilan) → rollup → panelda foyda va chegirma to'g'ri chiqishi →
xodim shaxsiy ekranida ko'rinishi → Excel eksport.

### 10.3 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz · **Phase-2 QA** real brauzerda.

---

## 11. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `report/metrics/` — yagona formulalar qatlami | Hamma narsa shunga tayanadi |
| **B2** | X1/X2/X3 tuzatish + «tan narx yig'ilmagan» belgisi | Noto'g'ri raqamni to'xtatish — eng shoshilinch |
| **B3** | Rollup jadvallari + cron + qayta qurish CLI | Panel tezligi |
| **B4** | Rol bo'yicha boshqaruv panellari | Kundalik foydalanish |
| **B5** | Xodim shaxsiy ekrani («Mening natijam») | Motivatsiya |
| **B6** | Xodim kesimidagi 4 blok hisoboti | Nazorat |
| **B7** | Tovar tahlili: o'lik zaxira + tugash xavfi | Pul bo'shatish |
| **B8** | Marja × aylanma matritsasi + yo'qotishlar | Strategik qarorlar |

---

## 12. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| M1, M3, M4, M8 — kassa o'lchovlari | **1-bo'lim (Kassa)** |
| M2, M5, M6, M7 — sotuvchi o'lchovlari | **2-bo'lim (Onlayn/B2B/B2G)** |
| M11 — ta'minotchi muddati va sifati | **5-bo'lim (Ta'minotchilar)** |
| M9 — davomat, jarima, vazifa | **6-bo'lim (HR)** |
| M10 — yig'ish vaqti, yacheyka harakati | **7-bo'lim (Ombor)** |
| Panellar, ogohlantirishlar, plan qo'yish | **4-bo'lim (Menejer)** |
