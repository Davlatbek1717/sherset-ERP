# Telegram Video-Broadcast — dizayn spec (2026-07-20)

## Maqsad / kontekst
Egasi barcha mijozlarga (telefon raqami bor kontragentlar, ~1600) **bitta video +
izoh (caption)** yubormoqchi. Xabar egasining **shaxsiy Telegram raqami**dan (MTProto
userbot) ketadi. Hozir video yuborish imkoni umuman yo'q — faqat MATN (`sendMessage`).

Birinchi konkret tarqatma: `TAYYOR__sherset-kechki-smena_OVOZLI.mp4` (30.5 MB) +
"SHERSETDA KATTA YANGILIK" kechki-smena e'loni (qalin sarlavhalar + brend nomlari).

**Foydalanuvchi darvozasi (MAJBURIY):** avval egasining O'Z raqamiga TEST yuboriladi →
egasi aniq ko'rinishni ko'rib TASDIQLAYDI → shundan keyingina barchaga yuboriladi.

## Asosiy xavf va yumshatish
Shaxsiy raqamdan ~1600 ta ketma-ket video = Telegram **spam-blok** xavfi (raqam
bloklansa — barcha mijoz-chatlar + qarz-eslatma tizimi ishdan chiqadi). Yumshatish:
- Ketma-ket (bitta userbot slot), har yuborish orasida **3-6s + tasodifiy jitter**
- **FloodWait** ushlanadi → avtomatik pauza + keyin davom
- **Kunlik limit** (default 400/kun) — ixtiyoriy, qo'shimcha himoya
- Telegram'da bo'lmagan / resolve bo'lmagan raqam → "skipped", davom etadi
- **To'xtatib-davom** (resumable) — har mijoz holati saqlanadi
- UI'da aniq blok-xavfi ogohlantirishi + tasdiq

## Video: bir marta yuklash, qayta ishlatish
Video har mijozga QAYTA yuklanmaydi. Broadcast boshlanganda userbot videoni Telegram'ga
**bir marta** yuklaydi (Saved Messages'ga `sendFile`) va qaytadigan `InputDocument`
file-reference'ni oladi. Keyin har mijozga o'sha reference qayta-yuboriladi (tez, trafik
tejaladi). Reference eskirsa (rare) — qayta yuklanadi.

## Ma'lumotlar bazasi (2 yangi jadval)
### `telegram_broadcast`
`id, account_id, caption (TEXT), caption_format ('markdown-v2'|'plain'),
video_attachment_id (Attachment FK), tg_file_ref (JSON, reusable InputDocument),
status ('draft'|'uploading'|'sending'|'paused'|'done'|'failed'),
total, sent, failed, skipped, throttle_min_ms (default 3000), throttle_max_ms (6000),
daily_cap (nullable), created_by_id, created_at, started_at, finished_at`

### `telegram_broadcast_recipient`
`id, broadcast_id (FK, cascade), account_id, counterparty_id, phone,
status ('pending'|'sent'|'failed'|'skipped'), error (nullable), sent_at`
`@@unique([broadcast_id, counterparty_id])`, `@@index([broadcast_id, status])`

Migratsiya additive (CREATE TABLE lar) — xavfsiz.

## Yangi kod
### 1. GramJS `sendVideo` (gramjs-client.factory + telegram-client-factory interfeys)
- `uploadVideoOnce(buffer, filename, mime) → tgFileRef` — Saved Messages'ga `sendFile`,
  `Api.InputMediaUploadedDocument` (video atributlari: supportsStreaming), file-ref qaytaradi
- `sendVideoToPeer(phone, tgFileRef, caption, format) → {ok, error}` — resolvePhone → `sendFile`
  peer'ga, caption bilan (MarkdownV2 parse `format==='markdown-v2'`)
- Mavjud flood/slot infra ishlatiladi (mtproto-worker naqshi)

### 2. Broadcast worker (`telegram-broadcast-worker.service.ts`, mavjud outbox-worker naqshi)
- `@Cron` (masalan har 10s) — 'sending' holatdagi broadcast'ni oladi
- Video hali yuklanmagan bo'lsa → yuklaydi (status 'uploading'→'sending')
- Keyingi 'pending' recipient'ni oladi (kunlik limit + throttle hisobga olib)
- resolvePhone → sendVideoToPeer → status yangilaydi (sent/failed/skipped)
- FloodWait → broadcast 'paused', floodWaitUntil belgilanadi, keyin davom
- Hammasi tugasa → 'done'

### 3. API (`telegram-broadcast` moduli)
- `POST /telegram-broadcast` — {caption, format, videoBase64/attachmentId, dailyCap?} →
  broadcast yaratadi, telefon-raqamli barcha kontragentlarni recipient qatorlariga yozadi (pending), 'draft'
- `POST /:id/test` — {phone} → FAQAT shu raqamga darhol yuboradi (preview darvozasi), broadcast'ni ishga tushirmaydi
- `POST /:id/start` — status 'sending' (worker davom etadi)
- `POST /:id/pause`, `POST /:id/stop`
- `GET /:id` — progress (total/sent/failed/skipped/status)
- `GET /telegram-broadcast` — ro'yxat

### 4. Video saqlash
- **Faza 1 (shu tarqatma):** video VPS diskiga qo'yiladi (`/root/broadcast/…mp4`),
  broadcast row `video_path` saqlaydi. Userbot bir marta diskdan yuklaydi → `tg_file_ref`.
  Attachment blob-store SHART EMAS (10MB limit muammosi chetlab o'tiladi).
- **Faza 2 (UI upload):** modaldan yuklangan video attachment-store (limit 60MB) yoki diskka.

## Frontend (Faza 2 — keyin)
Sozlamalar → Integratsiyalar → **"Telegram tarqatma"**: video yuklash (≤50MB), izoh
(ixtiyoriy `{ism}` o'zgaruvchi), auditoriya soni, **ogohlantirish + tasdiq**, "Test yubor
(raqam)" tugmasi, "Barchaga yuborish", jonli progress.

## Bosqichlar
- **Faza 1 (birinchi, shu tarqatma uchun):** DB + sendVideo + worker + API (test + start).
  Deploy → egasining raqamiga TEST → tasdiq → barchaga broadcast. (UI'siz, API/skript orqali.)
- **Faza 2:** frontend modal (self-service).

## Verifikatsiya
- typecheck (api+web) · biome · yangi util'lar uchun unit-test (sendVideo caption formatlash,
  worker throttle/skip mantiq)
- Migratsiya additive — xavfsiz
- Deploy: migrate → API restart → test-send → egasi tasdiqlaydi → broadcast
- Broadcast paytida progress kuzatiladi; FloodWait/skip to'g'ri ishlashini tekshirish
