# SMS orqali qarzdorlarga ommaviy xabar — dizayn

**Sana:** 2026-07-20
**Holat:** Dizayn tasdiqlangan (implementatsiya rejasidan oldin)
**Muallif:** brainstorming sessiyasi (Claude + operator)

---

## 1. Maqsad

Loyihada mavjud **Telegram** xabar-yuborish yoniga **SMS** kanalini qo'shish. Aniq
foydalanuvchi talabi:

1. SMS jo'natuvchi hisobi **sozlamalarda** kiritiladi (telefon/hisob).
2. **Qarzdorlar bo'limida** xabar yuborilishi kerak bo'lgan mijozlarni checkbox bilan
   tanlab, **bitta bosishda** ularga SMS yuborish.
3. SMS **shabloni** ham sozlamalardan tahrirlanadigan bo'lishi.

Brainstorming'da aniqlangan qarorlar:

- **Kanal modeli:** ommaviy yuborishda **SMS yoki Telegram** tanlanadi (yuborishdan oldin).
- **Shablon tizimi:** **ko'p-maqsadli** SMS shablonlar (jadval + sozlama UI ko'pni qo'llaydi;
  hozircha faqat `debt_reminder` kaliti kodga ulanadi).
- **Til/uzunlik:** standart shablon **lotin (o'zbekcha), qisqa** — narx uchun (~160 belgi ≈ 1 SMS).
- **Sozlamadagi raqam:** **ikkalasi ham** — (a) Eskiz jo'natuvchi hisobi, (b) matnda mijozga
  ko'rsatiladigan **kompaniya aloqa/karta raqami** (hozir kodda qattiq yozilgan).

---

## 2. Mavjud poydevor (qayta ishlatiladi — noldan qurilmaydi)

Kod-bazani o'rganish shuni ko'rsatdiki, SMS infratuzilmasining katta qismi **allaqachon bor**:

| Mavjud | Joy | Holat |
|---|---|---|
| `SmsConfig` / `SmsLog` DB modellari (Eskiz) | `packages/db/prisma/schema.prisma` | ✅ bor |
| SMS moduli: config CRUD, `testConnection`, navbat, Eskiz client, log o'qish | `apps/api/src/modules/sms/` | ✅ bor |
| SMS retry-worker (`@Cron` har 30s, ketma-ket yuborish, backoff) | `sms/sms-delivery.service.ts` | ✅ bor |
| Qarzdorlar sahifasida checkbox ko'p-tanlash (`selected: Set<string>`) | `apps/web/src/app/(app)/debts/page.tsx` | ✅ bor (hozir faqat PDF eksport) |
| Kontragent `phone` maydoni, qarz ro'yxatida uzatiladi | `debt.service.ts` | ✅ bor (SMS qabul qiluvchi) |
| Eta shablon-render + `formatMinor` | `hr/hr-telegram-bridge/template-render.util.ts` | ✅ bor (reuse) |
| Qarz-eslatma Telegram yo'li (`notifyCounterparty`) | `debt.service.ts#sendTelegramReminder` | ✅ bor |

**Yo'q (qilinadi):**

- Sozlamalarda **SMS sahifasi (UI)** — backend bor, `settings/sms/` sahifasi yo'q.
- **Ommaviy yuborish** endpointi + qarzdorlar toolbar'idagi tugma/modal.
- **Tahrirlanadigan SMS shabloni** (`SmsTemplate` jadval + sozlama tahriri).
- Kompaniya aloqa raqami sozlamada (hozir `debt-telegram.util.ts`da konstanta).

---

## 3. Arxitektura (Yondashuv 1 — tasdiqlangan)

Rad etilgan alternativalar: (2) shablonni `SmsConfig`ga matn-maydon qilib qo'yish —
ko'p-maqsadli talabga zid; (3) `HrNotificationTemplate`ni `channel` ustuni bilan
birlashtirish — SMS'ni HR event-bus mantiqiga bog'lab qo'yadi, qarz-eslatma HR-hodisasi emas.

### 3.1 Ma'lumotlar modeli (`packages/db`)

**Yangi model `SmsTemplate`** (`HrNotificationTemplate` naqshida):

```prisma
model SmsTemplate {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  key       String   @db.VarChar(50)   // maqsad: 'debt_reminder' | (kelajak) 'debt_overdue' ...
  name      String   @db.VarChar(120)  // sozlamada ko'rinadigan nom
  body      String   @db.Text          // Eta shabloni: {{= counterparty.name }} ...
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  account   Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, key])
  @@map("sms_templates")
}
```

**`CompanySettings`ga 3 nullable ustun** (account-wide, bitta manba):

- `messagingPhone` (VarChar) — mijozga ko'rsatiladigan aloqa raqami
- `messagingCard` (VarChar) — to'lov karta raqami
- `messagingCardOwner` (VarChar) — karta egasi

`debt-telegram.util.ts`dagi `SHERSET_CONTACT_PHONE` / `SHERSET_CARD` / `SHERSET_CARD_OWNER`
konstantalari shu maydonlarga ko'chadi (fallback sifatida eski qiymatlar qoladi, ma'lumot
bo'sh bo'lsa). **Ham SMS, ham Telegram** shu maydonlardan o'qiydi.

**Migratsiya:** 1 ta (yangi jadval + 3 ustun + `Account.smsTemplates` back-relation).
**Seed:** `debt_reminder` shabloni standart lotin matn bilan (idempotent upsert).

### 3.2 Shablon render va o'zgaruvchilar

`renderNotificationTemplate` + `formatMinor` **`modules/shared/template-render.ts`ga
ko'chiriladi** (HR-telegram-bridge va SMS/debt ikkalasi shundan import qiladi — modullararo
noto'g'ri bog'liqlikni yo'qotadi). Mavjud HR importlari yangi joyga yo'naltiriladi
(re-export shim bilan yoki to'g'ridan-to'g'ri).

SMS konteksti (Eta `{{= ... }}`):

```
{{= counterparty.name }}         mijoz ismi
{{= debt.remainingFormatted }}   "1 250 000" (formatMinor, qolgan qarz)
{{= debt.totalFormatted }}       umumiy qarz
{{= company.phone }}             CompanySettings.messagingPhone
{{= company.card }}              CompanySettings.messagingCard
{{= company.cardOwner }}         CompanySettings.messagingCardOwner
```

Standart `debt_reminder` matni (lotin, qisqa):

> `Assalomu alaykum {{= counterparty.name }}! Sizda {{= debt.remainingFormatted }} so'm to'lanmagan qarz bor. To'lov: {{= company.card }} ({{= company.cardOwner }}). Savol: {{= company.phone }}. Sherset`

### 3.3 Ommaviy yuborish (backend)

**Endpoint:** `POST /debts/reminders/bulk`
Ruxsat: `@RequirePermission({ entity: 'debt', action: 'update' })`
Body: `{ ids: string[] (uuid), channel: 'sms' | 'telegram' }` (Zod).

**Servis** `DebtService.sendBulkReminders(accountId, userId, ids, channel)`:

1. Tanlangan qarzlarni yuklaydi: `accountId`, `deletedAt: null`, `id in ids`,
   `status in ['unpaid','partial']`, `remaining = totalMinor - paidMinor > 0`.
2. Har qarz uchun:
   - `channel = 'sms'`:
     - Telefon = `counterparty.phone`; yo'q bo'lsa → `skip: no_phone`.
     - SMS config yo'q/o'chirilgan → `skip: sms_not_configured` (butun partiya uchun bir marta).
     - `debt_reminder` shabloni `enabled=false` → `skip: template_disabled`.
     - Shablon render → `SmsService.send(accountId, userId, { toPhone, body, entity:'Debt', entityId })`
       (navbatga `SmsLog`, mavjud worker yuboradi).
   - `channel = 'telegram'`:
     - Mavjud `telegram.notifyCounterparty(...)` yo'li (bugungi `sendTelegramReminder`
       mantiqi qayta ishlatiladi). Chat/telefon yo'q → `skip: no_telegram_chat`.
3. **Halol javob:** `{ queued: number, skipped: Array<{ id, name, reason }> }`.
   Sabablar: `no_phone` · `no_debt` · `sms_not_configured` · `template_disabled` · `no_telegram_chat`.

**Rate/yuk:** N qarzdor → N `SmsLog` qatori; worker 20/tick, har 30s, Eskiz limitiga mos
ketma-ket. Telegram yo'li ham ketma-ket (mavjud xulq).

### 3.4 Sozlamalar UI (`apps/web`)

- **`settings/sms/page.tsx`** (`settings/email/page.tsx` naqshida):
  - Eskiz config: provider, email, parol, sender-ID, yoqish toggle.
  - "Ulanishni tekshirish" tugmasi → `POST /sms/config/test` (balans ko'rsatadi, rangli badge).
  - Kompaniya aloqa maydonlari: telefon / karta / egasi (`CompanySettings`).
  - SMS loglari havolasi (`settings/sms/log`, mavjud `GET /sms/logs` ustidan).
- **SMS shablonlar tahriri** (shu sahifada tab yoki `settings/sms/templates`):
  - Shablon ro'yxati (hozircha `debt_reminder`); `body` tahriri.
  - O'zgaruvchi-yordamchi tugmalari (bosilganda matn kursoriga `{{= ... }}` qo'yadi).
  - **Jonli preview** (namuna kontekst bilan render).
  - **Belgi/SMS-segment hisoblagichi** ("142 belgi ≈ 1 SMS") — narx muhim.
  - Yoqish/o'chirish toggle.
- Sozlamalar navigatsiyasiga "SMS" bandi qo'shiladi.

### 3.5 Qarzdorlar UI (`apps/web`)

`debts/page.tsx`da mavjud tanlash toolbar'iga (hozir "PDF eksport (N)") yoniga
**"Xabar yuborish (N)"** tugmasi → modal:

- Kanal tanlovi: **SMS / Telegram** (radio).
- Tanlangan shablon preview + qabul qiluvchilar soni.
- Yuborishdan oldin taxminiy o'tkazib yuboriladiganlar (telefon yo'q / qarz yo'q) — ogohlantirish.
- Tasdiqlash → `POST /debts/reminders/bulk` → toast xulosa
  ("45 navbatga qo'yildi · 3 o'tkazildi: telefon yo'q").

---

## 4. Modul chegaralari (isolation)

| Birlik | Vazifa | Bog'liqlik |
|---|---|---|
| `SmsTemplate` model + `SmsTemplateService` | shablon CRUD + `findActive(key)` | Prisma |
| `modules/shared/template-render.ts` | Eta render + `formatMinor` (sof) | yo'q (sof funksiya) |
| `SmsService` (mavjud) | config + navbatga qo'yish (`send`) | Prisma, Eskiz client |
| `DebtService.sendBulkReminders` | tanlangan qarzlar → kanal bo'yicha yuborish/navbat | SmsService, TelegramService, SmsTemplateService, CompanySettings |
| `settings/sms` sahifalari | config + shablon + aloqa UI | `/sms/*`, `/company-settings`, `/sms/templates` |
| Qarzdorlar bulk-modal | kanal tanlash + xulosa | `/debts/reminders/bulk` |

Har birlik alohida tushuniladi/testlanadi. Render sof — unit testda aniq matn pinlanadi.

---

## 5. Sifat / gate / halollik

- **Backend testlari (Vitest):** `sendBulkReminders` skip-sabab matritsasi (no_phone /
  no_debt / not_configured / template_disabled / no_telegram_chat); render sof-funksiya
  natijasi; SmsTemplate `findActive` + Zod validatsiya.
- **Web testlari (Vitest):** segment-hisoblagich (belgi → SMS soni), kanal-modal xulqi,
  shablon o'zgaruvchi-inject.
- **i18n:** yangi kalitlar `ru` + `uz` (no-hardcoded gate).
- **Gate:** `typecheck 0` · `biome 0` · web+api Vitest regressiyasiz.
- **Halol status:** natija **"Phase-1, browser-smoke alohida"** deb belgilanadi
  (real brauzer/haqiqiy SMS yuborish = alohida Phase-2 QA).
- **Parallel-sessiya:** `debt.*` / `telegram.*` / `hr-telegram*` fayllarini boshqa sessiya
  ham o'zgartirmoqda — commit'da faqat aniq o'z fayllarim staged qilinadi (`git add <path>`),
  hech qachon `git add -A`.

---

## 6. Scope tashqarisi (hozir emas)

- `debt_reminder`dan boshqa SMS shablonlarni kodga ulash (jadval qo'llaydi, kod keyin).
- OTP / marketing / avtomatik (cron) SMS — faqat qo'lda ommaviy yuborish.
- Kirill/RU SMS shabloni (til lotin tanlangan; jadval matnni cheklamaydi, lekin standart lotin).
- Telegram bulk uchun yangi shablon — mavjud `reminderMessage` (boy markdown) qayta ishlatiladi.
- Atomic/transaction bulk — har SMS mustaqil navbat qatori (bir mijoz yiqilsa qolganlari ketadi).

---

## 7. Ochiq nuqtalar (implementatsiya rejasida hal qilinadi)

- `SmsService.send` hozir `entityId` uchun `uuid` kutadi — `Debt.id` uuid, mos.
- `SmsLog.entity` = `'Debt'` konvensiyasi (log filtrida ishlatiladi).
- Shablon `findActive` yo'q bo'lsa yoki `enabled=false` — bulk SMS'da aniq skip sabab
  (jim o'tmaydi, chunki bu qo'lda, ko'rinadigan amal — Telegram cron'dan farqli).
