# TZ — 1-bo'lim: KASSA (kassir ish o'rni)

**Sana:** 2026-08-01 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> Bu hujjat — 7 bo'limli tizim TZ'sining **1-qismi**. Qolganlari: 2) Onlayn sotuv/B2B/B2G,
> 3) Analitika, 4) Menejer, 5) Ta'minotchilar, 6) HR, 7) Ombor. Har biri alohida TZ hujjati.
> Umumiy qatlamlar (rollar, hujjat oqimi, chek infratuzilmasi, audit) — **Master TZ** hujjatida.

---

## 0. Kontekst — nima allaqachon qurilgan

Bu bo'lim **noldan qurilmaydi**. Kodda mavjud va ishlayotgan qismlar (tekshirilgan, taxmin emas):

| Qism | Joyi | Holat |
|---|---|---|
| POS sahifasi | `apps/web/src/app/(app)/sotuv/page.tsx` (1715 satr) | ishlaydi |
| Smena (jadval + sessiya ochish) | `apps/api/src/modules/smena` | ishlaydi; jadval tashqarisida ochishga **sabab majburiy** |
| Kassa sessiyasi | `apps/api/src/modules/cashier-session` | `open`/`close`/`drawer-in`/`drawer-out`/`current` |
| Kassa sotuvi | `apps/api/src/modules/retail-sale` | `create`/`send-to-picking`/`post`/`refund`/`cancel` |
| Omborchi yig'ish varag'i | `restock-task.service.ts` → `getPickingSheets()` | **har sklad o'z printeriga**, serpentin marshrut bilan |
| Printer marshrutlash | `apps/web/src/lib/print-agent.ts` | `SkladKeeper.printerName` bo'yicha; Electron + HTTP agent |
| Qarz | `apps/api/src/modules/debt` (1926 satr) | Telegram/SMS eslatma, hisobotlar |
| Xarajat moddalari | `apps/api/src/modules/expense-item` | CRUD tayyor |
| Narx turlari | `PriceType` — «Розничная цена» (default) + «Оптовая цена» | seed'da bor |
| RBAC | `Role` + `RolePermission(entity, action)` + `EmployeeRole` | ko'p rol, ruxsatlar UNION |

### 0.1 Aniqlangan uzilishlar (bu TZ ularni yopadi)

1. **`picking`/`ready` holatlari enum'da yo'q.** `RetailSaleStateSchema` = `['draft','posted','refunded','cancelled']`
   (`retail-sale.schema.ts:18`), lekin `send-to-picking` bazaga `state:'picking'` yozadi
   (`retail-sale.service.ts:966`; DB ustuni `VarChar(20)` bo'lgani uchun o'tib ketadi), POS esa
   `?state=ready` / `?state=picking` bo'yicha so'rov yuboradi (`sotuv/page.tsx:666`) — **Zod enum bularni rad etadi**.
2. ~~**`ready` holatini hech qaysi kod o'rnatmaydi**~~ — **2026-08-01 23:55 da parallel sessiya
   yopdi** (`d7ab3b1`): `POST /retail-sales/:id/mark-ready` qo'shildi va u bu TZ ko'zda tutganidan
   **kuchliroq** — har omborchi faqat **o'z zonasi** (`RestockTask.assigneeId`) topshiriqlarini
   yopadi, sotuv `ready` ga **barcha omborlar** tugagach o'tadi (`retail-sale.service.ts:1169`).
   Shu bilan birga omborchi paneli, yacheyka skaneri, `sklad-keepers` sozlamalari va
   `warehouse-ops` hisoboti qaytarildi. **§4.1 dagi `mark-ready` talabi bajarilgan hisoblanadi**;
   qisman yig'ish (§4.1) hali qoladi.
   **LEKIN 1-uzilish saqlanib qolgan** — `RetailSaleStateSchema` hamon
   `['draft','posted','refunded','cancelled']` (`retail-sale.schema.ts:18`), `list()` esa shu
   sxema bilan filtrlaydi (`retail-sale.service.ts:270`). Ya'ni POS'ning
   `GET /retail-sales?state=ready` va `?state=picking` so'rovlari **hamon 400 qaytaradi** —
   «Yig'ilmoqda» va «Tayyor» ro'yxatlari to'lmaydi. Enum kengaytmasi (§4.1) **eng shoshilinch ish**.
3. **`RetailSalePosition` da `costMinor` yo'q** va POS `post` FIFO'ni chaqirmaydi → **kassa sotuvidan foyda
   hisoblab bo'lmaydi** (na tovar, na kassir kesimida).
4. **To'lov turlari 2 ta** — `cashAmountMinor` + `cardAmountMinor` (`retail-sale.schema.ts:64-69`).
5. **Kiosk rejim yo'q** — kassir butun ERP menyusini ko'radi.
6. **Smena farqi (kamomad/ortiqcha) akti yo'q.**
7. **Qarz to'lovini qabul qilish oynasi POS'da yo'q** (modul bor, kassa interfeysi yo'q).
8. **`page.tsx` = 1715 satr** — savat, smena, to'lov, chek, chop hammasi bitta faylda.

---

## 1. Maqsad va qamrov

**Maqsad:** kassir uchun yopiq, tez va nazorat qilinadigan ish o'rni — sotuv, qarz, xarajat, smena
va omborga topshiriq bir oqimda.

**Qamrovda:** kassir kirishi va kiosk qobiq · sotuv holatlari mashinasi · aralash to'lov ·
narx/tan narx/foyda ko'rinishi · qarz to'lovi (PKO) · xarajat (RKO) · smena ochish/yopish + farq akti ·
chek va printer marshrutlash · audit jurnali.

**Qamrovdan tashqarida (boshqa TZ'larda):** omborchi paneli va yig'ish jarayoni (7-bo'lim) ·
hisobot/analitika ekranlari (3-bo'lim) · menejer tasdiqlash paneli (4-bo'lim) · offline rejim (kelajak).

---

## 2. Qabul qilingan qarorlar (egasi tasdiqlagan)

| # | Qaror | Tanlangan variant |
|---|---|---|
| Q1 | Kassir kirishi | **Kiosk rejim** — faqat POS, ERP menyusi yo'q |
| Q2 | Ombor tayinlash | **Tovarning yacheyka kodi** (`attributes.__yacheyka`), 1-segment = sklad No |
| Q3 | Omborchi cheki | **Zakas shakllanganda** (to'lovdan oldin) |
| Q4 | Qarzga sotish | **Kassir erkin**, nazorat keyin (analitika orqali) |
| Q5 | To'lov turlari | Naqd UZS, Naqd USD, Plastik/terminal, Click/Payme/QR |
| Q6 | Navbat | **Alohida navbat moduli yo'q** — POS tezligiga investitsiya |
| Q7 | Smena yopish | **Z-hisobot + inkassatsiya + farq akti** |
| Q8 | Narx huquqi | **To'liq erkin** — kassir narxni qo'lda yozadi |
| Q9 | Qarz to'lovi | **Umumiy balansga**, FIFO bo'yicha eski qarzlardan yopiladi |
| Q10 | Xarajat | **Kassir erkin yozadi**, tasdiqsiz |
| Q11 | Qaytarish | **Kassada, kassir erkin** |
| Q12 | Offline | **Yo'q** — onlayn talab qilinadi |
| Q13 | Arxitektura | **Kiosk shell + modullarga bo'lish** (mavjud mantiq saqlanadi) |
| Q14 | Yacheyka | **Ikki bosqichli** — hozir tovar yacheykasi, `StockByCell` 7-bo'limda |
| Q15 | Tan narx manbai | **Tovar kartasida qo'lda** (`Product.buyPrice`) + optom narx turi |
| Q16 | Zararga sotuv | **Qizil ogohlantirish, ruxsat beriladi**, audit jurnaliga yoziladi |

**Boshqaruvchi falsafa:** *kassirga ishonch + keyingi nazorat.* Narx ham, qarz ham, xarajat ham, qaytarish ham
erkin — **lekin har og'ish yozib boriladi va menejer analitikasida ko'rinadi.** Bu erkinlik nazoratsizlik emas:
audit jurnali (§9) bu modelning majburiy juftligi, usiz Q4/Q8/Q10/Q11 xavfli bo'lib qoladi.

---

## 3. Rollar va kirish

### 3.1 Kiosk rejim
- `Role` ga yangi maydon: **`uiMode: 'kiosk' | 'full'`** (default `'full'`).
- Kiosk rolidagi xodim login'dan keyin **to'g'ridan-to'g'ri POS'ga** yo'naltiriladi; chap menyu, global qidiruv
  va boshqa bo'lim havolalari **render qilinmaydi**.
- **Server tomonda ham cheklanadi:** kiosk roli faqat quyidagi endpoint'larga ruxsatga ega bo'ladi —
  `retail-sale` (o'z sessiyasi), `cashier-session` (o'z sessiyasi), `smena/mine`, `product` (o'qish),
  `counterparty` (o'qish + yaratish), `debt` (o'qish + to'lov), `cash-out` (xarajat), `expense-item` (o'qish),
  `print`. Faqat UI yashirish — **yetarli emas** (bevosita URL bilan kirish bloklanishi shart).
- Bir xodimga bir necha rol berilsa va bittasi `full` bo'lsa — `full` yutadi.

### 3.2 PIN-qulf
- `Employee.posPinHash` (bcrypt) — 4–6 raqamli PIN.
- **5 daqiqa harakatsizlikdan keyin** ekran qulflanadi; PIN bilan qaytiladi (qayta login emas — savat saqlanadi).
- Noto'g'ri PIN 5 marta → sessiya to'liq chiqariladi + menejerga xabar.
- Sabab: «erkin kassir» modelida asosiy xavf — kassir hisobidan boshqa odamning sotuvi.

### 3.3 Ko'rinish chegarasi
Kassir **faqat o'z ochiq sessiyasining** hujjatlarini ko'radi. Boshqa kassir sotuvi, umumiy hisobotlar,
boshqa smenalar — ko'rinmaydi. Yagona istisno: o'z smenasining Z-hisoboti.

---

## 4. Sotuv oqimi — holatlar mashinasi

```
                 send-to-picking            mark-ready              post
  [draft] ─────────────────────► [picking] ──────────► [ready] ─────────────► [posted]
     │                               │                    │                      │
     │ cancel                        │ cancel             │ cancel               │ refund
     ▼                               ▼ (rezerv bo'shaydi) ▼                      ▼
 [cancelled]                    [cancelled]          [cancelled]            [refunded]
```

### 4.1 O'zgarishlar
- `RetailSaleStateSchema` → `['draft', 'picking', 'ready', 'posted', 'refunded', 'cancelled']`
  (enum ↔ DB ↔ UI birlashtiriladi — §0.1/1-uzilish yopiladi).
- **Yangi endpoint `POST /retail-sales/:id/mark-ready`** — omborchi paneli chaqiradi (§0.1/2-uzilish yopiladi).
  Kirish: `positions[]` — har biriga `pickedQuantity`. To'liq yig'ilsa → `ready`.
- **Qisman yig'ish:** omborchi kam miqdor belgilasa, sotuv `ready` bo'ladi, lekin kam yig'ilgan pozitsiyalar
  kassirda **qizil** ko'rinadi va to'lov oynasida ogohlantirish chiqadi — kassir olib tashlaydi yoki
  miqdorni tuzatadi (tuzatish sotuvni `draft`ga qaytarmaydi, faqat pozitsiyani o'zgartiradi).
- **Rezerv:** `send-to-picking` da tovar rezervlanadi (`Stock.reserved`), `cancel`/`post` da bo'shaydi.
  Sabab: bir tovarni ikki kassir parallel sotib yuborishi.
- **Konkurentlik:** har o'tish **shartli yangilash** (`updateMany` + `where: { state: <kutilgan> }`) bilan;
  `count = 0` → `409 Conflict`. Bu naqsh kodda allaqachon qo'llanilgan (`post`/`cancel`/`refund`).

### 4.2 Kassirning ekrandagi ro'yxatlari
- **«Yig'ilmoqda»** (`state=picking`) — omborchi ishlayotgan zakaslar, vaqt hisoblagichi bilan.
- **«Tayyor»** (`state=ready`) — to'lov kutayotganlar. Kassir bosadi → to'lov oynasi.
- Bu ikki ro'yxat siz tanlagan «navbat moduli yo'q» qaroriga xizmat qiladi: kassir bir mijoz yig'ilishini
  kutayotganda keyingisini boshlay oladi.

### 4.3 Tezlik talablari (Q6 — navbat moduli o'rniga)
- Tovar qidiruv javobi **< 200 ms** (indeksli `search`, debounce 150 ms).
- **Shtrix-kod/QR skaner** — fokus talab qilmaydigan global tinglovchi; skanerdan kelgan kod savatga
  darhol qo'shiladi.
- **Klaviatura shortcut'lari:** `F2` to'lov · `F3` qidiruv · `F4` miqdor · `F6` mijoz · `F9` chek ·
  `Esc` bekor. Kassir sichqonchasiz ishlay olishi kerak.
- Savat holati **localStorage**da saqlanadi — sahifa yangilansa yo'qolmaydi.

---

## 5. Narx, tan narx va foyda

### 5.1 Uch raqam (hammasi tovar kartasidan, qo'lda kiritiladi)

| Raqam | Manba | Roli |
|---|---|---|
| **Tan narx** | `Product.buyPrice` | mutlaq pastki chegara — undan past = **ZARAR** |
| **Optom narx** | `«Оптовая цена»` narx turi (`SalePrice`) | **minimal ruxsat etilgan narx** — kelishuv chegarasi |
| **Chakana narx** | `«Розничная цена»` (default narx turi) | boshlang'ich narx; chegirma shundan o'lchanadi |

### 5.2 Savat qatorining ko'rinishi

```
Viko Palmiye vkl 2x
Qolgan: 90 · Tan: 24 800 · Min: 28 000        Narx [ 32400 ]   32 400,00 so'm
                                              Foyda: +7 600 (30,6%)
```

- Narx tahrirlanganda **foyda real vaqtda qayta hisoblanadi**.
- Narx **< optom** → sariq fon + «optomdan past» belgisi.
- Narx **< tan narx** → qizil fon + **«ZARAR»** yozuvi. Sotuvga **ruxsat beriladi** (Q16), lekin hodisa
  audit jurnaliga yoziladi va menejer analitikasida alohida ko'rinadi.
- Savat pastida: **chek bo'yicha jami foyda va %** — kassir bir tovarda yon berib boshqasida qoplayotganini ko'radi.

### 5.3 Muzlatish (freeze)
`post` paytida har pozitsiyaga yoziladi:
- **`costMinor`** = o'sha ondagi `Product.buyPrice`
- **`basePriceMinor`** = o'sha ondagi chakana narx

Sabab: keyin tovar kartasidagi narxlar o'zgarsa, **eski hisobotlar o'zgarmasligi kerak**.

Hosila ko'rsatkichlar:
- Foyda = `Σ (priceMinor − costMinor) × qty`
- **«Kassir qancha tushirib berdi»** = `Σ (basePriceMinor − priceMinor) × qty`
- Chegirma % = tushirilgan summa ÷ `Σ basePriceMinor × qty`

### 5.4 Ma'lum cheklov (halol qayd)
`buyPrice` qo'lda yuritilgani uchun foyda raqami — **boshqaruv hisobi**, buxgalteriya emas.
Kodda real FIFO tan narx tizimi mavjud (`apps/api/src/modules/demand/fifo-consumer.ts`,
`Stock.costBalanceMinor` — o'rtacha tortilgan asos). Kelajakda foyda hisobini real partiyaga o'tkazish
mumkin: `costMinor` maydoni o'zgarmaydi, faqat uni to'ldirish manbai almashadi — **kassa interfeysi
o'zgarmaydi**. Bu — rejalashtirilgan migratsiya yo'li, qarz emas.

---

## 6. To'lov — aralash (multi-tender)

### 6.1 Model
Yangi jadval **`RetailSalePayment`**:

| Maydon | Tip | Izoh |
|---|---|---|
| `saleId` | uuid | FK → `RetailSale` |
| `method` | enum | `CASH_UZS` · `CASH_USD` · `CARD` · `CLICK` · `PAYME` · `QR` · `DEBT` |
| `amountMinor` | BigInt | to'lov valyutasidagi summa (tiyin/sent) |
| `currency` | VarChar(3) | `UZS` yoki `USD` |
| `rateMinor` | BigInt? | `CASH_USD` uchun qo'llanilgan kurs — **chekka muzlatiladi** |
| `amountBaseMinor` | BigInt | UZS'ga o'girilgan summa (barcha hisob-kitoblar shundan) |
| `reference` | VarChar(100)? | terminal chek raqami / Click tranzaksiya id |

### 6.2 Qoidalar
- Bitta sotuvga **bir necha to'lov** (masalan 500 000 naqd + 300 000 plastik + qolgani qarz).
- `Σ amountBaseMinor ≥ sumMinor` bo'lishi shart, **agar** `DEBT` qatori bo'lmasa.
- **Qaytim faqat naqddan** (`CASH_UZS`); ortiqcha plastik/onlayn to'lov qabul qilinmaydi.
- **`CASH_USD`:** kunlik kurs `exchange-rate` modulidan olinadi, `rateMinor`ga muzlatiladi.
  Kurs topilmasa — to'lov bloklanadi (jim 1:1 qabul qilish **taqiqlanadi**).
- **`DEBT`** qatori mijozning umumiy balansiga tushadi; kontragent tanlanmagan bo'lsa — bloklanadi
  (bu qoida hozir ham ishlaydi: `rasmilashtirish-modal.tsx:119`).
- Barcha pul hisob-kitobi **`@moysklad/money`** orqali, BigInt tiyinda. **Float taqiqlanadi.**

### 6.3 Orqaga moslik
Mavjud `cashAmountMinor` / `cardAmountMinor` maydonlari **hisoblanuvchi** bo'lib qoladi
(`CASH_*` yig'indisi va `CARD` yig'indisi) — mavjud hisobotlar va `moysklad-compat` qatlami buzilmaydi.

---

## 7. Qarz (kassa tomoni)

### 7.1 Qarzga sotish
- To'lanmagan qoldiq **mijozning umumiy balansiga** yoziladi (Q9).
- Kassir erkin (Q4) — limit tekshiruvi yo'q, lekin:
  - to'lov oynasida mijozning **joriy qarzi va eng eski qarz sanasi** ko'rsatiladi (kassir bilib tursin);
  - hodisa audit jurnaliga tushadi.

### 7.2 Qarz to'lovini qabul qilish
POS'da yangi **«Qarz to'lovi»** oynasi:
1. Mijoz qidiruv (telefon / ism / kod)
2. Balans, eng eski qarz sanasi, ochiq cheklar ro'yxati (ma'lumot uchun)
3. Summa + to'lov turi (§6 dagi usullar)
4. **FIFO** — eng eski qarzdan boshlab yopiladi
5. **PKO (prixodnik order)** cheki chiqadi
6. To'lov **joriy smenaga** kiradi (naqd bo'lsa smena naqdini oshiradi)

### 7.3 Balans asimmetriyasini tuzatish
Hozirgi holat: qarz **berilganda** balansga yozilmaydi, **to'langanda** yoziladi
(qayd: `debt-ledger-asymmetry`). Bu TZ buni **simmetrik** qiladi — qarz berilishi ham, to'lanishi ham
`counterparty-balance` da bitta jurnalga yoziladi. Aks holda mijoz balansi haqiqatni ko'rsatmaydi va
§7.2 dagi FIFO noto'g'ri ishlaydi.

### 7.4 `debt` moduli bilan bog'lanish
To'lov tushishi bilan Telegram/SMS eslatma to'xtaydi (mavjud `debt-reminder.service`).

---

## 8. Smena: ochish, xarajat, inkassatsiya, yopish

### 8.1 Ochish
- `smena` jadvali bo'yicha; jadval tashqarisida ochilsa — **sabab majburiy** (mavjud xulq saqlanadi).
- Ochilish naqdi (`openingCashMinor`) UZS va USD alohida kiritiladi.

### 8.2 Xarajat (RKO)
- Kassir **modda tanlab** (`ExpenseItem`) summa va izoh yozadi → RKO cheki chiqadi.
- Tasdiq **shart emas** (Q10), lekin har xarajat audit jurnaliga tushadi.
- Xarajat smena naqdini kamaytiradi.

### 8.3 Inkassatsiya
- Kassa naqdini topshirish hujjati; qabul qiluvchi (menejer/kassa) ko'rsatiladi.
- Smena davomida bir necha marta bo'lishi mumkin.

### 8.4 Yopish va farq akti
Kassir sanalgan naqdni kiritadi (**UZS va USD alohida**), tizim solishtiradi:

```
kutilgan_naqd = ochilish
              + naqd sotuvlar
              + naqd qarz to'lovlari
              − naqd qaytarishlar
              − xarajatlar
              − inkassatsiya
```

- `farq = sanalgan − kutilgan`
- `farq ≠ 0` → **`CashierSessionVariance`** yozuvi (summa, sabab matni, kassir izohi) va
  **menejerga Telegram xabar** (mavjud `telegram` / HR `telegram-bridge` orqali).
- USD farqi alohida yuritiladi (UZS'ga o'girilmaydi — sanoq valyutasida qoladi).

### 8.5 Z-hisobot (chop etiladi)
Tarkibi: smena raqami · kassir · ochilish/yopilish vaqti · **to'lov turlari kesimida tushum** ·
chek soni · o'rtacha chek · **yalpi foyda** · **jami tushirilgan summa (chegirma)** ·
qarzga sotilgan summa · qabul qilingan qarz to'lovlari · qaytarishlar · xarajatlar (moddalar bo'yicha) ·
inkassatsiya · **kutilgan / sanalgan / farq**.

---

## 9. Audit jurnali (erkinlik modelining majburiy juftligi)

Yangi jadval **`CashierAuditEvent`**: `sessionId`, `employeeId`, `type`, `docId`, `payloadJson`, `createdAt`.

Yoziladigan hodisalar:

| Tur | Payload |
|---|---|
| `PRICE_CHANGED` | tovar, chakana narx, kiritilgan narx, farq %, savat id |
| `SOLD_BELOW_WHOLESALE` | tovar, optom narx, sotilgan narx |
| `SOLD_BELOW_COST` | tovar, tan narx, sotilgan narx, **zarar summasi** |
| `SOLD_ON_CREDIT` | mijoz, summa, mijozning yangi balansi |
| `REFUND` | asl chek, pozitsiyalar, summa |
| `EXPENSE` | modda, summa, izoh |
| `SHIFT_OUT_OF_SCHEDULE` | smena, sabab matni |
| `SHIFT_VARIANCE` | kutilgan, sanalgan, farq |
| `SALE_CANCELLED` | savat tarkibi, bosqich (`draft`/`picking`/`ready`) |

Bu jurnal — **3-bo'lim (Analitika) uchun to'g'ridan-to'g'ri xom ashyo**. Kassir kesimidagi savollar
(*«kim o'rtacha necha % tushirib beradi»*, *«kimning qarzi tez o'sadi»*, *«kim ko'p bekor qiladi»*)
aynan shundan javob oladi.

---

## 10. Chek va chop etish

| Chek | Trigger | Marshrut |
|---|---|---|
| **Omborchi yig'ish varag'i** | `send-to-picking` | **har sklad o'z printeriga** — `SkladKeeper.printerName`, serpentin tartib (mavjud) |
| **Mijoz cheki** | `post` | umumiy chek printeri (`CompanySettings`) |
| **PKO** (qarz to'lovi) | qarz to'lovi | chek printeri |
| **RKO** (xarajat) | xarajat | chek printeri |
| **Z-hisobot** | smena yopilishi | chek printeri |

- Ombor bo'yicha bo'lish **tovarning yacheyka kodi** bo'yicha (`01-02-03-05` → 1-segment = sklad No).
  Yacheykasi yo'q tovarlar — alohida «biriktirilmagan» varaqqa tushadi (mavjud xulq).
- Printer/agent ishlamasa yoki biriktirilmagan bo'lsa → **brauzer chopiga fallback** (mavjud).
- Chek raqamlanishi: **kunlik prefiks + smena ichida ketma-ket**.
- Chop etish **sotuvni bloklamaydi**: chop xatosi log'ga tushadi, kassirga toast chiqadi, sotuv holati o'zgarmaydi.

---

## 11. Kod arxitekturasi

Hozirgi `sotuv/page.tsx` (1715 satr) quyidagicha bo'linadi. **Har fayl < 300 satr.**

```
app/(app)/sotuv/page.tsx         → kiosk qobiq (~150 satr, faqat yig'ish + holat)
components/pos/shift/            → smena ochish / yopish / Z-hisobot / farq akti
components/pos/catalog/          → qidiruv, skaner, tovar kartasi
components/pos/cart/             → savat, narx tahriri, tan narx/foyda ko'rsatkichi
components/pos/payment/          → aralash to'lov oynasi
components/pos/debt/             → qarz to'lovi + PKO
components/pos/expense/          → xarajat + RKO
components/pos/queue/            → «Yig'ilmoqda» / «Tayyor» ro'yxatlari
components/pos/lock/             → PIN-qulf
lib/pos/                         → sof funksiyalar: summa, kurs, qaytim, foyda, FIFO qarz yopish
```

**Qoida:** `lib/pos/` dagi hamma narsa — **sof funksiya** (React'siz, tarmoqsiz), 100% unit-test bilan
qoplanadi. Pul mantiqi UI komponentida yozilmaydi.

---

## 12. Baza o'zgarishlari (migratsiyalar)

| O'zgarish | Tafsilot |
|---|---|
| `RetailSalePayment` | yangi jadval (§6.1) |
| `RetailSalePosition.costMinor` | `BigInt?` — `post` da muzlatiladi |
| `RetailSalePosition.basePriceMinor` | `BigInt?` — `post` da muzlatiladi |
| `CashierSessionVariance` | yangi jadval: `sessionId`, `currency`, `expectedMinor`, `countedMinor`, `diffMinor`, `note` |
| `CashierAuditEvent` | yangi jadval (§9) |
| `Role.uiMode` | `VarChar(10)` default `'full'` |
| `Employee.posPinHash` | `VarChar(255)?` |
| `RetailSale.state` | enum kengaytmasi (DB ustuni o'zgarmaydi — faqat Zod + validatsiya) |

**Migratsiya eslatmasi:** prod bazada sxema drift qayd etilgan (`sherset-v2-schema-drift`) — har migratsiya
prod'ga qo'llanishdan oldin `prisma migrate diff` bilan tekshiriladi.

---

## 13. Testlash

### 13.1 Unit (Vitest, `lib/pos/` + api service)
- aralash to'lov: yetarli/yetarsiz/ortiqcha, qaytim faqat naqddan
- `CASH_USD` kurs o'girish; kurs yo'q bo'lsa bloklash
- foyda va chegirma hisobi (muzlatilgan `costMinor`/`basePriceMinor` bilan)
- optomdan past / tan narxdan past chegaralarni aniqlash
- FIFO qarz yopish (bir to'lov bir necha qarzni yopganda)
- smena farqi formulasi (§8.4), UZS/USD alohida
- holatlar mashinasi: har noto'g'ri o'tish `409` beradi

### 13.2 E2E (Playwright)
To'liq stsenariy: smena ochish → 3 xil ombordan tovar → yig'ish varaqalari (3 ta) →
`mark-ready` → aralash to'lov (naqd + plastik + qarz) → mijoz cheki → qarz to'lovi (PKO) →
xarajat (RKO) → smena yopish + farq akti.

### 13.3 Gate (loyiha qoidasi)
`typecheck 0` · `biome 0` · i18n key-existence (ru+uz) + no-hardcoded · web Vitest regressiyasiz.

### 13.4 Phase-2 QA (majburiy)
Real brauzer + **real termal printer** bilan tekshirilmaguncha bu bo'lim **«Phase-1: strukturaviy,
runtime-tasdiqlanmagan»** deb belgilanadi. `browser-smoke` bo'lmasa «done» deyilmaydi (CLAUDE.md §1).

---

## 14. Qabul qilingan taxminlar

1. Bitta kassir — bir vaqtda **bitta ochiq smena**.
2. Mijozni **telefon raqami** bo'yicha topish asosiy usul; kassada yangi mijoz ochish mumkin.
3. Chek raqami: **kunlik prefiks + smena ichida ketma-ket**.
4. Qaytarish: **joriy ochiq smenada** naqd qaytariladi; eski smena cheki bo'lsa qaytarish rasmiylashadi,
   pul menejer orqali beriladi.
5. Kassa **UZS'da yakunlanadi**; USD naqd kurs bo'yicha UZS'ga o'giriladi (sanoq esa alohida).
6. Kiosk kassiri hisobot ko'rmaydi — faqat o'z smenasining Z-hisoboti.

---

## 15. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| **`mark-ready`** — omborchi paneli, yig'ish jarayoni, qisman yig'ish | **7-bo'lim (Ombor)** |
| **Audit jurnali → hisobotlar**, kassir reytingi, foyda/chegirma tahlili | **3-bo'lim (Analitika)** |
| **Farq akti va zarar hodisalarini ko'rish**, xarajat nazorati, rol berish | **4-bo'lim (Menejer)** |
| **Kassir smenasi ↔ HR davomat**, jarima/bonus (farq akti asosida) | **6-bo'lim (HR)** |
| **`StockByCell` ga o'tish** (yacheyka bo'yicha real qoldiq) | **7-bo'lim (Ombor)** |
| **Onlayn buyurtma kassa oqimiga tushishi** | **2-bo'lim (Onlayn sotuv)** |

---

## 16. Bosqichlar (implementatsiya tartibi)

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | Holatlar mashinasi tuzatish: enum + `mark-ready` + rezerv | Hozir oqim uzilgan — birinchi shu |
| **B2** | `costMinor`/`basePriceMinor` + savat qatorida tan narx/optom/foyda | Egasi eng ko'p so'ragan qism |
| **B3** | `RetailSalePayment` — aralash to'lov + USD kurs | To'lov turlari |
| **B4** | Kiosk rejim (`uiMode`) + PIN-qulf + server cheklovi | Xavfsizlik |
| **B5** | Qarz to'lovi (PKO) + balans simmetriyasi | Qarz oqimini yopadi |
| **B6** | Xarajat (RKO) + inkassatsiya | Pul chiqishi |
| **B7** | Smena yopish: farq akti + Z-hisobot | Smena tsiklini yopadi |
| **B8** | `CashierAuditEvent` + `page.tsx` ni modullarga bo'lish | Nazorat + texnik qarz |

Har bosqich — **alohida sessiya, alohida commit**, o'z gate'i bilan (CLAUDE.md §0.3).
