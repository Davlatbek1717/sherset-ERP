# Valyuta kursini qo'lda o'zgartirish — dizayn (2026-08-17)

> Egasi: «dollar kursini/narxini qo'lda o'zgartirib bo'lishi kerak, professional qilib».
> Tasdiqlangan dizayn. Implementatsiya rejasi alohida.

## 1. Muammo — o'lchangan holat

Kurs **ikki joyda alohida** yashaydi va kassa ishlatadigan joyda **UI yo'q**:

| | `exchange_rates` | `Currency.rateValue` |
|---|---|---|
| Kalit | `(date, currency, source)` · `source` = `CBRU` \| `MANUAL` | `id` (per-account) |
| Miqyos | `Decimal(20,6)`, `nominal` bilan | `BigInt`, kurs **×10⁸** |
| O'quvchi | 🔴 **KASSA** — `GET /exchange-rates/rate?currency=USD` (`rasmilashtirish-modal`, `debt-payment-dialog`) | ERP hujjatlari, hisobot konvertatsiyasi (`report-rate-ctx.util.ts`) |
| Yozuvchi | **faqat** CBRU sync (`exchange-rate.service.ts` `sync()`) | `PATCH /currencies/:id` → «Sozlamalar → Valyutalar» |

`getRate()` da **MANUAL qatori CBRU'dan ustun** (2026-08-16, egasi qarori). Ammo MANUAL
qatorni yozadigan yo'l yo'q ⇒ 12 000 kursi **SQL bilan** qo'yilgan
(xotira: `usd-manual-rate-override`).

**Natija:** kassa kursini o'zgartirish uchun har safar texnik yordam kerak; ERP tomoni esa
butunlay boshqa qiymatdan hisoblab, chek bilan hisobot bir-biriga qarama-qarshi chiqishi mumkin.

## 2. Qabul qilingan qarorlar (egasi, 2026-08-17)

1. **Bitta amal → ikkala qatlam birga** yoziladi (bitta tranzaksiya). Kassaning o'qish yo'li
   O'ZGARMAYDI ⇒ jonli kassaga xavf minimal.
2. **Ikki joydan** boshqariladi: «Sozlamalar → Kurslar» va **kassa** — lekin faqat ruxsatli
   foydalanuvchi o'zgartiradi (kassir ko'radi, o'zgartira olmaydi).
3. **Faqat bugundan** amal qiladi. O'tgan/kelajak sanaga yozish YO'Q.
4. **CBRU'ga qaytish almashtirgichi YO'Q** — do'kon doim o'z kursi bilan ishlaydi.

## 3. Yechim

### 3.1 Yozish nuqtasi — `PUT /exchange-rates/manual`

Kirish: `{ currency: 'USD', rate: '12000' }` · Ruxsat: `exchangerate.update`.

Bitta `$transaction` ichida:

1. `exchange_rates` **upsert** — `(date = bugungi UTC kun, currency, source='MANUAL')` → `rate`.
   `nominal` o'zgarmaydi (mavjud qatordan olinadi, yangi qatorda `1`).
2. `Currency` qatori (`accountId` + `isoCode`, lookup `alphaCurrencyCode()` orqali — M-03):
   `rateValue = round(rate / nominal × 10⁸)` (Prisma.Decimal, IEEE-754 EMAS),
   `rateUpdateType = 'MANUAL'`.
3. `AuditLog` — `entity='currency'`, `entityId=currency.id`, `action='rate_change'`,
   `fieldChanges={ rate: { before, after } }`, `userId`, `context={ source: 'manual-rate' }`.

Qaytadi: yangi amaldagi kurs qatori (`GET /exchange-rates/rate` bilan bir xil shakl).

**Validatsiya** (`ManualRateSchema`):
- `rate` — musbat, `0` va manfiy rad; kasr ≤ 6 xona;
- aql-bovar chegarasi `100 … 1 000 000` (bir marta kiritilgan `12` yoki `120000000` ni tutadi);
- baza valyutasi (`UZS` / `default=true`) rad — «bazani o'zgartirib bo'lmaydi»;
- valyuta shu akkauntda topilmasa `404` (jim yaratmaydi).

### 3.2 Ikki qulf (kiosk + ruxsat)

Loyihada bu klass ikki marta kuydirgan (`kiosk-allowlist-half-filled`,
`cashier-cannot-post-permission-wall`), shuning uchun ikkisi **birga**:

- `KIOSK_ALLOWED` ga `PUT /exchange-rates/manual` (`exact`) qo'shiladi — planshetdan chaqirilsin;
- ruxsat matritsasi kassirni to'sadi: `exchangerate.update` faqat admin/ega shablonida.

O'qish yo'li (`GET /exchange-rates/rate`) allaqachon kioskda ochiq — tegilmaydi.

### 3.3 O'zgarish tarixi — `GET /exchange-rates/changes?currency=USD&limit=20`

`AuditLog` dan (`entity='currency'`, `action='rate_change'`) o'qiydi va
`{ at, before, after, userName }` qaytaradi. Ruxsat: `exchangerate.view`.
Nega alohida endpoint: UI'ga `currencyId` ni bilib, `audit-log` filtrini qurish kerak
bo'lmasin — sahifa bitta so'rov bilan tarixni oladi.

### 3.4 «Sozlamalar → Kurslar» sahifasi

Hozir: CBRU jadvali + «Sinxronlash». Qo'shiladi:

- **Amaldagi kurs — yirik blok**: `1 USD = 12 000 so'm`, «O'z kursingiz» belgisi,
  «17.08, admin o'zgartirgan» (tarixning birinchi qatoridan).
- **«Kursni o'zgartirish»** → dialog: yangi qiymat · **eski → yangi** taqqoslash ·
  ogohlantirish: «Kassaga va yangi hujjatlarga darhol ta'sir qiladi. Yopilgan cheklar o'zgarmaydi.»
- **Tarix jadvali**: sana · eski → yangi · kim.
- CBRU jadvali pastda qoladi (ma'lumot uchun) + aniq izoh: **amalda o'z kursingiz ishlaydi**.

### 3.5 Kassa

- Amaldagi kurs va uning manbasi ko'rinadi (kurs allaqachon ishlatiladigan oynalarda).
- Ruxsat bo'lsa — «o'zgartirish» yo'li; bo'lmasa tugma **umuman render qilinmaydi**.
- Dialog `modal={false}` — qobiqda Radix modali ekran klaviaturasini o'ldiradi
  (`radix-modal-kills-shell-osk`).

## 4. Nega migratsiya kerak emas

`exchange_rates`, `Currency.rateValue` / `rateUpdateType`, `AuditLog` — hammasi mavjud.
Yangi ustun yo'q ⇒ prod DB sxemasi o'zgarmaydi (deploy xavfi kamayadi).

## 5. Testlar

**API**: chegara/kasr/manfiy validatsiya · baza valyutasi rad · noma'lum valyuta 404 ·
ikkala yozuv **bitta** tranzaksiyada (biri yiqilsa ikkinchisi ham qolmaydi) · audit qatori
`before/after` bilan · kassirga **403** · kiosk ro'yxatida yo'l bor · `getRate()` yangi
qiymatni qaytaradi.

**Web**: sozlamalar sahifasi — amaldagi kurs, dialog oqimi, tarix; kassa — ruxsatga qarab
tugma ko'rinishi. i18n ru+uz kalitlari.

**Vakuum-himoya**: har yangi qo'riqchi mutant bilan tekshiriladi (`exact-count-guard-rots`,
`tz-label-test-vacuous-math-round` saboqlari).

## 6. Xavf va qaytarish

- Kurs faqat **oldinga** ishlaydi: post qilingan hujjatlarda `rate_value` snapshot bor ⇒
  o'tmish qayta hisoblanmaydi.
- Noto'g'ri kurs kiritilsa — yana o'zgartirish; ikkisi ham tarixda qoladi (audit).
- CBRU cron ishlashda davom etadi va `CBRU` qatorlarini yozadi; `MANUAL` ustunligi tufayli
  kassaga ta'sir qilmaydi.

## 7. Ataylab QILINMAYDIGAN narsalar (YAGNI)

- CBRU ↔ qo'lda rejim almashtirgichi (egasi rad etdi);
- `CBRU + N%` avtomatik ustama;
- kelajak sanaga rejalashtirish;
- o'tgan sanani tuzatish;
- kassaning o'qish manbasini `Currency.rateValue` ga ko'chirish (kelajakda, alohida ish).
