# P2 — HR-Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> **User rule (2026-05-20):** Sprint-level batching — per-task commit YO'Q. Task 8 = sprint final gate + commit.
> **User rule (2026-05-20 NEW):** Parallel terminal/agent ham loyihada ishlayotgan bo'lishi mumkin. Commit'da **faqat menga tegishli HR fayllar** stage qilinadi (`apps/api/src/modules/hr/`, `apps/web/src/app/(app)/hr/`, `apps/web/src/lib/hr-api.ts`, `docs/superpowers/plans/`, `apps/web/src/messages/uz.json`+`ru.json`). Boshqa staged narsalar `git restore --staged` bilan ajratiladi.

**Goal:** HR-Attendance moduli — xodim davomatini check-in/check-out qayd qilish, admin tahrirlash, kun bo'yicha + period hisobot, TZ-safe (Asia/Tashkent +05).

**Architecture:** Mavjud `HrAttendance` Prisma model (P0 da yaratilgan) — `(employeeId, checkInTime, checkOutTime, editedById, editedAt, notes)`. Yangi service + controller `apps/api/src/modules/hr/attendance/`. Web sahifa 2 tab: Bugun (check-in/out belgilash) + Hisobot (period range). TZ helpers `tz.util.ts` ishlatiladi (mavjud).

**Tech Stack:** NestJS + Prisma + Zod + Vitest + Next.js 15 + react-query + @moysklad/ui (mavjud).

**Source spec:** [docs/superpowers/specs/2026-05-20-hr-module-master-design.md](../specs/2026-05-20-hr-module-master-design.md) — § 2 (P2 sub-system).

**Estimated time:** 3-4 kun.

---

## File Structure

### Yangi backend (4 fayl + 1 modify):
```
apps/api/src/modules/hr/attendance/
├── attendance.module.ts          # MODIFY: placeholder → real (imports + providers)
├── hr-attendance.controller.ts   # CREATE: 7 endpoint
├── hr-attendance.service.ts      # CREATE: FSM (check-in/out/edit/clear)
├── hr-attendance.service.test.ts # CREATE: 8+ test (FSM, TZ boundary)
└── hr-attendance.schema.ts       # CREATE: Zod (CheckIn, CheckOut, Edit, ReportFilter)
```

### Yangi web (3 fayl + 2 modify):
```
apps/web/src/app/(app)/hr/attendance/
├── page.tsx                       # MODIFY: placeholder → 2-tab (TodayTab + ReportTab)
└── _components/
    ├── check-in-modal.tsx        # CREATE: employee select + "Belgilash"
    └── edit-attendance-modal.tsx # CREATE: edit times + clear check_out + delete

apps/web/src/lib/hr-api.ts         # MODIFY: hrAttendanceApi qo'shish
apps/web/src/messages/uz.json      # MODIFY: pages.hrAttendance namespace
apps/web/src/messages/ru.json      # MODIFY: same
```

---

## Tasks

### Task 1: Schema (Zod)

**File:** `apps/api/src/modules/hr/attendance/hr-attendance.schema.ts`

```ts
import { z } from 'zod';

export const CheckInSchema = z.object({
  employeeId: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
});

export const CheckOutSchema = z.object({}); // body bo'sh; URL'dan id keladi

export const EditAttendanceSchema = z.object({
  checkInTime: z.coerce.date().optional(),
  checkOutTime: z.coerce.date().nullable().optional(),
  clearCheckOut: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const ReportFilterSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  employeeId: z.string().uuid().optional(),
});

export const TodayFilterSchema = z.object({
  date: z.coerce.date().optional(), // default = today
});

export type CheckInInput = z.infer<typeof CheckInSchema>;
export type EditAttendanceInput = z.infer<typeof EditAttendanceSchema>;
export type ReportFilter = z.infer<typeof ReportFilterSchema>;
```

### Task 2: Service

**File:** `apps/api/src/modules/hr/attendance/hr-attendance.service.ts`

```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { startOfLocalDay } from '../hr-shared/tz.util.js';
import type {
  CheckInInput,
  EditAttendanceInput,
  ReportFilter,
} from './hr-attendance.schema.js';

@Injectable()
export class HrAttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Today's attendance records (one per employee). */
  async listToday(accountId: string, date?: Date) {
    const dayStart = startOfLocalDay(date ?? new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.client.hrAttendance.findMany({
      where: {
        accountId,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
      include: { employee: { select: { id: true, name: true, hrRoles: true } } },
      orderBy: { checkInTime: 'asc' },
    });
  }

  /** Period report — multiple days for one or all employees. */
  async report(accountId: string, filter: ReportFilter) {
    const dayStart = startOfLocalDay(filter.dateFrom);
    const endStart = startOfLocalDay(filter.dateTo);
    const dayEnd = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.client.hrAttendance.findMany({
      where: {
        accountId,
        checkInTime: { gte: dayStart, lt: dayEnd },
        ...(filter.employeeId && { employeeId: filter.employeeId }),
      },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: [{ checkInTime: 'asc' }, { employee: { name: 'asc' } }],
    });
  }

  /** Create check-in for an employee. Fails if employee already checked in today. */
  async checkIn(accountId: string, input: CheckInInput) {
    const dayStart = startOfLocalDay(new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const existing = await this.prisma.client.hrAttendance.findFirst({
      where: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) {
      throw new BadRequestException('Bu xodim bugun allaqachon kelishni belgilagan');
    }

    return this.prisma.client.hrAttendance.create({
      data: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: new Date(),
        notes: input.notes ?? undefined,
      },
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  /** Mark check-out on an existing attendance row. */
  async checkOut(accountId: string, id: string) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');
    if (row.checkOutTime) {
      throw new BadRequestException('Allaqachon ketish belgilangan');
    }
    return this.prisma.client.hrAttendance.update({
      where: { id },
      data: { checkOutTime: new Date() },
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  /** Edit attendance (admin only — controller-level guard). */
  async edit(
    accountId: string,
    id: string,
    editorId: string,
    input: EditAttendanceInput,
  ) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');

    const data: Record<string, unknown> = {
      editedById: editorId,
      editedAt: new Date(),
    };
    if (input.checkInTime !== undefined) data.checkInTime = input.checkInTime;
    if (input.clearCheckOut) {
      data.checkOutTime = null;
    } else if (input.checkOutTime !== undefined) {
      data.checkOutTime = input.checkOutTime;
    }
    if (input.notes !== undefined) data.notes = input.notes;

    // Validation: checkOut must be after checkIn
    const finalCheckIn = (data.checkInTime as Date | undefined) ?? row.checkInTime;
    const finalCheckOut = data.checkOutTime as Date | null | undefined;
    if (finalCheckOut && finalCheckOut < finalCheckIn) {
      throw new BadRequestException("Ketish vaqti kelishdan oldin bo'la olmaydi");
    }

    return this.prisma.client.hrAttendance.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  async delete(accountId: string, id: string) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');
    await this.prisma.client.hrAttendance.delete({ where: { id } });
    return { ok: true };
  }
}
```

### Task 3: Service tests (8 case)

**File:** `apps/api/src/modules/hr/attendance/hr-attendance.service.test.ts`

Tests:
1. checkIn: success creates row with current timestamp
2. checkIn: fails when employee already checked in today (BadRequest)
3. checkOut: success marks row + employee returned
4. checkOut: fails when checkOutTime already set
5. checkOut: fails on missing row (NotFound)
6. edit: setting clearCheckOut=true resets checkOutTime to null
7. edit: fails when new checkOutTime is before checkInTime
8. delete: success removes row

(Mock Prisma client with vi.fn() — pattern from P1's hr-employee.service.test.ts.)

### Task 4: Controller + Module

**File:** `apps/api/src/modules/hr/attendance/hr-attendance.controller.ts`

7 endpoint under `/hr/attendance` with JwtAuth + HrPermissionGuard. Required permission: page `'employees'` (HR attendance ham xodim bilan bog'liq):
- `GET /today?date=` — listToday
- `GET /report?dateFrom=&dateTo=&employeeId=` — report
- `POST /check-in` — checkIn (body: `{employeeId, notes?}`)
- `POST /:id/check-out` — checkOut
- `PATCH /:id` — edit
- `DELETE /:id` — delete

`@RequireHrPermission('employees', 'read')` for GET, `'full'` for write operations.

**File:** `attendance.module.ts` — replace placeholder with real module:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrAttendanceController } from './hr-attendance.controller.js';
import { HrAttendanceService } from './hr-attendance.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrAttendanceController],
  providers: [HrAttendanceService],
  exports: [HrAttendanceService],
})
export class HrAttendanceModule {}
```

### Task 5: Web — hrAttendanceApi

**File:** Add to `apps/web/src/lib/hr-api.ts`:

```ts
export interface HrAttendanceRow {
  id: string;
  employeeId: string;
  employee: { id: string; name: string; hrRoles?: string[] };
  checkInTime: string;
  checkOutTime: string | null;
  editedById: string | null;
  editedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export const hrAttendanceApi = {
  listToday: (date?: string) =>
    api.get<HrAttendanceRow[]>(`/hr/attendance/today${date ? `?date=${date}` : ''}`),
  report: (filter: { dateFrom: string; dateTo: string; employeeId?: string }) =>
    api.get<HrAttendanceRow[]>(`/hr/attendance/report?${new URLSearchParams(filter as Record<string, string>)}`),
  checkIn: (data: { employeeId: string; notes?: string }) =>
    api.post<HrAttendanceRow>('/hr/attendance/check-in', data),
  checkOut: (id: string) =>
    api.post<HrAttendanceRow>(`/hr/attendance/${id}/check-out`, {}),
  edit: (id: string, data: {
    checkInTime?: string;
    checkOutTime?: string | null;
    clearCheckOut?: boolean;
    notes?: string | null;
  }) =>
    api.patch<HrAttendanceRow>(`/hr/attendance/${id}`, data),
  remove: (id: string) =>
    api.delete<{ ok: true }>(`/hr/attendance/${id}`),
};
```

### Task 6: Web — Attendance page (2 tabs)

**File:** `apps/web/src/app/(app)/hr/attendance/page.tsx`

Features:
- Header: title "Davomat" + "Kelishni belgilash" button (right) → CheckInModal
- 2 tab: "Bugun" (default) | "Hisobot"
- **Tab "Bugun"** — table: Xodim | Kelish (🕐 yashil + HH:MM) | Ketish (🕐 qizil + HH:MM yoki "—") | Holat (chip: Ishda / Ketdi) | Amal (Ketishni belgilash / ✏️ tahrirlash)
- **Tab "Hisobot"** — filter: date from/to + xodim dropdown; table: Sana | Xodim | Kelish | Ketish | Davomiylik (auto-calc) | Holat
- Use `useQuery` (react-query) for both tabs

### Task 7: CheckInModal + EditModal

**Files:**
- `apps/web/src/app/(app)/hr/attendance/_components/check-in-modal.tsx`
- `apps/web/src/app/(app)/hr/attendance/_components/edit-attendance-modal.tsx`

CheckInModal: employee select (from `hrEmployeeApi.list()` filtered by today's check-ins) + "Belgilash" button.

EditAttendanceModal: datetime-local inputs (checkInTime, checkOutTime), "Tozalash" mini-button (clearCheckOut), notes textarea, "Saqlash" + "Bekor" + 🗑️ delete (red).

### Task 8: Sprint final gate + isolated commit

```bash
# Verify gates
cd D:/projects/moysklad
pnpm --filter @moysklad/api typecheck
pnpm --filter @moysklad/web typecheck
pnpm exec biome check apps/api/src/modules/hr/attendance apps/web/src/app/\(app\)/hr/attendance apps/web/src/lib/hr-api.ts
pnpm --filter @moysklad/api test
pnpm --filter @moysklad/web build

# ISOLATED commit (faqat HR fayllarini stage qilish)
git restore --staged .  # clear all staged
git add \
  apps/api/src/modules/hr/attendance/ \
  apps/web/src/app/\(app\)/hr/attendance/ \
  apps/web/src/lib/hr-api.ts \
  apps/web/src/messages/uz.json \
  apps/web/src/messages/ru.json \
  docs/superpowers/plans/2026-05-20-p2-hr-attendance.md

# Verify only HR + own files staged
git status --short | grep -v "^[AM] " && echo "Untracked files (will not commit)"

# Commit
GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "feat(hr): P2 — HR-Attendance ..."
```

---

## Self-Review

| Spec § | Task | Status |
|---|---|---|
| § 2 P2 — HrAttendance backend | Tasks 1-4 | ✅ |
| § 2 P2 — Web 2-tab UI | Tasks 5-7 | ✅ |
| § 8 TZ Asia/Tashkent | Service uses startOfLocalDay | ✅ |
| § 7 Sprint gate (single batch) | Task 8 | ✅ |
| Commit isolation (parallel safety) | Task 8 `git restore --staged .` | ✅ |
