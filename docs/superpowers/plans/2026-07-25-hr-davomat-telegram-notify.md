# HR Davomat → Telegram bildirishnoma — Implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xodim "Keldim"/"Ketdim" bosganда direktorning Telegram Saqlangan xabarlariga (botsiz, MTProto `'me'`) vaqt + kechikish + jarima bilan bildirishnoma yuborish.

**Architecture:** Davomat servisi domain event chiqaradi → `HrAttendanceNotifier` (out-of-band, xatolar yutiladi) avto-jarima qo'llaydi + o'zbekcha xabar tuzadi + `HrTelegramOutbox`ga qator qo'yadi → mavjud outbox worker gramjs `sendMessage('me')` orqali direktor sloti bilan yuboradi.

**Tech Stack:** NestJS + Prisma (@moysklad/db) + @nestjs/event-emitter + gramjs (telegram MTProto) + Vitest + Next.js (web) + next-intl (i18n).

## Global Constraints

- **Model:** OPUS (flagship) — Sonnet EMAS (CLAUDE.md §0). Mexanik ish uchun avval deterministik script.
- **Til:** o'zbekcha (foydalanuvchi-yuzli matn) — kod izohlari bilingual (uslubga mos).
- **TZ:** `HR_TZ = 'Asia/Tashkent'` (`hr-shared/tz.util.ts`), vaqt `formatInTimeZone`.
- **Pul:** tiyin (BigInt) `amountMinor`; ko'rsatish `formatMinor` (`hr-bonus-fine/template-render.util.ts`).
- **Out-of-band kafolat:** notifier `@OnEvent({ async:true, promisify:true })`, tanasi to'liq `try/catch`, xato `logger.warn` bilan yutiladi — check-in HECH QACHON buzilmaydi (`HrAdminNotifier` §13.12 naqshi).
- **DB:** lokal `climart_adopt` @ `localhost:5432` (tracked emas, pg_trgm yo'q, psql yo'q — migratsiya `pnpm --filter @moysklad/db migrate` bilan). Prod: `migrate deploy`.
- **Gate (har task oxirida):** `pnpm typecheck` 0 · `pnpm lint` (biome) 0 · i18n key-existence (ru+uz) · tegishli Vitest.
- **Git:** `git add <aniq fayllar>` (§6, `git add -A` TAQIQ). Commit oxiri: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **PII:** direktor telefon raqamini kod/git'ga YOZMA — u login sehrgariga runtime kiritiladi.
- **Status yorlig'i:** har task **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»** (real Telegram QA alohida).

---

## Fayl xaritasi

**API (yangi modul `hr-attendance-notify/`):**
- `apps/api/src/modules/hr/hr-attendance-notify/hr-attendance-notify.schema.ts` — zod config DTO
- `.../hr-attendance-notify.service.ts` — config CRUD (get/upsert) + test-send
- `.../hr-attendance-notify.controller.ts` — REST
- `.../hr-attendance-notify.module.ts`
- `.../late-fine.service.ts` — kechikish → ledger (idempotent)
- `.../attendance-notifier.service.ts` — @OnEvent → jarima → xabar → outbox
- `.../attendance-message.util.ts` — sof matn-tuzuvchi (test qilinadigan)
- co-located `*.test.ts`

**API (mavjud fayllarга o'zgartirish):**
- `apps/api/src/modules/hr/hr-shared/hr-events.types.ts` — yangi eventlar
- `apps/api/src/modules/hr/attendance/hr-attendance.service.ts` — emit
- `apps/api/src/modules/hr/attendance-geo/ping-ingest.service.ts` — emit
- `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-adapter.ts` — `MtprotoSendOptions` kengaytmasi
- `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts:167` — `sendMessage` self-branch
- `apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-outbox-worker.service.ts:86` — `toSelf/viaSlot` uzatish
- `apps/api/src/modules/hr/hr.module.ts` — yangi modul ro'yxatga
- `packages/db/prisma/schema.prisma` — modellar

**Web:**
- `apps/web/src/app/(app)/hr/settings/` — sozlama UI (yangi bo'lim)
- `apps/web/src/lib/hr-api.ts` — API klient
- `apps/web/src/messages/{ru,uz}.json` — i18n

---

## FAZA 1 — Schema + config CRUD

### Task 1: Schema o'zgarishlari + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create (generated): `packages/db/prisma/migrations/<ts>_hr_attendance_notify/migration.sql`

**Interfaces:**
- Produces: `HrAttendanceNotifyConfig`, `HrBonusFineLog.attendanceId`, `HrTelegramOutbox.toSelf/viaSlot`, `toPhone?`.

- [ ] **Step 1: Modellarni qo'shish** — `schema.prisma`ga:

```prisma
model HrAttendanceNotifyConfig {
  id                  String   @id @default(uuid()) @db.Uuid
  accountId           String   @unique @map("account_id") @db.Uuid
  enabled             Boolean  @default(false)
  notifyCheckIn       Boolean  @default(true) @map("notify_check_in")
  notifyCheckOut      Boolean  @default(true) @map("notify_check_out")
  directorSlot        Int?     @map("director_slot")
  lateFineEnabled     Boolean  @default(false) @map("late_fine_enabled")
  lateThresholdMin    Int      @default(15)    @map("late_threshold_min")
  lateFineAmountMinor BigInt   @default(0)     @map("late_fine_amount_minor")
  lateFinePerMinute   Boolean  @default(false) @map("late_fine_per_minute")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt           DateTime @updatedAt      @map("updated_at") @db.Timestamptz()
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@map("hr_attendance_notify_config")
}
```
`HrBonusFineLog`ga: `attendanceId String? @map("attendance_id") @db.Uuid` + `@@unique([attendanceId, source], name: "uq_bonusfine_attendance_source")`.
`HrTelegramOutbox`: `toPhone`ni `String?` qil; qo'sh `toSelf Boolean @default(false) @map("to_self")` + `viaSlot Int? @map("via_slot")`.
`Account` modeliga relation qatori: `hrAttendanceNotifyConfig HrAttendanceNotifyConfig?`.

- [ ] **Step 2: Migration yaratish**

Run: `pnpm --filter @moysklad/db migrate -- --name hr_attendance_notify`
Expected: yangi migration papkasi + `HrAttendanceNotifyConfig` jadvali, ustunlar qo'shildi. `toPhone` NULL bo'lishiga ruxsat (mavjud qatorlar buzilmaydi).

- [ ] **Step 3: Prisma client regen + typecheck**

Run: `pnpm --filter @moysklad/db build && pnpm --filter @moysklad/api typecheck`
Expected: PASS (yangi tiplar mavjud).

- [ ] **Step 4: Commit**
```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(hr): davomat-notify config + auto_late fine + outbox self schema"
```

### Task 2: Config CRUD service + controller

**Files:**
- Create: `apps/api/src/modules/hr/hr-attendance-notify/hr-attendance-notify.schema.ts`
- Create: `apps/api/src/modules/hr/hr-attendance-notify/hr-attendance-notify.service.ts`
- Create: `.../hr-attendance-notify.controller.ts`, `.../hr-attendance-notify.module.ts`
- Test: `.../hr-attendance-notify.service.test.ts`
- Modify: `apps/api/src/modules/hr/hr.module.ts` (import modul)

**Interfaces:**
- Consumes: `PrismaService`, `HrPermissionGuard`, `RequireHrPermission('employees','full')` (mavjud, `hr-attendance.controller.ts` naqshi).
- Produces: `HrAttendanceNotifyService.getConfig(accountId)`, `.upsertConfig(accountId, dto)`, `.sendTest(accountId)`.

- [ ] **Step 1: Failing test** (`hr-attendance-notify.service.test.ts`):
```ts
it('upsert creates then updates single per-account config', async () => {
  const svc = new HrAttendanceNotifyService(prisma);
  const a = await svc.upsertConfig(ACC, { enabled: true, lateFineEnabled: true, lateThresholdMin: 10, lateFineAmountMinor: '5000' });
  expect(a.enabled).toBe(true);
  const b = await svc.upsertConfig(ACC, { lateThresholdMin: 20 });
  expect(b.lateThresholdMin).toBe(20);
  expect(b.id).toBe(a.id); // upsert, not duplicate
});
```
- [ ] **Step 2: Run → FAIL** (`vitest run hr-attendance-notify.service.test.ts`).
- [ ] **Step 3: Zod DTO** (`hr-attendance-notify.schema.ts`): `UpsertNotifyConfigSchema` — barcha maydonlar `.optional()`, `lateFineAmountMinor` string→BigInt, `lateThresholdMin` int ≥0, `directorSlot` int nullable.
- [ ] **Step 4: Service** — `getConfig` (yo'q bo'lsa default qaytaradi), `upsertConfig` (`prisma.client.hrAttendanceNotifyConfig.upsert` by `accountId`), `sendTest` (Task 9'da to'ldiriladi — hozircha stub `{ ok:false, reason:'not_wired' }`).
- [ ] **Step 5: Controller** — `GET /hr/attendance-notify/config`, `PUT /hr/attendance-notify/config`, `POST /hr/attendance-notify/test` — `RequireHrPermission('employees','full')`, `hr-attendance.controller.ts` naqshi (JwtAuthGuard+HrPermissionGuard, CurrentUser).
- [ ] **Step 6: Module + ro'yxatga** — `HrAttendanceNotifyModule` (providers: service; controllers: controller; imports: PrismaModule) → `hr.module.ts` imports'ga qo'sh.
- [ ] **Step 7: Run → PASS** + `pnpm --filter @moysklad/api typecheck`.
- [ ] **Step 8: Commit**
```bash
git add apps/api/src/modules/hr/hr-attendance-notify apps/api/src/modules/hr/hr.module.ts
git commit -m "feat(hr): davomat-notify config CRUD (get/upsert/test-stub)"
```

---

## FAZA 2 — Domain eventlar

### Task 3: Event tiplari + emit (qo'lda check-in/out)

**Files:**
- Modify: `apps/api/src/modules/hr/hr-shared/hr-events.types.ts`
- Modify: `apps/api/src/modules/hr/attendance/hr-attendance.service.ts`
- Test: `apps/api/src/modules/hr/attendance/hr-attendance.service.test.ts` (mavjud — qo'shiladi)

**Interfaces:**
- Produces: `HR_EVENT.HR_ATTENDANCE_CHECKED_IN`, `HR_EVENT.HR_ATTENDANCE_CHECKED_OUT`; `HrAttendanceCheckedInEvent { accountId; attendanceId; employeeId; at: Date; lateMinutes: number }`; `HrAttendanceCheckedOutEvent { accountId; attendanceId; employeeId; at: Date }`.

- [ ] **Step 1: Failing test** — checkIn muvaffaqiyatли create'dan keyin `eventEmitter.emit(HR_EVENT.HR_ATTENDANCE_CHECKED_IN, {...})` chaqirilishini stub bilan tekshir:
```ts
it('checkIn emits HR_ATTENDANCE_CHECKED_IN with lateMinutes', async () => {
  const emit = vi.fn();
  const svc = new HrAttendanceService(prisma, { emit } as any);
  const row = await svc.checkIn(ACC, { employeeId: EMP });
  expect(emit).toHaveBeenCalledWith('hr.attendance.checked_in',
    expect.objectContaining({ accountId: ACC, employeeId: EMP, attendanceId: row.id }));
});
```
- [ ] **Step 2: Run → FAIL** (constructor 2-arg emas).
- [ ] **Step 3: Event tiplari** — `hr-events.types.ts`ga `HR_EVENT`ga 2 kalit + 2 interface (yuqoridagi Produces).
- [ ] **Step 4: Emit** — `HrAttendanceService` konstruktoriga `@Inject(EventEmitter2) private readonly events: EventEmitter2` qo'sh; `checkIn` return'дан oldin `this.events.emit(HR_EVENT.HR_ATTENDANCE_CHECKED_IN, { accountId, attendanceId: created.id, employeeId: input.employeeId, at, lateMinutes })`. `checkOut`/`checkOutByEmployee` da `_OUT` (lateMinutes'siz). `EventEmitterModule` mavjud (hr-events.module.ts) — import tasdiqla.
- [ ] **Step 5: Run → PASS** + typecheck.
- [ ] **Step 6: Commit**
```bash
git add apps/api/src/modules/hr/hr-shared/hr-events.types.ts apps/api/src/modules/hr/attendance
git commit -m "feat(hr): emit attendance checked_in/out domain events (manual path)"
```

### Task 4: Emit auto-GPS (ping-ingest)

**Files:**
- Modify: `apps/api/src/modules/hr/attendance-geo/ping-ingest.service.ts`
- Test: `apps/api/src/modules/hr/attendance-geo/ping-ingest.service.test.ts`

- [ ] **Step 1: Failing test** — auto check-in yaratganда `_IN`, auto check-out yopganда `_OUT` emit qilinishini tekshir (emit stub). *(Avval `ping-ingest.service.ts`ni o'qib, aynan qaysi joyda `hrAttendance.create`/`update` bo'lishini top.)*
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Emit** — `EventEmitter2` inject + create/close nuqtalarida `HR_ATTENDANCE_CHECKED_IN/_OUT` emit (lateMinutes ping-yozuvidan yoki `lateMinutesForShift` bilan).
- [ ] **Step 4: Run → PASS** + typecheck.
- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/hr/attendance-geo/ping-ingest.service.ts apps/api/src/modules/hr/attendance-geo/ping-ingest.service.test.ts
git commit -m "feat(hr): emit attendance events from auto-GPS ping-ingest"
```

---

## FAZA 3 — Avto-jarima (kechikish → ledger)

### Task 5: `LateFineService`

**Files:**
- Create: `apps/api/src/modules/hr/hr-attendance-notify/late-fine.service.ts`
- Test: `.../late-fine.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`; `HrAttendanceNotifyConfig`; `HrBonusFineLog`.
- Produces: `LateFineService.applyIfLate({ accountId, attendanceId, employeeId, employeeName, lateMinutes }): Promise<bigint>` — yozilgan jarima tiyin (0 = yo'q). Idempotent.

- [ ] **Step 1: Failing tests:**
```ts
it('no config or disabled → 0, no ledger row', async () => {
  expect(await svc.applyIfLate({ accountId:ACC, attendanceId:A, employeeId:E, employeeName:'X', lateMinutes:30 })).toBe(0n);
});
it('flat fine when late > threshold', async () => {
  await cfg({ lateFineEnabled:true, lateThresholdMin:15, lateFineAmountMinor:10000n, lateFinePerMinute:false });
  expect(await svc.applyIfLate({ ...base, lateMinutes:20 })).toBe(10000n);
});
it('per-minute fine = amount * lateMinutes', async () => {
  await cfg({ lateFineEnabled:true, lateThresholdMin:0, lateFineAmountMinor:500n, lateFinePerMinute:true });
  expect(await svc.applyIfLate({ ...base, lateMinutes:12 })).toBe(6000n);
});
it('idempotent — twice yields one ledger row', async () => {
  await cfg({ lateFineEnabled:true, lateThresholdMin:0, lateFineAmountMinor:1000n });
  await svc.applyIfLate({ ...base, lateMinutes:5 });
  await svc.applyIfLate({ ...base, lateMinutes:5 });
  expect(await prisma.client.hrBonusFineLog.count({ where:{ attendanceId:A, source:'auto_late' }})).toBe(1);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement:**
```ts
async applyIfLate(i: LateFineInput): Promise<bigint> {
  const cfg = await this.prisma.client.hrAttendanceNotifyConfig.findUnique({ where: { accountId: i.accountId } });
  if (!cfg?.lateFineEnabled) return 0n;
  if (i.lateMinutes <= cfg.lateThresholdMin) return 0n;
  const amount = cfg.lateFinePerMinute
    ? cfg.lateFineAmountMinor * BigInt(i.lateMinutes)
    : cfg.lateFineAmountMinor;
  if (amount <= 0n) return 0n;
  try {
    await this.prisma.client.hrBonusFineLog.create({
      data: {
        accountId: i.accountId, employeeId: i.employeeId, employeeName: i.employeeName,
        kind: 'fine', source: 'auto_late', amountMinor: amount,
        reason: `Kechikish ${i.lateMinutes} daqiqa`, attendanceId: i.attendanceId,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return amount; // already applied (idempotent)
    throw e;
  }
  return amount;
}
```
(`isUniqueViolation` — Prisma `P2002` tekshiruvi; mavjud util bo'lsa qayta ishlat.)
- [ ] **Step 4: Run → PASS** + typecheck.
- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/hr/hr-attendance-notify/late-fine.service.ts apps/api/src/modules/hr/hr-attendance-notify/late-fine.service.test.ts
git commit -m "feat(hr): auto late-fine service (config-gated, idempotent ledger)"
```

---

## FAZA 4 — Notifier + outbox self-send

### Task 6: Xabar-tuzuvchi util (sof funksiya)

**Files:**
- Create: `apps/api/src/modules/hr/hr-attendance-notify/attendance-message.util.ts`
- Test: `.../attendance-message.util.test.ts`

**Interfaces:**
- Produces: `buildCheckInText(v: CheckInView): string`, `buildCheckOutText(v: CheckOutView): string`.
  `CheckInView { name; timeHHmm; lateMinutes; fineMinor: bigint; department?: string|null; position?: string|null }`.
  `CheckOutView { name; timeHHmm; workedLabel?: string|null }`.

- [ ] **Step 1: Failing tests:**
```ts
it('check-in with lateness + fine', () => {
  expect(buildCheckInText({ name:'Aziz Karimov', timeHHmm:'09:15', lateMinutes:15, fineMinor:10000n, department:'Sotuv', position:'Sotuvchi' }))
    .toContain('✅ *Keldi* — Aziz Karimov');
  // 🕐 09:15, ⏰ 15 daqiqa kechikdi, 💰 Jarima: 10 000 so'm, 🏢 Sotuv · Sotuvchi
});
it('check-in on time → no ⏰ / no 💰 lines', () => {
  const t = buildCheckInText({ name:'X', timeHHmm:'08:59', lateMinutes:0, fineMinor:0n });
  expect(t).not.toContain('kechikdi'); expect(t).not.toContain('Jarima');
});
it('check-out with worked label', () => {
  expect(buildCheckOutText({ name:'X', timeHHmm:'18:05', workedLabel:'8s 50d' })).toContain('🚪 *Ketdi* — X');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `fmtAmount` (`hr-bonus-fine/template-render.util.ts`ning `formatMinor`ni qayta ishlat) bilan; shartli qatorlar (`lateMinutes>0`, `fineMinor>0n`, dept/pos bor). `HrAdminNotifier`ning `buildTaskAnsweredText` uslubiga mos (Markdown, `\n`).
- [ ] **Step 4: Run → PASS** + typecheck.
- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/hr/hr-attendance-notify/attendance-message.util.ts apps/api/src/modules/hr/hr-attendance-notify/attendance-message.util.test.ts
git commit -m "feat(hr): davomat telegram message builders (uz, pure)"
```

### Task 7: Outbox self-send (`toSelf`/`viaSlot`) — adapter + worker

**Files:**
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-adapter.ts` (`MtprotoSendOptions`)
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts:167` (`sendMessage`)
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-outbox-worker.service.ts:86`
- Test: `.../mtproto-worker.service.test.ts` (mavjud — self-branch keysi), `.../hr-telegram-outbox-worker.service.test.ts`

**Interfaces:**
- Produces: `MtprotoSendOptions` + `toSelf?: boolean` + `viaSlot?: number`. `toSelf=true` → `handle.sendMessage('me', text)` `viaSlot` clienti bilan.

- [ ] **Step 1: Failing test** (worker test) — outbox qator `{ toSelf:true, viaSlot:3, toPhone:null }` bo'lganда adapter `sendMessage`ga `toSelf:true, viaSlot:3` uzatilishini stub bilan tekshir.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: `MtprotoSendOptions`** — `toSelf?: boolean; viaSlot?: number` qo'sh (doc bilan).
- [ ] **Step 4: Worker** (`hr-telegram-outbox-worker.service.ts:86`) — `adapter.sendMessage`ga `toSelf: row.toSelf, viaSlot: row.viaSlot ?? undefined` qo'sh; `toPhone: row.toPhone ?? ''`.
- [ ] **Step 5: Adapter** (`mtproto-worker.service.ts` `sendMessage`, ~167) — funksiya boshida:
```ts
if (opts.toSelf) {
  const slot = opts.viaSlot ?? 0;
  const { client } = await this.acquireSlotClient(opts.accountId, slot); // mavjud slot-olish yordamchisidan foydalaning
  const res = await withTimeout(client.sendMessage('me', opts.text), 'sendSelf');
  return { slot, messageId: res.messageId };
}
```
*(Aynan slot-client olish nomi `mtproto-worker.service.ts`da mavjud — o'qib mos nomni ishlat; `client.sendMessage('me', text)` handle'да allaqachon bor.)*
- [ ] **Step 6: Run → PASS** + typecheck.
- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/hr/hr-telegram-bridge/mtproto-adapter.ts apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-outbox-worker.service.ts apps/api/src/modules/hr/hr-telegram-bridge/*.test.ts
git commit -m "feat(hr): outbox self-send ('me'/Saved Messages) via director slot"
```

### Task 8: `HrAttendanceNotifier` (@OnEvent → jarima → xabar → outbox)

**Files:**
- Create: `apps/api/src/modules/hr/hr-attendance-notify/attendance-notifier.service.ts`
- Test: `.../attendance-notifier.service.test.ts`
- Modify: `.../hr-attendance-notify.module.ts` (provider: notifier, late-fine; imports)

**Interfaces:**
- Consumes: `PrismaService`, `LateFineService`, `HR_EVENT.*`, `buildCheckInText/Out`, `HrAttendanceNotifyConfig`, `aggregateEmployeeDay` (`attendance-geo/attendance-dashboard.util.ts`).

- [ ] **Step 1: Failing tests:**
```ts
it('disabled config → no outbox row, no throw', async () => {
  await notifier.onCheckedIn({ accountId:ACC, attendanceId:A, employeeId:E, at:new Date(), lateMinutes:20 });
  expect(await prisma.client.hrTelegramOutbox.count()).toBe(0);
});
it('enabled → applies fine + enqueues self outbox row', async () => {
  await cfg({ enabled:true, notifyCheckIn:true, directorSlot:3, lateFineEnabled:true, lateThresholdMin:10, lateFineAmountMinor:10000n });
  await notifier.onCheckedIn({ accountId:ACC, attendanceId:A, employeeId:E, at:new Date(), lateMinutes:15 });
  const row = await prisma.client.hrTelegramOutbox.findFirst();
  expect(row).toMatchObject({ toSelf:true, viaSlot:3, sourceEventType:'attendance.check_in' });
  expect(row!.messageText).toContain('Jarima');
});
it('handler never throws even if enqueue fails', async () => {
  vi.spyOn(prisma.client.hrTelegramOutbox,'create').mockRejectedValue(new Error('db down'));
  await expect(notifier.onCheckedIn({ ...evt })).resolves.toBeUndefined();
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `@OnEvent(HR_EVENT.HR_ATTENDANCE_CHECKED_IN, { async:true, promisify:true })` `onCheckedIn`, `_OUT` `onCheckedOut`. Har biri to'liq `try/catch` (warn). Mantiq:
  - config o'qi; `enabled` false yoki tegishli `notifyCheckIn/Out` false → return.
  - `directorSlot == null` → warn + return.
  - check-in: `fine = await lateFine.applyIfLate({...})`; xodim `name`+`department`+`position` o'qi; `buildCheckInText`; enqueue.
  - check-out: `aggregateEmployeeDay` bilan "Bugun ishlaган" hisobla (yoki yo'q); `buildCheckOutText`; enqueue.
  - enqueue: `hrTelegramOutbox.create({ accountId, toSelf:true, viaSlot: cfg.directorSlot, toPhone:null, messageText, status:'pending', sourceEventType:'attendance.check_in'|'check_out', sourceDocId: attendanceId, employeeId })`. Dedup: avval `findFirst({ where:{ sourceDocId:attendanceId, sourceEventType }})` bo'lsa skip.
- [ ] **Step 4: Module** — `LateFineService` + `HrAttendanceNotifier` providers; `EventEmitterModule` mavjud.
- [ ] **Step 5: Run → PASS** + typecheck.
- [ ] **Step 6: Commit**
```bash
git add apps/api/src/modules/hr/hr-attendance-notify
git commit -m "feat(hr): attendance notifier — @OnEvent → fine → uz message → self outbox"
```

### Task 9: Test-send'ni ulash

**Files:**
- Modify: `apps/api/src/modules/hr/hr-attendance-notify/hr-attendance-notify.service.ts` (`sendTest`)
- Test: service test'ga keys

- [ ] **Step 1: Failing test** — `sendTest(ACC)` config `directorSlot` bilan bitta `toSelf` outbox qatori (test matni) qo'yishini tekshir; `directorSlot=null` → `{ ok:false, reason:'no_director_slot' }`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — config o'qi; slot yo'q → `{ok:false}`; bor → `hrTelegramOutbox.create({ toSelf:true, viaSlot, messageText:'✅ Test — davomat bildirishnoma ulandi', sourceEventType:'attendance.test', status:'pending' })` → `{ok:true}`.
- [ ] **Step 4: Run → PASS** + typecheck.
- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/hr/hr-attendance-notify/hr-attendance-notify.service.ts apps/api/src/modules/hr/hr-attendance-notify/hr-attendance-notify.service.test.ts
git commit -m "feat(hr): wire davomat-notify test-send (self outbox)"
```

---

## FAZA 5 — Web UI + i18n

### Task 10: API klient + i18n kalitlar

**Files:**
- Modify: `apps/web/src/lib/hr-api.ts`
- Modify: `apps/web/src/messages/uz.json`, `apps/web/src/messages/ru.json`

- [ ] **Step 1:** `hr-api.ts`ga `getDavomatNotifyConfig()`, `updateDavomatNotifyConfig(dto)`, `sendDavomatNotifyTest()` (mavjud fetch-klient naqshi).
- [ ] **Step 2:** i18n kalitlar (ikkala faylда bir xil kalit to'plami) — `hr.notify.*` (title, enable, checkIn, checkOut, lateFine, threshold, amount, perMinute, director, test, ...).
- [ ] **Step 3: i18n gate** — Run: `pnpm i18n:gate`. Expected: PASS (ru+uz key-existence, hardcoded yo'q).
- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/hr-api.ts apps/web/src/messages/uz.json apps/web/src/messages/ru.json
git commit -m "feat(web): davomat-notify api client + i18n keys"
```

### Task 11: Sozlama UI + direktor login + Test tugma

**Files:**
- Create/Modify: `apps/web/src/app/(app)/hr/settings/` (davomat-notify bo'limi komponenti)
- (Qayta ishlat) direktor Telegram login modal — mavjud `hr-telegram-account` login oqimi UI'sini top va qayta ishlat.

**Interfaces:**
- Consumes: Task 10 api-klient; mavjud login modal.

- [ ] **Step 1:** Sozlama forma komponenti — toggle'lar (`enabled`, `notifyCheckIn/Out`), avto-jarima (`lateFineEnabled`, `lateThresholdMin`, `lateFineAmountMinor` so'mда→tiyin, `lateFinePerMinute`), `directorSlot` tanlash (mavjud slotlar ro'yxatidan).
- [ ] **Step 2:** Direktor Telegram ulanish holati + login tugma (mavjud sehrgar modalни qayta ishlat) + **"Test xabar"** tugma → `sendDavomatNotifyTest()` → natija toast.
- [ ] **Step 3:** Mavjud web Vitest regress yo'qligini tekshir — Run: `pnpm --filter @moysklad/web exec vitest run`. Expected: yashil (regress yo'q).
- [ ] **Step 4: To'liq gate** — `pnpm typecheck && pnpm lint && pnpm i18n:gate`.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/app/(app)/hr/settings
git commit -m "feat(web): davomat telegram-notify settings + director login + test"
```

---

## Self-review (reja → spec qamrovi)

- Spec §5 schema → Task 1 ✅ · §6 eventlar → Task 3,4 ✅ · §7 jarima → Task 5 ✅ · §8 xabar → Task 6 ✅ · §9 yetkazish → Task 7,8 ✅ · §10 UI → Task 10,11 ✅ · §11 kafolatlar → Task 8 (out-of-band, dedup) + Task 5 (idempotent) ✅ · §12 testlar → har task TDD ✅.
- Placeholder: yo'q (real kod/testlar). Ba'zi mavjud-fayl aniq nomlari (`acquireSlotClient`, `ping-ingest` create nuqtasi) — executor o'sha faylni o'qib mos nomni ishlatadi (aniq fayl+kontekst berilgan).
- Tip izchilligi: `applyIfLate` (Task 5) ↔ notifier (Task 8) chaqiruvi mos; `buildCheckInText/Out` (Task 6) ↔ notifier mos; `MtprotoSendOptions.toSelf/viaSlot` (Task 7) ↔ worker/notifier mos.

## Setup (implementatsiyadan keyin, runtime)
1. Direktor (`Sherzod`) Telegram akkаuntini sozlama sahifasidan login qil (telefon [operator beradi] → SMS kod → 2FA). Slot raqamini `directorSlot`ga qo'y.
2. Avto-jarima standartini sozla (masalan >15 daq = 10 000 so'm).
3. "Test xabar" → Saqlangan xabarlarga kelishini tasdiqla.
4. Real check-in/out bilan Phase-2 QA (alohida sessiya).
