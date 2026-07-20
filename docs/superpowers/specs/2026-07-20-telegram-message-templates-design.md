# Telegram xabar shablonlari (kutubxona) + qarzdorlarga yuborish — dizayn

**Sana:** 2026-07-20
**Holat:** Dizayn tasdiqlangan (foydalanuvchi), implementatsiya kutmoqda
**Ko'lam:** Telegram qarz-eslatma matnini sozlanadigan shablon-kutubxonaga aylantirish + mavjud «tanlangan qarzdorlarga yuborish» oqimini shablon-tanlagich bilan boyitish.

---

## Muammo (grounding)

Loyihada **SMS shablon + ommaviy yuborish** tizimi allaqachon committed va ishlaydi:
- `SmsTemplate` DB modeli (`key`-asosli, Eta-render) + `settings/sms/templates` tahrir UI.
- `send-reminder-modal.tsx` — qarzdorlar sahifasidan **tanlangan** qarzdorlarga kanal (SMS/Telegram)
  tanlab **ommaviy** yuborish (`DebtService.sendBulkReminders({ ids, channel })`).

**Bo'shliq:** **Telegram** qarz-eslatma matni **HARDCODED** — `apps/api/src/modules/debt/debt-telegram.util.ts`
`reminderMessage(args)` (MarkdownV2 formatда, `*qalin*`/`__tagliq__`). Faqat aloqa-blok (telefon/karta/egasi)
`CompanySettings.messaging*` dan sozlanadi; **matnning o'zi tahrirlanmaydi**. Foydalanuvchi o'z Telegram
shablonlarini yaratib, sozlamadan tahrirlab, tanlagan qarzdorlarga yuborishni xohlaydi.

`HrNotificationTemplate` (eski) mos emas: MoySklad hujjat-eventlariga (`docType/eventType`) bog'langan,
`channel`/`key`/`body` yo'q, web UI umuman yo'q, va **hozir parallel-sessiya uni tahrirlamoqda** (TEGILMAYDI).

## Foydalanuvchi qarorlari (AskUserQuestion)

1. **Shablon kutubxonasi** — bir nechta nomli shablon; yuborishda birini tanlaydi.
2. **Tanlangan qarzdorlar** — mavjud `send-reminder-modal` oqimi (kengroq kontragent EMAS).
3. **Birlashgan UI** — `settings/sms/templates`ni «Xabar shablonlari»ga aylantirib SMS+Telegram bir joyda.

---

## Dizayn

### 1. Model — `SmsTemplate` → `MessageTemplate` (kanal-aware kutubxona)

Committed `SmsTemplate` **umumlashtiriladi** (ikkinchi tizim qurilmaydi — «unify» qarori):
- Prisma model nomi `SmsTemplate` → **`MessageTemplate`**, LEKIN `@@map("sms_templates")` **saqlanadi**
  → jadval nomi o'zgarmaydi, **data migratsiyasi yo'q**.
- Yangi maydonlar:
  - `channel String @default("sms")` — `'sms' | 'telegram'` (mavjud qatorlar `'sms'`).
  - `isDefault Boolean @default(false)` — har kanalда qaysi shablon **avtomatik-oqimда** (cron +
    bitta-yuborish) ishlatiladi + modal'da oldindan tanlanadi.
  - `key String?` — endi **nullable** (ixtiyoriy); `@@unique([accountId, key])` **OLIB TASHLANADI**
    (bir nechta shablon = kutubxona). Backward-compat: mavjud `debt_reminder` qatori key'ini saqlaydi.
- **Committed SMS kodini moslash** (xulq o'zgarmaydi): `sms-template.service.ts` (`this.prisma.client.smsTemplate`
  → `messageTemplate`), `sms-template.controller.ts`, `sendBulkReminders` SMS tarmog'i (`findByKey` →
  `findDefault(accountId, 'sms')` yoki key bo'yicha — mavjud SMS default saqlanadi). SMS testlari yashil qoladi.
- **Default invariant:** bir kanalда ko'pi bilan bitta `isDefault=true` (service `upsert`/`setDefault`da
  eski defaultни `false` qiladi — atomik tx).

### 2. Telegram renderer (izolyatsiya)

Yangi `apps/api/src/modules/debt/telegram-template-render.util.ts` (yoki `sms-render` yonida, HR
`template-render.util.ts`ga TEGMASDAN):
- `renderTelegramTemplate(body: string, ctx: TelegramTemplateContext): string` — SMS Eta naqshi
  (`{{= x }}`, izolyatsiyalangan Eta instansi), LEKIN **o'zgaruvchi QIYMATLARI MarkdownV2-escape**
  qilinadi (mavjud `mdSafe` mantiqini takrorlab) — shablonning o'z `*`/`__` belgilari literal o'tadi.
  Bu joriy `reminderMessage` formatini saqlaydi, matn endi DB'dan.
- Kontekst = SMS bilan bir xil: `counterparty.name`, `debt.remainingFormatted`, `debt.totalFormatted`,
  `company.{phone,card,cardOwner}`.

### 3. Send-oqimini ulash

- `debt.service.ts` `sendBulkReminders` **Telegram** tarmog'i: hardcoded `reminderMessage` o'rniga —
  modal uzatgan `templateId` (yoki default) shabloni → `renderTelegramTemplate` → `notifyCounterparty(...,
  'reminder')`. `BulkRemindersSchema`ga `templateId?: uuid` qo'shiladi (ixtiyoriy — berilmasa default).
- `debt-reminder.service.ts` (cron) + `sendTelegramReminder` (bitta): **default Telegram shabloni** →
  render → yuborish.
- **FALLBACK (backward-compatible):** hech qanday enabled Telegram shabloni yo'q bo'lsa → joriy hardcoded
  `reminderMessage(...)` ishlatiladi. Hech narsa buzilmaydi; sozlamasiz ham eski xulq davom etadi.

### 4. UI — birlashgan «Xabar shablonlari»

- `settings/sms/templates/page.tsx` → **umumlashtiriladi**: shablonlar ro'yxati (ikkala kanal, badge bilan),
  **yaratish/tahrirlash/o'chirish**, kanal tanlagich, har-kanal «asosiy» (isDefault) belgisi, o'zgaruvchi-qo'shish
  tugmalari, **preview** (Telegram uchun MarkdownV2 ko'rinishi). Marshrut nomi saqlanadi (yoki `settings/message-templates`
  ga rename — link yangilanadi).
- `send-reminder-modal.tsx` → **shablon tanlagich** qo'shiladi: tanlangan kanal bo'yicha filtrlangan
  shablonlar dropdown'i (default oldindan tanlangan). Tanlangani `bulkReminders`ga `templateId` sifatida ketadi.

### 5. Xatoliklar / edge-case

- MarkdownV2: o'zgaruvchi qiymatlar escape qilinadi; shablon-author'ning literal maxsus belgilari uning
  mas'uliyati — **preview** yordam beradi. Buzuq shablon send-layer'da `notifyCounterparty` xatosi bo'ladi
  (bulk natijada `skipped` reason). Kelajak polish: format-validatsiya (ko'lamdan tashqari).
- Default o'chirilsa/yo'q bo'lsa → fallback hardcoded.
- Bo'sh/uzun body → Zod (min 1, max 4096 — Telegram xabar limiti).

### 6. Testlash (Phase-1, «runtime-unverified»)

- Renderer unit: variable interpolation + MarkdownV2 value-escape + literal markdown passthrough.
- Service: library CRUD, `findDefault`, `setDefault` invariant (bitta default/kanal), SMS backward-compat.
- `sendBulkReminders` Telegram: tanlangan template render + fallback (default yo'q) + skip-sabablar.
- Web: modal template-picker (kanal bo'yicha filtr), settings library (create/edit/default).
- Gate: tc0 · biome0 · i18n (ru+uz) · web+api Vitest regressiya yo'q. **Real userbot smoke = Phase-2 QA**
  (browser-smoke YO'Q deb belgilanadi).

### 7. Ko'lam chegarasi (YAGNI)

YO'Q: kengroq kontragent-tanlash (faqat qarzdorlar — 2-qaror); template versiyalash/analytics; A/B; rich-editor
(oddiy textarea + variable-tugma + preview yetarli). ⚠️ **Parallel-sessiya:** barcode/supply uncommitted
fayllariga (`hr-telegram-bridge/template-render.util.ts`, `hr-notification-dispatcher.*`, `supply.*`,
`product.*`, `store*`) **TEGILMAYDI** — bu feature ularga muhtoj emas.

### 8. Asosiy fayl-touchpointlar

- `packages/db/prisma/schema.prisma` (+ offline migratsiya) — `MessageTemplate` (rename + channel/isDefault/key-nullable)
- `apps/api/src/modules/sms/sms-template.service.ts` + `.controller.ts` + `.schema.ts` — model rename + library + `findDefault`/`setDefault`
- **yangi** `apps/api/src/modules/debt/telegram-template-render.util.ts` (+ `.test.ts`)
- `apps/api/src/modules/debt/debt.service.ts` (`sendBulkReminders` TG tarmog'i + `sendTelegramReminder`) + `debt-reminder.service.ts` (cron) + `debt-telegram.util.ts` (`reminderMessage` fallback qoladi) + `debt.schema.ts` (`templateId?`)
- `apps/web/src/app/(app)/settings/sms/templates/page.tsx` (umumlashtirish) + `apps/web/src/components/debts/send-reminder-modal.tsx` (picker) + `apps/web/src/lib/sms-api.ts`/`debt-api.ts` + `apps/web/src/messages/{ru,uz}.json`

---

## Muvaffaqiyat mezoni

1. Foydalanuvchi sozlamada bir nechta **Telegram shabloni yaratadi/tahrirlaydi** (nomli, o'zgaruvchili, preview bilan).
2. Qarzdorlar sahifasidan tanlangan qarzdorlarga **Telegram** orqali **tanlangan shablon** yuboriladi.
3. Avto-cron + bitta-yuborish **default** shablonni ishlatadi; shablon yo'q bo'lsa eski hardcoded matn (fallback).
4. SMS xulqi buzilmaydi (backward-compat). Gate yashil. Natija halol **«Phase-1, runtime-unverified»**.
