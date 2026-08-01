# TZ — 5-bo'lim: TA'MINOTCHILAR (korxona ↔ ta'minotchi ko'prigi)

**Sana:** 2026-08-01 · **Holat:** dizayn tasdiqlangan (egasi tomonidan) · **Faza:** implementatsiyadan oldingi spetsifikatsiya

> 7 bo'limli tizim TZ'sining **5-qismi**. Oldingilari: [1) Kassa](2026-08-01-kassa-tz-design.md) ·
> [2) Onlayn sotuv](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md) · [3) Analitika](2026-08-01-analitika-tz-design.md) ·
> [4) Menejer](2026-08-01-menejer-tz-design.md). Keyingilari: 6) HR, 7) Ombor.

---

## 0. Kontekst — ko'prikning birinchi yarmi allaqachon jonli

### 0.1 Qabul-tasdiqlash zanjiri (2026-07-29 spec, 2026-08-01 da jonli tuzatilgan)

```
none → awaiting_supplier → delivering → awaiting_admin → completed
       ta'minotchi         omborchi     admin            stock omborga
       tasdiqlaydi         qabul qildi  tasdiqlaydi      kiradi
```

- **FSM toza va test qilingan** — `supply-approval.fsm.ts` (bosqich-o'tish qoidalari sof funksiyalarda,
  servis faqat yupqa Prisma-I/O).
- **Ta'minotchi uchun ochiq havola ishlaydi** — `supply-approval-public.controller.ts`:
  `GET :token` (ko'rish) · `POST :token/confirm` · `POST :token/reject`. TTL **14 kun**
  (`SUPPLIER_LINK_TTL_MS`).
- Ta'minotchi **miqdorni tuzatib** tasdiqlashi mumkin (`QtyAdjustment`, `diffAdjustments`) —
  «10 so'radingiz, 8 tasi bor».
- **Telegram tugmalari**: `confirmKeyboard`, `doubleConfirmKeyboard` + callback ishlovchi.
- Har qadam **`SupplyApprovalEvent`** jurnaliga (kim, qachon, nima).
- Atomik bosqich-da'vosi (optimistik `updateMany`) — ikki kishi bir vaqtda tasdiqlay olmaydi.
- **Muhim tuzatilgan xulq (commit `358622c`):** `send` hujjatni **unpost** qiladi — **stock faqat
  admin tasdig'ida omborga kiradi**. Bu §4 dagi «rad etilgan omborga qo'shilmaydi» qoidasini
  arxitektura darajasida **allaqachon** ta'minlaydi.

### 0.2 Xarid hisoboti (mavjud)
`report/purchase-management.service.ts` — har ta'minotchi bo'yicha: buyurtma / qabul / hisob-faktura /
to'lov summalari, **qoldiq balans** (ordered − payed) va **`deliveryRate`** (rejalashtirilgan sanaga
yetkazganlar ulushi).

### 0.3 Yetishmayotgani
Ta'minotchi **faqat bitta hujjatni** ko'radi. Doimiy oyna yo'q: barcha buyurtmalari, o'zaro balans,
to'lov jadvali. Ya'ni ko'prik hozir — **bir martalik ko'prikcha**.
Narx kelishuvi tarixi va da'vo (pretenziya) oqimi ham yo'q.

---

## 1. Maqsad

Korxona va ta'minotchi o'rtasida **ikki tomonlama shaffof ko'prik** — nizolar axborot yetishmasligidan
kelib chiqadi, shuning uchun har ikki tomon **bir xil raqamni** ko'rishi kerak.

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Tanlangan |
|---|---|---|
| Q1 | Aloqa formati | **Ikkalasi**: hujjat havolasi (tasdiqlash, 14 kun) + **ta'minotchi doimiy havolasi** (ko'rish) |
| Q2 | Ta'minotchi nimani ko'radi | buyurtmalar va holati · **o'zaro balans va to'lov jadvali** |
| Q3 | Baholash | **narx barqarorligi** (asosiy yangi ish) |
| Q4 | Da'vo oqimi | qabulda darhol qayd → **avtomatik da'vo** |
| Q5 | Rad etish oqibati | **butun yetkazma qaytariladi** — hech narsa omborga kirmaydi |
| Q6 | Parol | ta'minotchi uchun **parol yo'q** — havola orqali kirish |

---

## 3. Ikki xil havola (Q1, Q6)

| Havola | Qamrov | Muddat | Nima qila oladi |
|---|---|---|---|
| **Hujjat havolasi** (mavjud) | bitta qabul/buyurtma | 14 kun | ko'rish · **tasdiqlash** · miqdor tuzatish · rad etish |
| **Ta'minotchi havolasi** (yangi) | ta'minotchining **hammasi** | doimiy, bekor qilinadigan | **faqat ko'rish** — buyurtmalar, holat, balans, to'lov jadvali, da'volar |

**Nega ajratilgan:** tasdiqlash — **yozuv** amali, u qisqa muddatli va bitta hujjatga bog'langan
bo'lishi kerak. Ko'rish — **o'qish**, u doimiy bo'lishi mumkin. Ikkalasini bitta tokenga birlashtirish
uzoq muddatli yozuv huquqini beradi — bu xavfli.

### 3.1 Ta'minotchi havolasi — xavfsizlik talablari
Bu havola **moliyaviy ma'lumotni** (o'zaro balans) ochadi, shuning uchun:
1. Token **32 bayt tasodifiy** (mavjud `publication` moduli naqshi: base64url, ~256 bit).
2. Faqat **SMS yoki Telegram** orqali beriladi (email — ixtiyoriy); ekranda ochiq ko'rsatilmaydi.
3. **Istalgan payt bekor qilinadi va yangilanadi** (rotatsiya) — xodim ishdan ketsa yoki
   havola sizib chiqsa.
4. **Faqat o'sha ta'minotchi** ma'lumoti (`counterpartyId` bo'yicha qattiq filtr); boshqa
   kontragent ma'lumotiga o'tish imkonsiz.
5. Har ochilish **jurnalga** yoziladi (kim, qachon, IP) — sizib chiqishni aniqlash uchun.
6. **Rate-limit** — token brute-force'iga qarshi.

---

## 4. Ta'minotchi oynasi (Q2)

### 4.1 Buyurtmalar va holati
Har buyurtma bo'yicha to'liq shaffoflik:
```
Buyurtma №123 · 2026-07-28 · holat: yo'lda
  So'ralgan: 100 dona    Ta'minotchi tasdiqladi: 80 dona    Qabul qilindi: —
  Rejalashtirilgan sana: 2026-08-05
```
Holatlar FSM'dan olinadi (`awaiting_supplier` / `delivering` / `awaiting_admin` / `completed` /
`rejected`). Ta'minotchi **nima so'ralgan, nima va'da qilingan, nima qabul qilingan** — uchalasini
ham ko'radi. Bu «biz boshqa narsa yuborgandik» bahsini yopadi.

### 4.2 O'zaro hisob-kitob (eng muhim qism)
- **Joriy balans**: biz unga qancha qarzmiz (yoki u bizga — avans holatida).
- **Hisob-fakturalar ro'yxati**: har biri — summa, sana, holat (to'langan / qisman / kutmoqda /
  muddati o'tgan).
- **To'lov jadvali**: qaysi hisob qachon to'lanishi rejalashtirilgan.
- **Akt-sverka** — PDF/Excel yuklab olish (kodda `counterparty-act` va akt-sverka Excel eksporti bor).

**Qoida:** bu raqamlar ichki hisobotdagi raqamlar bilan **bir xil manbadan** olinadi
(`counterparty-balance`). Ikki xil hisob-kitob bo'lsa — ko'prik ishonchni buzadi, tiklamaydi.

---

## 5. Da'vo (pretenziya) oqimi — Q4 + Q5

### 5.1 Qabulda qayd
Omborchi qabul qilayotganda har pozitsiyani belgilaydi:
- **Qabul qilindi** — miqdor to'g'ri, sifat yaxshi
- **Kam keldi** — haqiqiy miqdor ko'rsatiladi
- **Rad etildi** — buzuq / noto'g'ri tovar / muddati o'tgan

### 5.2 Rad etish oqibati (Q5 — egasining qarori)
**Bitta pozitsiya rad etilsa — butun yetkazma qabul qilinmaydi va to'liq ta'minotchiga qaytariladi.**
- FSM: `delivering → awaiting_supplier` (mavjud `rejectTarget`).
- **Hech narsa omborga kirmaydi** — bu arxitektura darajasida allaqachon ta'minlangan
  (`358622c`: stock faqat `admin_ok` da kiradi).
- Hisob-faktura (`invoice-in`) **rasmiylashtirilmaydi** yoki bekor qilinadi.
- Ta'minotchiga **avtomatik da'vo** yuboriladi (Telegram + havola) — sabab, pozitsiyalar, foto.
- Menejerga bildirishnoma (4-bo'lim navbatiga tushmaydi — bu ta'minotchi muammosi, xodimniki emas).

### 5.3 Kam kelish (miqdor kamligi) — rad etish EMAS
> **Qabul qilingan taxmin** (egasi tuzatishi mumkin): miqdor kamligi va sifat nuqsoni **har xil
> hodisa**. Kam kelish — odatiy holat (ta'minotchi allaqachon `supplier_ok` bosqichida miqdorni
> tuzatgan bo'lishi mumkin), sifat nuqsoni esa — rad etish sababi.

- **Kam keldi:** hujjat haqiqiy miqdorga to'g'rilanadi, **shu qism omborga kiradi**,
  yetishmagan qism bo'yicha **da'vo** yaratiladi (yopilmagan buyurtma qoldig'i sifatida kuzatiladi).
- **Rad etildi (sifat):** §5.2 — butun yetkazma qaytariladi.

### 5.4 Da'vo hujjati
`SupplierClaim`: ta'minotchi · qabul hujjati · turi (`shortage` / `defect` / `wrong_item` / `expired`) ·
pozitsiyalar · summa · **foto/fayl** (kodda `attachment` moduli bor) · holat
(`ochiq → ta'minotchi javob berdi → hal qilindi / bahsli`) · yechim (qayta yetkazish / pul qaytarish /
chegirma).
Da'vo **ta'minotchi oynasida ko'rinadi** va u javob yoza oladi — bahs yozishmada qoladi, telefonda emas.

---

## 6. Narx barqarorligi (Q3)

Egasi tanlagan yagona baholash o'lchovi. Kuzatiladi:

| Ko'rsatkich | Mazmun |
|---|---|
| **Narx tarixi** | har (ta'minotchi × tovar) uchun xarid narxi vaqt bo'yicha — grafik |
| **O'zgarish chastotasi** | necha marta va qancha % o'zgargan (oxirgi 3/6/12 oy) |
| **Ta'minotchilar solishtiruvi** | bir xil tovarni kim qanchaga beradi — yonma-yon |
| **Kelishilgan narxdan og'ish** | kelishuv bo'lsa — undan qanchaga chetlashgan |
| **Ogohlantirish** | narx belgilangan % dan ko'p oshsa — menejerga signal |

**Manba:** `SupplyPosition.costMinor` (mavjud) — hujjatlardan tarix quriladi, alohida qo'lda
yuritish shart emas. Kelishuv narxi bo'lsa — `SupplierPriceAgreement` (yangi, ixtiyoriy).

**Eslatma:** `deliveryRate` (muddat intizomi) **allaqachon hisoblanadi** va `purchase-management`
hisobotida qoladi — qo'shimcha ish talab qilmaydi. To'liqlik va sifat o'lchovlari egasining qarori
bo'yicha **hozir qurilmaydi**, lekin `SupplierClaim` ma'lumoti keyin ularni qurish uchun yetarli
bo'ladi (kelajakka yo'l ochiq qoladi).

---

## 7. Baza o'zgarishlari

| O'zgarish | Tafsilot |
|---|---|
| `SupplierPortalToken` | yangi: `counterpartyId, tokenHash, createdAt, revokedAt, lastUsedAt` — ta'minotchi doimiy havolasi |
| `SupplierPortalAccessLog` | yangi: token ochilishi (vaqt, IP, sahifa) |
| `SupplierClaim` (+ `Position`) | yangi: da'vo hujjati (§5.4) |
| `SupplierPriceAgreement` | yangi (ixtiyoriy): kelishilgan narx + amal muddati |
| `Supply.rejectedReason` | qo'shimcha: rad etish sababi va izohi |

Mavjud va o'zgarmaydi: `Supply`, `SupplyApprovalEvent`, `SupplyPosition.costMinor`,
`PurchaseOrder`, `PurchaseReturn`, `InvoiceIn`, `FactureIn`, `Counterparty*`.

---

## 8. Testlash

### 8.1 Unit
- FSM: rad etish → `awaiting_supplier`, **stock o'zgarmasligi** (regressiya qulfi — `358622c` xulqi)
- Kam kelish: hujjat to'g'rilanishi + qoldiq da'vosi yaratilishi
- Rad etish: butun yetkazma qaytishi, `invoice-in` rasmiylashmasligi
- Token: bekor qilingan token `403`, boshqa kontragent ma'lumotiga o'tish imkonsizligi
- Narx tarixi: og'ish foizi hisobi, ogohlantirish chegarasi

### 8.2 Xavfsizlik testlari (majburiy)
- Ta'minotchi havolasi **faqat o'z** ma'lumotini qaytarishi (cross-tenant va cross-counterparty)
- Rate-limit ishlashi
- Bekor qilingan token darhol ishlamay qolishi

### 8.3 E2E
Buyurtma → ta'minotchi havolasi orqali tasdiqlash (miqdor tuzatish bilan) → yetkazish →
omborchi bitta pozitsiyani rad etadi → **butun yetkazma qaytadi, stock o'zgarmaydi** →
avtomatik da'vo ta'minotchi oynasida ko'rinadi → ta'minotchi javob yozadi.

### 8.4 Gate
`typecheck 0` · `biome 0` · i18n (ru+uz) · Vitest regressiyasiz · **Phase-2 QA** real brauzerda.

---

## 9. Bosqichlar

| Bosqich | Mazmun | Sabab |
|---|---|---|
| **B1** | `SupplierClaim` + qabulda qayd (kam/rad) + avtomatik da'vo | Da'volar hozir umuman yozilmaydi |
| **B2** | Rad etish oqibati: butun yetkazma qaytishi + `invoice-in` bloklanishi | Egasining aniq qoidasi |
| **B3** | `SupplierPortalToken` + ta'minotchi oynasi (buyurtmalar va holat) | Ko'prikning ikkinchi yarmi |
| **B4** | Ta'minotchi oynasida o'zaro balans + to'lov jadvali + akt-sverka | Nizolarning asosiy manbasi |
| **B5** | Narx tarixi va barqarorlik tahlili + ogohlantirish | Egasi tanlagan baholash |
| **B6** | Da'volar ta'minotchi oynasida + javob yozish | Bahsni yozishmaga o'tkazish |

---

## 10. Boshqa bo'limlarga bog'liqliklar

| Bog'liqlik | Qayerga |
|---|---|
| Qabul jarayoni, omborchi paneli, yacheykaga joylash | **7-bo'lim (Ombor)** |
| Ta'minotchiga buyurtma tasdig'i, narx ogohlantirishi | **4-bo'lim (Menejer)** |
| M11 — ta'minotchi muddati, narx tarixi, da'vo statistikasi | **3-bo'lim (Analitika)** |
| Tugab qolish xavfi → buyurtma tavsiyasi | **3-bo'lim** (`purchase-management`) |
| Xarid narxi (`costMinor`) → foyda hisobi | **1-, 2-bo'limlar** |

---

## 11. Qabul qilingan taxminlar

1. **Kam kelish ≠ rad etish** (§5.3) — miqdor kamligida yaroqli qism omborga kiradi, sifat
   nuqsonida butun yetkazma qaytadi. *Egasi buni tuzatishi mumkin: agar kam kelish ham butun
   yetkazmani qaytarishi kerak bo'lsa — §5.3 olib tashlanadi va §5.2 barcha holatga qo'llanadi.*
2. Ta'minotchi oynasi **faqat o'qish** — u yerdan buyurtma yarata olmaydi (buyurtmani biz beramiz).
3. Ta'minotchi havolasi bitta kontragentga bitta — bir necha aloqa shaxsi bo'lsa, bitta havolani
   ular o'zaro bo'lishadi (kerak bo'lsa keyin shaxs darajasiga kengaytiriladi).
