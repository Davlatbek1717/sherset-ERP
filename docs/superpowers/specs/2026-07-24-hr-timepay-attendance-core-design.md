# TZ — HR moduli: TimePay/HRD-uslub davomat yadrosi (MVP)

> **Sana:** 2026-07-24 · **Holat:** Design (brainstorming tasdiqlangan) · **Manba:** `timepay1/2/3.mp4` (haqiqiy brend: HRD, `web.hrd.uz`)
> **Yondashuv:** mavjud `/hr` modulini KENGAYTIRISH · moysklad dizayn tizimida (TimePay ranglari EMAS) · davomat yadrosi MVP.
> **Tayyorlash:** 3-video kadr-tahlil (3 agent) + 7-agent code-verified spec workflow (`wf_cb6c0411-782`, har bo'lim mavjud kodga solishtirilgan).

## 1. Maqsad va kontekst

TimePay/HRD — o'zbek tilidagi HR / davomat (attendance) / ish-haqi SaaS. Foydalanuvchi HR bo'limini shu videolardagi
bo'lim/funksiyalar bilan **1:1** qilishni so'radi, lekin **ilovaning mavjud moysklad-parity dizayn tili** bilan
(foydalanuvchi qarori: «moysklad uslubida moslash»). Bu TZ — **birinchi navbat MVP = "davomat yadrosi"**.

## 2. Scope (MVP — "davomat yadrosi")

**IN:** (1) Boshqaruv paneli — davomat dashboard · (2) Jadvallar — nomli shablonlar + resolve-shift dvigatel ·
(3) Bo'limlar CRUD · (4) Lavozimlar CRUD + drill · (5) Xodimlar kengaytirish (filtr+ustun+biriktirish) ·
(6) Xodimlarni kuzatish · (7) Navigatsiya + i18n. **Shoxobchalar** allaqachon bor (`HrWorkLocation`), subnav'da yuzaga chiqariladi.

**OUT (keyingi fazalar):** Jarimalar (tiered) · Ish haqi tarif+hisoblash · Ish haqi to'lovlari jurnali · Hisobotlar ·
Qo'shimcha ish arizalari (approve/reject) · Bayramlar · Kiosk/Terminallar/PIN · foto-davomat.

## 3. Arxitektura yondashuvi

- **EXTEND**, rebuild EMAS: mavjud `/hr/*` sahifalar saqlanadi; yangi bo'limlar subnav'ga qo'shiladi; faqat
  **Boshqaruv paneli** qayta ishlanadi (Telegram-markazli → davomat-markazli).
- **Poydevor = resolve-shift dvigatel:** `resolveShift(employee, date) → {isWorkday,start,end,break}`. Barcha davomat
  mantiqi shundan chiqadi. Mavjud GPS-davomat (`attendance-geo`, `EmployeeWorkSchedule`) buzilmaydi — nomli shablon
  **ustiga** qo'shiladi, `scheduleId` yo'q xodim uchun `EmployeeWorkSchedule`'ga fallback.
- **Multi-tenant:** har satr `accountId`; soft-delete `archived` (mirror `HrWorkLocation`).

---

## 4. Ma'lumot modeli

### Data model — Attendance-core: Department / Position / Schedule / multi-branch

Grounded in `packages/db/prisma/schema.prisma` (Employee model L239–434; HR block L8549–8941; Account model L29–208), `apps/api/src/modules/hr/attendance-geo/employee-schedule.service.ts`, and `apps/api/src/modules/hr/attendance-geo/late-minutes.util.ts`.

**Ma'lumot modeli (Prisma)**

Four new models + one join table. All account-scoped, soft-deleted via `archived` (mirrors `HrWorkLocation` L8855–8871, the closest precedent — note `HrWorkLocation` deliberately has **no** name-unique, only `@@index([accountId, archived])`; we follow that exactly so soft-deleted names can be reused).

```prisma
/// Bo'lim (TimePay "Bo'lim"). Name only; assigned 1:many to employees.
model HrDepartment {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  name      String   @db.VarChar(150)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account   Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employees Employee[] @relation("EmployeeDepartment")

  @@index([accountId, archived])
  @@map("hr_departments")
}

/// Lavozim (TimePay "Lavozim"). Name only; assigned 1:many to employees.
/// NOTE: distinct from the legacy free-text Employee.position VarChar (kept for back-compat).
model HrPosition {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  name      String   @db.VarChar(150)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account   Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employees Employee[] @relation("EmployeePosition")

  @@index([accountId, archived])
  @@map("hr_positions")
}

/// Ish jadvali (TimePay "Ish jadvali"). Cycle-based schedule template.
/// type: 'flexible' (Moslashuvchan) | 'free' (Erkin) — VarChar+comment,
/// mirrors HrAttendance.source VarChar(12) 'auto_gps'|'manual' (L8630).
model HrSchedule {
  id              String   @id @default(uuid()) @db.Uuid
  accountId       String   @map("account_id") @db.Uuid
  name            String   @db.VarChar(150)
  type            String   @default("flexible") @db.VarChar(12) // 'flexible' | 'free'
  startDate       DateTime @map("start_date") @db.Date          // cycle anchor, Asia/Tashkent calendar date — DATE not Timestamptz (see edge cases)
  cycleDays       Int      @map("cycle_days")                   // Sikl (1..N)
  calcOvertime    Boolean  @default(false) @map("calc_overtime") // "Qo'shimcha ish vaqtini hisoblash"
  extendedWorkMin Int      @default(0) @map("extended_work_min")  // "Uzaytirilgan ish vaqti", minutes (see open Q)
  archived        Boolean  @default(false)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account   Account         @relation(fields: [accountId], references: [id], onDelete: Cascade)
  days      HrScheduleDay[]
  employees Employee[]      @relation("EmployeeSchedule2")

  @@index([accountId, archived])
  @@map("hr_schedules")
}

/// One row per cycle day (TimePay day grid). dayIndex 1..cycleDays.
/// Times as "HH:mm" VarChar(5), mirroring EmployeeWorkSchedule (L8880-8881).
/// break/times nullable so a day-off (isWorkday=false) can omit them.
model HrScheduleDay {
  id         String  @id @default(uuid()) @db.Uuid
  accountId  String  @map("account_id") @db.Uuid
  scheduleId String  @map("schedule_id") @db.Uuid
  dayIndex   Int     @map("day_index")                    // 1..cycleDays
  isWorkday  Boolean @default(true) @map("is_workday")     // "Ish kuni"
  startTime  String? @map("start_time") @db.VarChar(5)     // "09:00"
  endTime    String? @map("end_time") @db.VarChar(5)       // "18:00"
  breakStart String? @map("break_start") @db.VarChar(5)    // "13:00"
  breakEnd   String? @map("break_end") @db.VarChar(5)      // "14:00"

  account  Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  schedule HrSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@unique([scheduleId, dayIndex])        // one row per cycle day (mirrors EmployeeWorkSchedule @@unique([employeeId, weekday]) L8887)
  @@index([accountId, scheduleId])
  @@map("hr_schedule_days")
}

/// Employee ↔ Branch (HrWorkLocation) many-to-many join.
/// RECOMMENDED (see below) — replaces the single Employee.workLocationId for
/// TimePay's multi-branch assignment. Composite PK, both sides Cascade.
model HrEmployeeBranch {
  accountId      String   @map("account_id") @db.Uuid
  employeeId     String   @map("employee_id") @db.Uuid
  workLocationId String   @map("work_location_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account      Account        @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee     Employee       @relation("EmployeeBranches", fields: [employeeId], references: [id], onDelete: Cascade)
  workLocation HrWorkLocation @relation("BranchEmployees", fields: [workLocationId], references: [id], onDelete: Cascade)

  @@id([employeeId, workLocationId])       // mirrors EmployeeRole composite-PK join (L477+)
  @@index([accountId, workLocationId])     // reverse lookup: who is assigned to this branch
  @@map("hr_employee_branches")
}
```

**Employee FK additions** (append inside the existing "HR module fields" block, ~L295–314, mirroring the `// all nullable/defaulted, prod-safe` pattern already there):

```prisma
  // === HR TimePay: department / position / schedule (all nullable — prod-safe, no backfill) ===
  departmentId String?       @map("department_id") @db.Uuid
  department2  HrDepartment? @relation("EmployeeDepartment", fields: [departmentId], references: [id], onDelete: SetNull)
  positionId   String?       @map("position_id") @db.Uuid
  position2    HrPosition?   @relation("EmployeePosition", fields: [positionId], references: [id], onDelete: SetNull)
  scheduleId   String?       @map("schedule_id") @db.Uuid
  schedule     HrSchedule?   @relation("EmployeeSchedule2", fields: [scheduleId], references: [id], onDelete: SetNull)
  branches     HrEmployeeBranch[] @relation("EmployeeBranches")
```

Relation-field names `department2`/`position2` avoid colliding with the existing scalar `department String?` (L302) and `position String?` (L262). `onDelete: SetNull` mirrors `Employee.workLocation` (L313). Add matching `@@index` lines to Employee (mirrors `@@index([accountId, groupId])` L432) for dropdown-filtered listing:

```prisma
  @@index([accountId, departmentId])
  @@index([accountId, positionId])
  @@index([accountId, scheduleId])
```

**Account back-relations** (schema-only, add near the existing HR block L191/206–208 — `hrWorkLocations`, `employeeWorkSchedules`, `hrLocationPings`):

```prisma
  hrDepartments    HrDepartment[]
  hrPositions      HrPosition[]
  hrSchedules      HrSchedule[]
  hrScheduleDays   HrScheduleDay[]
  hrEmployeeBranches HrEmployeeBranch[]
```

**Multi-branch recommendation — YES, add `HrEmployeeBranch`.** TimePay assigns an employee to MANY branches; the current model has a single `Employee.workLocationId` (L312–313). Do **not** widen that column. Instead: **keep `Employee.workLocationId` as the "primary/default branch" for back-compat** with the live GPS-davomat code (`employee-schedule.service.ts` `setConfig` writes it, L62–66; ping-ingest resolves geofence from it), and add `HrEmployeeBranch` as the authoritative multi-branch set going forward. Attendance-core's geofence resolver iterates the employee's `branches[]` (union the assigned geofences) and falls back to `workLocationId` when the join is empty — no breaking change to the existing single-branch flow.

**Migration strategy (additive-only, prod-safe)**

Single additive migration, zero data ALTER:
1. `CREATE TABLE` × 5: `hr_departments`, `hr_positions`, `hr_schedules`, `hr_schedule_days`, `hr_employee_branches` (+ their indexes/unique).
2. `ALTER TABLE employees ADD COLUMN department_id/position_id/schedule_id uuid NULL` — all nullable, no default backfill, no rewrite (Postgres adds a nullable column as metadata-only, safe on a live prod table). FKs are nullable → prod-safe, mirroring the schema's stated "all new FKs nullable/defaulted" convention.
3. New FK constraints all `ON DELETE SET NULL` (employee side) / `CASCADE` (child + join side); none touches existing rows.
4. Account/Employee back-relation fields generate no SQL (Prisma virtual). The `HrEmployeeBranch` composite `@@id` generates one new PK index.

No `prisma migrate diff` noise expected (unlike the partial-index gotcha documented at Employee L419–430 — we add no partial/filtered indexes here).

**Coexistence with existing code**

- **(a) Legacy `Employee.department`/`Employee.position` STRINGs (L262, L302):** KEEP untouched for back-compat (HR list UI, `hr-task-template.schema.ts` still reads `department` string). New `departmentId`/`positionId` FKs are the source of truth going forward; the string columns become display-fallback only. **No backfill in this migration** (additive-only rule). A separate, optional one-off data-migration can seed `HrDepartment`/`HrPosition` from `SELECT DISTINCT department/position` and set the FKs — flagged as an open item, not part of the prod-safe schema migration.
- **(b) `EmployeeWorkSchedule` (L8875–8890) — KEEP as GPS-davomat fallback.** It is a per-**weekday** (0–6) model actively consumed by `employee-schedule.service.ts` `getWeek`/`replaceWeek` and by `late-minutes.util.ts` `computeLateMinutes(checkInUtc, DaySchedule, tz)`. The new `HrSchedule` is a fundamentally different shape (per-**cycle-day** anchored at `startDate mod cycleDays`), so it does **not** replace `EmployeeWorkSchedule`. Both live side-by-side on Employee (`workSchedules` relation L416 stays; new `schedule`/`scheduleId` added). Attendance-core derives the effective `DaySchedule` for a calendar date from `HrScheduleDay` when `scheduleId` is set, else falls back to `EmployeeWorkSchedule` — that bridge is attendance-core logic, **no schema change** required and `computeLateMinutes`'s `DaySchedule` interface is reusable as-is.
- **(c) `HrAttendance.workLocationId` + `lateMinutes` (L8631–8632) — unchanged.** `workLocationId` already stores the *resolved* branch per check-in (raw FK, no relation — comment L8632), so multi-branch is naturally compatible: whichever assigned branch's geofence the ping matched is recorded. `lateMinutes` still computed via `computeLateMinutes`; its `DaySchedule` input just gets sourced from `HrScheduleDay` instead of `EmployeeWorkSchedule` when a cycle schedule is assigned. MVP needs **no new column on `HrAttendance`**.

**Account-scoping / dropdown indexes (call-outs)**

- Dropdown listing (Department/Position/Schedule pickers) → `@@index([accountId, archived])` on each (mirrors `HrWorkLocation` L8869). Query pattern: `where { accountId, archived: false } orderBy name`.
- Employees-in-department / -position / -schedule filtered lists → the three new Employee `@@index([accountId, <fk>])`.
- Branch roster ("who's at this branch") → `HrEmployeeBranch @@index([accountId, workLocationId])`.
- One-row-per-cycle-day integrity → `HrScheduleDay @@unique([scheduleId, dayIndex])`.
- **Deliberately NO `@@unique([accountId, name])`** on Department/Position/Schedule — mirrors `HrWorkLocation` (which has none) so a soft-deleted name can be reused; uniqueness-among-non-archived is enforced at the app layer (avoids the partial-unique-index Prisma gap flagged at Employee L419–430).

**Chekka holatlar (edge cases)**

- **Timezone (critical):** `HrSchedule.startDate` MUST be `@db.Date` (calendar date), never `@db.Timestamptz()`. Cycle offset = `daysBetween(startDate, targetDateInTashkent) mod cycleDays`, both floored to Asia/Tashkent calendar day. A midnight-UTC timestamp would shift a day at +05:00 and mis-index the whole cycle. All time-of-day math reuses the `date-fns-tz` + `Asia/Tashkent` pattern already in `late-minutes.util.ts` (`formatInTimeZone`/`fromZonedTime`).
- **cycleDays vs day rows:** must have exactly `cycleDays` `HrScheduleDay` rows, `dayIndex` 1..cycleDays, contiguous. Enforce app-layer; editing `cycleDays` downward must delete-and-recreate in a `$transaction` (mirror `replaceWeek` delete-all-then-createMany, `employee-schedule.service.ts` L41–48) to avoid orphaned high-index rows. `@@unique([scheduleId, dayIndex])` blocks duplicates.
- **Data-integrity / cross-tenant:** `HrEmployeeBranch` and `HrScheduleDay` each carry their own `accountId`; app layer must assert the joined `employee`/`workLocation`/`schedule` share that `accountId` before insert (no DB-level composite-FK enforcement).
- **Soft-delete referential behavior:** archiving (not deleting) a Department/Position/Schedule leaves assigned `Employee.departmentId` pointing at the archived row — intended. Dropdowns filter `archived:false`; detail/read views still resolve the archived name (join, no `archived` filter). `onDelete: SetNull` only fires on a genuine hard delete (rare — soft-delete is the norm).
- **HH:mm validation:** on `isWorkday:true`, `startTime`/`endTime` required and `breakStart`/`breakEnd` (if present) must lie within `[startTime, endTime]`; on `isWorkday:false` all four nullable. Regex `^([01]\d|2[0-3]):[0-5]\d$` (zod, reuse `attendance-geo.schema.ts` `ScheduleWeekSchema` style). Overnight shift (`endTime < startTime`) — default: **disallow in MVP** (flag as open Q for night-shift support).
- **Concurrency:** name-uniqueness-among-non-archived is app-checked, so two concurrent creates of the same name can both pass; acceptable (no DB unique by design) — dropdowns dedupe by id, and it mirrors `HrWorkLocation`'s existing behavior.
- **Multi-branch geofence ambiguity:** an employee assigned to two branches with overlapping radii → which branch does a ping resolve to? Deterministic tie-break = nearest center (min haversine). This is attendance-core (geofence resolver) logic, not schema — flagged as cross-area, but the data model supports it (union via `branches[]`, resolved value persisted to `HrAttendance.workLocationId`).

**Ochiq savollar** (defaults chosen)

1. **`extendedWorkTime` unit** ("Uzaytirilgan ish vaqti"). Default: **Int minutes** (`extended_work_min`), mirroring the `lateMinutes` Int convention. If TimePay means hours-with-decimals, switch to `Decimal(4,2)`. — default: minutes.
2. **`type='free'` (Erkin) semantics:** does a free schedule still need `HrScheduleDay` rows (no fixed times, only work/off flags), or zero days? Default: **still one row per cycle day** with `startTime/endTime` null and only `isWorkday` meaningful — keeps one uniform grid shape and avoids a null-days special case.
3. **Legacy string → FK backfill:** run a one-off seeder to populate `HrDepartment`/`HrPosition` from distinct existing strings and set the new FKs? Default: **defer** — ship additive schema first (prod-safe), backfill as a separate, reviewed data-migration.
4. **Retire `Employee.workLocationId` after `HrEmployeeBranch` lands?** Default: **keep both** — `workLocationId` = primary/default branch (still written by the live `setConfig`), `HrEmployeeBranch` = full assigned set. No removal in this MVP (removal would be a non-additive migration).

---

## 5. Bo'limlar bo'yicha spec

### 5.1 Jadvallar + resolve-shift dvigatel

### Ish jadvallari (Schedules) + resolveShift engine

Bugungi holat: davomat matematikasi **faqat** per-employee haftalik `EmployeeWorkSchedule` (weekday 0=Yak..6=Shan) ustida ishlaydi — check-in kechikishi (`ping-ingest.service.ts:150-155`), auto-checkout end-time imputatsiyasi (`davomat-autocheckout.cron.ts:52-63`) va oylik status (`monthly-report.util.ts:37-69`) hammasi `employeeWorkSchedule.findUnique({ employeeId_weekday })` chaqiradi. Bu — TimePay'ning "Erkin" (haftaviy) rejimi. Yangi qo'shiladigan narsa: **sikllik (N-kunlik) "Moslashuvchan" jadval** + **"Erkin" (fixed start yo'q) jadval** — nomланган, qayta ishlatiladigan shablon sifatida, hodimга biriktiriladi. `resolveShift` — bularning ikkalasini VA eski weekday-fallback'ni yagona sof funksiyada birlashtiradi, shunda uch iste'molchi (ping / cron / report) bir manbadan o'qiydi.

**Muhim additive-invariant:** `Employee.scheduleId` default `null` ⇒ `resolveShift` avtomatik weekday-fallback'ga tushadi ⇒ mavjud xatti-harakat **bit-baravar saqlanadi** (backward-compatible, prod-safe backfill yo'q).

---

#### **Ma'lumot modeli (Prisma)**

Ikki yangi jadval + Employee'ga bitta nullable FK. Barchasi `packages/db/prisma/schema.prisma` HR-blokiga (≈8850, `EmployeeWorkSchedule`'dan keyin) qo'shiladi. Konvensiyalar `HrWorkLocation`/`EmployeeWorkSchedule`'dan ko'chirildi: `@map` snake_case, `@@map` snake_case, `archived` soft-delete, `@db.Timestamptz()`, vaqtlar `@db.VarChar(5)` "HH:mm".

```prisma
/// Nomlangan, qayta ishlatiladigan ish jadvali shabloni (TimePay "Ish jadvallari").
/// type='flexible' (Moslashuvchan, sikllik) | 'free' (Erkin, fixed start yo'q).
model HrSchedule {
  id                   String   @id @default(uuid()) @db.Uuid
  accountId            String   @map("account_id") @db.Uuid
  name                 String   @db.VarChar(150)
  type                 String   @default("flexible") @db.VarChar(10) // 'flexible' | 'free'
  startDate            DateTime @map("start_date") @db.Date          // sikl anchor'i (kalendar sana, vaqtsiz — mirror HrKpiDailyLog.date)
  cycleDays            Int      @default(7) @map("cycle_days")       // Sikl; 'free' uchun 1 ga majburlanadi
  calcOvertime         Boolean  @default(false) @map("calc_overtime") // "Qo'shimcha ish vaqtini hisoblash"
  extendedWorkMinutes  Int      @default(240) @map("extended_work_minutes") // "Uzaytirilgan ish vaqti" (default 4h = 240 min)
  archived             Boolean  @default(false)
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account   Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  days      HrScheduleDay[]
  employees Employee[]       @relation("EmployeeSchedule2") // biriktirilgan xodimlar

  @@index([accountId, archived])
  @@map("hr_schedule")
}

/// Sikldagi bir kun (Kun 1..Kun N). 'free' jadval uchun 0 qatorли (kun bloklari yo'q).
model HrScheduleDay {
  id         String  @id @default(uuid()) @db.Uuid
  accountId  String  @map("account_id") @db.Uuid
  scheduleId String  @map("schedule_id") @db.Uuid
  dayIndex   Int     @map("day_index")                 // 1..cycleDays (1-based, "Kun 1")
  isWorkday  Boolean @default(true) @map("is_workday")  // "Ish kuni" toggle
  startTime  String? @map("start_time") @db.VarChar(5)  // "08:00" — null bo'lganda dam kuni
  endTime    String? @map("end_time") @db.VarChar(5)
  breakStart String? @map("break_start") @db.VarChar(5) // "Tanaffus boshlanishi"
  breakEnd   String? @map("break_end") @db.VarChar(5)   // "Tanaffus tugashi"

  account  Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  schedule HrSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@unique([scheduleId, dayIndex])
  @@index([accountId, scheduleId])
  @@map("hr_schedule_day")
}
```

`Employee` modeliga (schema.prisma ≈312, `workLocationId` yonida — bir xil "all nullable/defaulted, prod-safe" bloki):

```prisma
  // === HR jadval biriktirish (sikllik/erkin) — nullable, prod-safe, no backfill ===
  scheduleId String?     @map("schedule_id") @db.Uuid
  schedule   HrSchedule? @relation("EmployeeSchedule2", fields: [scheduleId], references: [id], onDelete: SetNull)
```

**Migration:** additive-only — `CREATE TABLE hr_schedule`, `CREATE TABLE hr_schedule_day`, `ALTER TABLE employee ADD COLUMN schedule_id uuid NULL` + nullable FK. Hech qanday mavjud data ALTER qilinmaydi (mirror GPS-davomat migratsiya patterni). `EmployeeWorkSchedule` **o'chirilmaydi** — u endi "no scheduleId" holatidagi fallback manbai.

---

#### **API endpoints**

Barchasi `@UseGuards(JwtAuthGuard, HrPermissionGuard)` + `@RequireHrPermission('employees', ...)` (work-location controller'dagi bir xil guard/permission-kaliti — jadvallar xodim-boshqaruvining bir qismi).

| Method | Path | Permission | Purpose / shape |
|---|---|---|---|
| `GET` | `/hr/schedules?search=&type=&archived=&page=&limit=` | `read` | Ro'yxat + pagination. → `{ rows: HrScheduleRow[], total, page, limit }`. `HrScheduleRow = { id, name, type, startDate, cycleDays, calcOvertime, extendedWorkMinutes, archived, assignedCount }` (`assignedCount` = `_count.employees`). `limit` default **10** (TimePay "1 dan 10 gacha"). |
| `GET` | `/hr/schedules/:id` | `read` | Detail + kunlar. → `HrScheduleRow & { days: HrScheduleDay[] }` (days `dayIndex` bo'yicha ASC). "Ko'z" (view) modal shu bilan to'ladi. |
| `POST` | `/hr/schedules` | `full` | Yaratish + nested days bitta tranzaksiyada. Body = `HrScheduleInput` (quyida). → yaratilgan detail. |
| `PUT` | `/hr/schedules/:id` | `full` | To'liq almashtirish; days = delete-all + createMany (mirror `employee-schedule.service.ts:41-48` `replaceWeek`). → yangilangan detail. |
| `DELETE` | `/hr/schedules/:id` | `full` | Soft-delete (`archived=true`). `assignedCount > 0` bo'lsa `BadRequestException` — mirror `work-location.service.ts:38-49` remove-guard. |
| `GET` | `/hr/schedules/:id/preview?from=&to=` | `read` | *(nice-to-have)* Berilgan diapazonда `resolveShift` natijalari — view-modal preview + debug. Defer qilinsa ham bo'ladi. |
| `PATCH` | `/hr/employees/:id/attendance-config` | `full` | **Mavjud endpoint kengaytiriladi** (`employee-schedule.controller.ts:31`) — `scheduleId: string \| null` maydoni qo'shiladi (workLocationId + attendanceOptIn yonida). Biriktirish shu yer orqali (yangi endpoint SHART EMAS). |

---

#### **Backend modullar**

Yangi modul `apps/api/src/modules/hr/hr-schedule/` (mirror `hr-role`/`hr-bonus-fine` shakli), + engine `attendance-geo/` ichida (uni iste'mol qiluvchilar shu yerda):

- **`hr-schedule/hr-schedule.schema.ts`** — zod (quyida). `TIME` regexini `attendance-geo.schema.ts:3`'dan qayta ishlating.
- **`hr-schedule/hr-schedule.service.ts`** — CRUD + pagination (`hr-employee.service.ts:92` `$transaction([findMany, count])` patterni), days nested replace (`replaceWeek` patterni), soft-delete guard (`work-location.service.ts` `remove`).
- **`hr-schedule/hr-schedule.controller.ts`** — yuqoridagi route'lar; `work-location.controller.ts` skeletidan nusxa.
- **`hr-schedule/hr-schedule.module.ts`** — `imports: [PrismaModule, AuthModule, HrAuthModule]`; `hr.module.ts` aggregator'ga `HrScheduleModule` qo'shiladi.
- **`attendance-geo/resolve-shift.util.ts`** — **SOF funksiya** `resolveShift(...)` + hosil qiluvchi `computeOvertimeMinutes` va `computeTotalWorkedMinutes` sof yordamchilari. DI yo'q ⇒ modul-sikl yo'q; ping/cron/report import qiladi.
- **`attendance-geo/resolve-shift.util.test.ts`** — sikl-matematika edge-testlari (quyida).
- **`attendance-geo/employee-schedule.service.ts`** kengaytiriladi — `AttendanceConfigSchema`'ga `scheduleId` qo'shiladi; `setConfig` uni yozadi + `scheduleId` berilganда `HrSchedule` mavjudligini + `accountId` mosligini tekshiradi (mirror workLocationId tekshiruvi, `employee-schedule.service.ts:55-60`).
- **Uch iste'molchi refactori** (xatti-harakat identik qoladi, faqat manba resolveShift'ga o'tadi):
  - `ping-ingest.service.ts` — `manualCheckIn` + `ingest` KELDI shoxi: `findUnique(weekday)` o'rniga xodimning `scheduleId`+`schedule.days` (yoki weekFallback) ni yuklab `resolveShift` → keyin `computeLateMinutes` (mavjud util, o'zgarmaydi). Free/dam kuni ⇒ `null` uzatiladi ⇒ 0 (util allaqachon shunday).
  - `davomat-autocheckout.cron.ts` — `endTime` imputatsiyasi `resolveShift(...).endTime` dan (free/no-end ⇒ `now` bilan yopiladi, mavjud fallback).
  - `davomat-report.service.ts` / `monthly-report.util.ts` — status `resolveShift(...).isWorkday` bilan boshqariladi; ixtiyoriy yangi ustunlar "Qo'shimcha" (overtime) va "Jami" (total) `computeOvertimeMinutes`/`computeTotalWorkedMinutes` orqali. `monthly-report.util.ts` hozir faqat `week[]` oladi — signatura sxema-aware qilib kengaytiriladi (resolvedShift-per-day callback yoki oldindan-resolved massiv uzatiladi).

---

#### **resolveShift — algoritm (pseudocode)**

Sof; nolinchi DI. Kalendar-kunlik ayirma orqali (DST-immun) sikl indeksi. Asia/Tashkent 1991-dan beri **fixed +05:00, DST yo'q** ⇒ kunlar soni har doim butun; `Date.UTC(...)`/86400000 aniq (mirror `monthly-report.util.ts:41` `Date.UTC(y, m, 0)` kalendar-matematikasi).

```
type ScheduleDay = { dayIndex, isWorkday, startTime|null, endTime|null, breakStart|null, breakEnd|null }
type ResolvedSchedule = { type:'flexible'|'free', startDate:'yyyy-MM-dd', cycleDays, calcOvertime, extendedWorkMinutes, days: ScheduleDay[] }
type WeekdayShift = { weekday, startTime, endTime, isDayOff }   // EmployeeWorkSchedule qatori
type ExpectedShift = {
  isWorkday: bool, isFree: bool,
  startTime|null, endTime|null, breakStart|null, breakEnd|null,
  calcOvertime: bool, extendedWorkMinutes: number,
  source: 'schedule'|'weekday'|'none'
}

// yagona sanctioned kalendar-kun raqami (UTC anchor, wall-clock EMAS)
function dayNumber(localDate 'yyyy-MM-dd'):
    [y,m,d] = split('-')
    return floor(Date.UTC(y, m-1, d) / 86_400_000)

function resolveShift({ date, tz, schedule, weekFallback }):
    // A) Sxema biriktirilgan
    if schedule != null:
        if schedule.type == 'free':
            // Erkin: fixed start yo'q, har kun ishlash mumkin, hech qachon kech emas
            return { isWorkday:true, isFree:true, startTime:null,endTime:null,breakStart:null,breakEnd:null,
                     calcOvertime:schedule.calcOvertime, extendedWorkMinutes:schedule.extendedWorkMinutes, source:'schedule' }

        // flexible: sikl indeksi (manfiy = startDate'dan oldin — ((x % n)+n)%n bilan normallashtiriladi)
        diffDays      = dayNumber(date) - dayNumber(schedule.startDate)
        cycleDayIndex = ((diffDays % schedule.cycleDays) + schedule.cycleDays) % schedule.cycleDays + 1  // 1..cycleDays
        day = schedule.days.find(d => d.dayIndex == cycleDayIndex)
        if day == null OR day.isWorkday == false:
            return { isWorkday:false, isFree:false, ...nulls, calcOvertime:.., extendedWorkMinutes:.., source:'schedule' }
        return { isWorkday:true, isFree:false, startTime:day.startTime, endTime:day.endTime,
                 breakStart:day.breakStart, breakEnd:day.breakEnd,
                 calcOvertime:schedule.calcOvertime, extendedWorkMinutes:schedule.extendedWorkMinutes, source:'schedule' }

    // B) Sxema yo'q → eski weekday fallback (mavjud xatti-harakat)
    if weekFallback != null:
        weekday = tashkentWeekday(fromZonedTime(`${date}T12:00:00`, tz))   // mirror monthly-report.util.ts:51 (peshin-anchor DST-safe)
        row = weekFallback.find(w => w.weekday == weekday)
        if row == null OR row.isDayOff:
            return { isWorkday:false, isFree:false, ...nulls, calcOvertime:false, extendedWorkMinutes:0, source: row?'weekday':'none' }
        return { isWorkday:true, isFree:false, startTime:row.startTime, endTime:row.endTime,
                 breakStart:null, breakEnd:null, calcOvertime:false, extendedWorkMinutes:0, source:'weekday' }

    // C) Umuman jadval yo'q
    return { isWorkday:false, isFree:false, ...nulls, calcOvertime:false, extendedWorkMinutes:0, source:'none' }
```

**Hosil qiluvchi metrikalar (resolveShift natijasidan):**

```
// KECHIKISH — mavjud computeLateMinutes'ni O'ZGARTIRMASDAN qayta ishlatadi
lateMinutes(checkInUtc, shift, tz):
    if shift.isFree OR not shift.isWorkday OR shift.startTime == null: return 0
    return computeLateMinutes(checkInUtc, { startTime: shift.startTime, endTime: shift.endTime, isDayOff:false }, tz)
    // ↑ late-minutes.util.ts:10 — max(0, floor((checkIn - startUtc)/60000)), grace 0

// TANAFFUS-AYIRILGAN JAMI ("Jami")
computeTotalWorkedMinutes(checkInUtc, checkOutUtc, shift, tz, localDate):
    worked = max(0, floor((checkOut - checkIn)/60000))
    if shift.breakStart && shift.breakEnd:
        bStart = fromZonedTime(`${localDate}T${shift.breakStart}:00`, tz)
        bEnd   = fromZonedTime(`${localDate}T${shift.breakEnd}:00`, tz)
        overlap = max(0, min(checkOut,bEnd) - max(checkIn,bStart)) / 60000  // faqat haqiqiy kesishma ayiriladi
        worked -= floor(overlap)
    return max(0, worked)        // free: break yo'q ⇒ xom worked

// QO'SHIMCHA ("Qo'shimcha" / overtime)
computeOvertimeMinutes(checkOutUtc, shift, tz, localDate):
    if not shift.calcOvertime OR shift.isFree OR shift.endTime == null: return 0
    endUtc  = fromZonedTime(`${localDate}T${shift.endTime}:00`, tz)
    raw     = max(0, floor((checkOut - endUtc)/60000))
    return min(raw, shift.extendedWorkMinutes)   // "Uzaytirilgan ish vaqti" = hisoblanадиган overtime shifti
```

**Status** (`monthly-report.util.ts:54-69` mantig'i, endi resolveShift bilan): `!shift.isWorkday` ⇒ `dayoff`; attendance bor + `lateMinutes>0` ⇒ `late` (present-ning kichik to'plami); attendance bor ⇒ `present`; aks holda ⇒ `absent`. Free ⇒ `isWorkday=true`, hech qachon `late`, hech qachon `dayoff`.

---

#### **Frontend**

**Sub-nav** (`layout.tsx:407-418` `hrSubNav`) — `attendance`'dan keyin yangi element:
```ts
{ key: 'schedules', label: tHr('schedules'), href: '/hr/schedules' },
```
(`tHr = useTranslations('subnav.hr')` — `layout.tsx:43`; `subnav.hr.schedules` kaliti ru+uz.)

**Route:** `apps/web/src/app/(app)/hr/schedules/page.tsx` — list; `_components/schedule-form-modal.tsx` — create/edit/view modal; `_components/cycle-day-card.tsx` — Kun-N kartochka. **`hrScheduleApi`ni `lib/hr-api.ts`ga qo'shing** (`hrWorkLocationApi` bloki yonida) + `HrScheduleRow`/`HrScheduleInput`/`HrScheduleDay` tiplari.

**List page** (`settings/work-locations/page.tsx` skeletidan — bir xil react-query + `@moysklad/ui` `Button/EmptyState/ErrorState/Skeleton/useConfirm/useToast`, `var(--ms-*)` jadval):
- Sarlavha + `+ Yangi jadval` tugma.
- Ustunlar: **Nomi** / **Turi** (`Badge` — `Moslashuvchan`=`tone="success"` filled, `Erkin`=`tone="neutral"`/gray) / **Boshlanish sanasi** (`formatDateOnly`) / **Sikl** (`cycleDays`, free uchun `—`).
- Qator amallari: 👁 ko'z (view read-only modal) + ✏️ qalam (edit) — mirror `work-locations` action tugmalari (`variant="ghost" size="icon-sm"`).
- Pagination footer: "1 dan 10 gacha, jami N dona" / Oldingi / Sahifa X / Keyingi — `page`/`limit` state, `hrScheduleApi.list({ page, limit })`. (`ListView` patterni yoki qo'lda footer.)

**ScheduleFormModal** (`mode: 'create'|'edit'|'view'`; view = barcha maydonlar `disabled`) — `@moysklad/ui` `Modal` (mirror `BranchFormModal`):
- **Turi** — `SegmentedControl` `options=[{value:'flexible',label:Moslashuvchan},{value:'free',label:Erkin}]` (`primitives/SegmentedControl.tsx`).
- **Nomi** — `Input`, placeholder "Jadval nomini kiriting". *(Preset-autocomplete — `Combobox` bilan "Smena (8:00-17:00)" kabi presetlar — **nice-to-have, defer** qilinadi; MVP oddiy `Input`.)*
- **Boshlanish sanasi** — `DatePicker` (`formatIso`/`todayIso` — `primitives/DatePicker.tsx`; hech qachon `toISOString().slice` ishlatmang, UTC+5 bug-class).
- **Sikl** — `NumberInput` steppers `−/value/+`, default 7, `min=1 max=31` (`primitives/NumberInput.tsx`). **`type==='free'` bo'lganda yashiriladi.**
- **"Qo'shimcha ish vaqtini hisoblash"** — `Checkbox` (`calcOvertime`).
- **"Uzaytirilgan ish vaqti"** — `NumberInput` (soatда, default 4; UI soat ↔ `extendedWorkMinutes` = soat×60).
- **"Moslashuvchan jadval tafsilotlari"** seksiyasi — faqat `type==='flexible'`: `Array.from({length:cycleDays})` → `CycleDayCard` (Kun 1..Kun N). Har kartochka: **"Ish kuni"** `Switch` (`isWorkday`) + 4 ta `Input type="time"` (Boshlanish/Tugash/Tanaffus boshlanishi/Tanaffus tugashi) — **`week-schedule-grid.tsx:97-108` `Input type="time"` + `Switch onCheckedChange` patternidan to'g'ridan-to'g'ri qayta ishlating**. `isWorkday=false` ⇒ vaqt inputlari `disabled` + kartochka `bg-[var(--ms-bg-muted)]` (grid'даги `isDayOff` xatti-harakati aksi).
- **Erkin** rejimi faqat: Nomi + Boshlanish sanasi + Uzaytirilgan ish vaqti (Sikl yo'q, Kun bloklari yo'q).
- **Sikl o'zgarganda kun massivini reconcile** qiling: yangi N > eski ⇒ default kun qo'shing (`{isWorkday:true, 08:00-17:00}`); N < eski ⇒ ortiqchani kesing (state'da, dayIndex 1..N).

**States:** loading → `Skeleton`; error → `ErrorState onRetry`; bo'sh → `EmptyState`; save `isPending` ⇒ tugma disabled; view-mode ⇒ footer'da faqat "Yopish".

---

#### **i18n**

Namespace'lar: nav `subnav.hr.schedules`; sahifa `pages.hrSchedules` (mavjud `pages.hrAttendance`/`pages.hrEmployees` konvensiyasi — `ru.json`/`uz.json` ikkalasida). Vakil kalitlar (muhimlar uchun ru+uz qoralamalari):

| Key | ru | uz |
|---|---|---|
| `subnav.hr.schedules` | Графики работы | Ish jadvallari |
| `pages.hrSchedules.title` | Графики работы | Ish jadvallari |
| `pages.hrSchedules.create_button` | Новый график | Yangi jadval |
| `pages.hrSchedules.col_name` | Название | Nomi |
| `pages.hrSchedules.col_type` | Тип | Turi |
| `pages.hrSchedules.col_start_date` | Дата начала | Boshlanish sanasi |
| `pages.hrSchedules.col_cycle` | Цикл | Sikl |
| `pages.hrSchedules.type_flexible` | Гибкий | Moslashuvchan |
| `pages.hrSchedules.type_free` | Свободный | Erkin |
| `pages.hrSchedules.name_placeholder` | Введите название графика | Jadval nomini kiriting |
| `pages.hrSchedules.calc_overtime` | Учитывать переработку | Qo'shimcha ish vaqtini hisoblash |
| `pages.hrSchedules.extended_work` | Продлённое рабочее время | Uzaytirilgan ish vaqti |
| `pages.hrSchedules.flex_details` | Детали гибкого графика | Moslashuvchan jadval tafsilotlari |
| `pages.hrSchedules.day_n` | День {n} | Kun {n} |
| `pages.hrSchedules.is_workday` | Рабочий день | Ish kuni |
| `pages.hrSchedules.field_start` | Начало | Boshlanish vaqti |
| `pages.hrSchedules.field_end` | Конец | Tugash vaqti |
| `pages.hrSchedules.field_break_start` | Начало перерыва | Tanaffus boshlanishi |
| `pages.hrSchedules.field_break_end` | Конец перерыва | Tanaffus tugashi |
| `pages.hrSchedules.delete_blocked` | К графику привязаны сотрудники | Jadvalga xodimlar biriktirilgan |
| `pages.hrSchedules.pagination` | {from} – {to} из {total} | {total} dan {from} – {to} |
| `pages.hrSchedules.view_title` | Просмотр графика | Jadvalni ko'rish |

`Input type="time"`/`DatePicker` uchun hardcoded matn yo'q; gate ru+uz key-existence + no-hardcoded Cyrillic'ni tekshiradi.

---

#### **Mavjud koddan qayta ishlatish**

- **`late-minutes.util.ts:10-19` `computeLateMinutes`** — kechikish matematikasi O'ZGARMAYDI; resolveShift faqat unga `startTime`/`isDayOff` uzatuvchi shift'ni beradi. `fromZonedTime`+`formatInTimeZone` grace-0 patterni.
- **`hr-shared/tz.util.ts`** — `HR_TZ='Asia/Tashkent'`, `tashkentWeekday` (0=Yak..6=Shan, LOCKED), `startOfLocalDay`, `fromZonedTime` — fallback weekday + kun-chegara matematikasi.
- **`monthly-report.util.ts:51` peshin-anchor** (`fromZonedTime(\`${date}T12:00:00\`)` → `tashkentWeekday`) + `:41` `Date.UTC(y,m,0)` kalendar-matematika — resolveShift'ning weekday-fallback va `dayNumber` uchun aniq presedent.
- **`work-location.service.ts`** — CRUD + soft-delete + "biriktirilgan bo'lsa o'chirma" guard (jadval-delete uchun aynan).
- **`employee-schedule.service.ts:34-50` `replaceWeek`** — nested days delete-all+createMany-in-`$transaction`; `AttendanceConfigSchema` + `setConfig` (`:52-67`) — `scheduleId` biriktirish shu yerga qo'shiladi (workLocationId-mavjudlik-tekshiruvi shabloni).
- **`hr-employee.service.ts:92` list** — `$transaction([findMany({skip,take}), count])` → `{rows,total,page,limit}` pagination shakli.
- **`work-location.controller.ts`** — `JwtAuthGuard+HrPermissionGuard`, `@RequireHrPermission('employees','read'|'full')`, `@CurrentUser().accountId` — controller skeleti.
- **`ping-ingest.service.ts:150-155`, `davomat-autocheckout.cron.ts:52-63`** — hozirgi `findUnique(weekday)` chaqiruvlari resolveShift'ga migratsiya qilinadigan aniq nuqtalar.
- **FE:** `settings/work-locations/page.tsx` (list+modal+react-query+токенlar), `components/hr/week-schedule-grid.tsx:97-110` (`Input type="time"` + `Switch` day-off), design-system `SegmentedControl`/`NumberInput`/`Switch`/`Checkbox`/`DatePicker`/`Badge`/`Combobox`.

---

#### **Chekka holatlar (edge cases)**

- **Sikl belgisi (startDate'dan oldingi sanalar):** `diffDays` manfiy; JS `%` manfiy qaytaradi ⇒ **majburiy** `((x % n) + n) % n` normalizatsiya. Test: startDate=2026-07-24, cycleDays=7, date=2026-07-23 ⇒ diff=−1 ⇒ index 7 (oxirgi kun), 2026-07-17 ⇒ diff=−7 ⇒ index 7, 2026-07-16 ⇒ index 6.
- **DST-immunlik:** Tashkent 1991-dan beri fixed +05:00. `dayNumber` UTC-anchor kalendar ayirmasidan foydalanadi (wall-clock ms EMAS) ⇒ soat-siljish, DST bo'lmasa ham, hech qachon indeksni buzmaydi. Weekday-fallback peshin-anchor (`T12:00:00`) — yarim tunga eng yaqin chegara-xatolardan himoya.
- **`cycleDays` o'zgarganda kun-massiv nomuvofiqligi:** `dayIndex > cycleDays` bo'lgan `HrScheduleDay` qatorlar `resolveShift`'da hech qachon topilmaydi (o'lik data). PUT tranzaksiyasi `dayIndex ∈ [1..cycleDays]` bo'lmaganlarini o'chiradi; zod refine `days.length === cycleDays` (flexible uchun) majbur qiladi.
- **Free (Erkin):** fixed start yo'q ⇒ `computeLateMinutes` **hech qachon** chaqirilmaydi (0); `total` = xom worked (break yo'q); `overtime` = 0 (endTime yo'q). `cycleDays` server-tarafда **1 ga majburlanadi**, `days` = bo'sh (`[]`) yoziladi.
- **Dam kuni (`isWorkday=false`):** `isWorkday=false` ⇒ kechikish/absent ishlov berilmaydi (`status='dayoff'`), lekin xodim baribir check-in qila oladi (ping-ingest opt-in/geofence gate'lari mustaqil) — `lateMinutes=0`, report'да `present` ustiga tushmaydi (dam-kun mantig'i saqlanadi).
- **Yarim tundan oshuvchi smena (endTime < startTime, masalan 22:00→06:00):** MVP bir kalendar-kunlik shift'ni faraz qiladi (mavjud `EmployeeWorkSchedule` ham shunday — zod `startTime<endTime` refine). Kunlararo smena — **hujjatlangan cheklov**, defer (Ochiq savol).
- **Konkurentlik:** jadval-shablon o'zgarishi retroaktiv — o'tган kunlar uchun `resolveShift` YANGI kun-vaqtlarni qaytaradi, lekin `HrAttendance.lateMinutes` check-in vaqtida **snapshot** qilingan (ping-ingest yozadi) ⇒ o'tган kechikishlar qayta hisoblanmaydi (data-integrity: tarixiy kechikish barqaror). Oylik report status esa jonli resolveShift'dan hisoblanadi — bu **kutilган** (jadval tuzatilса, absent/dayoff yangilanadi). Buni NEXT.md/spec'да ochiq belgilash kerak.
- **Xodim biriktirilgan jadval arxivlanса:** `DELETE` `assignedCount>0` da bloklaydi ⇒ arxив-jadvalga hech qachon jonli reference qolmaydi. `scheduleId` FK `onDelete: SetNull` — faqat hard-delete (Account cascade) holatida null'ga tushadi, keyin fallback'ga qaytadi (xavfsiz).
- **Validatsiya:** zod — `startTime<endTime`; break berilса `breakStart<breakEnd` VA `startTime ≤ breakStart < breakEnd ≤ endTime`; `dayIndex` unikal 1..cycleDays; `extendedWorkMinutes ≥ 0`.

---

#### **resolveShift test rejasi (`resolve-shift.util.test.ts`, vitest)**

Sikl-matematikaga ustuvorlik (eng nozik qism):
1. **startDate = date** ⇒ `cycleDayIndex=1` (Kun 1).
2. **date = startDate + cycleDays** (bir to'liq sikl) ⇒ yana index 1 (o'ralish).
3. **date = startDate + cycleDays − 1** ⇒ index = cycleDays (oxirgi kun).
4. **startDate'dan oldin −1 kun** ⇒ index = cycleDays; **−cycleDays kun** ⇒ index = cycleDays; **−cycleDays−1** ⇒ cycleDays−1 (manfiy-modul to'g'riligi).
5. **Katta ofset** (masalan +1000 kun, cycleDays=5) ⇒ `1000 % 5 = 0 ⇒ index 1`.
6. **cycleDays=1** (har kun bir xil) ⇒ har doim index 1.
7. **Yil chegarasi kesib o'tish** (startDate=2025-12-30, date=2026-01-05, cycleDays=7) ⇒ diff=6 ⇒ index 7 (kabisa/oy-uzunligidan mustaqil, chunki `dayNumber` UTC-epoch).
8. **Kabisa 29-fevral** ichidan o'tuvchi diapazon ⇒ kun-hisob to'g'ri (Date.UTC 29-fevralni hisoblaydi).
9. **type='free'** ⇒ `isFree=true, isWorkday=true, startTime=null`, sana/sikldan qat'i nazar.
10. **`isWorkday=false` bo'lgan kun** ⇒ `isWorkday=false`, vaqtlar null.
11. **Yo'q `dayIndex`** (days massivi to'liq emas) ⇒ `isWorkday=false` (himoyaviy).
12. **Fallback: `schedule=null`, `weekFallback` berilган** ⇒ to'g'ri weekday tanlanadi (peshin-anchor); `isDayOff` weekday ⇒ dayoff.
13. **Ikkalasi null** ⇒ `source='none', isWorkday=false`.
14. **Backward-compat regress:** `scheduleId=null` bo'lган xodim uchun resolveShift natijasidan hisoblangan `lateMinutes` = eski `computeLateMinutes(findUnique(weekday))` bilan **bir xil** (bir nechta weekday × check-in vaqti kombinatsiyasi).

Hosil-yordamchilar: `computeOvertimeMinutes` — calcOvertime off ⇒ 0; on + endeb 30 min o'tган ⇒ 30; cap: raw 300 min, extended 240 ⇒ 240; free ⇒ 0. `computeTotalWorkedMinutes` — break to'liq ichida ⇒ break ayiriladi; check-out break o'rtasida ⇒ qisman overlap; break yo'q ⇒ xom worked; free ⇒ xom worked.

---

#### **Ochiq savollar** (har biriга default tanlangan)

1. **"Uzaytirilgan ish vaqti" semantikasi** — overtime cap (min(raw, extended)) deb talqin qildim. Muqobil: bu — end'dan keyin overtime *boshlanishidan oldingi* grace (raw − extended). **Default: cap** (yuqoridagi). TimePay UI'да aniqlashtirilса, faqat `computeOvertimeMinutes` bir qatori o'zgaradi.
2. **Kunlararo (tungi) smena** (endTime<startTime) — MVP qo'llab-quvvatlamaydi (mavjud `EmployeeWorkSchedule` ham). **Default: cheklov, defer**; keyin `endTime<startTime` ⇒ +1 kun kengaytmasi.
3. **Retroaktiv tahrir** — jadval o'zgarишi o'tган oylik statusni jonli qayta hisoblaydi, lekin snapshotlangan `lateMinutes`ni emas. **Default: shu (tarixiy kechikish barqaror, status jonli)** — spec'да ochiq hujjatlanган.
4. **Preset-autocomplete** ("Smena (8:00-17:00)") — **nice-to-have, defer**; MVP oddiy `Input`. Keyin akkаunt-darajali preset ro'yxati yoki qatiy massiv + `Combobox`.
5. **`EmployeeWorkSchedule` migratsiyasi** — hozircha ikkала model birga yashaydi (scheduleId=null ⇒ eski weekday). To'liq `HrSchedule`'ga ko'chirish — alohida keyingi ish. **Default: ikkovi birga, resolveShift birlashtiradi.**

### 5.2 Bo'limlar + Lavozimlar

### Bo'limlar (Departments) + Lavozimlar (Positions)

Ikki bir xil, eng sodda catalog-CRUD. Ikkalasi ham `HrRole` (`apps/api/src/modules/hr/hr-role/*`) pattern'ini va soft-delete uchun `HrWorkLocation` (`apps/api/src/modules/hr/attendance-geo/work-location.service.ts`) pattern'ini ko'zgu qiladi. Build-tartibida birinchi — hech qanday runtime-math yo'q, faqat name-registry.

**Muhim dizayn qarori:** `Employee` allaqachon **free-text** `department String? @db.VarChar(100)` (schema.prisma:302) va `position String? @db.VarChar(255)` (schema.prisma:262) ustunlariga ega — HR employee-list ularni filt르-qiladi (`hr-employee.service.ts:110-112` `department` bo'yicha) va employee-modal ularni yozadi. Shu sababli `HrDepartment`/`HrPosition` — **pick-list manbai (name registry)**, Employee'ga **FK EMAS**. Employee o'z `department`/`position` string'ini saqlaydi (mavjud xulq buzilmaydi, migration additive), catalog esa nomlar ro'yxatini beradi. Drill = position-id → name → employee-list `position=name` filtri. Bu «mirror department string filter» yondashuvi — eng kam qarz, prod-safe. (FK-variant «Ochiq savollar»da.)

---

**Ma'lumot modeli (Prisma)** — `packages/db/prisma/schema.prisma`, HR bloki oxiriga (mavjud `HrWorkLocation` yonida ~8871), additive:

```prisma
/// Bo'lim (department) nom-katalogi — employee.department string uchun pick-list.
/// Employee'ga FK YO'Q (department free-text string bo'lib qoladi — prod-safe).
model HrDepartment {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  name      String   @db.VarChar(150)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  // NOTE: DB @@unique atayin YO'Q — soft-delete'da arxivlangan bir xil nom
  // qayta-yaratishni bloklamasin; active-uniqueness service'da (findFirst
  // archived:false) tekshiriladi — HrRoleService.create pre-check pattern'i.
  @@index([accountId, archived])
  @@map("hr_departments")
}

/// Lavozim (position) nom-katalogi — employee.position string uchun pick-list.
model HrPosition {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  name      String   @db.VarChar(150)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, archived])
  @@map("hr_positions")
}
```

`Account` modeliga back-relation qatorlari qo'shiladi (additive): `hrDepartments HrDepartment[]` va `hrPositions HrPosition[]`. Migration `// all nullable/defaulted, prod-safe` — yangi jadvallar, hech bir mavjud ustun ALTER qilinmaydi. `@db.VarChar(150)` — `HrWorkLocation.name` bilan bir xil (schema.prisma:8858). `@@index([accountId, archived])` — aynan `HrWorkLocation` (schema.prisma:8869).

Employee-filtрга position qo'shish (mavjud `department` filtriга parallel), `HrEmployeeFilterSchema` (`hr-employee.schema.ts:102-113`):
```ts
position: z.string().optional(),   // department yonida
```
va `HrEmployeeService.list` where-blok (`hr-employee.service.ts:110` dan keyin):
```ts
if (filter.position) { where.position = filter.position; }
```

---

**API endpoints** — ikki bir xil controller. Yo'l: `hr/departments`, `hr/positions`.

| Metod | Path | Maqsad | Req | Resp |
|---|---|---|---|---|
| GET | `/hr/departments?archived=true` | ro'yxat (default active) | — | `HrDepartment[]` (+ ixtiyoriy `employeeCount`) |
| POST | `/hr/departments` | yaratish | `{ name }` | `HrDepartment` |
| PUT | `/hr/departments/:id` | tahrir (name) | `{ name }` | `HrDepartment` |
| DELETE | `/hr/departments/:id` | soft-delete (archive) | — | `{ ok: true }` |

`hr/positions` — bayt-ba-bayt bir xil (`HrPosition`). Response'ga `employeeCount` qo'shish `HrWorkLocationService.list` dagi `include: { _count: … }` kabi ishlamaydi (FK yo'q), shuning uchun list servisda `employee.groupBy({ by: ['department'] })` yoki har nom uchun `count` bilan hisoblanadi — **ixtiyoriy**, agar UI'да «N xodim» ko'rsatilsa. Boshlang'ich slice uchun `employeeCount`'ni positions'da ko'rsatamiz (drill mazmunini beradi), departments'да tashlab qoldirsa ham bo'ladi.

Ruxsat (guard): `@UseGuards(JwtAuthGuard, HrPermissionGuard)` + `@RequireHrPermission('employees', 'read')` GET'да, `('employees', 'full')` mutatsiyalarda — aynan `HrWorkLocationController` (`work-location.controller.ts:26,32,38,47`). `'employees'` domeni tanlandi (roles'даги `'settings'` emas), chunki bu employee-adjacent org-katalog va employee-modal dropdown'i uni yuklashi kerak (`'employees','read'` bilan).

---

**Backend modullar** — yangi papkalar `apps/api/src/modules/hr/hr-department/` va `.../hr-position/`, har biri 5 fayl (`HrRoleModule` strukturasini aynan takrorlaydi — `hr-role.module.ts`):

- `hr-department.schema.ts` — zod: `CreateHrDepartmentSchema = z.object({ name: z.string().trim().min(1,'Nom kiritilishi shart').max(150) })`; `UpdateHrDepartmentSchema` = bir xil (`{ name }`). `HrRoleSchema` (`hr-role.schema.ts`) dan soddaroq — `value` yo'q, faqat `name`. Type export `Create…Input`/`Update…Input`.
- `hr-department.service.ts` — `list/create/update/remove`, `HrWorkLocationService` (`work-location.service.ts`) + `HrRoleService` gibridi:
  - `list(accountId, includeArchived=false)` → `findMany({ where: { accountId, ...(includeArchived?{}:{archived:false}) }, orderBy:{name:'asc'} })` (work-location:10-13).
  - `create` → active-uniqueness pre-check `findFirst({ where:{accountId,name,archived:false} })` → bor bo'lsa `BadRequestException('Bu bo'lim allaqachon mavjud')` (HrRoleService:17-20 pattern), so'ng `create({ data:{accountId,name} })`.
  - `update` → `findOrThrow(accountId,id)` (`NotFoundException("Bo'lim topilmadi")`) + qayta nom-collision pre-check (o'zidan boshqa active row) → `update({ data:{name} })`.
  - `remove` → soft-delete: `update({ where:{id}, data:{archived:true} })`, `{ ok:true }` (work-location:48-49). **Blok tekshiruvi:** `employee.count({ where:{accountId, department:row.name, archived:false} }) > 0` bo'lsa `BadRequestException` («bu bo'limga xodimlar biriktirilgan») — work-location:40-47 pattern'i (u `workLocationId` bo'yicha; bu yerda `department` name bo'yicha). Position servisida `where.position = row.name`.
- `hr-department.controller.ts` — `@Controller('hr/departments')`, GET/POST/PUT/DELETE — `HrWorkLocationController` aynan (query `archived==='true'` bilan).
- `hr-department.module.ts` — `imports:[PrismaModule, AuthModule, HrAuthModule]`, `HrRoleModule` (`hr-role.module.ts`) aynan.
- `hr-department.service.test.ts` — vitest, co-located: (1) create nom-collision → 400; (2) list default active-only; (3) remove active row bilan → 400 blok, bo'sh bo'lsa → `archived:true`; (4) cross-account izolyatsiya (boshqa accountId'ning row'i → 404). Position uchun ayni testlar `position` field bilan.

`hr-position/*` — identik, `HrPosition` + `position`/`Lavozim` matnlari bilan.

Ro'yxatga olish: `apps/api/src/modules/hr/hr.module.ts` `imports` massiviga `HrDepartmentModule`, `HrPositionModule` qo'shiladi (`HrRoleModule` yonida, hr.module.ts:54).

---

**Frontend** — yangi route'lar `apps/web/src/app/(app)/hr/departments/page.tsx` va `.../hr/positions/page.tsx`, plus drill `.../hr/positions/[id]/employees/page.tsx`.

- **Departments page** — `HrRolesPage` (`apps/web/src/app/(app)/hr/settings/roles/page.tsx`) ning soddalashtirilgan nusxasi:
  - Header: `h1` `t('title')` + `Button` `+ {t('create_button')}` (roles:72-80).
  - Bitta-ustunli jadval: header `t('col_name')` + `t('col_actions')` (o'ng), har row `name` + ghost icon `✏️` (edit) va `❌` (delete) tugmalari (roles:96-159). `Skeleton`/`ErrorState`/`EmptyState` uch holati (roles:83-95).
  - `DepartmentFormModal` — bitta `Input` (name), `Modal` + footer Bekor/Saqlab (roles:174-306) — lekin **faqat `label`/name maydoni** (roles'даги immutable `value` maydonisiz). `useEffect` bilan open'да initial'дан to'ldiriladi, `Enter` submit qiladi.
  - `useConfirm().confirm({ title:t('delete_confirm'), description:row.name, tone:'destructive', confirmLabel:tCommon('delete') })` → `deleteMut` (roles:59-68, 50-57). Backend blok-xatosi `toast.error(tCommon('action_failed'), {description:e.message})`.
  - react-query: `queryKey:['hr-departments']`, `hrDepartmentApi.list()`; mutatsiyalarда `invalidateQueries`.
  - Import'lar: `Button, Input, Modal, EmptyState, ErrorState, Skeleton, useConfirm, useToast` `@moysklad/ui`dan; `useTranslations('pages.hrDepartments')` + `useTranslations('common')`. `var(--ms-*)` token'lar aynan roles'даги classlar.
- **Positions page** — departments bilan bir xil, `pages.hrPositions`, LEKIN row **bosiладi** → drill. Employee-list `<tr onClick>`/`onKeyDown` (Enter/Space) pattern'i (`hr/employees/page.tsx:290-302`) bilan `router.push('/hr/positions/'+row.id+'/employees')`. Edit/delete tugmalari `<td onClick={e=>e.stopPropagation()}>` ichида (employees:352-356 pattern) — click drill'ni chaqirmaydi. Ixtiyoriy `employeeCount` badge ustuni.
- **Drill `positions/[id]/employees/page.tsx`** — `useParams()` bilan `id` → `hrPositionApi.findOne(id)` (yoki list'дан topib) → position.name; keyin **mavjud employee-list'ni qayta ishlatadi**: eng yengil yo'l — `hr/employees/page.tsx` dagi jadval-render'ni `position` filtri qattiq-berilgan holda ko'rsatish. `hrEmployeeApi.list({ position: name, limit:50 })` (`hr-api.ts:117`), read-only jadval (name/roles/telegram/department ustunlari), «← Lavozimlar» qaytish havolasi, `h1` = position nomi. Bulk/create'siz — bu filterlangan ko'rinish. Agar to'liq reuse kerak bo'lsa, employees `page.tsx` jadval-qismini kichik `<EmployeeTable filter=…>` ga ajratish tavsiya (open savol).
- **Sub-nav** — `apps/web/src/app/(app)/layout.tsx` `hrSubNav` (407-418) ga ikki entry qo'shiladi (masalan `employees` dan keyin):
  ```ts
  { key: 'departments', label: tHr('departments'), href: '/hr/departments' },
  { key: 'positions',   label: tHr('positions'),   href: '/hr/positions' },
  ```

**Holatlar:** loading (`Skeleton`), error (`ErrorState` + retry), bo'sh (`EmptyState` `t('empty')`), save-xato (modal ichида `role="alert"` matn — roles:294-302), delete-blok (toast). Drill: position topilmasa → «lavozim topilmadi» EmptyState.

---

**hr-api.ts qo'shimchalari** — `apps/web/src/lib/hr-api.ts`, `hrRoleApi` (146-153) va `hrWorkLocationApi` (775-781) yonida:

```ts
export interface HrDepartment {
  id: string; name: string; archived: boolean; employeeCount?: number;
}
export const hrDepartmentApi = {
  list: () => api.get<HrDepartment[]>('/hr/departments'),
  create: (data: { name: string }) => api.post<HrDepartment>('/hr/departments', data),
  update: (id: string, data: { name: string }) =>
    api.put<HrDepartment>(`/hr/departments/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/departments/${id}`),
};

export interface HrPosition {
  id: string; name: string; archived: boolean; employeeCount?: number;
}
export const hrPositionApi = {
  list: () => api.get<HrPosition[]>('/hr/positions'),
  findOne: (id: string) => api.get<HrPosition>(`/hr/positions/${id}`),
  create: (data: { name: string }) => api.post<HrPosition>('/hr/positions', data),
  update: (id: string, data: { name: string }) =>
    api.put<HrPosition>(`/hr/positions/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/positions/${id}`),
};
```
`HrEmployeeFilter` interfeysiga (`hr-api.ts:37-51`) `position?: string;` qo'shiladi (drill uchun).

---

**i18n** — `apps/web/src/messages/{ru,uz}.json`. Yangi namespace `pages.hrDepartments` + `pages.hrPositions` (`pages.hrRoles`, ru.json:6709 shakli); nav `nav.hr` (ru.json:1025) ga `departments`/`positions`.

`pages.hrDepartments`:
| key | ru | uz |
|---|---|---|
| title | «Отделы» | «Bo'limlar» |
| subtitle | «Отделы сотрудников» | «Xodim bo'limlari» |
| create_button | «Новый отдел» | «Yangi bo'lim» |
| col_name | «Название отдела» | «Bo'lim nomi» |
| col_actions | «Действия» | «Amallar» |
| create_title | «Новый отдел» | «Yangi bo'lim» |
| edit_title | «Редактирование отдела» | «Bo'limni tahrirlash» |
| form_name | «Название» | «Nomi» |
| delete_confirm | «Удалить отдел?» | «Bo'lim o'chirilsinmi?» |
| empty | «Отделов пока нет» | «Hozircha bo'lim yo'q» |
| save / cancel | «Сохранить» / «Отмена» | «Saqlash» / «Bekor qilish» |

`pages.hrPositions` (bir xil shakl, «lavozim»):
| key | ru | uz |
|---|---|---|
| title | «Должности» | «Lavozimlar» |
| subtitle | «Должности сотрудников» | «Xodim lavozimlari» |
| create_button | «Новая должность» | «Yangi lavozim» |
| col_name | «Название должности» | «Lavozim nomi» |
| col_employees | «Сотрудники» | «Xodimlar» |
| create_title / edit_title | «Новая должность» / «Редактирование должности» | «Yangi lavozim» / «Lavozimni tahrirlash» |
| form_name | «Название» | «Nomi» |
| delete_confirm | «Удалить должность?» | «Lavozim o'chirilsinmi?» |
| empty | «Должностей пока нет» | «Hozircha lavozim yo'q» |
| drill_title | «Сотрудники: {name}» | «Xodimlar: {name}» |
| drill_back | «← Должности» | «← Lavozimlar» |
| drill_empty | «В этой должности нет сотрудников» | «Bu lavozimda xodim yo'q» |
| save / cancel | «Сохранить» / «Отмена» | «Saqlash» / «Bekor qilish» |

`nav.hr` qo'shimcha: `departments` = ru «Отделы» / uz «Bo'limlar»; `positions` = ru «Должности» / uz «Lavozimlar». Ikkala locale'да barcha key mavjud bo'lishi (gate: key-existence ru+uz) va hardcoded Cyrillic yo'q — barcha matn `t(...)` orqali.

---

**Mavjud koddan qayta ishlatish** (o'qib tasdiqlangan yo'llar):
- `apps/api/src/modules/hr/hr-role/{controller,service,schema,module}.ts` — CRUD skeleti, uniqueness pre-check (`service.ts:17-20`), `NotFoundException`/`BadRequestException` uslubi.
- `apps/api/src/modules/hr/attendance-geo/work-location.service.ts` — soft-delete (`archived:true`, 48-49), `includeArchived` list (10-13), assign-blok delete (40-47), `findOrThrow` (52-56).
- `apps/api/src/modules/hr/attendance-geo/work-location.controller.ts` — `?archived=true` query + `RequireHrPermission('employees',…)` guard'lar.
- `apps/api/src/modules/hr/hr-employee/hr-employee.service.ts:110-112` va `hr-employee.schema.ts:102-113` — `department` filtri (position filtrini shu bo'yicha qo'shamiz).
- `apps/web/src/app/(app)/hr/settings/roles/page.tsx` — butun FE CRUD sahifa + `RoleFormModal` (single-field modal) + `useConfirm`/`useToast`/react-query invalidatsiya.
- `apps/web/src/app/(app)/hr/employees/page.tsx:290-356` — clickable-row drill + `stopPropagation` action-cell; `hr-api.ts:117` `hrEmployeeApi.list(filter)`.
- `apps/web/src/lib/hr-api.ts:146-153, 775-781` — `hrRoleApi`/`hrWorkLocationApi` client shakli.
- `apps/web/src/app/(app)/layout.tsx:407-418` — `hrSubNav` massivi.
- `packages/db/prisma/schema.prisma:8837-8871` — `HrRole`/`HrWorkLocation` model konvensiyalari (`@map`/`@@map`/`@db.Timestamptz()`/`@@index`).

---

**Chekka holatlar (edge cases):**
- **Soft-delete + qayta-nom kolliziyasi:** DB `@@unique([accountId,name])` **atayin qo'yilmaydi** — arxivlangan «Sotuv» bo'limini o'chirib, keyin yangi «Sotuv» yaratish P2002 bermasligi kerak. Uniqueness faqat **active** (`archived:false`) rowlar orasида service pre-check bilan (`findFirst`). Concurrency: ikki bir vaqtli create bir xil nomni TOCTOU-о'tkazishi mumkin (kichik oyna, DB-unique yo'q) — ikkinchi duplicate `archived:false` row sifatida qoladi; boshlang'ich slice uchun qabul qilinadi (dedup keyingi tozalash). Xohlansa `@@unique([accountId,name])` + partial-index alternativasi (faqat active) — Postgres partial unique Prisma'да to'g'ridan-to'g'ri yo'q, shuning uchun service-check tanlandi.
- **Delete-blok = data-integrity:** bo'lim/lavozimni o'chirishда unga biriktirilgan **active** xodim bor bo'lsa (`employee.count({department:name / position:name, archived:false})>0`) → 400, xabar «avval xodimlarni ko'chiring». Arxivlangan xodimlar bloklaydi-mi? Yo'q — faqat active hisoblanadi (arxivдаги xodim frozen). Bu `HrWorkLocationService.remove` (40-47) mantig'i.
- **Rename ⇒ orphan string:** catalog nomi o'zgartirilsa, employee'ning `department`/`position` string'i ESKI nomда qoladi (FK yo'q). Natijada drill/filter eski nomga mos kelmaydi. Boshlang'ich slice: rename kam va delete-blok active xodim bor bo'lsa taqiqlaydi — lekin nom o'zgarтirish blok qilinmaydi. Default: update-service rename paytида **matching employee stringlarни ko'chirmaydi** (additive-safe, no bulk data mutation), buni open-savolда qayd etamiz. Muqobil: rename'да `employee.updateMany({where:{department:old}, data:{department:new}})` — lekin bu «ALTER existing data» qoidasiga yaqin, shuning uchun default OFF.
- **Timezone:** bu slice'да vaqt-hisobi yo'q (`createdAt`/`updatedAt` faqat audit) — `@db.Timestamptz()` yetarli, Asia/Tashkent math kerak emas.
- **Multi-tenant:** har query `accountId` scoped (`findFirst({where:{id,accountId}})` — cross-account 404). `onDelete: Cascade` account o'chsa tozalaydi.
- **Bo'sh/whitespace nom:** zod `.trim().min(1)` — bo'sh yoki faqat-probel rad etiladi (400). `.max(150)` DB VarChar bilan mos (P2000 oldini oladi).
- **Position drill noto'g'ri id:** `findOne` 404 → FE «lavozim topilmadi» EmptyState; xato `id` (non-uuid) backend zod/route'да rad etiladi.

---

**Ochiq savollar** (default tanlangan):
1. **FK vs free-text string.** Default: **free-text string** (Employee.department/position o'zgarmaydi, catalog = pick-list) — eng kam qarz, mavjud filter/modal buzilmaydi. Muqobil (kelajak): `Employee.departmentId/positionId` nullable FK + backfill — lekin bu alohida migration/sprint, bu slice'дan tashqarida.
2. **Rename-cascade.** Default: catalog nom o'zgarganда employee stringlari **ko'chirilmaydi** (no bulk data mutation, prod-safe). Agar mahsulot rename'ni «hamma xodimда ko'rinsin» talab qilsa — keyingi slice'да `updateMany` opt-in bilan.
3. **Drill reuse darajasi.** Default: drill sahifasi employee-list'ni `hrEmployeeApi.list({position})` bilan **yangi soddalashtirilgan jadval** sifatida chizadi (bulk/create'siz). To'liq DRY xohlansa — `hr/employees/page.tsx` jadval-qismini reusable `EmployeeTable` komponentiga ajratish (kengroq refactor, alohida ish).
4. **Departments ham drill qilsinmi?** TZ faqat positions drill'ini so'raydi. Default: departments = pure single-column CRUD, drill'siz. Simmetriya kerak bo'lsa keyin qo'shiladi (arzon).
5. **Employee-modal dropdown integratsiyasi.** Bu catalog'lar hozirча employee-modal'даги department/position **free-text input'larni dropdown'ga aylantirmaydi** (o'sha modal bu slice'да tegilmaydi). Default: alohida keyingi ish — modal `hrDepartmentApi.list()`/`hrPositionApi.list()` bilan datalist/select'ga o'tadi.

### 5.3 Boshqaruv paneli + Qo'lda davomat

### Attendance Dashboard (Boshqaruv paneli) + Manual Attendance modal

Bu bo'lim `/hr` bosh sahifasini telegram-markazli paneldan **davomat-markazli boshqaruv paneli**ga aylantiradi va admin uchun **qo'lda davomat yaratish** modalini qo'shadi. Butun hisob-kitob mavjud GPS-davomat dvigatelidan (`attendance-geo`) qayta ishlatiladi; yangi jadval/schema minimal.

**Ma'lumot modeli (Prisma)**

- **Yangi model YO'Q.** To'liq `reuse`:
  - `HrAttendance` (`schema.prisma:8613`) — `checkInTime` / `checkOutTime` / `lateMinutes` / `source` / `workLocationId` / `notes` allaqachon bor. Dashboard faqat o'qiydi + qo'lda yozuv yaratadi/yopadi.
  - `EmployeeWorkSchedule` (`schema.prisma:8875`) — kunlik `startTime`/`endTime`/`isDayOff` (overtime/late hisobi uchun).
  - `HrWorkLocation` (`schema.prisma:8855`) — `Filial` nomlari (`branches[]` uchun name-lookup; `HrAttendance.workLocationId` — relation'siz raw FK, shuning uchun nomni alohida map bilan yechamiz).
  - `Employee` (`schema.prisma:239`) — `name` / `department` (jadval subtitle) / `attendanceOptIn` / `workLocationId` / `archived`.
- **Bitta additive, prod-safe o'zgarish (ixtiyoriy, tavsiya):** qo'lda yaratilgan davomatga izoh manbasini ajratish uchun `HrAttendance`ga yangi ustun SHART EMAS — mavjud `notes` (`String?`) va `source` (`'auto_gps' | 'manual'`) yetarli. Migratsiya kerak emas.

**API endpoints**

1. **Yangi — dashboard summary (asosiy deliverable):**
   `GET /hr/attendance/dashboard?date=YYYY-MM-DD` (default = bugun, Asia/Tashkent).
   Guard: `@RequireHrPermission('employees','read')` — `HrDavomatAdminController` (`davomat-admin.controller.ts:24`, u allaqachon `@Controller('hr/attendance')` va `live`/`report/monthly` shu yerda).
   Response:
   ```jsonc
   {
     "date": "2026-07-24",
     "counts": { "all": 42, "atWork": 18, "late": 5, "absent": 9 },
     "rows": [{
       "employeeId": "uuid",
       "employee": { "id": "uuid", "name": "Ali Valiyev", "department": "Sotuv" },
       "checkIn": "2026-07-24T09:03:00+05:00",   // eng erta kelish (ISO, +05), yoki null
       "checkOut": "2026-07-24T18:20:00+05:00",  // eng kech ketish, yoki null (hali ishda)
       "lateMinutes": 3,
       "overtimeMinutes": 20,
       "totalMinutes": 557,
       "branches": ["Chilonzor", "Yunusobod"]
     }]
   }
   ```
   `counts` semantikasi (mustaqil sanaladi, TimePay kabi):
   - `all` = kuzatilayotgan faol xodimlar soni (`archived=false && attendanceOptIn=true`) — `rows.length`.
   - `atWork` = ochiq yozuvi bor (`checkIn && !checkOut`) xodimlar.
   - `late` = o'sha kungi birinchi kelishida `lateMinutes > 0` bo'lganlar (⊂ present).
   - `absent` = o'sha kunga jadvali bor (kun `isDayOff=false`) LEKIN kelish yozuvi yo'q xodimlar. (Dam-olish kunidagilar hech bir kategoriyaga kirmaydi — `all ≠ atWork+late+absent` bo'lishi normal; buni izohlaymiz.)

2. **Kengaytiriladi — qo'lda kelish (modal «Kelish»):**
   Mavjud `POST /hr/attendance/check-in` (`hr-attendance.controller.ts:45`) hozir faqat `{ employeeId, notes }` qabul qiladi va `new Date()` (hozir) bilan yozadi, `source`/`lateMinutes` o'rnatmaydi. Kengaytiramiz:
   ```jsonc
   POST /hr/attendance/check-in
   { "employeeId": "uuid", "at": "2026-07-24T09:00:00+05:00", "workLocationId": "uuid|null", "notes": "…|null" }
   ```
   — `at` (ixtiyoriy, default now), `workLocationId` (ixtiyoriy) qo'shiladi; server `source:'manual'` o'rnatadi va `resolveShift(employee, at)` + `computeLateMinutes(at, schedule, HR_TZ)` orqali `lateMinutes` hisoblaydi (hozir bu qo'lda yo'lda 0 qolib ketmoqda — bug-fix).

3. **Yangi — qo'lda ketish (modal «Ketish»):**
   Mavjud `POST /hr/attendance/:id/check-out` **row-id** talab qiladi, ammo modal xodimni tanlaydi (row-id yo'q). Shuning uchun xodim+sana bo'yicha yopadigan yangi endpoint:
   ```jsonc
   POST /hr/attendance/check-out
   { "employeeId": "uuid", "at": "2026-07-24T18:00:00+05:00", "notes": "…|null" }
   ```
   — `at` kunining ochiq yozuvini topib (`checkOutTime: null`), `at` bilan atomik yopadi (`updateMany where checkOutTime:null` — poyga himoyasi, `ping-ingest.service.ts:173` naqshi). Ochiq yozuv bo'lmasa → `no_open_record` (400). Eski `:id/check-out` bugun-tab uchun saqlanadi.

**Backend modullar**

- `apps/api/src/modules/hr/attendance-geo/davomat-report.service.ts` — **kengaytirish**: yangi `dashboard(accountId, date)` metodi. `live()` (`:83`) naqshini umumlashtiradi: (a) kunning barcha `HrAttendance` yozuvlarini xodim bo'yicha guruhlash; (b) jadval (`employeeWorkSchedule`) + `attendanceOptIn` bo'yicha kuzatilayotgan cohort'ni yig'ish; (c) har xodim uchun overtime/total/late/branches aggregatsiyasi. Barcha vaqt-matematika `HR_TZ` (`Asia/Tashkent`) da.
- **Yangi pure util** `apps/api/src/modules/hr/attendance-geo/attendance-dashboard.util.ts` (+ `.test.ts`) — testlanadigan sof mantiq:
  - `aggregateEmployeeDay(rows, schedule, tz, now)` → `{ checkIn, checkOut, lateMinutes, totalMinutes, overtimeMinutes }`. Bir kunda bir xodimning bir nechta kelish/ketish sikllari bo'lishi mumkin (chiqib qaytgan) → `checkIn` = eng erta, `checkOut` = eng kech (biror segment ochiq bo'lsa `null`), `totalMinutes` = yopilgan segmentlar yig'indisi (+ ochiq segment uchun `now` gacha, faqat sana = bugun bo'lsa), `lateMinutes` = eng erta yozuvdan.
  - `computeOvertimeMinutes(checkOut, schedule, tz)` = `checkOut ? max(0, floor((checkOut − scheduledEndUtc)/60000)) : 0`, bunda `scheduledEndUtc = fromZonedTime(\`${localDate}T${schedule.endTime}:00\`, tz)`. Dam-olish/jadvalsiz kun → butun ishlagan vaqt overtime (default, quyida ochiq savol).
- `hr-attendance.service.ts` — **kengaytirish**: `checkIn()` (`:41`) `at`/`workLocationId`/`source:'manual'`/`lateMinutes` qo'llab-quvvatlaydi; kunlik dublikat-tekshiruv `at` kunining lokal chegarasi bo'yicha (`startOfLocalDay(at)`), `new Date()` emas. Yangi `checkOutByEmployee(accountId, {employeeId, at, notes})`.
- `hr-attendance.schema.ts` — `CheckInSchema`ga `at: z.coerce.date().optional()`, `workLocationId: z.string().uuid().nullable().optional()`; yangi `ManualCheckOutSchema = { employeeId, at?, notes? }`.
- `hr-attendance.controller.ts` — `check-in` body kengaytirilgan schema; yangi `@Post('check-out')` (`@RequireHrPermission('employees','full')`).
- **Eski telegram dashboard** (`hr-dashboard.service.ts` + `hr-dashboard.controller.ts` + `GET /hr/dashboard/summary`) **o'zgarishsiz saqlanadi** — faqat FE'da chaqiruvchi joyi `/hr/messages`ga ko'chiriladi (pastga qarang).

**Frontend**

- `apps/web/src/app/(app)/hr/page.tsx` — **to'liq qayta yoziladi**: davomat boshqaruv paneli.
  - Sarlavha `t('title')` («Xodimlar boshqaruv paneli») + o'ngda **Sana date-picker** (`Input type="date"`, default bugun `formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')` — `attendance/page.tsx:55` naqshi) + **«Qo'lda davomat yaratish»** tugmasi (`@moysklad/ui` `Button`).
  - **4 KPI stat-card** (mavjud `StatCard`ni `page.tsx:113` dan qayta ishlatib rang-tonlar bilan): Barchasi (`neutral`→ko'k emas, `all`), Ishda (`atWork`), Kech (`warning`, `late`), Ishda emas (`destructive`, `absent`). Rang tokenlari `var(--ms-text-success/warning/destructive/strong)`.
  - **«Xodimlar davomati» jadvali** — ustunlar: Xodim (`Avatar name=... size="sm"` + ism + `department` subtitle, `attendance/page.tsx:164-168` naqshi) / Kirish (`HH:mm`, kech bo'lsa `--ms-text-destructive` — `:170-178` naqshi) / Chiqish (`HH:mm` yoki `--:--`) / Qo'shimcha (`fmtOvertime`) / Jami (`fmtHhMm`) / Filiallar (`branches.join(', ')`).
  - react-query: `useQuery({ queryKey:['hr-attendance-dashboard', date], queryFn:()=>hrDavomatReportApi.dashboard(date), refetchInterval:30_000 })` — sana o'zgarganda avtomatik qayta yuklanadi; jonli qayta-hisob refetch orqali.
  - Holatlar: `Skeleton` (loading, `page.tsx:40`), `EmptyState` (o'sha sanada cohort bo'sh).
- **Yangi format-helper** `apps/web/src/lib/attendance-format.ts`:
  - `fmtOvertime(minutes, { h, m })` → `"02s 01d"` (`${pad2(Math.floor(min/60))}${h} ${pad2(min%60)}${m}`), bunda `h`/`m` qo'shimchalari i18n'dan (`unit_hour_short`/`unit_minute_short`) — ru «ч/м», uz «s/d». (Mavjud `attendance/page.tsx:35` `duration()` uz-matnni hardcode qiladi — no-hardcoded gate'ga qarshi, yangi helper i18n-driven.)
  - `fmtHhMm(minutes)` → `"HH:MM"` (sof raqamli, locale'siz): `${pad2(min/60|0)}:${pad2(min%60)}`.
- **Yangi modal** `apps/web/src/app/(app)/hr/_components/manual-attendance-modal.tsx` (mavjud `check-in-modal.tsx` naqshi asosida):
  - Maydonlar: Xodim `NativeSelect` (placeholder `t('select_employee')` = «Xodimni tanlang»; `hrEmployeeApi.list({limit:200})`); Filial `NativeSelect` (placeholder «Shoxobchani tanlang»; `hrWorkLocationApi.list()`); Sana `Input type="date"` (default = paneldagi sana); Vaqt `Input type="time"`; Izoh `Textarea` (ixtiyoriy, `maxLength:500`).
  - Ikki tugma: **Kelish** → `hrAttendanceApi.checkIn({employeeId, at, workLocationId, notes})`; **Ketish** → `hrAttendanceApi.checkOutManual({employeeId, at, notes})`. `at` = `parseLocalIso(\`${date}T${time}\`)` mantiqi FE'da `${date}T${time}` ISO (offset'siz → server `Asia/Tashkent` deb qabul qiladi, `tz.util.ts:18` `parseLocalIso`).
  - `useMutation` onSuccess → `qc.invalidateQueries(['hr-attendance-dashboard'])` + `toast.success` + yopish; onError → xato matni (`useToast`, `page.tsx` naqshlari).
- **Eski telegram paneli ko'chiriladi → `/hr/messages`** (default tanlov): `messages/page.tsx` yuqorisiga statistik-strip (`hrDashboardApi.summary()` + 7-kunlik `AreaChart` + so'nggi xabarlar) sifatida qo'yiladi. Sabab: mazmun butunlay telegram/outbox haqida, `hr-messages` sahifasi bilan bir domen; `/hr` endi sof davomat. (Muqobil: `/hr`da yig'iladigan ikkilamchi bo'lim — ochiq savolga qarang.)
- **Sub-nav** (`layout.tsx:407`) o'zgarmaydi — `home` allaqachon `/hr`ga ishora qiladi.
- **FE API klient** `apps/web/src/lib/hr-api.ts`:
  - `hrDavomatReportApi`ga `dashboard: (date?) => api.get<HrAttendanceDashboard>('/hr/attendance/dashboard'+qs)` + `HrAttendanceDashboard` tipi.
  - `hrAttendanceApi.checkIn` inputiga `at?`/`workLocationId?` qo'shiladi; yangi `checkOutManual: (data) => api.post('/hr/attendance/check-out', data)` (mavjud `checkOut(id)` saqlanadi).

**i18n**

`pages.hrDashboard` (mavjud, `ru.json:6550` / `uz.json:6550`) kengaytiriladi. Eski telegram kalitlari (`total_counterparties`, `telegram_connected`, `sent_today`, `failed`, `pending_tasks`, `pending_reviews`, `sent_7days`, `recent`, `recent_empty`) **saqlanadi** (endi `/hr/messages` sahifasida ishlatiladi). Yangi kalitlar (ru + uz):

| key | ru | uz |
|---|---|---|
| `title` | «Панель управления сотрудниками» | «Xodimlar boshqaruv paneli» |
| `create_manual` | «Создать посещаемость вручную» | «Qo'lda davomat yaratish» |
| `kpi_all` | «Все» | «Barchasi» |
| `kpi_at_work` | «На работе» | «Ishda» |
| `kpi_late` | «Опоздали» | «Kech» |
| `kpi_absent` | «Отсутствуют» | «Ishda emas» |
| `table_title` | «Посещаемость сотрудников» | «Xodimlar davomati» |
| `col_check_in` | «Приход» | «Kirish» |
| `col_check_out` | «Уход» | «Chiqish» |
| `col_overtime` | «Переработка» | «Qo'shimcha» |
| `col_total` | «Всего» | «Jami» |
| `col_branches` | «Филиалы» | «Filiallar» |
| `unit_hour_short` | «ч» | «s» |
| `unit_minute_short` | «м» | «d» |
| `empty_day` | «На эту дату нет данных» | «Bu sanada ma'lumot yo'q» |
| `manual_title` | «Создать посещаемость вручную» | «Qo'lda davomat yaratish» |
| `select_branch` | «Выберите филиал» | «Shoxobchani tanlang» |
| `field_date` | «Дата» | «Sana» |
| `field_time` | «Время» | «Vaqt» |
| `btn_arrive` | «Приход» | «Kelish» |
| `btn_leave` | «Уход» | «Ketish» |

`select_employee` / `employee` / `notes` — `pages.hrAttendance` (`ru.json:6329-6344`) dan qayta ishlatiladi (`useTranslations('pages.hrAttendance')` modalda). `--:--` — literal, i18n emas.

**Mavjud koddan qayta ishlatish**

- `davomat-report.service.ts:83` `live()` — present + scheduled-but-absent yig'ish naqshi; `dashboard()` shuning umumlashtirilgani.
- `late-minutes.util.ts:10` `computeLateMinutes(checkInUtc, schedule, tz)` — kech-daqiqa (qo'lda check-in'da ham qayta ishlatiladi).
- Area-2 `resolveShift(employee, date)` — kun jadvalini (`DaySchedule`) yechish; hozir bu mantiq `ping-ingest.service.ts:150-154` va `davomat-report.service.ts:96-104` ichida inline; overtime/late uchun markazlashtiriladi.
- `tz.util.ts` — `startOfLocalDay` (`:29`), `tashkentWeekday` (`:39`), `parseLocalIso` (`:18`), `HR_TZ` (`:3`).
- `ping-ingest.service.ts:173` — atomik `updateMany where checkOutTime:null` (qo'lda ketishda poyga himoyasi).
- FE: `page.tsx:113` `StatCard`; `attendance/page.tsx` `fmtTime`/`Avatar`/kech-rang naqshlari; `check-in-modal.tsx` modal strukturasi; `hr-api.ts:747-851` davomat API naqshi.
- `monthly-report.util.ts:33-36` — «kunning birinchi kelishi» aggregatsiya g'oyasi (dashboard ko'p-siklni kengaytiradi).

**Chekka holatlar (edge cases)**

- **Timezone:** barcha kun-chegaralari `startOfLocalDay(date)` (Tashkent), UTC emas — `hr-attendance.service.ts:12` naqshi. `at` offset'siz kelsa `parseLocalIso` uni Tashkent deb oladi.
- **Bir kunda ko'p sikl:** xodim chiqib-qaytishi → bir nechta `HrAttendance` row. Aggregatsiya: eng erta kirish, eng kech chiqish, `totalMinutes` = yopilgan segmentlar yig'indisi. `atWork` = biror segment ochiq.
- **Ochiq yozuv + jonli Jami:** sana = bugun va `checkOut=null` bo'lsa `totalMinutes` = `now − checkIn` (30s refetch bilan jonli o'sadi); o'tgan sanada ochiq (cron yopmagan) yozuv → `totalMinutes` faqat mavjud segmentlardan, ochiq segment 0.
- **`autoClosed` yozuv:** cron yopgan (`autoClosed=true`) row `checkOut` bor deb hisoblanadi; overtime shundan hisoblanadi (haqiqiy ketish emas — hisobot bunga tayanmasin).
- **Qo'lda dublikat kelish:** `at` kunida ochiq yozuv bor bo'lsa `check-in` 400 (mavjud tekshiruv `at` kuni bo'yicha, `new Date()` emas).
- **Ketish < kelish:** `check-out` validatsiyasi `at ≥ checkIn` (mavjud `edit()` naqshi `hr-attendance.service.ts:105`).
- **Filial nomi map:** `HrAttendance.workLocationId` relation'siz raw FK → `hrWorkLocation.findMany` bilan `id→name` map; arxivlangan filial ham nomi ko'rsatiladi (tarixiy). `workLocationId=null` row → o'sha row `branches`ga nom bermaydi.
- **Multi-tenant:** har so'rov `accountId` bilan (guard `HrPermissionGuard` + service `where.accountId`).
- **`counts` yaxlitligi:** `all` cohort = `attendanceOptIn=true`; opt-in emas xodimlarga qo'lda yozuv yaratilsa ular `rows`da ko'rinishi mumkin — default: rows = cohort ∪ (o'sha kuni yozuvi bor har qanday faol xodim), `all` = `rows.length`. Buni ochiq savolda qayd etamiz.
- **Kelajak sana:** date-picker kelajakni tanlashi mumkin → `rows` = cohort, hammasi `absent`/dam-olish; xato emas.

**Ochiq savollar (default tanlangan)**

1. **Overtime ta'rifi:** default = ishlagan vaqtning *rejalashtirilgan tugash vaqtidan keyingi* qismi (`max(0, checkOut − scheduledEnd)`). Muqobil ta'rif — ishlagan jami − smena davomiyligi. Default TimePay ko'rinishiga mos («Qo'shimcha» = kech qolgan ishlash). Dam-olish/jadvalsiz kun: butun ishlagan vaqt overtime (default).
2. **`all` cohort:** default = `attendanceOptIn=true` faol xodimlar. Agar biznes «barcha faol xodim»ni istasa (opt-in'siz ham), `all` = `archived=false` bo'ladi — bu bir qatorli filtr o'zgarishi.
3. **Eski telegram panel joyi:** default = `/hr/messages`ga ko'chirish. Agar egalar `/hr`da ko'rishni istasa — pastda yig'iladigan «Umumiy ko'rinish» bo'limi (ikkalasi ham `hrDashboardApi.summary()` endpoint'ini o'zgartirmasdan ishlaydi).
4. **Ketish modalida filial:** «Ketish» aslida filialga bog'liq emas (row allaqachon filialga ega). Default: Ketishda Filial select e'tiborsiz qoldiriladi (faqat Kelishga ta'sir qiladi), lekin UI'da ko'rinadi (TimePay parity).

### 5.4 Xodimlar kengaytirish

### Xodimlar (Employees) sahifasi kengaytmalari

Bazaviy kod: list `apps/web/src/app/(app)/hr/employees/page.tsx`, modal `.../employees/_components/employee-modal.tsx`, bulk `.../employees/_components/bulk-actions-dropdown.tsx`, multi-select namunasi `.../employees/_components/role-multi-select.tsx`; backend `apps/api/src/modules/hr/hr-employee/{controller,service,schema}.ts`; FE client `apps/web/src/lib/hr-api.ts`; jadval `apps/api/src/modules/hr/attendance-geo/employee-schedule.service.ts` + `late-minutes.util.ts`; sxema `packages/db/prisma/schema.prisma` (Employee ~239, HR modellari 8613–8890).

Ish TimePay xodimlar sahifasini MoySklad dizaynida beradi: filiallar/lavozimlar/bo'limlar/jadval bo'yicha server-side filtrlar, yangi **Jadval** ustuni, va modalда **lavozim / bo'lim / jadval / filial(lar) / rasm** biriktirish — mavjud bulk-arxiv, checker-filter, paginatsiya va optimistic-version buzilmagan holda.

#### Ma'lumot modeli (Prisma)

Hozir `Employee.position` (VarChar 255) va `Employee.department` (VarChar 100) — **erkin string**; jadval — `EmployeeWorkSchedule` (har xodim, har weekday); filial — **yagona** `Employee.workLocationId` FK (geofence uchun). TimePay esa *tanlanadigan* lavozim/bo'lim, *nomlangan* jadval («Moslashuvchan» bayrog'i bilan) va *ko'p* filialni talab qiladi. Shu sabab **additive-only** yangi kataloglar + join + nullable FK'lar (mavjud stringlar QOLADI — orqaga moslik uchun saqlanib, save'da katalog nomi ularga ko'zgu qilinadi, shunda `HrTaskTemplate.department` string-filtratsiyasi ishlashda davom etadi).

Yangi modellar (barchasi `accountId`-scoped, `archived` soft-delete — `HrWorkLocation`ni ko'zgulaydi):

```prisma
model HrPosition {   // «Lavozim»
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  name      String   @db.VarChar(150)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()
  account   Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employees Employee[] @relation("EmployeePosition")
  @@unique([accountId, name])
  @@index([accountId, archived])
  @@map("hr_positions")
}

model HrDepartment { // «Bo'lim» — HR org-tuzilma (moysklad `groupId` permission-scope'dan ALOHIDA, quyida ochiq savolga qara)
  id/accountId/name/archived/createdAt/updatedAt  // HrPosition bilan bir xil
  employees Employee[] @relation("EmployeeDepartment")
  @@unique([accountId, name]) @@index([accountId, archived]) @@map("hr_departments")
}

model HrSchedule {   // «Jadval» — qayta ishlatiladigan nomlangan shablon
  id         String   @id @default(uuid()) @db.Uuid
  accountId  String   @map("account_id") @db.Uuid
  name       String   @db.VarChar(150)
  isFlexible Boolean  @default(false) @map("is_flexible") // «Moslashuvchan» bayrog'i
  archived   Boolean  @default(false)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz()
  account   Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  days      HrScheduleDay[]
  employees Employee[]       @relation("EmployeeSchedule2")
  @@unique([accountId, name]) @@index([accountId, archived]) @@map("hr_schedules")
}

model HrScheduleDay {  // EmployeeWorkSchedule shaklini AYNAN ko'zgulaydi (VarChar(5) "HH:mm")
  id         String  @id @default(uuid()) @db.Uuid
  accountId  String  @map("account_id") @db.Uuid
  scheduleId String  @map("schedule_id") @db.Uuid
  weekday    Int     // 0=Sun..6=Sat (getDay konvensiyasi — LOCKED, EmployeeWorkSchedule bilan bir xil)
  startTime  String  @map("start_time") @db.VarChar(5)
  endTime    String  @map("end_time") @db.VarChar(5)
  isDayOff   Boolean @default(false) @map("is_day_off")
  account  Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  schedule HrSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  @@unique([scheduleId, weekday]) @@index([accountId, scheduleId]) @@map("hr_schedule_days")
}

model HrEmployeeBranch {  // xodim ↔ filial ko'p-ko'p (qo'shimcha filiallar)
  id             String @id @default(uuid()) @db.Uuid
  accountId      String @map("account_id") @db.Uuid
  employeeId     String @map("employee_id") @db.Uuid
  workLocationId String @map("work_location_id") @db.Uuid
  account      Account        @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee     Employee       @relation("EmployeeBranches", fields: [employeeId], references: [id], onDelete: Cascade)
  workLocation HrWorkLocation @relation("BranchEmployees", fields: [workLocationId], references: [id], onDelete: Cascade)
  @@unique([employeeId, workLocationId]) @@index([accountId, workLocationId]) @@map("hr_employee_branches")
}
```

`Employee` modeliga (~qator 302–314, `// === HR module fields ===` bloki, «all nullable/defaulted, prod-safe» patternini davom ettirib):

```prisma
positionId   String? @map("position_id")   @db.Uuid
position2    HrPosition?   @relation("EmployeePosition",   fields: [positionId],   references: [id], onDelete: SetNull)
departmentId String? @map("department_id") @db.Uuid
department2  HrDepartment? @relation("EmployeeDepartment", fields: [departmentId], references: [id], onDelete: SetNull)
scheduleId   String? @map("schedule_id")   @db.Uuid
schedule     HrSchedule?   @relation("EmployeeSchedule2",  fields: [scheduleId],   references: [id], onDelete: SetNull)
branches     HrEmployeeBranch[] @relation("EmployeeBranches")
```

Migratsiya: yangi jadvallar + Employee'ga 3 ta nullable FK ustuni — **hech qanday backfill YO'Q** (mavjud `position`/`department` string va yagona `workLocationId` o'zgarmaydi). Prod-safe. `HrWorkLocation`ga `employeesM2M HrEmployeeBranch[] @relation("BranchEmployees")` back-relation qo'shiladi.

**Jadval ↔ davomat integratsiyasi (muhim):** `late-minutes.util.ts` va `davomat-report.service.ts` kechikishni **`EmployeeWorkSchedule`**dan o'qiydi. Buni buzmaslik uchun modalда `scheduleId` biriktirilganda `HrSchedule.days` xodimning `EmployeeWorkSchedule` qatorlariga **nusxalanadi** (`hrScheduleApi.replaceWeek` allaqachon shu ishni qiladi). Ya'ni `scheduleId` = qaysi shablon (ustun + filter uchun), `EmployeeWorkSchedule` = amaldagi kechikish-matematikasi manbai (o'zgarmaydi). `WeekScheduleGrid` per-xodim override/preview bo'lib qoladi.

#### API endpoints

Filtr kengaytmasi (mavjud `GET /hr/employees`):
- `GET /hr/employees?branchId=&positionId=&departmentId=&scheduleId=` — mavjud `search/role/isChecker/archived/page/limit` bilan birga. Javob shakli o'zgaradi: `rows[]` ga quyidagi projeksiyalar qo'shiladi:
  - `position: { id, name } | null`, `department: { id, name } | null` (eski string `department` ham qoladi — orqaga moslik)
  - `branches: Array<{ id, name }>` va `primaryBranch: { id, name } | null` (= `workLocation`)
  - `schedule: { id, name, isFlexible, workingDays, totalDays, hoursLabel } | null` (server-side yig'iladi — quyida `summarizeScheduleDays`)

Katalog endpointlari (modaldagi select'lar + filtrlar uchun; inline-create RoleMultiSelect uslubida):
- `GET /hr/positions` · `POST /hr/positions {name}` · `PUT /hr/positions/:id` · `DELETE /hr/positions/:id` (soft-archive)
- `GET /hr/departments` · `POST /hr/departments {name}` · `PUT` · `DELETE`
- `GET /hr/schedules` → `Array<{ id, name, isFlexible, workingDays, totalDays, hoursLabel }>` (Jadval-select + filtr uchun). To'liq jadval-builder CRUD (`days[]` tahriri, `POST/PUT /hr/schedules` bilan kunlar) — **Jadval (Schedules) area**ga tegishli; bu yerda faqat `list` + `Employee.scheduleId` biriktirish. Agar Schedules area topilmasa, bu endpointlar shu HR-employee cohortida yaratiladi.

Rasm: **mavjud** `PUT /hr/employees/:id/image {filename,mime,dataBase64}` va `DELETE /hr/employees/:id/image`, `GET /hr/employees/:id/image/raw` (`hr-employee.controller.ts:115–146`) — yangi endpoint SHART EMAS, faqat FE client'ga ulash kerak.

#### Backend modullar

**O'zgaradigan fayllar:**
- `hr-employee.schema.ts` — `HrEmployeeFilterSchema`ga `branchId/positionId/departmentId/scheduleId: z.string().uuid().optional()` qo'shiladi. `CreateHrEmployeeSchema` + `UpdateHrEmployeeSchema` (partial orqali)ga: `positionId/departmentId/scheduleId: z.string().uuid().optional().nullable()` va `branchIds: z.array(z.string().uuid()).max(50).optional()`.
- `hr-employee.service.ts`:
  - `list()` `where` (qator 92–115): `if (filter.positionId) where.positionId = …`; xuddi shunday `departmentId`, `scheduleId`. **Filial**: `search` allaqachon `where.OR`ni band qilgani uchun filialni `where.AND = [{ OR: [{ workLocationId: filter.branchId }, { branches: { some: { workLocationId: filter.branchId } } }] }]` sifatida qo'shish (eski yagona-filialli xodimlar ham topilishi uchun `workLocationId`ni ham tekshiramiz).
  - `list()` `select` (123–153): `positionId`, `departmentId`, `scheduleId`, `position2:{select:{id,name}}`, `department2:{select:{id,name}}`, `workLocation:{select:{id,name}}`, `branches:{select:{workLocation:{select:{id,name}}}}`, va jadval kunlari `schedule:{select:{id,name,isFlexible,days:{select:{weekday,startTime,endTime,isDayOff}}}}` qo'shiladi. `rows.map` da `schedule` → `summarizeScheduleDays(schedule.days, schedule.isFlexible)` bilan proyeksiyaga aylantiriladi (kun-qatorlar payload'ga chiqmaydi).
  - `create()`/`update()` (qator 260–424): `positionId/departmentId/scheduleId` yozish (mavjud `groupId` bloki namunasida, `input.x !== undefined && { x }`); `position`/`department` string'ga katalog nomini ko'zgu qilish. `update()` versiya-locki, `writeAudit` diff, `throwIfEmployeeUniqueViolation` **o'zgarmaydi** — yangi FK'lar diff'ga oddiy scalar sifatida qo'shiladi.
  - Filial(lar) + jadval-nusxasi alohida servis metodida (`update`ning version-lockidan tashqarida, `employee-schedule.service.ts:replaceWeek` uslubida `$transaction` bilan `deleteMany`+`createMany` `HrEmployeeBranch` ustida); `primaryBranch`/geofence uchun `workLocationId = branchIds[0] ?? null` yoziladi.
- **Yangi util** `apps/api/src/modules/hr/hr-employee/schedule-summary.util.ts` + `.util.test.ts` (vitest, co-located):
  ```ts
  summarizeScheduleDays(days: {weekday,startTime,endTime,isDayOff}[], isFlexible: boolean)
    → { workingDays: number, totalDays: 7, hoursLabel: string, isFlexible: boolean }
  // workingDays = days.filter(d => !d.isDayOff).length
  // hoursLabel  = barcha ish kunlari bir xil start/end bo'lsa "09:00–18:00", aks holda "" (UI «Har xil» ko'rsatadi)
  ```
- **Yangi modullar** (agar Schedules/Settings area bermasa): `hr-position/`, `hr-department/`, `hr-schedule/` — har biri `.controller/.service/.schema/.service.test.ts`, `HrRole` moduli (`hr-role`) va `work-location.service.ts` (soft-archive + `employeeCount`) namunasida. `hr.module.ts`ga provayder + kontroller ro'yxati.

#### Frontend

**Route:** `apps/web/src/app/(app)/hr/employees/page.tsx` (o'zgaradi, yangi route yo'q).

**Filtr bar (page.tsx 195–245):** mavjud rol/holat/checker yonига 3 (→4) `NativeSelect` qo'shiladi — «Barcha filiallar» (`hrWorkLocationApi.list()`), «Barcha lavozimlar» (`hrPositionApi.list()`), «Barcha bo'limlar» (`hrDepartmentApi.list()`), va deliverable bo'yicha «Barcha jadvallar» (`hrScheduleApi.list()`). Har biri `withReset(setX)` (159–165) bilan — o'zgarish page'ni 1'ga qaytaradi + tanlovни tozalaydi. `queryKey` (69) va `hrEmployeeApi.list()` chaqirig'iga (72–83) yangi param'lar qo'shiladi.

**Jadspan ustuni (thead 267–287, tbody 334–351):** «Telegram» ustuni o'rniga/yoniga **«Jadval»** ustuni:
- Jadval yo'q → `—`.
- Bor → nom + `isFlexible` bo'lsa `<Badge tone="neutral">Moslashuvchan</Badge>` + kichik matn `{workingDays}/{totalDays} kun` + `hoursLabel` (bo'sh bo'lsa «Har xil»). Barcha qiymatlar server proyeksiyasidan (`row.schedule`), qo'shimcha fetch yo'q.
- Shuningdek «Lavozim» (`row.position?.name ?? '—'`) va «Filial» (`row.primaryBranch?.name` + `branches.length>1` bo'lsa `+N`) ustunlari qo'shiladi (TimePay: Xodim / Lavozim / Filial / Jadval). «Bo'lim» ustuni ixtiyoriy — mavjud `col_department`ni `row.department?.name`ga o'tkazamiz.

**Qator amallari (357–406):** TimePay 5 ikonka:
| ikonka | mapping | holat |
|---|---|---|
| edit ✏️ | `setEditTarget(row)` | **MAVJUD** ✓ |
| attendance-stats 📊 | `router.push('/hr/monitoring/'+row.id)` | **DEFERRED / cross-area** — `/hr/monitoring/{id}` route yo'q (glob tasdiqladi), **Monitoring area** beradi; bu yerda faqat Link-ikonka |
| salary 💵 | `router.push('/hr/employees/'+row.id+'/salary')` | **MAVJUD** ✓ (`[id]/salary/page.tsx` bor) |
| bonus ➕ | tez bonus/jarima modali (`hrBonusFineApi.createManual({employeeId, kind, amountMinor, reason})`) | API **MAVJUD**, dedikatsiya route yo'q → yangi yengil modal (`BonusFineQuickModal`) |
| delete ❌ | `handleDelete(row)` (soft-archive) | **MAVJUD** ✓ |

Mavjud 🔑 set-password va arxiv-ko'rinishdagi ↩️ restore ikonkalari saqlanadi. `data-test-id` konvensiyasi (`hr-employee-<action>-<id>`) davom ettiriladi.

**Modal (`employee-modal.tsx`) qo'shimchalari** — `FormState` (61–76) va `emptyForm/rowToForm` (78–115) kengaytiriladi: `firstName, lastName, positionId, departmentId, scheduleId, branchIds: string[], countryCode, phoneNumber, photoFile`.
- **Ism / Familiya** — mavjud yagona `name` o'rniga ikkita `Input` (`firstName`/`lastName`); `buildPayload` (176–187) `name = \`${lastName} ${firstName}\`.trim()` ni tuzadi va `firstName/lastName`ni ham yuboradi (backend `create()` allaqachon qabul qiladi — service 277–279).
- **Mamlakat kodi + Telefon** — kichik `NativeSelect` (default `+998`) + raqam `Input`; save'da `phone = countryCode + phoneNumber`. Validatsiya: bo'sh emas (mavjud 258–260 tekshiruvi) + backend `phone` max(20).
- **Lavozim** — `PositionSelect` (yangi, `role-multi-select.tsx` inline-create patternini single-select uchun soddalashtirib), `hrPositionApi.list()` + «+ Yangi lavozim».
- **Bo'lim** — mavjud erkin `department` `Input` (358–365) o'rniga `DepartmentSelect` (xuddi shunday).
- **Filiallar (multi-select)** — yangi `BranchMultiSelect` (`role-multi-select.tsx` ni ko'zgulab: chip'lar + `×` olib tashlash + checkbox ro'yxati), **qidiruv `Input` qo'shiladi** (RoleMultiSelect'da yo'q — TimePay talabi). Manba `hrWorkLocationApi.list()`. Bu davomat-bo'limидagi yagona `workLocationId` selectni (427–440) almashtiradi; `attendanceOptIn` + `WeekScheduleGrid` qoladi. Save'da `workLocationId = branchIds[0] ?? null` (primary/geofence).
- **Jadval** — `ScheduleSelect` (`hrScheduleApi.list()`); tanlanganda `WeekScheduleGrid`ни shablon kunlari bilan to'ldirish (preview), save'da `scheduleId` + `hrScheduleApi.replaceWeek` (nusxa) chaqiriladi.
- **Rasm** — `PhotoUpload` (file→base64); `saveMut` ichida `saved.id` bilan `hrEmployeeApi.setImage()` (schedule/config bilan bir xil post-save ketma-ketlik, 226–230). Create'da xodim yaratilgach yuklanadi.
- **`saveMut` (203–233)** kengaytmasi: mavjud sklad + `setConfig` + `replaceWeek` bloklaridan keyin — filiallarni yozish (`hrEmployeeApi.setBranches`) + rasm. Optimistic-conflict (`onConflict`, 195–201) va `invalidateQueries(['hr-employees'])` o'zgarmaydi.

**Holatlar:** loading skeleton, `ErrorState`, `EmptyState` (`hasFilter` endi yangi filtrlarni ham hisoblaydi: `hasFilter = … || !!branchId || !!positionId || !!departmentId || !!scheduleId`), paginatsiya — barchasi mavjud (248–448) o'zgarishsiz ishlaydi.

**`hr-api.ts` qo'shimchalari:** `HrEmployeeRow`/`HrEmployeeDetail`ga `position/department/schedule/branches/primaryBranch` proyeksiyalari; `HrEmployeeFilter`ga `branchId/positionId/departmentId/scheduleId`; `HrEmployeeCreateInput`ga `firstName/lastName/positionId/departmentId/scheduleId/branchIds` (hozir bu maydonlar FE tipida YO'Q — backend qo'llasa ham); yangi `hrPositionApi`, `hrDepartmentApi`, `hrScheduleApi.list`; `hrEmployeeApi.setImage/removeImage/imageRawUrl` va `setBranches`.

#### i18n

Namespace `pages.hrEmployees` (mavjud, `uz.json:6256`, `ru.json` parallel). Muhim yangi kalitlar (uz / ru):
- `filter_branch_all`: «Barcha filiallar» / «Все филиалы»
- `filter_position_all`: «Barcha lavozimlar» / «Все должности»
- `filter_department_all`: «Barcha bo'limlar» / «Все отделы»
- `filter_schedule_all`: «Barcha jadvallar» / «Все графики»
- `col_position`: «Lavozim» / «Должность» · `col_branch`: «Filial» / «Филиал» · `col_schedule`: «Jadval» / «График»
- `schedule_flexible`: «Moslashuvchan» / «Гибкий» · `schedule_days`: «{count}/{total} kun» / «{count}/{total} дн.» · `schedule_hours_mixed`: «Har xil» / «Разное» · `schedule_none`: «Jadval biriktirilmagan» / «График не назначен»
- `form_first_name`: «Ism» / «Имя» · `form_last_name`: «Familiya» / «Фамилия»
- `form_country_code`: «Mamlakat kodi» / «Код страны» · `form_position`: «Lavozim» / «Должность» · `form_branches`: «Filiallar» / «Филиалы» · `form_schedule`: «Jadval» / «График» · `form_photo`: «Rasm» / «Фото»
- `form_position_add`: «+ Yangi lavozim» / «+ Новая должность» · `form_department_add`: «+ Yangi bo'lim» / «+ Новый отдел» · `branch_search`: «Filial qidirish…» / «Поиск филиала…» · `branch_remove_aria`: «Filialни olib tashlash: {name}» / «Убрать филиал: {name}»
- `action_attendance_stats`: «Davomat statistikasi» / «Статистика посещаемости» · `action_salary`: «Oylik» / «Зарплата» · `action_bonus`: «Bonus / jarima» / «Бонус / штраф»
- Bonus-modal: `bonus_title`, `bonus_kind_bonus`/`bonus_kind_fine`, `bonus_amount`, `bonus_reason`.

Katalog CRUD sahifalari (agar Settings/Schedules area bersa) uchun `pages.hrPositions`/`pages.hrDepartments`/`pages.hrSchedules` namespace'lari — bu area doirasida faqat select ichidagi inline-create matnlari kerak (yuqoridagi `form_*_add`). Gate: ru+uz key-existence + no-hardcoded Cyrillic — barcha yangi string `t()` orqali.

#### Mavjud koddan qayta ishlatish

- **Multi-select + chip + inline-create**: `role-multi-select.tsx` (chip'lar 104–122, outside-click 46–56, checkbox ro'yxat 141–166, inline-create 169–222) — `BranchMultiSelect`, `PositionSelect`, `DepartmentSelect` shundan ko'chiriladi (Branch'ga qidiruv `Input` qo'shiladi).
- **Katalog servisi + soft-archive + `employeeCount`**: `attendance-geo/work-location.service.ts` va `hr-role` moduli — `HrPosition/HrDepartment/HrSchedule` servislari uchun namuna.
- **Jadval get/replace tranzaksiyasi**: `employee-schedule.service.ts:replaceWeek` (34–50, `deleteMany`+`createMany`) — `HrEmployeeBranch` yozish va `HrSchedule.days` → `EmployeeWorkSchedule` nusxasi uchun aynan shu pattern.
- **Kechikish/jadval matematikasi**: `late-minutes.util.ts` `EmployeeWorkSchedule`ni o'qishда davom etadi — `scheduleId` faqat shablon, nusxa orqali bu util'ga tegilmaydi.
- **Optimistic-lock**: `hr-employee.service.ts:update` (383–414, `where:{id,version}`, `version:{increment:1}`, `mapVersionedUpdateError`) + modal `useConflictReload` (195–201) — yangi FK'lar shu oqimga scalar sifatida qo'shiladi, lock o'zgarmaydi.
- **Rasm**: `hr-employee.controller.ts:115–146` + `service.getImageRaw/setImage/removeImage` (549–638) allaqachon tayyor — faqat FE `PhotoUpload` + `hrEmployeeApi` ulanadi.
- **Bulk / checker / paginatsiya**: `bulk-actions-dropdown.tsx` va `page.tsx` selection/paging (136–165, 416–448) — DEGMASDAN saqlanadi.

#### Chekka holatlar (edge cases)

- **Filial filtri + search kolliziyasi**: `search` `where.OR`ни band qiladi; filial ALBATTA `where.AND` massiviga (yoki nested `AND`) qo'yiladi, aks holda MoySklad qidiruvi filial shartini yeb ketadi.
- **Migratsiya backfill YO'Q**: eski xodimlarda `HrEmployeeBranch` qatori bo'lmaydi (faqat `workLocationId`). Shu sabab filial-filtri `workLocationId == branchId` ni ham tekshiradi; ular oddiy tahrir orqali join'ga ko'chguncha topilib turadi.
- **Primary/geofence filial**: davomat GPS bitta `workLocationId`ga tayanadi. Multi-select'da `branchIds[0]` primary sifatida yoziladi; barcha filial olib tashlansa `workLocationId = null` (geofence o'chadi) — bu `attendanceOptIn` bilan mos.
- **Jadval nusxasi rejasi**: `scheduleId` biriktirilib, `HrSchedule.days` `EmployeeWorkSchedule`ga nusxalanmasa, kechikish 0 bo'lib qoladi. Save oqimida nusxa (`replaceWeek`) SHART; keyin xodim shablondan mustaqil override qilishi mumkin (per-xodim grid).
- **Timezone**: barcha davomat matematikasi `Asia/Tashkent` (`late-minutes.util.ts` `formatInTimeZone`/`fromZonedTime`); jadval vaqtlari `"HH:mm"` VarChar(5) — `EmployeeWorkSchedule`/`HrScheduleDay` bir xil, konvertatsiya yo'q.
- **Katalog o'chirish (soft)**: arxivlangan lavozim/bo'lim/jadvalga ega xodimda FK `SetNull` — ustun `—` ko'rsatadi, xodim buzilmaydi (mavjud `workLocation onDelete: SetNull` uslubida).
- **Katalog nomi noyobligi**: `@@unique([accountId, name])` P2002 → `throwIfEmployeeUniqueViolation` uslubidagi 409 mapping (inline-create dublikatда «allaqachon mavjud»).
- **Rasm create'da**: xodim POST'дан keyingina `id` oladi; rasm/filial/jadval `saved.id` bilan post-save yoziladi (mavjud `saveMut` ketma-ketligi). Rasm yuklanishi muvaffaqiyatsiz bo'lsa asosiy create rollback bo'lmaydi (setImage version-bump qilmaydi — service 564–568 izohи).
- **Optimistic version**: yangi FK'lar `Employee.version`ni oshiradigan asosiy `update()`da; filial/jadval nusxasi versiyani oshirmasligi kerak (rasm kabi), aks holda modalning keyingi save'ini 409 qiladi.

#### Ochiq savollar

1. **`departmentId` (HrDepartment) ↔ `groupId` (moysklad Отдел/permission-scope) ↔ eski `department` string** — uchta «bo'lim» tushunchasi bor. *Default:* `HrDepartment` = HR org-tuzilmasi (mustaqil katalog), `groupId` = permission-scope (o'zgarmaydi), eski `department` string = deprecated-lekin-saqланади (katalog nomi ko'zgu qilinadi). Agar egasi ikkalasini birlashtirishni xohlasa — keyingi cohortда.
2. **HrSchedule egaligi** — nomlangan jadval + kun-builder alohida «Jadval (Schedules)» area'ga tegishli bo'lishi mumkin. *Default:* modellar shu yerda grounded, lekin to'liq CRUD UI Schedules area'da; Employees faqat `list` + `scheduleId` biriktirish. Agar Schedules area yo'q bo'lsa — endpointlar shu cohortда.
3. **Bonus qator-amali** — dedikatsiya route yo'q. *Default:* yengil `BonusFineQuickModal` (`hrBonusFineApi.createManual`). Egasi to'liq bonus-fine sahifasini istasa — hr-bonus-fine area'ga havola.
4. **attendance-stats route** — `/hr/monitoring/{id}` hali yo'q. *Default:* Monitoring area beradi; bu yerda faqat Link-ikonka renderlanadi (route paydo bo'lguncha 404).

### 5.5 Xodimlarni kuzatish

### Employee Monitoring (Xodimlarni kuzatish) — live status + per-employee attendance detail

Bu bo'lim TimePay "Xodimlarni kuzatish" ekranini mavjud GPS-davomat ma'lumotlari ustiga **sof read/derive qatlami** sifatida quradi. Yangi jadval deyarli **kerak emas** — barcha ma'lumot allaqachon `HrAttendance` + `HrLocationPing` + `EmployeeWorkSchedule` + `Employee` ichida. Yagona haqiqiy bo'shliq — punch paytida olingan **rasm** (quyida DEFER qilingan).

---

**Ma'lumot modeli (Prisma)**

`reuse` — yangi model YO'Q. Barcha maydonlar mavjud (grounded, `packages/db/prisma/schema.prisma`):

- **`HrAttendance`** (schema:8613) — bir kunlik kelish/ketish yozuvi: `checkInTime`, `checkOutTime?`, `lateMinutes Int @default(0)`, `source ('auto_gps'|'manual')`, `autoClosed Boolean`, `workLocationId?`, va punch koordinatalari `checkInLat/checkInLng/checkInAccuracy`, `checkOutLat/checkOutLng`. Index `[accountId, employeeId, checkInTime desc]` — kunlik so'rovga tayyor.
- **`HrLocationPing`** (schema:8894) — `lat/lng/accuracy/inside/createdAt`. **7 kun saqlanadi**, keyin cron o'chiradi (`davomat-ping-cleanup.cron.ts`). Faqat "so'nggi 7 kun" ping-izi uchun; eski marklar uchun manzil faqat `HrAttendance` koordinatalaridan olinadi.
- **`EmployeeWorkSchedule`** (schema:8875) — `weekday` (0=Sun..6=Sat, LOCKED), `startTime/endTime` VarChar(5) "HH:mm", `isDayOff`. `@@unique([employeeId, weekday])` — kutilgan smenani (expected shift) shu beradi.
- **`Employee`** (schema:239) — `position?` VarChar(255) = **Lavozim**, `department?`, `workLocationId?` + `workLocation` relation ("EmployeeWorkLocation") = **Filial**, `attendanceOptIn`, `name`, `archived`. Avatar uchun `imageContent Bytes?`/`imageMime?` bor, lekin HR sahifalari initsial-Avatar ishlatadi (pastga qarang).
- **`HrWorkLocation`** (schema:8855) — `name/lat/lng/radiusMeters/archived`.

**Rasm (punch photo) — GAP / DEFER.** Na `HrAttendance`, na `HrLocationPing` da punch-paytdagi selfie ustuni bor (yuqoridagi maydonlar to'liq ro'yxat). `Employee.imageContent` faqat statik profil rasmi. TimePay "Rasm" ustuni **hozircha implement qilinmaydi**. Kelajakda additive, prod-safe kolonka (mirror `// all nullable/defaulted, prod-safe`):

```prisma
// HrAttendance modeliga (DEFER — PWA kamera-capture bilan birga):
checkInPhoto      Bytes?  @map("check_in_photo")
checkInPhotoMime  String? @map("check_in_photo_mime") @db.VarChar(100)
checkOutPhoto     Bytes?  @map("check_out_photo")
checkOutPhotoMime String? @map("check_out_photo_mime") @db.VarChar(100)
```

Bu PWA (`apps/web/src/app/davomat/`) tomonida kamera-oqim + backend ping/manual-mark DTO'ga base64 qo'shishni talab qiladi — **bu bo'lim ko'lamidan tashqarida**. Monitoring UI'da "Rasm" ustuni ko'rsatiladi, lekin har mark uchun placeholder ("—") va `photoUrl: null` qaytadi.

---

**API endpoints** (yangi `hr/monitoring` namespace)

1. **`GET /hr/monitoring?date=yyyy-MM-dd&status=all|late|ontime|at_work|absent`** — bir kunlik live doska.
   - `date` ixtiyoriy (default = bugun, Asia/Tashkent). `status` ixtiyoriy filter (default `all`).
   - Response:
   ```jsonc
   {
     "date": "2026-07-24",
     "rows": [{
       "employeeId": "uuid",
       "name": "Ali Valiyev",
       "position": "Sotuvchi" | null,          // Lavozim
       "department": "Savdo" | null,
       "workLocation": { "id": "uuid", "name": "Chilonzor filial" } | null, // Filial
       "schedule": { "startTime": "09:00", "endTime": "18:00", "isDayOff": false } | null, // Jadval
       "attendanceState": "ontime" | "late" | null,  // Vaqtida / Kechikkan (kelmagan/dayoff -> null)
       "presence": "at_work" | "left" | "absent" | "dayoff", // Ishda / Ketgan / Kelmagan / Dam olish
       "checkInTime": "iso" | null,
       "checkOutTime": "iso" | null,
       "lateMinutes": 0,
       "attendanceId": "uuid" | null
     }]
   }
   ```
2. **`GET /hr/monitoring/:employeeId/marks?from=yyyy-MM-dd&to=yyyy-MM-dd`** — per-employee "belgilar" (TimePay `/track-employee/{id}?from&to` ekvivalenti).
   - Har `HrAttendance` yozuvi **1–2 mark**ga yoyiladi (entry + ixtiyoriy exit).
   - Response:
   ```jsonc
   {
     "employee": { "id": "uuid", "name": "Ali Valiyev", "position": "Sotuvchi" | null },
     "marks": [{
       "id": "uuid",                 // attendanceId
       "at": "iso",                  // Sana (vaqt bilan)
       "type": "entry" | "exit",     // Turi: Kirish / Chiqish
       "state": "ontime" | "late" | null, // Holati (faqat entry uchun; exit -> null)
       "lateMinutes": 0,
       "lat": 41.31 | null, "lng": 69.28 | null, "accuracy": 24 | null, // Manzil
       "autoClosed": false,          // exit uchun: cron yopganmi
       "photoUrl": null              // Rasm — DEFER (doim null)
     }]
   }
   ```
   `marks` FE'da `at` ning local sanasi bo'yicha guruhlanadi ("{sana} ga tegishli belgilar" sarlavhasi).

Ikkalasi ham `RequireHrPermission('employees', 'read')` — mavjud `davomat-admin.controller.ts` bilan bir xil (grounded: `attendance-geo.schema`/`hr-permission.types.ts` da `'employees'` valid page-key; yangi key kerak emas).

---

**Backend modullar** (barchasi `apps/api/src/modules/hr/attendance-geo/` ichida — davomat oilasining yangi ukasi)

- **`monitoring.controller.ts`** (yangi) — `@Controller('hr/monitoring')`, `@UseGuards(JwtAuthGuard, HrPermissionGuard)`; `daily()` + `marks()` metodlari. `davomat-admin.controller.ts` (o'qildi) ni 1:1 nusxalaydi.
- **`monitoring.service.ts`** (yangi) — `HrMonitoringService`:
  - `daily(accountId, {date, status})` — kutilgan-smena resolyutsiyasi + o'sha kun `HrAttendance` join. Algoritm `davomat-report.service.ts` `live()` ni **umumlashtiradi** (bugun→ixtiyoriy sana) va Lavozim/Filial/Jadval ustunlarini qo'shadi.
  - `marks(accountId, employeeId, {from,to})` — `[from,to]` oralig'idagi `HrAttendance` yozuvlarini olib, `expandMarks()` bilan entry/exit marklarga yoyadi.
- **`monitoring.util.ts`** (yangi, sof funksiyalar + `monitoring.util.test.ts` vitest):
  - `resolveDayRow({ schedule, arrival, latest })` → `{ attendanceState, presence }` (kunlik holat mantiqi, quyidagi edge-case'lar bilan).
  - `expandMarks(attendanceRows, tz)` → `Mark[]` (bitta yozuvni 2 markka yoyish, exit `checkOutLat/Lng` dan).
  - Sof mantiq → sof util, `computeMonthlyAttendance`/`monthly-report.util.ts` uslubida.
- **`monitoring.schema.ts`** (yangi zod) — `DailyMonitoringFilterSchema` (`date: /^\d{4}-\d{2}-\d{2}$/`, `status: z.enum([...]).default('all')`), `MarksFilterSchema` (`from`, `to` sana-regex). `attendance-geo.schema.ts` uslubi.
- **`attendance-geo.module.ts`** (kengaytma) — `controllers`ga `HrMonitoringController`, `providers`ga `HrMonitoringService`.

`daily()` so'rov modeli (grounded `davomat-report.service.ts:38-107` va `monthly()` dan):
- `dayStart = fromZonedTime(`${date}T00:00:00`, HR_TZ)`, `dayEnd = +DAY_MS`; `weekday = tashkentWeekday(fromZonedTime(`${date}T12:00:00`, HR_TZ))` (peshin — DST/chegara xavfsiz, `monthly-report.util.ts:51` bilan bir xil).
- Xodimlar: `employee.findMany({ accountId, archived:false, attendanceOptIn:true, select:{ id,name,position,department, workLocation:{select:{id,name}}, workSchedules:{ where:{weekday}, select:{startTime,endTime,isDayOff} } } })`.
- O'sha kun yozuvlari: `hrAttendance.findMany({ accountId, checkInTime:{gte:dayStart,lt:dayEnd}, include:{employee...} }, orderBy checkInTime asc)`; xodim bo'yicha guruhlab **arrival = eng erta** (lateMinutes/checkInTime), **latest = eng oxirgi** (checkOutTime → left/at_work).
- **Union**: opted-in jadvalli kohorta ∪ o'sha kunda yozuvi bor har qanday xodim (mirror `live()` — admin qo'lda check-in qilgan, opt-in qilmagan xodim ham doskada ko'rinadi).

---

**Frontend**

- **`apps/web/src/app/(app)/hr/monitoring/page.tsx`** (yangi route) — list sahifasi.
  - Layout: `apps/web/src/app/(app)/layout.tsx:407-418` `hrSubNav` massiviga yangi punkt: `{ key: 'monitoring', label: tHr('monitoring'), href: '/hr/monitoring' }` (masalan `home` dan keyin — dashboard attendance-centric bo'lgach shu asosiy jadval).
  - Header: sarlavha + **sana-picker** (`<Input type="date">`) + **status dropdown** (`<NativeSelect>`: Barchasi/Kechikkan/Vaqtida/Ishda/Kelmagan). Aynan `attendance/monthly/page.tsx` va `attendance/page.tsx` filter-panellari uslubida (o'qildi).
  - Jadval ustunlari: **Xodim** (`<Avatar name={row.name} size="sm" />` initsial — `attendance/page.tsx:166` uslubi, profil-rasm fetch yo'q) / **Lavozim** (`position`) / **Holati** = ikkita badge / **Filial** (`workLocation?.name`) / **Jadval** (`{startTime}–{endTime}` yoki "Dam olish").
  - **Holati = 2 badge** (`AttendanceStatusBadge` — `apps/web/src/components/hr/attendance-status-badge.tsx`, "attendance status vocabulary" ning yagona manbai, o'qildi):
    - attendance-state badge: `late` (Kechikkan, tone destructive, `+{lateMinutes}` suffiks) yoki `ontime` (Vaqtida, tone success);
    - presence badge: `at_work` (Ishda, success) / `left` (Ketgan, neutral) / `absent` (Kelmagan, neutral/destructive) / `dayoff` (Dam olish).
    - Component'ga `ontime` statusi va `Kelmagan` uchun destructive-tone qo'shiladi (TONE map kengaytmasi — bitta joy).
  - Row-click → `/hr/monitoring/{employeeId}?from=&to=` (default from=to=tanlangan sana).
  - Data: `useQuery(['hr-monitoring','daily', date, status], () => hrMonitoringApi.daily({date, status}))`, `refetchInterval: 30_000` (mirror `hr/page.tsx:37` va davomat live-doska). States: `Skeleton` / `EmptyState` / jadval — `attendance/monthly/page.tsx` bilan bir xil.
  - **Dashboard deep-link**: KPI kartalari `href={/hr/monitoring?status=late}` (Kechikkanlar), `?status=absent` (Kelmaganlar), `?status=at_work` (Ishdagilar) bilan bog'lanadi. `page.tsx` `useSearchParams()` bilan initial `status`/`date` ni o'qiydi.

- **`apps/web/src/app/(app)/hr/monitoring/[employeeId]/page.tsx`** (yangi route) — per-employee detail.
  - `from`/`to` query (sana-picker'lar). Sarlavha: xodim ismi + Lavozim + "← Orqaga".
  - `marks` ni local-sana bo'yicha guruhlab, har guruh uchun "{sana} ga tegishli belgilar" sarlavhasi + jadval: **Sana** (`HH:mm` vaqt) / **Turi** (`Kirish`/`Chiqish` badge) / **Holati** (`Vaqtida`/`Kechikkan +N`, faqat entry) / **Manzil** ("Xaritada ochish" tashqi link) / **Rasm** (placeholder "—", DEFER).
  - **"Xaritada ochish"** — `lat/lng` bor bo'lsa `<a target="_blank" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}>` (OSM — mavjud `map-radius-picker.tsx` OSM tile provayderiga mos, o'qildi). Koordinata yo'q bo'lsa (masalan qo'lda check-in yoki eski autoClosed exit) "—".
  - autoClosed exit uchun kichik badge (`t('auto_closed')` yoki mavjud `pages.hrAttendance.source_auto`).

- **`apps/web/src/lib/hr-api.ts`** (kengaytma) — mavjud `hrDavomatReportApi` yonida (o'qildi):
  ```ts
  export const hrMonitoringApi = {
    daily: (f: { date?: string; status?: MonitoringStatus }) =>
      api.get<MonitoringDailyResult>(`/hr/monitoring${toQueryString(f)}`),
    marks: (employeeId: string, f: { from: string; to: string }) =>
      api.get<MonitoringMarksResult>(`/hr/monitoring/${employeeId}/marks${toQueryString(f)}`),
  };
  ```
  `toQueryString` helper allaqachon mavjud (hr-api.ts:103).

---

**i18n** — namespace `pages.hrMonitoring` (yangi), + `pages.hr.monitoring` sub-nav yorlig'i. Reyestr sifatida davomat-vokabulyar (`pages.davomat.badge_*`) qayta ishlatiladi. Vakil kalitlar (ru + uz draftlar):

```jsonc
// pages.hr (mavjud namespace'ga 1 kalit)
"monitoring": { "ru": "Мониторинг", "uz": "Kuzatuv" }

// pages.hrMonitoring (yangi)
"title":            { "ru": "Мониторинг сотрудников", "uz": "Xodimlarni kuzatish" },
"date_label":       { "ru": "Дата",   "uz": "Sana" },
"status_label":     { "ru": "Статус", "uz": "Holati" },
"status_all":       { "ru": "Все",       "uz": "Barchasi" },
"status_late":      { "ru": "Опоздавшие","uz": "Kechikkanlar" },
"status_ontime":    { "ru": "Вовремя",   "uz": "Vaqtida" },
"status_at_work":   { "ru": "На работе", "uz": "Ishda" },
"status_absent":    { "ru": "Отсутствуют","uz": "Kelmaganlar" },
"col_employee":     { "ru": "Сотрудник","uz": "Xodim" },
"col_position":     { "ru": "Должность","uz": "Lavozim" },
"col_state":        { "ru": "Статус",   "uz": "Holati" },
"col_branch":       { "ru": "Филиал",   "uz": "Filial" },
"col_schedule":     { "ru": "График",   "uz": "Jadval" },
"badge_ontime":     { "ru": "Вовремя",  "uz": "Vaqtida" },   // AttendanceStatusBadge kengaytmasi
"presence_at_work": { "ru": "На работе","uz": "Ishda" },
"presence_left":    { "ru": "Ушёл",     "uz": "Ketgan" },
"presence_absent":  { "ru": "Не пришёл","uz": "Kelmagan" },
"presence_dayoff":  { "ru": "Выходной", "uz": "Dam olish" },
"dayoff":           { "ru": "Выходной", "uz": "Dam olish" },
"empty":            { "ru": "Нет сотрудников", "uz": "Xodimlar yo'q" },
// detail
"marks_title":      { "ru": "Отметки за {date}", "uz": "{date} ga tegishli belgilar" },
"col_time":         { "ru": "Время",    "uz": "Sana" },
"col_type":         { "ru": "Тип",      "uz": "Turi" },
"col_location":     { "ru": "Адрес",    "uz": "Manzil" },
"col_photo":        { "ru": "Фото",     "uz": "Rasm" },
"type_entry":       { "ru": "Вход",     "uz": "Kirish" },
"type_exit":        { "ru": "Выход",    "uz": "Chiqish" },
"open_on_map":      { "ru": "Открыть на карте", "uz": "Xaritada ochish" },
"auto_closed":      { "ru": "Авто-закрытие",     "uz": "Avto-yopilgan" },
"no_photo":         { "ru": "—", "uz": "—" },
"back":             { "ru": "Назад", "uz": "Orqaga" }
```
Gate talabi (CLAUDE.md §0/§4): har kalit ru+uz da mavjud, hardcoded Kirill/Latin yo'q — barcha string `t(...)` orqali.

---

**Mavjud koddan qayta ishlatish** (o'qilgan, real yo'llar)

- **`davomat-report.service.ts`** `live()` (satr 83–123) — present∪absent join mantiqi. `daily()` shuni umumlashtiradi. **Refactor tavsiyasi**: ikkalasi bir kunlik "board" hisoblaganidan, `resolveDayBoard(accountId, date)` yordamchisini ajratib, `live()` ni ham (bugun bilan) shunga o'tkazish — kod takrorlanmasin. Yangi vs mavjud: `live()` faqat present-list va `{employeeId,name}`-absent; `daily()` Lavozim/Filial/Jadval + attendanceState/presence + status-filter qo'shadi (YANGI).
- **`monthly-report.util.ts`** `computeMonthlyAttendance` (satr 18–79) — kunlik status resolyutsiyasi ("first check-in of the local day", `dayoff`/`late`/`present`/`absent` mantiqi, peshin-weekday). `resolveDayRow` shu qoidalarni bir kunga tatbiq etadi. `late = att.lateMinutes>0` — **qayta hisoblanmaydi**, `HrAttendance.lateMinutes` allaqachon check-in paytida `computeLateMinutes` bilan yozilgan (`ping-ingest.service.ts:155`).
- **`late-minutes.util.ts`** `computeLateMinutes` (satr 10–19) — YANGI hisob YO'Q; monitoring faqat saqlangan `lateMinutes` ni o'qiydi.
- **`tz.util.ts`** — `HR_TZ`, `startOfLocalDay`, `tashkentWeekday`, `toLocalIso`, `parseLocalIso` (kunlik oraliq, weekday, ISO seriyalizatsiya).
- **`attendance-status-badge.tsx`** — status-badge vokabulyari (present/late/absent/dayoff/at_work/left). `ontime` + `Kelmagan` destructive-tone qo'shiladi.
- **`davomat-admin.controller.ts`** — controller shakli (`@Controller('hr/attendance')`, guard, `RequireHrPermission('employees','read')`).
- **`attendance/monthly/page.tsx`** + **`attendance/page.tsx`** — FE jadval/filter/Skeleton/EmptyState/Avatar/Badge/NativeSelect/`formatInTimeZone` uslublari.
- **`hr-api.ts`** `hrDavomatReportApi` + `toQueryString` (satr 103, 843–851) — client uslubi.
- **`map-radius-picker.tsx`** — OSM tile provayderi (link-provayder tanlovi shunga mos).
- **`hr/page.tsx`** `StatCard` + `refetchInterval:30_000` — dashboard KPI kartalari (deep-link manbai).

---

**Chekka holatlar (edge cases)**

- **Timezone** — barcha kun-matematikasi Asia/Tashkent (`fromZonedTime`/`tashkentWeekday`). `date` param'i UTC emas, local kun sifatida talqin qilinadi. Weekday peshin (`T12:00`) orqali (DST/yarim tunlik chegara xavfsiz).
- **Bir kunda bir necha check-in** (re-entry) — `attendanceState` **eng erta** yozuvdan (arrival lateMinutes), `presence` **eng oxirgi** yozuvdan (`checkOutTime` bo'lsa `left`, aks holda `at_work`). `HrAttendance` bir kunda ko'p qatorli bo'lishi mumkin — `Set(employeeId)` bilan guruhlash yetarli emas, xodim-bo'yicha reduce kerak.
- **Presence semantikasi sana bo'yicha farq qiladi** — `at_work`/`left` faqat *bugun* uchun jonli. O'tgan sana uchun "Ishda" ma'nosizroq; o'sha holatda `presence` = `left` (agar checkOut bor) yoki keldi-lekin-ochiq yozuv (autoClosed cron yopgan). Default: o'tgan sanada ochiq qolgan yozuv `left` deb ko'rsatiladi (autoClosed badge bilan). Ochiq savolga qarang.
- **Opt-in / filial yo'q** — `absent` ro'yxatiga faqat `attendanceOptIn:true` + jadvalli (day-off emas) xodimlar kiradi (mirror `live()` `scheduled`). Opt-in qilmagan, lekin admin qo'lda check-in qilgan xodim `present` union orqali ko'rinadi (aks holda yo'qoladi).
- **Day-off** — jadval yo'q yoki `isDayOff` → `presence:'dayoff'`, `attendanceState:null`, kech/kelmagan hisoblanmaydi. Day-off da check-in bo'lsa (ixtiyoriy ish) → `ontime`/`at_work` (lateMinutes 0, `computeLateMinutes` day-off da 0 qaytaradi).
- **autoClosed exit** — nightly cron yopgan yozuvda `checkOutTime` bor lekin `checkOutLat/Lng` **null** bo'lishi mumkin → exit-mark "Manzil" = "—", `autoClosed` badge ko'rsatiladi.
- **Ping 7-kun retention** — detail'da GPS ping-izi (agar qo'shilsa) faqat so'nggi 7 kun; eski marklar uchun manzil faqat `HrAttendance` saqlangan koordinatalaridan (permanent). "so'nggi 7 kun" degan izoh UI'da kerak bo'lsa.
- **Multi-tenant** — har so'rov `accountId` bilan scoped (barcha `findMany`/`findFirst` da), `archived:false`.
- **Manual (`source:'manual'`) yozuvlar** — koordinata yo'q (admin `/hr/attendance` check-in). Manzil "—", lekin kech/holat baribir `lateMinutes` dan ishlaydi.
- **Katta doska** — bir accountda yuzlab opted-in xodim: `daily()` bitta `employee.findMany` + bitta `hrAttendance.findMany` (index `[accountId, checkInTime]` — mavjud index `[accountId, employeeId, checkInTime]` prefiksdan foydalanmaydi; **yangi index kerak bo'lishi mumkin** `@@index([accountId, checkInTime])` — additive, prod-safe. Ochiq savolga qarang). `EmployeeWorkSchedule` weekday-filtered include bilan N+1 dan qochish.

---

**Ochiq savollar** (default tanlangan)

1. **Route joylashuvi** — detail TimePay'da `/track-employee/{id}`; men `/hr/monitoring/[employeeId]` ni tanladim (HR sub-nav ichida qoladi, deep-link toza). Default: `/hr/monitoring/[employeeId]`.
2. **Endpoint namespace** — `hr/monitoring` (FE route bilan mos) vs mavjud `hr/attendance/monitoring` . Default: **`hr/monitoring`** (yangi mustaqil controller — davomat-admin'ni shishirmaydi).
3. **O'tgan sanada presence** — "Ishda/Ketgan/Kelmagan" bugun uchun jonli; o'tgan kun uchun `at_work` (ochiq yozuv) `left` sifatida ko'rsatiladimi yoki alohida "ishga keldi" holati? Default: o'tgan kunda ochiq yozuv = `left` + `autoClosed` badge (kelgan-lekin-ketishi ko'rilmagan).
4. **Yangi DB index** — `daily()` account-bo'yicha kunlik skan uchun `@@index([accountId, checkInTime])` (`HrAttendance`) qo'shilsinmi? Default: **HA** (additive, prod-safe) — mavjud `[accountId, employeeId, checkInTime]` index butun-account kunlik so'rovda prefiks bermaydi.
5. **Punch photo** — DEFER (yuqorida). Default: "Rasm" ustuni placeholder bilan ko'rsatiladi, backend `photoUrl:null`; kamera-capture keyingi ish.

### 5.6 Navigatsiya + i18n

### Navigatsiya (HR sub-nav) + I18N reja

Grounding: `apps/web/src/app/(app)/layout.tsx` (subnav qatorlari 407-418, `tHr = useTranslations('subnav.hr')` — qator 43, `matchActive` — 533-534, hr activeModule — 517-518, `subNavByModule`/mobileSections — 579-599), `packages/design-system/src/layout/SubNav.tsx` (`SubNavItem` type + render), `apps/web/src/messages/{ru,uz}.json` namespaces `subnav.hr`, `pages.hrDashboard`, `pages.hrEmployees`, `pages.workLocations`, `pages.employeeSchedule`, `common`. Disk routes: `apps/web/src/app/(app)/hr/**/page.tsx` (mavjud: page, employees, attendance(+monthly), tasks, review, my-tasks, payroll, messages, reports, settings/{roles,telegram,work-locations}; YO'Q: schedules, departments, positions, monitoring → yangi).

**Ma'lumot modeli (Prisma)** — reuse: bu bo'lim (navigatsiya + i18n) yangi Prisma model kiritmaydi. `subnav.hr` label'lari — sof i18n; nav faqat mavjud/yangi route'larga `href` bilan ishora qiladi. (Yangi `/hr/schedules|departments|positions|monitoring` sahifalarining modellari — tegishli feature-bo'limlarida: HrSchedule, HrDepartment, HrPosition va Employee dagi yangi `scheduleId`/`positionId` FK'lar. `SubNavItem` (`packages/design-system/src/layout/SubNav.tsx:6-11`) shakli `{ key, label, href, active? }` — o'zgarmaydi.)

**API endpoints** — yo'q. Navigatsiya klient-side render (App Router `usePathname`), i18n static JSON. Backend endpoint talab qilinmaydi.

**Backend modullar** — yo'q (nav/i18n). Faqat FE fayllar (pastda).

**Frontend**

1) **Yangi `hrSubNav` tartibi** (`apps/web/src/app/(app)/layout.tsx`, hozirgi 407-418 ni almashtirish). Mavjud sahifalar SAQLANADI; `attendance` (`/hr/attendance`) sub-nav'dan olib tashlanadi, lekin sahifa URL-addressable qoladi va `activeModule === 'hr'` (517-518) orqali «hr» highlight'ini ushlab turadi — bu aynan `productSubNav`'dagi precedent (layout.tsx:391-405, «trimmed from the sub-nav while the pages stay URL-addressable»). Bugungi «today» davomat funksiyasi dashboard'ga ko'chadi, oylik hisobot `/hr/attendance/monthly` da qoladi.

```ts
const hrSubNav: SubNavItem[] = [
  { key: 'home',        label: tHr('home'),        href: '/hr' },
  { key: 'employees',   label: tHr('employees'),   href: '/hr/employees' },
  { key: 'monitoring',  label: tHr('monitoring'),  href: '/hr/monitoring' },
  { key: 'schedules',   label: tHr('schedules'),   href: '/hr/schedules' },
  { key: 'departments', label: tHr('departments'), href: '/hr/departments' },
  { key: 'positions',   label: tHr('positions'),   href: '/hr/positions' },
  { key: 'branches',    label: tHr('branches'),    href: '/hr/settings/work-locations' },
  { key: 'tasks',       label: tHr('tasks'),       href: '/hr/tasks' },
  { key: 'review',      label: tHr('review'),      href: '/hr/review' },
  { key: 'my-tasks',    label: tHr('my_tasks'),    href: '/hr/my-tasks' },
  { key: 'payroll',     label: tHr('payroll'),     href: '/hr/payroll' },
  { key: 'messages',    label: tHr('messages'),    href: '/hr/messages' },
  { key: 'reports',     label: tHr('reports'),     href: '/hr/reports' },
  { key: 'settings',    label: tHr('settings'),    href: '/hr/settings' },
];
```

2) **Aktiv-highlight tuzatish (MAJBURIY — pastdagi edge-case'lar sababli).** Umumiy `matchActive` (layout.tsx:533-534) `active: pathname === i.href || pathname.startsWith(`${i.href}/`)` — har item'ni MUSTAQIL baholaydi (SubNav.tsx «most-specific wins» qilmaydi). Bu ikki collision beradi (pastda). Umumiy `matchActive`'ni O'ZGARTIRMANG (boshqa 12 modul unga bog'liq). O'rniga faqat hr uchun lokal matcher kiritib, 561-562 dagi `matchActive(hrSubNav)` ni `matchActiveHr(hrSubNav)` ga almashtiring; `subNavByModule.hr` (589) va mobil bo'lim (597) ham shu funksiyadan foydalansin:

```ts
const matchActiveHr = (items: SubNavItem[]): SubNavItem[] =>
  items.map((i) => {
    let active: boolean;
    if (i.href === '/hr') active = pathname === '/hr';               // exact — aks holda har /hr/* da yonadi
    else if (i.key === 'settings')                                    // work-locations'ni settings'dan ajrat
      active = pathname.startsWith('/hr/settings') &&
               !pathname.startsWith('/hr/settings/work-locations');
    else active = pathname === i.href || pathname.startsWith(`${i.href}/`);
    return { ...i, active };
  });
```

3) **Route'lar:** yangi `apps/web/src/app/(app)/hr/{monitoring,schedules,departments,positions}/page.tsx` (tegishli feature-bo'limlarda quriladi). `branches` mavjud `hr/settings/work-locations/page.tsx` ni ochadi. `canSeeRoute('/hr/settings/work-locations')` mobil filtrda (597) va desktop'da ruxsat berishini tasdiqlash kerak (route allaqachon settings ostida gate'langan).

4) **Dashboard qayta ishlash** (`hr/page.tsx`): h1 `t('title')` attendance-centric bo'ladi; yangi filter-chip qatori (Barchasi/Ishda/Kech/Ishda emas), «Qo'lda davomat yaratish» tugmasi, jadval ustunlari (Xodim/Kirish/Chiqish/Qo'shimcha/Jami/Filiallar). Barcha komponentlar `@moysklad/ui` (`Badge`, `Button`, `Skeleton`, `Modal`) + `var(--ms-*)` token, react-query `useQuery` — hozirgi `hr/page.tsx` uslubida.

**States:** har item `active` (bo'lasin/bo'lmasin) → SubNav 2px brand-underline (SubNav.tsx:67-68); loading = `Skeleton`; empty = `EmptyState` (workLocations sahifasidagidek). Permission-filtrlangan item'lar mobil sheet'da `canSeeRoute` bilan yashiriladi (597).

**i18n**

Gate talablari: (a) har kalit **ru + uz IKKALASIDA** mavjud (key-existence gate); (b) UI matni hardcoded emas — hammasi `t()` orqali; (c) generic tugmalar `common.*` dan qayta ishlatiladi (yangi namespace'da qayta e'lon qilinmaydi); (d) hafta-kun label'lari `pages.employeeSchedule.day_0..day_6` dan ikkinchi `useTranslations('pages.employeeSchedule')` hook orqali qayta ishlatiladi (dublikat emas).

**(A) `subnav.hr` — o'zgarish + yangi label'lar** (mavjud struktura: home/employees/attendance/tasks/review/my_tasks/payroll/messages/reports/settings). `attendance` kalitini O'CHIRMANG (page hali ham i18n ishlatadi); faqat qatordan olib tashlang. `home` label'ini retitle qiling + 5 yangi kalit:

| key | ru | uz |
|---|---|---|
| home *(retitle)* | Панель управления | Boshqaruv paneli |
| monitoring *(new)* | Мониторинг | Xodimlarni kuzatish |
| schedules *(new)* | Графики | Jadvallar |
| departments *(new)* | Отделы | Bo'limlar |
| positions *(new)* | Должности | Lavozimlar |
| branches *(new)* | Филиалы | Shoxobchalar |

**(B) YANGI `pages.hrSchedules`** (Ish jadvallari — TimePay label'lari grounded):

| key | ru | uz |
|---|---|---|
| title | Графики работы | Ish jadvallari |
| subtitle | Шаблоны графиков и смен | Jadval va smena shablonlari |
| create_button | Новый график | Yangi jadval |
| create_title | Новый график | Yangi jadval |
| edit_title | Редактирование графика | Jadvalni tahrirlash |
| col_name | Название | Nomi |
| col_type | Тип | Turi |
| col_start_date | Дата начала | Boshlanish sanasi |
| col_cycle | Цикл | Sikl |
| col_employees | Сотрудники | Xodimlar |
| type_fixed | Фиксированный | Belgilangan |
| type_flexible | Гибкий | Moslashuvchan |
| type_free | Свободный | Erkin |
| form_name | Название | Nomi |
| form_type | Тип | Turi |
| form_start_date | Дата начала | Boshlanish sanasi |
| form_cycle | Цикл (дней) | Sikl (kun) |
| form_cycle_hint | Через сколько дней график повторяется | Jadval necha kunda takrorlanadi |
| day_work | Рабочий день | Ish kuni |
| day_start | Начало работы | Boshlanish vaqti |
| day_end | Конец работы | Tugash vaqti |
| break_start | Начало перерыва | Tanaffus boshlanishi |
| break_end | Конец перерыва | Tanaffus tugashi |
| is_day_off | Выходной | Dam olish kuni |
| empty_title | Графиков пока нет | Hali jadval yo'q |
| empty_hint | Нажмите «Новый график» | «Yangi jadval» tugmasini bosing |
| delete_confirm | Удалить график? | Jadvalni o'chirasizmi? |
| delete_blocked | К графику привязаны сотрудники | Jadvalga xodimlar biriktirilgan |

*(Hafta-kunlari: `pages.employeeSchedule.day_0..day_6` reuse — yangi kalit emas.)*

**(C) YANGI `pages.hrDepartments`** (Bo'limlar):

| key | ru | uz |
|---|---|---|
| title | Отделы | Bo'limlar |
| subtitle | Отделы компании | Kompaniya bo'limlari |
| create_button | Новый отдел | Yangi bo'lim |
| create_title | Новый отдел | Yangi bo'lim |
| edit_title | Редактирование отдела | Bo'limni tahrirlash |
| col_name | Название | Nomi |
| col_head | Руководитель | Rahbar |
| col_employees | Сотрудников | Xodimlar soni |
| form_name | Название | Nomi |
| form_head | Руководитель | Rahbar |
| form_head_none | — Не выбран — | — Tanlanmagan — |
| empty_title | Отделов пока нет | Hali bo'lim yo'q |
| empty_hint | Нажмите «Новый отдел» | «Yangi bo'lim» tugmasini bosing |
| delete_confirm | Удалить отдел? | Bo'limni o'chirasizmi? |
| delete_blocked | В отделе есть сотрудники — удалить нельзя | Bo'limda xodimlar bor — o'chirib bo'lmaydi |

**(D) YANGI `pages.hrPositions`** (Lavozimlar):

| key | ru | uz |
|---|---|---|
| title | Должности | Lavozimlar |
| subtitle | Должности сотрудников | Xodim lavozimlari |
| create_button | Новая должность | Yangi lavozim |
| create_title | Новая должность | Yangi lavozim |
| edit_title | Редактирование должности | Lavozimni tahrirlash |
| col_name | Название | Nomi |
| col_department | Отдел | Bo'lim |
| col_employees | Сотрудников | Xodimlar soni |
| form_name | Название | Nomi |
| form_department | Отдел | Bo'lim |
| form_department_none | — Не выбран — | — Tanlanmagan — |
| empty_title | Должностей пока нет | Hali lavozim yo'q |
| empty_hint | Нажмите «Новая должность» | «Yangi lavozim» tugmasini bosing |
| delete_confirm | Удалить должность? | Lavozimni o'chirasizmi? |
| delete_blocked | Должность назначена сотрудникам | Lavozim xodimlarga biriktirilgan |

**(E) YANGI `pages.hrMonitoring`** (Xodimlarni kuzatish — TimePay status'lari grounded):

| key | ru | uz |
|---|---|---|
| title | Мониторинг сотрудников | Xodimlarni kuzatish |
| subtitle | Статусы сотрудников в реальном времени | Real vaqtdagi xodim holati |
| status_late | Опоздал | Kechikkan |
| status_on_time | Вовремя | Vaqtida |
| status_working | На работе | Ishda |
| status_absent | Не пришёл | Kelmagan |
| open_on_map | Открыть на карте | Xaritada ochish |
| col_employee | Сотрудник | Xodim |
| col_branch | Филиал | Filial |
| col_check_in | Приход | Kirish |
| col_status | Статус | Holat |
| col_last_ping | Последний сигнал | Oxirgi signal |
| empty_title | Нет активных сотрудников | Faol xodim yo'q |
| empty_hint | Сегодня никто не отметился | Bugun hech kim belgilanmagan |
| map_no_location | Нет данных о местоположении | Joylashuv ma'lumoti yo'q |

*(Filter chip'lari uchun `common.all` = «Все»/«Barchasi» reuse.)*

**(F) EXTEND `pages.hrDashboard`** (mavjud 10 kalit saqlanadi; `title` retitle + 11 yangi kalit). Task label'lari grounded:

| key | ru | uz |
|---|---|---|
| title *(retitle)* | Панель управления сотрудниками | Xodimlar boshqaruv paneli |
| filter_all | Все | Barchasi |
| filter_working | На работе | Ishda |
| filter_late | Опоздавшие | Kech |
| filter_absent | Не на работе | Ishda emas |
| create_manual | Ручная отметка | Qo'lda davomat yaratish |
| col_employee | Сотрудник | Xodim |
| col_check_in | Приход | Kirish |
| col_check_out | Уход | Chiqish |
| col_extra | Доп. | Qo'shimcha |
| col_total | Итого | Jami |
| col_branch | Филиалы | Filiallar |

**(G) EXTEND `pages.hrEmployees`** (mavjud ~70 kalit + `davomat_*`, `tab_schedule` saqlanadi; position/schedule select uchun yangi kalitlar):

| key | ru | uz |
|---|---|---|
| form_position | Должность | Lavozim |
| form_position_none | — Не выбрано — | — Tanlanmagan — |
| col_position | Должность | Lavozim |
| form_schedule | График работы | Ish jadvali |
| form_schedule_none | — Не назначено — | — Biriktirilmagan — |

*(Mavjud `form_department` (free-string) → HrDepartment select'ga aylanishi mumkin — Ochiq savollar'ga qarang; label o'zgarmaydi.)*

**Mavjud koddan qayta ishlatish**
- `SubNavItem` type + `SubNav` render — `packages/design-system/src/layout/SubNav.tsx:6-15` (o'zgarmaydi; `active` prop 2px underline beradi).
- `tHr = useTranslations('subnav.hr')` va nav-massiv patterni — `layout.tsx:43,407-418`; `matchActive` (533-534), `activeModule` hr-branch (517-518), `subNavByModule` (579-591), mobil `canSeeRoute` filtri (592-599).
- «Sahifa nav'dan trimmed, lekin URL-addressable» precedent — `layout.tsx:391-405` (`productSubNav` izohi) — `attendance`ni shu asosda olib tashlaymiz.
- Branches tab mavjud sahifani ochadi — `hr/settings/work-locations/page.tsx` (`useTranslations('pages.workLocations')`, `EmptyState`, `Modal`, Leaflet `MapRadiusPicker`).
- Hafta-kun label'lari — `pages.employeeSchedule.day_0..day_6` (+ `col_start/col_end/col_dayoff`) — schedules formasida ikkinchi hook orqali reuse.
- Generic tugma/holat matnlari — `common.*` (`save`, `cancel`, `edit`, `delete`, `create`, `add`, `close`, `search`, `all`, `actions`, `status`, `back`, `no_records`) — `ru.json`/`uz.json` `common` namespace (85 kalit).
- Dashboard qayta ishlash bazasi — `hr/page.tsx` (react-query `refetchInterval`, `StatCard`, `Badge`, `Skeleton`, `var(--ms-*)`).

**Chekka holatlar (edge cases)**
1. **`home` prefix-collision (pre-existing bug):** umumiy `matchActive` `pathname.startsWith('/hr/')` tekshirgani uchun `home` (`href: '/hr'`) HAR `/hr/*` sahifada yonadi — hozir ham `attendance`/`employees` bilan bir vaqtda ikki tab highlight bo'ladi. `matchActiveHr` da `home`ni **exact** (`pathname === '/hr'`) qilish shart.
2. **`branches` vs `settings` nesting:** `branches` href `/hr/settings/work-locations` `settings` (`/hr/settings`) ostida joylashgan → prefix qoidasida IKKALASI yonadi. `matchActiveHr` da `settings`ni `/hr/settings/work-locations` subtree'dan istisno qilish.
3. **`schedules` ≠ per-employee schedule:** yangi global `/hr/schedules` (jadval-shablon) `hr/employees/[id]/schedule` (xodim-jadvali tab) bilan aralashmasin — ular alohida route; `[id]/schedule` da `employees` tab yonadi (to'g'ri).
4. **`attendance` trimmed lekin faol:** `/hr/attendance` sub-nav'da yo'q, lekin `activeModule` (`startsWith('/hr')`) «hr» sub-strip'ni ko'rsatadi; hech bir tab yonmaydi (moysklad trimmed-page parity). Sahifaning i18n kaliti (`subnav.hr.attendance`) o'chirilmasligi kerak — page hali `pages.hrAttendance` ishlatadi (bu boshqa namespace, saqlanadi).
5. **i18n gate — ru/uz simmetriya:** har yangi kalit IKKI faylda bir vaqtda qo'shilishi shart (key-existence gate ru+uz aks holda buziladi). uz apostrofi — kod bazasidagi ASCII `'` (masalan `workLocations.uz` «Filial qo'shish») ishlatiladi, mustaqil quote emas.
6. **`canSeeRoute` permission:** `branches` href boshqa route префикси (`/hr/settings/work-locations`) — mobil filtrda (597) va desktop'da bu path'ga permission-mapping mavjudligini tasdiqlash; aks holda tab admin-only bo'lib qoladi/yo'qoladi.
7. **13→~14 tab overflow:** hr endi ~14 tab; SubNav mobil'da `flex-nowrap overflow-x-auto` (SubNav.tsx:47) — swipe qatori, desktop `md:flex-wrap` — muammosiz, lekin uzun uz-label'lar (`Xodimlarni kuzatish`) qatorni kengaytiradi; label'larni ixcham tut.

**Ochiq savollar**
1. **`attendance` tab taqdiri.** Task-tartibi uni ro'yxatga kiritmagan. **Default:** sub-nav'dan olib tashlab, `/hr/attendance` (+`/monthly`) ni URL-addressable qoldirish (productSubNav precedent), «today» funksiyasini dashboard'ga ko'chirish. Agar oylik-hisobot alohida tab kerak bo'lsa — `branches`dan keyin `attendance` (label: «Учёт времени/Davomat») qaytariladi.
2. **`form_department` — string vs FK.** Departments/positions endi entity. **Default:** additive — mavjud `Employee.department` string ustunini saqlab, yangi `departmentId`/`positionId` nullable FK qo'shish; forma select'ga o'tadi, label (`form_department`) o'zgarmaydi. Migratsiya string→FK backfill emas (prod-safe, additive-only).
3. **`home` label «Boshqaruv paneli» vs mavjud «Bosh sahifa».** **Default:** retitle qilib «Boshqaruv paneli»/«Панель управления» (dashboard attendance-centric bo'lgani uchun mos). Eski «Bosh sahifa» label boshqa joyda ishlatilmaydi (`subnav.hr.home` faqat shu nav'da), shuning uchun xavfsiz.
4. **`monitoring` uz-label uzunligi.** «Xodimlarni kuzatish» ~2 tab eni. **Default:** shu qoldiriladi (aniqlik > ixchamlik); agar strip toshsa — «Kuzatuv»ga qisqartirish.

---

## 6. Fazalash (implementatsiya tartibi)

CLAUDE.md §0: har sessiya 1 flagship (+1 mayda) → commit → sessiya yopiladi. Multi-agent wiring xavfsizlik
protokoli: schema+migration+client-regen wiring'dan OLDIN alohida commit.

| Faza | Ish | Sessiya |
|------|-----|---------|
| 1 | **Model** — 5 model + migration + `prisma generate` (alohida commit) | 1 |
| 2 | **Bo'lim + Lavozim** — backend CRUD + FE sahifalar (eng oddiy starter) | 1 |
| 3 | **Jadvallar** — shablon CRUD + resolveShift util + testlar | 1–2 |
| 4 | **Xodimlar** — filtr + Jadval ustuni + biriktirish | 1 |
| 5 | **Boshqaruv paneli** — KPI + davomat jadvali + qo'lda davomat modal | 1 |
| 6 | **Xodimlarni kuzatish** — status jadvali + detal | 1 |

**Bu sessiyada:** Faza 1 (model) + Faza 2 (Bo'lim/Lavozim).

## 7. Konvensiyalar va gate

- **Backend:** NestJS `.controller/.service/.schema(zod)/.service.test.ts` co-located; `accountId` scoping.
- **Prisma:** `@map` snake_case, additive-only migration (nullable/defaulted FK, prod-safe), `Timestamptz`,
  vaqt "HH:mm" `VarChar(5)`, TZ `Asia/Tashkent`.
- **Frontend:** `@moysklad/ui`, `var(--ms-*)` tokenlar, `next-intl` (ru+uz), react-query; hardcoded string YO'Q.
- **Testlar:** co-located vitest; sof mantiq → sof util + unit-test.
- **Gate (majburiy, har commit):** `pnpm typecheck` · `pnpm lint` (biome 0) · `pnpm i18n:gate` · `pnpm test`.
  Migratsiya: `pnpm db:migrate` (nom `YYYYMMDDHHMMSS_...`).
- **Status yorlig'i:** natija **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»**; browser-QA alohida Phase-2.

## 8. Ochiq savollar (har bo'lim agenti default tanladi)

Har bo'lim spec'ining oxirida «Ochiq savollar» bor (default qaror bilan). Asosiylari:
- `extendedWorkTime` birligi = **daqiqa** (default); Erkin jadval ham har sikl-kun uchun 1 satr (faqat `isWorkday`).
- Legacy `Employee.department/position` string'lari saqlanadi; FK'lar yangi source-of-truth; backfill **defer**.
- `Employee.workLocationId` = birlamchi filial (saqlanadi), `HrEmployeeBranch` = to'liq to'plam.
- Kechasi smena (`endTime < startTime`) MVP'da **taqiqlanadi** (open Q: night-shift keyin).
