# P1 — HR-Employee + Auth kengaytma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User rule (2026-05-20):** Sprint-level batching — har task'da `git commit` YO'Q. Task 17 = sprint final gate + bitta cohesive commit.
>
> **User rule (qayta yozish):** yangibolim/ kod REFERENCE ONLY. Har modul noldan TypeScript'da bu loyihaning standart pattern'lariga (Zod, NestJS DI, Prisma transactions, BigInt money, Tailwind class) to'liq mos qayta yoziladi.

**Goal:** HR-Employee modul (xodim CRUD + login set + MoySklad agent link + custom rollar + per-page permissions matrix) + Auth tizimini HR uchun kengaytirish (JWT payload'da hrRoles/isChecker/hrPermissions; HrPermissionGuard full enforcement).

**Architecture:** Mavjud `auth` module kengaytiriladi (JWT payload schema yangilanadi, login service Employee.hr* field'larni payload'ga qo'shadi). Yangi `hr/hr-employee` modul (CRUD + filter + set-password + agent linking). Yangi `hr/hr-role` modul (custom rol CRUD, 4 default protected). Yangi `hr/hr-employee-permission` modul (per-page matrix). HrPermissionGuard P0 placeholder → full enforcement (admin bypass + own_only filter). Web tarafida 3 ta yangi sahifa (employees list, employee detail, permissions matrix, roles settings) + EmployeeModal/SetPasswordModal komponentlar.

**Tech Stack:** NestJS 10 + Prisma 5 + Zod + argon2 + JWT + Next.js 15 + React Hook Form (mavjud, agar ishlatiladi) + next-intl + Tailwind. Yangi paket yo'q.

**Source spec:** [docs/superpowers/specs/2026-05-20-hr-module-master-design.md](../specs/2026-05-20-hr-module-master-design.md) § 4 (Auth/RBAC) + § 1 frontend (`/hr/employees`).

**Yangibolim reference (READ ONLY):**
- `D:/projects-desktop/projects/moysklad/backend/app/routers/auth.py` — login flow + comma-rol parse + permission load
- `D:/projects-desktop/projects/moysklad/backend/app/routers/employees.py` — CRUD + set-password + meta endpoints
- `D:/projects-desktop/projects/moysklad/backend/app/models/employee.py` — EmployeePermission table + permission catalog
- `D:/projects-desktop/projects/moysklad/frontend/src/pages/EmployeesPage.jsx` — UI logic (filter, modal, permission tab)

**Estimated time:** 5-7 kun.

---

## File Structure

### Yangi backend fayllar (~24 ta):

```
apps/api/src/modules/auth/
├── auth.service.ts                 # MODIFY: login() — Employee.hr* qo'shish + permissions yuklash
├── auth.schema.ts                  # MODIFY: AuthenticatedUser + LoginResponse kengaytirish
└── (boshqa fayllar tegmaydi)

apps/api/src/modules/hr/hr-auth/
├── hr-permission.guard.ts          # MODIFY: P0 placeholder → FULL ENFORCE
├── hr-permission.guard.test.ts     # CREATE: 10+ test case
└── (decorator va types tegmaydi — P0 da OK)

apps/api/src/modules/hr/hr-employee/
├── hr-employee.module.ts           # CREATE
├── hr-employee.controller.ts       # CREATE: 7 endpoint
├── hr-employee.service.ts          # CREATE: CRUD + filter + set-password + agent dropdown
├── hr-employee.service.test.ts     # CREATE: 8+ unit test
├── hr-employee.schema.ts           # CREATE: Zod (CreateEmployee, UpdateEmployee, SetPassword, FilterParams)
└── hr-employee.schema.test.ts      # CREATE: Zod validation tests

apps/api/src/modules/hr/hr-role/
├── hr-role.module.ts               # CREATE
├── hr-role.controller.ts           # CREATE: 4 endpoint (GET, POST, PUT, DELETE)
├── hr-role.service.ts              # CREATE: CRUD + protect default 4
├── hr-role.service.test.ts         # CREATE: 4 test
└── hr-role.schema.ts               # CREATE: Zod

apps/api/src/modules/hr/hr-employee-permission/
├── hr-employee-permission.module.ts  # CREATE
├── hr-employee-permission.controller.ts # CREATE: 2 endpoint (GET matrix, PUT bulk)
├── hr-employee-permission.service.ts # CREATE
├── hr-employee-permission.service.test.ts # CREATE: 5 test
└── hr-employee-permission.schema.ts # CREATE: Zod

apps/api/src/modules/hr/hr.module.ts # MODIFY: import 3 ta yangi modul
```

### Yangi web fayllar (~12 ta):

```
apps/web/src/app/(app)/hr/
├── employees/
│   ├── page.tsx                    # MODIFY: placeholder → full list (filter + jadval + +Xodim button)
│   ├── [id]/
│   │   ├── page.tsx                # CREATE: detail view + tabs
│   │   ├── permissions/page.tsx    # CREATE: per-page matrix UI
│   │   └── salary/page.tsx         # CREATE: per-employee salary override (placeholder, P5'da to'liq)
│   └── _components/
│       ├── employee-modal.tsx      # CREATE: CRUD form (6 input)
│       ├── set-password-modal.tsx  # CREATE: username + password
│       ├── moysklad-agent-dropdown.tsx # CREATE: Employee dropdown (kontragent agent linking)
│       └── role-multi-select.tsx   # CREATE: hrRoles[] picker + "+ Yangi rol" inline
└── settings/
    └── roles/
        └── page.tsx                # CREATE: HrRole CRUD page

apps/web/src/lib/
├── auth-store.ts                   # MODIFY: hrRoles, isChecker, hrPermissions saqlash
└── hr-api.ts                       # CREATE: HR API client helpers
```

---

## Tasks

### Task 1: Auth schema kengaytirish — AuthenticatedUser + LoginResponse

**Files:** `apps/api/src/modules/auth/auth.schema.ts` (modify)

- [ ] **Step 1: Update `AuthenticatedUser` interface**

In `apps/api/src/modules/auth/auth.schema.ts`, replace the `AuthenticatedUser` interface:

```ts
export interface AuthenticatedUser {
  sub: string; // employee id
  accountId: string;
  email: string;
  name: string;
  // === HR kengaytma (P1) ===
  username?: string | null;
  hrRoles: string[];
  isChecker: boolean;
  /**
   * Per-page HR permissions snapshot (cached at login). Format:
   * [{ pageKey: 'messages', section: null, accessLevel: 'full' }, ...].
   * Admins (hrRoles.includes('admin')) bypass all checks regardless.
   */
  hrPermissions: Array<{
    pageKey: string;
    section: string | null;
    accessLevel: 'full' | 'read' | 'own_only';
  }>;
}
```

- [ ] **Step 2: Update `LoginResponse.user`**

In the same file, kengaytmoq `LoginResponse.user`:

```ts
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    accountId: string;
    email: string;
    name: string;
    position: string | null;
    accountPlan: string;
    // === HR kengaytma (P1) ===
    username: string | null;
    hrRoles: string[];
    isChecker: boolean;
    hrPermissions: Array<{
      pageKey: string;
      section: string | null;
      accessLevel: 'full' | 'read' | 'own_only';
    }>;
  };
}
```

---

### Task 2: Auth service — login() ga HR data qo'shish

**Files:** `apps/api/src/modules/auth/auth.service.ts` (modify)

- [ ] **Step 1: Update Employee findFirst include**

In `auth.service.ts:29-32`, modify the employee query to include HR fields + permissions:

```ts
const employee = await this.prisma.client.employee.findFirst({
  where: { email: parsed.email.toLowerCase(), archived: false },
  include: {
    account: { select: { plan: true } },
    hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
  },
});
```

- [ ] **Step 2: Build authUser with HR fields**

Replace the `authUser` construction (around line 74-79):

```ts
const authUser: AuthenticatedUser = {
  sub: employee.id,
  accountId: employee.accountId,
  email: employee.email,
  name: employee.name,
  username: employee.username,
  hrRoles: employee.hrRoles,
  isChecker: employee.isChecker,
  hrPermissions: employee.hrPermissions.map((p) => ({
    pageKey: p.pageKey,
    section: p.section,
    accessLevel: p.accessLevel as 'full' | 'read' | 'own_only',
  })),
};
```

- [ ] **Step 3: Include HR fields in returned user**

Find the `return { accessToken, refreshToken, user: { ... } }` block. Add HR fields to the `user` object:

```ts
user: {
  id: employee.id,
  accountId: employee.accountId,
  email: employee.email,
  name: employee.name,
  position: employee.position,
  accountPlan: employee.account.plan,
  username: employee.username,
  hrRoles: employee.hrRoles,
  isChecker: employee.isChecker,
  hrPermissions: authUser.hrPermissions,
},
```

- [ ] **Step 4: Same for refresh() method**

If `refresh()` returns the same user shape, mirror the HR fields. Search for `accountPlan: employee.account.plan` and add HR fields beside it.

---

### Task 3: Auth username login — Email YOKI username

**Files:** `apps/api/src/modules/auth/auth.schema.ts` + `auth.service.ts` (modify)

- [ ] **Step 1: Update LoginSchema to accept identifier (email or username)**

```ts
export const LoginSchema = z.object({
  // Accept email OR username (HR field). Backwards compatible:
  // existing email-only clients still work.
  identifier: z.string().min(1, 'Email yoki username kiritilishi shart').max(255),
  password: z.string().min(1, 'Parol kiritilishi shart').max(200),
});
```

Keep a backward-compatible alias by adding a Zod transform that accepts both `email` and `identifier`:

```ts
export const LoginSchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  identifier: z.string().optional(),
  password: z.string().min(1, 'Parol kiritilishi shart').max(200),
}).transform((data) => {
  const id = data.identifier || data.email || data.username;
  if (!id) throw new Error('email, username, yoki identifier kiritilishi shart');
  return { identifier: id.trim(), password: data.password };
});

export type LoginInput = { identifier: string; password: string };
```

- [ ] **Step 2: Update auth.service.login() — try email, then username**

Replace the Employee findFirst:

```ts
const isEmail = parsed.identifier.includes('@');
const employee = await this.prisma.client.employee.findFirst({
  where: {
    archived: false,
    ...(isEmail
      ? { email: parsed.identifier.toLowerCase() }
      : { username: parsed.identifier }),
  },
  include: {
    account: { select: { plan: true } },
    hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
  },
});
```

---

### Task 4: HrPermissionGuard — full enforcement

**Files:** `apps/api/src/modules/hr/hr-auth/hr-permission.guard.ts` (modify)
**Test:** `apps/api/src/modules/hr/hr-auth/hr-permission.guard.test.ts` (create)

- [ ] **Step 1: Replace guard implementation**

Replace the P0 placeholder body with full enforcement:

```ts
import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import {
  HR_PERMISSION_METADATA_KEY,
  type HrAccessLevel,
  type HrPermissionRequirement,
} from './hr-permission.types.js';

const ACCESS_RANK: Record<HrAccessLevel, number> = {
  own_only: 1,
  read: 2,
  full: 3,
};

function hasAccess(have: HrAccessLevel, need: HrAccessLevel): boolean {
  return ACCESS_RANK[have] >= ACCESS_RANK[need];
}

@Injectable()
export class HrPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<HrPermissionRequirement | undefined>(
      HR_PERMISSION_METADATA_KEY,
      ctx.getHandler(),
    );
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('HR resurs uchun avtorizatsiya kerak');
    }

    // Admin bypass
    if (user.hrRoles.includes('admin')) return true;

    const perm = user.hrPermissions.find(
      (p) => p.pageKey === required.page && (required.section ? p.section === required.section : p.section === null),
    );
    if (!perm) {
      throw new ForbiddenException(
        `HR permission required: ${required.page}${required.section ? `:${required.section}` : ''}`,
      );
    }
    if (!hasAccess(perm.accessLevel, required.access)) {
      throw new ForbiddenException(
        `HR access level insufficient: required ${required.access}, have ${perm.accessLevel}`,
      );
    }
    return true;
  }
}
```

- [ ] **Step 2: Write guard test**

Create `hr-permission.guard.test.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { HrPermissionGuard } from './hr-permission.guard.js';
import { HR_PERMISSION_METADATA_KEY } from './hr-permission.types.js';

function makeCtx(user: AuthenticatedUser | null, requirement: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as Parameters<HrPermissionGuard['canActivate']>[0];
}

function makeReflector(meta: unknown): Reflector {
  return { get: () => meta } as unknown as Reflector;
}

const baseUser: AuthenticatedUser = {
  sub: 'e1',
  accountId: 'a1',
  email: 'x@y.uz',
  name: 'X',
  username: null,
  hrRoles: [],
  isChecker: false,
  hrPermissions: [],
};

describe('HrPermissionGuard', () => {
  it('returns true when no metadata (non-HR endpoint)', () => {
    const guard = new HrPermissionGuard(makeReflector(undefined));
    expect(guard.canActivate(makeCtx(baseUser, undefined))).toBe(true);
  });

  it('throws when user is missing', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'read' }));
    expect(() => guard.canActivate(makeCtx(null, undefined))).toThrow(ForbiddenException);
  });

  it('admin bypasses any requirement', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'full' }));
    expect(
      guard.canActivate(makeCtx({ ...baseUser, hrRoles: ['admin'] }, undefined)),
    ).toBe(true);
  });

  it('non-admin with matching full permission passes', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'full' }));
    expect(
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }] },
          undefined,
        ),
      ),
    ).toBe(true);
  });

  it('non-admin with only read fails when full required', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'full' }));
    expect(() =>
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }] },
          undefined,
        ),
      ),
    ).toThrow(/insufficient/);
  });

  it('non-admin with read passes when read required', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'read' }));
    expect(
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }] },
          undefined,
        ),
      ),
    ).toBe(true);
  });

  it('own_only passes when own_only required', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'own_only' }));
    expect(
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'own_only' }] },
          undefined,
        ),
      ),
    ).toBe(true);
  });

  it('section-specific permission required when metadata has section', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'read', section: 'messages:demand' }));
    expect(() =>
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }] },
          undefined,
        ),
      ),
    ).toThrow(/required/);
  });

  it('section match passes', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'read', section: 'messages:demand' }));
    expect(
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: 'messages:demand', accessLevel: 'read' }] },
          undefined,
        ),
      ),
    ).toBe(true);
  });

  it('different page permission does not satisfy', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'oylik', access: 'read' }));
    expect(() =>
      guard.canActivate(
        makeCtx(
          { ...baseUser, hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }] },
          undefined,
        ),
      ),
    ).toThrow(/required/);
  });
});
```

---

### Task 5: HrEmployee Zod schemas

**Files:** `apps/api/src/modules/hr/hr-employee/hr-employee.schema.ts` + `hr-employee.schema.test.ts` (create)

- [ ] **Step 1: Create schema file**

```ts
import { z } from 'zod';

export const CreateHrEmployeeSchema = z.object({
  name: z.string().min(1, "Ism kiritilishi shart").max(255),
  email: z.string().email("Email noto'g'ri").max(255).optional(),
  phone: z.string().max(20).optional().nullable(),
  // Telegram phone with +998 format (santexnika do'koni standart)
  telegramPhone: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, "Telegram telefon raqami noto'g'ri")
    .optional()
    .nullable(),
  department: z.string().max(100).optional().nullable(),
  hrRoles: z.array(z.string().max(50)).default([]),
  isChecker: z.boolean().default(false),
  moyskladAgentId: z.string().uuid().optional().nullable(),
});

export const UpdateHrEmployeeSchema = CreateHrEmployeeSchema.partial();

export const SetPasswordSchema = z.object({
  username: z
    .string()
    .min(3, 'Kamida 3 belgi')
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Faqat lotin harf, raqam, _ va -'),
  password: z.string().min(4, 'Kamida 4 belgi').max(200),
});

export const HrEmployeeFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(), // single role filter
  department: z.string().optional(),
  isChecker: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateHrEmployeeInput = z.infer<typeof CreateHrEmployeeSchema>;
export type UpdateHrEmployeeInput = z.infer<typeof UpdateHrEmployeeSchema>;
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;
export type HrEmployeeFilter = z.infer<typeof HrEmployeeFilterSchema>;
```

- [ ] **Step 2: Write schema tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  CreateHrEmployeeSchema,
  SetPasswordSchema,
  HrEmployeeFilterSchema,
} from './hr-employee.schema.js';

describe('HR Employee Zod schemas', () => {
  it('CreateHrEmployee requires name', () => {
    expect(() => CreateHrEmployeeSchema.parse({ name: '' })).toThrow();
  });

  it('telegramPhone accepts +998 format', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: '+998901234567' });
    expect(parsed.telegramPhone).toBe('+998901234567');
  });

  it('telegramPhone rejects invalid format', () => {
    expect(() =>
      CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: 'abc' }),
    ).toThrow();
  });

  it('hrRoles defaults to empty array', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect(parsed.hrRoles).toEqual([]);
  });

  it('isChecker defaults to false', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect(parsed.isChecker).toBe(false);
  });

  it('SetPassword rejects too-short password', () => {
    expect(() =>
      SetPasswordSchema.parse({ username: 'ozod', password: '123' }),
    ).toThrow(/4 belgi/);
  });

  it('SetPassword rejects special chars in username', () => {
    expect(() =>
      SetPasswordSchema.parse({ username: 'ozod@', password: 'abcd' }),
    ).toThrow(/lotin/);
  });

  it('Filter coerces page/limit to numbers', () => {
    const parsed = HrEmployeeFilterSchema.parse({ page: '2', limit: '20' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(20);
  });
});
```

---

### Task 6: HrEmployee service

**Files:** `apps/api/src/modules/hr/hr-employee/hr-employee.service.ts` + `hr-employee.service.test.ts` (create)

- [ ] **Step 1: Write service**

Service handles: list (with filter), findOne, create, update, softDelete, setPassword, moyskladAgentsForDropdown.

```ts
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type {
  CreateHrEmployeeInput,
  HrEmployeeFilter,
  SetPasswordInput,
  UpdateHrEmployeeInput,
} from './hr-employee.schema.js';

@Injectable()
export class HrEmployeeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, filter: HrEmployeeFilter) {
    const where: Record<string, unknown> = {
      accountId,
      archived: false,
    };
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { phone: { contains: filter.search } },
        { telegramPhone: { contains: filter.search } },
        { email: { contains: filter.search, mode: 'insensitive' } },
        { username: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter.role) {
      where.hrRoles = { has: filter.role };
    }
    if (filter.department) {
      where.department = filter.department;
    }
    if (filter.isChecker !== undefined) {
      where.isChecker = filter.isChecker;
    }

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.employee.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          username: true,
          telegramPhone: true,
          department: true,
          hrRoles: true,
          isChecker: true,
          moyskladAgentId: true,
          archived: true,
        },
      }),
      this.prisma.client.employee.count({ where }),
    ]);

    return { rows, total, page: filter.page, limit: filter.limit };
  }

  async findOne(accountId: string, id: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id, accountId, archived: false },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        username: true,
        telegramPhone: true,
        department: true,
        hrRoles: true,
        isChecker: true,
        moyskladAgentId: true,
        salaryConfig: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    return emp;
  }

  async create(accountId: string, input: CreateHrEmployeeInput) {
    return this.prisma.client.employee.create({
      data: {
        accountId,
        name: input.name,
        email: input.email ?? `${Date.now()}@hr.local`, // email shart Prisma'da, fallback
        phone: input.phone ?? undefined,
        telegramPhone: input.telegramPhone ?? undefined,
        department: input.department ?? undefined,
        hrRoles: input.hrRoles,
        isChecker: input.isChecker,
        moyskladAgentId: input.moyskladAgentId ?? undefined,
      },
    });
  }

  async update(accountId: string, id: string, input: UpdateHrEmployeeInput) {
    await this.findOne(accountId, id); // existence check
    return this.prisma.client.employee.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.telegramPhone !== undefined && { telegramPhone: input.telegramPhone }),
        ...(input.department !== undefined && { department: input.department }),
        ...(input.hrRoles !== undefined && { hrRoles: input.hrRoles }),
        ...(input.isChecker !== undefined && { isChecker: input.isChecker }),
        ...(input.moyskladAgentId !== undefined && { moyskladAgentId: input.moyskladAgentId }),
      },
    });
  }

  async softDelete(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.client.employee.update({
      where: { id },
      data: { archived: true },
    });
    return { ok: true };
  }

  async setPassword(accountId: string, id: string, input: SetPasswordInput) {
    await this.findOne(accountId, id);

    // Check username uniqueness within account
    const existing = await this.prisma.client.employee.findFirst({
      where: { accountId, username: input.username, NOT: { id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Bu username allaqachon ishlatilgan');
    }

    const passwordHash = await argon2.hash(input.password);
    await this.prisma.client.employee.update({
      where: { id },
      data: { username: input.username, passwordHash },
    });
    return { ok: true };
  }

  /**
   * Dropdown for "MoySklad agent" linking on the employee form.
   * In this codebase the "MoySklad agent" is itself an Employee (we are
   * moysklad) — so we return all archived=false employees of this account
   * minus the current one.
   */
  async moyskladAgentsForDropdown(accountId: string, excludeId?: string) {
    return this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    });
  }
}
```

- [ ] **Step 2: Write service test (8 cases, mock Prisma)**

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrEmployeeService } from './hr-employee.service.js';

function makePrisma() {
  return {
    client: {
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

describe('HrEmployeeService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeeService(prisma as never);
  });

  it('list filters by accountId and archived=false', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { page: 1, limit: 50 });
    const findManyCall = prisma.client.$transaction.mock.calls[0]?.[0]?.[0];
    expect(findManyCall).toBeDefined();
    // Result shape:
    const result = await service.list('acc1', { page: 1, limit: 50 });
    expect(result).toEqual({ rows: [], total: 0, page: 1, limit: 50 });
  });

  it('list applies search across name/phone/email/username', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { search: 'Ahmad', page: 1, limit: 50 });
    expect(prisma.client.$transaction).toHaveBeenCalled();
  });

  it('findOne throws NotFound when employee missing', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.findOne('acc1', 'e1')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns employee when found', async () => {
    const emp = { id: 'e1', name: 'X', email: 'x@y' };
    prisma.client.employee.findFirst.mockResolvedValue(emp as never);
    await expect(service.findOne('acc1', 'e1')).resolves.toEqual(emp);
  });

  it('create with all fields', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    await service.create('acc1', {
      name: 'Yangi',
      email: 'y@y.uz',
      phone: '+998901234567',
      telegramPhone: '+998901234567',
      department: 'Sotuv',
      hrRoles: ['cashier'],
      isChecker: false,
      moyskladAgentId: null,
    });
    expect(prisma.client.employee.create).toHaveBeenCalled();
  });

  it('update passes only provided fields', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { name: 'Yangi nom' });
    const call = prisma.client.employee.update.mock.calls[0]![0];
    expect(call.data.name).toBe('Yangi nom');
    expect((call.data as Record<string, unknown>).email).toBeUndefined();
  });

  it('setPassword fails on duplicate username', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never) // findOne ok
      .mockResolvedValueOnce({ id: 'other' } as never); // username exists
    await expect(
      service.setPassword('acc1', 'e1', { username: 'taken', password: 'abcd' }),
    ).rejects.toThrow(ConflictException);
  });

  it('setPassword hashes via argon2 + writes', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce(null);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.setPassword('acc1', 'e1', { username: 'ozod', password: 'verysecure' });
    const updateCall = prisma.client.employee.update.mock.calls[0]![0];
    expect(updateCall.data.username).toBe('ozod');
    expect(updateCall.data.passwordHash).toMatch(/^\$argon2/);
  });
});
```

---

### Task 7: HrEmployee controller

**Files:** `apps/api/src/modules/hr/hr-employee/hr-employee.controller.ts` (create)

- [ ] **Step 1: Write controller**

7 endpoints, all under `/api/hr/employees` prefix, protected by `JwtAuthGuard` + `HrPermissionGuard`:

```ts
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  CreateHrEmployeeSchema,
  HrEmployeeFilterSchema,
  SetPasswordSchema,
  UpdateHrEmployeeSchema,
} from './hr-employee.schema.js';
import { HrEmployeeService } from './hr-employee.service.js';

@Controller('hr/employees')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEmployeeController {
  constructor(@Inject(HrEmployeeService) private readonly svc: HrEmployeeService) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = HrEmployeeFilterSchema.parse(query);
    return this.svc.list(user.accountId, filter);
  }

  @Get('moysklad-agents')
  @RequireHrPermission('employees', 'read')
  async agents(@CurrentUser() user: AuthenticatedUser, @Query('excludeId') excludeId?: string) {
    return this.svc.moyskladAgentsForDropdown(user.accountId, excludeId);
  }

  @Get(':id')
  @RequireHrPermission('employees', 'read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequireHrPermission('employees', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateHrEmployeeSchema.parse(body);
    return this.svc.create(user.accountId, input);
  }

  @Put(':id')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateHrEmployeeSchema.parse(body);
    return this.svc.update(user.accountId, id, input);
  }

  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.softDelete(user.accountId, id);
  }

  @Post(':id/set-password')
  @RequireHrPermission('employees', 'full')
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = SetPasswordSchema.parse(body);
    return this.svc.setPassword(user.accountId, id, input);
  }
}
```

---

### Task 8: HrEmployee module

**Files:** `apps/api/src/modules/hr/hr-employee/hr-employee.module.ts` (create)

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEmployeeController } from './hr-employee.controller.js';
import { HrEmployeeService } from './hr-employee.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrEmployeeController],
  providers: [HrEmployeeService],
  exports: [HrEmployeeService],
})
export class HrEmployeeModule {}
```

---

### Task 9: HrRole — schema + service + controller + module

**Files:** 4 fayl in `apps/api/src/modules/hr/hr-role/` (create)

- [ ] **Step 1: Schema**

```ts
import { z } from 'zod';

export const CreateHrRoleSchema = z.object({
  value: z
    .string()
    .min(2, 'Kamida 2 belgi')
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Faqat lotin kichik harf, raqam, _'),
  label: z.string().min(2).max(100),
});

export const UpdateHrRoleSchema = z.object({
  label: z.string().min(2).max(100),
});

export type CreateHrRoleInput = z.infer<typeof CreateHrRoleSchema>;
export type UpdateHrRoleInput = z.infer<typeof UpdateHrRoleSchema>;
```

- [ ] **Step 2: Service**

```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { CreateHrRoleInput, UpdateHrRoleInput } from './hr-role.schema.js';

@Injectable()
export class HrRoleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.client.hrRole.findMany({
      where: { accountId },
      orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
    });
  }

  async create(accountId: string, input: CreateHrRoleInput) {
    const existing = await this.prisma.client.hrRole.findFirst({
      where: { accountId, value: input.value },
    });
    if (existing) throw new BadRequestException('Bu rol allaqachon mavjud');
    return this.prisma.client.hrRole.create({
      data: { accountId, value: input.value, label: input.label, isDefault: false },
    });
  }

  async update(accountId: string, id: string, input: UpdateHrRoleInput) {
    const role = await this.prisma.client.hrRole.findFirst({ where: { id, accountId } });
    if (!role) throw new NotFoundException('Rol topilmadi');
    return this.prisma.client.hrRole.update({
      where: { id },
      data: { label: input.label },
    });
  }

  async delete(accountId: string, id: string) {
    const role = await this.prisma.client.hrRole.findFirst({ where: { id, accountId } });
    if (!role) throw new NotFoundException('Rol topilmadi');
    if (role.isDefault) {
      throw new BadRequestException("Standart rolni o'chirib bo'lmaydi");
    }
    await this.prisma.client.hrRole.delete({ where: { id } });
    return { ok: true };
  }
}
```

- [ ] **Step 3: Service test** (4 case)

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrRoleService } from './hr-role.service.js';

function makePrisma() {
  return {
    client: {
      hrRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
}

describe('HrRoleService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrRoleService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrRoleService(prisma as never);
  });

  it('create fails when value already exists', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue({ id: 'r1' } as never);
    await expect(
      service.create('acc1', { value: 'admin', label: 'Admin' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('create succeeds when value unique', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue(null);
    prisma.client.hrRole.create.mockResolvedValue({ id: 'r1' } as never);
    await service.create('acc1', { value: 'manager', label: 'Manager' });
    expect(prisma.client.hrRole.create).toHaveBeenCalled();
  });

  it('delete fails on default role', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue({ id: 'r1', isDefault: true } as never);
    await expect(service.delete('acc1', 'r1')).rejects.toThrow(BadRequestException);
  });

  it('delete succeeds on custom role', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue({ id: 'r1', isDefault: false } as never);
    prisma.client.hrRole.delete.mockResolvedValue({} as never);
    await expect(service.delete('acc1', 'r1')).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: Controller**

```ts
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { CreateHrRoleSchema, UpdateHrRoleSchema } from './hr-role.schema.js';
import { HrRoleService } from './hr-role.service.js';

@Controller('hr/roles')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrRoleController {
  constructor(@Inject(HrRoleService) private readonly svc: HrRoleService) {}

  @Get()
  @RequireHrPermission('settings', 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Post()
  @RequireHrPermission('settings', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, CreateHrRoleSchema.parse(body));
  }

  @Put(':id')
  @RequireHrPermission('settings', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, UpdateHrRoleSchema.parse(body));
  }

  @Delete(':id')
  @RequireHrPermission('settings', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
```

- [ ] **Step 5: Module**

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrRoleController } from './hr-role.controller.js';
import { HrRoleService } from './hr-role.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrRoleController],
  providers: [HrRoleService],
  exports: [HrRoleService],
})
export class HrRoleModule {}
```

---

### Task 10: HrEmployeePermission — schema + service + controller + module

**Files:** 4 fayl in `apps/api/src/modules/hr/hr-employee-permission/` (create)

Per-page matrix UI: GET returns `{ pageKey, section, accessLevel }[]` for an employee. PUT replaces the entire matrix (bulk upsert).

- [ ] **Step 1: Schema**

```ts
import { z } from 'zod';
import { HR_ACCESS_LEVELS, HR_PAGE_KEYS } from '../hr-auth/hr-permission.types.js';

export const PermissionRowSchema = z.object({
  pageKey: z.enum(HR_PAGE_KEYS),
  section: z.string().nullable(),
  accessLevel: z.enum(HR_ACCESS_LEVELS),
});

export const PutPermissionsSchema = z.object({
  permissions: z.array(PermissionRowSchema),
});

export type PermissionRow = z.infer<typeof PermissionRowSchema>;
export type PutPermissionsInput = z.infer<typeof PutPermissionsSchema>;
```

- [ ] **Step 2: Service**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { PutPermissionsInput } from './hr-employee-permission.schema.js';

@Injectable()
export class HrEmployeePermissionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, employeeId: string) {
    return this.prisma.client.hrEmployeePermission.findMany({
      where: { accountId, employeeId },
      orderBy: [{ pageKey: 'asc' }, { section: 'asc' }],
      select: { pageKey: true, section: true, accessLevel: true },
    });
  }

  async replace(accountId: string, employeeId: string, input: PutPermissionsInput) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.hrEmployeePermission.deleteMany({ where: { accountId, employeeId } });
      if (input.permissions.length === 0) return { count: 0 };
      await tx.hrEmployeePermission.createMany({
        data: input.permissions.map((p) => ({
          accountId,
          employeeId,
          pageKey: p.pageKey,
          section: p.section,
          accessLevel: p.accessLevel,
        })),
      });
      return { count: input.permissions.length };
    });
  }
}
```

- [ ] **Step 3: Service test (5 cases)**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrEmployeePermissionService } from './hr-employee-permission.service.js';

function makePrisma() {
  const tx = {
    hrEmployeePermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    client: {
      hrEmployeePermission: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(tx)),
      _tx: tx,
    },
  };
}

describe('HrEmployeePermissionService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeePermissionService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeePermissionService(prisma as never);
  });

  it('list filters by accountId + employeeId', async () => {
    prisma.client.hrEmployeePermission.findMany.mockResolvedValue([]);
    await service.list('acc1', 'e1');
    const call = prisma.client.hrEmployeePermission.findMany.mock.calls[0]![0];
    expect(call.where).toEqual({ accountId: 'acc1', employeeId: 'e1' });
  });

  it('replace deletes all then inserts new set', async () => {
    await service.replace('acc1', 'e1', {
      permissions: [
        { pageKey: 'messages', section: null, accessLevel: 'full' },
        { pageKey: 'tasks', section: null, accessLevel: 'read' },
      ],
    });
    expect(prisma.client._tx.hrEmployeePermission.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'acc1', employeeId: 'e1' },
    });
    expect(prisma.client._tx.hrEmployeePermission.createMany).toHaveBeenCalled();
  });

  it('replace with empty array deletes all', async () => {
    const result = await service.replace('acc1', 'e1', { permissions: [] });
    expect(prisma.client._tx.hrEmployeePermission.deleteMany).toHaveBeenCalled();
    expect(prisma.client._tx.hrEmployeePermission.createMany).not.toHaveBeenCalled();
    expect(result.count).toBe(0);
  });

  it('returns count = input length', async () => {
    const result = await service.replace('acc1', 'e1', {
      permissions: [
        { pageKey: 'oylik', section: null, accessLevel: 'own_only' },
      ],
    });
    expect(result.count).toBe(1);
  });

  it('replace runs in single transaction', async () => {
    await service.replace('acc1', 'e1', { permissions: [] });
    expect(prisma.client.$transaction).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Controller**

```ts
import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { PutPermissionsSchema } from './hr-employee-permission.schema.js';
import { HrEmployeePermissionService } from './hr-employee-permission.service.js';

@Controller('hr/employees/:employeeId/permissions')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEmployeePermissionController {
  constructor(
    @Inject(HrEmployeePermissionService) private readonly svc: HrEmployeePermissionService,
  ) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.svc.list(user.accountId, employeeId);
  }

  @Put()
  @RequireHrPermission('employees', 'full')
  async replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ) {
    const input = PutPermissionsSchema.parse(body);
    return this.svc.replace(user.accountId, employeeId, input);
  }
}
```

- [ ] **Step 5: Module**

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEmployeePermissionController } from './hr-employee-permission.controller.js';
import { HrEmployeePermissionService } from './hr-employee-permission.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrEmployeePermissionController],
  providers: [HrEmployeePermissionService],
  exports: [HrEmployeePermissionService],
})
export class HrEmployeePermissionModule {}
```

---

### Task 11: Register 3 modules in HrModule

**Files:** `apps/api/src/modules/hr/hr.module.ts` (modify)

Add imports for `HrEmployeeModule`, `HrRoleModule`, `HrEmployeePermissionModule`. Insert in alphabetical order.

```ts
import { HrEmployeeModule } from './hr-employee/hr-employee.module.js';
import { HrEmployeePermissionModule } from './hr-employee-permission/hr-employee-permission.module.js';
import { HrRoleModule } from './hr-role/hr-role.module.js';

// In @Module({ imports: [...] }), add these 3 modules (alphabetical position):
//   HrEmployeeModule,
//   HrEmployeePermissionModule,
//   HrRoleModule,
```

---

### Task 12: Web — HR API client

**Files:** `apps/web/src/lib/hr-api.ts` (create)

Helper functions for HR endpoints. Mirror existing `apps/web/src/lib/api.ts` pattern (search for `fetch` usage).

- [ ] **Step 1: Check existing API client pattern**

Read `apps/web/src/lib/api.ts` (or whichever client wrapper exists). Mirror its style: fetch wrapper, error handling, auth header attachment.

- [ ] **Step 2: Write hr-api.ts**

```ts
import { apiFetch } from './api.js'; // adjust to actual pattern

export type HrEmployeeRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  username: string | null;
  telegramPhone: string | null;
  department: string | null;
  hrRoles: string[];
  isChecker: boolean;
  moyskladAgentId: string | null;
  archived: boolean;
};

export type HrEmployeeFilter = {
  search?: string;
  role?: string;
  department?: string;
  isChecker?: boolean;
  page?: number;
  limit?: number;
};

export const hrEmployeeApi = {
  list: (filter: HrEmployeeFilter) =>
    apiFetch<{ rows: HrEmployeeRow[]; total: number; page: number; limit: number }>(
      `/hr/employees?${new URLSearchParams(Object.entries(filter).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`,
    ),
  findOne: (id: string) => apiFetch<HrEmployeeRow & Record<string, unknown>>(`/hr/employees/${id}`),
  create: (data: Partial<HrEmployeeRow>) =>
    apiFetch<HrEmployeeRow>('/hr/employees', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<HrEmployeeRow>) =>
    apiFetch<HrEmployeeRow>(`/hr/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) =>
    apiFetch<{ ok: true }>(`/hr/employees/${id}`, { method: 'DELETE' }),
  setPassword: (id: string, data: { username: string; password: string }) =>
    apiFetch<{ ok: true }>(`/hr/employees/${id}/set-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  moyskladAgents: (excludeId?: string) =>
    apiFetch<Array<{ id: string; name: string; email: string }>>(
      `/hr/employees/moysklad-agents${excludeId ? `?excludeId=${excludeId}` : ''}`,
    ),
};

export type HrRole = { id: string; value: string; label: string; isDefault: boolean };

export const hrRoleApi = {
  list: () => apiFetch<HrRole[]>('/hr/roles'),
  create: (data: { value: string; label: string }) =>
    apiFetch<HrRole>('/hr/roles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { label: string }) =>
    apiFetch<HrRole>(`/hr/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) =>
    apiFetch<{ ok: true }>(`/hr/roles/${id}`, { method: 'DELETE' }),
};

export type HrPermissionRow = {
  pageKey: string;
  section: string | null;
  accessLevel: 'full' | 'read' | 'own_only';
};

export const hrPermissionApi = {
  list: (employeeId: string) =>
    apiFetch<HrPermissionRow[]>(`/hr/employees/${employeeId}/permissions`),
  replace: (employeeId: string, permissions: HrPermissionRow[]) =>
    apiFetch<{ count: number }>(`/hr/employees/${employeeId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
};
```

Note: `apiFetch` name may differ — check existing pattern (`request`, `fetchJson`, etc.). Adjust import.

---

### Task 13: Auth store kengaytirish

**Files:** `apps/web/src/lib/auth-store.ts` (modify)

- [ ] **Step 1: Read existing store**

Read the file to understand current shape. Likely Zustand store with `user: { id, name, email, ... }`.

- [ ] **Step 2: Extend user shape**

Add fields:
- `username: string | null`
- `hrRoles: string[]`
- `isChecker: boolean`
- `hrPermissions: Array<{ pageKey, section, accessLevel }>`

These are set on login response and used by sidebar/guard hooks.

---

### Task 14: Web — Employees list page

**Files:** `apps/web/src/app/(app)/hr/employees/page.tsx` (modify — replace placeholder)

Full implementation: filter bar (search + role select + dept select + isChecker toggle), DataTable (similar to existing patterns — search `apps/web/src/components/data-table` or look at existing list page like `/counterparties/page.tsx`), "+ Xodim qo'shish" button opening EmployeeModal.

- [ ] **Step 1: Read existing list page pattern**

Find a small existing list page and copy its structure: `apps/web/src/app/(app)/counterparties/page.tsx` (or similar lightweight one).

- [ ] **Step 2: Implement EmployeesPage**

Approx 150 lines:
- `useTranslations` for i18n
- `useState` for filter
- `useSWR` or `useQuery` (check existing data fetching pattern) calling `hrEmployeeApi.list(filter)`
- DataTable component with columns: Name (avatar + name + phone subtext), Role (badges from hrRoles), Telegram (phone or "—"), Bo'lim, Actions (🔑 / ✏️ / ❌)
- Header: title + "+ Xodim qo'shish" button → opens EmployeeModal
- Filter row: search input + role dropdown + dept dropdown + checker checkbox

---

### Task 15: Web — EmployeeModal + SetPasswordModal

**Files:**
- `apps/web/src/app/(app)/hr/employees/_components/employee-modal.tsx` (create)
- `apps/web/src/app/(app)/hr/employees/_components/set-password-modal.tsx` (create)
- `apps/web/src/app/(app)/hr/employees/_components/role-multi-select.tsx` (create)
- `apps/web/src/app/(app)/hr/employees/_components/moysklad-agent-dropdown.tsx` (create)

- [ ] **Step 1: EmployeeModal**

Form fields:
- Ism* (required)
- Email (optional)
- Telegram telefon (with format hint +998901234567)
- Asosiy telefon
- Bo'lim (free-text + suggestions from existing departments)
- Hr rollar (multi-select from HrRole list + inline "+ Yangi rol" → opens HrRole create)
- Tekshiruvchi toggle (is_checker) with hint
- MoySklad agent (dropdown from moyskladAgents endpoint)

Save: `hrEmployeeApi.create` or `hrEmployeeApi.update`.

- [ ] **Step 2: SetPasswordModal**

2 fields: username + password. Save: `hrEmployeeApi.setPassword(employeeId, data)`.

- [ ] **Step 3: RoleMultiSelect component**

Multi-select dropdown with chips. Inline "+ Yangi rol" link opens a small inline form (value + label) calling `hrRoleApi.create`, then refreshes role list and pre-selects the new value.

- [ ] **Step 4: MoyskladAgentDropdown**

Simple async dropdown fetching `hrEmployeeApi.moyskladAgents(excludeId=currentEmployeeId)`. Display employee name + email. Selected: stores `id` as `moyskladAgentId`.

---

### Task 16: Web — Permissions matrix page + Settings/Roles page

**Files:**
- `apps/web/src/app/(app)/hr/employees/[id]/page.tsx` (create — detail view + tabs)
- `apps/web/src/app/(app)/hr/employees/[id]/permissions/page.tsx` (create — matrix UI)
- `apps/web/src/app/(app)/hr/employees/[id]/salary/page.tsx` (create — P5 placeholder)
- `apps/web/src/app/(app)/hr/settings/roles/page.tsx` (create — HrRole CRUD)

- [ ] **Step 1: Employee detail page**

Shows employee summary + tabs: Sozlamalar (basic info edit), Vakolatlar (permissions matrix link), Oylik (salary config link).

- [ ] **Step 2: Permissions matrix page**

Table: rows = 8 pages (dashboard, messages, reports, employees, tasks, oylik, activity, settings) + 5 message sub-sections. Columns = access level (None | own_only | read | full) as radio buttons. "Saqlash" button calls `hrPermissionApi.replace(employeeId, rows)`. Non-default = checked rows only.

- [ ] **Step 3: Salary page placeholder**

```tsx
'use client';
import { useTranslations } from 'next-intl';

export default function HrEmployeeSalaryPage() {
  const t = useTranslations('subnav.hr');
  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">
        {t('payroll')} — per-employee override
      </h1>
      <p className="text-[var(--ms-text-muted)] text-sm">
        P1 placeholder — full implementation in sprint P5 (HR-Oylik + KPI).
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Settings/Roles page**

List HrRole, "+ Yangi rol" button (modal: value + label), ✏️ edit (label only — value immutable), 🗑️ delete (disabled if isDefault).

---

### Task 17: Sprint final gate + commit

Run all gates in sequence:

- [ ] **Step 1: pnpm install** (no new deps but safety check)

```bash
cd D:/projects/moysklad && pnpm install
```

- [ ] **Step 2: Typecheck (api + web)**

```bash
pnpm --filter @moysklad/api typecheck
pnpm --filter @moysklad/web typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Lint (biome) on HR files**

```bash
pnpm exec biome check apps/api/src/modules/hr apps/api/src/modules/auth apps/web/src/app/\(app\)/hr apps/web/src/lib/hr-api.ts apps/web/src/lib/auth-store.ts
```

Auto-fix if needed: `--write` then `--write --unsafe` for JSX.

- [ ] **Step 4: Test (api)**

```bash
pnpm --filter @moysklad/api test
```

Expected: 1706 + ~28 new (guard 10 + employee service 8 + role service 4 + permission service 5 + employee schema 8 — minus any consolidation) = ~1734+ pass.

- [ ] **Step 5: Build (api + web)**

```bash
pnpm --filter @moysklad/api build
pnpm --filter @moysklad/web build
```

- [ ] **Step 6: Smoke test (manual, browser)**

```bash
# Terminal 1: pnpm --filter @moysklad/api dev
# Terminal 2: pnpm --filter @moysklad/web dev
```

In browser:
- `/login` → admin@demo.local / admin123
- Network tab: check `/api/auth/login` response includes `hrRoles: ['admin']`, `isChecker: true`, `hrPermissions: [...]`
- Navigate to `/hr/employees` — list loads (admin user shown)
- "+ Xodim qo'shish" → modal opens, fill form, save → list refreshes
- Click 🔑 → set username/password
- Click employee → detail page → Vakolatlar tab → matrix loads + saves
- `/hr/settings/roles` — 4 default rollar ko'rinadi, "+ Yangi rol" qo'shadi

- [ ] **Step 7: Single sprint commit**

```bash
git add apps/api/src/modules/auth/ \
        apps/api/src/modules/hr/hr-auth/ \
        apps/api/src/modules/hr/hr-employee/ \
        apps/api/src/modules/hr/hr-employee-permission/ \
        apps/api/src/modules/hr/hr-role/ \
        apps/api/src/modules/hr/hr.module.ts \
        apps/web/src/app/\(app\)/hr/employees/ \
        apps/web/src/app/\(app\)/hr/settings/ \
        apps/web/src/lib/

GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "$(cat <<'EOF'
feat(hr): P1 — HR-Employee + Auth kengaytma

Sprint P1 complete (master spec § 2). Employee CRUD + login set +
MoySklad agent linking + per-page permissions matrix + custom roles.
Auth payload kengaytirildi (hrRoles, isChecker, hrPermissions).
HrPermissionGuard P0 placeholder → FULL ENFORCE.

Backend:
- AuthenticatedUser + LoginResponse: hrRoles, isChecker, hrPermissions[]
- auth.service.login(): Employee.hr* fields + permissions yuklash
- LoginSchema: identifier (email YOKI username), backward compat
- HrPermissionGuard: full enforcement (admin bypass + access rank +
  section match) + 10 vitest cases
- HrEmployeeService (CRUD + filter + softDelete + setPassword +
  moyskladAgentsForDropdown) + 8 tests
- HrEmployeeController (7 endpoint, JwtAuth + HrPermissionGuard)
- HrRoleService (CRUD + protect default 4) + 4 tests
- HrEmployeePermissionService (list + bulk replace transactional) + 5 tests
- 3 ta yangi modul HrModule'da registered

Web:
- /hr/employees page (list + filter + DataTable)
- EmployeeModal (CRUD form), SetPasswordModal
- RoleMultiSelect (with inline "+ Yangi rol")
- MoyskladAgentDropdown
- /hr/employees/[id] detail + tabs
- /hr/employees/[id]/permissions matrix UI
- /hr/employees/[id]/salary placeholder (P5)
- /hr/settings/roles CRUD
- hr-api.ts client helpers
- auth-store: hrRoles/isChecker/hrPermissions persisted

Quality gates (sprint-final): typecheck 0/0/0, lint 0/0,
vitest ~1734 pass, builds OK.
EOF
)"
```

---

## Self-Review

### Spec coverage check

| Spec § | P1 task | Status |
|---|---|---|
| § 4 JWT payload kengaytirish | Task 1 + 2 | ✅ |
| § 4 username login fallback | Task 3 | ✅ |
| § 4 HrPermissionGuard full enforce | Task 4 | ✅ |
| § 4 admin bypass | Task 4 (logic) | ✅ |
| § 4 own_only/read/full access rank | Task 4 (ACCESS_RANK) | ✅ |
| § 1 backend HrEmployeeModule | Tasks 5-8 | ✅ |
| § 1 backend HrRoleModule | Task 9 | ✅ |
| § 1 backend HrEmployeePermissionModule | Task 10 | ✅ |
| § 1 frontend /hr/employees | Task 14 | ✅ |
| § 1 frontend /hr/employees/[id]/permissions | Task 16 | ✅ |
| § 1 frontend /hr/settings/roles | Task 16 | ✅ |
| § 7 sprint final gate | Task 17 | ✅ |

### Placeholder scan

No "TBD" / "implement later" in plan body. The `/hr/employees/[id]/salary/page.tsx` is explicitly a P1→P5 placeholder (documented in code comment).

### Type consistency

- `HrPageKey` from Task 6 P0 — reused in Task 10 schema (`z.enum(HR_PAGE_KEYS)`).
- `HrAccessLevel` same.
- `AuthenticatedUser` extended in Task 1, used in Task 4 guard.
- `HrEmployeeFilter` Zod type matches controller @Query() input.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-p1-hr-employee-auth.md`. Execution mode: same as P0 (Subagent-Driven Opus per user choice 2026-05-20).
