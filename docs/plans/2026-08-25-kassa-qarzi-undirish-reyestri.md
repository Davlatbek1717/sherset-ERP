# Kassada mijoz hisob-kitobi — qarzni undirish ro'yxatiga ulash + avans bilan ishlash

> **Yaratilgan:** 2026-08-25 · **Buyurtmachi:** Ozodbek (egasi) · **HOLAT (2026-08-26): TO'QQIZ FAZANING HAMMASI YOZILDI — Q1…Q6 va A1…A3, hammasi «QISMAN».** Reja endi yangi faza KUTMAYDI, u **deploy oynasini** kutadi. **Q6 (`4d294947`)** — jonli verify skripti (`ops-q6-live-verify.ts`, **DRY default**, hukmlar sof `q6-verify-plan.ts` da va 86 test bilan qulflangan), eskirgan premise'larning MEXANIK qo'riqchisi (`sale-debt-premise-guard.test.ts`), `NEXT.md` **2026-08-26a** qaror yozuvi va `docs/ops/jonli-holat.md` **§3.2**. Lokal DRY yugurish skriptning ISHLASHINI isbotladi va UCH nosozlikni ochdi (hammasi tuzatildi): «API javob bermadi» «kod deploy qilinmagan» deb yozilardi · invariant 5 ning ataylab rad etilgan cheki CHERNOVIK qoldirardi va u SMENANI bloklardi (F5 sinfi) · undirish ro'yxatining 500 qatorlik KESIMI «topilmadi» ni «yo'q» deb o'qitardi (Q5 dan keyin ro'yxat 812 qator). 🔴 **JONLI VERIFY YUGURTIRILMAGAN va egasi tasdig'i YO'Q** — deploy 2026-08-25 da RAD ETILGAN. Uch migratsiya hamon VPS'da BERILMAGAN; Q6 ning DRY yugurishi Q4 migratsiyasi **lokal bazada ham yo'qligini** o'lchadi. Deploy tartibi Q6 hisobotining oxirida. — Eski sarlavha (fazalar tafsiloti): Q1 QISMAN + Q2 QISMAN + Q3 QISMAN + A1 QISMAN + A2 QISMAN + A3 QISMAN + Q4 QISMAN + **Q5 QISMAN** (2026-08-25) — **AVANS OQIMI ENDI KODDA TO'LIQ: qabul (A1, `8d1f4a01`) → sarflash (A2, `8178fd87`) → ko'rsatish/tarix/qaytarish (A3, `526dda5c` + `1447a11e`)**. A3: `customerStanding` sof moduli (to'rt holat), POS kartasida «Avansi: N» (ilgari «0» turardi), avans yorliqlari UCH xaritada (POS · akt sahifasi · **Excel akti — reja bilmagan uchinchi joy**), `POST /cashier-sessions/:id/customer-prepay-refund` (kassa −summa / balans +summa, cap = mavjud avans, balans `FOR UPDATE` bilan QULFLANADI, RKO cheki `ВА-`), `recompute` ga **to'rtinchi manba** (`customer-prepay-refunds`), Z-hisobotda uchinchi avans qatori, menejer ro'yxatida avansli mijozlar ajralib turadi. **A3 da migratsiya YO'Q** (`RetailDrawerCashOut.kind` VarChar(20) va `agentId` yetadi). Qarz oqimi (Q1–Q3) o'zgarishsiz. **HECH BIRI DEPLOY QILINMAGAN** — deploy branch'i `kassa-qarzi-q1-q2` @ `456e53af` da Q3, A1, A2, A3 YO'Q (qayta yig'ilishi kerak), push va jonli tasdiq KUTILMOQDA; `opening` manbasi qarori hamon ochiq; A1 topgan 35 bayonotlik sxema DRIFTI (4 ta `DROP TABLE`) — alohida ish; **Q5 QISMAN** (`23426f15`) — backfill + TESKARI skript kodda TAYYOR va lokal dev bazada TO'LIQ isbotlangan (652 → 885 → 652 qator, balans jurnaliga 0 yozuv, `recompute` cross-check shovqini 759 → 759); DRY-RUN o'lchovi: 271 chek / 133 kontragent → **233 qator, 701 489 130 so'm**, muddat zinapoyali (50/50/50/50/33 — 5 kun). 🔴 **JONLI BOSQICH BAJARILMADI** — Q1 migratsiyasi jonlida yo'q, deploy rad etilgan, egasi «jonliga tegma» dedi (2026-08-25). Q5 ochiq bandlari: jonli 1 kontragent → smoke → qolgani (mezon 3, 4, 5, 7). Navbat **Q6** — lekin Q5 ning jonli bandlarisiz boshlanmaydi (qoida 11). **Q4 (`7ddd4e21`) — MANBA + FILTR + MUDDAT SOZLAMASI kodda TAYYOR:** undirish ro'yxati va `/debts` da «Kassa cheki / Reyestr» belgisi va chek raqami havolasi, manba filtri (sof qatlamda — SQL `<> 'retailsale'` NULL larni yo'qotardi), `CompanySettings.saleDebtTermDays` (migratsiya `20260825235000_…`, NULL ≠ 0, sozlanmagan bo'lsa Q1 defaulti 14 kun, ESKI qarzlar qayta hisoblanmaydi). Q4 ochiq bandlari: lokal dev bazada migratsiya sinovi (parol) + jonli tasdiq. 🔴 Q4 yo'l-yo'lakay A3 ning **20 i18n kalitini tikladi** — ular hech qachon commit qilinmagan ekan va i18n gate shu sababdan qizil edi; A2 ning ikki chegarasi (avansdan to'langan chek TAHRIRLANMAYDI; Z-hisobot `revenueByMethod` vozvrat-nusxalarini sanaydi) va A3 ning ikki qaydi (mijozga «avansdan yechildi» xabari ATAYLAB yozilmadi; Excel akt yorliqlarida `returnPayout`/`salesReturn` hamon yo'q — G1 ning ishi) OCHIQ qoladi
> **Ikki shikoyat (egasi, 2026-08-25):**
> 1. «Qarzdorlikni undirish bo'limiga kassadan qo'shilgan yangi qarzdorliklar
>    ko'rinmayapti.» → fazalar **Q1…Q6**
> 2. «Ba'zi mijozlarimiz bizga oldindan pul berib qo'yishadi, keyin tovar
>    olishadi — shu mijozlar bilan ishlay olmayapmiz.» → fazalar **A1…A3**
>
> Ikkalasi BITTA rejada, chunki ular **bitta daftarning ikki uchi**: qarz
> (`balans > 0`) va avans (`balans < 0`) — aynan bir xil
> `CounterpartyBalance` ustunining musbat va manfiy tomoni. Alohida rejada
> qurilsa ikki jamoa bir maydonni qarama-qarshi tomonga tortardi (§2.3 dagi
> kesishuv qoidasi buni ko'rsatadi).
> **Ijro tartibi:** har faza ALOHIDA sessiyada. Agent shu faylni TO'LIQ o'qiydi
> (avvalgi fazalar hisobotlari bilan), O'Z fazasini bajaradi, testlardan
> o'tkazadi, pastdagi «Hisobotlar» bo'limiga yozadi va **TO'XTAYDI**.
>
> **O'ZGARMAS QOIDALAR:** `docs/plans/2026-08-23-ombor-restrukturizatsiya.md`
> ning **2-bo'limi (1–14 bandlari)** shu rejaga ham AYNAN tatbiq etiladi —
> bitta sessiya = bitta faza; testlar + i18n ru/uz majburiy; maxfiy ma'lumot
> yozilmaydi; branch/push/deploy retsepti o'sha yerda; jonli bazaga skript
> avval lokalda; **10** ikki tomonlama bog'liqlik (hisobotda «bu o'zgarish
> nimani buzishi mumkin?» — yozma javob); **11** bajarilmagan qabul mezoni
> bilan faza YOPILMAYDI; **12** jonli skriptning teskarisi o'sha sessiyada
> yoziladi va sinaladi; **13** jonli o'zgarishdan keyin uchma-uch smoke;
> **14** VPS'da yozilgan skript o'sha kuni git'ga.
>
> 🔴 Jonli ma'lumotga tegadigan faza (Q5) boshlanishidan oldin
> **`docs/plans/2026-08-24-split-kassa-hodisasi.md`** ham o'qiladi.

---

## 1. Muammo — o'lchangan holat

### 1.0 Bitta daftar, ikki uchi

```
CounterpartyBalance.balanceMinor  (kassa valyutasi, tiyin)

   −1 000 000 ────────── 0 ────────── +1 000 000
   ◄── AVANS                            QARZ ──►
   biz mijozga qarzdormiz        mijoz bizga qarzdor
   (A1…A3 muammosi)              (Q1…Q6 muammosi)
```

Ikkala shikoyat ham **bitta sabab**dan: kassa (kiosk) bu ustunning
faqat bir tor bo'lagi bilan ishlay oladi. Qarz tomonida — chekdan yozadi-yu,
undirish moduliga ulanmaydi. Avans tomonida — umuman yo'l yo'q.

Mijoz qarzi tizimda **ikki mustaqil daftarda** yashaydi:

| # | Daftar | Kim yozadi | Undirish ro'yxati ko'radimi |
|---|---|---|---|
| 1 | `CounterpartyBalance` | POS qarzga sotuvi (`retail-sale.service.ts#post` → `applyDelta(+debtAmount)`), `InvoiceOut`, `PaymentIn`, `CashIn/Out`, … | ❌ **YO'Q** |
| 2 | `Debt` reyestri (`QRZ-…`) | `DebtService.create` (qo'lda ochilgan qarz) + P1 adopsiya qatorlari | ✅ ha |

**Undirish ro'yxati** (`GET /manager/collection`,
`apps/api/src/modules/manager/collection/debt-collection.service.ts:65`) FAQAT
2-daftardan o'qiydi (`debt.findMany`, `status in ['unpaid','partial']`).
**Kassadan chek orqali berilgan qarz esa faqat 1-daftarga tushadi** —
`retail-sale.service.ts:1241-1245` da bu ATAYLAB qilingani yozilgan:

> «Bu yerda ATAYLAB `Debt` reyestriga (QRZ-…) yozmaymiz… Ikkalasiga birdan
> yozilsa, hujjatdan kelgan qarz IKKI MARTA sanalardi (xotira:
> `debt-ledger-asymmetry`). Bitta daftar — bitta haqiqat.»

Natija: **kassadan berilgan qarz undirish ro'yxatida, qo'ng'iroq jadvalida,
eslatma oqimida va menejer navbatida umuman ko'rinmaydi.** Egasining shikoyati
aynan shu.

### 1.1 Bu yoriq allaqachon yarim yopilgan (P1, 2026-08-11)

`apps/api/src/modules/debt/pos-customer-debt.ts` shu muammoni hujjatlashtirgan
va **to'lov yo'lini** tuzatgan — **adopsiya**: mijoz kassaga pul olib kelganda
balansdagi qarzning *to'lanayotgan qismi* uchun reyestrga qator ochiladi
(`Debt.balanceAdopted = true`) va o'sha tranzaksiyada yopiladi. Adopsiya qatori
balansga `+total` **YOZMAYDI** (qarz u yerda bor) ⇒ ikki karra sanash yo'q.

Ya'ni **naqsh allaqachon qurilgan va jonlida sinalgan**
(`ops-p1-live-verify.ts`). Bu reja shu naqshni **berish** yo'liga ham
kengaytiradi. `pos-customer-debt.ts:137-141` da butun qoldiqni adopsiya
qilmaslik ataylab tanlangani yozilgan — sabab «eslatma cron / Telegram oqimi
kutilmaganda portlardi». Q5 (backfill) aynan shu xavfni boshqaradi.

### 1.2 Egasining qarori (2026-08-25)

**B varianti tanlandi:** POS chekdan qarz yaratilganda reyestrga ham ochiq
qator yoziladi (`balanceAdopted = true` → balansga qo'shilmaydi). Shunda
undirish, eslatma, qo'ng'iroq oqimlari **o'zgarishsiz** ishlaydi.

Rad etilgan A varianti: undirish ro'yxatiga balansdan ikkinchi manba qo'shish.
Sabab: bunday qatorlarda `debtId`, muddat, javobgar yo'q; eslatma yo'li
qarz-ID ga bog'langan (`sendBulkReminders`), uni kontragent-ID ga moslashtirish
butun modul bo'ylab yangi `null` shoxlari ochardi.

**Egasining qo'shimcha qarori:** «Operator izohlari kassirga umuman
ochilmasin» talabi **YO'Q** — kassir ko'ra olsin. Ya'ni bu rejada
`GET /debts/:id` javobini kassir roli uchun qisqartirish **QILINMAYDI**.

**Muddat:** kassa qarzining default muddati — **14 kun** (egasi 2026-08-25 da
tasdiqladi: «hozircha shunday qur»). Q4 da sozlanadigan bo'ladi.

### 1.3 Ikkinchi muammo — AVANS (oldindan to'lov)

**Egasi:** «Ba'zi mijozlarimiz bizga oldindan pul berib qo'yishadi, keyin tovar
olishadi — shu mijozlar bilan ishlay olmayapmiz.»

**Yaxshi xabar — daftar buni ALLAQACHON qo'llaydi.** Manfiy
`CounterpartyBalance` = «biz mijozga qarzdormiz» ma'nosini bildiradi va bu
`counterparty-settlement.util.ts` sarlavhasida rasman ta'riflangan.
`CashIn.post` mijoz balansiga `−sumMinor` yozadi
(`cash-in.service.ts:595-600`), `Prepayment` / `PrepaymentReturn` modullari
ham, `/prepayments` va `/cash-in` web ekranlari ham MAVJUD.

**Yoriq — kassada (kiosk).** Uchta aniq to'siq kod bilan o'lchandi:

| # | To'siq | Dalil | Oqibat |
|---|---|---|---|
| 1 | **Avansni qabul qilish yo'li yo'q** | `/cash-in` kiosk allowlist'da **YO'Q** (`kiosk-policy.ts` — to'liq ro'yxatda `/cash-out` bor, `/cash-in` yo'q). `drawerCashIn` («Внесение») kontragentsiz va balansga TEGMAYDI. `POST /debts/pos/pay` esa `payableMinor = 0` da rad etadi | Mijoz kassaga oldindan pul berib ketmoqchi — kassir uni tizimga kirita olmaydi |
| 2 | **Avansdan to'lash tenderi yo'q** | `retail-tenders.ts:29-46` — `TENDER` da atigi 5 tur: `CASH_UZS`, `CASH_USD`, `CARD`, `TERMINAL`, `DEBT`. Avans/balans turi YO'Q | Avansi bor mijoz tovar olganda kassir uni yo yana naqd oldirishga, yo QARZGA yozishga majbur |
| 3 | **Kassir avansni KO'RMAYDI** | `debtPayable` manfiy balansda `0` qaytaradi (`pos-customer-debt.ts:159-168`), mijoz kartasidagi YAGONA yirik son esa aynan `payableMinor` (`customer-card-panel.tsx:423-431`) | Ekranda «0» turadi — kassir mijozning pulimiz turganini bilmaydi ham |

**Muhim kuzatuv (A2 dizaynining o'zagi):** avans tenderining balansga
yozadigan deltasi `DEBT` tenderiniki bilan **AYNAN BIR XIL** — ikkalasi ham
`+summa`. Farq faqat natijaning ishorasida va chekning to'langan sanalishida:

| | Balans oldin | Delta | Balans keyin | `payedSumMinor` ga kiradimi |
|---|---|---|---|---|
| `DEBT` tender | 0 | +300k | +300k (mijoz qarzdor) | ❌ yo'q |
| `PREPAY` tender | −1 000k | +300k | −700k (avans qoldig'i) | ✅ **ha** (tovar to'langan) |

Ya'ni **yangi pul-yo'li ochilmaydi** — mavjud `applyDelta` yo'li qayta
ishlatiladi. Yangi narsa faqat: qoplama chegarasi (`min(summa, −balans)`),
`payedSumMinor` hisobi va reyestr qatori OCHILMASLIGI (§2.2).

**Nega bu Q-fazalar bilan bitta rejada:** §2.2 dagi kesishuv qoidasi ikkalasiga
ham tegishli va u **Q1 da yoziladi, Q2 da qo'llanadi** — ya'ni avans mavzusi
Q-fazalarga ta'sir qiladi, teskarisi ham. Alohida rejada qurilsa bir-birini
buzardi.

---

## 2. Blast radius — nima o'zgaradi, nima o'zgarmaydi (qoida 10 uchun poydevor)

Har faza hisobotida shu jadval o'z fazasi kesimida qayta baholanadi.

| O'quvchi | Fayl | Yangi qatorlar unga qanday ta'sir qiladi |
|---|---|---|
| Undirish ro'yxati | `manager/collection/debt-collection.service.ts:65` | ✅ **MAQSAD** — qatorlar shu yerda paydo bo'ladi |
| Menejer navbati | `manager/queue/manager-queue.service.ts:400` (`DEBT_CAP`) | ⚠️ `BIG_DEBT`/`OVERDUE_DEBT` qoidalari yangi nomzodlar oladi — cap tekshirilsin |
| Qo'ng'iroq eslatma cron | `debt/debt-reminder.service.ts:39` (har daqiqa) | ⚠️ `nextContactAt <= now && callRemindedAt = null` ⇒ operatorlarga bildirishnoma. **Mijozga avtomatik xabar YO'Q** (2026-07-23 qarori) — tekshirildi, `lastTgReminderAt` cron'i kodda MAVJUD EMAS (faqat schema maydoni + design hujjat) |
| Qarzdorlar ro'yxati / summary | `debt/debt.service.ts:647,676,2015` | ⚠️ `outstandingMinor`, `debtorCount` o'sadi — bu TO'G'RI (qarz rostdan bor), lekin egasiga oldindan aytilsin |
| Akt-sverka / settlement | `counterparty-settlement/counterparty-settlement.util.ts` | ✅ **O'ZGARMAYDI** — `debtRegistryOutstandingMinor` u yerda «tarkib, qo'shiluvchi EMAS» deb ta'riflangan va `balanceAdopted` qatori uchun bu premise TO'G'RI qoladi |
| POS «Qarz to'lovi» oynasi | `debt/pos-debt-payment.service.ts:99` | ✅ `payableMinor = max(reyestr, balans)` — ikkalasi tenglashadi, son o'zgarmaydi; `unregisteredMinor` 0 ga tushadi (bu ham to'g'ri) va adopsiya yo'li kamdan-kam ishlaydi (`InvoiceOut` kabi boshqa manbalar uchun qoladi) |
| Mijozga Telegram xabari | `retail-sale.service.ts:1257-1260` (`source:'retailsale'`) | ✅ **ikkinchi xabar KETMASLIGI SHART** — yangi qator `applyDelta` CHAQIRMAYDI, demak `source:'debt'` («🛒 Qarzga qo'shildi») yo'li ochilmaydi. Qo'riqchi: `counterparty-debt-notify/debt-source-wiring.test.ts` |
| Balansni qayta hisoblash | `scripts/recompute-counterparty-balances.ts:256` | 🔴 **YORIQ — Q1 da yopiladi**, pastga qarang. A2 unga `PREPAY` manbasini QO'SHADI — unutilsa `APPLY=1` avanslarni yo'q qiladi |
| Smena hisobi (kutilgan naqd) | `cashier-session-reconciliation.ts`, `collectCashInputs` | ⚠️ A1 avansi naqdga **KIRADI** (kassa yashig'iga pul tushdi), A2 `PREPAY` tenderi esa **KIRMAYDI** (`DEBT` bilan bir xil munosabat). Ikkalasi ham `foreign-cash-desk-guard` uslubidagi qo'riqchi bilan qulflansin |
| POS mijoz kartasi | `pos-customer-debt.ts:159-168`, `customer-card-panel.tsx:423` | ⚠️ manfiy balansda hozir `0` ko'rsatadi — A3 buni «Avansi: N» qiladi. Q-fazalar bu ekranga tegmaydi |
| B2B avans moduli | `prepayment/`, `prepayment-return/`, `/prepayments` ekranlari | ✅ **TEGILMAYDI** — u zakazga bog'langan avans; kassa avansi balansda erkin turadi (§2.3 chegarasi) |

### 2.1 🔴 Topilgan MAVJUD yoriq (Q2 dan oldin yopilishi SHART)

`scripts/recompute-counterparty-balances.ts` balansni hujjatlardan qayta
quradi va **ikki manbani ham** qo'shadi:

- `256-263`: `debt.groupBy` → **BARCHA** `Debt.totalMinor` (filtri faqat
  `deletedAt: null` — `balanceAdopted` filtri **YO'Q**);
- `272-…`: `retailSalePayment` `TENDER.debt` qatorlari (POS qarzga sotuvi).

Skript izohi (`265-271`) o'zi shunday deydi: «reyestrga EMAS, shuning uchun
debt-issue bilan ikki marta sanalmaydi». Bu premise **P1 adopsiya qatorlari
uchun ALLAQACHON buzilgan**: adopsiya qatori balansga `+total` yozmagan, lekin
skript uning `totalMinor` ini qo'shadi ⇒ `APPLY=1` bilan yugurtirilsa
mijozning saldosi adopsiya summasiga **shishadi**.

Q2 bu yoriqni har qarzga sotuvda takrorlardi. Shuning uchun **Q1** skriptga
`balanceAdopted: false` filtrini qo'yadi va uni `counterparty-balance-sources.test.ts`
qo'riqchisida qulflaydi.

### 2.2 🔴 KESISHUV QOIDASI — avansi bor mijozga qarzga sotuv

**Bu qoida Q1 da sof funksiya bo'lib yoziladi va Q2 da qo'llanadi. U A-fazalar
qurilmasa ham KERAK** — chunki manfiy balansli mijozlar prodda ALLAQACHON bor
(admin `/cash-in` yo'li orqali).

Muammo: Q2 «qarzga sotilgan summa uchun reyestr qatori ochamiz» deydi. Lekin
mijozning avansi bo'lsa, qarzga sotilgan chek **hech qanday qarz tug'dirmaydi** —
u shunchaki avansni yeydi. Sodda qoida bilan yozilsa, avansi bor mijoz undirish
ro'yxatiga tushib, unga «qarzingizni to'lang» eslatmasi ketardi.

**QOIDA:** reyestr qatorining summasi — chekning qarz ulushi EMAS, balki
**shu chek balansni musbat hududga qanchaga olib kirgani**:

```
registrMinor = max(0, min(debtAmount, balansKeyin))
   bunda   balansKeyin = balansOldin + debtAmount
```

| Balans oldin | Chek qarzi | Balans keyin | Reyestr qatori | Izoh |
|---|---|---|---|---|
| 0 | 300k | +300k | **300k** | oddiy holat |
| +200k | 300k | +500k | **300k** | qarz ustiga qarz |
| −1 000k | 300k | −700k | **qator YO'Q** | avans yedi — qarz yo'q |
| −100k | 300k | +200k | **200k** | avans qisman qopladi |
| `null` (o'lchanmagan) | 300k | — | **300k** | NULL ≠ 0, lekin bu yerda ehtiyotkor tanlov: qator ochiladi va `DebtNote` da «balans o'lchanmagan» qayd etiladi |

⚠️ **Balans QULFLANGAN holda o'qilishi shart** (`FOR UPDATE`, P1 ning
`lockBalance` naqshi) — aks holda ikki parallel chek bir xil «balansOldin» ni
ko'rib ikkalasi ham qator ochmaydi yoki ikkalasi ham to'liq ochadi.
Qulf tartibi P1 bilan bir xil: **BALANS → QARZLAR**.

### 2.3 Chegaralar (bu rejada QILINMAYDI)

- Kassirga operator izohlarini yopish (egasi rad etdi, §1.2).
- `DebtPayment.debtId` ni nullable qilish (P1 da rad etilgan).
- Boshqa hujjat manbalari (`InvoiceOut`, `CashOut`, qo'lda `CounterpartyAdjustment`)
  uchun reyestr qatori ochish — bu reja FAQAT **POS chekidan** kelgan qarzni
  qamraydi. Ular balansda qoladi va POS adopsiyasi orqali to'lanadi (mavjud xulq).
- USD qarz va USD avans. Ikkalasi ham `DEBT_LEDGER_CURRENCY` (so'm) da
  yuritiladi; dollar yashig'idan qarzga/avansga oqim chiqsa — alohida ish.
- **Avansni zakazga (`CustomerOrder`) biriktirish.** Mavjud `Prepayment` moduli
  buni B2B tomonda qiladi; kassa avansi esa mijoz BALANSIDA turadi va istalgan
  chekka ishlatiladi (egasi tasvirlagan oqim aynan shu: «pul berib qo'yishadi,
  keyin tovar olishadi» — qaysi tovar oldindan ma'lum emas).
- Avansga foiz/muddat, avansni boshqa mijozga o'tkazish.

---

## 3. Maqsad-arxitektura

**Qarz tomoni (Q1…Q6):**

```
POS chek (qarzga sotuv)
        │
        ├─ CounterpartyBalance  +debtAmount   (applyDelta, source:'retailsale')  ← O'ZGARMAYDI
        │                                        └─ mijozga Telegram xabari (bir marta)
        │
        └─ Debt reyestri  QRZ-YYYY-NNNNN     ← Q2 DA QO'SHILADI
             totalMinor     = §2.2 KESISHUV QOIDASI (avans hisobga olinadi!)
             balanceAdopted = true            (balansga QAYTA yozmaydi)
             sourceDocType  = 'retailsale'    (Q1 migratsiyasi)
             sourceDocId    = <sale.id>       (unique — idempotentlik + vozvrat manzili)
             nextContactAt  = post + 14 kun   (Q1 sof qoidasi; NULL emas!)
                  │
                  ├─→ undirish ro'yxati (MK16)      ✅ o'z-o'zidan
                  ├─→ bugungi qo'ng'iroqlar          ✅ o'z-o'zidan
                  ├─→ eslatma (SMS/Telegram)         ✅ o'z-o'zidan
                  └─→ POS FIFO to'lovi               ✅ o'z-o'zidan
```

**Avans tomoni (A1…A3) — yangi pul-yo'li OCHILMAYDI:**

```
1) QABUL (A1)   mijoz kassaga 1 000 000 beradi
     CashDesk         +1 000 000   (MoneyService — mavjud yo'l)
     CounterpartyBalance −1 000 000 (applyDelta — mavjud yo'l, docType 'cashIn')
     smena kutilgan naqdiga KIRADI · PKO cheki bosiladi
     ⚠️ Debt reyestriga TEGMAYDI (bu qarz emas)

2) SARFLASH (A2)  300 000 lik tovar «avansdan» tenderi bilan
     CashDesk          o'zgarmaydi   ← pul allaqachon kirgan
     CounterpartyBalance +300 000     (−1 000k → −700k)
     RetailSalePayment  method='PREPAY'
     sale.payedSumMinor += 300 000    ← chek TO'LANGAN (DEBT dan asosiy farq)
     ⚠️ Debt reyestriga TEGMAYDI

3) KO'RSATISH + QAYTARISH (A3)
     mijoz kartasida «Avans qoldig'i» · tarix · qolganini naqd qaytarish
```

**Besh invariant** (har fazada testda qulflanadi):

1. **Balansga IKKI MARTA yozilmaydi** — chekdan tug'ilgan qator
   `balanceAdopted = true` va hech qachon `applyDelta(+total)` chaqirmaydi.
2. **Simmetriya** — vozvrat/tahrir balansdan `−` yozganda reyestr qatori ham
   AYNAN shuncha kamayadi (`remove()` ning `balanceAdopted` qoidasi bilan bir intizom).
3. **Idempotentlik** — bitta chek uchun ko'pi bilan bitta reyestr qatori
   (`@@unique([accountId, sourceDocType, sourceDocId])`).
4. **Avans qarz emas** — manfiy balansdan hech qachon `Debt` qatori tug'ilmaydi
   (§2.2), ya'ni avansi bor mijoz undirish ro'yxatiga TUSHMAYDI.
5. **Avans o'zidan ortiq sarflanmaydi** — `PREPAY` tenderi `min(summa, −balans)`
   bilan chegaralangan; ortig'i jimgina qarzga aylanmaydi, 400 bilan rad etiladi.

---

## 4. FAZALAR

Har faza oxirida agent **TO'XTAYDI**. Keyingi fazani BOSHLAMAYDI.

**To'qqiz faza, ikki oqim:**

| Faza | Nima beradi | Nimadan keyin bo'lishi SHART |
|---|---|---|
| **Q1** | poydevor: migratsiya + sof qoidalar (§2.2 kesishuv ham) + §2.1 yorig'i | — (birinchi) |
| **Q2** | chekdan reyestr qatori (asosiy funksiya) | Q1 |
| **Q3** | vozvrat/tahrir simmetriyasi | Q2 |
| **Q4** | undirish ekranida manba + muddat sozlamasi | Q3 |
| **Q5** | tarixiy backfill (🔴 jonli) | Q4 |
| **Q6** | jonli verify + hujjatlashtirish | Q5 |
| **A1** | kassada avans QABUL qilish | Q1 (boshqa Q-fazalarga bog'liq emas) |
| **A2** | avansdan to'lash (`PREPAY` tender) | **A1 va Q2** (kesishuv qoidasi ishlab turishi shart) |
| **A3** | avansni ko'rsatish, tarix, qaytarish | A2 |

**Tavsiya etilgan tartib:** Q1 → Q2 → Q3 → **A1 → A2 → A3** → Q4 → Q5 → Q6.
Sabab: A-fazalar egasining KUNDALIK ishini bloklab turibdi («ishlay
olmayapmiz»), Q4–Q6 esa allaqachon ishlayotgan narsani chiroyliroq qiladi.
Q5 (backfill) ataylab eng oxirida — u eng riskli va u paytga kelib §2.2
kesishuv qoidasi jonlida sinalgan bo'ladi.

Agent O'Z fazasining «Nimadan keyin» ustunidagi shart bajarilmaganini ko'rsa —
**ishni boshlamaydi**, buni aytadi va to'xtaydi (qoida 11).

---

### Q1 — Poydevor: hujjat-manba bog'lami, sof qoidalar, ikki-karra yorig'ini yopish

**Maqsad:** Q2 uchun poydevor + §2.1 dagi mavjud yoriqni yopish.
**Xulq O'ZGARMAYDI** — hech kim hali yangi ustunga yozmaydi.

**Vazifalar:**
1. **Migratsiya** (idempotent DDL, qoida 7): `Debt` ga
   `sourceDocType String? @db.VarChar(32)` + `sourceDocId String? @db.Uuid`
   va `@@unique([accountId, sourceDocType, sourceDocId])`.
   Prisma sxemasiga ustunlar + to'liq izoh (nega kerak, `balanceAdopted` bilan
   munosabati). Migratsiya nomi: `2026MMDDHHMMSS_debt_source_doc`.
   ⚠️ Nullable ustunlarda Postgres unique indeksi NULL larni takrorlanuvchi
   sanamaydi — mavjud qatorlar (`NULL, NULL`) buzilmaydi; buni testda ham,
   hisobotda ham yozma tasdiqla.
2. **Sof modul** `apps/api/src/modules/debt/sale-debt-registry.ts` (DB yo'q,
   Nest yo'q, `Date.now()` yo'q — «hozir» argument):
   - `planSaleDebtRow(input, now)` — chekdan qanday qator tug'ilishi
     (`totalMinor`, `nextContactAt`, `comment`, `balanceAdopted: true`);
   - `saleDebtDueAt(postedAt, termDays)` — muddat qoidasi. **NULL qaytarmaydi**:
     muddatsiz qator undirish ro'yxatida `no_due_date` chelagiga tushib
     «kechikkan deb isbotlanmagan» bo'lib oxirida qolardi va cron ham
     ko'rmasdi (`debt-reminder.service.ts:47` — `nextContactAt: { lte: now }`).
     Default muddat **14 kun** (egasi boshqasini aytmaguncha), Toshkent kalendar
     kuni bo'yicha, soat 09:00 — mavjud `todayAt9InputValue` odati bilan bir xil;
   - `planSaleDebtDelta(oldRemaining, newRemaining)` — Q3 uchun tahrir/vozvrat
     deltasini hisoblash qoidasi (bu yerda yoziladi, Q3 da ishlatiladi);
   - 🔴 **`receivablePortion(balanceBefore, debtAmount)`** — **§2.2 KESISHUV
     QOIDASI**: `max(0, min(debtAmount, balanceBefore + debtAmount))`.
     `balanceBefore = null` (o'lchanmagan) ⇒ to'liq `debtAmount` (NULL ≠ 0,
     lekin bu yerda ehtiyotkor tanlov — sabab §2.2 jadvalida).
     **Bu funksiya A-fazalar qurilmasa ham KERAK**: manfiy balansli mijozlar
     prodda allaqachon bor (`/cash-in` admin yo'li), va usiz Q2 avansi bor
     mijozni undirish ro'yxatiga qo'yib, unga eslatma yuborardi.
     §2.2 jadvalidagi BESH qatorning har biri alohida test bo'lsin.
3. **🔴 §2.1 yorig'ini yopish:** `scripts/recompute-counterparty-balances.ts:256`
   dagi `debt.groupBy` ga `balanceAdopted: false` filtri.
   `scripts/counterparty-balance-sources.ts` va uning testi
   (`counterparty-balance-sources.test.ts`) ham shu haqiqatni aytsin.
   Hisobotda: bu yoriq **P1 dan beri mavjud edi**, `APPLY=1` bilan skript
   yugurtirilgan bo'lsa saldolar shishgan bo'lishi mumkin — jonlida
   yugurtirilgan-yugurtirilmagani TEKSHIRILSIN va natija yozilsin.
4. **Testlar:** sof modul uchun to'liq test fayli (muddat qoidasi — kalendar
   kuni, oy/yil chegarasi, `null` kirish); `recompute` qo'riqchisiga yangi
   holat (`balanceAdopted` qatori qo'shilmasligi); migratsiya idempotentligi.

**Qabul mezoni:** migratsiya lokal dev bazada ikki marta yugurtirilganda ham
xatosiz; `balanceAdopted` qatori bo'lgan mijozda `recompute` (DRY-RUN) endi
farq ko'rsatmaydi; api testlari to'liq yashil; xulq o'zgarmagani — POS va
undirish ekranlarida hech qanday yangi qator yo'q.

**PROMPT (yangi sessiyaga ko'chirib qo'ying):**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (barcha hisobotlar bilan), shuningdek
docs/plans/2026-08-23-ombor-restrukturizatsiya.md ning 2-bo'limini (o'zgarmas
qoidalar 1-14). Sen Q1 fazasini bajarasan: Debt ga sourceDocType/sourceDocId
migratsiyasi, sale-debt-registry.ts sof moduli va recompute-counterparty-balances
dagi balanceAdopted yorig'ini yopish. Faqat Q1 vazifalari, testlar, hisobot shu
faylning «Hisobotlar» bo'limiga — va TO'XTA. Q2 ni BOSHLAMA.
```

---

### Q2 — Chekdan reyestr qatori: `post()` yozuvchisi

**Maqsad:** kassadan qarzga sotilgan chek undirish ro'yxatida darhol ko'rinsin.
**Bu — rejaning asosiy funksiyasi.**

**Vazifalar:**
1. `retail-sale.service.ts#post` ichidagi mavjud
   `if (debtAmount > 0n && debtAgentId)` blokiga (hozir 1246-1282) reyestr
   qatorini yozish — **AYNAN o'sha tranzaksiyada**, balans deltasidan keyin:
   - 🔴 **`totalMinor` — `debtAmount` EMAS**, Q1 ning
     `receivablePortion(balansOldin, debtAmount)` natijasi (§2.2 kesishuv
     qoidasi). **Natija 0 bo'lsa qator UMUMAN ochilmaydi** — avansi bor mijoz
     undirish ro'yxatiga tushmaydi (invariant 4);
   - 🔴 **balans QULFLAB o'qiladi** (`FOR UPDATE`, P1 ning `lockBalance`
     naqshi) va tartib **BALANS → QARZLAR** — ikki parallel chek bir xil
     «balansOldin» ni ko'rmasin. Qulf `applyDelta` dan OLDIN olinadi;
   - raqam `QRZ-YYYY-NNNNN`, `allocateDocumentNumber` orqali (race-safe;
     `pos-debt-payment.service.ts:746-755` naqshi);
   - `balanceAdopted: true`, `applyDelta` **CHAQIRILMAYDI**;
   - `sourceDocType:'retailsale'`, `sourceDocId: sale.id`;
   - `nextContactAt` — Q1 ning `saleDebtDueAt` idan;
   - `ownerId`/`issuedById` — chekni post qilgan kassir;
   - `currency` — `DEBT_LEDGER_CURRENCY` (kassa valyutasi so'm bo'lishi
     tekshiriladi; boshqa valyutada qator OCHILMAYDI va bu **jimgina emas** —
     ogohlantirish logi + hisobotda qayd, §2.3 chegarasi);
   - `DebtNote` (`kind:'debt_issue'`) — «bu qator qayerdan paydo bo'ldi»
     (`adoptBalanceDebt:775-784` naqshi). Matn chekning raqamini o'z ichiga olsin.
2. **Idempotentlik:** unique konflikt (`P2002`) tutiladi va qayta yozishga
   urinmaydi — post takrorlansa ikkinchi qator tug'ilmaydi.
3. **`retail-sale.service.ts:1241-1245` va `pos-customer-debt.ts` sarlavha
   izohlarini YANGILASH.** Ular hozir «reyestrga ATAYLAB yozmaymiz» deydi —
   bu qaror shu fazada o'zgaradi. Eski matn tarixi saqlanadi (P1 uslubi:
   «🔴 … BEKOR QILINDI, sabab…»), aks holda keyingi o'quvchi kodni izohga
   qarab «tuzatib» qo'yadi.
4. **Testlar (kamida):**
   - qarzga sotuv → reyestrda 1 qator, `balanceAdopted=true`,
     `sourceDocId=sale.id`, `nextContactAt` NULL EMAS;
   - **balansga IKKI MARTA yozilmadi** — `applyDelta` argumentlari AYNAN
     bitta `+debtAmount` (invariant 1);
   - mijozga Telegram xabari BIR MARTA (`source:'retailsale'` wiring testi
     buzilmadi);
   - to'liq naqd chek → reyestr qatori YO'Q;
   - mijozsiz qarz (`debtAgentId` yo'q) → mavjud 400 xulqi o'zgarmadi;
   - idempotentlik: bir xil `sourceDocId` bilan ikkinchi urinish qator qo'shmaydi;
   - undirish ro'yxati (`DebtCollectionService.list`) yangi qatorni qaytaradi;
   - 🔴 **kesishuv (§2.2), har uch holat alohida test:** avansi qarzdan KATTA
     mijoz → qator YO'Q va u undirish ro'yxatida CHIQMAYDI; avansi qisman
     qoplagan mijoz → qator FAQAT qolgan qismga; balansi `null` mijoz → to'liq
     qator + `DebtNote` da «balans o'lchanmagan» qaydi;
   - balans qulfi `applyDelta` dan OLDIN olinishi (kod shakli testi,
     `foreign-cash-desk-guard.test.ts` uslubidagi qo'riqchi).

**Qabul mezoni:** jonlida sinov-chek qarzga post qilinadi → menejer «Qarz
undirish» ekranida (`/menejer/undirish`) o'sha mijoz `upcoming` chelagida
muddati bilan chiqadi → kontragent balansi AYNAN bir marta o'sgan (ikki emas)
→ POS «Qarz to'lovi» oynasida `payableMinor` o'zgarmagan → **manfiy balansli
(avansi bor) sinov mijoziga qarzga sotuv reyestr qatori OCHMAGANI tekshiriladi**
→ chek storno (`refund`) bilan qaytariladi va §Q3 gacha vaqtincha reyestr
qatori qo'lda tozalanadi (sinov izini qoldirmaslik uchun — buyrug'i hisobotda).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (Q1 hisoboti bilan birga), docs/plans/2026-08-23-ombor-restrukturizatsiya.md
ning 2-bo'limini ham. Sen Q2 fazasini bajarasan: retail-sale post() qarzga
sotuvda Debt reyestriga balanceAdopted qator ochsin — balansga qayta yozmasdan,
idempotent, sourceDocId=sale.id, summasi §2.2 KESISHUV QOIDASI bo'yicha
(avansi bor mijozga qator OCHILMAYDI), balans FOR UPDATE bilan qulflanadi.
Faqat Q2 vazifalari, testlar, jonli tekshiruv, hisobot shu faylga — va TO'XTA.
Q3 ni BOSHLAMA.
```

---

### Q3 — Simmetriya: vozvrat va chek tahriri reyestrni ham harakatlantirsin

**Maqsad:** invariant 2. Balans `−` olganda reyestr ham AYNAN shuncha kamaysin,
aks holda undirish ro'yxati qaytarilgan tovar uchun pul talab qilib turadi.

**Vazifalar:**
1. **`refund()`** (`retail-sale.service.ts:1735`, `debtReturn > 0n && debtorId`
   bloki ~2228): `sourceDocId = original.id` bo'yicha reyestr qatorini topib
   `totalMinor` ni `debtReturn` ga kamaytirish. Qoidalar:
   - qoldiq 0 ga tushsa — `status:'paid'`, `closedAt`, `nextContactAt: null`
     (`debt.service` §3.6 odati);
   - allaqachon **to'langan qism** bo'lsa (`paidMinor > 0`) — `totalMinor` dan
     ayirish `paidMinor` dan pastga tushmasin; tushsa bu **haqiqiy nizo** ⇒
     400 emas, balki qatorni `paidMinor` ga tekislab, `DebtNote` bilan
     ochiq qayd (mijoz to'lagan pulni yo'q qilib bo'lmaydi);
   - qator topilmasa (Q2 dan OLDIN post qilingan eski chek) — **jimgina
     o'tmaydi**: log + `DebtNote` yo'q, lekin hisobotda sanaladi. Balans
     baribir `−` oladi (mavjud xulq buzilmaydi).
2. **`edit()`** (`retail-sale.service.ts:1563`, `-oldDebt` / `+debtMinor`
   bloki ~1650-1673): reyestr qatorini yangi qarz summasiga moslash.
   Agent o'zgarsa — eski mijozning qatori yopiladi, yangisiga qator ochiladi
   (Q2 yozuvchisi qayta ishlatiladi).
3. **`cancel()`** (`retail-sale.service.ts:1362`) — **tekshirilsin va
   hisobotda yozma javob berilsin**: u faqat post qilinmagan cheklarga
   (`draft/picking/ready`) tegadi, ya'ni qarz hali tug'ilmagan ⇒ o'zgarish
   KERAK EMAS. Agar tekshiruv aksini ko'rsatsa — tuzatiladi.
4. **Testlar:** to'liq vozvrat → qator `paid`; qisman vozvrat → `totalMinor`
   kamaydi, `unpaid/partial` qoldi; to'langan qarzga vozvrat → `paidMinor` dan
   pastga tushmadi + `DebtNote` yozildi; tahrirda summa o'zgardi; agent
   o'zgarganda eski yopilib yangisi ochildi; qatorsiz eski chek — vozvrat
   BUZILMADI; balans deltasi va reyestr deltasi **AYNAN teng** (invariant 2).

**Qabul mezoni:** jonlida sinov-chek qarzga post → undirish ro'yxatida chiqadi
→ to'liq vozvrat → ro'yxatdan yo'qoladi VA balans nolga qaytadi (ikkalasi
birga). Qisman vozvratda ikkala daftardagi qoldiq bir xil son.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (Q1+Q2 hisobotlari bilan). Sen Q3 fazasini bajarasan: refund() va
edit() yo'llarida chekdan tug'ilgan Debt reyestr qatorini balans bilan simmetrik
harakatlantirish, cancel() ni tekshirish. Faqat Q3 vazifalari, testlar, jonli
tekshiruv, hisobot shu faylga — va TO'XTA. Q4 ni BOSHLAMA.
```

---

### A1 — Kassada AVANS qabul qilish (oldindan to'lov)

**Bog'liqlik:** Q1 tugagan bo'lsin (kesishuv qoidasi sof modulda). Q2/Q3 ga
bog'liq EMAS — parallel sessiyada bajarilishi mumkin.

**Maqsad:** mijoz kassaga oldindan pul qoldirsa, kassir uni tizimga kirita
olsin; pul kassa yashig'iga va smena hisobiga to'g'ri tushsin.

**Vazifalar:**
1. **Endpoint** `POST /cashier-sessions/:id/customer-prepay`
   (G1 ning `customer-payout` naqshi — u kassadan pul CHIQARADI, bu esa
   KIRITADI; ikkalasi bir xil skelet, teskari ishora):
   - `counterpartyId` + `sumMinor` + ixtiyoriy izoh;
   - `CashDesk.balanceMinor` **+summa** (`MoneyService.applyDeltas`,
     `documentKind:'cash_in'` yoki yangi `prepay` — mavjud `docType`
     lug'atidan tanlanadi, yangisi kerak bo'lsa
     `counterparty-balance-doc-types.ts` ga qo'shiladi);
   - `CounterpartyBalance` **−summa** (`applyDelta`) — «biz qarzdormiz»;
   - joriy smenaning **kutilgan naqdiga KIRADI** (`collectCashInputs` /
     `expectedCashMinor` — G1 payout qanday `−` bo'lgan bo'lsa, bu `+`);
   - Z-hisobotda alohida qator (`prepayMinor`);
   - `CashierAuditEvent` yoziladi;
   - **`Debt` reyestriga TEGMAYDI** (invariant 4) — bu qarz emas.
2. **Hujjat va chek:** PKO (prixodniy order) cheki — mijoz nomi, summa,
   «Avans sifatida qabul qilindi» qatori, imzo joyi. Mavjud `/print/cash-in`
   yoki `cash-out` chek shabloni naqshidan.
3. **POS oynasi:** mijoz kartasida «Avans qabul qilish» tugmasi → summa →
   POST → chek chop → kartani invalidate.
4. **Ruxsat va kiosk:** kassir roliga tegishli permission, `KIOSK_ALLOWED` ga
   yangi marshrut. ⚠️ **`/cash-in` prefiksi ochilmaydi** — u butun ПКО
   daraxtini (allokatsiyalar, bekor qilish, boshqa mijozlar) kioskka ochardi;
   `kiosk-policy.ts:134-146` dagi «to'rt aniq qator» saboqi aynan shu haqda.
5. **Storno:** noto'g'ri kiritilgan avansni qaytarish yo'li — `cancel`
   (o'sha smena ichida) yoki A3 dagi «avansni qaytarish». Qaysi biri
   tanlanganini hisobotda asoslab yoz.
6. **Testlar:** balans `−` va kassa `+` AYNAN bir summaga; smena kutilgan
   naqdi o'sdi; `Debt` qatori TUG'ILMADI; yopiq/begona smenaga 400; poyga
   (ikki parallel so'rov) — ikki hujjat, ikki delta, hisob to'g'ri; manfiy
   yoki nol summa 400; kiosk allowlist qo'riqchisi.

**Qabul mezoni:** jonlida sinov-mijozga 100 000 avans kiritiladi → kassa
qoldig'i +100 000 → mijoz balansi −100 000 → smena «kutilgan naqd» +100 000 →
PKO cheki bosiladi → **mijoz undirish ro'yxatida CHIQMAYDI** (invariant 4) →
smena yopilganda kamomad/ortiqcha **0**.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (avvalgi hisobotlar bilan), docs/plans/2026-08-23-ombor-restrukturizatsiya.md
ning 2-bo'limini ham. Sen A1 fazasini bajarasan: kassada mijozdan AVANS
(oldindan to'lov) qabul qilish — POST /cashier-sessions/:id/customer-prepay,
kassa +summa / mijoz balansi −summa, smena kutilgan naqdiga kirsin, PKO cheki,
POS oynasi, kiosk allowlist (/cash-in prefiksini OCHMA). Debt reyestriga
TEGMAYDI. Faqat A1 vazifalari, testlar, jonli tekshiruv, hisobot shu faylga —
va TO'XTA. A2 ni BOSHLAMA.
```

---

### A2 — Avansdan to'lash: yangi `PREPAY` tenderi

**Bog'liqlik:** **A1 VA Q2 tugagan bo'lsin.** Q2 tugamagan bo'lsa §2.2 kesishuv
qoidasi jonlida sinalmagan bo'ladi va avansi bor mijozga qarz qatori ochilib
qolishi mumkin.

**Maqsad:** avansi bor mijoz tovar olganda kassir uni «avansdan» to'lay olsin —
naqd qayta olmasdan, qarzga yozmasdan.

**Vazifalar:**
1. **Tender:** `retail-tenders.ts` ga `prepay: 'PREPAY'` va `computeTenders`
   ga `prepayMinor`. Qoidalar:
   - `payedSumMinor` ga **KIRADI** (`DEBT` dan asosiy farq — tovar to'langan;
     `retail-sale.service.ts:905` dagi `total - debtAmount` formulasi shuni
     hisobga oladigan qilib yangilanadi);
   - **qaytim BERILMAYDI** — avansdan ortiqcha to'lov qaytim bermaydi
     (mavjud «qaytim faqat naqddan» qoidasi bilan bir intizom);
   - `prepay + boshqa tenderlar` aralash chek ishlaydi (avansi yetmasa
     qolganini naqd/karta bilan).
2. **Server guard:** `prepayMinor ≤ −balansOldin` (ya'ni mavjud avansdan
   ortiq emas). Balans **QULFLAB** o'qiladi (Q2 bilan bir xil naqsh va bir
   xil tartib: BALANS → QARZLAR). Ortiq bo'lsa **400** — jimgina qarzga
   aylanmaydi (invariant 5). Xato matni kassirga aniq son bilan aytsin.
3. **`post()` da:** `CounterpartyBalance` **+prepayMinor**;
   `RetailSalePayment` qatori `method:'PREPAY'`; **`Debt` reyestriga
   TEGILMAYDI**. Mijozga Telegram xabari — bu «qarzga qo'shildi» EMAS,
   shuning uchun `source` tanlovi ehtiyotkorlik bilan qilinadi va
   hisobotda asoslanadi.
4. **POS to'lov oynasi:** «Avansdan» tugmasi — faqat mijoz biriktirilgan VA
   avansi bor bo'lganda faol; yonida mavjud avans qoldig'i; default summa
   `min(chek qoldig'i, avans)`.
5. **Smena/Z-hisobot:** `PREPAY` **naqd EMAS** — kutilgan naqdga
   KIRMAYDI (`DEBT` bilan bir xil munosabat). Z-hisobotda alohida qator.
   ⚠️ `collectCashInputs` va `collectUsdCashInputs` tekshirilsin —
   yangi tender ularga sizib kirmasin.
6. **Vozvrat:** `PREPAY` bilan to'langan chek qaytarilganda pul mijoz
   balansiga QAYTADI (`−prepayReturn`), naqd berilmaydi. `refund()` ning
   mavjud `debtReturn` naqshi bilan bir xil skelet.
7. **`recompute-counterparty-balances.ts` ga yangi manba:** `PREPAY` tender
   qatorlari (`retail-credit` naqshi, `+amountMinor`). **Bu unutilsa
   `APPLY=1` avanslarni yo'q qiladi** — §2.1 saboqining aynan takrori.
   `counterparty-balance-sources.test.ts` qo'riqchisiga yangi holat.
8. **Testlar:** to'liq avansdan to'lov; qisman (avans + naqd); avansdan
   ortiq → 400; avansi yo'q mijozda tugma faol emas; `payedSumMinor` to'g'ri
   (chek TO'LANGAN); smena kutilgan naqdi O'ZGARMADI; `Debt` qatori
   TUG'ILMADI; vozvratda balans qaytdi; `recompute` DRY-RUN farq ko'rsatmadi;
   poyga: ikki parallel chek bitta avansni ikki marta sarflay olmaydi.

**Qabul mezoni:** jonlida avansi 100 000 bo'lgan sinov-mijozga 60 000 lik
chek «avansdan» to'lanadi → kassa qoldig'i O'ZGARMAYDI → mijoz balansi
−40 000 ga keladi → chek `posted` va TO'LIQ to'langan → smena kamomadi 0 →
mijoz undirish ro'yxatida CHIQMAYDI → 60 000 dan ortiq urinish 400 beradi.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (Q1..Q3 va A1 hisobotlari bilan). Sen A2 fazasini bajarasan: yangi
PREPAY tenderi — avansdan to'lash. Chek TO'LANGAN sanaladi, kassa naqdi
o'zgarmaydi, mijoz balansi +summa, avansdan ortig'i 400 bilan rad etiladi,
Debt reyestriga tegilmaydi, recompute skriptiga yangi manba QO'SHILADI.
A1 va Q2 tugaganini avval tekshir — tugamagan bo'lsa boshlamay to'xta.
Faqat A2 vazifalari, testlar, jonli tekshiruv, hisobot shu faylga — va TO'XTA.
A3 ni BOSHLAMA.
```

---

### A3 — Avansni ko'rsatish, tarixi va qaytarish

**Bog'liqlik:** A2 tugagan bo'lsin.

**Maqsad:** kassir ham, menejer ham mijozning avansini KO'RSIN; mijoz
qolganini qaytarib olmoqchi bo'lsa — yo'li bo'lsin.

**Vazifalar:**
1. **POS mijoz kartasi:** hozir yagona yirik son `payableMinor`, u manfiy
   balansda `0` chiqadi (`pos-customer-debt.ts:159-168`) — ya'ni ekran
   avansni **umuman ko'rsatmaydi**. Endi karta ikki holatdan BIRINI
   ko'rsatsin: «Qarzi: N» (balans > 0) yoki **«Avansi: N»** (balans < 0).
   Bitta yirik son qoidasi (P2 falsafasi) buzilmasin — ishora bo'yicha
   yorliq va rang o'zgaradi, ikkinchi raqam qo'shilmaydi.
   ⚠️ `balanceMinor === null` («o'lchanmagan») uchinchi holat bo'lib qoladi.
2. **Sof modul:** `pos-customer-debt.ts` ga `customerStanding(balanceMinor,
   registryOutstanding)` — `'debt' | 'prepaid' | 'settled' | 'unmeasured'`
   va tegishli summa. Ekran ham, server ham AYNAN shundan yuradi.
3. **Avans tarixi:** mavjud `GET /debts/pos/history/:cpId` (P2) balans
   jurnalidan o'qiydi va yangi `docType` larni AVTOMATIK ko'rsatadi
   (`journalWhere()` da `docType` filtri ataylab yo'q) — **tekshirilsin va
   hisobotda yozma tasdiqlansin**; yorliqlar (i18n doc-type xaritalari,
   3 joyda) qo'shilsin.
4. **Avansni qaytarish:** `POST /cashier-sessions/:id/customer-prepay-refund`
   — kassa `−summa`, mijoz balansi `+summa`, cap = mavjud avans, RKO cheki.
   G1 ning `customer-payout` skeletidan.
5. **Menejer tomoni:** kontragentlar ro'yxatida/kartasida «avansi bor
   mijozlar» ko'rinsin (mavjud balans ustuni ishorasidan; yangi hisobot
   qurilmaydi). Undirish ekranida bu mijozlar CHIQMASLIGI — Q4 filtri bilan
   ziddiyat yo'qligi tekshirilsin.
6. **i18n ru + uz**, gate'lar yashil.
7. **Testlar:** sof modul (to'rt holat), karta ko'rinishi (qarz / avans /
   o'lchanmagan), qaytarish cap va poyga, tarixda avans qatorlari ko'rinishi.

**Qabul mezoni:** jonlida avansi bor sinov-mijoz kartasida «Avansi: N»
ko'rinadi, tarixda kirim va sarf qatorlari bor, qolgan avans naqd qaytariladi
va balans nolga keladi; qarzi bor mijozda karta AVVALGIDEK «Qarzi» ni
ko'rsatadi (regressiya yo'q).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (Q1..Q3, A1, A2 hisobotlari bilan). Sen A3 fazasini bajarasan:
POS mijoz kartasida avansni ko'rsatish (customerStanding sof moduli), avans
tarixi yorliqlari, avansni naqd qaytarish endpointi, menejer tomoni, i18n ru/uz.
A2 tugaganini avval tekshir. Faqat A3 vazifalari, testlar, jonli tekshiruv,
hisobot shu faylga — va TO'XTA.
```

---

### Q4 — Undirish ekranida MANBA va muddat siyosati

**Maqsad:** menejer «bu qarz qayerdan keldi» ni ko'rsin va kassa qarzlarini
ajratib ishlay olsin; muddat sozlanadigan bo'lsin.

**Vazifalar:**
1. **Server:** `CollectionRow` ga `source` maydoni (`'registry' | 'retailsale'`,
   `Debt.sourceDocType` dan) va `sourceDocNumber` (chek raqami) —
   `debt-collection.ts` sof moduli + `debt-collection.service.ts` o'qishi.
   `CollectionQuery` ga `source` filtri. Sof qoidalar `debt-collection.ts` da,
   I/O `…service.ts` da — mavjud bo'linish buzilmaydi.
2. **Ekran** `apps/web/src/app/(app)/menejer/undirish/page.tsx`: qatorda manba
   belgisi (Badge) + chek raqami havolasi (`/retail-sales/:id` yoki mavjud
   marshrut), sarlavhada manba filtri. `EmptyState` matni ham manbaga qarab.
3. **Qarzdorlar ro'yxati** (`/debts`) va `DebtRow` (`apps/web/src/lib/debt-api.ts`)
   ham shu belgini ko'rsatsin — menejer ikki ekranda bir xil haqiqatni ko'rsin.
4. **Muddat sozlamasi:** Q1 dagi 14-kunlik default akkaunt sozlamasiga chiqsin
   (mavjud `settings` moduli naqshi bilan; yangi jadval ochilmasin).
   Sozlama yo'q bo'lsa — Q1 defaulti. Sozlama ekrani: mavjud sozlamalar
   bo'limiga bitta maydon.
5. **i18n ru + uz** — barcha yangi matnlar; `i18n-key-existence` va
   `i18n-no-hardcoded` gate'lari yashil.
6. **Testlar:** server filtri (manba bo'yicha), sof modul (`source` ko'chishi),
   web sahifa testi (belgi ko'rinishi, filtr ishlashi), sozlama defaulti.

**Qabul mezoni:** jonlida menejer undirish ekranida kassa qarzlarini filtrlab
ko'radi, har qatorda chek raqami bor; muddat sozlamasi o'zgartirilganda YANGI
cheklar o'sha muddat bilan tug'iladi (eskilariga tegmaydi).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (avvalgi BARCHA hisobotlar bilan). Sen Q4 fazasini bajarasan: undirish
ro'yxati va qarzdorlar ekranida qarz MANBASINI ko'rsatish + filtr + kassa qarzi
muddati sozlamasi, i18n ru/uz. Faqat Q4 vazifalari, testlar, jonli tekshiruv,
hisobot shu faylga — va TO'XTA. Q5 ni BOSHLAMA.
```

---

### Q5 — 🔴 Tarixiy qarzlarni reyestrga olib kirish (jonli backfill)

**Maqsad:** Q2 gacha post qilingan cheklardan qolgan balans-qarzlari ham
undirish ro'yxatiga tushsin.

> 🔴 **BU FAZA JONLI MA'LUMOTGA TEGADI.** Boshlashdan oldin
> `docs/plans/2026-08-24-split-kassa-hodisasi.md` o'qiladi. Qoida 12
> (teskari skript) va 13 (uchma-uch smoke) MAJBURIY.
>
> ⚠️ `pos-customer-debt.ts:137-141` ogohlantirishi aynan shu faza haqida:
> «butun qoldiqni adopsiya qilsak … qarzdorlar ro'yxati / eslatma cron /
> Telegram oqimi kutilmaganda portlardi». Shuning uchun quyidagi cheklovlar
> MAJBURIY.

**Vazifalar:**
1. **O'lchash (avval, APPLY'siz):** nechta kontragentda reyestrdan tashqari
   qarz bor, jami summa qancha, eng eski chek qachon. Chiqish hisobotga
   TO'LIQ ko'chiriladi. Manba: `retailSalePayment` `TENDER.debt` qatorlari
   (post qilingan cheklar) — Q1 dagi `sourceDocId` bo'yicha allaqachon
   qatori borlari chiqarib tashlanadi.
2. **Skript** `apps/api/src/scripts/ops-q5-backfill-sale-debts.ts`:
   - **DRY-RUN default**, `APPLY=1` bilan yozadi (repo odati);
   - `LIMIT` va `ONLY_CP` argumentlari — **bosqichma-bosqich** yuritish
     (birinchi yugurish 1 kontragent, so'ng 10, so'ng qolgani);
   - har qator: Q2 yozuvchisi bilan **AYNAN bir xil** shakl
     (`balanceAdopted:true`, `sourceDocType/sourceDocId`, `DebtNote`);
   - **`nextContactAt` — eski cheklar uchun `now + N kun`**, chek sanasidan
     EMAS. Sabab: chek sanasidan hisoblansa hamma qator birdan `overdue`
     bo'lib eslatma cron'iga bir vaqtda tushardi (aynan «portlash»).
     Bosqichma-bosqich sanalar (masalan har 50 qator uchun +1 kun) — skript
     parametri;
   - `problem: false`, `ownerId: null` (javobgar keyin qo'yiladi — undirish
     ekrani «javobgarsiz» ni ochiq ko'rsatadi).
3. **Teskari skript** (qoida 12) `ops-q5-backfill-rollback.ts`: aynan shu
   backfill ochgan qatorlarni (`sourceDocType='retailsale'` + `DebtNote`
   belgisi + yaratilgan oyna) o'chiradi. ⚠️ `balanceAdopted` qatori
   o'chirilganda balansga `−total` **YOZILMAYDI** (schema izohi). To'lov
   tushib ulgurgan qator o'chirilmaydi — ular ro'yxatga chiqadi.
   Lokal dev bazada sinaladi, buyrug'i hisobotda.
4. **Eslatma cron'ini muzlatish:** backfill yugurayotgan oynada operator
   bildirishnomalari toshqini bo'lmasligi uchun — `nextContactAt` ni
   kelajakka qo'yish (2-band) buni o'zi hal qiladi; qo'shimcha chora
   KERAKMI degan savolga hisobotda yozma javob.
5. **Testlar:** skript sof qismlari (taqsimot, sana zinapoyasi, allaqachon
   qatori borlarni o'tkazib yuborish), teskari skript qamrovi.

**Qabul mezoni (qoida 11 — hammasi bajarilmasa faza YOPILMAYDI):**
1. DRY-RUN chiqishi hisobotda;
2. lokal dev bazada backfill + rollback ikkalasi ham ishladi;
3. jonlida **avval 1 kontragent** — undirish ro'yxatida chiqdi, balansi
   O'ZGARMADI, POS `payableMinor` O'ZGARMADI;
4. uchma-uch smoke (qoida 13): sinov sotuv post→tekshir→cancel, bitta
   yacheyka sanash, bitta ko'chirish — hammasi ishlaydi;
5. keyin qolgan kontragentlar bosqichma-bosqich;
6. `recompute-counterparty-balances` DRY-RUN backfill'dan keyin ham farq
   ko'rsatmaydi (Q1 filtri ishlayotganining isboti);
7. javobgar shaxs va vaqt hisobotda yozilgan.

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (avvalgi BARCHA hisobotlar bilan), docs/plans/2026-08-24-split-kassa-hodisasi.md
ni va docs/plans/2026-08-23-ombor-restrukturizatsiya.md ning 2-bo'limini ham.
Sen Q5 fazasini bajarasan: Q2 gacha post qilingan cheklarning balans-qarzlarini
Debt reyestriga bosqichma-bosqich olib kirish (DRY-RUN → 1 kontragent → qolgani),
teskari skript bilan birga. Bu JONLI ma'lumotga tegadi — qoida 12 va 13 majburiy.
Faqat Q5 vazifalari, testlar, jonli tekshiruv, hisobot shu faylga — va TO'XTA.
Q6 ni BOSHLAMA.
```

---

### Q6 — Yakuniy jonli verify, hujjatlashtirish va yopish

**Maqsad:** BESH invariantni (§3) jonlida raqam bilan isbotlash va bilimni
kelajakdagi sessiyalar uchun qulflash.

**Vazifalar:**
1. **Jonli verify skripti** `ops-q6-live-verify.ts` (`ops-p1-live-verify.ts`
   naqshi — HTTP orqali, ishlab turgan API: controller + guard + servis):
   **qarz zanjiri:** qarzga sotuv → reyestr qatori bor · balans AYNAN bir
   marta o'sdi · undirish ro'yxatida chiqdi · qisman to'lov → ikkala daftar
   teng kamaydi · vozvrat → ikkalasi teng qaytdi;
   **avans zanjiri (A-fazalar tugagan bo'lsa):** avans qabul → kassa `+`,
   balans `−`, `Debt` qatori YO'Q · avansdan to'lov → kassa o'zgarmadi, chek
   to'langan, undirish ro'yxatida CHIQMADI · avansdan ortiq urinish 400 ·
   avansi bor mijozga qarzga sotuv → **reyestr qatori §2.2 bo'yicha** ·
   qolgan avans qaytarildi → balans 0. Hukm jadvali bilan.
2. **Hujjat:** `NEXT.md` ga qaror yozuvi (P1 yozuvi uslubida — yoriq, qaror,
   rad etilgan variantlar, jonli dalil). `docs/ops/jonli-holat.md` ga
   backfill izi (qoida 14).
3. **Izohlar auditi:** repo bo'ylab «reyestrga ATAYLAB yozmaymiz» /
   «ikki daftar» premise'ini takrorlaydigan izohlar
   (`pos-customer-debt.ts`, `counterparty-settlement.util.ts`,
   `recompute-counterparty-balances.ts`, `debt.service.ts:745-748`,
   `NEXT.md`) — hammasi yangi haqiqatga moslansin. Eskirgan izoh keyingi
   agentni noto'g'ri yo'lga soladi (F5 saboqi).
4. **Xotira:** `sherset-loyiha.md` yoki yangi memory faylga qisqa yozuv.
5. **Egasiga yakuniy hisobot:** IKKALA shikoyat ham yopildimi, nimaga e'tibor
   bersin (qarzdorlar ro'yxatidagi jami son o'sgani — bu yangi qarz emas,
   ko'rinmagan qarz endi ko'rinayotgani; avansi bor mijozlar balansda MANFIY
   turadi va bu to'g'ri).

**Qabul mezoni:** verify skripti barcha hukmlarda ✅; egasi undirish ekranida
kassa qarzlarini ko'rgani VA avansli mijoz bilan kassada ishlab ko'rgani
tasdiqlangan; eskirgan izohlar qolmagan (grep bilan isbot hisobotda).

**PROMPT:**
```
D:\sherset-v2 dagi docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md ni
TO'LIQ o'qi (avvalgi BARCHA hisobotlar bilan). Sen Q6 fazasini bajarasan: jonli verify
skripti, NEXT.md/jonli-holat hujjatlari, eskirgan izohlar auditi va yakuniy
yopish. Faqat Q6 vazifalari, testlar, hisobot shu faylga — va TO'XTA.
```

---

## 5. Hisobotlar

> Har agent O'Z fazasi ostiga yozadi: nima qilindi (fayllar, commitlar), test
> natijalari (RAQAM bilan), deploy holati, **«bu o'zgarish qaysi mavjud oqimni
> buzishi mumkin?» ga yozma javob** (qoida 10), ochiq qolganlar, keyingi fazaga
> eslatmalar. Qabul mezonining biror bandi bajarilmasa — holat «QISMAN».

### Q0 — Reja tuzildi · 2026-08-25

Egasining shikoyati («kassadan qo'shilgan qarzdorliklar undirish bo'limida
ko'rinmayapti») kod bo'yicha o'lchandi va ildizi topildi: qarz ikki daftarda
yashaydi, undirish ro'yxati faqat `Debt` reyestridan o'qiydi, POS chekdan
kelgan qarz esa faqat `CounterpartyBalance` ga yoziladi
(`retail-sale.service.ts:1241-1245` — ataylab qilingan qaror).

Ikki variant taqdim etildi; egasi **B variantini** tanladi (chekdan reyestrga
`balanceAdopted=true` qator). Sabab: P1 (2026-08-11) to'lov yo'lida aynan shu
naqshni qurgan va jonlida sinagan — berish yo'lida davom ettirish undirish
modulini umuman o'zgartirmaydi.

Egasi «operator izohlari kassirga ochilmasin» talabini **rad etdi** — kassir
ko'ra olsin (§1.2). Tekshirildi: kontragent izohini (`description`) kassir
hozir ham ko'radi va tahrirlaydi (`pos-debt-payment.service.ts:102`,
`customer-card-panel.tsx:355`); qarz izohlari POS ekranida ko'rinmaydi
(`DEBT_FIFO_SELECT` da yo'q), lekin API darajasida `debt.view: ALL` +
kiosk `/debts` GET ochiq — o'zgarishsiz qoldiriladi.

**Reja tuzish jarayonida topilgan MAVJUD yoriq (§2.1):**
`scripts/recompute-counterparty-balances.ts:256` barcha `Debt.totalMinor` ni
qo'shadi, `balanceAdopted` filtri YO'Q — ya'ni P1 adopsiya qatorlari
`APPLY=1` da saldoni shishirardi. Bu Q1 ning 3-vazifasi.

**Tekshirilgan va XAVFSIZ deb topilganlar:** akt-sverka
(`counterparty-settlement.util.ts` — reyestr saldoning «tarkibi», qo'shiluvchi
emas); mijozga avtomatik Telegram qarz-eslatmasi (`lastTgReminderAt` cron'i
kodda MAVJUD EMAS — faqat schema maydoni va design hujjat, ya'ni «Telegram
oqimi portlashi» xavfi amalda yo'q, lekin operator bildirishnoma cron'i
(`debt-reminder.service.ts`) BOR va Q5 uni hisobga oladi).

**Muddat savoli YOPILDI (egasi, 2026-08-25):** «hozircha shunday qur» —
default **14 kun** qabul qilindi. Q4 da sozlanadigan bo'ladi.

### Q0b — Avans muammosi rejaga qo'shildi · 2026-08-25

Egasining ikkinchi shikoyati («mijozlar oldindan pul berib qo'yishadi, keyin
tovar olishadi — ishlay olmayapmiz») kod bo'yicha o'lchandi va **A1…A3**
fazalari qo'shildi (§1.3).

**Nima BOR ekan:** daftar avansni allaqachon qo'llaydi — manfiy
`CounterpartyBalance` = «biz qarzdormiz» (`counterparty-settlement.util.ts`
sarlavhasida rasman ta'riflangan); `CashIn.post` mijoz balansiga `−sumMinor`
yozadi (`cash-in.service.ts:595-600`); `Prepayment`/`PrepaymentReturn`
modullari va `/prepayments`, `/cash-in` web ekranlari mavjud.

**Nima YO'Q ekan (uchta to'siq, §1.3 jadvalida dalillari bilan):**
(1) kassada avansni qabul qilish yo'li yo'q — `/cash-in` kiosk allowlist'da
YO'Q (`kiosk-policy.ts` to'liq ro'yxati tekshirildi), `drawerCashIn`
(«Внесение») kontragentsiz va balansga tegmaydi; (2) `TENDER` da atigi 5 tur
(`retail-tenders.ts:29-46`) — avans turi yo'q; (3) manfiy balansda
`debtPayable` `0` qaytaradi, kartadagi yagona yirik son esa aynan u — kassir
mijozning pulimiz turganini KO'RMAYDI ham.

**Dizayn o'zagi:** avans tenderining balans deltasi `DEBT` tenderiniki bilan
AYNAN bir xil (`+summa`) — farq faqat natijaning ishorasida va chek to'langan
sanalishida. Ya'ni **yangi pul-yo'li ochilmaydi**, mavjud `applyDelta`
qayta ishlatiladi.

**🔴 Eng muhim topilma — KESISHUV (§2.2).** Q2 sodda yozilsa (chekning qarz
ulushiga qator ochsa), avansi bor mijoz undirish ro'yxatiga tushib, unga
«qarzingizni to'lang» eslatmasi ketardi. Shuning uchun reyestr qatorining
summasi endi `receivablePortion(balansOldin, debtAmount)` bilan hisoblanadi va
bu qoida **Q1 da yoziladi, Q2 da qo'llanadi** — ya'ni A-fazalar qurilmasa ham
kerak (manfiy balansli mijozlar prodda allaqachon bor, admin `/cash-in` yo'li
orqali). Balans `FOR UPDATE` bilan qulflanadi, tartib P1 bilan bir xil:
**BALANS → QARZLAR**.

**A2 uchun oldindan ogohlantirish:** `recompute-counterparty-balances.ts` ga
`PREPAY` manbasini qo'shish UNUTILMASIN — unutilsa `APPLY=1` mijozlarning
avanslarini yo'q qiladi. Bu §2.1 dagi mavjud yoriqning aynan takrori bo'lardi.

### Q1 — Poydevor · 2026-08-25 · **QISMAN** (qabul mezonining 2-bandi ochiq)

**Xulq O'ZGARMADI** — yangi sof modulni hech kim chaqirmaydi, `Debt.sourceDocType` /
`Debt.sourceDocId` ga hech kim yozmaydi (grep bilan tekshirildi: `sale-debt-registry`
faqat o'z testidan import qilinadi). Yagona jonli xulq-o'zgarishi —
`recompute-counterparty-balances.ts` ning **cross-check CHIQISHI** (u DRY-RUN'da
hech narsa yozmaydi; pastga qarang).

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `packages/db/prisma/schema.prisma` (`model Debt`) | `sourceDocType String? @db.VarChar(32)`, `sourceDocId String? @db.Uuid`, `@@unique([accountId, sourceDocType, sourceDocId])` + to'liq izoh (nega kerak, `balanceAdopted` bilan munosabati, NULL semantikasi) |
| 2 | `packages/db/prisma/migrations/20260825120000_debt_source_doc/migration.sql` | idempotent DDL: `ADD COLUMN IF NOT EXISTS` ×2 + `CREATE UNIQUE INDEX IF NOT EXISTS` |
| 3 | `apps/api/src/modules/debt/sale-debt-registry.ts` | **YANGI sof modul** (DB yo'q, Nest yo'q, `Date.now()` yo'q) |
| 4 | `apps/api/src/scripts/recompute-counterparty-balances.ts` | `debt.groupBy` ga `balanceAdopted: false` filtri + sarlavha formulasi yangilandi |
| 5 | `apps/api/src/scripts/counterparty-balance-sources.ts` | `debt-issue` yozuvi endi adopsiya assimetriyasini ham aytadi |
| 6 | `apps/api/src/modules/debt/sale-debt-registry.test.ts` | **YANGI**, 33 test |
| 7 | `apps/api/src/modules/debt/debt-source-doc-schema.test.ts` | **YANGI**, 9 test (sxema + migratsiya idempotentligi) |
| 8 | `apps/api/src/scripts/counterparty-balance-sources.test.ts` | +2 test (adopsiya ↔ filtr uch tomonlama qulfi) |

**Sof moduldagi funksiyalar:** `receivablePortion` (§2.2 kesishuv qoidasi),
`saleDebtDueAt` (muddat — **NULL QAYTARMAYDI**, Toshkent kalendar kuni + 09:00),
`planSaleDebtRow` (qator rejasi; **`null` ⇒ qator OCHILMAYDI**),
`planSaleDebtDelta` (Q3 simmetriya deltasi), `DEFAULT_SALE_DEBT_TERM_DAYS = 14`,
`SALE_DEBT_SOURCE_DOC_TYPE = 'retailsale'`.

> ⚠️ **Rejadan bitta ATAYLAB chekinish.** Reja `planSaleDebtDelta(oldRemaining,
> newRemaining)` imzosini bergan edi; u obyekt-kirishga KENGAYTIRILDI
> (`totalMinor` va `paidMinor` ham kiradi). Sabab: Q3 ning qabul mezoni
> «`totalMinor` `paidMinor` dan pastga tushmasin» ni talab qiladi va bu — sof
> qoida, I/O emas; ikki argumentli shakl uni ifodalay olmaydi. Funksiya
> `nextTotalMinor`, `deltaMinor` (AMALDA qo'llangan harakat), `status`, `closed`
> va `clampedByPaidMinor` (nizo belgisi) qaytaradi.

#### Test natijalari (raqam bilan)

- `apps/api` **to'liq** vitest: **633 fayl · 8885 test YASHIL**, 1 fayl / 2 test skip.
- Yangi testlar: `sale-debt-registry.test.ts` **33**, `debt-source-doc-schema.test.ts` **9**,
  `counterparty-balance-sources.test.ts` **+2** — jami **44** yangi test.
- `apps/api` typecheck (`NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`): **0 xato**.
- `node scripts/check-lint.mjs`: **0 error** (1171 warning — siyosat bo'yicha ruxsat).
- i18n gate'lari (`pnpm i18n:gate`): **19 test yashil** (Q1 da yangi UI matni YO'Q).
- `prisma validate`: sxema yaroqli; `prisma generate` qayta yurgizildi.

#### Migratsiya — lokal dev bazada (qoida 7)

`sherset_v2_dev` @ localhost'da `prisma db execute --file` bilan **IKKI MARTA**
yugurtirildi — ikkalasi ham `Script executed successfully`. Keyin baza o'zidan
o'qildi:

```
USTUNLAR: source_doc_id   uuid                   is_nullable=YES
          source_doc_type character varying(32)  is_nullable=YES
INDEKS:   debts_account_id_source_doc_type_source_doc_id_key
          CREATE UNIQUE INDEX … ON public.debts USING btree
            (account_id, source_doc_type, source_doc_id)
MAVJUD (NULL,NULL) QATORLAR: 652
```

🔴 **NULL SEMANTIKASI — YOZMA TASDIQ.** Unique indeks o'rnatilgan holatda bazada
`(NULL, NULL)` bo'lgan **652 qator** yonma-yon yashamoqda. Ya'ni Postgres
nullable ustunlarda NULL larni takrorlanuvchi sanamaydi (`NULL != NULL`) —
mavjud qatorlar buzilmadi, **backfill KERAK EMAS**, qo'lda ochiladigan `QRZ-`
qarzlar ham hech qachon cheklanmaydi. Indeks nomi Prisma `migrate diff`
generatsiya qiladigan nom bilan AYNAN bir xil (`migrate diff --from-empty`
chiqishi bilan solishtirildi) ⇒ drift bo'lmaydi.

Teskari yo'l (qoida 12 ruhida; Q1 MA'LUMOTGA TEGMAYDI, shuning uchun bu
shunchaki DDL ni qaytarish):

```sql
DROP INDEX IF EXISTS "debts_account_id_source_doc_type_source_doc_id_key";
ALTER TABLE "debts" DROP COLUMN IF EXISTS "source_doc_id";
ALTER TABLE "debts" DROP COLUMN IF EXISTS "source_doc_type";
```

#### 🔴 §2.1 yorig'i — o'lchangan haqiqat rejadagidan MURAKKABROQ chiqdi

**1. Reja «`APPLY=1` saldolarni shishirardi» deydi — HOZIRGI kodda bu NOTO'G'RI.**
Faza 10 dan beri skriptning **nishoni — balans JURNALI**, hujjatlardan
qayta-qurish esa faqat **CROSS-CHECK** (`writes.push([k, want])`, bunda
`want = journal.get(k) ?? 0n`). Ya'ni filtrsizlik pul-ma'lumotni **BUZA
OLMAYDI**; u buzadigani — skriptning yagona diagnostik signalining ishonchi.
Bu «jonlida `APPLY=1` yugurtirilganmi?» savolining PUL tomonini koddan yopadi,
VPS'ga kirmasdan.

⚠️ Cheklov: bu da'vo **hozirgi kod** haqida. Jonlida Faza 10 dan OLDINGI versiya
yugurtirilgan bo'lsa xulq boshqacha edi. Jonlida umuman yugurtirilgan-
yugurtirilmagani (log/tarix) **TEKSHIRILMADI — VPS kirishi kerak** (qoida 5:
parol foydalanuvchidan so'raladi). **Ochiq qoldi.**

**2. Adopsiya qatorlari IKKI SINFga bo'linadi — reja faqat birinchisini bilardi.**
Lokal dev bazasida (jonliga yaqin klon) 652 ta `balanceAdopted` qator bor:

| Sinf | Soni | Σ (tiyin) | `comment` |
|---|---|---|---|
| **P1 adopsiyasi** | 44 | 32 537 108 100 | «Balansdagi qarzdan kassada qabul qilingan to'lov uchun ochildi (P1).» |
| **MoySklad import** | 608 | 1 157 120 242 529 | «MoySklad boshlang'ich qoldig'idan (2026-08-16)» |

Jurnal `docType` kesimi: `opening` n=759 Σ=−1 823 146 300 436 · `retailsale`
n=273 Σ=+145 599 158 478 · `debtpayment` n=129 Σ=−123 934 660 800 ·
`supply` n=12 · `adjustment` n=10.

**3. O'lchash — OLDIN/KEYIN (lokal dev, DRY-RUN, hech narsa yozilmadi).**

*P1 sinfi — reja aytgan yoriq, va u AYNAN yopildi.* Faqat P1 adopsiyasi bo'lgan
**22 kontragent** topildi; filtrdan keyin **20 tasi to'liq MOS** bo'ldi:

```
091a3573…  OLDIN: hujjatlar 484000000 vs jurnal 246000000  (farq = adopsiyaΣ 238 000 000)
           KEYIN: cross-check: hujjat-rekonstruksiyasi jurnal bilan MOS (0 farq)
a47d0c31…  OLDIN: hujjatlar 956400000 vs jurnal 0          (farq = adopsiyaΣ 956 400 000)
           KEYIN: cross-check: … MOS (0 farq)
```

Qolgan **2 kontragentda ham filtr AYNAN adopsiya summasini olib tashladi**, lekin
qoldiq farq qoldi — va u AYNAN `opening` yozuviga teng:

```
1ba42232…  165 900 000 → 135 900 000     (Δ = adopsiyaΣ 30 000 000)
           qoldiq farq 75 900 000    = |opening|  (jurnal: opening=−75 900 000)
8b2f6308…  5 735 740 000 → 2 612 193 700 (Δ = adopsiyaΣ 3 123 546 300)
           qoldiq farq 1 301 953 640 = |opening|  (jurnal: opening=−1 301 953 640)
```

*MoySklad-import sinfi — KUTILMAGAN oqibat.* Butun baza bo'yicha mos kelmaydigan
kalitlar soni **183 → 759** (799 dan) ga **O'SDI**. Sabab aniq va yuqoridagi ikki
qatorda ochiq ko'rinadi: hujjat-rekonstruksiyasida **`opening` jurnal yozuvlari
uchun MANBA YO'Q** (skript sarlavhasida allaqachon «KUTILGAN» deb yozilgan sinf),
va 608 ta import qatorining `totalMinor` i o'sha yetishmayotgan `opening` ni
**TASODIFAN qoplab turgan edi**. Filtr qoplamani olib tashladi — ya'ni farq
**yangi paydo bo'lmadi, YASHIRINLIGI TUGADI**.

**Xulosa:** filtr semantik jihatdan **TO'G'RI** (adopsiya qatori daftarga hech
narsa yozmaydi — ochilishida ham, `remove()` da ham; demak hujjat-hisobida ham
bo'lmasligi SHART) va **Q2 uchun MAJBURIY**: Q2 dan keyin har qarzga sotuv uchun
`DEBT` tender qatori (`retail-credit` manbasi) VA reyestr qatori bo'ladi —
filtrsiz har chek hujjat tomonida IKKI MARTA sanalardi.

#### 🔴 OCHIQ QAROR (Q2 dan oldin hal qilinsin)

Cross-check'ni yana ishonchli qilish uchun `recompute-counterparty-balances.ts`
ga **`opening` manbasi** qo'shilishi kerak (`SCRIPT_SOURCES` ga yangi nom +
`SOURCE: opening` markeri + `counterparty-balance-sources.test.ts` ga holat).
Yuqoridagi o'lchov uni to'liq asoslaydi: qoldiq farq HAR IKKI holatda AYNAN
`Σ(opening)` ga teng edi.

Bu **Q1 ning vazifalar ro'yxatida YO'Q** va u yangi manba-shartnomasi ochadi
(A2 ham `PREPAY` manbasini qo'shishi rejalashtirilgan) — shuning uchun bu
sessiyada **QILINMADI**. Tavsiya: **Q1b mikro-fazasi** yoki Q2 ning birinchi
qadami. Qaror egasi/keyingi sessiyaniki.

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **POS / kassa oqimi — BUZILMAYDI.** Yangi ustunlarga hech kim yozmaydi, yangi
   modulni hech kim chaqirmaydi (grep). `Debt.create` / `adoptBalanceDebt` /
   FIFO to'lovi kodiga umuman tegilmagan. Migratsiya faqat ikki NULL ustun
   qo'shadi, `UPDATE`/`DELETE` YO'Q (test bilan qulflangan).
2. **Undirish ro'yxati, qo'ng'iroq jadvali, eslatma cron'i — BUZILMAYDI.** Yangi
   qator tug'ilmaydi ⇒ `debt-collection.service.ts` va `debt-reminder.service.ts`
   uchun ma'lumot to'plami o'zgarmaydi. Bu Q1 ning butun mohiyati: xulq keyingi
   fazada yoqiladi.
3. **Balans / pul — TEGILMAYDI.** `applyDelta` chaqiruvchilari o'zgarmadi; qamrov
   reyestriga (`DECLARED_BALANCE_WRITERS`) yozuvchi qo'shilmadi, faqat `note`
   matni aniqlashtirildi; DUP-02 qamrov gate'i yashil.
4. **`recompute` skripti — O'ZGARDI, lekin faqat CHIQISHI.** DRY-RUN hech narsa
   yozmaydi; `APPLY=1` jurnaldan yozadi, jurnalga esa tegilmadi. Xavf:
   **cross-check chiqishi shovqinliroq bo'ldi (183 → 759)** — «OCHIQ QAROR» shu
   haqda. Bu **ma'lumot xavfi emas, DIAGNOSTIKA xavfi**: keyingi sessiya «hamma
   yerda farq bor» ni ko'rib haqiqiy signalni o'tkazib yuborishi mumkin.
5. **Unique indeks — mavjud yozuvchilarni bloklamaydi.** Barcha mavjud va
   kelajakda qo'lda ochiladigan qarzlar `(NULL, NULL)` — Postgres ularni
   takrorlanuvchi sanamaydi (bazada 652 qator bilan EMPIRIK tasdiqlandi).
   ⚠️ Q2 uchun: `(accountId, 'retailsale', sale.id)` bo'yicha `P2002` —
   **kutilgan** idempotentlik signali, xato emas.
6. **Migratsiya zanjiri.** Idempotent DDL; indeks nomi Prisma'niki bilan bir xil
   ⇒ `migrate diff` drift ko'rmaydi. VPS'da qoida 7 retsepti bilan beriladi
   (`db execute --file` + `migrate resolve --applied` + `prisma generate`).
7. **Ombor / qoldiq / yacheyka oqimlari — TEGILMAGAN.** Q1 `retail-sale`,
   `stock`, `store-cell` fayllariga bir qator ham yozmadi; H- va G-reja
   hududiga kirmadi. Shuning uchun qoida 8 ning `warehouse-state.ts` qo'shimchasi
   va qoida 13 ning uchma-uch smoke'i bu fazada QO'LLANMAYDI (jonli o'zgarish
   yo'q).

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | migratsiya lokal dev bazada ikki marta yugurtirilganda ham xatosiz | ✅ |
| 2 | `balanceAdopted` qatori bo'lgan mijozda `recompute` (DRY-RUN) endi farq ko'rsatmaydi | ⚠️ **QISMAN** — P1 sinfida ✅ (22 dan 20 tasi to'liq MOS; qolgan 2 tasida farq AYNAN adopsiya summasiga kamaydi, qoldiq = `opening`); MoySklad-import sinfida ❌ (`opening` manbasi yo'qligi ochilib qoldi) |
| 3 | api testlari to'liq yashil | ✅ 8885 |
| 4 | xulq o'zgarmagani (POS va undirish ekranlarida yangi qator yo'q) | ✅ (yozuvchi yo'q — grep) |
| 5 | (task 3) jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani tekshirilsin | ❌ **VPS kirishi kerak** — pul tomoni koddan yopildi (§ yuqorida), tarix tekshirilmadi |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: «OCHIQ QAROR»
(cross-check'ga `opening` manbasi) + jonli tarix tekshiruvi.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi. Q1 xulqni
o'zgartirmagani uchun shoshilinch deploy talab qilmaydi; migratsiyani Q2 bilan
BITTA deploy oynasida berish mantiqiyroq. Commit lokal
`yacheyka-inventarizatsiya` branch'ida; **push QILINMADI** — buyruq kutilmoqda.

#### Keyingi fazaga (Q2) eslatmalar

1. `planSaleDebtRow(input, now)` **`null` qaytarsa qator OCHILMAYDI** — bu
   invariant 4 ning amaliy shakli; `if (plan)` shartini tushirib qoldirmang.
2. `balanceBeforeMinor` **`applyDelta` DAN OLDIN**, `FOR UPDATE` bilan
   o'qilishi shart (`pos-debt-payment.service.ts#lockBalance` naqshi; tartib
   BALANS → QARZLAR). Sof modul qulfni bilmaydi — kod-shakl testi Q2 da yoziladi.
3. `P2002` (unique) — kutilgan idempotentlik signali, 500 qilib chiqarmang.
4. `plan.balanceUnmeasured` va `plan.coveredByPrepayMinor` allaqachon
   `plan.noteText` ichiga yozilgan — `DebtNote` ga AYNAN `plan.noteText` ni
   bering, qayta matn yozmang.
5. Cross-check shovqini haqidagi «OCHIQ QAROR» ni birinchi hal qiling, aks holda
   Q2 dan keyin «hujjatlar ≠ jurnal» chiqishini umuman o'qib bo'lmaydi.

### Q2 — Chekdan reyestr qatori · 2026-08-25 · **QISMAN** (jonli tasdiq kutilmoqda)

**Xulq O'ZGARDI.** Bu rejaning ASOSIY funksiyasi: kassadan qarzga sotilgan chek
endi `Debt` reyestriga ham qator ochadi va shu bilan undirish ro'yxatiga,
qo'ng'iroq jadvaliga, eslatma oqimiga va menejer navbatiga tushadi. Balans yo'li
BIR BAYT ham o'zgarmadi.

Commitlar: `7ef30b61` (funksiya + testlar), `af8d3339` (lokal baza zondi).

#### 🔴 Sessiya boshida ikkita to'siq — ikkalasi ham hisobotga yozilishi shart

**1. Q1 «QISMAN» edi (qoida 11).** Egasi (2026-08-25) Q2 ni davom ettirishga
ruxsat berdi; Q1 ning ikki ochiq bandi **OCHIQ QOLDI** va pastda takrorlanadi.
Q2 ular tufayli funksional bloklanmaydi — dalil pastdagi «OCHIQ QAROR» bandida.

**2. `retail-sale.service.ts` da G4 ning 2-bosqichi commit qilinmagan holda
turgan edi** (+247 qator, 21 fayl). Q2 ham AYNAN `post()` ga yozadi, ya'ni
commit ikkalasini ajrata olmasdi — bu 2026-08-24 hodisasining SINFI (ombor
o'zgarishi kassa bilan birga jonliga chiqishi). Egasining qarori bo'yicha
G4-2 `git stash` ga olindi va Q2 toza HEAD (`ff2db056`, Q1) ustiga qurildi.

**⚠️ SESSIYA O'RTASIDA BAZHA O'ZGARDI (operatsion hodisa, qayd etiladi).**
Ish davomida BOSHQA sessiya shu branch'ga `b4c27d24` + `7a75ce80` («G4 2a —
kassa AJRATMADAN ayiradi») ni commit qildi (04:21). Oqibatlari:
  · git indeksi eskirgan ko'rindi — birinchi `git status` 3 fayl, ikkinchisi
    21 fayl ko'rsatdi;
  · **`refs/stash` ustidan yozildi va G4-2 stash yozuvi YO'QOLDI.** U
    `git fsck --unreachable` orqali topilib (`8f51caea`) `git stash store`
    bilan QAYTARILDI. Hozir: `stash@{0}` = G4-2 (21 fayl).
    ⚠️ Uning katta qismi endi `b4c27d24` bilan USTMA-UST tushadi — pop
    qilishdan oldin solishtirilsin, ko'r-ko'rona `pop` qilinmasin.
  · Mening `7ef30b61` commit'im `7a75ce80` ustiga tushdi. **G4-2a kodi
    BUZILMAGANI tekshirildi:** `git diff b4c27d24 HEAD -- retail-sale.service.ts`
    dagi YAGONA o'chirishlar — mening ataylab olib tashlagan ikki joyim
    (eski «reyestrga yozmaymiz» izohi va `postedAt: new Date()`).
  · Barcha test/typecheck raqamlari YAKUNIY commit ustida QAYTA o'lchandi.

**TUZATISH — G4-2 ni stash qilish QOIDA BUZILISHI edi.** `CLAUDE.md` §6.1
aniq aytadi: «Seniki bo'lmagan o'zgarishlarga TEGMA… yozish/stash/revert/
`git checkout --` TAQIQ», §6.7A esa «umumiy checkout'da … `stash` — TAQIQ,
agar daraxtda sen yaratmagan o'zgarish bo'lsa». Men bu qoidani BILMASDIM:
sessiya `C:\Users\user` dan boshlangani uchun `D:\sherset-v2\CLAUDE.md`
kontekstga YUKLANMAGAN edi. Ish YO'QOLMADI — G4 sessiyasi uni `git stash pop`
bilan tiklab darhol commit qildi (`b4c27d24`) — lekin qaror baribir noto'g'ri
edi.

**TO'G'RI YO'L (§6.5) — WORKTREE izolyatsiyasi.** Aynan shu sessiyaning
IKKINCHI yarmida (cherry-pick bosqichida) shunday qilindi: alohida checkout
(`git worktree add`) ochilib, `node_modules` junction bilan ulanib, to'liq
test-suite o'sha yerda yugurtirildi — asosiy daraxtga BIR MARTA ham tegilmadi
(boshqa sessiyaning `docs/plans/*` tahrirlari joyida qoldi). G4-2 ni ham
boshidan shunday ajratish kerak edi.

**SABOQ (keyingi sessiyalarga):**
1. Ish boshida `D:\sherset-v2\CLAUDE.md` ni O'QING — cwd repo bo'lmasa u
   avtomatik yuklanmaydi va §6 protokoli umuman ko'rinmaydi.
2. Begona commit qilinmagan ishni **stash qilmang** — worktree oching (§6.5).
3. `git stash` parallel sessiyalarda ISHONCHSIZ: `refs/stash` BITTA ref, ikki
   sessiya bir-birining yozuvini o'chiradi (shu sessiyada aynan shunday bo'ldi;
   `git fsck --unreachable` + `git stash store` bilan qaytarildi).

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `apps/api/src/modules/retail-sale/retail-sale.service.ts` | `post()` qarz bloki: balans QULFI + reyestr yozuvchisi; ikkita yangi private helper; `postedAt` yagona instantga keltirildi; eski izoh «BEKOR QILINDI» deb qayta yozildi |
| 2 | `apps/api/src/modules/debt/sale-debt-registry.ts` | `DEBT_LEDGER_CURRENCY` YAGONA e'lon bo'lib shu yerga ko'chdi |
| 3 | `apps/api/src/modules/debt/pos-debt-payment.service.ts` | yopiq nusxa o'chirildi, import qilinadi (ikki haqiqat qolmasin) |
| 4 | `apps/api/src/modules/debt/pos-customer-debt.ts` | sarlavha izohi: «reyestrga ATAYLAB yozmaydi» BEKOR, eski matn tarix uchun saqlandi |
| 5 | `apps/api/src/modules/debt/sale-debt-registry.mock.ts` | **YANGI** — umumiy tranzaksiya-mock'i (`$queryRaw` + `debt` + `debtNote` + sequence) |
| 6 | `apps/api/src/modules/retail-sale/retail-sale-debt-registry.test.ts` | **YANGI**, 17 test |
| 7 | `retail-sale-{tenders-wiring,post-guards,payed-sum}.test.ts` | harness'larga yangi delegatlar (mock'dan, nusxa emas) |
| 8 | `apps/api/src/scripts/q2-local-registry-probe.ts` | **YANGI** — lokal dev bazada HAQIQIY indeks zondi (o'zi ROLLBACK qiladi) |

**Yozuvchining shakli** (`writeSaleDebtRegistryRow`):

```
balansOldin ← lockCounterpartyBalance(FOR UPDATE)      ← applyDelta DAN OLDIN
applyDelta(+debtAmount, source:'retailsale')            ← MAVJUD yo'l, o'zgarmadi
audit (SOLD_ON_CREDIT)                                  ← o'zgarmadi
plan ← planSaleDebtRow({debtAmount, balansOldin}, postedAt)
  plan === null  ⇒ QATOR YO'Q (avans qopladi) + log
  plan !== null  ⇒ mavjudlik tekshiruvi → QRZ- raqami →
                   createMany({skipDuplicates}) → DebtNote(debt_issue)
```

#### 🔴 Rejadan ikkita ATAYLAB chekinish

**1. `create` + `P2002` EMAS, `createMany({ skipDuplicates })`.**
Reja «unique konflikt (`P2002`) tutiladi» degan edi. Bu **ishlamas edi**:
Postgres unique-buzilishida tranzaksiyani ABORT holatiga o'tkazadi va Prisma
savepoint ishlatmaydi — xato tutilgan taqdirda ham chekning QOLGAN yozuvlari
(`customerOrders.applyPayment`, yakuniy `findUniqueOrThrow`) `25P02` bilan
yiqilardi, ya'ni **muvaffaqiyatli chek 500 bo'lib qaytardi**. `skipDuplicates`
esa `ON CONFLICT DO NOTHING` — xato ham, abort ham yo'q.
Bu **taxmin emas, o'lchov**: `q2-local-registry-probe.ts` HAQIQIY indeks ustida
tranzaksiya tirik qolganini isbotlaydi (pastda raqamlari bilan).

**2. `postedAt` endi tranzaksiyadan OLDIN bir marta olinadi.** Ilgari
`postedAt: new Date()` flip'ning ichida tug'ilardi; endi u qarz muddatini ham
belgilaydi. Ikki alohida `new Date()` yarim tunda ikki xil kalendar kuni berib,
chek sanasi bilan qarz muddati bir-biriga zid bo'lib qolishi mumkin edi.

#### Test natijalari (raqam bilan)

- `apps/api` **to'liq** vitest, YAKUNIY commit ustida: **634 fayl · 8918 test
  YASHIL**, 1 fayl / 2 test skip.
- **Bazaviy o'lchov** (mening o'zgarishlarim `git stash` ga olinib, AYNAN shu
  ota-commit ustida): **633 fayl · 8901 test**. Ya'ni delta AYNAN **+1 fayl,
  +17 test** — boshqa hech bir test o'zgarmadi.
  (⚠️ Q1 hisobotidagi «8885» raqami bilan farq mening ishimdan EMAS: oradagi
  `b4c27d24`/`7a75ce80` commitlari ham testlar qo'shgan. Shuning uchun bazaviy
  o'lchov qayta olindi.)
- Tegilgan uch modul kesimida: `retail-sale`+`debt`+`manager` **1967 → 1984**
  (126 → 127 fayl) — yana AYNAN +17.
- typecheck (`tsc --noEmit`, `--max-old-space-size=8192`): **0 xato**.
- `node scripts/check-lint.mjs`: **0 error** (1178 warning — siyosat bo'yicha).
- `pnpm i18n:gate`: **19 test yashil** (Q2 da yangi UI matni YO'Q — server
  tomoni; loglar i18n'ga kirmaydi).

**17 yangi test nimani qulflaydi:**

| Guruh | Testlar |
|---|---|
| Asosiy | qator ochiladi (`balanceAdopted`, `sourceDocId=sale.id`, `nextContactAt` NULL EMAS, `QRZ-YYYY-NNNNN`, `issuedById`=kassir) · `DebtNote(debt_issue)` · **invariant 1: `applyDelta` AYNAN 1 marta, `source:'retailsale'`** · to'liq naqd → qator YO'Q · mijozsiz qarz → 400 |
| Idempotentlik (inv. 3) | mavjud qator → ikkinchisi ochilmaydi VA raqam sarflanmaydi · takroriy post → qator qo'shilmaydi |
| **§2.2 kesishuv (inv. 4)** | avans > qarz → **qator YO'Q**, balans esa o'sadi · avans qisman → qator FAQAT qolgan qismga + izohda avans summasi · balans `null` → to'liq qator + izohda «O'LCHANMAGAN» · balans musbat → to'liq qator |
| Valyuta (§2.3) | USD yashiq → qator YO'Q, qulf OLINMAYDI, **ogohlantirish logi** (jim emas), balans yo'li buzilmaydi |
| Kod shakli | qulf `applyDelta` DAN OLDIN · yozuvchi deltadan KEYIN · qulf `FOR UPDATE` va `counterparty_balances` dan · **yozuvchi `applyDelta` ni CHAQIRMAYDI** (izohlar olib tashlangan holda) |
| Uchma-uch | yozilgan qator AYNAN o'sha shaklda `DebtCollectionService.list` dan CHIQADI (muddati va javobgari bilan) |

#### 🔴 Lokal dev bazasida zond — MOCK emas, HAQIQIY indeks

`q2-local-registry-probe.ts` (`sherset_v2_dev` @ localhost, bitta tranzaksiya,
oxirida o'zi `ROLLBACK` qiladi — qoida 12 ma'nosidagi teskari yo'l skriptning
O'ZIDA, qo'shimcha buyruq kerak emas):

```
  · 1-yozuv count=1 (kutilgan: 1)
  · 2-yozuv count=0 (kutilgan: 0 — ON CONFLICT DO NOTHING)
  · tranzaksiya TIRIK, qator soni=1 (kutilgan: 1)   ← eng muhim tekshiruv
  · NULL,NULL ikki qator count=2 (kutilgan: 2)      ← Q1 NULL semantikasi
  · FOR UPDATE so'rovi ishladi, qator soni=1
  · ROLLBACK'dan keyin bazada qolgan zond qatorlari=0 (kutilgan: 0)
```

Uchinchi qator — rejadan chekinishning ISBOTI: `create`+`P2002` yo'li bilan
bu so'rov `25P02` bilan yiqilardi.

#### OCHIQ QAROR (Q1 dan meros) — Q2 uni SURMAYDI

Q1 «cross-check'ga `opening` manbasi qo'shilsin» degan qarorni ochiq
qoldirgan va Q2 ga «birinchi hal qil» deb yozgan edi. **O'lchandi va hal
qilinmadi — sabab bilan:**

Q2 ochadigan qatorlar HAR DOIM `balanceAdopted = true`, va
`recompute-counterparty-balances.ts:277` dagi `debt.groupBy` filtri
(`balanceAdopted: false`, Q1 qo'ygan) ularni hujjat-hisobidan CHIQARADI.
Ya'ni **Q2 cross-check shovqinini bir zarra ham oshirmaydi** — 759 mos
kelmaydigan kalit Q2 dan oldin ham, keyin ham o'sha. `opening` manbasi
diagnostikani yaxshilaydi, lekin u **yangi manba-shartnomasi ochadi** (A2 ham
`PREPAY` ni qo'shishi kerak) va Q2 ning vazifalar ro'yxatida YO'Q.
Egasining qarori (2026-08-25): Q2 davom etsin, band ochiq qolsin.

**Q1 dan ochiq qolganlar (o'zgarishsiz):**
1. `recompute` cross-check'iga `opening` manbasi — Q1b yoki Q4 ga.
2. Jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani — **VPS kirishi kerak**,
   tekshirilmadi. (Pul tomoni Q1 da koddan yopilgan: Faza 10 dan beri nishon —
   jurnal, hujjat-rekonstruksiyasi esa faqat cross-check.)

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Balans / pul — TEGILMAYDI (invariant 1).** `applyDelta` chaqiruvi
   BITTA va o'zgarmadi; yozuvchi `applyDelta` ni umuman chaqirmaydi (kod-shakl
   testi bilan qulflangan). `DECLARED_BALANCE_WRITERS` ga yangi fayl
   qo'shilmadi — `retail-sale.service.ts` allaqachon ro'yxatda.
2. **Mijozga Telegram xabari — IKKINCHISI KETMAYDI.** Xabar `applyDelta` ning
   `source` argumentidan ketadi; yangi qator `applyDelta` chaqirmagani uchun
   `source:'debt'` («🛒 Qarzga qo'shildi») yo'li OCHILMAYDI. Qo'riqchi
   (`debt-source-wiring.test.ts`) yashil, va yangi testda `source:'retailsale'`
   AYNAN bir marta ekani tekshiriladi.
3. **Undirish ro'yxati / qo'ng'iroq jadvali / menejer navbati — MAQSAD, lekin
   HAJMI O'SADI.** Endi har qarzga sotuv `unpaid` qator beradi. Egasiga
   oldindan aytilsin: `outstandingMinor` va `debtorCount` **o'sadi** — bu
   TO'G'RI (qarz rostdan bor), lekin ekrandagi son «birdan sakraganday»
   ko'rinadi. `manager-queue` ning `DEBT_CAP` i yangi nomzodlar oladi.
4. **Eslatma cron'i (`debt-reminder.service.ts`) — 14 KUNDAN KEYIN uyg'onadi.**
   `nextContactAt` = post + 14 kun ⇒ birinchi to'lqin **2026-09-08** atrofida
   operatorlarga bildirishnoma bo'lib keladi. Mijozga AVTOMATIK xabar YO'Q
   (`lastTgReminderAt` cron'i kodda mavjud emas — Q0 da tekshirilgan).
   🔴 **Bu Q6 gacha esda tutilsin: 2026-09-08 da operator navbati birdan
   to'lishi KUTILGAN xulq, nosozlik emas.**
5. **POS «Qarz to'lovi» oynasi — SON O'ZGARMAYDI.** `payableMinor =
   max(reyestr, balans)`; endi ikki son tenglashadi, maksimum o'sha qoladi.
   `unregisteredMinor` yangi cheklar uchun 0 ga tushadi (to'g'ri), adopsiya
   yo'li esa eski cheklar va boshqa hujjat manbalari uchun ishlashda qoladi —
   `pos-debt-payment.balance-adoption.test.ts` yashil.
6. **Akt-sverka (`counterparty-settlement.util.ts`) — O'ZGARMAYDI.** U
   `debtRegistryOutstandingMinor` ni «saldoning TARKIBI, qo'shiluvchi EMAS»
   deb ta'riflaydi va `balanceAdopted` qatori uchun bu premise TO'G'RI.
7. **`recompute` cross-check'i — SHOVQIN OSHMAYDI.** Yuqorida o'lchandi.
8. **Smena hisobi / kutilgan naqd — TEGILMAGAN.** Qarz tenderi naqdga
   kirmaydi (o'zgarmadi), reyestr qatori esa pul emas.
9. **Chek rollback bo'lsa qator ham qolmaydi** — yozuv AYNAN o'sha
   tranzaksiyada.
10. **USD yashiq — qator ochilmaydi.** Bu XULQ CHEGARASI (§2.3), va u JIM
    emas: ogohlantirish logi + shu hisobotdagi qayd. Bugungi o'rnatmada
    barcha yashiqlar so'mda, ya'ni amalda hech qanday chek chetda qolmaydi.
11. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** Q2 `stock`, `store-cell`,
    `retail-allocation` fayllariga bir qator ham yozmadi. Lekin ⚠️ branch'da
    endi G4-2a (`b4c27d24`) BOR — **deploy oynasi ombor xulqini ham olib
    chiqadi**, shuning uchun qoida 8 ning `warehouse-state.ts` qo'shimchasi va
    qoida 13 ning uchma-uch smoke'i deploy paytida MAJBURIY.
12. **`QRZ-` raqamlar ketma-ketligi** — `allocateDocumentNumber` orqali,
    `adoptBalanceDebt` bilan BIR xil hisoblagichdan. Ikki yozuvchi bir
    hisoblagichni bo'lishadi, race-safe. Idempotent skip'da raqam
    SARFLANMAYDI (test bilan qulflangan).

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi.

🔴 **Deploy oldidan hal qilinishi SHART:** branch'da endi Q1+Q2 (kassa qarzi)
bilan BIR QATORDA **G4-1 + G4-2a (ombor avto-taqsimoti)** ham turibdi, va
G-rejada G4 «deploy kutilmoqda — egasi keyinroq dedi VA 2026-08-24 hodisasi
hal bo'lmagan» deb belgilangan. `git merge --ff-only` retsepti ularni AJRATA
OLMAYDI. Ikki yo'l: (a) egasi ikkalasini birga chiqarishga rozi bo'ladi va
deploy qoida 8+13 to'liq bajariladi; (b) Q1+Q2 alohida branch'ga
cherry-pick qilinadi. **Qaror egasiniki.**

Migratsiya: Q1 niki (`20260825120000_debt_source_doc`) hali VPS'da
BERILMAGAN — Q2 dan oldin berilishi SHART, aks holda `post()` mavjud
bo'lmagan ustunga yozib chekni yiqitardi.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | qarzga sotuv → reyestrda 1 qator (`balanceAdopted`, `sourceDocId`, muddat) | ✅ test + lokal baza zondi |
| 2 | balansga IKKI MARTA yozilmadi | ✅ test (invariant 1) |
| 3 | Telegram xabari BIR MARTA | ✅ test + mavjud wiring qo'riqchisi |
| 4 | idempotentlik | ✅ test + **HAQIQIY indeks** zondi |
| 5 | §2.2 kesishuv — uch holat | ✅ test (to'rt holat) |
| 6 | qulf `applyDelta` dan OLDIN | ✅ kod-shakl testi |
| 7 | undirish ro'yxati qatorni qaytaradi | ✅ `DebtCollectionService.list` uchma-uch testi |
| 8 | api testlari to'liq yashil | ✅ 8918 |
| 9 | **jonlida sinov-chek → `/menejer/undirish` da `upcoming`** | ❌ **VPS/deploy kerak** |
| 10 | **jonlida balans AYNAN bir marta o'sdi** | ❌ VPS kerak |
| 11 | **jonlida `payableMinor` o'zgarmadi** | ❌ VPS kerak |
| 12 | **jonlida manfiy balansli mijozga qator OCHILMADI** | ❌ VPS kerak |
| 13 | **sinov cheki storno + reyestr qatorini qo'lda tozalash** | ❌ VPS kerak |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 9–13 bandlari.

#### Jonli tekshiruv retsepti (deploy'dan KEYIN yugurtiriladi)

Deploy oldidan va keyin (qoida 8): `packages/db` da
`npx tsx scripts/warehouse-state.ts` — chiqishi shu hisobotga ko'chiriladi.

1. Sinov mijozga (balansi **0** yoki musbat) POS'dan kichik summali chek
   QARZGA post qilinadi.
2. `/menejer/undirish` → mijoz `upcoming` chelagida, muddati **post + 14 kun**,
   javobgari — kassir.
3. Kontragent kartasi: balans AYNAN chek qarziga o'sgan (ikki barobar EMAS).
4. POS «Qarz to'lovi» oynasi: `payableMinor` o'sha son (o'zgarmagan).
5. **Manfiy balansli (avansi bor) sinov mijoziga** qarzga chek → reyestrda
   qator YO'Q, undirish ro'yxatida CHIQMAYDI.
6. Uchma-uch smoke (qoida 13): bitta sotuv (post → tekshir → cancel), bitta
   yacheyka sanash, bitta ko'chirish — chunki deploy G4-2a ni ham olib chiqadi.
7. Izni tozalash (Q3 gacha qo'lda — `refund()` hali reyestrni harakatlantirmaydi):

```sql
-- AVVAL o'qib ko'ring, keyin o'chiring. <SALE_ID> — sinov chekining id'si.
SELECT id, name, total_minor, status FROM debts
 WHERE source_doc_type = 'retailsale' AND source_doc_id = '<SALE_ID>';

DELETE FROM debt_notes WHERE debt_id IN (
  SELECT id FROM debts
   WHERE source_doc_type = 'retailsale' AND source_doc_id = '<SALE_ID>');
DELETE FROM debts
 WHERE source_doc_type = 'retailsale' AND source_doc_id = '<SALE_ID>';
```

⚠️ `DELETE` ataylab `deletedAt` EMAS: soft-delete qator unique indeksni band
qilib turardi va o'sha chek qayta post qilinsa qator OCHILMASDI. Sinov izi
butunlay ketishi kerak.

#### Keyingi fazaga (Q3) eslatmalar

1. Qator manzili — `sourceDocId = sale.id` (`sourceDocType='retailsale'`).
   `refund()` uni AYNAN shu bo'yicha topadi.
2. `planSaleDebtDelta` (Q1) AYNAN Q3 uchun yozilgan — `clampedByPaidMinor` >
   0 bo'lsa bu **haqiqiy nizo**, 400 emas, `DebtNote` bilan ochiq qayd.
3. 🔴 **`recompute-counterparty-balances.ts:277` ustidagi izohda «`totalMinor`
   create'dan keyin o'zgarmaydi (Debt'da uni tahrirlaydigan yo'l yo'q)» degan
   da'vo bor. Q3 bu da'voni BUZADI** (vozvrat `totalMinor` ni kamaytiradi).
   Amalda xato tug'ilmaydi — Q3 harakatlantiradigan qatorlar
   `balanceAdopted = true`, ya'ni filtrdan CHIQIB ketadi — lekin **izoh
   yangilanmasa keyingi o'quvchi noto'g'ri premise ustida qaror qabul qiladi.**
4. `retail-sale.service.ts` da endi ikkita helper bor: `lockCounterpartyBalance`
   (qayta ishlatiladi) va `writeSaleDebtRegistryRow`. Q3 ning `refund()` yo'li
   ham balansni AYNAN shu qulf bilan, AYNAN shu tartibda olishi kerak.
5. `refund()` va `edit()` da valyuta tekshiruvi ham TAKRORLANSIN — USD yashiq
   chekida qator YO'Q, demak uni harakatlantirishga urinish `findFirst → null`
   beradi va bu XATO emas.
6. `git stash@{0}` da G4-2 ning eski nusxasi turibdi — Q3 sessiyasi uni
   ko'r-ko'rona `pop` QILMASIN (yuqoridagi operatsion hodisaga qarang).

#### 🟢 DEPLOY BRANCH'i TAYYOR — `kassa-qarzi-q1-q2` (egasining qarori, 2026-08-25)

Yuqoridagi «deploy oldidan hal qilinishi SHART» bandi **HAL QILINDI**: egasi
Q1+Q2 ni alohida branch'ga cherry-pick qilishni tanladi, ya'ni **ombor
o'zgarishlari (G4) jonliga CHIQMAYDI**.

**Branch:** `kassa-qarzi-q1-q2` @ **`456e53af`**

```
456e53af test(hr): onboarding kalendar bombasini muzlatish (3ebc9ffe dan ko'chirildi)
ac1c5317 docs(reja): q2 hisoboti
207b9e3f test(qarz): q2 zondi — lokal dev bazada HAQIQIY unique indeks bilan
9d89746c feat(qarz): q2 — kassa cheki undirish reyestriga qator ochadi
038076d8 feat(qarz): q1 — Debt hujjat-manba bog'lami, sof modul, recompute filtri
4f5c1750 feat(ombor): h5 ← ASOS: G4 KODIDAN OLDINGI oxirgi commit
```

**Nega asos aynan `4f5c1750`:** G4 ning kodi `3ebc9ffe` dan boshlanadi, ya'ni
`4f5c1750` — G4 ga tegishli bir qator ham bo'lmagan oxirgi nuqta. Undan
oldingi H2/H5 commitlari faqat skript va hujjat (POS xulqiga tegmaydi).

**Tekshirilgan (shu branch ustida, ALOHIDA worktree'da, to'liq qayta o'lchov):**

| Tekshiruv | Natija |
|---|---|
| G4 kodi bormi (`resolveAllocStores`/`readBrakStore`/`retailSalePositionAllocation`/`readPosPriority`) | **0 ta** — YO'Q |
| Q2 kodi joyidami (`lockCounterpartyBalance`/`writeSaleDebtRegistryRow`/`SALE_DEBT_SOURCE_DOC_TYPE`) | 8 ta — BOR |
| Q1 migratsiyasi | `20260825120000_debt_source_doc` BOR, mazmuni AYNAN o'sha |
| Q1 sxema ustunlari | `sourceDocType`/`sourceDocId` BOR |
| G4 migratsiyasi va sxema ustunlari | YO'Q (114 qator kam — ataylab) |
| `apps/api` to'liq vitest | **632 fayl · 8865 test YASHIL**, 1 fayl / 2 test skip |
| typecheck | 0 xato |
| lint gate | 0 error (1176 warning) |

**Cherry-pick'da bitta konflikt bo'ldi va u ahamiyatsiz:** `docs/progress.json`
dagi `generatedAt` vaqt tamg'asi (generatsiya qilingan fayl) — Q1 niki olindi.

**Bitta QO'SHIMCHA commit (`456e53af`) — nima uchun:** `3ebc9ffe` (G4-1)
ichida G4 ga aloqasi YO'Q bitta tuzatish ham bor edi —
`onboarding.service.test.ts` dagi **kalendar bombasi** (2026-08-25 da
`daysLeft` aynan 7 = `EVALUATION_WARN_DAYS` bo'lib `in_probation` → `due_soon`
ga o'tadi). G4 kodisiz branch bu test bilan qizil bo'lardi, shuning uchun
**faqat o'sha bitta test fayli** ko'chirildi — G4 mantig'idan bir qator ham
emas (yuqoridagi «G4 kodi bormi» qatori buni tasdiqlaydi).

⚠️ **Bu qo'shimcha shu branch'dagi hisobot nusxasida YO'Q** (u `ac1c5317` da
muzlagan). Deploy branch'i ataylab KOD-MUZLATILGAN holda qoldirildi; hujjatning
kanonik nusxasi — `yacheyka-inventarizatsiya` dagi shu fayl.

**Qolgan qadamlar (hech biri bajarilmagan):**

1. `git push mirfayz kassa-qarzi-q1-q2` — **buyruq kutilmoqda**.
2. VPS deploy (qoida 8 retsepti) — **parol kutilmoqda**:
   fetch + `merge --ff-only` → **migratsiya** (`prisma db execute --file
   .../20260825120000_debt_source_doc/migration.sql` + `migrate resolve
   --applied 20260825120000_debt_source_doc` + `prisma generate`) →
   `build:web` → `pm2 restart sherset-v2-api` (**api SHART** — o'zgarish api'da)
   va web.
3. Deploy oldidan/keyin `packages/db` da `npx tsx scripts/warehouse-state.ts`
   (qoida 8) — Q2 ombor holatiga tegmasa ham, deploy KASSAGA tegadi.
4. Yuqoridagi «Jonli tekshiruv retsepti» (mezon 9–13) + qoida 13 uchma-uch
   smoke.

**Faza yopilmagan:** qabul mezonining 9–13 bandlari HAMON ochiq. Holat —
**QISMAN**.

### Q3 — Simmetriya: vozvrat va tahrir · 2026-08-25 · **QISMAN** (jonli tasdiq kutilmoqda)

**Xulq O'ZGARDI.** Q2 dan keyin chekdan tug'ilgan reyestr qatori endi chek
qaytarilganda va tahrirlanganda BALANS BILAN BIRGA harakatlanadi (invariant 2).
Ilgari (Q2 dan keyin, Q3 dan oldin) qaytarilgan tovar uchun undirish ro'yxati
hamon pul talab qilib turardi va 14 kundan keyin mijozga eslatma ketardi.

Commit: **`633e2ebd`** (branch `yacheyka-inventarizatsiya`).

#### Bog'liqlik holati (qoida 11 — ochiq aytiladi)

Q2 «QISMAN» (jonli tasdiq 9–13 bandlari ochiq, deploy qilinmagan). Q3 ular
tufayli FUNKSIONAL bloklanmaydi — Q3 kodi Q2 KODIGA tayanadi, jonli tasdiqqa
emas — lekin Q3 ning O'Z jonli mezoni ham AYNAN o'sha deploy'ga bog'liq.
Egasining ko'rsatmasi bo'yicha Q3 bajarildi; ochiq bandlar pastda takrorlanadi.

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `apps/api/src/modules/debt/sale-debt-registry.ts` | **YANGI sof funksiya** `saleDebtMoveNoteText()` (harakat izohi matni) + `SaleDebtDeltaPlan` ga `paidMinorAtMove` |
| 2 | `apps/api/src/modules/retail-sale/retail-sale.service.ts` | **YANGI** `moveSaleDebtRegistryRow()`; `refund()` va `edit()` ga ulash; `edit()` ga balans QULFI; `refundedAt`/`editedAt` yagona instantga keltirildi; `cancel()` ga tekshiruv natijasi izoh bo'lib yozildi |
| 3 | `apps/api/src/modules/debt/sale-debt-registry.mock.ts` | Q3 uchun kengaytirildi: `debt.update`, `$queryRaw` ning IKKINCHI shakli (`debts … FOR UPDATE`), kontragent kesimidagi balans |
| 4 | `apps/api/src/modules/retail-sale/retail-sale-debt-registry-symmetry.test.ts` | **YANGI**, 22 test |
| 5 | `apps/api/src/modules/debt/sale-debt-registry.test.ts` | +7 test (izoh matni 6 + `paidMinorAtMove` 1) |
| 6 | `apps/api/src/modules/retail-sale/retail-sale-refund-debt.test.ts` | harness'ga reyestr delegatlari (umumiy mock'dan, NUSXA emas) + `registryRow` opsiyasi |
| 7 | `apps/api/src/scripts/recompute-counterparty-balances.ts` | 🔴 eskirgan da'vo tuzatildi (pastga qarang) |
| 8 | `apps/api/src/scripts/counterparty-balance-sources.{ts,test.ts}` | reyestr yozuvchisi «balans manbasi EMAS» deb qayd etildi + **+1 qo'riqchi test** |

**Harakatlantiruvchining shakli** (`moveSaleDebtRegistryRow`):

```
valyuta ≠ UZS            ⇒ 'skipped_currency'  (Q2 qator ochmagan — §2.3)
qator qulflanadi          SELECT id FROM debts WHERE source_doc_id=… FOR UPDATE
qator yo'q                ⇒ 'missing'  + ogohlantirish logi (JIM emas)
plan ← planSaleDebtDelta(totalMinor, paidMinor, eski/yangi qoldiq)
o'zgarish yo'q            ⇒ 'noop'
aks holda                 debt.update(totalMinor/status/closedAt/nextContactAt
                                      [+counterpartyId]) + DebtNote(debt_issue)
```

🔴 **`applyDelta` bu yerdan CHAQIRILMAYDI** — balansni chekning O'Z yo'li
harakatlantiradi (`refund()` dagi `−debtReturn`, `edit()` dagi delta).
Kod-shakl testi buni qulflaydi.

#### 🔴 Rejadan UCHTA ataylab chekinish

**1. Mijoz almashganda «eski qator yopiladi + yangisi ochiladi» EMAS, qator
KO'CHADI.** Reja Q3 vazifa 2 shunday yozgan edi, lekin **Q1 ning unique
indeksi buni imkonsiz qiladi**: `@@unique([accountId, sourceDocType, sourceDocId])`
bitta chekka BITTA qator beradi (soft-delete ham indeksni band qilib turadi —
Q2 hisobotining `DELETE` izohi). Shuning uchun qator chekning joriy
qarzdoriga ERGASHADI: `counterpartyId` yangilanadi, summasi §2.2 kesishuv
qoidasi bilan yangi mijozning balansidan qayta hisoblanadi, `DebtNote` da
eski mijoz id'si qoladi.

**2. Qatorga TO'LOV tushgan bo'lsa ko'chirish RAD ETILADI.** `DebtPayment`
qatorlari ESKI mijozning pulini bildiradi va qator bilan birga ko'chardi —
bir mijozning to'lovi boshqasining tarixiga yozilardi. Bunday holatda qator
eski mijozda `paidMinor` ga tekislanib YOPILADI, `DebtNote` + ogohlantirish
logi yoziladi. Yangi mijozning qarzi BALANSDA ko'rinadi va u kassaga to'lov
qilganda P1 adopsiyasi orqali reyestrga kiradi (mavjud, jonlida sinalgan yo'l).
**Bu — ochiq chegara, «Ochiq qolganlar» 3-bandida qayd etilgan.**

**3. `edit()` da qator YO'Q bo'lsa Q2 yozuvchisi chaqiriladi.** Reja buni
faqat mijoz almashgan holat uchun yozgan edi; amalda «avans qoplagani uchun
qator ochilmagan chek keyin tahrirlanib qarz tug'ildi» holati ham bor va
usiz yangi qarz yana ko'rinmas bo'lardi — ya'ni egasining shikoyati tahrir
yo'li orqali qaytardi. §2.2 chek qarzidan OLDINGI balansdan yuradi
(`balansOldin − shu chekning eski ulushi`), aks holda chek qarzi ikki marta
sanalardi.

#### `cancel()` — TEKSHIRUV NATIJASI (Q3 vazifa 3)

**O'ZGARISH KERAK EMAS, dalil bilan.** `cancel()` faqat
`CANCELLABLE = ['draft','picking','ready']` holatlaridan yuradi
(`retail-sale-fsm.ts`) — ya'ni chek hali POST QILINMAGAN. Qarz esa (balansda
ham, reyestrda ham) FAQAT `post()` da tug'iladi. Post qilingan chekni «bekor
qilish» yo'li — `refund()`, va u Q3 da qoplandi.

Premise ikki test bilan QULFLANDI: (a) `allowedFrom('cancel')` da `'posted'`
yo'q; (b) `cancel()` tanasida reyestr chaqiruvi yo'q. Kimdir `CANCELLABLE` ga
`'posted'` qo'shsa test qizil bo'lib Q3 ni qayta ko'rishga majbur qiladi.

#### Test natijalari (raqam bilan) — ALOHIDA WORKTREE'da o'lchandi

⚠️ **Nega worktree:** sessiya davomida BOSHQA sessiya (G6 — TSD ish ekranlari)
`retail-sale.service.ts`, `product-cell-move.service.ts` va `restock-task.*`
fayllarini ayni paytda tahrirlayotgan edi va ularning tugallanmagan ishi ikkita
test faylini qizil qilib turardi. Aralashgan daraxtda o'lchangan raqam halol
bo'lmasdi. Shuning uchun `git worktree add --detach HEAD` bilan alohida checkout
ochilib, unga FAQAT mening hunk'larim qo'llandi (§6.5 — Q2 sabog'i; bu safar
`stash` UMUMAN ishlatilmadi).

| O'lchov | Baza (HEAD, toza) | Q3 bilan | Delta |
|---|---|---|---|
| `apps/api` to'liq vitest | **641 fayl · 9004 test** | **642 fayl · 9034 test** | **+1 fayl, +30 test** |
| skip | 1 fayl / 2 test | 1 fayl / 2 test | 0 |
| typecheck (`tsc --noEmit`) | 0 xato | **0 xato** | — |

+30 = 22 (simmetriya fayli) + 7 (sof modul) + 1 (qamrov qo'riqchisi). **Boshqa
hech bir test o'zgarmadi** — ikkala o'lchov ham AYNI worktree'da, ketma-ket.

Asosiy daraxtda (parallel sessiya ishi bilan aralash):
- `retail-sale` + `debt` + `scripts` kesimi: **76 fayl · 1043 test YASHIL**;
- `node scripts/check-lint.mjs`: **mening fayllarimda 0 error** (qolgan 3 format
  xatosi — parallel sessiyaning tugallanmagan fayllari, TEGILMADI);
- `pnpm i18n:gate`: **19 test yashil** (Q3 da yangi UI matni YO'Q — server tomoni).

**22 yangi simmetriya testi nimani qulflaydi:**

| Guruh | Testlar |
|---|---|
| `refund()` | to'liq vozvrat → qator `paid` + `closedAt` + `nextContactAt: null` · qisman → kamaydi, ochiq qoldi · **invariant 2: balans deltasi = reyestr deltasi** · **invariant 1: `applyDelta` AYNAN 1 marta** · avans qisman qoplagan qator noldan pastga tushmaydi · **NIZO: `paidMinor` dan pastga tushmaydi + DebtNote** · qatorsiz eski chek → vozvrat BUZILMAYDI + warn · qarzsiz chek → reyestrga tegilmaydi · USD yashiq → qulf ham olinmaydi |
| `edit()` | qarz kamaydi → qator kamaydi · qarz oshdi → qator oshdi · **mijoz almashdi → qator KO'CHDI** · mijoz almashdi + yangi mijozda AVANS → qator YOPILDI (invariant 4) · **to'lov bor → KO'CHIRILMADI, eskida yopildi** · qator yo'q edi + qarz tug'ildi → **Q2 yozuvchisi qator ochdi** · USD yashiq → tegilmaydi |
| `cancel()` | `CANCELLABLE` da `posted` yo'q · `cancel()` tanasida reyestr yo'q |
| Kod shakli | harakatlantiruvchi `applyDelta` ni chaqirmaydi · qulf `FOR UPDATE` + `FROM debts` + `ORDER BY id ASC` · `refund()` da harakat balansdan KEYIN · `edit()` da qulf `applyDelta` dan OLDIN |

**Testning o'zi bitta haqiqiy nozik joyni topdi:** izoh matni `debt.update`
dan KEYIN qurilsa, mock (va ba'zi ORM yo'llari) obyektni joyida
o'zgartirgani uchun matn «eski mijoz» o'rniga YANGISINI yozib qo'yardi.
Tuzatildi: `previousTotalMinor` / `previousCounterpartyId` `update` dan OLDIN
olinadi.

#### 🔴 Eskirgan izoh tuzatildi (Q2 ning 3-eslatmasi bajarildi)

`recompute-counterparty-balances.ts` da «`totalMinor` create'dan keyin
o'zgarmaydi (Debt'da uni tahrirlaydigan yo'l yo'q)» degan da'vo bor edi.
**Q3 uni buzdi.** Skript BARIBIR to'g'ri qoladi (Q3 harakatlantiradigan
qatorlar `balanceAdopted = true`, ya'ni Q1 filtri ularni chiqarib tashlaydi),
lekin izoh yangilanmasa keyingi o'quvchi «demak filtrni olib tashlasa ham
bo'ladi» degan xulosaga kelardi — F5 sabog'i. Izoh eski matn tarixi bilan
qayta yozildi va **qo'riqchi test** qo'shildi
(`counterparty-balance-sources.test.ts`): harakatlantiruvchi rostdan ham
`totalMinor: plan.nextTotalMinor` yozishi VA skript izohi buni aytishi
tekshiriladi.

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Balans / pul — TEGILMAYDI (invariant 1).** Harakatlantiruvchi
   `applyDelta` ni chaqirmaydi (kod-shakl testi). `refund()`/`edit()` dagi
   mavjud balans chaqiruvlari BAYT ham o'zgarmadi — testlardan biri buni
   `applyDelta` chaqiruvlari soni va argumentlari bilan tekshiradi.
2. **Mijozga Telegram xabari — O'ZGARMAYDI.** Xabar `applyDelta` ning
   `source` argumentidan ketadi; yangi yo'l uni chaqirmaydi ⇒ vozvratda
   ilgarigidek BITTA «↩️ Qarzingizdan ayirildi» ketadi.
3. **Vozvrat / tahrir yo'li — MAVJUD XULQ BUZILMAYDI.** Qator topilmasa
   (Q2 dan oldingi cheklar — jonlida hozircha HAMMASI shunday) yo'l `missing`
   qaytaradi, `throw` QILMAYDI: eski cheklar avvalgidek qaytariladi.
   Regressiya qo'riqchisi — `retail-sale-refund-debt.test.ts` ning mavjud
   testlari (hammasi yashil).
4. **Undirish ro'yxati / eslatma cron'i — HAJMI KAMAYADI (maqsad).**
   Qaytarilgan cheklar endi ro'yxatdan chiqadi. Yopilgan qatorda
   `nextContactAt: null` ⇒ `debt-reminder.service.ts` uni ko'rmaydi.
5. **POS «Qarz to'lovi» oynasi / FIFO — TEGILMAGAN.** `paidMinor` ga
   yozilmaydi, `DebtPayment` yaratilmaydi. `payableMinor = max(reyestr, balans)`
   — ikkalasi ham teng kamaygani uchun son to'g'ri qoladi.
6. **POS to'lovi bilan POYGA — QULFLANGAN.** Harakatlantiruvchi qatorni
   `FOR UPDATE` bilan oladi; `pos-debt-payment.service.ts#lockOpenDebts` ham
   shu jadvalni shu tartibda qulflaydi. Qulf TARTIBI **BALANS → QARZLAR**
   (P1/Q2 bilan bir xil): `applyDelta` balans qatorini `upsert` bilan
   qulflab bo'lgandan KEYIN qarz qulfi olinadi ⇒ deadlock yo'q.
7. **`edit()` da IKKI kontragent qulflanishi mumkin** (mijoz almashgan holat) —
   tartib id bo'yicha DETERMINISTIK saralangan, aks holda mijozlarni
   bir-biriga almashtiruvchi ikki tahrir deadlock qilardi.
8. **Akt-sverka — O'ZGARMAYDI.** `debtRegistryOutstandingMinor` «saldoning
   TARKIBI» premise'i `balanceAdopted` qatori uchun to'g'ri qoladi.
9. **`recompute` cross-check'i — shovqin OSHMAYDI** (yuqoridagi band).
10. **Smena hisobi / kutilgan naqd — TEGILMAGAN.** Reyestr qatori pul emas.
11. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** Q3 `stock`, `store-cell`,
    `retail-allocation` fayllariga bir qator ham yozmadi. `refund()` ning
    ombor kaskadi (`refundStoreId`) o'zgarmadi.
12. **`cancel()` — TEGILMAGAN** (yuqorida dalil bilan).
13. ⚠️ **Chegara: mijoz almashgan + qatorga to'lov tushgan holat** — yangi
    mijozning qarzi reyestrda KO'RINMAYDI (balansda ko'rinadi). Bu JIM emas:
    `DebtNote` + ogohlantirish logi. Q4/Q5 da ko'rib chiqilsin.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | to'liq vozvrat → qator `paid` | ✅ test |
| 2 | qisman vozvrat → `totalMinor` kamaydi, ochiq qoldi | ✅ test |
| 3 | to'langan qarzga vozvrat → `paidMinor` dan pastga tushmadi + `DebtNote` | ✅ test |
| 4 | tahrirda summa o'zgardi | ✅ test |
| 5 | agent o'zgarganda qator to'g'ri mijozda | ✅ test (**ko'chirish** bilan — chekinish 1) |
| 6 | qatorsiz eski chek — vozvrat BUZILMADI | ✅ test |
| 7 | balans deltasi va reyestr deltasi AYNAN teng (invariant 2) | ✅ test |
| 8 | `cancel()` tekshirildi va yozma javob berildi | ✅ (yuqorida) |
| 9 | api testlari to'liq yashil | ✅ 9034 (izolyatsiyalangan o'lchov) |
| 10 | **jonlida: qarzga post → undirish ro'yxatida chiqadi** | ❌ **VPS/deploy kerak** |
| 11 | **jonlida: to'liq vozvrat → ro'yxatdan yo'qoladi VA balans nolga qaytadi** | ❌ VPS kerak |
| 12 | **jonlida: qisman vozvratda ikkala daftardagi qoldiq bir xil son** | ❌ VPS kerak |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 10–12 bandlari.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi.
Q3 Q1+Q2 ustiga quriladi va ular ham hali jonliga chiqmagan
(`kassa-qarzi-q1-q2` @ `456e53af` — **push QILINMAGAN**). Ya'ni Q3 ni alohida
chiqarish mumkin emas: uch faza BITTA deploy oynasida beriladi.

🔴 **Deploy branch'i YANGILANISHI KERAK:** `kassa-qarzi-q1-q2` da Q3 YO'Q.
Q2 dagi cherry-pick retsepti bilan `633e2ebd` ni ham ko'chirish kerak (yoki
branch'ni `kassa-qarzi-q1-q3` nomi bilan qayta yig'ish). Bu Q3 sessiyasida
QILINMADI — buyruq kutilmoqda (Q2 da cherry-pick qarorini egasi o'zi bergan edi).

Migratsiya: yangisi YO'Q. Q1 niki (`20260825120000_debt_source_doc`) hamon
VPS'da BERILMAGAN va u Q2/Q3 dan OLDIN berilishi SHART.

#### Jonli tekshiruv retsepti (deploy'dan KEYIN)

Deploy oldidan/keyin (qoida 8): `packages/db` da `npx tsx scripts/warehouse-state.ts`.

1. Sinov mijozga (balansi 0) kichik summali chek QARZGA post → `/menejer/undirish`
   da `upcoming` chelagida chiqadi (Q2 mezoni 9).
2. **To'liq vozvrat** (`refund`) → mijoz undirish ro'yxatidan YO'QOLADI VA
   kontragent balansi nolga qaytadi — **ikkalasi birga**.
3. Yana bir chek qarzga post → **QISMAN vozvrat** (masalan yarmi) →
   undirish ro'yxatidagi qoldiq va kontragent kartasidagi balans **AYNAN BIR
   XIL SON** bo'lishi tekshiriladi (invariant 2 ning jonli isboti).
4. Chek TAHRIRI: qarz ulushini kamaytirish → undirish ro'yxatidagi son ham
   o'sha zahoti kamayadi.
5. Uchma-uch smoke (qoida 13): bitta sotuv (post → tekshir → cancel), bitta
   yacheyka sanash, bitta ko'chirish.
6. Izni tozalash — **endi QO'LDA KERAK EMAS**: Q3 dan keyin to'liq vozvrat
   qatorni o'zi yopadi. Qator butunlay ketishi kerak bo'lsa Q2 hisobotidagi
   `DELETE` retsepti o'z kuchida qoladi.

#### 🔴 SESSIYA HODISALARI (ikkalasi ham qayd etiladi — qoida 14 ruhida)

**1. Skript fayli bir lahza truncate bo'ldi va HEAD'dan tiklandi.**
`recompute-counterparty-balances.ts` ni python bilan tahrirlashda kodlash
xatosi (`UnicodeEncodeError`) fayl OCHILGANDAN KEYIN otildi — ya'ni fayl
truncate bo'lib, yozilmadi (506 → 1 qator). Darhol `git checkout --` bilan
FAQAT o'sha bitta yo'l bo'yicha tiklandi (fayl toza edi, boshqa sessiyaning
o'zgarishi yo'q edi — `git status` bilan oldindan tekshirilgan). Keyin tahrir
`Edit` vositasi bilan qayta qilindi. **Saboq: bu repoda `.ts` fayllarni python
`io.open(...,'w')` bilan yozish XAVFLI** — kodda surrogate belgilar bor va
strict encoder yozishdan OLDIN faylni truncate qilib qo'yadi.

**2. 🔴 `rm -rf` worktree junction'lari ichiga kirib `node_modules` va
Prisma klientini O'CHIRDI.** Worktree'ni tozalashda `node_modules`
junction'larining bir qismi (`apps/api`, `apps/web`, `apps/marketing`,
`packages/config`) uzilmagan holda `rm -rf` yugurtirildi; u junction'lar
ichiga kirib **asosiy reponing** `node_modules` daraxtlarini va
`packages/db/src/generated` (Prisma klienti) ni o'chirdi.

- **Yo'qotish:** faqat git kuzatmaydigan build artefaktlari.
  `git status` da BIRORTA ham `D` (o'chirilgan kuzatiladigan fayl) yo'q —
  tekshirildi. Parallel sessiyaning barcha untracked fayllari (android `.kt`,
  `client-op.ts`, migratsiya, rollback SQL) joyida.
- **Tiklash:** `corepack pnpm install --frozen-lockfile` (873 paket,
  `pnpm-lock.yaml` O'ZGARMADI) + `npx prisma generate`
  (`packages/db/src/generated`). Keyin typecheck 0 xato, testlar yashil —
  muhit to'liq tiklandi.
- **Saboq (keyingi sessiyalarga):** worktree'ni o'chirishdan OLDIN
  `node_modules` junction'larini BITTALAB uzib chiqing va HAR BIRINI
  tekshiring; `rm -rf` Windows'da directory junction ICHIGA KIRADI.
  Xavfsizrog'i: worktree'ga `node_modules` ni junction qilmasdan, o'sha yerda
  alohida `pnpm install` qilish.

#### Ochiq qolganlar

1. **Q1 dan meros (o'zgarishsiz):** `recompute` cross-check'iga `opening`
   manbasi qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani
   tekshirilmagan (VPS kirishi kerak).
2. **Q2 dan meros:** jonli tasdiq (mezon 9–13), deploy branch'i push
   qilinmagan.
3. **Q3 ning O'Z chegarasi:** mijoz almashgan VA qatorga to'lov tushgan
   holatda yangi mijozning qarzi reyestrda ko'rinmaydi (balansda ko'rinadi,
   `DebtNote` + log bilan qayd etiladi). Unique indeks bitta chekka bitta
   qator berganicha bu chegarani faqat «to'lovlarni ajratish» (yangi jadval)
   olib tashlaydi — bu Q3 hajmidan tashqarida.
4. **Deploy branch'iga Q3 ni ko'chirish** — buyruq kutilmoqda.

#### Keyingi fazaga (A1/Q4) eslatmalar

1. `moveSaleDebtRegistryRow` ikki rejimli: `delta` (vozvrat — eski/yangi
   qoldiq) va `absolute` (tahrir — mutlaq summa + ixtiyoriy `retargetToId`).
   Yangi chaqiruvchi qo'shsangiz REJIMNI ataylab tanlang.
2. **A2 (`PREPAY` tender) vozvrati** `refund()` ning `debtReturn` blokidan
   TASHQARIDA qurilsin: avans qaytishi reyestr qatorini harakatlantirmaydi
   (avans qarz emas — invariant 4). Q3 ning bloki AYNAN
   `if (debtReturn > 0n && debtorId)` ichida turibdi, ya'ni ular tabiiy
   ajralgan.
3. **A2 `recompute` ga `PREPAY` manbasini qo'shishni UNUTMANG** — Q1 §2.1
   yorig'ining aynan takrori bo'lardi. Q3 shu faylga tegdi, lekin faqat izoh
   va qo'riqchi darajasida; yangi manba QO'SHILMADI.
4. `edit()` da endi balans QULFI bor (`lockCounterpartyBalance`, id bo'yicha
   saralangan tartib). Yangi kontragent qulfi qo'shilsa AYNAN shu ro'yxatga
   qo'shing, alohida joyda olmang — deadlock tartibi shu yerda.
5. Q4 undirish ekraniga `source` maydonini qo'shganda chek raqami
   `Debt.comment` ichida ham bor (`Kassa cheki «CHK-…» bo'yicha qarz`) —
   lekin unga TAYANMANG, `sourceDocId` orqali `RetailSale` dan o'qing
   (izoh matni o'zgarishi mumkin).

### A1 — Kassada avans qabul qilish · 2026-08-25 · **QISMAN** (lokal baza sinovi + jonli tasdiq kutilmoqda)

**Xulq O'ZGARDI.** Kassir endi mijozdan oldindan to'lov (avans) qabul qila
oladi: pul kassa yashig'iga tushadi, mijoz balansi MANFIY tomonga suriladi
(«biz mijozga qarzdormiz») va smena kutilgan naqdiga o'z-o'zidan kiradi.
Egasining ikkinchi shikoyatining («ishlay olmayapmiz») QABUL tomoni yopildi;
SARFLASH (A2) va KO'RSATISH/QAYTARISH (A3) hali qurilmagan.

Commit: **`8d1f4a01`** (branch `yacheyka-inventarizatsiya`, 29 fayl, +2055/−11).

#### Bog'liqlik holati (qoida 11 — ochiq aytiladi)

A1 ning sharti — «Q1 tugagan bo'lsin». Q1 holati **«QISMAN»** (ikki bandi
ochiq: `recompute` cross-check'iga `opening` manbasi; jonlida `APPLY=1`
yugurtirilgan-yugurtirilmagani). Egasi Q2 va Q3 ni ham aynan shu sharoitda
davom ettirishga ruxsat bergan va A1 ni ochiq buyurgan. A1 ular tufayli
FUNKSIONAL bloklanmaydi: A1 Q1 ning sof modulini (`receivablePortion`)
UMUMAN chaqirmaydi — u kesishuv qoidasi Q2 ning qarz yo'lida kerak, avans
yo'lida esa hech qanday reyestr qatori tug'ilmaydi. Q1 dan meros ochiq
bandlar o'zgarishsiz qoladi va pastda takrorlanadi.

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `packages/db/prisma/schema.prisma` (`model RetailDrawerCashIn`) | `kind String @default("other") @db.VarChar(20)` + ikki indeks (`[accountId,retailShiftId,kind]`, `[accountId,agentId,kind]`) + to'liq izoh (nega alohida jadval EMAS) |
| 2 | `packages/db/prisma/migrations/20260825220000_drawer_cash_in_kind/migration.sql` | idempotent DDL: `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` ×2 |
| 3 | `apps/api/src/modules/cashier-session/pos-cash-in.ts` | **YANGI sof modul** — `pos-cash-out.ts` ning kirim tomonidagi ko'zgusi |
| 4 | `apps/api/src/modules/cashier-session/cashier-session.service.ts` | **YANGI** `customerPrepay()`, `cashInDoc()`, `cashInSummary()`; `drawerCashIn()` endi `kind='topup'` yozadi; `zReport()` ga `prepayMinor` |
| 5 | `apps/api/src/modules/cashier-session/cashier-session.controller.ts` | `POST :id/customer-prepay`, `GET cash-in/:docId`, `GET :id/cash-in-summary` |
| 6 | `apps/api/src/modules/cashier-session/cashier-session.schema.ts` | `CustomerPrepaySchema` (summa MAJBURIY — `CustomerPayoutSchema` dan farqi) |
| 7 | `apps/api/src/modules/cashier-session/shift-variance.ts` | `ZReportInput.prepayMinor?` + `ZReport.prepayMinor` (ixtiyoriy ⇒ mavjud chaqiruvchilar buzilmaydi) |
| 8 | `apps/api/src/modules/counterparty-balance/counterparty-balance-doc-types.ts` | `BALANCE_DOC_TYPE.customerPrepay` (nega `cashIn` qayta ishlatilmagani izohda) |
| 9 | `apps/api/src/modules/counterparty-balance/counterparty-balance-doc-resolver.ts` | `customerPrepay` → `retailDrawerCashIn` (АВ- raqami) |
| 10 | `apps/api/src/scripts/recompute-counterparty-balances.ts` | 🔴 **`SOURCE: customer-prepays`** bloki (`−sumMinor`) + sarlavha formulasi |
| 11 | `apps/api/src/scripts/counterparty-balance-sources.ts` | `SCRIPT_SOURCES` ga `customer-prepays`; `cashier-session.service.ts` yozuvi ikki manbali bo'ldi |
| 12 | `apps/web/src/app/print/cash-in/[docId]/page.tsx` | **YANGI** — PKO cheki (imzo satri bilan) |
| 13 | `apps/web/src/components/pos/customers-panel.tsx` | «Avans qabul qilish» tugmasi + summa bloki + PKO chop; sarlavha izohidagi ESKIRGAN da'vo bekor qilindi |
| 14 | `apps/web/src/app/(app)/retail/sessions/[id]/page.tsx`, `lib/z-report-receipt.ts`, `lib/use-z-receipt-labels.ts` | Z-hisobotda «Mijozlardan avans» qatori |
| 15 | `apps/web/src/messages/{ru,uz}.json` | 6 yangi kalit (5 POS + 1 Z-hisobot), ikkala tilda |
| 16 | `apps/web/src/__tests__/pos-i18n-guard.test.ts` | `customers-panel.tsx` qo'riqchi ro'yxatiga QO'SHILDI |
| 17 | 4 yangi test fayli + 2 mavjudga qo'shimcha | pastga qarang |

**Endpointning shakli** (`customerPrepay`):

```
session ← loadOpenShiftForDrawer   (ochiq · O'Z smenasi · SO'M kassa)
agent   ← counterparty.findFirst   (topilmasa 404)
validateCashIn(...)                 (sof modul; buzuq hujjat ⇒ 400)
balansOldin ← counterpartyBalance.findFirst   ← FAQAT AUDIT UCHUN
raqam  ← allocateDocumentNumber('АВ-YYYY-')     (race-safe)
$transaction:
    retailDrawerCashIn.create({ kind:'customer_prepay', agentId })
    cashierAuditEvent (CUSTOMER_PREPAY)
    money.applyDeltas(drawerMoneyDeltas({kind:'in'}))    → CashDesk +summa
    balance.applyDelta(−summa, docType:'customerPrepay') → mijoz balansi
```

#### 🔴 Rejadan UCHTA ataylab chekinish

**1. Balans `FOR UPDATE` bilan QULFLANMAYDI.** Q2/Q3 da qulf MAJBURIY edi,
chunki u yerda balansning oldingi qiymati QAROR beradi (§2.2 kesishuv
qoidasi: qator ochiladimi va qanchaga). A1 da esa **hech qanday qaror
balansga bog'liq emas** — cap yo'q, mijoz qancha bersa shuncha yoziladi, va
`applyDelta` ning o'zi `upsert` bilan atomar. Qulf olinsa u BALANS →
QARZLAR tartibiga yangi ishtirokchi qo'shardi (deadlock yuzasi), foydasi
esa nol. `balanceBeforeMinor` faqat audit payloadida va javobdagi
`balanceAfterMinor` da — ikkalasi ham AXBOROT, qaror emas.
⚠️ **A2 uchun bu boshqacha bo'ladi:** u yerda cap bor (`prepayMinor ≤
−balansOldin`), demak qulf MAJBURIY. Ikkovini aralashtirmang.

**2. `RetailDrawerCashIn` ga `kind` ustuni qo'shildi** (reja «yangi jadval
kerakmi» degan savolni ochiq qoldirgan edi). Alohida jadval ochilsa
kutilgan-naqd formulasi (`collectCashInputs.drawerInMinor`) uni KO'RMASDI
— bu §100 bug'ining («drawer in/out kutilgan naqddan tushib qolgan edi»)
aynan takrori bo'lardi. `RetailDrawerCashOut.kind` da AYNI qaror allaqachon
qabul qilingan va sxema izohida asoslangan; kirim tomoni shu bilan
simmetrik qilindi. Natijada avans hujjati kutilgan naqdga **bir qator kod
yozmasdan** kiradi.

**3. Default `'other'`, `'topup'` EMAS.** Mavjud «Внесение» yozuvlari
retroaktiv tasniflanmaydi — ular haqiqatan tasnifsiz yozilgan
(`retail_drawer_cash_out.kind` bilan bir xil qaror). Yangi
`drawerCashIn()` esa `'topup'` yozadi.

#### 🔴 STORNO QARORI (vazifa 5) — asoslash

**Tanlov: A3 ning `POST /cashier-sessions/:id/customer-prepay-refund` i.
A1 da `cancel` yo'li QURILMADI.** Sabablar:

1. **Pul jismonan yashiqda.** «Bekor qilish» kassa qoldig'idan `−summa`
   qilishi kerak, ya'ni u aslida **pul CHIQISHI** — RKO turkumidagi amal,
   `cancel` emas. Uni `cancel` deb atash kassirni chalg'itardi va
   `RetailDrawerCashIn` da soft-delete yo'lini ochardi; bu repoda pul
   hujjati «pul izining o'zi» deb ta'riflangan (`RetailDrawerCashOut`
   `Restrict` izohi) va uni o'chirish yo'li ATAYLAB yo'q.
2. **A3 ning 4-vazifasi AYNAN shu endpoint.** A1 da ikkinchi nusxasini
   qurish ikki yo'l qoldirardi va biri jimgina eskirardi.
3. **Oraliqdagi chegara OCHIQ aytiladi:** A3 gacha noto'g'ri kiritilgan
   avansni **kassir o'zi tuzata olmaydi**. Tuzatish yo'li — admin/menejer:
   `POST /cash-out` (kassadan pul chiqishi) + `CounterpartyAdjustment`
   (balansni teskariga surish). Ikkalasi ham mavjud va jonlida ishlaydi,
   lekin ikki hujjat va ikki ekran talab qiladi.
   ⚠️ **Egasiga aytilsin:** A3 gacha bo'lgan oynada kassirga «summani
   ikki marta tekshir» deyish kerak.

#### Test natijalari (raqam bilan)

| O'lchov | Natija |
|---|---|
| `apps/api` **to'liq** vitest | **650 fayl · 9161 test YASHIL**, 1 fayl / 2 test skip |
| `apps/web` **to'liq** vitest | **326 fayl · 4297 test YASHIL**, 26 skip |
| `apps/api` typecheck (`tsc --noEmit`, `--max-old-space-size=8192`) | **0 xato** |
| `apps/web` typecheck | **0 xato** |
| `node scripts/check-lint.mjs` | **0 error** (1182 warning — siyosat bo'yicha ruxsat) |
| `pnpm i18n:gate` | **19 test yashil** (15 800 statik kalit tekshirildi) |
| `prisma validate` | sxema yaroqli; `prisma generate` qayta yurgizildi |

**Yangi testlar — jami 69:**

| Fayl | Soni | Nimani qulflaydi |
|---|---|---|
| `cashier-session/pos-cash-in.test.ts` | **20** | sof modul: mijozsiz avans / mijozli «Внесение» — ikkalasi BUZUQ; `АВ-` ≠ `ВН-`; audit FAQAT avansda; `balanceBefore` `null` ≠ `0n`; guruhlash jami; **kirim ↔ chiqim simmetriyasi** (noma'lum tur ikkalasida ham `other` ga tushadi) |
| `cashier-session/customer-prepay.test.ts` | **18** | pul izi to'rt joyda; **🔴 `Debt` delegatiga BIR MARTA ham tegilmaydi** (tuzoq-mock); qarzdor mijozda balans qarzni yeydi; o'lchanmagan balans yo'lni to'smaydi; yopiq/begona smena, USD kassa, 404, nol/manfiy summa — HECH NARSA yozilmaydi; **poyga**: ikki parallel avans → ikki hujjat, ikki delta, raqamlar takrorlanmaydi; **«Внесение» regressiya qo'riqchisi** (`applyDelta` chaqirilmaydi); **5 ta kod-shakl qo'riqchisi** |
| `auth/kiosk-policy-customer-prepay.test.ts` | **19** | avans marshruti kioskda ochiq; **`/cash-in` daraxti YOPIQ** (8 yo'l); ro'yxatga YANGI QATOR qo'shilmagani o'lchanadi |
| `counterparty-balance/counterparty-balance-doc-resolver.test.ts` | **4** | `customerPrepay` AYNAN `RetailDrawerCashIn` dan; ПКО (`cashIn`) jadvaliga tegilmaydi; avans va vozvrat puli boshqa-boshqa jadval |
| `scripts/counterparty-balance-sources.test.ts` | **+2** | 🔴 yozuvchi ↔ reyestr ↔ skript bloki uch tomonlama qulf (manfiy ishora `groupBy` TANASIDAN o'qiladi, izohdan EMAS); `topup` manbaga kirmasligi |
| `pos/__tests__/customers-panel.test.tsx` | **+6** | tugma/blok xulqi; **smenasiz o'chiq**; default summa YO'Q; POST + PKO chop; **🔴 `/debts` ga bir marta ham POST ketmaydi** (invariant 4 ning FE ko'zgusi); mijoz almashsa blok yopiladi |

⚠️ **Bitta test to'liq yugurishda YIQILDI va u MENIKI EMAS:**
`src/modules/auth/tsd-device.service.test.ts` → «qurilma yo'q / bekor
qilingan / kalit noto'g'ri — BIR XIL 401» (G5, `623c6a18`). U vaqtga
sezgir (constant-time javob) va to'liq suite yukida 5097 ms da yiqildi;
**alohida yugurtirilganda 337 ms bilan YASHIL** (10/10). Ya'ni yuk ostida
beqaror test, A1 ga aloqasi yo'q. Halol ko'rinishi: **650 fayldan 649 tasi
doim yashil, 1 tasi yuk ostida beqaror.**

**⚠️ Bazaviy o'lchov IZOLYATSIYALANMAGAN.** Q3 dagidek alohida worktree
ochilmadi: sessiya davomida parallel sessiya (G6 — TSD ish ekranlari)
o'z ishini `700ba30e` + `61780120` bilan COMMIT QILDI, ya'ni daraxt toza
bo'lib qoldi va `git add` faqat o'z fayllarimni oldi (`git show --stat`
bilan tasdiqlangan). Absolyut raqamlar Q3 hisobotidagi 9034 bilan
solishtirilmaydi — orada G5/G6 testlari qo'shilgan. Ishonchli da'vo:
**to'liq suite yashil va yagona qizil test A1 ga tegishli emas.**

⚠️ **`docs/progress.json` commit'ga hook orqali qo'shildi** (generatsiya
qilinadigan fayl, 1 qator vaqt tamg'asi) — `git show --stat` da 29-fayl
bo'lib ko'rinadi. Bu begona sessiya ishi EMAS.

#### 🔴 QABUL MEZONINING OCHIQ BANDI — lokal dev bazada migratsiya

Qoida 7 «jonli bazaga yozadigan har qanday skript avval LOKAL dev bazada
sinaladi» deydi va Q1 migratsiyani `sherset_v2_dev` @ localhost'da IKKI
MARTA yugurtirib isbotlagan edi. **A1 da bu BAJARILMADI: bazaga ulanish
paroli yo'q** (`packages/db/.env` repoda yo'q; qoida 5 bo'yicha parol
foydalanuvchidan so'raladi va sessiya oxirida so'raldi).

Migratsiya idempotentligi KOD darajasida yozilgan (`ADD COLUMN IF NOT
EXISTS`, `CREATE INDEX IF NOT EXISTS`) va indeks nomlari Prisma
generatsiya qiladigan nomlar bilan bir xil qilib qo'yilgan (57 va 50
belgi, Postgres'ning 63 belgi chegarasidan past ⇒ truncation yo'q),
lekin bu **o'lchov emas, da'vo**. Yopish sharti quyidagi buyruq:

```
# 1-marta
npx prisma db execute --url "<DEV_URL>" \
  --file prisma/migrations/20260825220000_drawer_cash_in_kind/migration.sql
# 2-marta (AYNAN o'sha buyruq — no-op bo'lishi SHART)
# so'ng ustun va indekslar bazadan O'QIB tekshiriladi (Q1 hisobotidagi naqsh)
```

**Teskari yo'l (qoida 12; A1 migratsiyasi MA'LUMOTGA TEGMAYDI — bu
shunchaki DDL ni qaytarish):**

```sql
DROP INDEX IF EXISTS "retail_drawer_cash_in_account_id_agent_id_kind_idx";
DROP INDEX IF EXISTS "retail_drawer_cash_in_account_id_retail_shift_id_kind_idx";
ALTER TABLE "retail_drawer_cash_in" DROP COLUMN IF EXISTS "kind";
```

⚠️ Teskari yo'l `customerPrepay` yozgan hujjatlarni O'CHIRMAYDI — ular
tasnifsiz «Внесение» bo'lib qoladi va **kontragent balansi o'z holida
turadi** (avans daftarda saqlanadi). Ya'ni ustunni qaytarish pulni
yo'qotmaydi, faqat «bu avans edi» yorlig'ini yo'qotadi.

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Smena hisobi / kutilgan naqd — MAQSAD, va u KODSIZ ishlaydi.**
   `collectCashInputs.drawerInMinor` butun `retail_drawer_cash_in`
   jadvalini yig'adi va `kind` ni UMUMAN o'qimaydi ⇒ avans formulaga
   o'z-o'zidan kiradi. **Formulaga bir qator ham qo'shilmadi**, ya'ni
   «yangi turni qo'shishni unutish» xatosi tug'ilishi mumkin emas.
   ⚠️ Bu shuni ham anglatadiki, migratsiyadan keyin (avans kiritilmaguncha)
   smena hisobi **bir tiyin ham o'zgarmaydi**.
2. **«Внесение» (`drawerCashIn`) — XULQI O'ZGARMADI.** Faqat `kind='topup'`
   yozila boshladi va daftar izohi sof moduldan olinadi (matn AYNAN o'sha:
   «Внесение»). Kontragent balansiga tegmaydi — alohida qo'riqchi test
   bilan qulflandi (`balance.applyDelta` yo'q).
3. **Balans / pul — YANGI YOZUVCHI QO'SHILDI va u qamrovda.**
   `cashier-session.service.ts` allaqachon `DECLARED_BALANCE_WRITERS` da
   edi; unga IKKINCHI manba (`customer-prepays`) qo'shildi va
   `recompute-counterparty-balances.ts` ga mos blok yozildi. **Bu unutilsa
   cross-check har avansli mijozda yolg'on farq ko'rsatardi** — reja §2.1
   yorig'ining aynan takrori. Uch tomonlama qo'riqchi test qo'yildi.
4. **`Debt` reyestri / undirish ro'yxati / eslatma cron'i — TEGILMAYDI
   (invariant 4).** Avans yo'li `debt` va `debtNote` delegatlariga umuman
   murojaat qilmaydi (tuzoq-mock bilan o'lchandi) va manfiy balans hech
   qachon `Debt` qatori tug'dirmaydi. Undirish ro'yxati faqat `Debt`
   reyestridan o'qiydi ⇒ avansli mijoz u yerda CHIQMAYDI.
5. **Mijozga Telegram xabari — YANGI XABAR KETMAYDI.** Xabar `applyDelta`
   ning `source` argumentidan ketadi; A1 `source` bermaydi (faqat
   `docType`), ya'ni `source:'debt'` yo'li ochilmaydi. `debt-source-wiring`
   qo'riqchisi yashil. ⚠️ **Ochiq savol A2 uchun:** avansdan to'lashda
   mijozga xabar ketishi kerakmi — reja A2 ning 3-vazifasida shu savol
   turibdi, A1 da qaror QILINMADI.
6. **Akt-sverka / statement / POS tarixi — SALDO to'g'ri, YORLIQ hozircha
   yo'q.** Saldo docType ro'yxatiga UMUMAN bog'liq emas (Faza 10
   shartnomasi) ⇒ raqam to'g'ri. Yorliq esa: akt-sverka noma'lum turni
   turning O'ZI bilan chizadi (`docTypeLabel` fallback'i, kod bilan
   tekshirildi) va POS mijoz kartasi `KNOWN_DOC_TYPES` qo'riqchisi bilan
   `docType` matnini ko'rsatadi — **ikkalasi ham yiqilmaydi**.
   🔴 i18n yorliq xaritalariga `customerPrepay` **ATAYLAB qo'shilmadi**:
   bu **A3 ning 3-vazifasi** (u yerda A2 ning turlari bilan birga
   qo'shiladi). A3 gacha ekranlarda xom `customerPrepay` so'zi ko'rinadi —
   bu **jim emas, ochiq degradatsiya** va shu yerda qayd etilgan.
7. **Z-hisobot — YANGI QATOR, jamiga TEGMAYDI.** `prepayMinor` ixtiyoriy
   maydon (`ZReportInput` da `?`), ya'ni mavjud chaqiruvchilar va
   muzlatilgan javoblar buzilmaydi; qiymat bo'lmasa qator UMUMAN
   chizilmaydi (`'0'` deb ko'rsatish «bugun avans bo'lmagan» degan
   ishonarli yolg'on bo'lardi). `expectedCashMinor` formulasiga
   QO'SHILMAYDI (avans `drawerInMinor` ichida).
   ⚠️ `cashBreakdown` obyektiga ham **ataylab qo'shilmadi**: u o'z
   izohida «`expectedCashMinor` formulasining AYNAN o'sha
   qo'shiluvchilari» deb ta'riflangan, tarkibni qo'shilmaydigan a'zo bilan
   aralashtirish yig'indini ikki barobar ko'rsatardi.
8. **Kiosk qamrovi — BIR ZARRA ham kengaymadi.** `/cashier-sessions`
   prefiksi allaqachon `methods: ['*']` bilan ochiq edi, shuning uchun
   ro'yxatga qator QO'SHILMADI va bu test bilan o'lchanadi (`prepayRules`
   bo'sh bo'lishi shart). `/cash-in` (ПКО) daraxti YOPIQ qoldi — 8 yo'l
   bo'yicha negativ test.
9. **Ruxsat matritsasi — YANGI RUXSAT YO'Q.** Endpoint
   `cashiersession.create` talab qiladi, ya'ni `drawer-in` / `cash-out` /
   `customer-payout` bilan AYNAN bir xil. Kassirda u allaqachon bor.
10. **USD kassa — OCHIQ 400.** `loadOpenShiftForDrawer` qo'riqchisi
    o'zgarmadi: so'm bo'lmagan kassada yashiq amallari umuman ishlamaydi.
    Bugungi o'rnatmada barcha yashiqlar so'mda.
11. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** A1 `stock`, `store-cell`,
    `retail-allocation`, `retail-sale` fayllariga bir qator ham yozmadi.
    H-, G- va K-rejalar hududiga kirilmadi.
    ⚠️ Lekin branch'da G4/G5/G6 va Q1–Q3 ham turibdi — **deploy oynasi
    ularni ham olib chiqadi**, shuning uchun deploy paytida qoida 8 ning
    `warehouse-state.ts` qo'shimchasi va qoida 13 ning uchma-uch smoke'i
    MAJBURIY.
12. **`АВ-` raqamlar ketma-ketligi** — `allocateDocumentNumber` orqali,
    `ВН-` dan ALOHIDA hisoblagich (prefiks boshqa). Race-safe; poyga testi
    ikki parallel so'rovda raqamlar takrorlanmasligini o'lchaydi.
13. **POS «Mijozlar» paneli — mavjud bloklar buzilmadi.** G1 vozvrat
    to'lovi va hisob-kitob cheki bloklari o'z testlari bilan yashil; yangi
    blok ular bilan bir xil naqshda (ichki ochiluvchi blok, Radix modali
    EMAS — `radix-modal-kills-shell-osk` xotirasi).

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | balans `−` va kassa `+` AYNAN bir summaga | ✅ test |
| 2 | smena kutilgan naqdi o'sdi | ✅ **konstruksiya bo'yicha** — hujjat `drawerInMinor` ga o'z-o'zidan kiradi (kod-shakl testi: yozuv AYNAN `retailDrawerCashIn` ga) |
| 3 | `Debt` qatori TUG'ILMADI | ✅ test (tuzoq-mock + kod-shakl) |
| 4 | yopiq/begona smenaga 400 | ✅ test |
| 5 | poyga (ikki parallel so'rov) — ikki hujjat, ikki delta, hisob to'g'ri | ✅ test |
| 6 | manfiy yoki nol summa 400 | ✅ test |
| 7 | kiosk allowlist qo'riqchisi (`/cash-in` ochilmagan) | ✅ 19 test |
| 8 | PKO cheki | ✅ sahifa + POS'dan chop chaqiruvi testi |
| 9 | POS oynasi | ✅ 6 test |
| 10 | i18n ru + uz, gate'lar yashil | ✅ 19 test |
| 11 | api + web testlari to'liq yashil | ✅ (bitta begona beqaror test bundan mustasno — yuqorida) |
| 12 | **migratsiya lokal dev bazada ikki marta xatosiz** | ✅ **BAJARILDI** (`sherset_v2_dev`, quyida raqamlari bilan) |
| 12b | (qo'shimcha) backfill xulqi HAQIQIY jadval ustida isbotlandi | ✅ zond |
| 12c | (qo'shimcha) Prisma drift YO'Q (indeks nomlari) | ✅ `migrate diff` |
| 12d | (qo'shimcha) `recompute` DRY-RUN yangi manba bilan yashil | ✅ `changed: 0` |
| 13 | **jonlida: sinov-mijozga 100 000 avans → kassa +100 000** | ❌ VPS/deploy kerak |
| 14 | **jonlida: mijoz balansi −100 000** | ❌ VPS kerak |
| 15 | **jonlida: smena «kutilgan naqd» +100 000** | ❌ VPS kerak |
| 16 | **jonlida: PKO cheki bosiladi** | ❌ VPS kerak |
| 17 | **jonlida: mijoz undirish ro'yxatida CHIQMAYDI** (invariant 4) | ❌ VPS kerak |
| 18 | **jonlida: smena yopilganda kamomad/ortiqcha 0** | ❌ VPS kerak |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 13–18
bandlari (jonli tasdiq). 12-band **YOPILDI** — pastga qarang.

#### ✅ LOKAL DEV BAZADA MIGRATSIYA (qoida 7) — BAJARILDI

Baza: `sherset_v2_dev` @ localhost (PostgreSQL **18**, `scram-sha-256`).
Parol egasidan so'raldi va **shu sessiyadan tashqariga yozilmadi** (qoida 5).

**Migratsiyadan OLDIN** (vakuum emasligini ko'rsatish uchun):

```
kind ustuni      : (0 rows)  ← YO'Q
mavjud qatorlar  : 0
indekslar        : _pkey · _account_id_name_key · _account_id_retail_shift_id_idx  (3 ta)
```

**IKKI MARTA yugurtirildi** (`psql -v ON_ERROR_STOP=1 -f …/migration.sql`):

```
===== 1-MARTA =====            ===== 2-MARTA (AYNAN o'sha) =====
ALTER TABLE                    NOTICE: column "kind" ... already exists, skipping
CREATE INDEX                   ALTER TABLE
CREATE INDEX                   NOTICE: relation "..._retail_shift_id_kind_idx" already exists, skipping
EXIT=0                         CREATE INDEX
                               NOTICE: relation "..._agent_id_kind_idx" already exists, skipping
                               CREATE INDEX
                               EXIT=0
```

Ikkinchi yugurish **to'liq no-op** — uchala bayonot ham `skipping`.

**Bazadan O'QIB tekshirildi** (`a1-local-drawer-kind-verify.sql`):

```
kind | character varying | 20 | NOT NULL | DEFAULT 'other'::character varying

retail_drawer_cash_in_account_id_agent_id_kind_idx
  → btree (account_id, agent_id, kind)
retail_drawer_cash_in_account_id_retail_shift_id_kind_idx
  → btree (account_id, retail_shift_id, kind)

avans hujjatlari            : 0   (kod deploy qilinmagan — kutilgan)
balans jurnalida customerPrepay : 0   (kutilgan)
```

**🔴 «Mavjud qatorlar `other` bo'ladi» — VAKUUM EDI, ZOND bilan yopildi.**
Dev bazada `retail_drawer_cash_in` **BO'SH** (0 qator), ya'ni yuqoridagi
3-so'rov hech narsa isbotlamasdi. Shuning uchun
`apps/api/src/scripts/a1-local-drawer-kind-probe.sql` yozildi: u ustunni
olib tashlaydi (= migratsiyagacha holat) → `kind` SIZ qator yozadi
(= «eski hujjat») → migratsiyani QAYTA qo'llaydi → natijani o'qiydi →
**o'zi ROLLBACK qiladi**. HAQIQIY jadval ustida, bitta tranzaksiyada.

```
--- 1. Ustunni olib tashlaymiz ---        DROP INDEX · DROP INDEX · ALTER TABLE
    ustun_bor_endi = 0
--- 2. `kind` SIZ qator yozamiz ---       ZOND-ESKI-QATOR | sum_minor = 777000
--- 3. Migratsiyani QAYTA yugurtiramiz ---ALTER TABLE · CREATE INDEX · CREATE INDEX
--- 4. ESKI QATOR qanday qiymat oldi ---  ZOND-ESKI-QATOR | other | 777000   ← 🔴 DALIL
--- 5. DEFAULT yangi qatorga ham ---      ZOND-YANGI-QATOR | other
--- 6. ROLLBACK ---
--- 7. ROLLBACKdan KEYIN ---              zond qatorlari=0 · ustun=1 · indekslar=2
```

Ikki narsa BIRDAN isbotlandi: (a) migratsiyadan oldin mavjud bo'lgan qator
`'other'` oladi va **`sum_minor` BIR TIYIN ham o'zgarmaydi** (777000 →
777000); (b) **teskari yo'l ishlaydi** — zondning 1-bosqichi AYNAN
hisobotdagi rollback retseptining uch bayonoti.

**Prisma DRIFT tekshiruvi** (`prisma migrate diff --from-url <dev>
--to-schema-datamodel prisma/schema.prisma`):

```
diffdagi bayonotlar : 35
  «retail_drawer_cash_in» uchraydi : 0   ← 🔴 A1 da DRIFT YO'Q
  «debts» (Q1) uchraydi            : 0   ← Q1 da ham drift yo'q
```

Ya'ni ikkala indeks nomi ham Prisma generatsiya qiladigani bilan AYNAN mos
(nomlar 57 va 50 belgi — 63 chegarasidan past, truncation yo'q).
⚠️ Qolgan **35 bayonot MAVJUD DRIFT** va A1 ga aloqasi yo'q: 16 ta
`ALTER INDEX … RENAME` (qo'lda yozilgan eski migratsiyalarning indeks
nomlari, masalan `retail_drawer_cash_out_account_shift_kind_idx`), 11
`ALTER TABLE`, 4 `DROP TABLE`. **Bu A1 topgan, lekin A1 tuzatmaydigan
narsa** — alohida ish sifatida qayd etiladi («Ochiq qolganlar» 7-band).

**`recompute-counterparty-balances` DRY-RUN** (dev baza, hech narsa
yozilmadi) — yangi `customer-prepays` manbasi bilan:

```
mode: DRY-RUN (no writes)
(account,counterparty,currency) pairs: 799 | changed: 0 | unchanged: 799
cross-check: ⚠️ 759 kalitda hujjat-rekonstruksiyasi jurnaldan farq qiladi
```

Uch xulosa: (1) **`changed: 0`** — yangi manba birorta saldoni
qimirlatmadi; (2) skript `assertCounterpartyBalanceCoverage()` dan
O'TDI, ya'ni reyestr ↔ `SOURCE:` marker bog'lami HAQIQIY yugurishda ham
butun; (3) cross-check shovqini **759** — Q1 o'lchagan raqamning AYNAN
o'zi, ya'ni **A1 bir zarra ham shovqin qo'shmadi** (Q1 hisoboti: «183 →
759»; A1 dan keyin ham 759).

Zond va tekshiruv skriptlari repoga kiritildi (qoida 14 ruhida):
`apps/api/src/scripts/a1-local-drawer-kind-probe.sql` va
`…-verify.sql`.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi.

🔴 **Deploy branch'i YANGILANISHI KERAK.** `kassa-qarzi-q1-q2` @ `456e53af`
da Q3 ham, A1 ham YO'Q. Hozirgi `yacheyka-inventarizatsiya` da esa A1
bilan bir qatorda **G4 (ombor avto-taqsimoti) va G5/G6 (TSD)** ham
turibdi — `git merge --ff-only` ularni AJRATA OLMAYDI. Q2 dagi
cherry-pick retsepti bilan yangi branch yig'ilishi kerak (`4f5c1750`
asosida: Q1 → Q2 → Q3 → A1 + onboarding kalendar tuzatmasi). **Bu A1
sessiyasida QILINMADI — buyruq kutilmoqda** (Q2 da cherry-pick qarorini
egasi o'zi bergan edi).

Migratsiyalar: Q1 niki (`20260825120000_debt_source_doc`) VA A1 niki
(`20260825220000_drawer_cash_in_kind`) — **ikkalasi ham VPS'da BERILMAGAN**
va kod'dan OLDIN berilishi SHART (aks holda `post()` va `customerPrepay()`
mavjud bo'lmagan ustunga yozib yiqilardi).

#### Jonli tekshiruv retsepti (deploy'dan KEYIN)

Deploy oldidan/keyin (qoida 8): `packages/db` da
`npx tsx scripts/warehouse-state.ts` — chiqishi hisobotga ko'chiriladi.

1. Sinov mijoz tanlanadi (balansi **0** yoki musbat) → POS «Mijozlar» tabi
   → «Avans qabul qilish» → **100 000** → «Qabul qilish».
2. PKO cheki (`АВ-2026-…`) chop oynasi ochiladi va mijoz nomi bilan chiqadi.
3. Kassa qoldig'i (`/money` yoki smena ekrani): **+100 000**.
4. Kontragent kartasi: balans **−100 000** (yoki qarzi shuncha kamaygan).
5. Smena ekrani → «kutilgan naqd» tarkibi: `drawerInMinor` **+100 000**.
6. Z-hisobot: «Mijozlardan avans» qatori **100 000**.
7. 🔴 `/menejer/undirish` → **shu mijoz CHIQMAYDI** (invariant 4).
8. Smena yopiladi → kamomad/ortiqcha **0** (kassir 100 000 ni sanaydi).
9. Uchma-uch smoke (qoida 13): bitta sotuv (post → tekshir → cancel),
   bitta yacheyka sanash, bitta ko'chirish — deploy G4/G5/G6 ni ham olib
   chiqadi.
10. Izni tozalash: **A3 gacha kassir tuzata olmaydi** (yuqoridagi STORNO
    qarori). Sinov avansini qaytarish uchun admin yo'li — avval hujjatni
    o'qing:

```sql
-- <DOC_ID> — АВ- hujjatining id'si.
SELECT id, name, sum_minor, agent_id FROM retail_drawer_cash_in
 WHERE kind = 'customer_prepay' AND id = '<DOC_ID>';
```

Keyin EKRANDAN: `POST /cash-out` (kassadan 100 000 chiqish) +
`CounterpartyAdjustment` (balansga `+100 000`). Ikkalasi ham hujjat
qoldiradi — jonli ma'lumot QO'LDA (SQL bilan) o'zgartirilmaydi.

#### Ochiq qolganlar

1. **Q1 dan meros (o'zgarishsiz):** `recompute` cross-check'iga `opening`
   manbasi qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani
   tekshirilmagan (VPS kirishi kerak).
2. **Q2/Q3 dan meros:** jonli tasdiq, deploy branch'i push qilinmagan.
3. **A1 ning O'Z ochiq bandi:** faqat **jonli tasdiq** (mezon 13–18).
   Lokal dev bazada migratsiya sinovi **BAJARILDI** (yuqorida).
4. **A3 gacha kassirda storno yo'li YO'Q** (yuqorida asoslangan).
5. **i18n doc-type yorliqlari** (`customerPrepay`) — A3 ning 3-vazifasi.
6. **Avansdan to'lash yo'li hali YO'Q** — mijozning puli balansda turadi,
   lekin uni chekka ishlatish A2 da ochiladi. **Egasiga aytilsin: A2 gacha
   avans faqat QARZNI YOPADI** (qarzdor mijozda) yoki balansda kutadi.
7. 🔴 **YANGI TOPILMA — sxema DRIFTI (A1 ga aloqasi yo'q, A1 tuzatmaydi).**
   `prisma migrate diff` dev bazada **35 bayonotlik farq** ko'rsatadi:
   16 ta `ALTER INDEX … RENAME` (qo'lda yozilgan eski migratsiyalarda
   indekslar Prisma kutgan nomdan boshqa nom bilan yaratilgan — masalan
   `retail_drawer_cash_out_account_shift_kind_idx` →
   `retail_drawer_cash_out_account_id_retail_shift_id_kind_idx`), 11
   `ALTER TABLE`, 4 `DROP TABLE`, 1 `CREATE TABLE`, 1 `CREATE INDEX`,
   1 `DROP INDEX`. **Oqibati:** kimdir kelajakda `prisma migrate dev`
   yugurtirsa, u shu 35 bayonotni «tuzatish» deb bazaga qo'llamoqchi
   bo'ladi — jumladan **4 ta `DROP TABLE`**. Bu jonli bazada ma'lumot
   yo'qotishi bo'lardi. Repoda migratsiyalar `db execute --file` +
   `migrate resolve --applied` bilan beriladi (qoida 7), ya'ni bugungi
   oqim xavfsiz — lekin bu **kutilmagan qurol** va alohida faza sifatida
   ko'rib chiqilishi kerak. A1 uni FAQAT o'lchadi va qayd etdi.

#### Keyingi fazaga (A2) eslatmalar

1. 🔴 **`recompute-counterparty-balances.ts` ga `PREPAY` tender manbasini
   QO'SHISHNI UNUTMANG** — A1 uchun `customer-prepays` bloki qo'shildi,
   A2 uchun yana bittasi kerak (`+amountMinor`). `SCRIPT_SOURCES` +
   `DECLARED_BALANCE_WRITERS` + qo'riqchi test — uchalasi birga (A1 ning
   shu bandidagi naqshni ko'chiring).
2. 🔴 **A2 da balans QULFI MAJBURIY** (A1 da yo'q — sabab yuqorida,
   «chekinish 1»). Cap `prepayMinor ≤ −balansOldin` balansning oldingi
   qiymatiga bog'liq QAROR beradi. Tartib Q2/Q3 bilan bir xil:
   **BALANS → QARZLAR**.
3. `PREPAY` tenderi **kutilgan naqdga KIRMASLIGI** shart. A1 hujjati
   `retail_drawer_cash_in` da (kiradi), A2 tenderi esa
   `RetailSalePayment` da (`DEBT` bilan bir xil munosabat) —
   `collectCashInputs` va `collectUsdCashInputs` ga sizib kirmasin.
4. Sof modul `pos-cash-in.ts` ga A2 uchun **hech narsa qo'shish shart
   emas**: u kassa YASHIG'IGA kirgan pul haqida, A2 esa yashiqqa pul
   kiritmaydi. Agar baribir yangi `kind` qo'shsangiz `summarizeCashIn` ni
   ham yangilang — `pos-cash-in.test.ts` dagi simmetriya testi eslatadi.
5. Z-hisobotdagi `prepayMinor` — **KIRIM (A1)** qatori. A2 ning «avansdan
   to'landi» summasi BOSHQA raqam (`RetailSalePayment` dan) va uni shu
   maydonga qo'shib yubormang: biri yashiqqa kirgan pul, ikkinchisi
   allaqachon kirgan pulning sarflanishi.
6. `BALANCE_DOC_TYPE.customerPrepay` — FAQAT kassa avans hujjati uchun.
   A2 tenderi uchun alohida tur kerak bo'ladi (`docId` = `sale.id`),
   aks holda hujjat-resolveri `RetailDrawerCashIn` dan chek qidirardi.
7. POS to'lov oynasidagi «Avansdan» tugmasi uchun mijozning joriy avansi
   kerak bo'ladi. `debtPayable` manfiy balansda `0` qaytaradi
   (`pos-customer-debt.ts:159-168`) — ya'ni **mavjud endpoint yaramaydi**;
   A3 ning `customerStanding` sof modulini A2 da ERTAROQ qurish kerak
   bo'lishi mumkin. Buni A2 boshida qaror qiling.
### A2 — Avansdan to'lash (`PREPAY` tenderi) · 2026-08-25 · **QISMAN** (jonli tasdiq + lokal skript sinovi kutilmoqda)

**Xulq O'ZGARDI.** Avansi bor mijoz tovar olganda kassir uni «avansdan»
to'lay oladi: chek **TO'LANGAN** sanaladi, **kassa naqdi o'zgarmaydi**, mijoz
balansi `+summa` bilan nolga qarab suriladi (avans yeyiladi), `Debt`
reyestriga **TEGILMAYDI**, avansdan ortig'i **400** bilan rad etiladi.
Egasining ikkinchi shikoyatining SARFLASH tomoni yopildi; qolgani —
KO'RSATISH va QAYTARISH (A3).

Commitlar: **`8178fd87`** (funksiya + testlar), **`01017441`** (Z-hisobot
chegarasi izohi). Branch `yacheyka-inventarizatsiya`.

#### Bog'liqlik holati (qoida 11 — ochiq aytiladi)

A2 ning sharti — «**A1 VA Q2** tugagan bo'lsin». Ikkalasi ham **«QISMAN»**:
kod va testlar TO'LIQ, jonli tasdiq esa deploy'ga bog'liq holda OCHIQ.
Kod darajasida tekshirildi va tasdiqlandi:

| Shart | Holat |
|---|---|
| Q2 yozuvchisi joyida (`writeSaleDebtRegistryRow`, `lockCounterpartyBalance`) | ✅ `retail-sale.service.ts` da, 9 ta ishlatilish |
| A1 yo'li joyida (`customerPrepay`) | ✅ `cashier-session.service.ts` da, 6 ta ishlatilish |
| §2.2 kesishuv qoidasi ishlaydi | ✅ Q1 sof moduli + Q2 yozuvchisi; A2 uni JONLI mock bilan qayta o'lchadi (pastga qarang) |

**FUNKSIONAL bog'liqlik BAJARILGAN** — A2 Q2 ning kodiga tayanadi, jonli
tasdig'iga emas. Egasi Q2/Q3/A1 ni ham aynan shu sharoitda davom ettirishga
ruxsat bergan va A2 ni ochiq buyurgan. Meros ochiq bandlar pastda takrorlanadi.

#### 🔴 A2 boshidagi QAROR (A1 ning 7-eslatmasi)

A1 «`debtPayable` manfiy balansda `0` qaytaradi ⇒ mavjud endpoint yaramaydi;
A3 ning `customerStanding` sof modulini A2 da ERTAROQ qurish kerak bo'lishi
mumkin — buni A2 boshida qaror qiling» degan edi.

**Qaror: A3 ning to'liq moduli QURILMADI.** Uning o'rniga MINIMUM sof
funksiya yozildi — `prepayAvailable(balanceMinor)` (`pos-customer-debt.ts`),
`debtPayable` ning yonida va uning ko'zgusi sifatida. Sabab: `customerStanding`
to'rt holat (`debt | prepaid | settled | unmeasured`) + ekran yorliqlari +
karta ko'rinishini beradi — bularning HECH BIRI A2 ga kerak emas va ular
A3 ning qabul mezoniga bog'langan. A3 `customerStanding` ni AYNAN shu
funksiya ustiga quradi, ikkinchi formula yozmasdan.

Server javobi (`GET /debts/pos/summary/:cpId`) ga bitta maydon qo'shildi:
`prepayAvailableMinor`. Ekran ham, server cap'i ham AYNAN shu sof
funksiyadan yuradi (ekranda `-balanceMinor` deb qayta hisoblash formulaning
ikkinchi nusxasi bo'lardi).

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `apps/api/src/modules/retail-sale/retail-tenders.ts` | `TENDER.prepay = 'PREPAY'`; `TenderInput.prepayMinor?`; yangi rad sababi `prepay-overpaid`; `linesOf` ga PREPAY qatori (qarzdan OLDIN); `legacyTotals` ga «PREPAY tushmaydi» izohi |
| 2 | `apps/api/src/modules/retail-sale/retail-sale.schema.ts` | `prepayAmountMinor` (post, `.default('0')`), `prepayReturnMinor` (refund, `optional`) |
| 3 | `apps/api/src/modules/retail-sale/retail-sale.service.ts` | `post()` da AVANS BLOKI (qulf + cap + `applyDelta` + audit), QARZ blokidan OLDIN; `refund()` da avans qaytarish; `edit()` da qo'riqchi; uchta yangi guard (mijoz / valyuta / cap) |
| 4 | `apps/api/src/modules/retail-sale/retail-refund-validation.ts` | `originalPrepayMinor`/`priorPrepayReturnedMinor` kirishlari, `prepayMaxMinor` cap'i, `validateRefundSettlement` ga avans tekshiruvi |
| 5 | `apps/api/src/modules/retail-sale/cashier-audit.ts` | `CASHIER_EVENT.paidFromPrepay` + `planPrepaySaleAuditEvent` |
| 6 | `apps/api/src/modules/counterparty-balance/counterparty-balance-doc-types.ts` | `BALANCE_DOC_TYPE.salePrepay` (nega `customerPrepay` ham, `retailsale` ham qayta ishlatilmagani izohda) |
| 7 | `apps/api/src/modules/counterparty-balance/counterparty-balance-doc-resolver.ts` | `salePrepay` → `RetailSale` (`retailsale` bilan BITTA so'rovda) |
| 8 | `apps/api/src/modules/debt/pos-customer-debt.ts` | **YANGI sof funksiya** `prepayAvailable(balanceMinor)` |
| 9 | `apps/api/src/modules/debt/pos-debt-payment.service.ts` | `summary()` javobiga `prepayAvailableMinor` |
| 10 | `apps/api/src/modules/cashier-session/{shift-variance,cashier-session.service}.ts` | Z-hisobotga `prepaySpentMinor` (A1 ning `prepayMinor` KIRIMidan BOSHQA raqam) |
| 11 | `apps/api/src/scripts/recompute-counterparty-balances.ts` | 🔴 **`SOURCE: sale-prepay`** (+) va **`SOURCE: sale-prepay-refund`** (−) bloklari; `loadEventAgents` umumlashtirildi |
| 12 | `apps/api/src/scripts/counterparty-balance-sources.ts` | `SCRIPT_SOURCES` ga ikki yangi manba; `retail-sale.service.ts` yozuvi to'rt manbali bo'ldi |
| 13 | `apps/web/src/components/pos/rasmilashtirish-modal.tsx` | «Avansdan» maydoni: mijoz summary'si, mavjud avans, «Aniq» = `min(qoldiq, avans)`, IKKI to'siq |
| 14 | `apps/web/src/app/(app)/sotuv/page.tsx` | `prepayAmountMinor` payload'ga (faqat > 0 bo'lganda) |
| 15 | `apps/web/src/lib/pos/receipt-payments.ts` | chekda «Avansdan» qatori (qarzdan oldin) |
| 16 | `apps/web/src/lib/{z-report-receipt,use-z-receipt-labels}.ts` + `retail/sessions/[id]/page.tsx` | Z-hisobotda «Avansdan to'landi» qatori |
| 17 | `apps/web/src/messages/{ru,uz}.json` | 6 yangi kalit (5 POS + 1 Z-hisobot), ikkala tilda |
| 18 | 4 yangi test fayli + 4 mavjudga qo'shimcha | pastga qarang |

**`post()` dagi avans blokining shakli:**

```
prepayAmount > 0 && debtAgentId
   balansOldin ← lockCounterpartyBalance(FOR UPDATE)     ← QARZ blokidan OLDIN
   available   ← balansOldin < 0 ? −balansOldin : 0      (null ⇒ 0)
   prepay > available                    ⇒ 400 (aniq son bilan)
   applyDelta(+prepay, docType:'salePrepay', source YO'Q)
   audit(PAID_FROM_PREPAY, balans oldin/keyin bilan)
── keyin QARZ bloki (Q2) ── §2.2 endi AVANS YEYILGANDAN KEYINGI balansdan yuradi
```

#### 🔴 Rejadan TO'RTTA ataylab chekinish

**1. `payedSumMinor` formulasi O'ZGARTIRILMADI — u ALLAQACHON to'g'ri.**
Reja «`retail-sale.service.ts:905` dagi `total − debtAmount` formulasi shuni
hisobga oladigan qilib yangilanadi» degan edi. O'lchandi:

```
total = naqd + dollar + karta + terminal + AVANS + qarz
  ⇒ total − qarz = to'langan HAMMA narsa, avans ham ICHIDA
```

Ya'ni avansdan to'langan chek o'z-o'zidan «to'liq to'langan» bo'lib yoziladi
(A2 ning `DEBT` dan asosiy farqi). Formulaga yangi a'zo qo'shilsa avans **ikki
marta** sanalardi. Qaror kod izohiga va ikki testga qulflandi
(`payedSumMinor = jami` va aralash chekda `= jami − qarz`).

**2. Avans bloki QARZ blokidan OLDIN — bu TARTIB shartnomaviy.**
Reja tartibni aytmagan edi. Agar qarz bloki avval yugursa, §2.2 kesishuv
qoidasi balansni hamon «avans bor» deb ko'rib reyestr qatorini KAM ochardi:

| Holat | Qarz bloki AVVAL | Avans bloki AVVAL (tanlangan) |
|---|---|---|
| avans 40k, chek 100k = 40k avans + 60k qarz | reyestr qatori **20k** | reyestr qatori **60k** ✅ |

Birinchi ustun — egasining BIRINCHI shikoyatining aynan qaytishi (40 000 qarz
undirish ro'yxatida ko'rinmay qolardi). Tartib **kod-shakl testi** bilan
qulflandi va integratsiya testi uni JONLI mock bilan o'lchaydi (pastga qarang).
Qulf tartibi ham shu sabab bilan bir xil yo'nalishda qoladi: **BALANS → QARZLAR**.

**3. Avans qaytimining chegarasi `changeMinor > cashLike` EMAS, alohida qoida.**
Reja «qaytim BERILMAYDI» degan edi. Sodda o'qish — mavjud `change-exceeds-cash`
tekshiruviga tayanish — **YETMAS EDI**, va bu taxmin emas, testda o'lchandi:

```
chek 100k · naqd 50k · avans 70k  ⇒  qaytim 20k ≤ naqd 50k  ⇒  O'TIB KETARDI
```

Natijada mijozning avansi yashiqdan **naqd bo'lib, hujjatsiz va izsiz** chiqib
ketardi — ya'ni A3 ning RKO yo'lini chetlab o'tish yo'li ochilardi. Shuning
uchun alohida qoida yozildi:

```
prepayAllowed = max(0, total − debt − boshqa tenderlar)
prepay > prepayAllowed ⇒ 400 «prepay-overpaid»
```

Qoida **tartibdan mustaqil** (kassir avansni oldin yoki keyin kiritsa ayni
natija) va bu ham test bilan qulflangan.

**4. `edit()` ga YANGI QO'RIQCHI qo'shildi (reja vazifalar ro'yxatida YO'Q).**
`planReceiptEdit` ning butun pul mantig'i bitta soddalashtirishga tayanadi:
`cashDeltaMinor = yangi payed − eski payed`, ya'ni «to'langan hamma narsa
NAQD» deb qaraladi va farq kassa yashig'iga yoziladi. Avansdan to'langan
chekda bu **yashiqqa hech qachon kirmagan pulni chiqarib yuborardi** (R1
hodisasining aynan sinfi), mijozning balansi esa joyida qolardi.

Tahrirni TO'G'RI qilish uchun `planReceiptEdit` ga kanal-kesimi kerak
(naqd/karta/avans/qarz alohida) — bu A2 hajmidan tashqarida. Shuning uchun
**JIM emas, 400**: kassir tuzatishni vozvrat orqali qiladi. Chegara faqat A2
dan KEYIN yozilgan cheklarga tegadi (eski cheklarda `PREPAY` qatori yo'q),
ya'ni mavjud tahrir oqimi bir bayt ham o'zgarmaydi — bu ham test bilan
qulflandi. **Ochiq chegara sifatida pastda qayd etilgan.**

#### 🔴 Migratsiya KERAK EMAS — o'lchangan

`RetailSalePayment.method` ustuni `String @db.VarChar(20)` (sxemadan o'qildi),
`'PREPAY'` esa 6 belgi. Vozvrat ulushi ham alohida USTUN talab qilmaydi: u
mirror chekning `PREPAY` to'lov qatorida saqlanadi — **AYNAN `CASH_USD` ning
2026-08-17 dagi naqshi** (kümülativ cap o'sha qatorlardan o'qiladi).

**Ya'ni A2 da yangi migratsiya YO'Q**, va qoida 7 ning migratsiya-bandi
qo'llanmaydi. VPS'da berilishi kerak bo'lgan migratsiyalar hamon O'SHA
IKKITASI: `20260825120000_debt_source_doc` (Q1) va
`20260825220000_drawer_cash_in_kind` (A1).

#### 🔴 Telegram xabari — QAROR VA ASOSLASH (reja vazifasi 3)

Reja «mijozga Telegram xabari — bu «qarzga qo'shildi» EMAS, shuning uchun
`source` tanlovi ehtiyotkorlik bilan qilinadi va hisobotda asoslanadi» degan edi.

**Qaror: `source` UMUMAN BERILMAYDI (A1 bilan bir xil).** Dalil: xabar
`applyDelta` ning `source` argumentidan ketadi va matnni DELTANING ISHORASI
tanlaydi. Avansdan to'lovda delta **MUSBAT**, ya'ni `source` berilsa mijozga
«🛒 **Qarzga qo'shildi**» ketardi — avansini sarflagan, qarzdor BO'LMAGAN
mijozga bu **ochiq yolg'on** bo'lardi. Vozvratda delta manfiy ⇒ «↩️
Qarzingizdan ayirildi» ketardi, u ham yolg'on.

Ikkala yo'lda ham `source` yo'q ⇒ xabar KETMAYDI. Bu **jimlik**, va u shu
yerda hamda kod izohida OCHIQ qayd etilgan. «Avansingizdan yechildi» turkumidagi
yangi xabar — A3 da ko'rib chiqiladi (A1 ham shu savolni A2 ga qoldirgan edi;
A2 uni **A3 ga suradi**, chunki yangi xabar turi yangi shablon va yangi
`source` qiymati ochadi).

#### Test natijalari (raqam bilan)

| O'lchov | Natija |
|---|---|
| `apps/api` **to'liq** vitest | **653 fayl · 9227 test YASHIL**, 1 fayl / 2 test skip |
| `apps/web` **to'liq** vitest | **327 fayl · 4307 test YASHIL**, 26 skip |
| `apps/api` typecheck (`tsc --noEmit`, `--max-old-space-size=8192`) | **0 xato** |
| `apps/web` typecheck | **0 xato** |
| `node scripts/check-lint.mjs` | **0 error** (1192 warning — siyosat bo'yicha) |
| `pnpm i18n:gate` | **19 test yashil** (1115 fayl, 15 807 statik kalit) |

**Yangi testlar — jami 67, fayl kesimida ALOHIDA o'lchandi:**

| Fayl | Soni | Nimani qulflaydi |
|---|---|---|
| `retail-sale/retail-sale-prepay-tender.test.ts` | **25** (YANGI) | PREPAY qatori + `salePrepay` delta · **Telegram KETMAYDI** (`source` yo'q) · `payedSumMinor = jami` · **kassa naqdi o'zgarmaydi** (`money.applyDeltas` UMUMAN chaqirilmaydi) · legacy naqd ustunlari 0 · **invariant 4** (reyestr delegatiga bir marta ham tegilmaydi) · audit `PAID_FROM_PREPAY` · aralash chek · **invariant 5** (6 holat: avansdan ortiq · aniq son · avansi yo'q · balans `null` · qaytim · mijozsiz · USD yashiq) · **A2×Q2 kesishuvi** (reyestr qatori 60k, ikki delta, tartib) · `FOR UPDATE` qulfi · **4 kod-shakl qo'riqchisi** · `edit()` qo'riqchisi (3) |
| `retail-sale/retail-prepay-rules.test.ts` | **21** (YANGI) | sof `computeTenders` (11): qoplama · tartib · **naqd aralashganda ham qaytim yo'q** · tartibdan mustaqillik · orqaga moslik · `legacyTotals` · sof `computeRefundSettlementCaps` (6): pul ulushidan chiqarish · uch kanal proporsiyasi · **100 iteratsiyali yaxlitlash isboti** · kümülativ · **orqaga moslik** (avanssiz chekda cap'lar AYNAN avvalgidek) · `validateRefundSettlement` (4) |
| `debt/pos-prepay-available.test.ts` | **6** (YANGI) | sof modul: manfiy/musbat/nol/`null` · **`debtPayable` bilan bir vaqtda ikkalasi noldan katta bo'lolmaydi** · nomuvofiq holatda ikkisi O'Z daftariga sodiq qoladi |
| `web/pos/__tests__/rasmilashtirish-prepay.test.tsx` | **8** (YANGI) | maydon o'chiq/faol (3 holat) · «Aniq» = `min(qoldiq, avans)` · **ikki to'siq alohida matn bilan** · aralash chek · **mijoz almashsa maydon tozalanadi** |
| `retail-sale/retail-sale-refund-debt.test.ts` | **+8** | avans balansga qaytadi, naqd YO'Q · **naqd qaytarish 400** (R1 sinfi) · qisman proporsional · aralash (har ulush o'z kanaliga) · **invariant 4** vozvratda · kümülativ cap · **uch kanalli chek** (tartib: avans → qarz) |
| `scripts/counterparty-balance-sources.test.ts` | **+2** | 🔴 uch tomonlama qulf: yozuvchi ↔ reyestr ↔ skript **TANASI** (ikki blok, QARAMA-QARSHI ishoralar) · mijozsiz qator skriptni TO'XTATADI |
| `counterparty-balance/counterparty-balance-doc-resolver.test.ts` | **+2** | `salePrepay` CHEK jadvalidan (kassa hujjatidan EMAS) · `retailsale` bilan BITTA so'rovda |
| `cashier-session/shift-variance.test.ts` | **+3** | `prepaySpentMinor` **kutilgan naqdga ham, farqqa ham TEGMAYDI** · berilmasa `0n` · **kirim va sarf raqamlari mustaqil** |

Bundan tashqari **6 mavjud kutilma** kengaytirildi
(`retail-refund-validation.test.ts` — caps obyektiga `prepayMaxMinor`) va
**3 label-fixture** ga `prepaySpent` qo'shildi (typecheck talab qildi).

**🔴 Mock JONLI qilindi — va u haqiqiy nuqsonni topdi.** `sale-debt-registry.mock.ts`
ning `$queryRaw` i BITTA statik balans qaytaradi. A2 ning kesishuv testi shu
mock bilan **20 000** ko'rdi (kutilgan 60 000) — chunki mock avans deltasidan
KEYINGI balansni bilmasdi. Ya'ni statik mock **tartibni umuman o'lchamasdi**.
A2 harness'ida balans HOLATLI qilindi: `applyDelta` uni siljitadi, `$queryRaw`
va `counterpartyBalance.findFirst` o'sha ondagi qiymatni qaytaradi — Postgres
qanday qilsa, shunday. **Faqat shundan keyin test rejadagi 60 000 ni ko'rdi.**

#### 🔴 O'lchangan MAVJUD chegara — Z-hisobot tushum kesimi (`01017441`)

`cashier-session.service.ts` dagi `revenueByMethod` groupBy'ida
`refundedFromId: null` filtri **YO'Q**, ya'ni VOZVRAT-nusxasiga yozilgan
to'lov qatorlari ham tushumga qo'shiladi. Bu **2026-08-17 dan beri `CASH_USD`
uchun shunday** (mirror chekka dollar qatori yoziladi) va A2 ning `PREPAY`
mirror qatori AYNI sinfga qo'shiladi: 100 000 avansdan to'lanib 60 000
qaytarilgan smenada bu kesim «PREPAY 160 000» ko'rsatadi.

**TUZATILMADI — ataylab, sabab bilan:** filtr qo'shilsa jonlida ALLAQACHON
yozilgan dollar-vozvratli smenalarning `revenueMinor` i o'zgarardi, ya'ni
egasi ilgari ko'rgan hisobot raqami boshqacha bo'lib qolardi. Bu A2 ning
vazifalar ro'yxatida YO'Q va alohida qaror talab qiladi.

**JIM emas:** izoh kod ichiga yozildi (F5 saboqi — eskirgan/yetishmaydigan
premise keyingi o'quvchini adashtiradi) va shu hisobotda qayd etildi.
A2 ning O'Z qatori (`prepaySpentMinor`) da filtr **QO'YILGAN**, ya'ni
«bugun avansdan qancha to'landi» raqami TO'G'RI.

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Smena kutilgan naqdi — TEGILMAYDI (A2 ning eng katta xavfi, yopildi).**
   `collectCashInputs` `RetailSale.cashAmountMinor` ustunini o'qiydi, u esa
   `legacyTotals` dan keladi va `legacyTotals` faqat `CASH_UZS`/`CARD`/
   `TERMINAL` ni sanaydi. `PREPAY` u yerga TUSHMAYDI — **sof test** bilan
   ham, **integratsiya testi** bilan ham (flip payload'idagi
   `cashAmountMinor === 0n`) qulflangan. `collectUsdCashInputs` esa
   `method: TENDER.cashUsd` bo'yicha qat'iy filtrlaydi ⇒ sizib kirish yo'li yo'q.
2. **Kassa yashig'i / pul daftari — TEGILMAYDI.** Avansdan to'lovda
   `cashToDrawer === 0n` ⇒ `MoneyService` UMUMAN chaqirilmaydi (test).
   Vozvratda ham avans ulushi uchun pul chiqmaydi.
3. **Balans / jurnal — YANGI YOZUVCHI, va u QAMROVDA.**
   `retail-sale.service.ts` allaqachon `DECLARED_BALANCE_WRITERS` da edi;
   unga IKKI yangi manba (`sale-prepay`, `sale-prepay-refund`) qo'shildi va
   `recompute-counterparty-balances.ts` ga mos IKKI blok yozildi.
   **Bu unutilsa `APPLY=1` mijozlarning avanslarini yo'q qilardi** — A1
   hisobotining 1-eslatmasi aynan shu haqda ogohlantirgan. Uch tomonlama
   qo'riqchi test qo'yildi (yozuvchi ↔ reyestr ↔ skript tanasi).
4. **`Debt` reyestri / undirish ro'yxati / eslatma cron'i — TEGILMAYDI
   (invariant 4).** Avans yo'li `debt`/`debtNote` delegatlariga umuman
   murojaat qilmaydi (tuzoq-mock + kod-shakl testi). Manfiy balans hech
   qachon `Debt` qatori tug'dirmaydi ⇒ avansli mijoz undirish ro'yxatida
   CHIQMAYDI. ⚠️ Vozvrat yo'lida ham shunday: Q3 ning bloki ataylab
   `if (debtReturn > 0n && debtorId)` ichida turibdi (Q3 ning 2-eslatmasi
   bajarildi).
5. **§2.2 kesishuv qoidasi — KUCHAYDI, buzilmadi.** Avans deltasi qarz
   blokidan OLDIN qo'llangani uchun reyestr qatori endi chekning HAQIQIY
   qarz ulushiga teng bo'ladi. Q2 ning kodiga bir qator ham qo'shilmadi.
6. **Mijozga Telegram xabari — YANGI XABAR KETMAYDI** (yuqoridagi qaror).
   `debt-source-wiring` qo'riqchisi yashil; A2 ning testi `source`
   `undefined` ekanini AYNAN tekshiradi.
7. **Vozvrat cap'lari — ORQAGA MOS.** Avanssiz chekda `prepayCapTotal = 0`
   ⇒ `debtCapTotal` formulasi AYNAN avvalgisi bo'lib qoladi. Bu **test bilan
   isbotlangan** (`withField` va `withoutField` obyektlari `toEqual`) va
   mavjud 58 ta `retail-refund-validation` testi yashil qoldi.
8. **Yaxlitlash — bir tiyin ham osilib qolmaydi.** Uch chelakdan avans va
   pul PROPORSIONAL, qarz esa QOLDIQNI oladi. 100 iteratsiyali test
   (`refundSum` 1…100, chek 100, uch kanal 33/33/34) yig'indi hech qachon
   qaytarilgan qiymatdan oshmasligini o'lchaydi.
9. **`edit()` — YANGI TAQIQ, faqat A2 dan keyingi cheklarda.** Eski
   cheklarda `PREPAY` qatori yo'q ⇒ mavjud tahrir oqimi buzilmaydi (test).
10. **POS «Qarz to'lovi» oynasi / FIFO — TEGILMAGAN.** `debtPayable`
    o'zgarmadi; `prepayAvailable` — YANGI, alohida funksiya. `summary()`
    javobiga faqat maydon QO'SHILDI, mavjud maydonlarning biri ham
    o'zgarmadi.
11. **Akt-sverka / statement — SALDO TO'G'RI, YORLIQ hozircha xom.**
    Saldo docType ro'yxatiga bog'liq emas (Faza 10 shartnomasi).
    Hujjat-resolveri `salePrepay` ni CHEK raqami bilan qaytaradi (test).
    🔴 i18n yorliq xaritalariga `salePrepay` **ATAYLAB qo'shilmadi** — bu
    **A3 ning 3-vazifasi** (u yerda `customerPrepay` bilan BIRGA qo'shiladi).
    A3 gacha ekranlarda xom `salePrepay` so'zi ko'rinadi — **jim emas,
    ochiq degradatsiya**, A1 dagi bilan bir xil qaror.
12. **Z-hisobot — YANGI QATOR, jamiga tegmaydi.** `prepaySpentMinor`
    ixtiyoriy maydon ⇒ mavjud chaqiruvchilar buzilmaydi; `expectedCashMinor`
    formulasiga QO'SHILMAYDI (`DEBT` bilan bir xil munosabat) va
    `cashBreakdown` ga ham kirmaydi. ⚠️ `revenueByMethod` kesimidagi mavjud
    chegara — yuqorida alohida bo'limda.
13. **Kiosk qamrovi — BIR ZARRA ham kengaymadi.** A2 yangi marshrut
    OCHMAYDI: `POST /retail-sales/:id/post` va `GET /debts/pos/summary/:id`
    ikkalasi ham kioskda ALLAQACHON ochiq edi (A1 va P1 dan beri).
14. **Ruxsat matritsasi — YANGI RUXSAT YO'Q.**
15. **USD yashiq — OCHIQ 400** (§2.3 chegarasi). Bugungi o'rnatmada barcha
    yashiqlar so'mda, ya'ni amalda hech bir chek chetda qolmaydi.
16. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** A2 `stock`, `store-cell`,
    `retail-allocation` fayllariga bir qator ham yozmadi; `post()` ning
    ombor kaskadiga va `refund()` ning `refundStoreId` yo'liga tegilmadi.
    H-, G- va K-rejalar hududiga kirilmadi.
    ⚠️ Lekin branch'da G4/G5/G6 va Q1–Q3, A1 ham turibdi — **deploy oynasi
    ularni ham olib chiqadi**, shuning uchun deploy paytida qoida 8 ning
    `warehouse-state.ts` qo'shimchasi va qoida 13 ning uchma-uch smoke'i
    MAJBURIY.
17. **Deadlock — yangi yuza ochilmadi.** Avans bloki balansni QARZ blokidan
    OLDIN qulflaydi, ya'ni tartib butun repoda BITTA: **BALANS → QARZLAR**.
    Vozvratda ham avans deltasi qarz blokidan OLDIN turadi (kod-shakl testi),
    aks holda QARZLAR → BALANS tartibi paydo bo'lardi.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | to'liq avansdan to'lov | ✅ test |
| 2 | qisman (avans + naqd) | ✅ test |
| 3 | avansdan ortiq → 400 | ✅ test (6 holat) |
| 4 | avansi yo'q mijozda tugma faol emas | ✅ web test |
| 5 | `payedSumMinor` to'g'ri (chek TO'LANGAN) | ✅ test + kod izohi |
| 6 | smena kutilgan naqdi O'ZGARMADI | ✅ sof test + integratsiya testi |
| 7 | `Debt` qatori TUG'ILMADI | ✅ test (tuzoq-mock + kod-shakl) |
| 8 | vozvratda balans qaytdi | ✅ test (7 holat) |
| 9 | `recompute` DRY-RUN farq ko'rsatmadi | ⚠️ **QISMAN** — skript bloklari qo'riqchi test bilan qulflangan, lekin **lokal bazada YUGURTIRILMADI**: `packages/db/.env` yo'q, parol kutilmoqda (qoida 5/7; A1 dagi AYNI to'siq) |
| 10 | poyga: ikki parallel chek bitta avansni ikki marta sarflay olmaydi | ⚠️ **QISMAN** — qulf `FOR UPDATE` ekani va `applyDelta` DAN OLDIN olinishi test bilan qulflangan; HAQIQIY ikki-sessiyali poyga sinovi bazani talab qiladi |
| 11 | api + web testlari to'liq yashil | ✅ 9227 + 4307 |
| 12 | i18n ru + uz, gate'lar yashil | ✅ 19 test |
| 13 | **jonlida: avansi 100 000 mijozga 60 000 lik chek «avansdan»** | ❌ **VPS/deploy kerak** |
| 14 | **jonlida: kassa qoldig'i O'ZGARMAYDI** | ❌ VPS kerak |
| 15 | **jonlida: mijoz balansi −40 000 ga keladi** | ❌ VPS kerak |
| 16 | **jonlida: chek `posted` va TO'LIQ to'langan** | ❌ VPS kerak |
| 17 | **jonlida: smena kamomadi 0** | ❌ VPS kerak |
| 18 | **jonlida: mijoz undirish ro'yxatida CHIQMAYDI** | ❌ VPS kerak |
| 19 | **jonlida: 60 000 dan ortiq urinish 400 beradi** | ❌ VPS kerak |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 9, 10 va
13–19 bandlari.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi.

🔴 **Deploy branch'i YANGILANISHI KERAK.** `kassa-qarzi-q1-q2` @ `456e53af`
da Q3 ham, A1 ham, A2 ham YO'Q. Hozirgi `yacheyka-inventarizatsiya` da esa
A2 bilan bir qatorda **G4 (ombor avto-taqsimoti) va G5/G6 (TSD)** ham
turibdi — `git merge --ff-only` ularni AJRATA OLMAYDI. Q2 dagi cherry-pick
retsepti bilan yangi branch yig'ilishi kerak (`4f5c1750` asosida:
Q1 → Q2 → Q3 → A1 → A2 + onboarding kalendar tuzatmasi). **Bu A2
sessiyasida QILINMADI — buyruq kutilmoqda** (cherry-pick qarorini egasi
o'zi bergan edi).

Migratsiyalar: **A2 da yangisi YO'Q** (yuqorida o'lchandi). Q1 niki
(`20260825120000_debt_source_doc`) va A1 niki
(`20260825220000_drawer_cash_in_kind`) — **ikkalasi ham VPS'da BERILMAGAN**
va kod'dan OLDIN berilishi SHART.

#### Jonli tekshiruv retsepti (deploy'dan KEYIN)

Deploy oldidan/keyin (qoida 8): `packages/db` da
`npx tsx scripts/warehouse-state.ts` — chiqishi hisobotga ko'chiriladi.

1. Sinov mijozga A1 yo'li bilan **100 000** avans kiritiladi (A1 retsepti,
   1–6 bandlari) → balans **−100 000**.
2. Shu mijozga **60 000** lik chek yig'iladi → to'lov oynasi → mijoz
   tanlanadi → **«Avansdan»** tugmasi FAOL bo'ladi va yonida
   «Mavjud: 1 000» ko'rinadi → «Aniq» → **600** yoziladi → «Rasmilashtirish».
3. Kassa qoldig'i (`/money` yoki smena ekrani): **O'ZGARMAYDI**.
4. Kontragent kartasi: balans **−40 000**.
5. Chek: `posted`, chekda «Avansdan 600» qatori bosiladi, hujjatda
   `payedSumMinor = 60 000` (to'liq to'langan).
6. Smena ekrani → «kutilgan naqd» **O'ZGARMAGAN**; Z-hisobotda
   «Avansdan to'landi» qatori **600**, «Mijozlardan avans» qatori esa
   AYRIM (1 000) — ikkalasi qo'shilmaydi.
7. 🔴 `/menejer/undirish` → **shu mijoz CHIQMAYDI** (invariant 4).
8. 🔴 **Ortiqcha urinish:** yana bir chek, avansdan **500** (qolgan avans
   400) → **400** xato, matnida «Mijozning avansi atigi 400 so'm».
9. 🔴 **Kesishuv:** avansi 400 qolgan mijozga **1 000** lik chek =
   400 avans + 600 qarz → `/menejer/undirish` da qator **600** bo'lishi
   SHART (400 emas!). Bu — A2 ning eng muhim jonli tekshiruvi.
10. **Vozvrat:** 2-banddagi chek to'liq qaytariladi → kassadan pul
    CHIQMAYDI, mijoz balansi **−100 000** ga qaytadi.
11. Smena yopiladi → kamomad/ortiqcha **0**.
12. Uchma-uch smoke (qoida 13): bitta sotuv (post → tekshir → cancel),
    bitta yacheyka sanash, bitta ko'chirish — deploy G4/G5/G6 ni ham olib
    chiqadi.
13. **`recompute` DRY-RUN** (jonlida, `APPLY` SIZ): avansli mijozda farq
    ko'rsatmasligi tekshiriladi — bu A2 ning skript bloklarining jonli
    isboti.
14. Izni tozalash: 10-band (vozvrat) izni o'zi qaytaradi. Avansning o'zini
    olib tashlash — A1 hisobotidagi admin yo'li (`/cash-out` +
    `CounterpartyAdjustment`), A3 gacha kassirda yo'l yo'q.

#### Ochiq qolganlar

1. **Q1 dan meros (o'zgarishsiz):** `recompute` cross-check'iga `opening`
   manbasi qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani
   tekshirilmagan (VPS kirishi kerak).
2. **Q2/Q3/A1 dan meros:** jonli tasdiq, deploy branch'i push qilinmagan.
   ⚠️ **TUZATISH:** A1 migratsiyasining lokal dev bazadagi sinovi bu sessiya
   davomida BOSHQA sessiya tomonidan YOPILDI (`a30b5a08`, `e4ec91f3`) —
   A1 ning 12-bandi endi ✅. Shu bilan birga o'sha sessiya sxemada **35
   bayonotlik MAVJUD drift** topdi (16 `ALTER INDEX RENAME`, 4 `DROP TABLE`)
   — A2 ga aloqasi yo'q, lekin **deploy oldidan hisobga olinsin**.
3. **A2 ning O'Z ochiq bandlari:** lokal bazada `recompute` DRY-RUN
   (A2 bloklari bilan) — **parol kutilmoqda** (qoida 5: parol A1 sessiyasida
   egasidan so'ralgan va ATAYLAB hech qayerga yozilmagan, ya'ni bu sessiyada
   qaytadan so'ralishi kerak); jonli tasdiqning 7 bandi; haqiqiy poyga sinovi.
   ⚠️ A1 sessiyasi o'lchagan `recompute` DRY-RUN natijasi (`changed: 0`,
   cross-check shovqini 759) **A2 KODIDAN OLDIN** olingan — A2 ikki yangi
   manba qo'shgani uchun u qayta o'lchanishi kerak. Kutilma: `changed`
   HAMON 0 (skript nishoni — jurnal, Faza 10), cross-check shovqini esa
   O'ZGARMAYDI (bugungi bazada `PREPAY` qatori hali YO'Q).
4. 🔴 **`edit()` — avansdan to'langan chek TAHRIRLANMAYDI** (400).
   `planReceiptEdit` ga kanal-kesimi kerak. Egasiga aytilsin: bunday chekni
   tuzatish yo'li — **vozvrat + yangi chek**.
5. 🔴 **Z-hisobot `revenueByMethod` kesimi vozvrat-nusxalarini sanaydi**
   (mavjud chegara, `CASH_USD` dan meros; A2 unga `PREPAY` ni qo'shdi).
   Qaror egasiniki: filtr qo'shilsa eski smenalarning `revenueMinor` i
   o'zgaradi.
6. **i18n doc-type yorliqlari** (`salePrepay`) — A3 ning 3-vazifasi.
7. **Avans harakati haqida mijozga xabar** («avansingizdan yechildi») —
   A2 da ATAYLAB yozilmadi (yuqoridagi qaror), A3 ga suriladi.

#### Keyingi fazaga (A3) eslatmalar

1. `prepayAvailable(balanceMinor)` (`pos-customer-debt.ts`) — A3 ning
   `customerStanding` i AYNAN shu funksiya ustiga qurilsin, ikkinchi
   formula yozmang. `debtPayable` bilan ikkalasi bir vaqtda noldan katta
   bo'lolmasligi test bilan qulflangan — `customerStanding` ning
   «bitta yirik son» qoidasi shundan bepul keladi.
2. **i18n doc-type yorliqlari (3 joyda)** ga IKKALA turni birga qo'shing:
   `customerPrepay` (A1, kassa hujjati АВ-) va `salePrepay` (A2, chek).
   Ular BOSHQA-BOSHQA hodisa: biri pul kirdi, ikkinchisi pul sarflandi.
3. **Avans tarixi** (`GET /debts/pos/history/:cpId`) `docType` bo'yicha
   FILTRLAMAYDI ⇒ ikkala yangi tur ham AVTOMATIK ko'rinadi. A3 buni
   tekshirib yozma tasdiqlasin (reja A3 vazifasi 3).
4. **`customer-prepay-refund` endpointi** (A3 vazifasi 4) `PREPAY`
   tenderining vozvratidan BOSHQA narsa: biri kassadan naqd chiqaradi (RKO),
   ikkinchisi chek qaytarilganda balansni tiklaydi. Ikkinchisi A2 da
   ALLAQACHON qurilgan — takrorlamang.
5. Mijozga xabar savoli (7-band) A3 ga o'tdi. Agar «avansingizdan yechildi»
   xabari qurilsa, `applyDelta` ning `source` lug'atiga YANGI qiymat kerak
   bo'ladi (mavjud `'retailsale'`/`'debt'` ikkalasi ham qarz matnini tanlaydi).
6. A3 ning karta ekrani `balanceMinor === null` («o'lchanmagan») uchinchi
   holatini unutmasin — `prepayAvailable` uni 0 qiladi, lekin KARTA uni
   «avansi yo'q» deb ko'rsatmasligi kerak.

### A3 — Avansni ko'rsatish, tarixi va qaytarish · 2026-08-25 · **QISMAN** (jonli tasdiq + lokal `recompute` DRY-RUN kutilmoqda)

**Xulq O'ZGARDI.** Kassir endi mijozning avansini **KO'RADI** (ilgari ekranda
«0» turardi), avans harakatlari tarixda **YORLIQ bilan** chiqadi, va
mijozning sarflanmagan avansini **naqd qaytarish** yo'li ochildi. Egasining
ikkinchi shikoyatining («ishlay olmayapmiz») uchala tomoni ham — qabul (A1),
sarflash (A2), ko'rsatish/qaytarish (A3) — endi kodda TO'LIQ.

Commitlar: **`526dda5c`** (asosiy funksiya + testlar), **`1447a11e`**
(Excel akt-sverkasidagi uchinchi yorliq xaritasi). Branch
`yacheyka-inventarizatsiya`.

#### Bog'liqlik holati (qoida 11 — ochiq aytiladi)

A3 ning sharti — «A2 tugagan bo'lsin». A2 holati **«QISMAN»**: kod va testlar
TO'LIQ, jonli tasdiq deploy'ga bog'liq holda OCHIQ. Kod darajasida
tekshirildi va tasdiqlandi:

| Shart | Holat |
|---|---|
| A2 tenderi joyida (`TENDER.prepay`, `PREPAY` qatori) | ✅ `retail-tenders.ts` da |
| A2 ning sof qoidasi joyida (`prepayAvailable`) | ✅ `pos-customer-debt.ts:201` |
| A1 yo'li joyida (`customerPrepay`, `АВ-` hujjati) | ✅ `cashier-session.service.ts` da |
| A2 ning `salePrepay` docType'i va `recompute` bloklari | ✅ ikkalasi ham joyida |

**FUNKSIONAL bog'liqlik BAJARILGAN** — A3 A2 ning KODIGA tayanadi
(`prepayAvailable` ustiga quriladi), jonli tasdig'iga emas. Egasi Q2/Q3/A1/A2
ni ham aynan shu sharoitda davom ettirishga ruxsat bergan. Meros ochiq
bandlar pastda takrorlanadi.

#### 🔴 Sessiya boshidagi to'siq — daraxtda BOSHQA IKKI sessiyaning ishi

Ish boshlanganda daraxtda A3 AYNAN tegadigan uch fayl (`customer-card-panel.tsx`,
`ru.json`, `uz.json`) **boshqa sessiyaning commit qilinmagan tahririda** edi
(G1 — `returnPayout`/`salesReturn` yorliqlari). Fayllar 12 daqiqa oldin
o'zgargan, ya'ni sessiya FAOL edi.

Qaror: **kutildi va TEGILMADI** (CLAUDE.md §6.1 — «yozish/stash/revert TAQIQ»,
Q2 sessiyasining `git stash` sabog'i). Bir necha daqiqadan keyin o'sha sessiya
o'z ishini `9fe25d15` bilan commit qildi va daraxt tozalandi — A3 ish shundan
KEYIN boshlandi. Ya'ni bu safar **worktree ham, stash ham kerak bo'lmadi**.

Sessiya davomida ikkinchi parallel sessiya (K1 — bo'linadigan tovar reyestri)
o'z ishini daraxtga qo'ydi (`stock-piece/*`, `schema.prisma`, `app.module.ts`,
`tsd-scan.ts`, migratsiya). Unga TEGILMADI; commit `git add <aniq yo'llar>`
bilan qilindi va `git show --name-only` bilan tasdiqlandi: **begona fayl
commit'ga TUSHMADI** (yagona qo'shimcha — hook yozadigan `docs/progress.json`).

⚠️ Buning bitta o'lchov oqibati bor: **to'liq test raqamlari izolyatsiyalanmagan**
(daraxtda K1 ning kodi va testlari ham bor). Shuning uchun pastda ham absolyut
raqam, ham **fayl kesimidagi aniq delta** beriladi.

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `apps/api/src/modules/debt/pos-customer-debt.ts` | **YANGI sof modul** `customerStanding(balanceMinor, registryOutstanding)` — to'rt holat (`debt`/`prepaid`/`settled`/`unmeasured`) + summa + `conflicted` bayrog'i. `debtPayable` va `prepayAvailable` USTIDA turadi, yangi formula YO'Q |
| 2 | `apps/api/src/modules/debt/pos-debt-payment.service.ts` | `GET /debts/pos/summary/:cpId` javobiga `standing` maydoni (mavjud maydonlarning biri ham o'zgarmadi) |
| 3 | `apps/api/src/modules/cashier-session/pos-cash-out.ts` | `CASH_OUT_KIND.prepayRefund = 'prepay_refund'`; prefiks `ВА-`; daftar izohi «Avans qaytarildi»; `CASH_OUT_EVENT.prepayRefund`; audit rejasi (`balanceBeforeMinor` bilan); `summarizeCashOut.prepayRefundMinor` |
| 4 | `apps/api/src/modules/cashier-session/cashier-session.schema.ts` | `CustomerPrepayRefundSchema` (summa IXTIYORIY — berilmasa to'liq qoldiq) |
| 5 | `apps/api/src/modules/cashier-session/cashier-session.service.ts` | **YANGI** `customerPrepayRefund()` + `lockCounterpartyBalance()` (`FOR UPDATE`); `zReport()` ga `prepayRefundMinor`; `cashOutSummary()` ga yangi qator |
| 6 | `apps/api/src/modules/cashier-session/cashier-session.controller.ts` | `POST :id/customer-prepay-refund` (ruxsat va kiosk qamrovi A1 bilan AYNAN bir xil) |
| 7 | `apps/api/src/modules/cashier-session/shift-variance.ts` | `ZReportInput.prepayRefundMinor?` + `ZReport.prepayRefundMinor` (ixtiyoriy ⇒ mavjud chaqiruvchilar buzilmaydi) |
| 8 | `apps/api/src/modules/counterparty-balance/counterparty-balance-doc-types.ts` | `BALANCE_DOC_TYPE.customerPrepayRefund` (nega `returnPayout` ham, `salePrepay` ham qayta ishlatilmagani izohda) |
| 9 | `apps/api/src/modules/counterparty-balance/counterparty-balance-doc-resolver.ts` | `customerPrepayRefund` → `RetailDrawerCashOut` (`returnPayout` bilan AYNI jadval, sikl ikki tur bo'yicha; kalitlar ALOHIDA) |
| 10 | `apps/api/src/scripts/recompute-counterparty-balances.ts` | 🔴 **`SOURCE: customer-prepay-refunds`** bloki (`+sumMinor`, `kind='prepay_refund'`) |
| 11 | `apps/api/src/scripts/counterparty-balance-sources.ts` | `SCRIPT_SOURCES` ga yangi manba; `cashier-session.service.ts` yozuvi UCH manbali bo'ldi |
| 12 | `apps/api/src/modules/counterparty-statement/statement-compute.util.ts` | `DOC_TYPE_LABEL` ga uchala avans turi (Excel akt-sverkasi — yorliq xaritasining UCHINCHI joyi) |
| 13 | `apps/web/src/components/pos/customer-card-panel.tsx` | Karta endi `standing` dan yuradi: «Avansi» yorlig'i + yashil rang; `KNOWN_DOC_TYPES` ga uch yangi tur; `data-standing` atributi (test uchun) |
| 14 | `apps/web/src/components/pos/customers-panel.tsx` | AYNI holat ko'rinishi + **«Avansni qaytarish»** tugmasi va bloki (faqat avansi bor mijozda, smenasiz o'chiq) + RKO cheki chopi |
| 15 | `apps/web/src/app/print/cash-out/[docId]/page.tsx` | RKO chekining sarlavhasi: «AVANS QAYTARILDI» (vozvrat puli bilan chalkashmasin) |
| 16 | `apps/web/src/app/print/reconciliation-act/page.tsx` | `ACT_DOC_TYPES` ga uch yangi tur |
| 17 | `apps/web/src/lib/{z-report-receipt,use-z-receipt-labels}.ts` + `retail/sessions/[id]/page.tsx` | Z-hisobotda «Avans qaytarildi» qatori (chek va ekran) |
| 18 | `apps/web/src/app/(app)/counterparties/page.tsx` | Menejer ro'yxatida avansli mijozlar ajralib turadi (manfiy saldo — yashil + tushuntirish `title`) |
| 19 | `apps/web/src/messages/{ru,uz}.json` | **18 yangi kalit** (9 ru + 9 uz): karta holati (2), qaytarish bloki (4), Z-hisobot qatori (1), doc-type yorliqlari (3+3 = ikki xaritada), menejer izohi (1) |
| 20 | 2 yangi test fayli + 9 mavjudga qo'shimcha | pastga qarang |

**Endpointning shakli** (`customerPrepayRefund`):

```
session ← loadOpenShiftForDrawer      (ochiq · O'Z smenasi · SO'M kassa)
agent   ← counterparty.findFirst      (topilmasa 404)
cashBefore ← expectedCashMinor(...)   («yashiqda yo'q pul» signali uchun)
raqam  ← allocateDocumentNumber('ВА-YYYY-')
$transaction:
    balansOldin ← lockCounterpartyBalance(FOR UPDATE)   ← BIRINCHI YOZUV
    available   ← prepayAvailable(balansOldin)          ← A2 ning SOF qoidasi
    available = 0                  ⇒ 400 («qaytariladigan avans yo'q»)
    so'ralgan > available          ⇒ 400 (ANIQ son bilan)
    so'ralgan berilmagan           ⇒ TO'LIQ qoldiq
    retailDrawerCashOut.create({ kind:'prepay_refund', agentId })
    audit (PREPAY_REFUND [+ CASH_OVERDRAWN])
    money.applyDeltas(drawerMoneyDeltas({kind:'out'}))  → CashDesk −summa
    balance.applyDelta(+summa, docType:'customerPrepayRefund')
```

#### 🔴 Rejadan TO'RTTA ataylab chekinish

**1. `customerStanding` `conflicted` bayrog'ini ham qaytaradi (rejada YO'Q).**
Reja to'rt holat va «tegishli summa» ni so'ragan edi. Lekin o'lchandi:
manfiy balans + reyestrda ochiq qarz holatida `debtPayable` VA
`prepayAvailable` **ikkalasi ham noldan katta** bo'ladi (A2 ning
`pos-prepay-available.test.ts` da bu «har biri O'Z daftariga sodiq» deb
qulflangan). Ya'ni to'rt holat kifoya emas: qaysi biri ko'rsatilishi
KERAK degan savol qoladi.

Qaror: ekran **pul daftariga ergashadi** (`prepaid`) — mijozning puli bizda
turganda undan qarz so'rash reja invariant 4 ning ochiq buzilishi bo'lardi.
Lekin ziddiyat **JIM emas**: `conflicted: true` qaytadi va kartadagi mavjud
`registryExceedsBalance` ogohlantirishi baribir chiziladi.

**2. `unmeasured` holatida summa NOL EMAS — reyestr qarzi ko'rsatiladi.**
A2 hisobotining 6-eslatmasi «`balanceMinor === null` uchinchi holatini
unutmang» degan edi. Amalda uchinchi holat IKKI qismli: balans qatori yo'q,
LEKIN reyestrda haqiqiy qarz bo'lishi mumkin. `unmeasured` da summa
`debtPayable(null, reyestr)` — ya'ni qarz ko'rinadi (aks holda kassir
to'lovni qabul qilmasdan qaytarib yuborardi), holat esa baribir
«o'lchanmagan» deb belgilanadi va karta buni alohida qator bilan aytadi.

**3. `sumMinor` IXTIYORIY (`CustomerPrepaySchema` da MAJBURIY edi).**
Reja imzoni aytmagan. Qabulda «qolgani qancha» degan manba YO'Q (mijoz
qancha bersa shuncha), qaytarishda esa BOR — mijozning avansi. Shuning uchun
bu yerda `CustomerPayoutSchema` (G1) naqshi olindi: berilmasa TO'LIQ qoldiq
qaytariladi, ekran esa maydonni o'sha son bilan to'ldiradi.

**4. «Avansni qaytarish» tugmasi faqat avansi bor mijozda KO'RINADI.**
Reja tugmani shartsiz tasvirlagan edi. Avansi yo'q mijozda u har doim 400
beradigan tugma bo'lardi — kassirni ishlamaydigan yo'lga chorlash. Tugma
`standing.kind === 'prepaid'` da chiziladi; server cap'i esa mustaqil
ishlaydi (ekran — qulaylik, HAQIQIY qaror serverda, qulf bilan).

#### 🔴 Migratsiya KERAK EMAS — o'lchangan

`RetailDrawerCashOut.kind` ustuni `String @default("other") @db.VarChar(20)`
(sxemadan o'qildi), yangi qiymat `'prepay_refund'` — **14 belgi**.
`agentId` ustuni jadvalda ALLAQACHON bor (G1 `return_payout` uchun qo'shgan),
`@@index([accountId, retailShiftId, kind])` ham bor.

**Ya'ni A3 da yangi migratsiya YO'Q**, va qoida 7 ning migratsiya-bandi
qo'llanmaydi. VPS'da berilishi kerak bo'lgan migratsiyalar hamon O'SHA
IKKITASI: `20260825120000_debt_source_doc` (Q1) va
`20260825220000_drawer_cash_in_kind` (A1).

#### 🔴 Avans tarixi — YOZMA TASDIQ (reja A3 vazifasi 3)

Reja «mavjud `GET /debts/pos/history/:cpId` yangi `docType` larni AVTOMATIK
ko'rsatadi — tekshirilsin va hisobotda yozma tasdiqlansin» degan edi.

**Tasdiqlanadi, uch dalil bilan:**

1. `pos-debt-payment.service.ts#history` `journalWhere({accountId,
   counterpartyId, currency})` dan yuradi — `docType` filtri UMUMAN yo'q
   (`counterparty-balance-journal.util.ts` sarlavhasi buni «chala-ro'yxat
   bug-klassi» deb ataydi va shaklini testda qulflagan);
2. `foldPosHistory` ham turni tekshirmaydi (yagona istisno — `opening`,
   u tarixiy qoldiq sifatida alohida ko'rsatiladi);
3. **yangi test** (`pos-debt-history.test.ts`): uchala tur
   (`customerPrepay`, `salePrepay`, `customerPrepayRefund`) ro'yxatda
   qoladi va ishoralari to'g'ri (qabul `−`, sarf va qaytarish `+`).

Ya'ni A3 tarix uchun **server kodini o'zgartirmadi** — faqat YORLIQLARNI
(uch xarita) qo'shdi, chunki A1/A2 ularni ataylab A3 ga qoldirgan edi.

#### Yorliq xaritalari — REJA IKKITASINI BILARDI, UCHINCHISI TOPILDI

| # | Joy | Kim o'qiydi |
|---|---|---|
| 1 | `pages.pos.customer_card_doc` (ru+uz) + `KNOWN_DOC_TYPES` | POS mijoz kartasi tarixi |
| 2 | `pages.print.act.doc_types` (ru+uz) + `ACT_DOC_TYPES` | akt-sverka chop sahifasi |
| 3 | 🔴 `DOC_TYPE_LABEL` (`statement-compute.util.ts`) | **Excel akt-sverkasi** — mijozga yuboriladigan fayl |

Uchinchisi SERVER tomonda va reja ro'yxatida yo'q edi; usiz mijozga
ketadigan Excel aktida xom `customerPrepayRefund` satri chiqardi
(commit `1447a11e`).

⚠️ **TOPILDI, LEKIN TUZATILMADI (begona faza ishi):** o'sha serverdagi
xaritada `returnPayout` (G1) va `salesReturn` (P14) ham YO'Q. G1 sessiyasi
bugun (`9fe25d15`) IKKI web xaritasini tuzatdi, serverdagi uchinchisi esa
ochiq qoldi — G1 ning «ochiq qolganlar» bandiga qaytadi.

#### Test natijalari (raqam bilan)

| O'lchov | Natija |
|---|---|
| `apps/api` **to'liq** vitest | **658 fayl · 9350 test YASHIL**, 1 fayl / 2 test skip |
| ...ning beqarorlik qaydi | ⚠️ Yuk ostida `auth/{pos,tsd}-device.service.test.ts` ning argon2 testlari 5 s timeout bilan yiqilishi mumkin (A1 hisoboti bu sinfni allaqachon qayd etgan). ALOHIDA yugurtirilganda **47/47 yashil**; oxirgi to'liq yugurish TO'LIQ yashil. A3 ga aloqasi yo'q — bu fayllarga tegilmagan |
| `apps/web` **to'liq** vitest | **327 fayl · 4321 test YASHIL**, 26 skip |
| `apps/api` typecheck (`tsc --noEmit`, `--max-old-space-size=8192`) | **0 xato** |
| `apps/web` typecheck | **0 xato** |
| `node scripts/check-lint.mjs` | **mening fayllarimda 0 error** (qolgan 7 xato — parallel K1 sessiyasining tugallanmagan fayllari: `stock-piece/*`, `app.module.ts`, `reports/piece-reconciliation`; TEGILMADI) |
| `pnpm i18n:gate` | **19 test yashil** (1115 fayl, 15 818 statik kalit) |

**Yangi testlar — jami 80, fayl kesimida ALOHIDA o'lchandi** (absolyut
raqamlar K1 sessiyasi tufayli izolyatsiyalanmagan, delta esa aniq):

| Fayl | Delta | Nimani qulflaydi |
|---|---|---|
| `debt/pos-customer-standing.test.ts` | **11** (YANGI) | to'rt holat · summa HECH QACHON manfiy emas · `null` balans «avansi yo'q» EMAS · `null` + reyestr qarzi → qarz YASHIRILMAYDI · nomuvofiqlik (`prepaid` + `conflicted`) · **`debtPayable`/`prepayAvailable` bilan zid natija bermaydi** (ikkinchi formula yozilsa qizil) |
| `cashier-session/customer-prepay-refund.test.ts` | **26** (YANGI) | pul izi to'rt joyda (`ВА-` hujjati · kassa `−` · balans `+` · audit) · summa berilmasa TO'LIQ qaytadi · **invariant 4** (tuzoq-mock: `debt`/`debtNote` ga bir marta ham tegilmaydi) · **`FOR UPDATE` qulfi rostdan olinadi** · `CASH_OVERDRAWN` signali · **kassa qoldig'i yetmasa pul daftari TO'XTATADI** · CAP: ortiq → 400 aniq son bilan · avansi yo'q / balans nol / **balans o'lchanmagan** → 400 · chegara qiymati o'tadi · **ketma-ket ikki qaytarish qoldiqdan oshmaydi** (HOLATLI balans — A2 sabog'i) · yopiq/begona smena · USD kassa · 404 · nol/manfiy summa · **7 kod-shakl qo'riqchisi** (qulf `applyDelta` dan OLDIN · cap sof qoidadan · musbat delta · `kind:'out'` · AYNAN `retailDrawerCashOut` jadvali · `source` BERILMAYDI) |
| `cashier-session/pos-cash-out.test.ts` | **+8** | `ВА-` prefiksi va uning UNIKALLIGI · daftar izohi · hujjat qoidalari (modda/qabul qiluvchi bo'lmaydi) · audit payload'i · **`balanceBefore` `null` ≠ `0`** · overdrawn juftligi · **Z-hisobotda O'Z QATORI** (`other` ga tushmaydi) · turi yo'q smenada 0 |
| `debt/pos-debt-summary.test.ts` | **+5** | `standing` javobda: `prepaid`/`debt`/`unmeasured`/`settled` · **mavjud maydonlar o'zgarmadi** (orqaga moslik) · nomuvofiqlikda `conflicted` + `registryExceedsBalance` birga |
| `debt/pos-debt-history.test.ts` | **+2** | 🔴 uchala yangi tur tarixda FILTRLANMAYDI · ishora konvensiyasi (qabul `−`, sarf va qaytarish `+`) |
| `auth/kiosk-policy-customer-prepay.test.ts` | **+4** | yangi marshrut kioskda ochiq · **YANGI QATOR QO'SHILMAGAN** (qamrov o'lchovi) · `/cash-in` va ПКО daraxti HAMON YOPIQ |
| `counterparty-balance/counterparty-balance-doc-resolver.test.ts` | **+2** | `ВА-` raqami chiqim jadvalidan · **`returnPayout` bilan kalitlar ALOHIDA** (kassa KIRIM jadvaliga tegilmaydi) |
| `scripts/counterparty-balance-sources.test.ts` | **+2** | 🔴 uch tomonlama qulf: yozuvchi ↔ reyestr ↔ skript **TANASI** (`kind='prepay_refund'`, MUSBAT ishora) · `return_payout` va `prepay_refund` bloklari ALOHIDA |
| `cashier-session/shift-variance.test.ts` | **+3** | `prepayRefundMinor` kutilgan naqdga ham, farqqa ham TEGMAYDI · berilmasa `0n` · **uchala avans raqami MUSTAQIL** |
| `manager/collection/debt-collection.service.test.ts` | **+2** | 🔴 undirish ro'yxati `counterpartyBalance` ga UMUMAN murojaat qilmaydi (sof modulda ham balans tushunchasi yo'q) — **avansli mijoz u yerga tushishi mumkin emas** |
| `counterparty-statement/statement-compute.util.test.ts` | **+3** | Excel yorliqlari · **B2B `prepayment` bilan chalkashmaydi** · noma'lum tur hamon o'zini qaytaradi |
| `web/pos/__tests__/customer-card-panel.test.tsx` | **+5** | «Avansi» yorlig'i va AVANS summasi · **qarzdorda AVVALGIDEK** (regressiya yo'q) · o'lchanmagan holat · **eski server javobi (`standing` yo'q) — xulq o'zgarmaydi** · avans harakatlari tarixda YORLIQ bilan (xom `docType` emas) |
| `web/pos/__tests__/customers-panel.test.tsx` | **+7** | avans summasi ko'rinadi · **qarzdorda tugma YO'Q** · maydon qolgan avans bilan to'ladi · POST + RKO cheki + blok yopiladi · **ortiq summada tugma o'chiq, chegarada ochiq** · **`/debts` ga POST ketmaydi** · mijoz almashsa blok yopiladi |

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Balans / pul — YANGI YOZUVCHI, va u QAMROVDA.**
   `cashier-session.service.ts` allaqachon `DECLARED_BALANCE_WRITERS` da edi;
   unga UCHINCHI manba (`customer-prepay-refunds`) qo'shildi va
   `recompute-counterparty-balances.ts` ga mos blok yozildi. **Bu unutilsa
   cross-check har qaytargan mijozda yolg'on farq ko'rsatardi** — A1 va A2
   hisobotlari aynan shundan ogohlantirgan. Uch tomonlama qo'riqchi test bor.
2. **`Debt` reyestri / undirish ro'yxati / eslatma cron'i — TEGILMAYDI
   (invariant 4).** Qaytarish yo'li `debt`/`debtNote` delegatlariga umuman
   murojaat qilmaydi (tuzoq-mock + kod-shakl testi). Qo'shimcha: undirish
   ro'yxatining O'ZI balansdan o'qimasligi ham endi test bilan qulflangan —
   ya'ni avansli mijoz u yerga IKKI tomondan ham tusha olmaydi.
3. **Smena hisobi / kutilgan naqd — MAQSAD, va u KODSIZ ishlaydi.**
   Hujjat `RetailDrawerCashOut` da turgani uchun `collectCashInputs.drawerOutMinor`
   uni O'Z-O'ZIDAN ayiradi (`kind` UMUMAN o'qilmaydi). Formulaga bir qator
   ham qo'shilmadi ⇒ «yangi turni qo'shishni unutish» xatosi tug'ilishi
   mumkin emas (A1 dagi AYNI dalil, kirim tomonida).
4. **Z-hisobot — YANGI QATOR, jamiga TEGMAYDI.** `prepayRefundMinor`
   ixtiyoriy maydon ⇒ mavjud chaqiruvchilar va muzlatilgan javoblar
   buzilmaydi; `expectedCashMinor` ga ALOHIDA qo'shilmaydi (`returnPayout`
   bilan AYNI munosabat: pul `drawerOut` orqali allaqachon ayirilgan).
   ⚠️ `summarizeCashOut.totalMinor` ga esa **QO'SHILADI** — u «naqddan
   chiqqan JAMI pul» degan ma'noni bildiradi va avans qaytarish ham pul
   chiqishi. Test buni AYNAN o'lchaydi (40k + 15k + 3k = 58k).
5. **Mijozga Telegram xabari — YANGI XABAR KETMAYDI.** `applyDelta` ga
   `source` ATAYLAB berilmaydi (A1/A2 bilan bir xil qaror): musbat delta
   «🛒 Qarzga qo'shildi» matnini tanlardi va o'z pulini qaytarib olgan
   mijozga bu OCHIQ YOLG'ON bo'lardi. Kod-shakl testi `source:` yo'qligini
   tekshiradi; `debt-source-wiring` qo'riqchisi yashil.
6. **POS «Qarz to'lovi» oynasi / FIFO — TEGILMAGAN.** `debtPayable`
   o'zgarmadi; `summary()` javobiga faqat maydon QO'SHILDI.
7. **POS mijoz kartasi — ESKI SERVER bilan ham ishlaydi.** `standing`
   ixtiyoriy o'qiladi: yo'q bo'lsa ekran AVVALGIDEK `payableMinor` ni
   chizadi (deploy oynasida FE yangi, API eski bo'lishi mumkin). Test bor.
8. **Akt-sverka / statement — SALDO TO'G'RI, YORLIQ endi TO'LIQ.** Saldo
   docType ro'yxatiga bog'liq emas (Faza 10 shartnomasi); uch xarita esa
   endi uchala avans turini ham biladi.
9. **Kiosk qamrovi — BIR ZARRA ham kengaymadi.** Yangi marshrut
   `/cashier-sessions` prefiksi ostida (`methods: ['*']`), ya'ni ro'yxatga
   qator QO'SHILMADI va bu test bilan o'lchanadi. `/cash-in` va ПКО daraxti
   YOPIQ qoldi.
10. **Ruxsat matritsasi — YANGI RUXSAT YO'Q** (`cashiersession.create`,
    `customer-payout`/`customer-prepay` bilan bir xil).
11. **Deadlock — yangi yuza ochilmadi.** Qulf tartibi butun repoda BITTA:
    **BALANS → QARZLAR**. Bu yerda faqat balans qulflanadi (qarz qulfi
    umuman olinmaydi), ya'ni tartib buzilishi mumkin emas.
12. **USD kassa — OCHIQ 400** (`loadOpenShiftForDrawer` qo'riqchisi,
    A1 bilan bir xil chegara).
13. **`ВА-` raqamlar ketma-ketligi** — `allocateDocumentNumber` orqali,
    `ВВ-` (G1) va `АВ-` (A1) dan ALOHIDA hisoblagich (prefiks boshqa).
    Prefikslarning UNIKALLIGI test bilan o'lchanadi.
14. **RKO cheki — sarlavha turni AYTADI.** Avans qaytarish cheki «VOZVRAT
    PULI» deb bosilsa, mijoz imzolagan qog'oz noto'g'ri hodisani tasdiqlardi
    (tovar qaytmagan). Yangi sarlavha: «AVANS QAYTARILDI».
15. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** A3 `stock`, `store-cell`,
    `retail-allocation`, `retail-sale` fayllariga bir qator ham yozmadi.
    H-, G- va K-rejalar hududiga kirilmadi.
    ⚠️ Lekin branch'da G4/G5/G6, Q1–Q3, A1, A2 va (commit qilinmagan holda)
    K1 ham turibdi — **deploy oynasi ularni ham olib chiqadi**, shuning uchun
    deploy paytida qoida 8 ning `warehouse-state.ts` qo'shimchasi va qoida 13
    ning uchma-uch smoke'i MAJBURIY.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | sof modul — to'rt holat | ✅ 11 test |
| 2 | karta ko'rinishi (qarz / avans / o'lchanmagan) | ✅ 5 web test |
| 3 | qaytarish cap va poyga | ⚠️ **QISMAN** — cap 5 test bilan, qulf `FOR UPDATE` ekani va `applyDelta` dan OLDIN olinishi kod-shakl testi bilan, ketma-ket qaytarish HOLATLI balans ustida; **HAQIQIY ikki-sessiyali poyga bazani talab qiladi** (A2 dagi AYNI to'siq) |
| 4 | tarixda avans qatorlari ko'rinishi | ✅ server testi + web testi + yozma tasdiq (yuqorida) |
| 5 | i18n ru + uz, gate'lar yashil | ✅ 19 test, 18 yangi kalit |
| 6 | menejer tomoni (avansli mijozlar ko'rinadi) | ✅ ro'yxat ustuni; **undirish ekranida chiqmasligi** qo'riqchi test bilan |
| 7 | api + web testlari to'liq yashil | ✅ 9342 + 4321 |
| 8 | **jonlida: avansi bor mijoz kartasida «Avansi: N»** | ❌ **VPS/deploy kerak** |
| 9 | **jonlida: tarixda kirim va sarf qatorlari** | ❌ VPS kerak |
| 10 | **jonlida: qolgan avans naqd qaytariladi, balans nolga keladi** | ❌ VPS kerak |
| 11 | **jonlida: qarzi bor mijozda karta AVVALGIDEK** (regressiya yo'q) | ❌ VPS kerak |
| 12 | **`recompute` DRY-RUN lokal bazada** (A3 bloki bilan) | ❌ **parol kutilmoqda** (`packages/db/.env` repoda yo'q — A2 dagi AYNI to'siq) |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 3, 8–12
bandlari.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi.

🔴 **Deploy branch'i YANGILANISHI KERAK.** `kassa-qarzi-q1-q2` @ `456e53af`
da Q3 ham, A1 ham, A2 ham, A3 ham YO'Q. Hozirgi `yacheyka-inventarizatsiya`
da esa A3 bilan bir qatorda **G4 (ombor avto-taqsimoti), G5/G6 (TSD)** va
(commit qilinsa) **K1 (bo'linadigan tovar)** ham turibdi — `git merge --ff-only`
ularni AJRATA OLMAYDI. Q2 dagi cherry-pick retsepti bilan yangi branch
yig'ilishi kerak (`4f5c1750` asosida: Q1 → Q2 → Q3 → A1 → A2 → **A3**
+ onboarding kalendar tuzatmasi). **Bu A3 sessiyasida QILINMADI — buyruq
kutilmoqda.**

Migratsiyalar: **A3 da yangisi YO'Q** (yuqorida o'lchandi). Q1 niki
(`20260825120000_debt_source_doc`) va A1 niki
(`20260825220000_drawer_cash_in_kind`) — **ikkalasi ham VPS'da BERILMAGAN**
va kod'dan OLDIN berilishi SHART.

#### Jonli tekshiruv retsepti (deploy'dan KEYIN)

Deploy oldidan/keyin (qoida 8): `packages/db` da
`npx tsx scripts/warehouse-state.ts` — chiqishi hisobotga ko'chiriladi.

1. A1 retsepti bilan sinov mijozga **100 000** avans kiritiladi → balans
   **−100 000**.
2. POS «Mijozlar» tabi → shu mijoz → 🔴 yirik son **«Mijozning avansi
   100 000»** (yashil) bo'lib chiqadi — ilgari bu yerda «0» turardi.
   Mijoz kartasi (`Mijoz kartasi` tugmasi) ham AYNI sonni ko'rsatadi.
3. Kartadagi **tarix**: `АВ-…` qatori «Avans qabul qilindi» yorlig'i bilan
   (xom `customerPrepay` satri EMAS).
4. A2 retsepti bilan **60 000** lik chek avansdan to'lanadi → karta endi
   **40 000** avans ko'rsatadi, tarixda «Avansdan to'lov» qatori paydo
   bo'ladi.
5. 🔴 **«Avansni qaytarish»** tugmasi bosiladi → maydon **400** (qolgan
   avans) bilan to'lgan bo'ladi → «Qaytarish».
6. RKO cheki (`ВА-2026-…`) **«AVANS QAYTARILDI»** sarlavhasi bilan chop
   oynasida ochiladi.
7. Kassa qoldig'i **−40 000**; kontragent balansi **0**; karta endi
   «To'lanadigan qarz 0» ko'rsatadi (`settled`).
8. Tarixda uchinchi qator: «Avans qaytarildi» (`ВА-` raqami bilan).
9. 🔴 **Ortiqcha urinish:** avansi qolmagan mijozda tugma UMUMAN
   ko'rinmaydi; API'ga to'g'ridan-to'g'ri so'rov 400 beradi.
10. Z-hisobot: «Avans qaytarildi» qatori **400**, «Mijozlardan avans»
    **1 000**, «Avansdan to'landi» **600** — uchalasi AYRIM.
11. Smena yopiladi → kamomad/ortiqcha **0** (kassir 100 000 kirib,
    40 000 chiqqanini sanaydi).
12. 🔴 `/menejer/undirish` → shu mijoz **CHIQMAYDI** (invariant 4).
13. Menejer `/counterparties` ro'yxati: avansi bor mijozning saldosi
    **yashil** va `title` da «avans» tushuntirishi bor.
14. 🔴 **Regressiya:** qarzi bor BOSHQA mijoz kartasi AVVALGIDEK
    «To'lanadigan qarz» ni ko'rsatadi (rang va yorliq o'zgarmagan).
15. **`recompute` DRY-RUN** (jonlida, `APPLY` SIZ): avans qaytargan
    mijozda farq ko'rsatmasligi — A3 skript blokining jonli isboti.
16. Uchma-uch smoke (qoida 13): bitta sotuv (post → tekshir → cancel),
    bitta yacheyka sanash, bitta ko'chirish.
17. Izni tozalash: 5-band (qaytarish) avansni o'zi nolga keltiradi;
    qolgan hujjatlar (`АВ-`, `ВА-`) pul izi sifatida QOLADI — bu to'g'ri,
    pul hujjati o'chirilmaydi (A1 ning STORNO qarori).

#### Ochiq qolganlar

1. **Q1 dan meros (o'zgarishsiz):** `recompute` cross-check'iga `opening`
   manbasi qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani
   tekshirilmagan (VPS kirishi kerak).
2. **Q2/Q3/A1/A2 dan meros:** jonli tasdiq, deploy branch'i push
   qilinmagan; A2 ning `edit()` chegarasi (avansdan to'langan chek
   TAHRIRLANMAYDI) va Z-hisobot `revenueByMethod` kesimi — o'zgarishsiz.
3. **A3 ning O'Z ochiq bandlari:** jonli tasdiqning 8–11 va 13–14
   bandlari; lokal bazada `recompute` DRY-RUN (**parol kutilmoqda**);
   haqiqiy ikki-sessiyali poyga sinovi.
4. 🔴 **Excel akt yorliqlarida `returnPayout` va `salesReturn` HAMON YO'Q**
   (`DOC_TYPE_LABEL`) — A3 topdi, lekin bu G1/P14 ning ishi, TEGILMADI.
5. **Avans harakati haqida mijozga xabar** («avansingizdan yechildi») —
   A2 uni A3 ga surgan edi. **A3 da ham YOZILMADI, ataylab:** har uch yo'lda
   (`customerPrepay`, `salePrepay`, `customerPrepayRefund`) `source`
   berilmaydi, chunki mavjud `source` lug'ati faqat QARZ matnlarini
   (`🛒 Qarzga qo'shildi` / `↩️ Qarzingizdan ayirildi`) tanlaydi va
   ikkalasi ham avans uchun YOLG'ON. Yangi xabar turi = yangi shablon +
   yangi `source` qiymati + egasining matn qarori ⇒ **alohida ish**
   (tavsiya: Q6 yoki egasi so'raganda). Bu jimlik shu yerda va kod
   izohlarida OCHIQ qayd etilgan.
6. **Avansi bor mijozda «Qarz to'lash» tugmasi hamon ko'rinadi** — u
   `payableMinor = 0` bilan ochiladi va POS «ochiq qarz yo'q» deydi.
   Zarar yo'q, lekin ortiqcha qadam; A3 hajmidan tashqarida qoldirildi.

#### Keyingi fazaga (Q4 yoki Q6) eslatmalar

1. `customerStanding` — ekran holatining YAGONA manbasi. Yangi ekran
   (masalan Q4 ning undirish qatori) mijoz holatini ko'rsatmoqchi bo'lsa
   AYNAN shundan yursin, `balanceMinor` ning ishorasini qayta o'qimasin.
2. `conflicted` bayrog'i hozircha faqat ekran ogohlantirishi uchun.
   Agar Q4 da undirish ro'yxatiga «nomuvofiq mijozlar» filtri kerak
   bo'lsa — manba shu.
3. `prepay_refund` hujjati `RetailDrawerCashOut` da `return_payout` bilan
   YONMA-YON yashaydi. Bu jadvalni o'qiydigan HAR yangi hisobot `kind` ni
   TEKSHIRSIN — aks holda avans qaytarishlari «vozvrat puli» bo'lib
   sanaladi (`summarizeCashOut` da ular ALOHIDA, naqsh o'sha).
4. Z-hisobotda endi **uchta** avans raqami bor va ular hech qachon
   qo'shilmaydi: `prepayMinor` (kirim) · `prepaySpentMinor` (sarf) ·
   `prepayRefundMinor` (chiqim). Yangi qator qo'shilsa shu intizom
   saqlansin (`shift-variance.ts` izohi).
5. Q5 (backfill) A3 ga TEGMAYDI: avans qatorlari `Debt` reyestriga hech
   qachon tushmaydi, ya'ni backfill ularni ko'rmasligi kerak. Skript
   `retailSalePayment` `TENDER.debt` qatorlaridan yuradi — `PREPAY`
   qatorlari u yerga tushmaydi (A2 da ajratilgan).

### Q4 — Undirish ekranida MANBA va muddat siyosati · 2026-08-25 · **QISMAN** (jonli tasdiq + lokal baza migratsiyasi kutilmoqda)

**Xulq O'ZGARDI (faqat KO'RSATISH va SOZLASH tomonida).** Menejer endi har
qatorda «bu qarz qayerdan keldi» ni ko'radi (kassa cheki / reyestr), kassa
qarzini CHEK RAQAMI havolasi bilan ochadi va manba bo'yicha filtrlaydi;
kassa qarzining muddati akkaunt sozlamasiga chiqdi. **Pul yo'liga, balansga
va qarz SUMMASIGA bir bayt ham tegilmadi** — Q4 mavjud qatorlarni faqat
o'qiydi (yagona yozuv — yangi chek qatorining `nextContactAt` i, u ham
sozlama qo'yilganda).

Commit: **`7ddd4e21`** (branch `yacheyka-inventarizatsiya`, 29 fayl,
+1695/−59).

#### Bog'liqlik holati (qoida 11 — ochiq aytiladi)

Q4 ning sharti — «Q3 dan keyin». Q3 holati **«QISMAN»** (kod va testlar
to'liq, jonli tasdiq deploy'ga bog'liq holda ochiq). Kod darajasida
tekshirildi:

| Shart | Holat |
|---|---|
| Q1 migratsiyasi (`sourceDocType`/`sourceDocId`) sxemada | ✅ |
| Q2 yozuvchisi (`writeSaleDebtRegistryRow`) joyida | ✅ |
| Q3 harakatlantiruvchisi (`moveSaleDebtRegistryRow`) joyida | ✅ |
| Q1 sof moduli (`saleDebtDueAt`, `DEFAULT_SALE_DEBT_TERM_DAYS`) | ✅ |

**FUNKSIONAL bog'liqlik BAJARILGAN** — Q4 Q1–Q3 ning KODIGA tayanadi, jonli
tasdig'iga emas. Egasi Q2/Q3/A1/A2/A3 ni ham aynan shu sharoitda davom
ettirishga ruxsat bergan. Meros ochiq bandlar pastda takrorlanadi.

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `packages/db/prisma/schema.prisma` (`model CompanySettings`) | `saleDebtTermDays Int? @map("sale_debt_term_days")` + to'liq izoh (nega DB-DEFAULT YO'Q) |
| 2 | `packages/db/prisma/migrations/20260825235000_company_settings_sale_debt_term/migration.sql` | idempotent DDL: `ADD COLUMN IF NOT EXISTS` ×1 |
| 3 | `packages/db/scripts/rollback/20260825235000_company_settings_sale_debt_term_down.sql` | **YANGI** — teskari yo'l (qoida 12) |
| 4 | `apps/api/src/modules/debt/sale-debt-registry.ts` | **YANGI sof qoidalar**: `resolveSaleDebtTermDays`, `isSaleDebtTermDaysCorrupt`, `SALE_DEBT_TERM_DAYS_MIN/MAX` |
| 5 | `apps/api/src/modules/manager/collection/debt-collection.ts` | **YANGI sof qoidalar**: `CollectionSource`, `collectionSourceOf`, `filterCollectionRowsBySource`; `CollectionDebtInput`/`CollectionRow` ga manba maydonlari; `CollectionSummary` ga `retailSaleCount`/`registryCount` |
| 6 | `apps/api/src/modules/manager/collection/manager-collection.schema.ts` | `CollectionQuery.source` (yopiq ro'yxat) |
| 7 | `apps/api/src/modules/manager/collection/debt-collection.service.ts` | manba ustunlarini o'qish, `saleNamesByDebtSource` (bitta yig'ma so'rov), manba filtri |
| 8 | `apps/api/src/modules/debt/debt.service.ts` | `toDto` ga `source`/`sourceDocId`/`sourceDocNumber`; `list()` ga `saleNamesForDebts` yig'ma so'rovi |
| 9 | `apps/api/src/modules/company-settings/{schema,service}.ts` | `saleDebtTermDays` sahifa maydoni + default + `get()` da NULL→default chiqarish |
| 10 | `apps/api/src/modules/retail-sale/retail-sale.service.ts` | **YANGI** `readSaleDebtTermDays()`; Q2 yozuvchisi va Q3 ning «qayta ochilgan qator» tarmog'i sozlamadan yuradi |
| 11 | `apps/web/src/lib/domain-status-tone.ts` | **YANGI** `DEBT_SOURCE_TONE` + `debtSourceTone()` — UMUMIY lug'at (UI Convention 6) |
| 12 | `apps/web/src/app/(app)/menejer/undirish/page.tsx` | manba belgisi + chek havolasi + **manba filtri** + «Kassadan: N» sanog'i + manbaga qarab BO'SH holat matni |
| 13 | `apps/web/src/app/(app)/debts/page.tsx` | **YANGI «Qarz manbasi» ustuni** (AYNI belgi, AYNI lug'at) |
| 14 | `apps/web/src/lib/debt-api.ts` | `DebtSourceKind` + `DebtRow` ga uch maydon |
| 15 | `apps/web/src/app/(app)/settings/company/page.tsx` | **«Kassa qarzi» bo'limi** — muddat maydoni + chegara izohi |
| 16 | `apps/web/src/messages/{ru,uz}.json` | 12 yangi Q4 kaliti + **20 tiklangan A3 kaliti** (pastga qarang) |
| 17 | `apps/web/src/__tests__/domain-status-tone.test.ts` | `DEBT_SOURCE_TONE` kanoni qulflandi |
| 18 | 2 yangi test fayli + 6 mavjudga qo'shimcha | pastga qarang |

**Manba xaritasining shakli** (sof, BITTA joyda):

```
Debt.sourceDocType === 'retailsale'  =>  'retailsale'   (kassa cheki, Q2)
aks holda (NULL yoki noma'lum tur)   =>  'registry'     (qo'lda / adopsiya)
```

#### 🔴 Rejadan BESHTA ataylab chekinish

**1. Manba filtri SOF qatlamda, Prisma `where` ida EMAS.** Reja «`CollectionQuery`
ga `source` filtri» degan edi, joyini aytmagan. SQL'ga qo'yilsa `registry`
sharti `source_doc_type <> 'retailsale'` bo'lardi va Postgres'da bu **NULL
larni CHIQARIB TASHLAYDI** (`NULL <> 'x'` — UNKNOWN), ya'ni qo'lda ochilgan
BARCHA `QRZ-` qarzlari filtr yoqilganda jimgina yo'qolardi. Sof qatlamda
bunday tuzoq yo'q va u `scope='due'` filtri bilan bitta joyda turadi
(«nechta qator kesildi» hisobi ham bitta manbadan). Qo'riqchi test:
«`registry` — NULL li qator ham, noma'lum turli qator ham QOLADI».

**2. MANBA rangi sahifada EMAS, `lib/domain-status-tone.ts` da.** Sahifaga
`SOURCE_TONE` xaritasi yozilgan edi va **UI Convention 6 ning qo'riqchisi uni
darhol tutdi** (`domain-status-tone.test.ts` — «har sahifa umumiy lug'atdan
yursin»). Bu bemaqsad emas: belgi IKKI ekranda ko'rinadi va sahifa-lokal
nusxa aynan shu faylning tarixidagi 38 ta drift'ning takrori bo'lardi.
Xarita umumiy lug'atga ko'chdi va kanoni testda qulflandi.

**3. Ustun sarlavhasi `col_source` EMAS, `col_debt_source`.** `pages.debts.col_source`
ALLAQACHON band va BOSHQA ma'noda: to'lovlar/hisobot ekranlarida u «pul
qayerdan qabul qilindi» (kassa nomi). Bir kalitni ikki ma'noda ishlatish —
tarjima bir kun ikkalasidan biriga to'g'ri kelmasligini kafolatlaydi.

**4. Sozlama maydoni O'Z QORALAMASINI ushlaydi.** `<input type="number">` ni
to'g'ridan-to'g'ri `form` ga bog'lash **o'lchangan xato** berdi: tozalash
(`''`) `NaN` beradi, uni e'tiborsiz qoldirsak eski son QAYTA chiziladi va
kiritilgan raqam uning ortidan qo'shiladi — testda `14` + `30` = **`1430`**
bo'lib chiqdi. Endi maydon satr-qoralama ushlaydi, `form` esa faqat yaroqli
butun songa yangilanadi, `onBlur` da qoralama oxirgi yaroqli qiymatga
qaytadi. (`0` — haqiqiy qiymat, shuning uchun «bo'sh => 0» yo'li ataylab yo'q.)

**5. Yaroqsiz sozlama chekni YIQITMAYDI.** Reja bu holatni aytmagan.
`resolveSaleDebtTermDays` `throw` qilmaydi: default olinadi va **ogohlantirish
logi** yoziladi. Sabab — 2026-08-24 hodisasining sinfi: sozlamadagi buzuq son
uchun qarzli chekni 500 bilan qaytarish kassani to'xtatish demakdir. Yozuv
yo'li (`UpdateCompanySettingsSchema`) yaroqsiz qiymatni allaqachon rad etadi,
ya'ni bunday qiymat faqat qo'lda SQL bilan paydo bo'ladi.

#### 🔴 Yo'l-yo'lakay topilgan MAVJUD nosozlik — A3 ning 20 i18n kaliti YO'Q edi

**Bu Q4 ning ishi EMAS, lekin Q4 ni bloklab turgan edi** (qabul mezoni:
«gate'lar yashil»).

`pnpm i18n:gate` **QIZIL** chiqdi va yetishmayotgan 11 kalitning **bittasi ham
Q4 niki emas** edi — hammasi A3 (`526dda5c`) niki: `pages.pos.customer_card_prepaid`,
`…_hint`, `prepay_refund_btn`, `…_hint`, `…_confirm`, `prepay_refunded`,
`pages.z_report.prepay_refund`, `pages.counterparties.balance_prepaid_hint`.
Ular ustiga `customer_card_doc` va `print.act.doc_types` xaritalarida ham
uchta avans yorlig'i (`customerPrepay`, `salePrepay`, `customerPrepayRefund`)
yo'q edi — bularni key-existence gate'i ko'rmaydi (dinamik kalit), lekin
A3 ning O'Z testi (`customer-card-panel.test.tsx`) ularda qizil edi.

**O'lchov — kalitlar hech qachon COMMIT QILINMAGAN:** `git show <commit>:…/uz.json`
oxirgi 15 ta commitning HAR BIRIDA `customer_card_prepaid` ni topmadi, ya'ni
ular tarixda umuman yo'q. A3 sessiyasi hisobotida «18 yangi kalit, i18n gate
19 test yashil» deb yozgan, lekin `526dda5c` ning `messages/*.json` diff'ida
**K1 sessiyasining** kalitlari (`report_piece_reconciliation`, …) turibdi —
ya'ni A3 ning kalitlari commit paytida daraxtda YO'Q edi. Bu A3 hisobotining
o'zi ogohlantirgan parallel-sessiya to'qnashuvining aynan natijasi.

**Qaror: TIKLANDI (20 kalit, ru+uz).** Sabab: (a) usiz Q4 ning qabul mezoni
yopilmaydi; (b) kod jonliga chiqsa POS mijoz kartasida yorliq o'rniga xom
`customerPrepay` satri ko'rinardi — bu repo kurashadigan «xom kalit ekranda»
sinfi. Matnlar A3 ning O'Z testi va serverdagi `DOC_TYPE_LABEL` (A3 yozgan)
bilan solishtirib olindi, o'ylab topilmadi. **A3 sessiyasiga eslatma:** bu
tiklash A3 ning boshqa ochiq bandlarini yopmaydi.

#### Test natijalari (raqam bilan)

| O'lchov | Natija |
|---|---|
| `apps/api` **to'liq** vitest | **661 fayl · 9492 test YASHIL**, 1 fayl / 2 test skip |
| `apps/web` **to'liq** vitest | **331 fayl · 4358 test YASHIL**, 26 skip |
| `apps/api` typecheck (`tsc --noEmit`, `--max-old-space-size=8192`) | **0 xato** |
| `apps/web` typecheck | **0 xato** |
| `node scripts/check-lint.mjs` | **0 error** (1193 warning — siyosat bo'yicha ruxsat) |
| `pnpm i18n:gate` | **19 test yashil** (1122 fayl, 15 930 statik kalit) |
| `prisma generate` | qayta yurgizildi (yangi ustun klientda) |

**Yangi testlar — jami 61, fayl kesimida ALOHIDA o'lchandi** (`git show HEAD~:<fayl>`
bilan solishtirilgan `it(` sanog'i):

| Fayl | Delta | Nimani qulflaydi |
|---|---|---|
| `debt/sale-debt-registry.test.ts` | **+12** (40→52) | `resolveSaleDebtTermDays`: sozlanmagan => 14 · **`0` HAQIQIY qiymat** · chegaralar 0…365 · yaroqsiz (manfiy/kasr/NaN/∞) => default, **throw YO'Q** · `isSaleDebtTermDaysCorrupt` (sozlanmagan BUZUQ emas) · `saleDebtDueAt` sozlangan muddat bilan (0 · 30 · default) · **chiqarish funksiyasi `saleDebtDueAt` ni hech qachon yiqitmaydi** |
| `manager/collection/debt-collection.test.ts` | **+12** (22→34) | `collectionSourceOf` (retailsale · NULL · **noma'lum tur => registry**) · qator manba maydonlarini ko'chiradi · **chek topilmasa raqam `null`, belgi qoladi** · filtr: undefined/retailsale/**registry NULL li qatorni QOLDIRADI**/qatorni o'zgartirmaydi · summary sanoqlari + **ikki sanoq yig'indisi = qatorlar soni** |
| `manager/collection/debt-collection.service.test.ts` | **+8** (14→22) | so'rov manba ustunlarini o'qiydi · chek raqami hujjatdan + **`accountId` kesimida** · chek topilmasa `null` · **BITTA yig'ma so'rov (N+1 YO'Q)** · kassa qatori yo'q => so'rov YUBORILMAYDI · `source` filtri (ikki tomon) · sanoqlar ajraladi |
| `company-settings/company-settings.schema.test.ts` | **+6** (4→10) | default = Q1 ning kod-defaulti (**qayta yozilmaydi**) · `0` yaroqli · chegaralar · yaroqsiz rad etiladi · **maydon MAJBURIY** (to'liq sahifa PUT) · ekrandan kelgan satr `coerce` bilan |
| `retail-sale/retail-sale-debt-registry.test.ts` | **+7** (17→24) | sozlama YO'Q => 14 kun + **`accountId` kesimida o'qiladi** · qator BOR lekin ustun `null` => ham default · sozlangan 3 kun · **`0` => o'sha kun, muddat baribir NULL EMAS** · **yaroqsiz sozlama chekni yiqitmaydi** · **kod-shakl: sof qoidadan yuradi va sozlamaga QULF OLINMAYDI** · uchma-uch: yozilgan qator undirish ro'yxatida MANBA va CHEK RAQAMI bilan chiqadi |
| `web menejer/undirish/page.test.tsx` | **+7** (4→11) | belgi + chek havolasi (`/retail/sales/:id`) · reyestr qatorida havola YO'Q · **raqam yo'q => xom id chizilmaydi** · «Kassadan: N» (nol bo'lsa chizilmaydi) · **filtr serverga uzatiladi, «Hammasi» da `source` YO'Q** · **filtr yoqilganda BO'SH holat kesimni AYTADI** · xom kalit yo'q |
| `web debts/page.test.tsx` | **4** (YANGI) | belgi + chek havolasi · reyestr qatorida havola yo'q · raqamsiz holat · ustun sarlavhasi xom kalit emas |
| `web settings/company/page.test.tsx` | **4** (YANGI) | sozlanmagan akkauntda maydon **bo'sh turmaydi** (14) · **`0` aynan 0** · o'zgartirilgan muddat PUT payload'iga tushadi va **qolgan maydonlar ham yuboriladi** · xom kalit yo'q |
| `web __tests__/domain-status-tone.test.ts` | **+1** | `DEBT_SOURCE_TONE` kanoni qulflandi (ikkalasi ham neytral turkumda) |

**Ikki konvensiya gate'i ishimni TUTDI va ikkalasi ham to'g'ri edi**
(chekinish 2 va 4 dagi `raw-element-conventions`): sahifa-lokal tone-xaritasi
va xom `<input type="number">`. Ikkalasi ham tuzatildi — birinchisi umumiy
lug'atga ko'chdi, ikkinchisi dizayn-tizimning `Input` iga.

#### 🔴 Migratsiya — LOKAL DEV BAZADA SINALMADI (qabul mezonining ochiq bandi)

Qoida 7 «jonli bazaga yozadigan har qanday skript avval LOKAL dev bazada
sinaladi» deydi. **Q4 da bu BAJARILMADI: bazaga ulanish paroli yo'q**
(`packages/db/.env` repoda yo'q — A1/A2/A3 dagi AYNI to'siq; qoida 5 bo'yicha
parol foydalanuvchidan so'raladi). `psql` bor (`C:\Program Files\PostgreSQL\18\bin`),
ulanish faqat parol kutmoqda.

Migratsiya idempotentligi KOD darajasida yozilgan (`ADD COLUMN IF NOT EXISTS`),
ustun nomi Prisma `@map` bilan AYNAN mos, lekin bu **o'lchov emas, da'vo**.
Yopish sharti (A1 hisobotidagi naqsh):

```
# 1-marta
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres \
  -d sherset_v2_dev -v ON_ERROR_STOP=1 \
  -f packages/db/prisma/migrations/20260825235000_company_settings_sale_debt_term/migration.sql
# 2-marta (AYNAN o'sha buyruq — `skipping` NOTICE bilan no-op bo'lishi SHART)
# so'ng ustun bazadan O'QIB tekshiriladi:
#   \d company_settings   (yoki information_schema.columns bo'yicha so'rov)
# va DRIFT tekshiruvi:
#   npx prisma migrate diff --from-url <dev> --to-schema-datamodel prisma/schema.prisma
#   -> chiqishda «company_settings» UCHRAMASLIGI shart
```

**Teskari yo'l (qoida 12) — YOZILDI va repoda:**
`packages/db/scripts/rollback/20260825235000_company_settings_sale_debt_term_down.sql`

```sql
ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "sale_debt_term_days";
```

⚠️ Teskari yo'l **PULGA va QARZLARGA tegmaydi**: allaqachon ochilgan `Debt`
qatorlarining `next_contact_at` i qayta hisoblanmaydi, kod esa Q1 ning
kod-defaultiga (14 kun) tushadi. Yo'qoladigan yagona narsa — «egasi boshqa
muddat tanlagan edi» degan FAKT (skript uni o'qib olishni ham eslatadi).
⚠️ TARTIB: skript kod eski holatga qaytarilgandan KEYIN yugurtiriladi, aks
holda `readSaleDebtTermDays` mavjud bo'lmagan ustunni so'rab chekni yiqitardi.

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Balans / pul — TEGILMAYDI.** Q4 `applyDelta` ni umuman chaqirmaydi va
   `DECLARED_BALANCE_WRITERS` ga yangi fayl qo'shmadi. `recompute-counterparty-balances.ts`
   ga **yangi manba KERAK EMAS**: sozlama pul emas, manba ustunlari esa
   allaqachon mavjud qatorlarning atributi (Q1 dan beri). Bu — A1/A2/A3 da
   MAJBURIY bo'lgan bandning Q4 da qo'llanmasligining dalili.
2. **Qarz SUMMASI — TEGILMAYDI.** Q4 `Debt.totalMinor`/`paidMinor`/`status`
   ga bir marta ham yozmaydi. Yagona yozuv — YANGI chek qatorining
   `nextContactAt` i (Q2 yo'li) va Q3 ning «qayta ochilgan qator» tarmog'i.
3. **🔴 Muddat sozlamasi ESKI qarzlarga TA'SIR QILMAYDI.** Sozlama
   o'zgartirilganda `Debt.nextContactAt` QAYTA HISOBLANMAYDI — muddat qator
   yaratilganda bir marta yoziladi. Bu **ataylab**: retroaktiv qayta hisoblash
   yuzlab qatorni birdan `overdue` qilib eslatma cron'iga bir vaqtda tushirardi
   (Q5 ning «portlash» xavfi, `pos-customer-debt.ts:137-141`). Ekran matnida ham,
   sxema izohida ham, rollback skriptida ham OCHIQ yozilgan.
4. **Eslatma cron'i (`debt-reminder.service.ts`) — xulqi o'zgarmadi.** U
   `nextContactAt` ni o'qiydi, sozlamani emas. ⚠️ Lekin sozlama KICHIK son
   (masalan 0–2 kun) qilib qo'yilsa yangi cheklar tezroq `overdue` bo'ladi va
   operator navbati tezroq to'ladi — bu KUTILGAN xulq, egasiga aytilsin.
   Q2 hisobotidagi «2026-09-08 da birinchi to'lqin» bashorati sozlama
   o'zgarmasa o'z kuchida qoladi.
5. **Undirish ro'yxati — QATORLAR TO'PLAMI O'ZGARMAYDI** (filtr qo'llanmaganda).
   `where` sharti bir bayt ham o'zgarmadi; qo'shilgani — `select` ga ikki ustun
   va bitta YIG'MA so'rov. Filtr esa faqat SO'RALGANDA qo'llanadi va bo'sh
   holatda buni ekranga AYTADI (jimgina yashirmaydi).
6. **Yig'ma («jam») shartnomasi buzilmadi.** `summarizeCollection` HAMON
   kesilgandan KEYINGI qatorlar bo'yicha hisoblanadi => ekrandagi son bilan
   ekrandagi qatorlar mos keladi; manba filtri kesishdan OLDIN qo'llanadi,
   ya'ni `totalCount` ham filtrdan keyingi haqiqatni aytadi.
7. **Ishlash (`N+1`) — YO'Q.** Chek raqamlari IKKALA ekranda ham bitta
   `retailSale.findMany({ id: { in } })` bilan olinadi, `accountId` kesimida;
   kassa qatori umuman bo'lmasa so'rov YUBORILMAYDI (test bilan qulflangan).
   Undirish ro'yxati Prisma'da allaqachon sahifalanmaydi (cap sof qatlamda),
   ya'ni yangi so'rov qo'shimcha o'lchov bermaydi.
8. **A3 ning invariant 4 qo'riqchisi — YASHIL.** `debt-collection.service.ts`
   hamon kontragent SALDOSI delegatiga umuman murojaat qilmaydi (test
   manba-matnini skanerlaydi; shu sabab yangi izohda ham o'sha delegat nomi
   ATAYLAB yozilmadi). Avansli mijoz undirish ro'yxatiga tusha olmaydi.
9. **`/debts` ro'yxati — mavjud ustunlar buzilmadi.** Yangi ustun qo'shildi,
   birortasi ham o'zgartirilmadi/olib tashlanmadi; eksport matni
   (`cellText`) manba uchun ham berilgan.
10. **Kompaniya sozlamalari sahifasi — PUT SHARTNOMASI o'zgardi.** Endi
    payload'da `saleDebtTermDays` MAJBURIY. Sahifa uni har doim yuboradi
    (to'liq sahifa holati), lekin **eski FE + yangi API** oynasida (deploy
    oralig'i) saqlash 400 berardi. Amalda bu oyna yo'q: web va api BIR
    deploy'da chiqadi. ⚠️ Agar kimdir `/company-settings` ga qo'lda PUT
    yuborsa — maydonni qo'shishi kerak.
11. **Audit tarixi (`companysettings`) — yangi maydon o'z-o'zidan tushadi.**
    `update()` diff'i `Object.keys(input)` bo'ylab yuradi; yorlig'i
    `label_saleDebtTermDays` kaliti orqali topiladi (u i18n'da bor).
12. **Smena / Z-hisobot / kassa yashig'i — TEGILMAGAN.** Q4 `cashier-session`,
    `shift-variance`, `money` fayllariga bir qator ham yozmadi.
13. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** Q4 `stock`, `store-cell`,
    `retail-allocation` fayllariga bir qator ham yozmadi; `retail-sale.service.ts`
    da FAQAT qarz-muddati o'qish qo'shildi (ombor kaskadiga tegilmadi).
    ⚠️ Lekin branch'da G4/G5/G6, Q1–Q3, A1–A3 va K1/K2 ham turibdi — **deploy
    oynasi ularni ham olib chiqadi**, shuning uchun deploy paytida qoida 8 ning
    `warehouse-state.ts` qo'shimchasi va qoida 13 ning uchma-uch smoke'i
    MAJBURIY.
14. **Deadlock — yangi yuza OCHILMADI.** Sozlama `FOR UPDATE` bilan
    QULFLANMAYDI (kod-shakl testi buni tekshiradi): u qaror bermaydi, faqat
    sana beradi. Qulf olinsa BALANS -> QARZLAR tartibiga uchinchi ishtirokchi
    qo'shilardi — A1 ning «chekinish 1» dagi AYNI dalil.
15. **Kiosk qamrovi va ruxsat matritsasi — o'zgarmadi.** Yangi marshrut yo'q;
    `/manager/collection` hamon `debt:view`, `/company-settings` hamon
    `settings:view|update`.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | server: `CollectionRow` ga `source` + `sourceDocNumber` | ✅ test |
| 2 | server: `CollectionQuery` ga `source` filtri (sof qoidalar sof modulda) | ✅ test |
| 3 | undirish ekrani: manba belgisi + chek raqami havolasi + filtr | ✅ 7 web test |
| 4 | `EmptyState` matni manbaga qarab | ✅ web test |
| 5 | qarzdorlar ro'yxati (`/debts`) va `DebtRow` ham belgini ko'rsatadi | ✅ 4 web test |
| 6 | muddat sozlamasi (akkaunt sozlamasi, yangi jadval YO'Q) | ✅ test |
| 7 | sozlama yo'q bo'lsa Q1 defaulti | ✅ test (ikki holat: qator yo'q · ustun `null`) |
| 8 | sozlama ekrani: mavjud sozlamalar bo'limiga bitta maydon | ✅ web test |
| 9 | i18n ru + uz; `i18n-key-existence` va `i18n-no-hardcoded` yashil | ✅ 19 test |
| 10 | testlar: server filtri · sof modul · web sahifa · sozlama defaulti | ✅ 61 yangi test |
| 11 | api + web to'liq yashil, typecheck 0, lint 0 error | ✅ 9492 + 4358 |
| 12 | **migratsiya lokal dev bazada ikki marta xatosiz** | ❌ **parol kutilmoqda** (qoida 7) |
| 13 | **jonlida: menejer kassa qarzlarini filtrlab ko'radi** | ❌ VPS/deploy kerak |
| 14 | **jonlida: har qatorda chek raqami bor** | ❌ VPS kerak |
| 15 | **jonlida: muddat sozlamasi o'zgartirilganda YANGI cheklar o'sha muddat bilan tug'iladi** | ❌ VPS kerak |
| 16 | **jonlida: eskilarining muddati O'ZGARMAYDI** | ❌ VPS kerak |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 12–16 bandlari.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, jonli bazaga tegilmadi.

🔴 **Deploy branch'i YANGILANISHI KERAK.** `kassa-qarzi-q1-q2` @ `456e53af` da
Q3, A1, A2, A3 ham, **Q4 ham** YO'Q. Hozirgi `yacheyka-inventarizatsiya` da esa
Q4 bilan bir qatorda **G4 (ombor avto-taqsimoti), G5/G6 (TSD) va K1/K2
(bo'linadigan tovar)** ham turibdi — `git merge --ff-only` ularni AJRATA
OLMAYDI. Q2 dagi cherry-pick retsepti bilan yangi branch yig'ilishi kerak
(`4f5c1750` asosida: Q1 -> Q2 -> Q3 -> A1 -> A2 -> A3 -> **Q4** + onboarding
kalendar tuzatmasi). **Bu Q4 sessiyasida QILINMADI — buyruq kutilmoqda.**

Migratsiyalar — endi **UCHTA** va hech biri VPS'da BERILMAGAN:
`20260825120000_debt_source_doc` (Q1) · `20260825220000_drawer_cash_in_kind` (A1)
· **`20260825235000_company_settings_sale_debt_term` (Q4)**. Uchalasi ham
KOD'dan OLDIN berilishi SHART (aks holda `readSaleDebtTermDays` mavjud
bo'lmagan ustunni so'rab qarzli chekni yiqitardi).

#### Jonli tekshiruv retsepti (deploy'dan KEYIN)

Deploy oldidan/keyin (qoida 8): `packages/db` da `npx tsx scripts/warehouse-state.ts`
— chiqishi shu hisobotga ko'chiriladi.

1. `/menejer/undirish` -> sarlavhada **«Manba»** tanlagichi ko'rinadi, default
   «Hammasi».
2. Kassadan qarzga sotilgan qatorda **«Kassa cheki»** belgisi va yonida
   **chek raqami** (`CHK-…`) havola bo'lib turadi; havola chek sahifasini
   ochadi.
3. Qo'lda ochilgan `QRZ-` qatorida **«Reyestr»** belgisi, chek havolasi YO'Q.
4. Sarlavhada **«Kassadan: N»** sanog'i — egasiga aynan shu son ko'rsatilsin
   («ro'yxatdagi umumiy son o'sgani — yangi qarz emas, ko'rinmagan qarz endi
   ko'rinmoqda»).
5. Filtr **«Kassa cheki»** -> faqat kassa qatorlari; **«Reyestr (qo'lda)»** ->
   🔴 qo'lda ochilgan qatorlar **YO'QOLMAYDI** (bu — NULL tuzog'ining jonli
   isboti, eng muhim tekshiruv).
6. Filtr natijasi bo'sh bo'lsa — matn AYNAN kesimni aytadi («…KASSA CHEKIDAN
   kelgan qarz topilmadi»), «umuman qarz yo'q» demaydi.
7. `/debts` (qarzdorlar ro'yxati) -> **«Qarz manbasi»** ustunida AYNI belgi va
   AYNI chek raqami.
8. `/settings/company` -> **«Kassa qarzi»** bo'limi, maydon **14** bilan to'la.
   Uni **3** ga o'zgartirib «Saqlash».
9. 🔴 Yangi sinov-chek qarzga post -> undirish ro'yxatida muddati **post + 3
   kun** bo'lishi SHART.
10. 🔴 **Regressiya:** 9-banddan OLDIN ochilgan qatorlarning muddati
    **O'ZGARMAGAN** (14 kunlik) — sozlama retroaktiv emas.
11. Sozlamani **0** ga qo'yib yana bitta chek -> muddat **o'sha kun** (qator
    darhol `overdue`). Keyin sozlama **14** ga qaytariladi.
12. `/settings/company` -> «Изменения» (audit) da `saleDebtTermDays`
    o'zgarishi «Было / Стало» bilan ko'rinadi.
13. Uchma-uch smoke (qoida 13): bitta sotuv (post -> tekshir -> cancel), bitta
    yacheyka sanash, bitta ko'chirish — deploy G4/G5/G6/K1 ni ham olib chiqadi.
14. Izni tozalash: sinov cheklari `refund()` bilan qaytariladi (Q3 dan keyin
    reyestr qatori o'zi yopiladi); sozlama **14** ga qaytarilgan bo'lsin.

#### Ochiq qolganlar

1. **Q1 dan meros (o'zgarishsiz):** `recompute` cross-check'iga `opening`
   manbasi qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani
   tekshirilmagan (VPS kirishi kerak).
2. **Q2/Q3/A1/A2/A3 dan meros:** jonli tasdiq, deploy branch'i push
   qilinmagan; A2 ning `edit()` chegarasi (avansdan to'langan chek
   TAHRIRLANMAYDI) va Z-hisobot `revenueByMethod` kesimi; A3 ning haqiqiy
   ikki-sessiyali poyga sinovi; mijozga «avansingizdan yechildi» xabari.
3. **A1 topgan sxema DRIFTI (35 bayonot, 4 ta `DROP TABLE`)** — o'zgarishsiz
   ochiq, alohida ish.
4. **Q4 ning O'Z ochiq bandlari:** lokal dev bazada migratsiya sinovi
   (**parol kutilmoqda**) + jonli tasdiqning 13–16 bandlari.
5. **Muddat sozlamasi FAQAT kassa chekiga tegishli.** Qo'lda ochiladigan
   `QRZ-` qarzida muddatni kassir/operator o'zi kiritadi (`nextContactAt`
   majburiy maydon) — u sozlamadan yurmaydi va bu ataylab: qo'lda ochilgan
   qarzda muddat kelishuv predmeti.
6. **A3 ning i18n yo'qotishi tiklandi, LEKIN sabab tuzatilmadi.** Parallel
   sessiyalar `messages/*.json` ni bir vaqtda qayta yozganda kalitlar
   jimgina yo'qoladi va **key-existence gate'i buni faqat STATIK kalitlar
   uchun tutadi** — dinamik xaritalar (`customer_card_doc`, `act.doc_types`)
   uchun yo'q. Tavsiya (Q6 yoki alohida ish): shu ikki xarita uchun
   «ro'yxat ↔ i18n» qo'riqchi testi (`KNOWN_DOC_TYPES` dagi HAR turning
   yorlig'i ru+uz da bo'lishi SHART) — G1 ning `returnPayout` hodisasi va
   A3 niki AYNI sinf, ikki marta takrorlandi.

#### Keyingi fazaga (Q5) eslatmalar

1. **Backfill `nextContactAt` ni sozlamadan OLMASIN.** Q5 ning 2-vazifasi
   ataylab `now + N kun` deydi (chek sanasidan EMAS) va **zinapoyali**
   taqsimot talab qiladi. Akkaunt sozlamasi (`saleDebtTermDays`) YANGI
   cheklar uchun; backfill uchun u yaramaydi — sozlama 0 bo'lsa butun
   backfill birdan `overdue` bo'lib eslatma cron'iga tushardi (aynan
   «portlash»). Skript o'z parametrini olsin.
2. **Manba filtri Q5 uchun tayyor asbob:** backfill'dan keyin
   `/menejer/undirish?source=retailsale` bilan AYNAN backfill ochgan
   qatorlarni ajratib ko'rish mumkin (`sourceDocType='retailsale'`).
   Rollback skriptining qamrovi ham shu kalit bo'yicha.
3. `collectionSourceOf` — manba yorlig'ining YAGONA manbai. Q5/Q6 yangi
   manba turi qo'shsa (masalan `invoiceout`) uni AYNAN shu funksiyaga va
   `CollectionSource` ga qo'shsin; hozir noma'lum tur `registry` ga tushadi
   (jim degradatsiya emas — yorliq to'g'ri, faqat tafsilotsiz).
4. `readSaleDebtTermDays` sozlamaga QULF OLMAYDI (kod-shakl testi buni
   qulflagan). Q5 skripti ham sozlamani qulflamasin.
5. `saleNamesByDebtSource` (undirish) va `saleNamesForDebts` (qarzdorlar
   ro'yxati) — bir xil naqshning IKKI nusxasi, ataylab: ikkalasi ham 12
   qator va ular boshqa-boshqa servisda yashaydi (bittasi `manager`,
   ikkinchisi `debt`). Uchinchi chaqiruvchi paydo bo'lsa umumiy sof
   yordamchiga chiqarilsin.

### Q5 — Tarixiy qarzlarni reyestrga olib kirish (backfill) · 2026-08-25 · **QISMAN** (jonli bosqich egasining qarori bilan KEYINGA qoldirildi)

**Xulq O'ZGARMADI** — Q5 hech qanday servis kodiga tegmaydi: na `post()`,
na `refund()`, na undirish ekrani. Yagona yangilik — IKKI SKRIPT (backfill va
uning TESKARISI) hamda ularning sof rejasi. Skriptlar qo'lda yugurtiriladi;
jonli bazaga bu sessiyada **TEGILMADI**.

Commit: **`23426f15`** (branch `yacheyka-inventarizatsiya`, 6 fayl, +1797/−2).

#### Bog'liqlik va JONLI bosqich holati (qoida 11 — ochiq aytiladi)

Q5 ning sharti — «Q4 dan keyin». Q4 holati **«QISMAN»**. Kod darajasida
tekshirildi va tasdiqlandi:

| Shart | Holat |
|---|---|
| Q1 migratsiyasi (`sourceDocType`/`sourceDocId`) sxemada va lokal bazada | ✅ (lokal bazada ustunlar BOR — o'lchandi) |
| Q1 sof moduli (`saleDebtDueAt`, `DEFAULT_SALE_DEBT_TERM_DAYS`) | ✅ |
| Q2 yozuvchisining shakli (backfill uni takrorlaydi) | ✅ |
| Q4 ning `sourceDocType` filtri (backfill qatorlarini ajratish) | ✅ |

🔴 **JONLI BOSQICH BAJARILMADI — bu HALOL yozilmoqda, sabab ikki qatlamli:**

1. **Texnik to'siq.** Q1 migratsiyasi (`20260825120000_debt_source_doc`)
   jonli bazada **BERILMAGAN**, Q1–Q4 kodi ham **deploy qilinmagan**.
   Backfill `debts.source_doc_type/source_doc_id` ustunlariga yozadi — ular
   yo'q bazada skript birinchi so'rovdayoq to'xtaydi (`preflight()`).
2. **Egasining qarori (2026-08-25, shu sessiyada so'raldi):** «Jonliga tegma
   — kutamiz». Deploy 2026-08-25 da egasi tomonidan rad etilgan
   (G1 hisoboti, «C yo'li»), ya'ni jonli bandlar deploy oynasiga qoldirildi.

Shuning uchun qabul mezonining **3, 4, 5, 7-bandlari OCHIQ** va faza
**YOPILMAYDI**. 1, 2 va 6-bandlari esa **YOPILDI** — lokal dev bazada,
raqamlari bilan (pastda).

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `apps/api/src/scripts/q5-backfill-plan.ts` | **YANGI sof modul** — butun taqsimot, sana zinapoyasi, o'tkazib yuborish qoidalari (DB yo'q, Nest yo'q, `Date.now()` yo'q) |
| 2 | `apps/api/src/scripts/ops-q5-backfill-sale-debts.ts` | **YANGI** backfill skripti (DRY-RUN default · `APPLY=1` · `LIMIT` · `ONLY_CP` · `RUN` · `TERM_DAYS`/`STEP_*`) |
| 3 | `apps/api/src/scripts/ops-q5-backfill-rollback.ts` | **YANGI teskari skript** (qoida 12) — `RUN` yorlig'i bo'yicha |
| 4 | `apps/api/src/modules/debt/sale-debt-registry.ts` | `saleDebtComment(saleName)` ALOHIDA funksiyaga chiqarildi — Q2 yozuvchisi va Q5 backfill'i BITTA matn manbasidan yursin |
| 5 | `apps/api/src/scripts/q5-backfill-plan.test.ts` | **YANGI**, 35 test |
| 6 | `apps/api/src/scripts/q5-backfill-scripts-guard.test.ts` | **YANGI**, 23 kod-shakl qo'riqchisi |

**Backfill'ning shakli:**

```
preflight()                      Q1 ustunlari bormi? (yo'q ⇒ tushunarli xato)
cheklar   ← RetailSalePayment(DEBT, UZS, posted, refundedFromId=null)
qarzdor   ← CashierAuditEvent(SOLD_ON_CREDIT).payload.agentId ?? sale.agentId
                                 (mijozsiz chek ⇒ skript TO'XTAYDI)
qaytarish ← Σ mirror.debtReturnMinor  (refundedFromId = original.id)
mavjud    ← Debt.sourceDocId ∈ cheklar
cap       ← max(0, balans − reyestrning ochiq qoldig'i)   ← unregisteredMinor
reja      ← planQ5Backfill(...)  — yangisidan eskisiga, cap tugaguncha
APPLY:    har kontragent ALOHIDA tranzaksiyada:
            allocateDocumentNumber('QRZ-YYYY-')  → createMany({skipDuplicates})
            → DebtNote(kind:'debt_issue', matnda `[Q5-BACKFILL run=…]`)
```

#### 🔴 Rejadan OLTITA ataylab chekinish

**1. Taqsimot manbasi — chek EMAS, KONTRAGENT cap'i.**
Reja «`retailSalePayment` `TENDER.debt` qatorlari, `sourceDocId` bo'yicha
qatori borlari chiqarib tashlanadi» degan edi. Sodda o'qish — HAR chekning
qarz ulushiga qator ochish — **allaqachon TO'LANGAN qarzni qayta ochardi**:
chek qarzi mijozning balansiga yozilgan, lekin mijoz o'shandan beri kassaga
pul olib kelgan bo'lishi mumkin va balans BITTA yig'ma son, chek kesimi YO'Q.

O'lchov: lokal bazada 271 ta qarz-chekining jami qarzi reyestrdan tashqari
qarzdan **KATTA** — 16 ta chek cap tugagani uchun qator OLMADI, yana 16
tasi qisman KESILDI. Sodda qoida bilan bu 32 ta chekda menejer mijozdan
allaqachon to'langan pulni so'ragan bo'lardi.

Shuning uchun cap kontragent darajasida:
`max(0, balans − reyestrning ochiq qoldig'i)` — ya'ni AYNAN
`pos-customer-debt.ts#splitDebtSources().unregisteredMinor`, kassir ekranida
allaqachon ko'rinadigan son. Ikkinchi formula yozilmadi.

**2. Tartib — YANGISIDAN ESKISIGA.** Reja tartibni aytmagan. To'lov kelganda
POS avval REYESTR FIFO'sini (eng eski qarzlar), so'ng balansdan adopsiyani
yopadi (`planAdoption`) — ya'ni eski qarzlar birinchi to'lanadi. Demak
balansda qolgan qoldiq ehtimol ENG YANGI cheklarniki. Eskisidan boshlansa
backfill to'langan cheklarni «ochiq qarz» qilardi.

**3. Balansi O'LCHANMAGAN kontragent — CHETLAB O'TILADI (Q2 dan FARQLI).**
Q2 `null` balansda to'liq qator ochadi (ehtiyotkor tanlov: bitta jonli chek,
menejer darhol ko'radi). Q5 esa OMMAVIY jonli yozuv, va u yerda `null`
balans **anomaliya belgisi**: chek post qilinganda `applyDelta` balans
qatorini YARATADI, ya'ni `DEBT` tenderi bo'lgan kontragentda qator BO'LISHI
kerak. Ommaviy yozuvda ehtiyotkor tomon — yozmaslik va ro'yxatga chiqarish.
(Lokal bazada bunday kontragent **0 ta** chiqdi — ya'ni premise tasdiqlandi.)

**4. Qarzdor CHEK QATORIDAN emas, AUDIT HODISASIDAN o'qiladi.**
Reja buni aytmagan. `post()` chek qatoridagi `agentId` ni faqat u BO'SH
bo'lsa to'ldiradi — chekda boshqa kontragent turgan va to'lov payload'ida
boshqasi yuborilgan holatda DAFTARGA payload'dagi yozilgan. Backfill chek
qatoridan yursa qarzni **BOSHQA mijozga** ochib qo'yardi; jonli ma'lumotda
bu tuzatib bo'lmaydigan xato. `recompute-counterparty-balances.ts` bu
qoidani allaqachon o'rnatgan (`loadCreditEventAgents`) — AYNAN o'sha
tartib ko'chirildi (hodisa → chek qatori zaxira sifatida).

**5. `LIMIT` — kontragent ichida emas, GLOBAL.** Kontragent ichida kesilsa
cap allaqachon sarflangan bo'lib ko'rinardi va keyingi yugurish o'sha
kontragentga qator ochmasdi. Endi kesim `planQ5Backfill` da, va kesilgan
qatorlar `truncatedRows` da SANALADI — jimgina yo'qolmaydi.

**6. Rollback'da `RUN` MAJBURIY.** Reja «backfill ochgan qatorlarni
o'chiradi» degan edi. Yorliqsiz butun Q5 backfill'ini o'chirish juda oson
bo'lmasligi kerak: bir kunda ikki yugurish bo'lsa, ikkalasini birga
o'chirish ONGLI qaror bo'lsin. `RUN=` yoki ataylab `ALL_RUNS=1`.

#### 🔴 Eslatma cron'ini muzlatish — YOZMA JAVOB (reja vazifa 4)

**Qo'shimcha chora KERAK EMAS, dalil bilan.**

`debt-reminder.service.ts:47` operator bildirishnomasini
`nextContactAt: { lte: now } AND callRemindedAt IS NULL` bo'yicha yuboradi.
Backfill `nextContactAt` ni **kelajakka** qo'yadi (`now + 14 kun` va undan
ham narisi), ya'ni yozuv paytida birorta qator ham cron'ning shartiga
tushmaydi. Toshqin bo'lishi uchun 14 kun kerak.

Zinapoya esa 14-kunlik to'lqinning O'ZINI ham yoyadi. Lokal o'lchov (233
qator, default `STEP_ROWS=50`):

```
2026-09-08: 50 qator · 09-09: 50 · 09-10: 50 · 09-11: 50 · 09-12: 33
```

Ya'ni operator navbatiga kuniga ~50 tadan tushadi. `MAX_STAIRCASE_DAYS=30`
yuqori chegara — 1500 dan ortiq qator bo'lsa ham zinapoya cheksiz
cho'zilmaydi (undan keyin hammasi 30-kunga to'planadi; bu ONGLI chegara,
kerak bo'lsa `STEP_ROWS` kichraytiriladi).

⚠️ **Mijozga AVTOMATIK Telegram xabari yo'q** — `lastTgReminderAt` cron'i
kodda MAVJUD EMAS (Q0 da tekshirilgan, faqat sxema maydoni). Ya'ni backfill
mijozlarga hech qanday xabar yubormaydi.

#### Test natijalari (raqam bilan)

| O'lchov | Natija |
|---|---|
| `apps/api` **to'liq** vitest | **663 fayl · 9600 test YASHIL**, 1 fayl / 2 test skip — **ketma-ket IKKI to'liq yugurish, ikkalasi ham TO'LIQ yashil** |
| ...ning halol qaydi | ⚠️ Shu ikkitadan OLDINGI yugurishda 2 faylda 4 test yiqilgan edi; reporter chiqishi kesilgani uchun **qaysi fayl ekani QAYD ETILMADI**. Keyingi ikki yugurish 0 xato berdi ⇒ yuk ostidagi beqarorlik (A1/A3 hisobotlari `auth/{pos,tsd}-device.service.test.ts` argon2 timeout sinfini allaqachon qayd etgan; bu **taxmin, o'lchov emas**) |
| Q5 ning O'Z testlari | `q5-backfill-plan.test.ts` **35** + `q5-backfill-scripts-guard.test.ts` **23** = **58 yangi test** |
| tegilgan kesim (`scripts`+`debt`+`retail-sale`) | **82 fayl · 1203 test YASHIL** |
| `apps/api` typecheck (`tsc --noEmit`, `--max-old-space-size=8192`) | **0 xato** |
| `node scripts/check-lint.mjs` | **mening fayllarimda 0 error** (qolgan 4 format xatosi — parallel K3 sessiyasining tugallanmagan fayllari: `stock-piece/*`, `retail-sale.service.ts`; TEGILMADI) |
| `i18n-key-existence` | **4 test yashil** (Q5 da yangi UI matni YO'Q) |
| `i18n-no-hardcoded` | ⚠️ **QIZIL, lekin MENIKI EMAS**: `components/pos/piece-offer-panel.tsx` — K3 sessiyasining ro'yxatga qo'shilmagan yangi POS fayli |

⚠️ **Bazaviy o'lchov IZOLYATSIYALANMAGAN.** Sessiya davomida daraxtda parallel
K3 sessiyasi (bo'linadigan tovar — `stock-piece/*`, `piece-offer-*`,
`retail-sale.service.ts`) faol ishlayotgan edi. Q3 dagidek worktree
ochilmadi (Q5 `retail-sale.service.ts` ga UMUMAN tegmaydi, ya'ni to'qnashuv
yuzasi yo'q edi); commit `git add <aniq yo'llar>` bilan qilindi va
`git show --stat` bilan tasdiqlandi — **begona fayl commit'ga TUSHMADI**
(yagona qo'shimcha — hook yozadigan `docs/progress.json`).

**58 yangi test nimani qulflaydi:**

| Guruh | Testlar |
|---|---|
| Chek qoldig'i | qaytarishsiz to'liq · qisman ayiriladi · to'liq qaytarilgan 0 · **qaytarish qarzdan KO'P (anomaliya) → manfiy emas** |
| Cap formulasi | reyestr bo'sh/qisman/to'liq qoplagan · **reyestr balansdan katta (nomuvofiqlik) → 0** · **AVANS (manfiy balans) → 0, invariant 4** · **`null` → `null`, «0» EMAS** |
| Zinapoya | chelaklar · yuqori chegara · **`stepRows`/`stepDays`=0 ⇒ o'chirish yo'li** |
| Taqsimot | **invariant: Σ cap dan OSHMAYDI** · **tartib yangisidan eskisiga** · **teng sanada DETERMINISTIK** · oxirgi qator KESILADI va bu izohda yoziladi · allaqachon reyestrda → OCHILMAYDI · to'liq qaytarilgan → OCHILMAYDI · avansli → OCHILMAYDI · reyestr qoplagan → OCHILMAYDI |
| Shakl | izoh matni Q2 bilan BITTA manbadan (`saleDebtComment`) · **muddat chek sanasidan EMAS** · zinapoya GLOBAL indeksdan · izohda `run=` belgisi |
| Butun yugurish | jamlar · **zinapoya kontragentlar bo'ylab davom etadi** · **`LIMIT` GLOBAL kesadi va SANALADI** · `LIMIT` kontragent ichida jamlarni tuzatadi · o'lchanmaganlar sanaladi · **IDEMPOTENTLIK** · **DETERMINIZM** |
| Kod-shakl (backfill) | **`applyDelta` CHAQIRILMAYDI** · `counterpartyBalance` ga YOZILMAYDI · `balanceAdopted: true` · manba ustunlari · **`createMany({skipDuplicates})`, `create` EMAS** · `allocateDocumentNumber` · `DebtNote(debt_issue)` · `problem:false`/`ownerId:null` · valyuta · **DRY-RUN default** · `LIMIT`/`ONLY_CP` · **`preflight()`** · mijozsiz chek TO'XTATADI · **qarzdor HODISADAN** · qaytarish ayiriladi · **muddat `now` dan** |
| Kod-shakl (rollback) | belgi bo'yicha topadi · **`deleteMany`, soft-delete EMAS** · **izohlar QARZDAN OLDIN (FK)** · **`applyDelta` yo'q** · **TO'LOV tushgan qator O'CHIRILMAYDI** · DRY-RUN default · `RUN` siz ommaviy o'chirish TAQIQ |

#### 🔴 LOKAL DEV BAZADA ISBOT (qoida 7 + 12) — BAJARILDI

Baza: `sherset_v2_dev` @ localhost (PostgreSQL 18). Parol egasidan so'raldi
va **shu sessiyadan tashqariga yozilmadi** (qoida 5).

**Boshlang'ich holat:** `debts` = **652** qator, `source_doc_type='retailsale'`
= **0**, `retail_sale_payments(method='DEBT')` = **271**, Q1 ustunlari BOR.

##### 1. DRY-RUN — o'lchov (reja vazifa 1, qabul mezoni 1)

```
Q5 — tarixiy kassa qarzlarini undirish reyestriga olib kirish
rejim: 🟢 DRY-RUN (hech narsa yozilmaydi) | RUN=2026-08-25
muddat: 14 kun | zinapoya: har 50 qatorda +1 kun (maks 30 kun)

── O'LCHOV ────────────────────────────────────────────────────
qarzga sotilgan chek (jami)        : 271
eng eski chek                      : 2026-08-16T06:58:47.490Z
kontragent (filtrdan keyin)        : 133
  · balansi o'lchanmagan (chetlab) : 0
  · reyestrdan tashqari qarzi yo'q : 18
OCHILADIGAN QATOR                  : 233
OCHILADIGAN JAMI SUMMA             : 701 489 130 so'm
o'tkazib yuborilgan chek (cap-exhausted)  : 16
o'tkazib yuborilgan chek (fully-returned) : 1
```

Qo'shimcha kesimlar: **16 qator cap bilan KESILDI** (chekning qoldig'i
kontragentning reyestrdan tashqari qarzidan katta); **3 kontragentda cap
dan qoldiq taqsimlanmadi** (chek yetmadi — qarzning bir qismi `InvoiceOut` /
`CashOut` / qo'lda tuzatishdan kelgan; eng kattasi 14 375 447 so'm).

Zinapoya taqsimoti (233 qator):

```
+0 kun → 50 qator (muddat 2026-09-08)   +3 kun → 50 (09-11)
+1 kun → 50 qator (09-09)               +4 kun → 33 (09-12)
+2 kun → 50 qator (09-10)
```

⚠️ **Bu raqamlar LOKAL dev bazaniki.** U jonli bazadan 2026-08-16 atrofida
klonlangan (eng eski chek sanasi shundan) — jonlida son ham, summa ham
BOSHQACHA bo'ladi va **jonli DRY-RUN qayta o'lchanadi**.

##### 2. BITTA kontragent — jonli tartibning mashqi (qabul mezoni 3 ning lokal ko'zgusi)

`ONLY_CP=04f605f9…` («Muxriddin elektr», cap 202 500 so'm, 1 chek):

```
✅ Yozildi: 1 qator
```

Bazadan O'QIB tekshirildi:

```
name           | total_minor | paid | status | balance_adopted | source_doc_type | next_contact_at        | owner_id | issued_by_id
QRZ-2026-00655 |    20250000 |    0 | unpaid | t               | retailsale      | 2026-09-08 09:00:00+05 | (null)   | (null)

kontragent balansi OLDIN : 556 060 000
kontragent balansi KEYIN : 556 060 000        ← 🔴 BIR TIYIN HAM O'ZGARMADI
balans jurnalidagi yangi yozuv (5 daqiqa) : 0 ← 🔴 invariant 1
```

Muddat **09:00 (+05)** — Toshkent kalendar kuni, Q1 ning `saleDebtDueAt`
qoidasi HAQIQIY bazada tasdiqlandi.

##### 3. `recompute` DRY-RUN (qabul mezoni 6) — **shovqin OSHMADI**

```
mode: DRY-RUN (no writes)
(account,counterparty,currency) pairs: 799 | changed: 0 | unchanged: 799
cross-check: ⚠️ 759 kalitda hujjat-rekonstruksiyasi jurnaldan farq qiladi
```

**759 — Q1 va A1 o'lchagan raqamning AYNAN o'zi.** Ya'ni Q1 ning
`balanceAdopted: false` filtri backfill qatorlarini hujjat-hisobidan
CHIQARIB tashlaydi va Q5 diagnostikaga bir zarra ham shovqin qo'shmaydi.
(Bu 233 qatorlik to'liq yugurishdan KEYIN ham qayta o'lchandi — o'sha 759.)

##### 4. TESKARI SKRIPT (qoida 12) — to'lov himoyasi ZOND bilan

Avval to'lov himoyasi HAQIQIY qator ustida sinaldi
(`UPDATE debts SET paid_minor = 100000` → rollback → `paid_minor = 0`):

```
── TOPILDI ──
backfill qatori (jami)   : 1
o'chiriladi              : 0
SAQLANADI (to'lov bor)   : 1
  · QRZ-2026-00655  Muxriddin elektr: to'lov tushgan (paidMinor = 1 000 so'm)

APPLY=1 bilan: «O'chiriladigan qator yo'q.»     ← 🔴 to'lov YO'Q QILINMADI
```

`paid_minor` 0 ga qaytarilgach:

```
✅ O'chirildi: 1 qarz qatori, 1 izoh.
debts = 652 | source_doc_type='retailsale' = 0 | yetim izoh = 0
kontragent balansi = 556 060 000   ← 🔴 O'ZGARMADI
```

##### 5. TO'LIQ MIQYOS — 233 qator → tekshiruv → rollback

```
APPLY (RUN=q5-local-full)  → ✅ Yozildi: 233 qator

debts_total = 885 | from_sale = 233 | Σ = 70 148 913 052 tiyin | muddat kunlari = 5
balans jurnalidagi yangi yozuv           : 0      ← 🔴 invariant 1
hammasi balanceAdopted / muddatli / javobgarsiz : t / t / t
takrorlangan source_doc_id                : 0      ← 🔴 invariant 3

undirish ro'yxati (deleted_at IS NULL AND status IN (unpaid,partial)):
   812 qator, shundan 233 tasi KASSA CHEKIDAN, 617 mijoz   ← 🔴 MAQSAD
avansli (manfiy balansli) mijozga ochilgan qator : 0        ← 🔴 invariant 4

IDEMPOTENTLIK — qayta APPLY: OCHILADIGAN QATOR 0, «Yozildi: 0 qator»
recompute: changed 0 | cross-check 759 (o'zgarmadi)

ROLLBACK (RUN=q5-local-full) → ✅ O'chirildi: 233 qarz qatori, 233 izoh
debts_total = 652 | from_sale = 0 | yetim izoh = 0 | yangi balans yozuvi = 0
recompute: changed 0 | cross-check 759
```

**Aylanma to'liq yopildi: 652 → 885 → 652**, va butun aylanma davomida
kontragent balanslariga **bir bayt ham yozilmadi**.

⚠️ **Bitta halol qayd — HUJJAT RAQAMIDA TESHIK QOLADI.** Rollback'dan keyin:

```
document_sequences['QRZ-2026-'] = 888   ·   max(debts.name) = QRZ-2026-00654
```

Ya'ni 234 ta raqam sarflanib bo'sh qoldi. Bu **zararsiz** (hisoblagich
monoton, keyingi raqam 889 dan davom etadi va mavjud nomlar bilan
to'qnashmaydi), lekin `QRZ-` ketma-ketligida ko'zga tashlanadigan sakrash
bo'ladi. Jonlida rollback qilinsa egasiga oldindan aytilsin.

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Balans / pul — TEGILMAYDI (invariant 1).** Ikkala skript ham
   `applyDelta` ni UMUMAN chaqirmaydi (kod-shakl testi izohsiz matnda
   tekshiradi) va `counterpartyBalance` ga faqat `findMany` bilan murojaat
   qiladi. Lokal bazada 233 qator yozilib o'chirilganda balans jurnaliga
   **0 yozuv** tushdi. `DECLARED_BALANCE_WRITERS` ga yangi fayl
   QO'SHILMADI va `recompute` ga yangi manba KERAK EMAS — qator
   `balanceAdopted = true`, ya'ni Q1 filtri uni hujjat-hisobidan chiqaradi
   (bu A1/A2/A3 da MAJBURIY bo'lgan bandning Q5 da qo'llanmasligining dalili).
2. **Servis kodi — BIR QATOR HAM O'ZGARMADI.** Q5 `post()`, `refund()`,
   `edit()`, undirish servisi va ekranlarga tegmaydi. Yagona modul-o'zgarishi
   — `saleDebtComment` ning ALOHIDA funksiyaga chiqarilishi, u ham
   xulq-neytral (matn AYNAN o'sha, `planSaleDebtRow` testlari yashil).
3. **🔴 Undirish ro'yxati / qo'ng'iroq jadvali / menejer navbati — HAJMI
   KESKIN O'SADI. Bu MAQSAD, lekin egasiga OLDINDAN aytilsin.** Lokal
   o'lchovda ro'yxat 579 → **812** qatorga (233 ta yangi), `outstandingMinor`
   esa 701 mln so'mga o'sdi. Egasi ko'radigan son «birdan sakraydi» —
   **bu yangi qarz EMAS, ko'rinmagan qarz endi ko'rinmoqda.** Q4 ning
   «Kassadan: N» sanog'i va manba filtri aynan shu suhbat uchun qurilgan.
   `manager-queue` ning `DEBT_CAP` i yangi nomzodlar oladi.
4. **Eslatma cron'i — 14 KUN JIM, keyin ZINAPOYALI.** Yuqoridagi yozma
   javob. Yozuv paytida birorta qator ham cron shartiga tushmaydi.
5. **POS «Qarz to'lovi» oynasi — SON O'ZGARMAYDI, lekin TARKIBI o'zgaradi.**
   `payableMinor = max(reyestr, balans)`; backfill reyestrni balansga
   TENGLASHTIRADI, ya'ni maksimum o'sha qoladi. `unregisteredMinor` esa 0 ga
   tushadi va **P1 adopsiya yo'li kamdan-kam ishlaydi** — bu to'g'ri
   (adopsiya `InvoiceOut` kabi boshqa manbalar uchun qoladi), lekin
   `pos-debt-payment.balance-adoption.test.ts` yo'lining jonli qamrovi
   kamayadi. FIFO endi tarixiy cheklarni ham yopadi — bu ham maqsad.
6. **Akt-sverka — O'ZGARMAYDI.** `counterparty-settlement.util.ts`
   `debtRegistryOutstandingMinor` ni «saldoning TARKIBI, qo'shiluvchi EMAS»
   deb ta'riflaydi va `balanceAdopted` qatori uchun bu premise TO'G'RI.
7. **Q3 simmetriyasi — YANGI QATORLAR UNGA ULANADI.** Backfill qatori
   `sourceDocType/sourceDocId` bilan ochiladi, ya'ni o'sha chek keyin
   qaytarilsa `moveSaleDebtRegistryRow` uni TOPADI va kamaytiradi.
   ⚠️ Nozik joy: backfill qatori cap bilan KESILGAN bo'lishi mumkin
   (`totalMinor` < chek qarzi), va Q3 ning `delta` rejimi
   `newRemaining − oldRemaining` ni qo'llaydi — bu qatorni noldan pastga
   tushirishi mumkin. `planSaleDebtDelta` da bu ALLAQACHON qoplangan
   («1-chegara — NOL», Q1 izohi aynan shu holatni tasvirlaydi). Test bilan
   qulflangan (`avans qisman qoplagan qator noldan pastga tushmaydi`).
8. **Mijozga Telegram xabari — KETMAYDI.** `applyDelta` chaqirilmaydi ⇒
   `source` yo'li umuman ochilmaydi. `debt-source-wiring` qo'riqchisi yashil.
9. **Q4 manba filtri — Q5 uchun tayyor asbob.** Backfill qatorlari
   `sourceDocType='retailsale'`, ya'ni `/menejer/undirish?source=retailsale`
   bilan AYNAN ular ajratib ko'riladi. Reja §Q5 eslatmasi bajarildi.
10. **Hujjat raqami** — `allocateDocumentNumber` orqali, `adoptBalanceDebt`
    va Q2 bilan BITTA hisoblagichdan. Race-safe. Rollback teshik qoldiradi
    (yuqorida qayd etilgan).
11. **Smena hisobi / kutilgan naqd / Z-hisobot — TEGILMAGAN.** Reyestr
    qatori pul emas; `cashier-session`, `shift-variance`, `money`
    fayllariga bir qator ham yozilmadi.
12. **Ombor / qoldiq / yacheyka — TEGILMAGAN.** Q5 `stock`, `store-cell`,
    `retail-allocation`, `retail-sale` fayllariga bir qator ham yozmadi.
    H-, G- va K-rejalar hududiga kirilmadi. Jonli o'zgarish BO'LMAGANI
    uchun qoida 8 ning `warehouse-state.ts` qo'shimchasi va qoida 13 ning
    uchma-uch smoke'i bu sessiyada QO'LLANMADI — ular **jonli yugurish
    kuniga** qoldirildi va pastdagi retseptda MAJBURIY band.
13. **Kiosk qamrovi / ruxsat matritsasi — o'zgarmadi.** Yangi marshrut yo'q;
    skriptlar HTTP orqali emas, box'da qo'lda yuritiladi.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | DRY-RUN chiqishi hisobotda | ✅ (lokal dev baza, to'liq ko'chirildi) |
| 2 | lokal dev bazada backfill + rollback ikkalasi ham ishladi | ✅ **652 → 885 → 652**, to'lov himoyasi zond bilan |
| 3 | **jonlida avval 1 kontragent** — ro'yxatda chiqdi, balans O'ZGARMADI, `payableMinor` O'ZGARMADI | ❌ **VPS/deploy kerak; egasi «jonliga tegma» dedi** |
| 4 | **uchma-uch smoke (qoida 13)**: sinov sotuv · yacheyka sanash · ko'chirish | ❌ jonli o'zgarish bo'lmadi ⇒ qo'llanmadi |
| 5 | **keyin qolgan kontragentlar bosqichma-bosqich** | ❌ VPS kerak |
| 6 | `recompute` DRY-RUN backfill'dan keyin ham farq ko'rsatmaydi | ✅ **759 → 759, `changed: 0`** (lokal) |
| 7 | javobgar shaxs va vaqt hisobotda | ❌ jonli yugurish bo'lmadi ⇒ yozilmadi |
| 8 | testlar (skript sof qismlari, teskari skript qamrovi) | ✅ 58 yangi test |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 3, 4, 5, 7-bandlari.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, **jonli bazaga tegilmadi**.
Q5 da **yangi migratsiya YO'Q** — skriptlar mavjud ustunlarga yozadi.

🔴 **Deploy branch'i YANGILANISHI KERAK.** `kassa-qarzi-q1-q2` @ `456e53af`
da Q3, A1, A2, A3, Q4 ham, **Q5 ham** YO'Q. Hozirgi
`yacheyka-inventarizatsiya` da esa Q5 bilan bir qatorda **G4 (ombor
avto-taqsimoti), G5/G6 (TSD) va K1/K2/K3 (bo'linadigan tovar)** ham turibdi.
Q2 dagi cherry-pick retsepti bilan branch qayta yig'ilishi kerak
(`4f5c1750` asosida: Q1 → Q2 → Q3 → A1 → A2 → A3 → Q4 → **Q5** + onboarding
kalendar tuzatmasi). **Bu Q5 sessiyasida QILINMADI — buyruq kutilmoqda.**

Migratsiyalar — hamon **UCHTA** va hech biri VPS'da BERILMAGAN:
`20260825120000_debt_source_doc` (Q1) · `20260825220000_drawer_cash_in_kind` (A1)
· `20260825235000_company_settings_sale_debt_term` (Q4).

⚠️ **TARTIB SHART:** Q1 migratsiyasi backfill'dan OLDIN berilishi kerak.
Backfill buni O'ZI tekshiradi (`preflight()`) va ustunsiz bazada tushunarli
xato bilan to'xtaydi — jimgina yiqilmaydi.

#### Jonli yugurish retsepti (deploy'dan KEYIN, bosqichma-bosqich)

Har qadam OLDIDAN va KEYIN (qoida 8): `packages/db` da
`npx tsx scripts/warehouse-state.ts` — chiqishi shu hisobotga ko'chiriladi.
**Ish soatidan TASHQARIDA** (qoida 13), javobgar shaxs va vaqt yoziladi.

```bash
cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a
```

1. **O'LCHASH (yozmaydi):**
   `./node_modules/.bin/tsx src/scripts/ops-q5-backfill-sale-debts.ts`
   → chiqish TO'LIQ hisobotga; **egasiga ko'rsatiladi** (nechta qator,
   qancha summa, «ro'yxatdagi son shunga o'sadi»).
2. 🔴 **BITTA kontragent** (ro'yxatdan kichik summali bittasi tanlanadi):
   `APPLY=1 ONLY_CP=<uuid> RUN=<sana>-01 ./node_modules/.bin/tsx …`
3. **Tekshirish:** `/menejer/undirish` → mijoz `upcoming` chelagida,
   manbasi **«Kassa cheki»**, chek raqami havolasi ishlaydi (Q4);
   kontragent kartasida balans **O'ZGARMAGAN**; POS «Qarz to'lovi» oynasida
   `payableMinor` **O'ZGARMAGAN**.
4. **`recompute` DRY-RUN** (`APPLY` SIZ): `changed: 0` va cross-check
   shovqini backfill'dan OLDINGI son bilan **AYNAN teng** bo'lishi SHART.
5. 🔴 **Uchma-uch smoke (qoida 13):** bitta sotuv (post → tekshir → cancel),
   bitta yacheyka sanash, bitta ko'chirish.
6. **10 kontragent:** `APPLY=1 LIMIT=10 RUN=<sana>-02 …` → 3–5 bandlar takror.
7. **Qolgani:** `APPLY=1 RUN=<sana>-03 …` → 3–5 bandlar takror.
8. **Savdo boshlanishidan oldin (ertalab)** takroriy smoke + `warehouse-state.ts`.
9. **Kuzatuv:** 14 kundan keyin (zinapoya boshlanishi) operator navbatining
   to'lishi — KUTILGAN xulq, nosozlik emas.

**Teskari yo'l (qoida 12) — HAR QADAMDAN keyin tayyor turadi:**

```bash
# Ro'yxatni ko'rish
RUN=<sana>-01 ./node_modules/.bin/tsx src/scripts/ops-q5-backfill-rollback.ts
# O'chirish
APPLY=1 RUN=<sana>-01 ./node_modules/.bin/tsx src/scripts/ops-q5-backfill-rollback.ts
```

⚠️ Rollback **to'lov tushgan qatorni O'CHIRMAYDI** (ro'yxatga chiqaradi) va
**balansga tegmaydi**. `QRZ-` ketma-ketligida teshik qoladi (yuqorida).

#### Ochiq qolganlar

1. **Q1 dan meros (o'zgarishsiz):** `recompute` cross-check'iga `opening`
   manbasi qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani
   tekshirilmagan (VPS kirishi kerak).
2. **Q2/Q3/A1/A2/A3/Q4 dan meros:** jonli tasdiq, deploy branch'i push
   qilinmagan; A2 ning `edit()` chegarasi va Z-hisobot `revenueByMethod`
   kesimi; A3 ning haqiqiy ikki-sessiyali poyga sinovi; mijozga
   «avansingizdan yechildi» xabari; Q4 ning lokal migratsiya sinovi.
3. **A1 topgan sxema DRIFTI (35 bayonot, 4 ta `DROP TABLE`)** — o'zgarishsiz
   ochiq, alohida ish. 🔴 **Q5 uchun alohida ahamiyatli:** kimdir jonlida
   `prisma migrate dev` yugurtirsa `debts` jadvali ham diffga tushishi
   mumkin — backfill kunidan OLDIN tekshirilsin.
4. **Q5 ning O'Z ochiq bandlari:** jonli yugurishning HAMMASI (mezon 3, 4,
   5, 7). Kod va lokal isbot TAYYOR.
5. 🔴 **Cap dan taqsimlanmagan qoldiq — CHEGARA.** Lokal o'lchovda 3
   kontragentda cap'ning bir qismi (eng kattasi 14,4 mln so'm)
   taqsimlanmadi: bu qarz POS chekidan EMAS, boshqa hujjatdan
   (`InvoiceOut`, `CashOut`, qo'lda tuzatish) kelgan. Ular reyestrda
   ko'rinmasdan qoladi va faqat P1 adopsiyasi orqali (mijoz kassaga pul
   olib kelganda) kiradi. **Bu reja §2.3 ning ochiq chegarasi** — Q5 uni
   kengaytirmaydi, faqat O'LCHADI va chiqishda ⚠️ bilan ko'rsatadi.
6. **Cap tugagani uchun qator olmagan cheklar (lokal: 16 ta).** Ular
   «allaqachon to'langan» deb qaraladi — bu FARAZ (FIFO odati), o'lchov
   emas. Agar egasi biror chek bo'yicha «bu to'lanmagan» desa, qator
   qo'lda ochiladi (`QRZ-`, mavjud yo'l). Skript chiqishida ular
   `cap-exhausted` sinfida ochiq ko'rinadi — jim emas.
7. **Rollback `QRZ-` ketma-ketligida teshik qoldiradi** (yuqorida
   o'lchandi: 234 raqam). Zararsiz, lekin egasiga aytilsin.

#### Keyingi fazaga (Q6) eslatmalar

1. **Q6 ning verify skripti Q5 qatorlarini AJRATA olsin:** ular
   `sourceDocType='retailsale'` + `DebtNote` matni `[Q5-BACKFILL run=…]`
   bilan boshlanadi. Jonli yozuvchi (Q2) ochgan qatorlarda bu belgi YO'Q.
2. **Egasiga yakuniy hisobotda ROQAM tayyorlansin:** «undirish ro'yxatidagi
   jami son N ga o'sdi — bu yangi qarz EMAS, ko'rinmagan qarz endi
   ko'rinmoqda». Manba: backfill DRY-RUN chiqishi (`OCHILADIGAN QATOR` /
   `OCHILADIGAN JAMI SUMMA`) — uni o'chirmasdan saqlang.
3. **Izohlar auditi (Q6 vazifa 3) ga QO'SHIMCHA:** `pos-customer-debt.ts:137-141`
   dagi «butun qoldiqni adopsiya qilsak … eslatma cron / Telegram oqimi
   kutilmaganda portlardi» ogohlantirishi endi **QISMAN eskirgan** — Q5
   aynan shuni qildi, lekin zinapoya bilan. Izoh yangilanmasa keyingi
   o'quvchi «demak backfill qilib bo'lmaydi» degan xulosaga keladi.
4. **`ops-q5-backfill-rollback.ts` ni Q6 dan KEYIN ham repoda qoldiring** —
   u faqat backfill kunining asbobi emas: `RUN` yorlig'i bo'yicha istalgan
   vaqtda bitta yugurishni qaytarish yo'li.
5. **Q6 `docs/ops/jonli-holat.md` ga backfill izini yozsin** (qoida 14):
   qaysi `RUN`, qachon, nechta qator, kim yugurtirgan.

---

### Q6 — Jonli verify, hujjatlar, izohlar auditi · 2026-08-26 · **QISMAN** (jonli verify YUGURTIRILMAGAN — deploy yo'q)

**Xulq O'ZGARMADI** — Q6 birorta servis yo'liga tegmaydi: na `post()`, na
`refund()`, na undirish ekrani, na kassa. Yangilik uchta: **jonli verify
asbobi** (skript + sof hukm moduli), **eskirgan premise'larning MEXANIK
qo'riqchisi** va **hujjatlar**. Migratsiya YO'Q.

Commit: **`4d294947`** (branch `yacheyka-inventarizatsiya`, 11 fayl + hook'ning
`docs/progress.json` i, +2224/−16).

#### 🔴 Sessiya boshidagi holat — halol qayd

Daraxtda **avvalgi, tugallanmagan Q6 sessiyasining** ishi turgan edi: to'rt
untracked fayl (`ops-q6-live-verify.ts`, `q6-verify-plan.ts` va ikki test,
2026-08-25 21:56) va `NEXT.md`/`debt.service.ts`/`counterparty-settlement.util.ts`
dagi izoh tuzatmalari — **hisobotsiz va commit'siz**. O'sha sessiya
`sale-debt-premise-guard.test.ts` ni ham yozgan, lekin u **QIZIL** edi:
test `recompute-counterparty-balances.ts` dan tuzatma kutardi, tuzatma esa
qilinmagan edi.

Shu sessiya o'sha ishni **o'z zimmasiga oldi**: to'liq o'qildi, HTTP
shartnomalari kod bilan qayta tekshirildi, uchta nosozlik topilib tuzatildi
(pastda), qolgan qarz yopildi va hammasi BITTA commit'ga qo'yildi.
Yozilmagan ish — yo'q ish; shuning uchun bu yerda ochiq aytiladi.

Ayni paytda daraxtda **parallel K4 sessiyasi** (bo'linadigan tovar kesimi) ham
ishlayotgan edi. Commit `git add <aniq yo'llar>` bilan qilindi va
`git show --stat` bilan tasdiqlandi — **begona fayl commit'ga TUSHMADI**
(K4 o'z ishini `82169252` + `7f352e90` bilan mustaqil commit qildi).

#### Bog'liqlik holati (qoida 11 — ochiq aytiladi)

Q6 ning sharti — «Q5 dan keyin». Q5 holati **«QISMAN»** va uning JONLI
bandlari (mezon 3, 4, 5, 7) OCHIQ. Qoida 11 bo'yicha bu Q6 ni **bloklashi
kerak edi**. Nega baribir boshlandi — va nima QILINMADI:

| Q6 vazifasi | Q5 ning jonli bandiga bog'liqmi | Holat |
|---|---|---|
| 1. Verify SKRIPTINI yozish | ❌ yo'q — asbob deploy'dan OLDIN kerak | ✅ bajarildi |
| 1b. Skriptni **jonlida yugurtirish** | ✅ **ha** | ❌ **QILINMADI** |
| 2. `NEXT.md` qaror yozuvi | ❌ yo'q | ✅ bajarildi |
| 2b. `jonli-holat.md` ga backfill **izi** | ✅ ha — iz hodisadan tug'iladi | ⚠️ **soxta qator YOZILMADI**, o'rniga OLDINDAN retsept (pastda) |
| 3. Izohlar auditi | ❌ yo'q | ✅ bajarildi |
| 4. Xotira yozuvi | ❌ yo'q | ✅ bajarildi |
| 5. Egasiga yakuniy hisobot | ✅ ha — «yopildimi» degan gap jonli dalilni talab qiladi | ⚠️ **«yopildi» DEYILMADI**, «kodda tayyor, jonlida ochiq» deyildi |

Ya'ni Q6 ning **asbob va bilim** qismi bajarildi, **isbot** qismi esa deploy
oynasiga qoldi. Shu sababdan holat **«QISMAN»**.

#### Nima qilindi

| # | Fayl | Nima |
|---|---|---|
| 1 | `apps/api/src/scripts/q6-verify-plan.ts` | **YANGI sof modul** — barcha HUKM qoidalari (DB yo'q, Nest yo'q, HTTP yo'q, `Date.now()` yo'q) |
| 2 | `apps/api/src/scripts/ops-q6-live-verify.ts` | **YANGI** jonli verify skripti (**DRY default** · `--live` · `--only=debt\|prepay`) |
| 3 | `apps/api/src/scripts/q6-verify-plan.test.ts` | **YANGI**, **54 test** — har hukm MUTATSIYA bilan sinaladi |
| 4 | `apps/api/src/scripts/q6-live-verify-guard.test.ts` | **YANGI**, **21 kod-shakl qo'riqchisi** |
| 5 | `apps/api/src/modules/debt/sale-debt-premise-guard.test.ts` | **YANGI**, **11 test** — eskirgan premise'larning MEXANIK qulfi |
| 6 | `apps/api/src/scripts/recompute-counterparty-balances.ts` | «reyestrga EMAS» dalili BEKOR qilindi, yangi dalil (`balanceAdopted: false` FILTRI) yozildi |
| 7 | `apps/api/src/modules/debt/pos-customer-debt.ts` | F9 sarlavhasidagi «chekdan `Debt` yozib yuborish» taqiqi BEKOR belgilandi |
| 8 | `apps/api/src/modules/debt/debt.service.ts` | (avvalgi sessiyadan) «reyestrda faqat qo'lda ochilgan qarz» dalili BEKOR |
| 9 | `apps/api/src/modules/counterparty-settlement/counterparty-settlement.util.ts` | (avvalgi sessiyadan) «xulosa o'zgarmadi, MEXANIZM o'zgardi» |
| 10 | `NEXT.md` | **2026-08-26a** qaror yozuvi (P1 uslubi) + 5541-qatordagi eski band BEKOR belgilandi |
| 11 | `docs/ops/jonli-holat.md` | **3.2-bo'lim** — Q5 backfill'ining OLDINDAN yozilgan izi + jurnalga qo'shimcha |

**Skriptning shakli:**

```
argumentsiz  → DRY: faqat O'QIYDI, «jonlida qaysi faza bor» qamrov jadvali
--live       → sinov cheki bilan yozadi, oxirida HAMMASINI qaytaradi
--only=      → zanjirni ajratish (qarz / avans)

QARZ ZANJIRI:   qarzga sotuv → qator bor · balans BIR marta o'sdi · ro'yxatda
                chiqdi → qisman to'lov → ikkala daftar TENG kamaydi → vozvrat
                → qator yopildi va ro'yxatdan yo'qoldi        (11 hukm)
AVANS ZANJIRI:  qabul → kassa `+`, balans `−`, Debt qatori YO'Q → avansdan
                to'lov → kassa qimirlamadi, chek TO'LANGAN → ortiq urinish 400
                → §2.2 kesishuvi → qolgan avans naqd qaytdi     (10 hukm)
```

#### 🔴 HUKM QOIDALARI SKRIPTDAN AJRATILDI — asosiy dizayn qarori

P1 ning `ops-p1-live-verify.ts` ida hukm shartlari skript ichida, `checks`
massivida yozilgan. U ishlagan, lekin **hech qachon tekshirilmagan**: shartning
O'ZI noto'g'ri bo'lsa skript baribir «O'TDI» deb chiqardi va «jonlida
tasdiqlandi» degan yozuv YOLG'ON bo'lardi.

Q6 rejaning BESH invariantini isbotlashi kerak, ya'ni hukmning ishonchliligi
o'lchovning o'zidan MUHIMROQ. Shuning uchun barcha shartlar sof modulga
chiqarildi va har biri **mutatsiya bilan** sinaladi: to'g'ri o'lchov ✅,
BUZILGAN o'lchov ❌ berishi SHART.

⚠️ **IKKINCHI FORMULA YOZILMADI.** Reyestr qatorining kutilgan summasi Q1 ning
`receivablePortion` idan olinadi (§2.2). Agar verify «max(0, min(…))» ni QAYTA
yozsa, u tekshirayotgan kodning xatosini takrorlab, hech nimani isbotlamasdi.
Buni kod-shakl testi qulflaydi.

#### 🔴 LOKAL DRY YUGURISH (2026-08-26) — skript ROSTDAN ishlaydi

Baza: `sherset_v2_dev` @ `localhost:5432` (parol egasidan so'raldi va **shu
sessiyadan tashqariga yozilmadi**, qoida 5). Skript **hech nima yozmaydi** —
DRY rejim faqat `SELECT`.

```
════════ Q6 JONLI VERIFY ════════
Rejim:   DRY (hech nima yozilmaydi)
API:     http://localhost:4001/api/v1
Akkaunt: Demo Organization · token: Admin User

── QAMROV (jonlida qaysi faza bor) ──
  OK   Q1 (migratsiya: debts.source_doc_type/source_doc_id) — ustunlar BOR
  OK   A1 (migratsiya: retail_drawer_cash_in.kind) — ustun BOR
  YO`Q Q4 (migratsiya: company_settings.sale_debt_term_days) — ustun YO'Q — migratsiya berilmagan
  YO`Q A2 (kod: summary.prepayAvailableMinor) — O'LCHANMADI — API javob bermadi (server ko'tarilganmi? `Q6_API_BASE`)
  YO`Q A3 (kod: summary.standing) — O'LCHANMADI — API javob bermadi (server ko'tarilganmi? `Q6_API_BASE`)
  YO`Q Q2/Q5 (ma`lumot: reyestrda kassa cheki qatorlari) — jami 0 qator · shundan Q5 backfill'i 0

DRY — `--live` berilmadi, hech nima yozilmadi.
`--live` yugurtirish MUMKIN EMAS (yuqoridagi «YO`Q» qatorlari).
```

**Bu yugurish uchta narsani O'LCHADI (taxmin emas):**

1. **Skript ishlaydi** — import zanjiri, Prisma so'rovlari, JWT imzolash,
   `information_schema` zondi va qamrov jadvali. Ilgari u faqat
   «typecheck'dan o'tgan» edi; hech qachon YUGURTIRILMAGAN skript deploy
   kechasi birinchi marta ishga tushirilsa — aynan o'sha kechada yiqiladi.
2. 🔴 **Q4 migratsiyasi LOKAL BAZADA HAM YO'Q.** Q4 hisoboti buni
   «ochiq band» deb yozgan edi; endi bu **o'lchangan fakt**. Q1 va A1
   migratsiyalari esa lokal bazada BOR — ya'ni Q4 ning migratsiyasi hech
   qayerda sinalmagan. (Uni Q4 ning qarzi sifatida qoldirdim: Q6 boshqa
   fazaning qabul mezonini o'zi yopmaydi.)
3. **Q2/Q5 qatorlari 0** — Q5 ning lokal backfill'i rollback bilan tozalab
   ketgani (652 → 885 → 652) va Q2 yozuvchisi lokalda hech qachon chek
   post qilmagani bilan MOS. Ya'ni lokal baza kutilgan holatda.

#### 🔴 UCHTA NOSOZLIK TOPILDI VA TUZATILDI

Uchalasi ham **faqat skript yugurtirilganda yoki kod diqqat bilan o'qilganda**
ko'rinadi va uchalasi ham deploy kechasida ZARAR keltirardi.

**1. «O'LCHANMADI» «KOD YO'Q» deb yozilardi.**
Yuqoridagi chiqishning A2/A3 qatorlari birinchi yugurishda
«**maydon YO'Q — kod deploy qilinmagan**» deb chiqdi. Aslida `:4001` da
server umuman ko'tarilmagan edi — skript hech nima O'LCHAMAGAN edi.
Deploy kechasida bu xulosa odamni butunlay boshqa ishga (qayta deploy,
build tekshirish) yuborardi, holbuki kerak bo'lgani — API ni ishga tushirish.

Tuzatildi: `DeploymentProbe` ga **`apiReachable`** qo'shildi va u
`HttpError` (API JAVOB berdi — eski kod 404/400 qaytarishi mumkin) ni
tarmoq xatosidan (`ECONNREFUSED`, DNS, timeout) AJRATADI. Endi jadval
«**O'LCHANMADI — API javob bermadi**» deydi va `isLiveVerifyPossible`
ham `apiReachable` ni ALOHIDA shart sifatida talab qiladi.
Qulflandi: 4 test.

**2. ATAYLAB rad etilgan chek CHERNOVIK qoldirardi — va u SMENANI BLOKLARDI.**
Invariant 5 («avansdan ortiq urinish 400 bilan rad etiladi») ni o'lchash
uchun skript ortiqcha chek POST qiladi. Lekin `POST /retail-sales`
(chernovik yaratish) 400 dan OLDIN muvaffaqiyatli o'tadi — post rad etilsa
chek **`draft`** holatida QOLADI.

🔴 `draft` — smenani yopishga to'sqinlik qiluvchi holatlardan biri
(`unresolved-sales.ts` → «savatda»; F5 ning `close()` to'sig'i). Ya'ni
verify skripti kassirning smenasini yopolmaydigan qilib qo'yardi —
**aynan shu sinfdagi hodisa 2026-08-24 da kassani 46 daqiqa to'xtatgan.**
Verify asbobi hodisa manbaiga aylanishi mumkin emas.

Tuzatildi: alohida `expectPostRejected()` — chernovikni O'ZI yaratadi,
post'ni sinaydi va `finally` blokida `POST :id/cancel` bilan **har holda**
tozalaydi (`draft` dan `cancel` — `retail-sale-fsm.ts#CANCELLABLE` bo'yicha
ruxsat etilgan o'tish). `finally` ataylab: hukm QIZIL bo'lganda ham,
kutilmaganda post O'TIB ketganda ham iz qolmaydi.
Qulflandi: 2 kod-shakl testi.

**3. KESILGAN RO'YXAT «YO'Q» deb o'qilardi** (kod o'qib topildi, eng jimi).

`GET /manager/collection` javobni **`COLLECTION_ROW_CAP = 500`** da kesadi va
buni `truncated: true` bilan oshkora aytadi. Skript esa `truncated` ni
umuman o'qimasdan «ro'yxatda topilmadi» ni «ro'yxatda YO'Q» deb yozardi.

**Nega bu jiddiy:** Q5 backfill'idan keyin ro'yxat 500 dan OSHADI — lokal
o'lchov **579 → 812 qator**. Ya'ni bu chalkashlik nazariy emas, backfill
kunining ERTASIGA sodir bo'lardi. Va u IKKI XIL yolg'on berardi:

| Holat | Kesim borligida eski xulq | To'g'ri xulq |
|---|---|---|
| Qarz zanjiri (`q4-collection`) — qator ro'yxatda BO'LISHI shart | yolg'on **QIZIL** — odam bor bo'lmagan nosozlikni qidirardi | XATO, lekin SABABI bilan |
| Avans qoplagan chek — qator ro'yxatda BO'LMASLIGI shart | yolg'on **YASHIL** — kesim invariant 4 ni BEPUL tasdiqlardi | XATO |

Ikkinchisi xavfliroq: verify o'zi tekshirayotgan invariantni tasdiqlab
qo'yardi. Tuzatildi — `inCollection` endi **uch qiymatli**:

```
topildi            → true    (haqiqiy o'lchov)
topilmadi + butun  → false   (haqiqiy o'lchov)
topilmadi + kesik  → null    O'LCHANMADI ⇒ hukmda XATO, sababi yozilgan
```

Yo'l-yo'lakay so'rov `source=retailsale` (Q4 filtri) bilan toraytirildi —
kesim ehtimoli kamayadi VA Q4 filtrining O'ZI ham o'lchovga kiradi: qator
manba filtridan O'TISHI shart. Qulflandi: 6 hukm testi + 2 kod-shakl testi.

#### Izohlar auditi (reja vazifasi 3) — GREP bilan isbot

Reja beshta joyni nomma-nom aytgan. Hammasi ko'rildi; qo'shimcha ikkitasi
(`retail-sale.service.ts`, `schema.prisma`) Q2/Q5 tomonidan allaqachon
tuzatilgan ekan.

| Fayl | Eskirgan da'vo | Holat |
|---|---|---|
| `debt.service.ts` | «reyestrda faqat qo'lda ochilgan qarz bo'ladi» | ✅ BEKOR (avvalgi Q6 sessiyasi) |
| `counterparty-settlement.util.ts` | «har `Debt` qatorining o'z `applyDelta` si bor» | ✅ BEKOR (avvalgi Q6 sessiyasi) |
| `recompute-counterparty-balances.ts` | «reyestrga EMAS, shuning uchun ikki marta sanalmaydi» | ✅ **BEKOR (shu sessiya)** |
| `pos-customer-debt.ts` (F9 sarlavhasi) | «chekdan `Debt` yozib yuborish ikki karra sanashga olib boradi» | ✅ **BEKOR (shu sessiya)** |
| `pos-customer-debt.ts` («portlardi») | «tarixiy qoldiqni backfill qilib bo'lmaydi» | ✅ BEKOR (avvalgi Q6 sessiyasi, Q5 ning eslatmasi bo'yicha) |
| `retail-sale.service.ts:1630` | «bu yerda ATAYLAB reyestrga YOZMAYMIZ» | ✅ Q2 da bekor qilingan |
| `schema.prisma → Debt.balanceAdopted` | «faqat to'lov paytida ochiladi» | ✅ Q2/Q5 da uchta yozuvchi sanalgan |
| `NEXT.md:5541` | o'sha «ATAYLAB yozmaymiz» bandi | ✅ BEKOR (avvalgi Q6 sessiyasi) |

**Grep isboti (2026-08-26, HEAD `4d294947`):**

```
$ grep -rn "reyestrga.*YOZMAYMIZ\|reyestrga.*YOZILMAYDI\|reyestrga EMAS" \
        --include=*.ts --include=*.tsx --include=*.prisma apps packages | grep -v BEKOR

apps/api/src/modules/debt/debt.service.ts:815                 ← BEKOR blokining ICHIDA (ko'chirma)
apps/api/src/scripts/recompute-counterparty-balances.ts:328   ← BEKOR blokining ICHIDA (ko'chirma)
apps/api/src/modules/debt/sale-debt-premise-guard.test.ts:34,72,80  ← QO'RIQCHINING O'ZI
```

Ya'ni **eski da'vo TIRIK holda hech qayerda qolmagan** — uchtasi qo'riqchi
testining o'zi, ikkitasi esa bekor qilish blokining ichidagi ko'chirma.

#### 🔴 NEGA ESKI MATN O'CHIRILMADI, BALKI KO'CHIRMA QILINDI

Bu ONGLI qaror va u qo'riqchi testda QOIDA bo'lib yozilgan.

Eski dalilni **jimgina o'chirish** keyingi o'quvchiga «bu yerda hech qachon
boshqacha bo'lmagan» degan taassurot qoldiradi — va u xuddi shu xatoni
qaytadan qiladi (F5 sabog'ining ikkinchi yarmi). To'g'ri naqsh: eski matnni
KO'CHIRMA qilib saqlash va yoniga nega bekor qilinganini yozish.

Shuning uchun qo'riqchi «jumla umuman bo'lmasin» demaydi, balki:

```
expectCancelledQuote(src, phrase):
   · jumla FAYLDA bo'lishi shart      (yo'q bo'lsa — qo'riqchi ko'r bo'lib qolgan)
   · «BEKOR QILINDI» belgisidan KEYIN kelishi shart
   · faqat BIR marta uchrashi shart    (ikkinchi nusxa — TIRIK da'vo)
```

⚠️ Yo'l-yo'lakay topildi: `debt.service.ts` ning qo'riqchisi **TASODIFAN
yashil** edi — qidirilgan satr izohda qator sinishi bilan bo'lingani uchun
`not.toContain` hech qachon topmasdi, ya'ni test hech nimani qulflamasdi.
Endi matn `flat()` bilan normallashtiriladi (izoh prefikslari olib
tashlanadi, bo'shliqlar bittaga keltiriladi) — qo'riqchi qator sinishidan
MUSTAQIL.

#### Test natijalari (raqam bilan)

| O'lchov | Natija |
|---|---|
| `apps/api` **to'liq** vitest | **674 fayl · 9740 test** — **9735 yashil, 2 skip, 3 YIQILDI** |
| ...yiqilganlarning tahlili | `auth/pos-device.service.test.ts` (2) + `auth/pos-pin.service.test.ts` (1), hammasi `Test timed out in 5000ms`. **ALOHIDA yugurtirilganda 27/27 YASHIL** (`Duration 5.00s`) ⇒ argon2 ning to'liq yuk ostidagi beqarorligi. Bu sinf A1/A3/Q5 hisobotlarida ALLAQACHON qayd etilgan; Q5 da u «taxmin» edi, endi **izolyatsiya bilan o'lchandi**. Q6 fayllariga aloqasi yo'q |
| Q6 ning O'Z testlari | `q6-verify-plan.test.ts` **54** + `q6-live-verify-guard.test.ts` **21** + `sale-debt-premise-guard.test.ts` **11** = **86 yangi test** |
| tegilgan kesim (`scripts`+`debt`+`counterparty-settlement`+`manager/collection`+`retail-sale`) | **91 fayl · 1388 test YASHIL** |
| `apps/api` typecheck (`tsc --noEmit`, `--max-old-space-size=8192`) | **0 xato** (K4 ning commit'idan KEYIN ham qayta o'lchandi) |
| `node scripts/check-lint.mjs` | **0 error** (1271 ogohlantirish — siyosat bo'yicha ruxsat) |
| `i18n:gate` | **19 test YASHIL** (Q5 da qizil edi — K3 ning fayli o'shandan beri ro'yxatga qo'shilgan; Q6 da yangi UI matni YO'Q) |
| lokal DRY yugurish | ✅ skript ishladi, chiqish yuqorida |

**86 yangi test nimani qulflaydi:**

| Guruh | Testlar |
|---|---|
| Yordamchilar | `rowRemaining` (qator yo'q ⇒ 0, manfiy emas) · `balanceDelta` (**`null` = O'LCHANMAGAN, 0 EMAS**) |
| Qarz zanjiri | 11 hukm chiqishi · har biri MUTATSIYA bilan: balans ikki marta o'sdi ❌ · qator ochilmadi ❌ · `balanceAdopted=false` ❌ · muddat NULL ❌ · manba `retailsale` emas ❌ · ro'yxatda chiqmadi ❌ · to'lovda bitta daftar kamaydi ❌ · vozvratda reyestr qimirlamadi ❌ · qaytarilgan chek ro'yxatda qoldi ❌ |
| §2.2 kesishuvi | avans TO'LIQ qopladi ⇒ qator BO'LMASLIGI shart · avans QISMAN qopladi ⇒ qator FARQGA teng · avansli mijozda qator paydo bo'lsa ❌ (invariant 4) |
| Avans zanjiri | 10 hukm · kassa qimirladi ❌ · chek to'langan sanalmadi ❌ · ortiq urinish 400 bermadi ❌ · **kesishuv qatori kutilgandan KAM** ❌ (A2 ning «40 000 ko'rinmay qolardi» holati) |
| **Kesilgan ro'yxat** | qarz yo'lida `null` ⇒ XATO · **avans qoplagan chekda ham `null` ⇒ XATO** (yolg'on yashil yo'li) · vozvratdan keyin `null` ⇒ XATO · avans zanjirida `null` invariant 4 ni buzmaydi (dalil — qator YO'Qligi) · matn uch holatni ajratadi |
| **Qamrov (DRY)** | to'liq ⇒ MUMKIN · migratsiya yo'q ⇒ MUMKIN EMAS · kod yo'q ⇒ MUMKIN EMAS · **API javob bermasa «kod yo'q» EMAS, «O'LCHANMADI»** · **API javob berdi-yu maydon yo'q ⇒ O'SHANDA «deploy qilinmagan»** · **API'ga yetib borilmasa `--live` MUMKIN EMAS** · ma'lumot qatori jonli verify SHARTI EMAS |
| Bo'sh ro'yxat | **`summarizeVerdicts([])` «o'tdi» EMAS** — yarim yo'lda to'xtagan skript YASHIL chiqmaydi |
| Kod-shakl (skript) | DRY default · `!LIVE` da ERTA QAYTISH · to'liq bo'lmasa `--live` TO'XTAYDI · hukmni SOF MODUL chiqaradi · **yiqilganda `exit(1)`** · **`NestFactory` UMUMAN yo'q** (prodda cron ikki marta ketardi) · marshrutlar `fetch` orqali · ro'yxat HTTP dan (Prisma'dan EMAS) · **`truncated` o'qiladi** · **`source=retailsale` filtri** · `applyDelta` YO'Q · `debt.create/update/delete` YO'Q · **har chek vozvrat qilinadi (≥4 chaqiruv)** · **rad etilgan chekning chernovigi `finally` da bekor qilinadi** · qolgan avans qaytariladi · sinov summalari ≤ 10 000 so'm |
| Kod-shakl (sof modul) | DB/Nest/HTTP import YO'Q · `Date.now()`/`new Date()` YO'Q · **kesishuv summasi `receivablePortion` dan — ikkinchi formula YO'Q** |
| Premise qo'riqchisi | besh faylda eski da'vo BEKOR blokining ICHIDA · bir marta · belgi bilan · filtr o'chirilsa saldo shishishi izohda OCHIQ · sxemada uch yozuvchi NOMI bilan |

#### Qoida 10 — «bu o'zgarish qaysi mavjud oqimni buzishi mumkin?»

1. **Servis kodi — BIR QATOR HAM O'ZGARMADI.** Q6 `post()`, `refund()`,
   `edit()`, undirish servisi, kassa va ekranlarga tegmaydi. O'zgargan
   to'rt faylda (`recompute-…`, `pos-customer-debt.ts`, `debt.service.ts`,
   `counterparty-settlement.util.ts`) **faqat IZOHLAR** o'zgardi — `git show`
   da bitta bayonot ham yo'q. Xulq-neytral.
2. **Pul / balans — TEGILMAYDI.** Skript `applyDelta` ni chaqirmaydi va
   `Debt` ga QO'LDA yozmaydi (kod-shakl testi izohsiz matnda tekshiradi).
   `DECLARED_BALANCE_WRITERS` ga yangi fayl QO'SHILMADI, `recompute` ga
   yangi manba KERAK EMAS.
3. 🔴 **`--live` OMBORGA TEGADI — bu eng katta xavf va u OCHIQ aytiladi.**
   Sinov cheki HAQIQIY tovarni sotadi va vozvrat bilan qaytaradi. Ya'ni
   `--live` — **jonli o'zgarish**: qoida 8 (`warehouse-state.ts` oldin/keyin)
   va qoida 13 (uchma-uch smoke) MAJBURIY, ish soatidan TASHQARIDA.
   Yumshatuvchilar: summalar ≤ 10 000 so'm (testda qulflangan), har chek
   qaytariladi, chernovik `finally` da bekor qilinadi, qolgan avans naqd
   qaytariladi, va `--only=` bilan zanjirni ajratish mumkin.
4. **Kassir smenasi — ENDI BLOKLANMAYDI.** Yuqoridagi 2-nosozlik.
   Tuzatilmaganida `--live` kassirning smenasini yopolmaydigan qilardi.
5. **Prod cron'lari — QO'ZG'ATILMAYDI.** `NestFactory.createApplicationContext`
   ATAYLAB ishlatilmaydi (P1 dan meros qoida): u ikkinchi jarayonda barcha
   `@Cron`larni ro'yxatdan o'tkazib, rejalangan ishlarni ikki marta
   yubordirardi. Hammasi HTTP orqali — va bu ustiga-ustak guard/DTO
   qatlamini ham o'lchaydi. Kod-shakl testi bilan qulflangan.
6. **Izoh o'zgarishlari keyingi QARORLARNI o'zgartiradi — bu MAQSAD.**
   `recompute` ning yangi izohi «filtrni olib tashlasa saldo SHISHADI» deb
   ochiq aytadi. Ilgari o'sha filtr «ortiqcha» bo'lib ko'rinardi va uni
   olib tashlash `APPLY=1` da mijozlar saldosini buzardi.
7. **Qo'riqchi testlar KELAJAKDAGI refaktorni QIZIL qiladi.** Kimdir eski
   premise'ni qaytarsa yoki bekor belgisini o'chirsa —
   `sale-debt-premise-guard.test.ts` yiqiladi. Bu ATAYLAB: izohni bir marta
   tuzatish yetmaydi.
8. **`NEXT.md` / `jonli-holat.md` — faqat QO'SHILDI**, mavjud yozuvlar
   o'chirilmadi. `jonli-holat.md` ning **1-bo'lim JSON'i va 2-bo'lim
   jadvali TEGILMADI** ⇒ `warehouse-state.ts` ning reyestr solishtiruvi
   o'zgarmaydi (chiqish kodi o'sha).
9. **Ombor / qoldiq / yacheyka — KODDA tegilmagan.** H-, G- va K-rejalar
   hududiga kirilmadi. Jonli o'zgarish BO'LMAGANI uchun qoida 8 va 13 bu
   sessiyada QO'LLANMADI — ular `--live` kuniga qoldirildi va pastdagi
   retseptda MAJBURIY band.
10. **Kiosk qamrovi / ruxsat matritsasi — o'zgarmadi.** Yangi marshrut yo'q;
    skript MAVJUD marshrutlarni MAVJUD ruxsatlar bilan chaqiradi (token
    eng eski xodimdan imzolanadi).
11. **Parallel K4 sessiyasi — to'qnashuv YO'Q.** Q6 `stock-piece`,
    `retail-sale`, `tsd` fayllariga bir qator ham yozmadi; K4 esa
    `debt`/`scripts` ga tegmadi. Ikkala commit mustaqil, typecheck ikkalasi
    ustida birga o'lchandi.

#### Qabul mezoni bo'yicha holat (qoida 11)

| # | Mezon | Holat |
|---|---|---|
| 1 | verify skripti **barcha hukmlarda ✅** | ❌ **YUGURTIRILMAGAN** — `--live` deploy'ni talab qiladi; DRY yugurish ✅ (skript ishlaydi) |
| 2 | egasi undirish ekranida kassa qarzlarini KO'RGANI tasdiqlangan | ❌ deploy yo'q |
| 3 | egasi avansli mijoz bilan kassada ISHLAB KO'RGANI tasdiqlangan | ❌ deploy yo'q |
| 4 | eskirgan izohlar qolmagan (**grep bilan isbot hisobotda**) | ✅ **BAJARILDI** — grep yuqorida + 11 mexanik qo'riqchi |
| 5 | `NEXT.md` qaror yozuvi (P1 uslubi) | ✅ **2026-08-26a** |
| 6 | `docs/ops/jonli-holat.md` ga backfill izi (qoida 14) | ⚠️ **QISMAN** — hodisa bo'lmagani uchun jurnalga qator YOZILMADI (soxta iz yozilmaydi); o'rniga **3.2-bo'lim** — oldindan retsept va yozilishi kerak bo'lgan maydonlar |
| 7 | xotira yozuvi | ✅ `sherset-loyiha.md` yangilandi |
| 8 | testlar | ✅ **86 yangi test** |

**Shuning uchun holat «TUGADI» EMAS, «QISMAN».** Yopish sharti: 1, 2, 3-bandlar
(hammasi deploy'ga bog'liq) va 6-bandning jurnal qatori.

#### Deploy holati

**Deploy QILINMADI**, VPS'ga tegilmadi, **jonli bazaga tegilmadi**.
Q6 da **migratsiya YO'Q**.

Migratsiyalar hamon **UCHTA** va hech biri VPS'da BERILMAGAN:
`20260825120000_debt_source_doc` (Q1) · `20260825220000_drawer_cash_in_kind` (A1)
· `20260825235000_company_settings_sale_debt_term` (Q4).
🔴 Q6 ning lokal DRY yugurishi **Q4 ning migratsiyasi LOKAL bazada ham
yo'qligini** o'lchadi — ya'ni u hech qayerda sinalmagan.

Deploy branch'i `kassa-qarzi-q1-q2` @ `456e53af` da Q3, A1, A2, A3, Q4, Q5 va
endi **Q6 ham** YO'Q. Q2 dagi cherry-pick retsepti bilan qayta yig'ilishi
kerak. **Bu Q6 sessiyasida QILINMADI — buyruq kutilmoqda.**

#### Jonli yugurish retsepti (deploy'dan KEYIN)

Har qadam OLDIDAN va KEYIN (qoida 8): `packages/db` da
`npx tsx scripts/warehouse-state.ts` — chiqishi shu hisobotga ko'chiriladi.
**Ish soatidan TASHQARIDA** (qoida 13), javobgar shaxs va vaqt yoziladi.

```bash
cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a
```

1. **DRY (yozmaydi) — deploy'dan OLDIN ham yugurtirish mumkin:**
   `./node_modules/.bin/tsx src/scripts/ops-q6-live-verify.ts`
   → qamrov jadvalidagi HAMMA qator `OK` bo'lishi SHART. Bittasi
   «O'LCHANMADI» bo'lsa — API ko'tarilmagan, bu deploy muammosi EMAS.
2. **Q5 backfill'i** (`docs/ops/jonli-holat.md` §3.2 + Q5 hisoboti) —
   bosqichma-bosqich, oxirida jurnal qatori yoziladi.
3. 🔴 **`--live` (OMBORGA TEGADI):**
   `./node_modules/.bin/tsx src/scripts/ops-q6-live-verify.ts --live`
   → 21 hukmning HAMMASI ✅ bo'lishi SHART. Chiqish TO'LIQ hisobotga.
   Zanjirni ajratish kerak bo'lsa: `--only=debt` / `--only=prepay`.
   ⚠️ Sinov kontragenti va tovarini QO'LDA ko'rsating: `Q6_DEBT_CP`,
   `Q6_PREPAY_CP`, `Q6_PRODUCT` (pastdagi 7-ochiq band).
4. **Uchma-uch smoke (qoida 13):** bitta sotuv (post → tekshir → cancel),
   bitta yacheyka sanash, bitta ko'chirish.
5. **Smena YOPILISHINI tekshirish** — `--live` dan keyin sinov smenasi
   yopilishi SHART (chernovik qolmaganining jonli dalili).
6. **Egasi bilan brauzerda:** `/menejer/undirish` da kassa qarzlari
   (manba «Kassa cheki», chek raqami havolasi) VA kassada avansli mijoz
   bilan bitta haqiqiy chek.
7. **Ertalab, savdo boshlanishidan oldin:** takroriy smoke + `warehouse-state.ts`.

#### Egasiga yakuniy hisobot (reja vazifasi 5)

**Ikkala shikoyat ham KODDA yopildi, JONLIDA hamon ochiq.**

| Shikoyat | Kodda | Jonlida |
|---|---|---|
| «Kassadan qo'shilgan qarzdorliklar undirish bo'limida ko'rinmayapti» | ✅ yangi cheklar (Q2) + tarixiy qarzlar (Q5) + manba/filtr/muddat (Q4) + vozvrat simmetriyasi (Q3) | ❌ deploy yo'q |
| «Oldindan pul beradigan mijozlar bilan ishlay olmayapmiz» | ✅ qabul (A1) + avansdan to'lash (A2) + ko'rsatish/tarix/naqd qaytarish (A3) | ❌ deploy yo'q |

**Deploy kunida egasi NIMAGA E'TIBOR BERSIN — ikki gap:**

1. 🔴 **Qarzdorlar ro'yxatidagi JAMI son birdan sakraydi.**
   Lokal o'lchov bo'yicha **+233 qator / +701 489 130 so'm** (ro'yxat
   579 → 812). **Bu YANGI QARZ EMAS — ko'rinmagan qarz endi ko'rinmoqda.**
   O'sha pul mijozlar balansida ALLAQACHON turgan edi, faqat undirish
   moduliga ulanmagan edi. Q4 ning «manba» belgisi va filtri aynan shu
   suhbat uchun qurilgan: `/menejer/undirish?source=retailsale` bilan
   kassadan kelganlarini AJRATIB ko'rish mumkin.
2. **Avansi bor mijozlar balansda MANFIY turadi — va bu TO'G'RI.**
   Manfiy balans «biz mijozga qarzdormiz» degani, ya'ni uning oldindan
   bergan puli. Bunday mijoz undirish ro'yxatiga **TUSHMAYDI** va unga
   eslatma **KETMAYDI** (invariant 4, §2.2 kesishuv qoidasi).

**Uchinchi, kichikroq gap:** eslatma cron'i backfill'dan keyin **14 kun
JIM** turadi, so'ng zinapoya bo'yicha operator navbatiga kuniga ~50
qatordan tushadi. Bu KUTILGAN xulq, nosozlik emas.

#### Ochiq qolganlar

1. 🔴 **Q6 ning O'Z bandlari:** `--live` yugurish (mezon 1) va egasining
   ikki tasdig'i (mezon 2, 3). Asbob TAYYOR va lokal DRY bilan sinalgan.
2. **`jonli-holat.md` jurnal qatori** — Q5 backfill'i yugurtirilgan kuni
   yoziladi (§3.2 da maydonlar tayyor).
3. 🔴 **Q4 migratsiyasi hech qayerda sinalmagan** — endi bu o'lchangan
   fakt (lokal bazada ham ustun YO'Q). Bu Q4 ning qarzi; Q6 uni o'zi
   yopmadi (boshqa fazaning qabul mezoni).
4. **Q1 dan meros:** `recompute` cross-check'iga `opening` manbasi
   qo'shilmagan; jonlida `APPLY=1` yugurtirilgan-yugurtirilmagani noma'lum.
5. **Q2/Q3/A1/A2/A3/Q4/Q5 dan meros:** jonli tasdiq, deploy branch'i push
   qilinmagan; A2 ning `edit()` chegarasi va Z-hisobot `revenueByMethod`
   kesimi; A3 ning ikki sessiyali poyga sinovi; mijozga «avansingizdan
   yechildi» xabari; Excel akt yorliqlarida `returnPayout`/`salesReturn`.
6. **A1 topgan sxema DRIFTI (35 bayonot, 4 ta `DROP TABLE`)** — o'zgarishsiz
   ochiq, alohida ish.
7. ⚠️ **`--live` ning zaif joyi — SINOV MATERIALI TANLOVI.** Skript
   kontragentni va tovarni O'ZI tanlaydi (balansi ≥ 0 bo'lgan eng
   kichigi; qoldig'i bor eng arzon tovar). Jonlida bu HAQIQIY mijozga
   sinov cheki yozadi (keyin qaytariladi). `Q6_DEBT_CP` / `Q6_PREPAY_CP` /
   `Q6_PRODUCT` bilan qo'lda ko'rsatish MUMKIN — **jonlida shundan
   foydalanish TAVSIYA ETILADI** (maxsus sinov kontragenti).
8. ⚠️ **`inv4-no-debt-row` hukmi QISMAN TAVTOLOGIYA.** `afterPrepay.row`
   `sourceDocId` bo'yicha qidiriladi, avans qabulida esa chek umuman yo'q
   ⇒ `row` har doim `null`. Ya'ni hukm «avansdan `Debt` qatori
   tug'ilmadi» ni to'liq isbotlamaydi — u faqat «SHU chekdan tug'ilmadi»
   deydi. To'liq isbot: kontragent kesimida `Debt` sanog'ini avans
   QABULIDAN oldin va keyin solishtirish. **Kiritilmadi** (o'lchov bir
   qator, lekin `LedgerSnapshot` shartnomasi o'zgarardi va uning ustidagi
   54 test qayta yozilardi) — keyingi sessiyaga ochiq band.
9. ⚠️ **Avans zanjiri A1…A3 ni talab qiladi.** Reja «A-fazalar tugagan
   bo'lsa» degan edi; ular tugagani uchun ikkala zanjir ham yozildi.
   Lekin jonlida A-fazalar deploy qilinmasa `--live` umuman boshlanmaydi
   (`isLiveVerifyPossible`) — ya'ni qarz zanjirini YOLG'IZ o'lchash uchun
   ham A1/A2/A3 deploy bo'lishi kerak. Bu ONGLI: yarim deploy qilingan
   jonlida verify yugurtirish o'zi xavf.

#### Reja bo'yicha keyingi qadam

**Q1…Q6 va A1…A3 ning KOD qismi TUGADI** — to'qqiz fazaning hammasi
yozilgan, testlangan va commit qilingan. Reja endi yangi FAZA kutmaydi;
u **deploy oynasini** kutadi.

Deploy buyrug'i kelganda tartib:

1. deploy branch'ini qayta yig'ish (Q2 ning cherry-pick retsepti,
   `4f5c1750` asosida: Q1 → Q2 → Q3 → A1 → A2 → A3 → Q4 → Q5 → **Q6**);
2. uch migratsiya (tartib: `debt_source_doc` BIRINCHI);
3. `ops-q6-live-verify.ts` DRY — qamrov jadvali TO'LIQ `OK`;
4. Q5 backfill'i bosqichma-bosqich (§3.2 + Q5 retsepti);
5. `ops-q6-live-verify.ts --live` — 21 hukm;
6. egasi bilan brauzerda ikkala oqim;
7. shu faylning Q4, Q5, Q6 hisobotlaridagi ochiq bandlar YOPILADI va
   fazalar «QISMAN» dan «TUGADI» ga o'tadi.
