# Adversarial QA — Phase 2 sinov stsenariylari

CLAUDE.md qoidasi: "Yashil darvozalar ≠ production-ready". Phase 1 dev tugagach, **bu test'lar majburiy**.

Har bir stsenariy: tayyorlash → bajaring → kutilgan natija → topilsa nima qilish.

---

## 1. Concurrency

### 1.1 Lost update — 2 ta admin bir hujjat

**Tayyorlash:** 1 ta `customer-order` yarating, 2 brauzer (yoki 2 incognito) bilan login qiling.

**Bajaring:**
- A brauzerda buyurtma narxini 100 → 200 ga o'zgartiring, save'ni bosmang
- B brauzerda shu hujjatni oching, manzilni "Toshkent" → "Samarqand" ga o'zgartiring va Save bosing
- A brauzerga qaytib Save bosing

**Kutilgan:** A brauzer "Optimistic lock" xato beradi yoki freshly fetch qaytaradi. **YO'Q:** B'ning manzil o'zgarishi yo'qolmasligi kerak.

**Hozir nima:** Bizda optimistic lock yo'q — A ning save'i B ning manzilini bosib o'tadi. **Aniqlanishi kerak:**
- `version` ustun qo'shish (Prisma `@@map`-version sifatida)
- API: PATCH'da `If-Match` yoki body'da `version` tekshirish
- 409 Conflict qaytarib, frontend'ga "boshqa joy yangilangan, refresh qiling" toast

**Status:** ❌ Hozir bug bor (silent overwrite)

### 1.2 Bonus redemption race

**Tayyorlash:** 1 ta `agent` ga 100 bonus berish (BonusOperation EARNING).

**Bajaring:**
- Ikki POS terminalda parallel `/loyalty/redeem` 100 bonus chaqiring (ikkalasi ham — bir vaqtda)

**Kutilgan:** Faqat bittasi muvaffaqiyat, ikkinchisi `BadRequestException("Yetarli bonus yo'q")` qaytaradi.

**Status:** ✅ `LoyaltyService.redeem()` ichida `$transaction({ isolationLevel: 'Serializable' })` bor — race-safe.

### 1.3 Stock consumption race

**Tayyorlash:** 5 dona stok bor `Demand` yarating, 2 brauzer.

**Bajaring:** Ikkala brauzerda 5 dona sotuvni `posted` ga o'tkazing parallel.

**Kutilgan:** Faqat bittasi `posted`, ikkinchisi `Insufficient stock` xatosi. Stock < 0 bo'lmaslik.

**Status:** ❓ Tekshirilmagan. `demand.service.ts` ichida `SELECT FOR UPDATE` ishlatiladimi yo'qmi tekshirish.

---

## 2. Timeout va network

### 2.1 Excel import 5000 qator

**Bajaring:** 5000 qatorli Counterparty Excel import.

**Kutilgan:** Server vaqtda javob qaytaradi yoki streaming feedback bilan ishlaydi.

**Buzilish belgisi:** axios default `timeout=30s`, server processing > 30s bo'lsa client `ECONNABORTED` xatosi. Server ishlay beradi, lekin client ulanishni yo'qotgan.

**Yechim:**
- Frontend axios timeout = 5 daqiqa import endpoint uchun
- Server: chunked processing (200 qatordan)
- Yoki async job + polling (job-id qaytarib, status pull)

**Status:** ❓ Tekshirilmagan.

### 2.2 Soliq EDO submission timeout

**Bajaring:** Internet sekin (Chrome DevTools `Slow 3G`), Soliq EDO yuborish.

**Kutilgan:** 30s+ kutish, lekin status `pending`'da qoladi (DLQ orqali keyin retry).

**Status:** ✅ `EdoSubmission.status` model'i bor + retry queue.

### 2.3 Network uzilish save vaqtida

**Bajaring:** Demand'da Save bossangiz, server javob bermay turganda Wi-Fi'ni o'chiring.

**Kutilgan:** Frontend toast "Network error" + Save tugmasi qayta bosishga tayyor.

**Status:** ✅ `useApiMutation` hook bilan toast.error chiqaradi.

---

## 3. Data integrity

### 3.1 Float drift in 2000 qator hisob

**Bajaring:** 2000 ta `DemandPosition` qo'shing — har birining narxi 0.1 (10 tiyin), summa = 200.

**Kutilgan:** `sumMinor` = 20000 (200 so'm tiyin'da), aniq.

**Buzilish:** Float ishlatilsa, 0.1 + 0.2 = 0.30000000000000004; 2000 marta drift = bir necha tiyin xato.

**Status:** ✅ Money model BigInt minor units (so'mning yuzdan biri = tiyin) ishlatadi. Float yo'q.

### 3.2 Currency snapshot per-transaction

**Bajaring:** Hujjat yarating USD valyutada (kurs 12500). Keyin kursni 13000 ga o'zgartiring. Eski hujjatni oching.

**Kutilgan:** Eski hujjat asl 12500 kursi bilan ko'rinadi, yangi kurs ta'sir qilmaydi.

**Status:** ✅ Document'da `rateValue` ustun bor — hujjat saqlanganda snapshot.

### 3.3 Cascade delete mid-way fail

**Bajaring:** `Counterparty` o'chiring, ammo unga 50 ta order bog'langan. Cascade orderlar o'chish boshlanadi, lekin 25-orderda DB error bo'ladi.

**Kutilgan:** Transaction rollback — 0 order o'chirilgan, counterparty saqlanadi.

**Status:** ✅ Prisma `$transaction` ishlatilgan + soft-delete pattern (deletedAt) — hard cascade kam.

---

## 4. Input edges

### 4.1 Null vs empty vs "0" vs whitespace

**Bajaring:** `Counterparty.inn` maydoniga quyidagi qiymatlar:
- `null` (omitted)
- `""` (bo'sh string)
- `"0"` (nol)
- `"   "` (whitespace)
- `"abc"` (xato format)

**Kutilgan:** Validation har birini har xil ko'radi. Bo'sh — null'ga normalize. Whitespace — xato. "abc" — format xato.

**Status:** ❓ Zod schema'da `.trim()` har joyda bormi tekshirish kerak.

### 4.2 Unicode (emoji, RTL, Cyrl↔Latin)

**Bajaring:**
- Counterparty.name = "Иван 🎉 Петров"
- Address = "ул. Юсуф Хос Хожиб, 5"
- INN = "𝟑𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕" (mathematical bold digits)

**Kutilgan:** Cyrillic OK, emoji OK, math bold INN — REJECT (faqat ASCII raqamlar).

**Status:** ❓ Tekshirish kerak — INN regex'i `^\d{9}$` bo'lsa, math bold raqamlar `\d` ga mos kelmaydi (Unicode-aware regex faqat `\p{N}` ishlatsa).

### 4.3 Katta raqam — Decimal 15 cifra

**Bajaring:** Mahsulot narxi = 999_999_999_999_999 so'm (1 kvadrillion, 15 ta 9).

**Kutilgan:** API qabul qiladi (BigInt`100000000000000_00`). UI `formatMoney` bilan to'g'ri ko'rsatadi.

**Status:** ✅ BigInt asoslangan. Lekin UI'da text overflow bo'lishi mumkin — shunda truncate.

### 4.4 Date timezone DST

**Bajaring:** `moment` = "2026-03-29T03:30:00" (DST kuni soat o'zgaradi).

**Kutilgan:** API DB'ga UTC saqlaydi, UI Asia/Tashkent timezone'da ko'rsatadi.

**Status:** ✅ Prisma `@db.Timestamptz()` (UTC), TZ='Asia/Tashkent'.

### 4.5 Phone format

**Bajaring:** `+998901234567`, `998901234567`, `8901234567`, `+998 90 123 45 67`.

**Kutilgan:** Hammasi normalize → `+998901234567` formatga.

**Status:** ❓ Counterparty.phone normalizatsiyasi yo'q. Eskiz SMS uchun `+998` prefix kerak. **Bug bo'lishi mumkin.**

---

## 5. Authorization edges

### 5.1 Role downgrade

**Bajaring:** Adminni `xodim` rol'iga tushiring, faol session bilan API chaqirsa.

**Kutilgan:** Cached perm'lar 60s ichida invalidate bo'lishi va keyingi protected endpointga 403.

**Status:** ✅ `PermissionsService` 60s LRU cache. JWT TTL 15 min, refresh'da yangi rol oladi.

### 5.2 Subscription tugagan user

**Bajaring:** Account `plan='trial'` bilan, trial 30 kun o'tdi.

**Kutilgan:** Login'ga ruxsat, lekin write endpointlar block (only read).

**Status:** ❌ Plan check yo'q. Production uchun zarur.

### 5.3 Account o'chgan, user faol

**Bajaring:** Admin akkauntni `deletedAt = now()` qildi. Foydalanuvchi keyin sahifa ochsa.

**Kutilgan:** 401 + "Akkount o'chirilgan" xabar.

**Status:** ❓ Auth middleware'ida `account.deletedAt` tekshirish kerakmi? Tekshirish.

---

## 6. UX edges

### 6.1 Generic "Xato" yo'q

**Bajaring:** Ataylab yomon API javob qaytaring (500 + bo'sh body).

**Kutilgan:** Foydalanuvchi "Xatolik" emas, real sabab ko'radi: "Server time-out" yoki "Network error" yoki "Maydon X majburiy".

**Status:** ✅ `useApiMutation` server `error.message` ni description sifatida toast'da ko'rsatadi.

### 6.2 Modal-ichida-modal

**Bajaring:** Webhook dialog'ni oching, ichida CatalogPicker oching, undan ham boshqa modal ochsa.

**Kutilgan:** ESC oxirgi'sini yopadi, oldingisi qoladi. Z-index urishmasligi kerak.

**Status:** ✅ Radix Dialog stack management bor. Z-token: overlay 300, modal 400, popover 500, tooltip 600.

### 6.3 Mid-form refresh

**Bajaring:** EditForm'da o'zgartirayapsiz, browser tab refresh bossangiz.

**Kutilgan:** Browser native "O'zgarishlar yo'qoladi" prompt.

**Status:** ✅ `useUnsavedGuard` hook + `beforeunload` handler.

### 6.4 Katta matn copy-paste

**Bajaring:** 10000 belgili matnni Description'ga paste qiling.

**Kutilgan:** API qabul qiladi yoki Zod schema `max(5000)` bilan reject qiladi (UI feedback bilan).

**Status:** ❓ Har sahema'da `max()` yo'q — tekshirish kerak.

---

## 7. Real-data smoke testlar (production-size)

| Stsenariy | Min hajm |
|---|---|
| Counterparty list | 5000 ta |
| Product list | 10000 ta SKU |
| Customer order list | 50000 ta |
| Inventory bilan sinov | 2000 pozitsiya |
| Audit log | 1M+ qator (eski rows query) |
| Webhook DLQ | 1000 ta failed delivery |
| Bulk delete | 500 ta hujjatni bir vaqtda |

Har bir uchun: **vaqt** (response time), **xotira** (Node heap), **DB** (slow query log).

---

## 8. Kim tekshiradi va qachon

| Faza | Kim | Qachon |
|---|---|---|
| Phase 2 (adversarial) | Loyiha egasi + 1 yordamchi | Production'dan 2 hafta avval |
| Phase 3 (staging) | Beta foydalanuvchi (5-10) | Production'dan 1 hafta avval |
| Phase 4 (gradual rollout) | Real foydalanuvchilar | Feature flag bilan 10% → 50% → 100% |

Har test bajarilganda: **belgilash** (qaytmaslik uchun har stsenariy uchun GitHub Issue ochilsin yoki bu hujjatda ✅/❌ qo'yilsin).

## 9. Hozirgi holat (2026-04-30)

- Phase 1 (development): ~85% ✅
- Phase 2 (adversarial QA): **0% — boshlanmagan**
- Phase 3 (staging): 0%
- Phase 4 (gradual rollout): 0%

**"Production-ready" emas.** Happy path ishlaydi, lekin yuqoridagi ❌ va ❓ belgilangan stsenariylar tekshirilmagan.
