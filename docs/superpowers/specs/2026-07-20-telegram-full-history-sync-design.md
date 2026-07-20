# Telegram to'liq-tarix sync + panel funksiyalari — dizayn (Faza-1)

**Sana:** 2026-07-20
**Holat:** Dizayn tasdiqlangan (foydalanuvchi), implementatsiya kutmoqda
**Ko'lam:** Faza-1 (poydevor). Faza 2–4 quyida qisqacha, alohida spec/sessiya oladi.

---

## Muammo (grounding)

`debts/[id]` (qarzdorlar) sahifasidagi `OrderTelegramPanel` faqat ikki manbani ko'rsatadi:
ERP yuborgan chiquvchi xabarlar (`HrTelegramOutbox`) + **jonli ushlangan** kiruvchi
xabarlar (`TelegramChatMessage`). Natijada:

1. **To'liq suhbat tarixi hech qachon yuklab olinmaydi (backfill yo'q).** Telegram'dagi
   eski dialog — ayniqsa operator **telefondan qo'lda** yozgan yoki mijoz ERP xabar
   yubormasidan oldin yozgan xabarlar — ko'rinmaydi.
2. **Kiruvchi ushlash ishonchsiz.** MTProto listener faqat *birinchi chiquvchi
   xabardan keyin* (`MtprotoWorkerService.ensureClient`, faqat send paytida) ulanadi.
   Hech qachon xabar yuborilmagan bo'lsa yoki API qayta ishga tushsa — mijoz javobi
   umuman saqlanmaydi.

Screenshot'dagi «Kontakt Telegram'da topilmadi» = shu mijoz raqami userbot sessiyasida
`getEntity`da topilmadi → hamma xabar «yuborilmadi».

**Tuzatish yo'li:** MTProto userbot (gramjs) `iterMessages`/`getMessages` orqali butun
o'tmish dialogni o'qiy oladi + doimiy qabul-qiluvchi listener bilan ishonchli oldinga sync.

## Mavjud arxitektura (nima ustiga quramiz)

- **2 kanal, bir xil UI jadvali:** Kanal A (Bot API/Business, `TelegramOutbox`, webhook) va
  Kanal B (MTProto userbot gramjs, `HrTelegramOutbox`, listener). Ikkovi ham kiruvchini
  `TelegramChat`/`TelegramChatMessage`ga yozadi.
- **Yuborishning haqiqiy yo'li = MTProto.** `notifyCounterparty` faol userbot bo'lsa
  DOIM MTProto'ni tanlaydi; Bot API fallback.
- **MTProto qatlami:** `HrTelegramAccount` (slot 1/2, shifrlangan session), `MtprotoWorkerService`
  (klient pool, flood failover, `resolveEntity`, `withTimeout`), `telegram-client-factory.ts`
  (`TelegramClientHandle` interfeysi), `gramjs-client.factory.ts` (yagona real gramjs fayl).
- **Thread:** `GET /telegram/counterparty/:id/thread` (`telegram.service.ts` `counterpartyThread`)
  `HrTelegramOutbox` + `TelegramChatMessage`ni qo'shadi. `OrderTelegramPanel` 10s poll.

## Fazalar (umumiy — hech narsa tashlanmaydi, faqat tartib)

| Faza | Nima |
|---|---|
| **1 — Poydevor (bu spec)** | To'liq tarix backfill + ishonchli doimiy sync + birlashgan saqlash modeli |
| **2 — Chiquvchi boyitish** | Fayl/rasm yuborish + reply/quote + shablonlar/tez-javob |
| **3 — Holat/presence** | O'qildi/yetkazildi (✓✓) + online/oxirgi-ko'rilgan |
| **4 — Rollout** | `counterparties/[id]` eski `TelegramChatCard`→yangi panel; 3 sahifada izchillik |

Faza-1 sxemasi Faza 2–3 maydonlarini (reply-to, read-status) oldindan nullable qo'shadi — churn'ni oldini olish uchun.

---

## Faza-1 dizayni

### 1. Saqlash modeli — yagona kanonik transkript

`TelegramChatMessage` = **yagona haqiqat manbasi** (butun ikki tomonlama transkript).
`iterMessages` backfill ikkala yo'nalishni ham qaytaradi (jumladan telefondan qo'lda
yozilgan). `HrTelegramOutbox` faqat **yetkazish navbati** bo'lib qoladi.

**Dedup:** yuborilgan outbox xabari keyin dialogda paydo bo'lib listener/backfill uni
`TelegramChatMessage`ga yozadi → dublikat. Yechim: outbox `telegramMessageId` ↔ message
`tgMessageId`. Panel transkript + faqat **yetkazilmagan** outbox (status≠sent yoki mos
`tgMessageId` yo'q) ko'rsatadi.

**Schema (additive/nullable, migration):**
- `TelegramChat`: `historyOldestId BigInt?`, `historyComplete Boolean @default(false)`, `syncNewestId BigInt?`.
- `TelegramChatMessage`: `replyToTgMessageId BigInt?`, `editedAt DateTime?`, `readByPeerAt DateTime?`
  (Faza-3, nullable), `outboxRefId String?`; `@@unique([chatRefId, tgMessageId])` (idempotent upsert).
- **Yangi `TelegramBackfillJob`:** `accountId, counterpartyId, phone, status ('queued'|'running'|'done'|'error'),
  requestedAt, startedAt?, finishedAt?, messagesImported Int @default(0), cursorOffsetId BigInt?, failReason?`;
  `@@unique([accountId, counterpartyId])`.

### 2. Backfill dvigateli (talab bo'yicha)

- **Trigger:** `POST /telegram/counterparty/:id/sync` — panel birinchi ochilganda
  (`historyOldestId=null`) chaqiradi → `TelegramBackfillJob` upsert (status='queued'). Idempotent.
- **Worker:** yangi `TelegramBackfillWorkerService` (`hr-telegram-bridge`), `@Cron ~20s`,
  **bir vaqtda bitta job**. Oqim: `resolveEntity` → `iterMessages(entity,{limit:100,offsetId:cursorOffsetId})`
  orqaga (yangi→eski) → har xabar: `TelegramChat` upsert + `TelegramChatMessage` insert (dedup) +
  media darhol yuklash (§6) + cursor yangilash → har tick'da N sahifa cap (klientni uzoq ushlamaslik),
  qolgani re-queue → dialog boshiga yetganda `historyComplete=true`, job='done'.
- **Flood:** `floodWaitUntil` hurmat, flood'da re-schedule.

### 3. Ishonchli oldinga sync (aynan «xabar saqlanmayapti» tuzatiladi)

- **Doimiy qabul-qiluvchi:** API boot'da (`OnModuleInit`) har faol `HrTelegramAccount` (2 slot)
  uchun ulangan klient + kiruvchi listener biriktiriladi — **send'ga bog'liq emas**. Uzilishda
  backoff reconnect. Kiruvchi → mavjud `TelegramService.handleIncoming` (bir xil jadval).
- **Catch-up xavfsizlik to'ri:** past-chastotali cron (~3–5 daq) cursorli chatlar uchun
  `getMessages(entity,{minId:syncNewestId})` — o'tkazib yuborilganini to'ldiradi, `syncNewestId`
  yangilaydi. Faqat bog'langan/faol chatlarga (targeted, flood-xavfsiz).
- *Trade-off:* doimiy userbot ulanishi real-time uchun zarur; beqaror bo'lsa catch-up-only fallback.
  Boshlang'ich = persistent + catch-up.

### 4. Thread endpoint refaktori + pagination

`counterpartyThread` kanonik transkriptni `TelegramChatMessage`dan o'qiydi (to'liq tarix →
**cursor-pagination** `?before=<id>&limit=`) + faqat yetkazilmagan `HrTelegramOutbox` overlay +
`TelegramBackfillJob` statusi. Outbox↔message dedup.

### 5. Panel UX (`OrderTelegramPanel`)

- Yuqorida backfill-status banneri («Tarix yuklanmoqda… N ta xabar» / «Kontakt topilmadi» / tayyor).
- Yuqoriga scroll → eski xabarlarni yuklash (infinite scroll-back).
- Birinchi ochishda sync yo'q bo'lsa `POST …/sync`.
- Yangi xabar uchun 10s poll saqlanadi.

### 6. Media (eski + jonli)

Backfill va jonli kiruvchida rasm/hujjat **darhol** `downloadMedia` → `Attachment` → `attachmentId`
(MTProto `file_reference` eskirgani uchun lazy ishonchsiz). Hajm-cap (juda katta video skip + belgilanadi).
`handleIncoming`ga mtproto media yuklash qo'shiladi.

### 7. Xatoliklarni boshqarish

Flood-wait → reschedule, urib turmaydi. · Entity topilmadi → job='error' (sabab), panel «raqam
topilmadi», backoff (cheksiz retry yo'q). · Media xato → attachmentsiz saqlash, bloklamaydi. ·
Dedup unique → upsert idempotent, qayta-yugurtirish xavfsiz. · Qabul-qiluvchi uzilishi → backoff
reconnect + health log.

### 8. Testlash (Faza-1 = strukturaviy, «runtime-unverified»)

- Unit: cursor/pagination (sof), dedup, outbox↔message moslash, media-kind map, flood-reschedule.
  Fake `TelegramClientHandle` (DI `TELEGRAM_CLIENT_FACTORY`). · Backfill FSM (queued→running→done/error)
  fake paged-client. · Thread endpoint: transkript+overlay+dedup+pagination.
- Gate: tc0·biome0·api+web Vitest regress yo'q. **Real userbot smoke = Faza-2 QA** (browser-smoke YO'Q).

### 9. Ko'lam chegarasi (Faza-1 YAGNI)

YO'Q: fayl-yuborish/reply/shablon (Faza-2), read-receipt/presence (Faza-3), counterparties
migratsiya (Faza-4). LEKIN sxema maydonlari (reply/read) hozir nullable qo'shiladi.
⚠️ **Parallel-sessiya (CLAUDE.md §6):** `hr-telegram-bridge` fayllariga boshqa sessiya tegayotgan
bo'lishi mumkin — factory interfeysiga metodlar **additiv** qo'shiladi, nomli fayllardan tashqariga tegilmaydi.

### 10. Asosiy fayl-touchpointlar

- `packages/db/prisma/schema.prisma` (+migration)
- `apps/api/src/modules/hr/hr-telegram-bridge/telegram-client-factory.ts` (interfeysga
  `iterMessages`/`getMessages`/`downloadMedia` additiv)
- `apps/api/src/modules/hr/hr-telegram-bridge/gramjs-client.factory.ts` (implement)
- **yangi** `apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.ts`
- `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts` (boot-listener)
- `apps/api/src/modules/telegram/telegram.service.ts` (`counterpartyThread` refaktor + mtproto media in `handleIncoming`)
- `apps/api/src/modules/telegram/telegram.controller.ts` (`/sync` + pagination)
- `apps/web/src/components/telegram/order-telegram-panel.tsx` (banner + scroll-back)

---

## Muvaffaqiyat mezoni (Faza-1)

1. Operator debts/[id] ochganda o'sha mijozning **butun** Telegram dialogi (ikki tomonlama,
   media bilan) paneled ko'rinadi — jumladan telefondan qo'lda yozilganlar.
2. Yangi kiruvchi xabar — birinchi chiquvchidan oldin ham — ishonchli saqlanadi.
3. Dublikat yo'q; qayta-sync idempotent; flood-wait hurmat qilinadi.
4. Gate yashil (tc/biome/Vitest regress yo'q). Natija halol «Phase-1, runtime-unverified» deb belgilanadi.
