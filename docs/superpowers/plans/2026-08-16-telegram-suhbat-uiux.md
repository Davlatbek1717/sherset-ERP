# Telegram suhbati UI/UX — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mijozga ketgan har bir xabar — qo'lda yoki avtomatik — kontragent kartasidagi bitta suhbat ipida, yetkazish holati bilan ko'rinsin.

**Architecture:** Yangi UI qurilmaydi. Mavjud `telegram-chat-card.tsx` kengaytiriladi va chiquvchi MTProto xabar kiruvchisi bilan **bir xil jadvalga** (`TelegramChatMessage`) normallashtiriladi — bu naqsh inbound uchun allaqachon amalda (`mtproto-inbound-handler.ts`).

**Tech Stack:** NestJS · Prisma · Next.js · Vitest · biome

**Spec:** `docs/superpowers/specs/2026-08-16-telegram-suhbat-uiux-design.md`

## Global Constraints

- **Yangi messenger sahifasi YARATILMAYDI.** `telegram-chat-card.tsx` (343 qator) va
  `order-telegram-panel.tsx` (320 qator) kengaytiriladi.
- **`pending` ni «yuborildi» deb ko'rsatish TAQIQ.** Uch holat ochiq ajratiladi.
- **Ikki ip yaratilmasin:** biz yozganda ochilgan chat va mijoz javob berganda kelgan
  inbound AYNI `TelegramChat` qatoriga tushishi shart (telefon bo'yicha bog'lanish).
- 🔴 **Migratsiya prodda `prisma migrate deploy` bilan QO'LLANMAYDI** — bu bazada tarix
  replay-buzuq. Yo'l: qo'lda SQL + `prisma db execute`, va migratsiya fayli repoda qoladi.
- **Gate:** api+web typecheck 0 · biome 0 · o'zgargan modul testlari · **yangi `.tsx` bo'lsa
  TO'LIQ web suite**.

---

### Task 1: Chiquvchi MTProto xabar suhbat ipiga tushsin

Bugungi asosiy nosozlik: mijozning javobi ipda ko'rinadi, bizning avtomatik xabarimiz yo'q.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`TelegramChatMessage.outboxId`)
- Create: `packages/db/prisma/migrations/<ts>_telegram_message_outbox_link/migration.sql`
- Modify: `apps/api/src/modules/counterparty-debt-notify/counterparty-debt-notifier.service.ts`
- Test: `counterparty-debt-notifier.service.test.ts`

**Interfaces:**
- Produces: `TelegramChatMessage.outboxId` (nullable uuid) — ip qatorini outbox holatiga bog'laydi.

- [ ] **Step 1: Yiqiladigan test** — `retailsale` hodisasidan keyin `telegramChatMessage.create`
  chaqirilishi va uning `direction: 'out'`, `autoKind`, `outboxId` bilan yozilishini talab qil.
- [ ] **Step 2: Testni yugurtir** — FAIL (hozir faqat `hrTelegramOutbox.create` chaqiriladi).
- [ ] **Step 3: Sxema** — `TelegramChatMessage` ga `outboxId String? @map("outbox_id") @db.Uuid`
  + `@@index([accountId, outboxId])`. Migratsiya SQL: `ALTER TABLE telegram_chat_messages
  ADD COLUMN outbox_id uuid;` + indeks.
- [ ] **Step 4: Chat topish/yaratish** — outbox qatori yozilgandan keyin telefon bo'yicha
  `TelegramChat` topiladi; yo'q bo'lsa `boundBy: 'auto'`, `source` MTProto bilan yaratiladi
  va `counterpartyId` bog'lanadi. 🔴 Telefon normalizatsiyasi inbound bilan AYNI funksiya
  orqali (`normalizeTelegramPhone`) — aks holda ikki xil yozuv ikki ip yasaydi.
- [ ] **Step 5: Xabar qatori** — `direction: 'out'`, `text` = outbox matni,
  `autoKind` = manba turidan (`retailsale`→`debt_issued`, `debtpayment`→`payment`,
  `debt`→`debt_issued`), `outboxId` = outbox qatori id'si, `senderName` = do'kon nomi.
  **Enqueue paytida** yoziladi (yuborilgandan keyin emas) — aks holda `⏳ navbatda` va
  `⚠️ yetmadi` holatlari ipda hech qachon ko'rinmaydi.
- [ ] **Step 6: Testlar** — yashil; mavjud testlar buzilmagan.
- [ ] **Step 7: Gate + commit.**

---

### Task 2: Yetkazish holati ipda ko'rinsin

**Files:**
- Modify: `apps/api/src/modules/telegram/telegram.service.ts` (`listChatMessages`)
- Modify: `apps/web/src/components/counterparties/telegram-chat-card.tsx`
- Test: telegram service testi + kartochka komponent testi

**Interfaces:**
- Consumes: Task 1 dagi `outboxId`
- Produces: `MessageRow` ga `delivery: { state: 'queued'|'sent'|'failed'; at: string|null; reason: string|null } | null`

- [ ] **Step 1: Yiqiladigan test** — `listChatMessages` `outboxId` bor qator uchun
  `delivery` qaytarishini talab qil (`status pending|retry` → `queued`, `sent` → `sent`
  + `sentAt`, `failed` → `failed` + `failReason`).
- [ ] **Step 2: FAIL ni ko'r.**
- [ ] **Step 3: Servis** — xabarlar ro'yxatiga outbox holatini qo'sh (bitta `findMany`
  `outboxId in [...]`, N+1 QILMA).
- [ ] **Step 4: UI** — har chiquvchi xabar ostida chip: `⏳ navbatda` · `✓ yuborildi HH:mm` ·
  `⚠️ yetmadi — <sabab>`. 🔴 `delivery` `null` bo'lsa (eski qatorlar) chip **umuman
  chizilmaydi** — «yuborildi» deb taxmin qilinmaydi.
- [ ] **Step 5: Testlar + gate + commit.**

---

### Task 3: Kontragent kartasida aloqa holati va «yetmaganlar» filtri

**Files:**
- Modify: `apps/api/src/modules/telegram/telegram.service.ts` (yoki counterparty metrics)
- Modify: `apps/web/src/components/counterparties/telegram-chat-card.tsx`
- Modify: `apps/web/src/app/(app)/debts/page.tsx` (filtr)

- [ ] **Step 1: Yiqiladigan test** — uch holat ajratilishi: `reachable` (tgid yoki chat bor),
  `never_contacted` (telefoni bor, aloqa tarixi yo'q), `unreachable` (telefoni yo'q yoki
  oxirgi urinish `failed`).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: API** — kontragent uchun shu holatni hisoblab ber.
- [ ] **Step 4: UI (karta)** — holat bandi + `never_contacted` bo'lsa sababi ochiq yozilsin
  («birinchi to'lqin qulfi: mijoz hali o'zi yozmagan»), jim qolmasin.
- [ ] **Step 5: UI (qarzdorlar)** — «xabar yetmagan» filtri; 357 chetlab o'tilgan va xato
  bergan mijoz ko'rinadigan bo'lsin.
- [ ] **Step 6: Gate (yangi `.tsx` bo'lsa TO'LIQ web suite) + commit.**

---

### Task 4: Takroriy xabarning oldini olish

- [ ] **Step 1: Yiqiladigan test** — send box tepasida oxirgi avtomatik xabar matni va
  vaqti ko'rinishi.
- [ ] **Step 2: FAIL → UI → yashil.**
- [ ] **Step 3: Gate + commit.**

---

## Bajarilmaydi

- Yangi chat sahifasi / messenger.
- Ovozli xabar va fayl YUBORISH (kiruvchisi allaqachon bor).
- Ko'p tillilik — kontragentda til maydoni yo'q, alohida ish.
- Guruh yozishmalari.
