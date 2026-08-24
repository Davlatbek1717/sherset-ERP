# Kassada mijoz hisob-kitobi — qarzni undirish ro'yxatiga ulash + avans bilan ishlash

> **Yaratilgan:** 2026-08-25 · **Buyurtmachi:** Ozodbek (egasi) · **Holat:** Q1 QISMAN + **Q2 QISMAN** (2026-08-25) — asosiy funksiya kodda va testda tayyor (`7ef30b61`, `af8d3339`), **jonli tasdiq va deploy KUTILMOQDA**; `opening` manbasi qarori hamon ochiq; Q3 boshlanmagan
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

**SABOQ (keyingi sessiyalarga):** bitta repoda ikki sessiya parallel ishlasa
`git stash` ISHONCHSIZ. Ish boshida `git log -1` va `git status` ni qayta
tekshirish, stash o'rniga alohida branch ishlatish xavfsizroq.

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
