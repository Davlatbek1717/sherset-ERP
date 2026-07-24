# HR Davomat → Telegram bildirishnoma (Direktor Saqlangan xabarlari) — Dizayn

- **Sana:** 2026-07-25
- **Holati:** Tasdiqlangan (dizayn), implementatsiya kutmoqda
- **Muallif:** Claude (Opus) + operator
- **Bog'liq:** `2026-07-24-hr-timepay-attendance-core-design.md` (davomat yadrosi), `2026-07-23-hr-gps-attendance-design.md` (GPS)

---

## 1. Kontekst va muammo

Har bir xodim **"Keldim"** (check-in) yoki **"Ketdim"** (check-out) tugmasini bosganida,
korxona rahbari (direktor) real vaqtda xabardor bo'lishni xohlaydi. Xabar direktorning
**Telegram "Saqlangan xabarlar"** chatiga kelishi kerak va quyidagilarni o'z ichiga olishi:

- xodim kim,
- keldi yoki ketdi,
- **soat nechida** (Asia/Tashkent),
- **kechikish** (agar bo'lsa),
- **jarima** (agar sozlangan qoida bo'yicha qo'llanilsa),
- bo'lim/lavozim (kontekst).

## 2. Muhim kashfiyot — infra ALLAQACHON mavjud

Bu feature **noldan qurilmaydi**. Mavjud qismlar (verifikatsiya qilingan, real fayllar):

| Mavjud komponent | Fayl | Roli |
|---|---|---|
| `HrAdminNotifier` | `hr-telegram-bridge/hr-admin-notifier.service.ts` | **Naqsh** — event-driven, out-of-band, xatolar yutiladi, asosiy oqimni buzmaydi (task bonus/jarimani adminga yuboradi) |
| `HrAttendanceService` | `attendance/hr-attendance.service.ts` | `checkIn` / `checkOut` / `checkOutByEmployee` — barcha "keldi/ketdi" yo'llari |
| `PingIngestService` | `attendance-geo/ping-ingest.service.ts` | Auto-GPS check-in/out |
| `lateMinutesForShift` / `resolveShift` | `attendance-geo/resolve-shift.util.ts` | **Kechikish allaqachon hisoblanadi** har check-in'da |
| `HrBonusFineLog` / `HrBonusFineRule` | `hr-bonus-fine/*` | **Jarima ledger** (kind=bonus/fine, amountMinor, source) |
| `HrTelegramAccount` + `HrTelegramLoginService` | `hr-telegram-account/*` | MTProto akkаunt login sehrgari (telefon→OTP→2FA), session **shifrlangan** saqlanadi |
| `HrTelegramOutbox` + `HrTelegramOutboxWorker` | `hr-telegram-bridge/*` | Yuborish navbati (5s cron, retry-backoff + FLOOD_WAIT himoya) |
| gramjs handle | `hr-telegram-bridge/gramjs-client.factory.ts` | `sendMessage(entity, text)`; **`'me'` = Saqlangan xabarlar** (uploadVideoToSelf `sendFile('me')` bilan tasdiqlangan) |
| `crypto.util` | `hr-shared/crypto.util.ts` | `encryptHrSession` / `decryptHrSession` |
| `@nestjs/event-emitter` + `HR_EVENT` | `hr-shared/hr-events.types.ts` | Domain event infratuzilmasi |

**Xulosa:** ish = shu bloklarni **davomatga ulash** + kichik kengaytmalar.

## 3. Maqsad va qamrov (scope)

### Qamrovда (in-scope)
1. Davomat check-in/check-out'da domain event chiqarish (barcha yo'llar: qo'lda + auto-GPS).
2. Sozlanadigan **avto-jarima qoidasi** (kechikish → jarima ledger), yoqib/o'chiriladi.
3. Direktorning **Saqlangan xabarlariga** o'zbekcha bildirishnoma (keldi/ketdi + vaqt + kechikish + jarima + bo'lim).
4. Yetkazish: direktorning **O'Z MTProto akkаunti** orqali `'me'`ga (botsiz).
5. Admin UI: yoqish/o'chirish, jarima-qoida sozlamalari, direktor Telegram login, "Test xabar".

### Qamrovдan tashqari (non-goals)
- Ko'p direktor / ko'p kanal marshrutlash (hozircha bitta direktor sloti).
- Bot yo'li (foydalanuvchi aniq "botsiz, Saqlangan xabarlar" tanladi).
- Davomatning boshqa hodisalari (kech qolish ogohlantirishi, kunlik hisobot digest) — kelajak.
- Multi-instance login sehrgari holati (mavjud in-memory yechim solo-admin uchun yetarli).

## 4. Arxitektura umumiy ko'rinishi

```
Xodim "Keldim"/"Ketdim"  (web modal · /davomat kiosk · auto-GPS ping)
        │
        ▼
HrAttendanceService.checkIn/checkOut  ·  PingIngestService   ← barcha yo'llar shu servis qatlamiga keladi
        │  emit HR_ATTENDANCE_CHECKED_IN / _OUT   (EventEmitter2)
        ▼
HrAttendanceNotifier   @OnEvent(async)   ← out-of-band; butun tanasi try/catch, xato YUTILADI
        │   1) avto-jarima qo'llash (idempotent, config yoqilган bo'lsa)
        │   2) o'zbekcha Markdown xabar tuzish (vaqt · kechikish · jarima · bo'lim)
        │   3) HrTelegramOutbox'ga qator qo'yish  { toSelf:true, viaSlot: directorSlot }
        ▼
HrTelegramOutboxWorker  (mavjud, 5s cron, retry + flood)
        │
        ▼
gramjs (direktor sloti)  →  sendMessage('me', text)  →  Direktor Saqlangan xabarlari
```

**Asosiy prinsip (HrAdminNotifier 1:1):** notifier hech qachon check-in oqimini buzmaydi.
Event `{ async: true }`, handler tanasi to'liq `try/catch`, barcha xatolar `logger.warn` bilan yutiladi.

## 5. Ma'lumotlar modeli (schema o'zgarishlari)

### 5.1 Yangi: `HrAttendanceNotifyConfig` (akkаunt bo'yicha bitta)
```prisma
model HrAttendanceNotifyConfig {
  id                  String   @id @default(uuid()) @db.Uuid
  accountId           String   @unique @map("account_id") @db.Uuid
  enabled             Boolean  @default(false)              // umumiy yoqish
  notifyCheckIn       Boolean  @default(true)
  notifyCheckOut      Boolean  @default(true)
  directorSlot        Int?     @map("director_slot")        // qaysi HrTelegramAccount sloti = direktor (self-send)
  // Avto-jarima qoidasi (kechikish):
  lateFineEnabled     Boolean  @default(false) @map("late_fine_enabled")
  lateThresholdMin    Int      @default(15)    @map("late_threshold_min")   // shu daqiqadan oshsa jarima
  lateFineAmountMinor BigInt   @default(0)     @map("late_fine_amount_minor") // tiyin
  lateFinePerMinute   Boolean  @default(false) @map("late_fine_per_minute")  // true=daqiqasiga, false=qat'iy
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt           DateTime @updatedAt      @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@map("hr_attendance_notify_config")
}
```

### 5.2 `HrBonusFineLog` — kengaytirish (idempotent avto-jarima)
```prisma
// qo'shiladi:
attendanceId String? @map("attendance_id") @db.Uuid   // auto_late jarima qaysi davomat qatoriga bog'liq
// + partial unique: bir check-in'ga ko'pi bilan bitta auto_late jarima
@@unique([attendanceId, source], name: "uq_bonusfine_attendance_source")
```
- `source` yangi qiymat: **`auto_late`** (mavjud `manual`/`rule`/`auto_task`/`auto_expire` yoniga).
- Idempotency: notifier ikki marta ishlasa ham (event qayta) — `attendanceId+source` unique jarimani dublikatlamaydi.

### 5.3 `HrTelegramOutbox` — kengaytirish (self / Saqlangan xabarlar)
```prisma
// qo'shiladi:
toSelf  Boolean @default(false) @map("to_self")   // true → 'me' (Saqlangan xabarlar)
viaSlot Int?    @map("via_slot")                  // self-send majburiy slot (direktor)
// `toPhone` endi nullable bo'ladi (toSelf=true bo'lsa yo'q):
toPhone String? @map("to_phone") @db.VarChar(20)
```
> Migratsiya eslatmasi: `toPhone` NOT NULL → nullable — mavjud qatorlar buzilmaydi. Lokal DB
> `climart_adopt` (tracked emas, 5432) da migratsiya yaratiladi; prod'да `migrate deploy`.

## 6. Eventlar

`hr-shared/hr-events.types.ts`ga:
```ts
HR_EVENT.HR_ATTENDANCE_CHECKED_IN  = 'hr.attendance.checked_in'
HR_EVENT.HR_ATTENDANCE_CHECKED_OUT = 'hr.attendance.checked_out'

interface HrAttendanceCheckedInEvent  { accountId; attendanceId; employeeId; at: Date; lateMinutes: number }
interface HrAttendanceCheckedOutEvent { accountId; attendanceId; employeeId; at: Date; }
```

Chiqarish (`EventEmitter2` inject qilinadi):
- `HrAttendanceService.checkIn` — create'dan keyin `HR_ATTENDANCE_CHECKED_IN`.
- `HrAttendanceService.checkOut` / `checkOutByEmployee` — update'dan keyin `HR_ATTENDANCE_CHECKED_OUT`.
- `PingIngestService` — auto-GPS check-in/out yaratganда/yopganда shu eventlar.
- Event **transaksiyadan keyin** (commit bo'lgach) chiqariladi — notifier yozuvni o'qiy olishi kafolatlanadi.

## 7. Avto-jarima (kechikish → ledger)

`HrAttendanceNotifier.onCheckedIn` ichida (yoki ajratilgan `HrLateFineService`da):
1. `HrAttendanceNotifyConfig` o'qiladi. `lateFineEnabled=false` → jarima yo'q, faqat kechikish ko'rsatiladi.
2. `lateMinutes > lateThresholdMin` bo'lsa:
   - miqdor = `lateFinePerMinute ? lateFineAmountMinor * (lateMinutes) : lateFineAmountMinor` (qat'iy yoki daqiqasiga).
   - `HrBonusFineLog` yaratiladi: `kind='fine'`, `source='auto_late'`, `attendanceId`, `employeeName` snapshot, `reason` = `"Kechikish {lateMinutes} daq"`.
   - Idempotent (`@@unique([attendanceId, source])`) — takror event dublikatlamaydi.
3. Jarima miqdori xabarga qo'shiladi.

> Bu mavjud `hr-bonus-fine` ledgeriga yoziladi — oylik/hisobotда avtomatik ko'rinadi (integratsiya bepul).

## 8. Xabar formati (o'zbekcha, mavjud emoji-Markdown uslub)

`fmtAmount` (`formatMinor` — tiyin→"10 000 so'm"), `formatInTimeZone(HR_TZ, 'HH:mm')`.

**Keldi:**
```
✅ *Keldi* — Aziz Karimov
🕐 09:15   ⏰ 15 daqiqa kechikdi
💰 Jarima: 10 000 so'm
🏢 Sotuv bo'limi · Sotuvchi
```
- Kechikish 0 bo'lsa `⏰` qatori tushiriladi; jarima 0/yo'q bo'lsa `💰` qatori tushiriladi.

**Ketdi:**
```
🚪 *Ketdi* — Aziz Karimov
🕐 18:05   ⏱ Bugun ishlaган: 8s 50d
```
- "Bugun ishlaган" = shu kungi check-in'lardan checkOut'gача yig'indi (mavjud `aggregateEmployeeDay` yordamида).

## 9. Yetkazish — Saqlangan xabarlar (MTProto, botsiz)

### 9.1 Direktor akkаunti = maxsus slot
- Direktor (`Sherzod Muhammedov`) Telegram akkаunti `HrTelegramAccount` sifatida **maxsus slotда** (masalan `slot=3`, mavjud 1/2 xizmat slotlariga tegmasdan) login qilinadi.
- Login: mavjud `HrTelegramLoginService` (`start` → OTP → `submitCode` → 2FA). Session `sessionEncrypted`da shifrlangan.
- `HrAttendanceNotifyConfig.directorSlot = 3`.

### 9.2 Outbox `'me'` yuborish
- Notifier qator qo'yadi: `{ accountId, toSelf:true, viaSlot: directorSlot, messageText, sourceEventType:'attendance.check_in'|'check_out', employeeId }`.
- `MtprotoSendOptions`ga `toSelf?: boolean` + `viaSlot?: number` qo'shiladi.
- gramjs adapter: `toSelf` bo'lsa → `viaSlot` mijoz-clientini oladi → `handle.sendMessage('me', text)` (customer `toPhone` resolve'ni chetlab o'tadi).
- Worker FSM (pending→sent/retry/failed), flood-himoya — **o'zgarmaydi**, faqat adapter self-branch qo'shiladi.

### 9.3 Nega bot emas (halol, muqarrar shart)
- **Faqat akkаuntning O'ZI o'zining Saqlangan xabarlariga yoza oladi.** Shuning uchun direktor
  akkаunti serverга login bo'lishi SHART (telefon + SMS kod + 2FA parol, agar bor bo'lsa).
- Setup uchun kerak: **Sherzod'ning telefon raqami** (user ID `173049511` emas — u faqat bot yo'lida kerak edi).
- Xavfsizlik qarzi: direktor Telegram sessiyasi serverда saqlanadi (shifrlangan, lekin to'liq
  akkаunt kirishi). Bu — "botsiz Saqlangan xabarlar" tanlovining muqarrar narxi; hujjatlanadi.

## 10. UI (admin sozlama sahifasi)

`apps/web/src/app/(app)/hr/settings/` (yoki davomat sozlama bo'limi):
- **Yoqish** toggle (`enabled`) + `notifyCheckIn` / `notifyCheckOut`.
- **Avto-jarima:** `lateFineEnabled` toggle, `lateThresholdMin`, `lateFineAmountMinor` (so'mда kiritish→tiyin), `lateFinePerMinute` tanlov.
- **Direktor Telegram:** mavjud login-modal oqimini qayta ishlatib, direktor akkаuntini slotга login qilish; ulanish holati (`isActive`, `lastConnectedAt`).
- **Test xabar** tugmasi → darhol `'me'`ga test yuboradi (sozlama to'g'riligini tasdiqlaydi).
- i18n: `messages/{ru,uz}.json` — barcha yangi kalitlar (key-existence gate).

## 11. Xatolik boshqaruvi va kafolatlar

- **Out-of-band:** notifier `@OnEvent({ async:true, promisify:true })`, tanasi to'liq `try/catch` — check-in HECH QACHON buzilmaydi (HrAdminNotifier §13.12 naqshi).
- **Idempotency:** avto-jarima `@@unique([attendanceId, source])`; outbox qator `sourceDocId=attendanceId` + `sourceEventType` bo'yicha dedup tekshiruvi (bir davomatga bir xabar).
- **Sozlanmagan holat:** `enabled=false` yoki `directorSlot=null` yoki slot login bo'lmagan → notifier **no-op** (warn), xato yo'q (Noop-adapter naqshi).
- **Flood/retry:** mavjud outbox FSM (3 retry, FLOOD_WAIT slot-pauza) o'zgarmasdan ishlaydi.

## 12. Test strategiyasi (co-located `.test.ts`)

- `message-builder`: keldi/ketdi matnlari (kechikish bor/yo'q, jarima bor/yo'q, bo'lim yo'q holatlari).
- `late-fine`: chegara ostida→jarima yo'q; ustида→to'g'ri miqdor (qat'iy va daqiqasiga); idempotency (ikki marta→bitta).
- `event-emission`: checkIn/checkOut event chiqaradimi (EventEmitter2 stub).
- `notifier`: config o'chiq→no-op; yoqiq→outbox qatori to'g'ri (`toSelf`, `viaSlot`); handler **hech qachon throw qilmaydi** (xato yutiladi).
- `outbox-self`: adapter stub bilan `toSelf` branch `'me'`ga yuboradi.
- Gate: typecheck 0 · biome 0 · i18n key-existence (ru+uz) · tegishli Vitest.

## 13. Fazalar (build tartibi — har biri commit + gate)

1. **Schema + config:** `HrAttendanceNotifyConfig` model, `HrBonusFineLog.attendanceId`+unique, `HrTelegramOutbox.toSelf/viaSlot/toPhone?` + migration (lokal `climart_adopt`) + `hr-attendance-notify` CRUD service/controller.
2. **Eventlar:** `HR_ATTENDANCE_CHECKED_IN/_OUT` tiplar + `HrAttendanceService` va `PingIngestService`da emit (unit-test).
3. **Avto-jarima:** `HrLateFineService` (config → ledger, idempotent) + testlar.
4. **Notifier + outbox self:** `HrAttendanceNotifier` (@OnEvent → jarima → xabar → outbox), `MtprotoAdapter.sendMessage` self-branch, gramjs `'me'` + testlar.
5. **UI:** sozlama sahifasi + direktor login qayta-ishlatish + Test tugma + i18n.

Har faza **Phase-1 (strukturaviy, runtime-tasdiqlanmagan)** deb belgilanadi; runtime QA (real Telegram + brauzer) alohida Phase-2 QA sessiyasida.

## 14. Ochiq savollar / setup talablari

1. **Sherzod'ning telefon raqami** — direktor akkаunt login uchun (implementatsiya/setup vaqtida).
2. **api_id / api_hash** — mavjud xizmat slotlaridan qayta ishlatiladi (bir Telegram-app cred istalgan akkаuntni login qiladi). Tasdiqlash kerak: mavjud `HrTelegramAccount` cred'lari borми.
3. Jarima **standart miqdori/chegarasi** — dastlabki qiymatlar (masalan >15 daq = 10 000 so'm) UI'да tahrirlanadi; boshlang'ich default sifatida qo'yiladi.
