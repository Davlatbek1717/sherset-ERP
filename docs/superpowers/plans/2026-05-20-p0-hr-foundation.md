# P0 — HR Module Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User rule (2026-05-20):** *"Har qisqa ishdan keyin tekshiruv kerak emas, umumiy katta bo'limda 1 ta tekshiruv kerak."* — bu sprint uchun ham qo'llanadi. Har task ichida `git commit` YO'Q. Sprint oxirida (Task 16) bitta umumiy gate + bitta cohesive commit.

**Goal:** HR moduli uchun to'liq foundation — Prisma schema (16 yangi `hr_*` table + Employee/Task additive kengaytma + RLS), NPM paketlar (gramjs, websockets, event emitter, eta, date-fns-tz), NestJS HR module skeleton (17 sub-module), domain event bus, encryption helper, web layout + sidebar + 10 ta sub-nav + i18n (uz/ru), seed scripts (default rollar + admin permissions + salary config).

**Architecture:** Mavjud moysklad-clone monorepo'siga additive kengaytma. Mavjud Employee/Task modellariga `kind` discriminator + nullable HR field'lar qo'shiladi. Yangi `hr/` namespace alohida sub-tree sifatida. Domain event hooks `EventEmitter2` orqali (MoySklad polling almashtirildi). Hech qanday existing kod tegmaydi (faqat `Employee.hr*` field qo'shilishi va Task `kind` discriminator).

**Tech Stack:** NestJS 10 + Prisma 5 + Postgres 16 RLS + TypeScript 5.7 + pnpm workspace + Vitest + Next.js 15 + Tailwind + next-intl. Yangi: `telegram` (gramjs MTProto), `@nestjs/websockets`, `@nestjs/event-emitter`, `eta`, `date-fns-tz`.

**Source spec:** [docs/superpowers/specs/2026-05-20-hr-module-master-design.md](../specs/2026-05-20-hr-module-master-design.md) (committed `e4a21e84`).

**Estimated time:** 3-4 kun.

---

## File Structure

### Yangi fayllar (~50 ta):

```
packages/db/prisma/
├── schema.prisma                                    # MODIFY: Employee/Task kengaytma + 16 yangi HR model
└── migrations/2026MMDDHHMMSS_hr_module_foundation/
    └── migration.sql                                # AUTO-GENERATED + RLS append

apps/api/src/
├── app.module.ts                                    # MODIFY: EventEmitterModule import + HrModule import
├── modules/hr/
│   ├── hr.module.ts                                 # CREATE: top-level HR aggregator
│   ├── hr-shared/
│   │   ├── crypto.util.ts                           # AES-256-GCM encryption helper
│   │   ├── crypto.util.test.ts                      # round-trip test
│   │   ├── tz.util.ts                               # Asia/Tashkent helpers
│   │   ├── tz.util.test.ts
│   │   └── hr-events.types.ts                       # Domain event type definitions
│   ├── hr-auth/
│   │   ├── hr-permission.guard.ts                   # placeholder + types
│   │   ├── require-hr-permission.decorator.ts
│   │   └── hr-auth.module.ts
│   ├── attendance/
│   │   └── attendance.module.ts                     # placeholder
│   ├── hr-task-template/
│   │   └── hr-task-template.module.ts               # placeholder
│   ├── hr-task-review/
│   │   └── hr-task-review.module.ts                 # placeholder
│   ├── hr-task-send/
│   │   └── hr-task-send.module.ts                   # placeholder
│   ├── hr-kpi/
│   │   └── hr-kpi.module.ts                         # placeholder
│   ├── hr-bonus-fine/
│   │   └── hr-bonus-fine.module.ts                  # placeholder
│   ├── hr-salary/
│   │   └── hr-salary.module.ts                      # placeholder
│   ├── hr-telegram-bridge/
│   │   └── hr-telegram-bridge.module.ts             # placeholder
│   ├── hr-telegram-account/
│   │   └── hr-telegram-account.module.ts            # placeholder
│   ├── hr-messages/
│   │   └── hr-messages.module.ts                    # placeholder
│   ├── hr-dashboard/
│   │   └── hr-dashboard.module.ts                   # placeholder
│   ├── hr-reports/
│   │   └── hr-reports.module.ts                     # placeholder
│   ├── hr-settings/
│   │   └── hr-settings.module.ts                    # placeholder
│   ├── hr-scheduler/
│   │   └── hr-scheduler.module.ts                   # placeholder
│   ├── hr-events/
│   │   └── hr-events.module.ts                      # EventEmitter wiring
│   └── hr-websocket/
│       └── hr-websocket.module.ts                   # placeholder

apps/api/package.json                                # MODIFY: new deps
apps/api/.env.example                                # MODIFY: HR_SESSION_KEY example

apps/web/src/
├── app/(app)/
│   ├── layout.tsx                                   # MODIFY: HR moduleNav item + activeModule detection
│   └── hr/
│       ├── layout.tsx                               # CREATE: HR subnav (10 items)
│       ├── page.tsx                                 # CREATE: Dashboard (placeholder)
│       ├── employees/page.tsx                       # CREATE: placeholder
│       ├── attendance/page.tsx                      # CREATE: placeholder
│       ├── tasks/page.tsx                           # CREATE: placeholder
│       ├── review/page.tsx                          # CREATE: placeholder
│       ├── my-tasks/page.tsx                        # CREATE: placeholder
│       ├── payroll/page.tsx                         # CREATE: placeholder
│       ├── messages/page.tsx                        # CREATE: placeholder
│       ├── reports/page.tsx                         # CREATE: placeholder
│       └── settings/page.tsx                        # CREATE: placeholder
└── messages/
    ├── uz.json                                      # MODIFY: nav.hr + subnav.hr.*
    └── ru.json                                      # MODIFY: nav.hr + subnav.hr.*

packages/design-system/src/icons/action-icons.ts     # MODIFY: hr: UserCog
apps/web/package.json                                # MODIFY: if web-side deps needed (none in P0)

packages/db/prisma/
├── seed-hr.ts                                       # CREATE: HR defaults seed
└── (existing seed.ts not modified)

apps/api/src/modules/hr/hr-shared/crypto.util.test.ts  # CREATE
apps/api/src/modules/hr/hr-shared/tz.util.test.ts      # CREATE
```

### Modify qilinadigan fayllar:

- `packages/db/prisma/schema.prisma` — 7 yangi field Employee'da + 7 yangi field Task'da + `TaskKind` enum + 16 yangi model
- `apps/api/src/app.module.ts` — `EventEmitterModule.forRoot()` + `HrModule` import (alphabetical order)
- `apps/api/package.json` — yangi `dependencies`
- `apps/api/.env.example` — `HR_SESSION_KEY` namuna
- `apps/web/src/app/(app)/layout.tsx` — `moduleNav` array'ga HR item qo'shish + `activeModule` ternary kengaytma
- `apps/web/src/messages/uz.json` va `ru.json` — `nav.hr` + `subnav.hr.*`
- `packages/design-system/src/icons/action-icons.ts` — `hr: UserCog` icon
- `apps/api/vitest.config.ts` (yoki o'rganib chiqamiz, ehtimol modify kerakmas)

---

## Tasks

### Task 1: NPM dependencies (API)

Yangibolim'ga ekvivalent paketlarni qo'shish. P0 oxirida `pnpm install` ishga tushiriladi.

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add new dependencies to `apps/api/package.json`**

Open `apps/api/package.json` and add the following to the `dependencies` object (alphabetical order):

```jsonc
{
  "dependencies": {
    // ...existing keys...
    "@nestjs/event-emitter": "^2.1.1",
    "@nestjs/platform-ws": "^10.4.0",
    "@nestjs/websockets": "^10.4.0",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.2.0",
    "eta": "^3.5.0",
    "input": "^1.0.1",
    "telegram": "^2.26.0",
    "ws": "^8.18.0"
  }
}
```

Also add to `devDependencies`:

```jsonc
{
  "devDependencies": {
    // ...existing...
    "@types/ws": "^8.5.13"
  }
}
```

- [ ] **Step 2: Install (will run at end of sprint with all changes)**

Defer `pnpm install` to Task 16 (sprint final gate). Plan all package.json changes first, then install once.

---

### Task 2: Env variable — HR_SESSION_KEY

MTProto session encryption uchun 32-byte AES key.

**Files:**
- Modify: `apps/api/.env.example` (create if doesn't exist)
- Create: `apps/api/.env.local` (only if exists; do not commit — gitignored)

- [ ] **Step 1: Add to `apps/api/.env.example`**

Append:

```bash
# === HR Module ===
# 32-byte AES-256-GCM key for Telegram MTProto session encryption.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# REQUIRED in production. Without this, MTProto session storage will fail.
HR_SESSION_KEY=
```

- [ ] **Step 2: Generate dev key if `apps/api/.env.local` exists**

If `apps/api/.env.local` already exists (untracked), append a generated key:

```bash
node -e "console.log('HR_SESSION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> apps/api/.env.local
```

If `.env.local` doesn't exist yet, skip this step — developer will create it on first run.

---

### Task 3: Encryption helper utility

AES-256-GCM encrypt/decrypt for MTProto session storage. Pure Node `crypto`, no external deps.

**Files:**
- Create: `apps/api/src/modules/hr/hr-shared/crypto.util.ts`
- Create: `apps/api/src/modules/hr/hr-shared/crypto.util.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/hr/hr-shared/crypto.util.test.ts`:

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import { encryptHrSession, decryptHrSession } from './crypto.util.js';

describe('HR session encryption', () => {
  beforeAll(() => {
    process.env.HR_SESSION_KEY = randomBytes(32).toString('base64');
  });

  it('round-trip: encrypted ciphertext decrypts to original', () => {
    const plain = 'gramjs StringSession data 1ABCdef';
    const enc = encryptHrSession(plain);
    expect(enc).not.toBe(plain);
    expect(enc.split(':')).toHaveLength(3); // iv:cipher:tag hex format
    expect(decryptHrSession(enc)).toBe(plain);
  });

  it('different plaintexts produce different ciphertexts (random IV)', () => {
    const a = encryptHrSession('payload-a');
    const b = encryptHrSession('payload-a'); // same plaintext
    expect(a).not.toBe(b); // IV randomization
  });

  it('tampered ciphertext fails authentication tag check', () => {
    const enc = encryptHrSession('payload');
    const [iv, cipher, tag] = enc.split(':');
    const tampered = `${iv}:${cipher.slice(0, -2)}ff:${tag}`;
    expect(() => decryptHrSession(tampered)).toThrow();
  });

  it('throws when HR_SESSION_KEY missing', () => {
    const orig = process.env.HR_SESSION_KEY;
    delete process.env.HR_SESSION_KEY;
    try {
      expect(() => encryptHrSession('x')).toThrow(/HR_SESSION_KEY/);
    } finally {
      process.env.HR_SESSION_KEY = orig;
    }
  });

  it('throws when HR_SESSION_KEY wrong length', () => {
    const orig = process.env.HR_SESSION_KEY;
    process.env.HR_SESSION_KEY = randomBytes(16).toString('base64'); // wrong: 16 bytes not 32
    try {
      expect(() => encryptHrSession('x')).toThrow(/32 bytes/);
    } finally {
      process.env.HR_SESSION_KEY = orig;
    }
  });
});
```

- [ ] **Step 2: Implement `crypto.util.ts`**

Create `apps/api/src/modules/hr/hr-shared/crypto.util.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const env = process.env.HR_SESSION_KEY;
  if (!env) {
    throw new Error('HR_SESSION_KEY env variable not set');
  }
  const key = Buffer.from(env, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`HR_SESSION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  return key;
}

export function encryptHrSession(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptHrSession(ciphertext: string): string {
  const key = getKey();
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  if (!ivHex || !encHex || !tagHex) {
    throw new Error('Invalid HR session ciphertext format (expected iv:cipher:tag)');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @moysklad/api vitest run src/modules/hr/hr-shared/crypto.util.test.ts
```

Expected: 5/5 PASS. If fail, fix and re-run. No commit yet (sprint-level batching).

---

### Task 4: TZ helpers (Asia/Tashkent)

Yangibolim'da UTC/lokal aralashish bug edi. Bizda har joyda `Asia/Tashkent` aniq.

**Files:**
- Create: `apps/api/src/modules/hr/hr-shared/tz.util.ts`
- Create: `apps/api/src/modules/hr/hr-shared/tz.util.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/hr/hr-shared/tz.util.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toLocalIso, startOfLocalDay, parseLocalIso } from './tz.util.js';

describe('HR TZ helpers (Asia/Tashkent +05)', () => {
  it('toLocalIso formats UTC Date with +05:00 offset', () => {
    const utc = new Date('2026-05-20T07:30:00.000Z'); // 12:30 Tashkent
    expect(toLocalIso(utc)).toBe('2026-05-20T12:30:00+05:00');
  });

  it('toLocalIso(null) returns null', () => {
    expect(toLocalIso(null)).toBeNull();
  });

  it('startOfLocalDay returns midnight in Tashkent TZ', () => {
    // 2026-05-20T03:45:00Z = 2026-05-20T08:45:00+05
    // start of that local day = 2026-05-19T19:00:00Z (which is 2026-05-20T00:00:00+05)
    const d = new Date('2026-05-20T03:45:00.000Z');
    const start = startOfLocalDay(d);
    expect(start.toISOString()).toBe('2026-05-19T19:00:00.000Z');
  });

  it('parseLocalIso reads +05:00 string back to UTC Date', () => {
    const local = '2026-05-20T12:30:00+05:00';
    const utc = parseLocalIso(local);
    expect(utc.toISOString()).toBe('2026-05-20T07:30:00.000Z');
  });

  it('startOfLocalDay handles late-evening UTC mapped to next local day', () => {
    // 2026-05-19T20:00:00Z = 2026-05-20T01:00:00+05
    // start of LOCAL day = 2026-05-19T19:00:00Z
    const d = new Date('2026-05-19T20:00:00.000Z');
    expect(startOfLocalDay(d).toISOString()).toBe('2026-05-19T19:00:00.000Z');
  });
});
```

- [ ] **Step 2: Implement `tz.util.ts`**

Create `apps/api/src/modules/hr/hr-shared/tz.util.ts`:

```ts
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const HR_TZ = 'Asia/Tashkent';

/** Format a UTC Date as ISO with +05:00 offset. Yangibolim _to_iso ekvivalenti. */
export function toLocalIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return formatInTimeZone(d, HR_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Parse an ISO string (with or without offset) back to a UTC Date. */
export function parseLocalIso(iso: string): Date {
  // If no offset/Z, assume Tashkent +05.
  if (!/Z|[+-]\d{2}:?\d{2}$/.test(iso)) {
    return fromZonedTime(iso, HR_TZ);
  }
  return new Date(iso);
}

/** Returns the UTC Date representing 00:00 of d's local day in Tashkent. */
export function startOfLocalDay(d: Date): Date {
  const localDateStr = formatInTimeZone(d, HR_TZ, 'yyyy-MM-dd');
  return fromZonedTime(`${localDateStr}T00:00:00`, HR_TZ);
}
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @moysklad/api vitest run src/modules/hr/hr-shared/tz.util.test.ts
```

Expected: 5/5 PASS. (Note: requires `date-fns-tz` installed — Task 1 deferred install, so this test will fail until Task 16. Write tests now; verify at sprint gate.)

---

### Task 5: HR domain event types

EventEmitter typed payloads — 5 ta MoySklad event for HR Telegram bridge.

**Files:**
- Create: `apps/api/src/modules/hr/hr-shared/hr-events.types.ts`

- [ ] **Step 1: Write type definitions**

Create `apps/api/src/modules/hr/hr-shared/hr-events.types.ts`:

```ts
// Domain event payloads emitted by existing services (Demand, PaymentIn, etc.)
// and consumed by HR Telegram bridge listeners. Type-safe via EventEmitter2.

export const HR_EVENT = {
  DEMAND_POSTED: 'hr.event.demand.posted',
  PAYMENT_IN_POSTED: 'hr.event.paymentIn.posted',
  CUSTOMER_ORDER_CREATED: 'hr.event.customerOrder.created',
  SUPPLY_POSTED: 'hr.event.supply.posted',
  SALES_RETURN_POSTED: 'hr.event.salesReturn.posted',
  // HR-internal events (Task lifecycle):
  HR_TASK_LOG_FINALIZED: 'hr.event.hrTaskLog.finalized',
  HR_TASK_LOG_DEADLINE_EXPIRED: 'hr.event.hrTaskLog.deadlineExpired',
} as const;

export type HrEventName = (typeof HR_EVENT)[keyof typeof HR_EVENT];

export interface DemandPostedEvent {
  accountId: string;
  demandId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
}

export interface PaymentInPostedEvent {
  accountId: string;
  paymentInId: string;
  counterpartyId: string;
  sumMinor: bigint;
  postedAt: Date;
}

export interface CustomerOrderCreatedEvent {
  accountId: string;
  customerOrderId: string;
  counterpartyId: string;
  totalMinor: bigint;
  createdAt: Date;
}

export interface SupplyPostedEvent {
  accountId: string;
  supplyId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
}

export interface SalesReturnPostedEvent {
  accountId: string;
  salesReturnId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
}

export interface HrTaskLogFinalizedEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  employeeId: string;
  status: 'answered_yes' | 'answered_no' | 'answered_text';
  reviewedById?: string;
}

export interface HrTaskLogDeadlineExpiredEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  employeeId: string;
}

export type HrEventPayloadMap = {
  [HR_EVENT.DEMAND_POSTED]: DemandPostedEvent;
  [HR_EVENT.PAYMENT_IN_POSTED]: PaymentInPostedEvent;
  [HR_EVENT.CUSTOMER_ORDER_CREATED]: CustomerOrderCreatedEvent;
  [HR_EVENT.SUPPLY_POSTED]: SupplyPostedEvent;
  [HR_EVENT.SALES_RETURN_POSTED]: SalesReturnPostedEvent;
  [HR_EVENT.HR_TASK_LOG_FINALIZED]: HrTaskLogFinalizedEvent;
  [HR_EVENT.HR_TASK_LOG_DEADLINE_EXPIRED]: HrTaskLogDeadlineExpiredEvent;
};
```

(No test needed — pure type definitions verified at typecheck.)

---

### Task 6: HR permission decorator + guard skeleton

Backend permission enforcement skeleton. Full implementation in P1. Hozir faqat decorator + types + placeholder guard.

**Files:**
- Create: `apps/api/src/modules/hr/hr-auth/require-hr-permission.decorator.ts`
- Create: `apps/api/src/modules/hr/hr-auth/hr-permission.guard.ts`
- Create: `apps/api/src/modules/hr/hr-auth/hr-auth.module.ts`
- Create: `apps/api/src/modules/hr/hr-auth/hr-permission.types.ts`

- [ ] **Step 1: Create types file**

Create `apps/api/src/modules/hr/hr-auth/hr-permission.types.ts`:

```ts
export const HR_PAGE_KEYS = [
  'dashboard',
  'messages',
  'reports',
  'employees',
  'tasks',
  'oylik',
  'activity',
  'settings',
] as const;

export type HrPageKey = (typeof HR_PAGE_KEYS)[number];

export const HR_MESSAGE_SECTIONS = [
  'messages:demand',
  'messages:customer_order',
  'messages:payment_in',
  'messages:supply',
  'messages:sales_return',
] as const;

export type HrMessageSection = (typeof HR_MESSAGE_SECTIONS)[number];

export const HR_ACCESS_LEVELS = ['full', 'read', 'own_only'] as const;
export type HrAccessLevel = (typeof HR_ACCESS_LEVELS)[number];

export const HR_PERMISSION_METADATA_KEY = 'hr_permission';

export interface HrPermissionRequirement {
  page: HrPageKey;
  access: HrAccessLevel;
  section?: string;
}
```

- [ ] **Step 2: Create decorator**

Create `apps/api/src/modules/hr/hr-auth/require-hr-permission.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { HrAccessLevel, HrPageKey, HrPermissionRequirement } from './hr-permission.types.js';
import { HR_PERMISSION_METADATA_KEY } from './hr-permission.types.js';

/**
 * Attaches an HR permission requirement to a controller method. Enforced by
 * HrPermissionGuard (registered at HrModule level — see hr.module.ts).
 *
 * Admins (`hrRoles` contains 'admin') bypass the check.
 */
export const RequireHrPermission = (
  page: HrPageKey,
  access: HrAccessLevel,
  section?: string,
) => SetMetadata(HR_PERMISSION_METADATA_KEY, { page, access, section } satisfies HrPermissionRequirement);
```

- [ ] **Step 3: Create guard (P1 will implement full logic; P0 = skeleton that allows everything but logs)**

Create `apps/api/src/modules/hr/hr-auth/hr-permission.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  HR_PERMISSION_METADATA_KEY,
  type HrPermissionRequirement,
} from './hr-permission.types.js';

/**
 * P0 PLACEHOLDER — full enforcement implemented in P1 (HR-Employee sprint)
 * once HrEmployeePermission table is populated. Currently logs the requirement
 * and passes through. DO NOT deploy P0 alone to production — security gap.
 */
@Injectable()
export class HrPermissionGuard implements CanActivate {
  private readonly logger = new Logger(HrPermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<HrPermissionRequirement | undefined>(
      HR_PERMISSION_METADATA_KEY,
      ctx.getHandler(),
    );
    if (!required) return true;
    this.logger.warn(
      `[P0 PLACEHOLDER] HR permission requirement '${required.page}:${required.access}${required.section ? `:${required.section}` : ''}' — pass-through enabled. Implement enforcement in P1.`,
    );
    return true;
  }
}
```

- [ ] **Step 4: Create HrAuth module wrapper**

Create `apps/api/src/modules/hr/hr-auth/hr-auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HrPermissionGuard } from './hr-permission.guard.js';

@Module({
  providers: [HrPermissionGuard],
  exports: [HrPermissionGuard],
})
export class HrAuthModule {}
```

---

### Task 7: HR sub-module placeholders (17 ta)

Har sub-module faqat skeleton `@Module({})` exports — P1-P6 spritnlarda implementatsiya keladi. Yagona maqsad: imports tree integratsiya qilish.

**Files:** 17 ta yangi (har biri ~10 qator)
- `apps/api/src/modules/hr/attendance/attendance.module.ts`
- `apps/api/src/modules/hr/hr-task-template/hr-task-template.module.ts`
- `apps/api/src/modules/hr/hr-task-review/hr-task-review.module.ts`
- `apps/api/src/modules/hr/hr-task-send/hr-task-send.module.ts`
- `apps/api/src/modules/hr/hr-kpi/hr-kpi.module.ts`
- `apps/api/src/modules/hr/hr-bonus-fine/hr-bonus-fine.module.ts`
- `apps/api/src/modules/hr/hr-salary/hr-salary.module.ts`
- `apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-bridge.module.ts`
- `apps/api/src/modules/hr/hr-telegram-account/hr-telegram-account.module.ts`
- `apps/api/src/modules/hr/hr-messages/hr-messages.module.ts`
- `apps/api/src/modules/hr/hr-dashboard/hr-dashboard.module.ts`
- `apps/api/src/modules/hr/hr-reports/hr-reports.module.ts`
- `apps/api/src/modules/hr/hr-settings/hr-settings.module.ts`
- `apps/api/src/modules/hr/hr-scheduler/hr-scheduler.module.ts`
- `apps/api/src/modules/hr/hr-events/hr-events.module.ts`
- `apps/api/src/modules/hr/hr-websocket/hr-websocket.module.ts`

- [ ] **Step 1: Create all 16 placeholder files using this template**

For each path above, create the file with this template (replace `XxxModule` with PascalCase of folder name, e.g. `hr-task-template` → `HrTaskTemplateModule`):

```ts
import { Module } from '@nestjs/common';

// P0 placeholder — implementation in sprint <P-N> (see master spec § 2).
@Module({})
export class XxxModule {}
```

Exact PascalCase names:
- `attendance.module.ts` → `HrAttendanceModule` (rename: file is `attendance.module.ts` BUT class is `HrAttendanceModule` to avoid naming conflict with potential future "attendance" elsewhere; subfolder is `attendance` not `hr-attendance` for cleaner URL `/hr/attendance/...`)
- `hr-task-template.module.ts` → `HrTaskTemplateModule`
- `hr-task-review.module.ts` → `HrTaskReviewModule`
- `hr-task-send.module.ts` → `HrTaskSendModule`
- `hr-kpi.module.ts` → `HrKpiModule`
- `hr-bonus-fine.module.ts` → `HrBonusFineModule`
- `hr-salary.module.ts` → `HrSalaryModule`
- `hr-telegram-bridge.module.ts` → `HrTelegramBridgeModule`
- `hr-telegram-account.module.ts` → `HrTelegramAccountModule`
- `hr-messages.module.ts` → `HrMessagesModule`
- `hr-dashboard.module.ts` → `HrDashboardModule`
- `hr-reports.module.ts` → `HrReportsModule`
- `hr-settings.module.ts` → `HrSettingsModule`
- `hr-scheduler.module.ts` → `HrSchedulerModule`
- `hr-events.module.ts` → `HrEventsModule`
- `hr-websocket.module.ts` → `HrWebsocketModule`

Example for `attendance.module.ts`:

```ts
import { Module } from '@nestjs/common';

// P0 placeholder — implementation in sprint P2 (HR-Attendance).
@Module({})
export class HrAttendanceModule {}
```

Example for `hr-events.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

// P0 — re-exports EventEmitter wiring so consumers (HrTelegramBridgeModule etc.)
// can inject EventEmitter2 without importing @nestjs/event-emitter directly.
@Module({
  imports: [EventEmitterModule],
  exports: [EventEmitterModule],
})
export class HrEventsModule {}
```

---

### Task 8: HR top-level module

Aggregator that imports all 17 sub-modules.

**Files:**
- Create: `apps/api/src/modules/hr/hr.module.ts`

- [ ] **Step 1: Create `hr.module.ts`**

Create `apps/api/src/modules/hr/hr.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HrAttendanceModule } from './attendance/attendance.module.js';
import { HrAuthModule } from './hr-auth/hr-auth.module.js';
import { HrBonusFineModule } from './hr-bonus-fine/hr-bonus-fine.module.js';
import { HrDashboardModule } from './hr-dashboard/hr-dashboard.module.js';
import { HrEventsModule } from './hr-events/hr-events.module.js';
import { HrKpiModule } from './hr-kpi/hr-kpi.module.js';
import { HrMessagesModule } from './hr-messages/hr-messages.module.js';
import { HrReportsModule } from './hr-reports/hr-reports.module.js';
import { HrSalaryModule } from './hr-salary/hr-salary.module.js';
import { HrSchedulerModule } from './hr-scheduler/hr-scheduler.module.js';
import { HrSettingsModule } from './hr-settings/hr-settings.module.js';
import { HrTaskReviewModule } from './hr-task-review/hr-task-review.module.js';
import { HrTaskSendModule } from './hr-task-send/hr-task-send.module.js';
import { HrTaskTemplateModule } from './hr-task-template/hr-task-template.module.js';
import { HrTelegramAccountModule } from './hr-telegram-account/hr-telegram-account.module.js';
import { HrTelegramBridgeModule } from './hr-telegram-bridge/hr-telegram-bridge.module.js';
import { HrWebsocketModule } from './hr-websocket/hr-websocket.module.js';

/**
 * HR module — top-level aggregator. "Yechimlardan keyin" yangi top-menu.
 *
 * Sub-modules:
 *   - hr-auth: permission guard + decorator
 *   - hr-events: NestJS EventEmitter wiring (domain hooks from existing
 *     services like Demand, PaymentIn → HR Telegram bridge listeners)
 *   - hr-scheduler: cron + interval registry (queue 5s, deadline 60s,
 *     KPI 23:30, telegram health 5min, per-template dynamic cron)
 *   - hr-websocket: gateways for /ws/hr/sync (admin) and /ws/hr/tasks/:id
 *   - Operational: attendance, hr-task-template, hr-task-review,
 *     hr-task-send, hr-kpi, hr-bonus-fine, hr-salary
 *   - Telegram: hr-telegram-account (MTProto session, DB encrypted),
 *     hr-telegram-bridge (outbox worker + listeners), hr-messages
 *   - Read models: hr-dashboard, hr-reports, hr-settings
 *
 * Source spec: docs/superpowers/specs/2026-05-20-hr-module-master-design.md
 */
@Module({
  imports: [
    HrAuthModule,
    HrEventsModule,
    HrAttendanceModule,
    HrTaskTemplateModule,
    HrTaskReviewModule,
    HrTaskSendModule,
    HrKpiModule,
    HrBonusFineModule,
    HrSalaryModule,
    HrTelegramBridgeModule,
    HrTelegramAccountModule,
    HrMessagesModule,
    HrDashboardModule,
    HrReportsModule,
    HrSettingsModule,
    HrSchedulerModule,
    HrWebsocketModule,
  ],
})
export class HrModule {}
```

---

### Task 9: Register HrModule + EventEmitterModule in app.module.ts

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add imports alphabetically**

Open `apps/api/src/app.module.ts`. Find the import block (top of file) and add (alphabetical order — `HelpModule` is currently in alphabet position; `HrModule` comes after `HelpModule` and before `ImageModule`):

```ts
import { HrModule } from './modules/hr/hr.module.js';
```

And add at the top with other `@nestjs/*` imports:

```ts
import { EventEmitterModule } from '@nestjs/event-emitter';
```

- [ ] **Step 2: Register in `@Module({ imports: [...] })`**

In the `@Module({})` decorator's `imports` array, add `EventEmitterModule.forRoot({ wildcard: true })` near the top (with other `*.forRoot()` calls like `ConfigModule.forRoot()` and `ScheduleModule.forRoot()`), and add `HrModule` in the alphabetical position with the other module imports.

Locate the existing pattern (find a line like `ScheduleModule.forRoot(),` or similar) and add:

```ts
@Module({
  imports: [
    // ...existing forRoot calls...
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    // ...existing module imports alphabetically...
    HrModule,  // insert between HelpModule and ImageModule
    // ...
  ],
})
```

If the file has a long alphabetical list of modules (it does — 90+ entries), find `HelpModule,` line and add `HrModule,` immediately after it.

---

### Task 10: Prisma schema — Employee additive kengaytma

7 ta nullable HR field + unique index `(account_id, username)`.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Find the Employee model**

Open `packages/db/prisma/schema.prisma` and locate `model Employee {` (around line 173 per earlier exploration).

- [ ] **Step 2: Insert HR field block before the relations section**

Find the closing of the simple field section (likely before the first `@relation` block — around line 211-213 where `updatedAt` is defined). Immediately after `updatedAt` line and before the relations (`account Account ...`), add:

```prisma
  // === HR module fields (P0 sprint) ===
  // All nullable/defaulted for backward compatibility. Populated when
  // an employee opts into the HR workflow (set-password + telegram link).
  username           String?   @db.VarChar(50)
  isChecker          Boolean   @default(false) @map("is_checker")
  telegramPhone      String?   @map("telegram_phone") @db.VarChar(20)
  moyskladAgentId    String?   @map("moysklad_agent_id") @db.Uuid
  department         String?   @db.VarChar(100)
  hrRoles            String[]  @default([]) @map("hr_roles")
  /// Per-employee salary override. If null, fallback to HrSalaryConfig
  /// (per-account singleton). Shape: { fixWeight, kpiWeight, bonusWeight,
  /// monthlySalesTarget, monthlyKpiBudget, commissionPercent, kpiTiers[] }.
  salaryConfig       Json?     @map("salary_config")
```

- [ ] **Step 3: Add relations to HR tables (defer to Task 11 after HR tables exist)**

The actual `hrPermissions HrEmployeePermission[]` etc. relation lines will be added in Task 11 (after the HR models are defined). Skip for now — Prisma will validate fine without back-relations as long as the forward refs exist.

- [ ] **Step 4: Add unique index at end of Employee model (before closing `}`)**

Find the existing index block (look for `@@index([accountId])` or similar near the end of `model Employee`). Add after the last `@@index`:

```prisma
  @@unique([accountId, username], name: "Employee_account_username_uk", map: "Employee_account_username_uk")
```

(Prisma's partial unique index — only enforced when username IS NOT NULL — requires raw SQL in migration, see Task 13.)

---

### Task 11: Prisma schema — Task discriminator + HR fields

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Locate `model Task {` (around line 1110)**

- [ ] **Step 2: Add `TaskKind` enum at end of file**

Append at the very end of `schema.prisma`:

```prisma
enum TaskKind {
  CRM
  HR
}
```

- [ ] **Step 3: Add HR fields inside `model Task {`**

Find the simple field section of `Task` model and add (before the relations block):

```prisma
  // === HR module fields (P0 sprint) ===
  // kind=CRM (default) → moysklad standart vazifa (CRM follow-up etc.)
  // kind=HR  → xodimga yuborilgan topshiriq (4-ko'z review, deadline, bonus/fine).
  // HR fields nullable for CRM tasks.
  kind              TaskKind   @default(CRM)
  hrTemplateId      String?    @map("hr_template_id") @db.Uuid
  hrCheckerId       String?    @map("hr_checker_id") @db.Uuid
  hrResponseType    String?    @default("none") @map("hr_response_type") @db.VarChar(20)
  hrDeadlineMinutes Int?       @map("hr_deadline_minutes")
  hrRewardMinor     BigInt?    @map("hr_reward_minor")
  hrFineMinor       BigInt?    @map("hr_fine_minor")
  hrDependsOnId     String?    @map("hr_depends_on_id") @db.Uuid
```

(Relations to `HrTaskTemplate` and `HrTaskLog` added in Task 12.)

---

### Task 12: Prisma schema — 16 yangi HR table

Hammasi additive. Spec § 3 da to'liq yozilgan. Bu yerda paste qilamiz.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append all 16 HR models at the end of `schema.prisma`**

Append after the `TaskKind` enum (Task 11):

```prisma
// ============================================================================
// HR MODULE — P0 foundation (master spec § 3)
// ============================================================================
// 16 ta yangi `hr_*` table. Mavjud Employee/Task'larga additive kengaytma
// (Task 10, 11 da kiritildi). Hammasi RLS bilan multi-tenant (migration.sql
// da policy qo'shiladi — Task 13).
// ============================================================================

model HrTaskTemplate {
  id                 String    @id @default(uuid()) @db.Uuid
  accountId          String    @map("account_id") @db.Uuid
  title              String    @db.VarChar(255)
  description        String?
  assignedEmployeeId String?   @map("assigned_employee_id") @db.Uuid
  assignedRole       String?   @map("assigned_role") @db.VarChar(50)
  department         String?   @db.VarChar(100)
  priority           String    @default("medium") @db.VarChar(20)
  triggerType        String    @map("trigger_type") @db.VarChar(20)
  scheduleConfig     Json?     @map("schedule_config")
  eventConfig        Json?     @map("event_config")
  responseType       String    @default("none") @map("response_type") @db.VarChar(20)
  deadlineMinutes    Int?      @map("deadline_minutes")
  rewardMinor        BigInt?   @map("reward_minor")
  fineMinor          BigInt?   @map("fine_minor")
  checkerId          String?   @map("checker_id") @db.Uuid
  dependsOnId        String?   @map("depends_on_id") @db.Uuid
  isActive           Boolean   @default(true) @map("is_active")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  account          Account         @relation(fields: [accountId], references: [id], onDelete: Cascade)
  assignedEmployee Employee?       @relation("HrTemplateAssignee", fields: [assignedEmployeeId], references: [id])
  checker          Employee?       @relation("HrTemplateChecker", fields: [checkerId], references: [id])
  dependsOn        HrTaskTemplate? @relation("HrTemplateDeps", fields: [dependsOnId], references: [id])
  dependents       HrTaskTemplate[] @relation("HrTemplateDeps")
  logs             HrTaskLog[]
  taskInstances    Task[]

  @@index([accountId, isActive])
  @@index([accountId, triggerType])
  @@map("hr_task_template")
}

model HrTaskLog {
  id                String    @id @default(uuid()) @db.Uuid
  accountId         String    @map("account_id") @db.Uuid
  templateId        String    @map("template_id") @db.Uuid
  taskId            String    @unique @map("task_id") @db.Uuid
  employeeId        String    @map("employee_id") @db.Uuid
  status            String    @db.VarChar(20)
  responseText      String?   @map("response_text")
  sentAt            DateTime  @map("sent_at") @db.Timestamptz()
  answeredAt        DateTime? @map("answered_at") @db.Timestamptz()
  reviewedAt        DateTime? @map("reviewed_at") @db.Timestamptz()
  reviewedById      String?   @map("reviewed_by_id") @db.Uuid
  reviewComment     String?   @map("review_comment")
  telegramMessageId String?   @map("telegram_message_id") @db.VarChar(50)
  failReason        String?   @map("fail_reason")

  account    Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  template   HrTaskTemplate   @relation(fields: [templateId], references: [id])
  task       Task             @relation(fields: [taskId], references: [id], onDelete: Cascade)
  employee   Employee         @relation("HrTaskAssignee", fields: [employeeId], references: [id])
  reviewedBy Employee?        @relation("HrTaskChecker", fields: [reviewedById], references: [id])
  bonusFines HrBonusFineLog[]

  @@index([accountId, employeeId, status])
  @@index([accountId, templateId, sentAt(sort: Desc)])
  @@index([accountId, status, sentAt(sort: Desc)])
  @@map("hr_task_log")
}

model HrAttendance {
  id           String    @id @default(uuid()) @db.Uuid
  accountId    String    @map("account_id") @db.Uuid
  employeeId   String    @map("employee_id") @db.Uuid
  checkInTime  DateTime  @map("check_in_time") @db.Timestamptz()
  checkOutTime DateTime? @map("check_out_time") @db.Timestamptz()
  editedById   String?   @map("edited_by_id") @db.Uuid
  editedAt     DateTime? @map("edited_at") @db.Timestamptz()
  notes        String?
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  account  Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee  @relation("HrAttendanceEmployee", fields: [employeeId], references: [id])
  editedBy Employee? @relation("HrAttendanceEditor", fields: [editedById], references: [id])

  @@index([accountId, employeeId, checkInTime(sort: Desc)])
  @@map("hr_attendance")
}

model HrTelegramAccount {
  id               String    @id @default(uuid()) @db.Uuid
  accountId        String    @map("account_id") @db.Uuid
  slot             Int
  phoneNumber      String    @map("phone_number") @db.VarChar(20)
  apiId            Int       @map("api_id")
  apiHashEncrypted String    @map("api_hash_encrypted")
  sessionEncrypted String?   @map("session_encrypted")
  isActive         Boolean   @default(false) @map("is_active")
  lastConnectedAt  DateTime? @map("last_connected_at") @db.Timestamptz()
  floodWaitUntil   DateTime? @map("flood_wait_until") @db.Timestamptz()
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, slot])
  @@map("hr_telegram_account")
}

model HrTelegramSession {
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  accountSlot Int      @map("account_slot")
  key         String   @db.VarChar(100)
  value       Json
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, accountSlot, key])
  @@map("hr_telegram_session")
}

model HrChatHistory {
  id             String   @id @default(uuid()) @db.Uuid
  accountId      String   @map("account_id") @db.Uuid
  counterpartyId String   @map("counterparty_id") @db.Uuid
  messages       Json     @default("[]")
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account      Account      @relation(fields: [accountId], references: [id], onDelete: Cascade)
  counterparty Counterparty @relation("HrChatHistoryCp", fields: [counterpartyId], references: [id])

  @@unique([accountId, counterpartyId])
  @@map("hr_chat_history")
}

model HrTelegramOutbox {
  id                String    @id @default(uuid()) @db.Uuid
  accountId         String    @map("account_id") @db.Uuid
  counterpartyId    String?   @map("counterparty_id") @db.Uuid
  employeeId        String?   @map("employee_id") @db.Uuid
  toPhone           String    @map("to_phone") @db.VarChar(20)
  messageText       String    @map("message_text")
  status            String    @default("pending") @db.VarChar(20)
  retryCount        Int       @default(0) @map("retry_count")
  nextRetryAt       DateTime? @map("next_retry_at") @db.Timestamptz()
  sentAt            DateTime? @map("sent_at") @db.Timestamptz()
  failReason        String?   @map("fail_reason")
  sourceEventType   String?   @map("source_event_type") @db.VarChar(50)
  sourceDocId       String?   @map("source_doc_id") @db.Uuid
  telegramMessageId String?   @map("telegram_message_id") @db.VarChar(50)
  sentBySlot        Int?      @map("sent_by_slot")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  account      Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  counterparty Counterparty? @relation("HrOutboxCp", fields: [counterpartyId], references: [id])
  employee     Employee?     @relation("HrOutboxEmployee", fields: [employeeId], references: [id])

  @@index([accountId, status, nextRetryAt])
  @@index([accountId, counterpartyId, createdAt(sort: Desc)])
  @@map("hr_telegram_outbox")
}

model HrBonusFineLog {
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  employeeId  String   @map("employee_id") @db.Uuid
  kind        String   @db.VarChar(10)
  source      String   @db.VarChar(30)
  amountMinor BigInt   @map("amount_minor")
  reason      String?
  taskLogId   String?  @map("task_log_id") @db.Uuid
  ruleId      String?  @map("rule_id") @db.Uuid
  createdById String?  @map("created_by_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account   Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee  Employee         @relation("HrBonusEmployee", fields: [employeeId], references: [id])
  taskLog   HrTaskLog?       @relation(fields: [taskLogId], references: [id])
  rule      HrBonusFineRule? @relation(fields: [ruleId], references: [id])
  createdBy Employee?        @relation("HrBonusCreator", fields: [createdById], references: [id])

  @@index([accountId, employeeId, createdAt(sort: Desc)])
  @@index([accountId, source, createdAt(sort: Desc)])
  @@map("hr_bonus_fine_log")
}

model HrBonusFineRule {
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  name        String   @db.VarChar(255)
  kind        String   @db.VarChar(10)
  amountMinor BigInt   @map("amount_minor")
  condition   Json
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  logs    HrBonusFineLog[]

  @@map("hr_bonus_fine_rule")
}

model HrSalaryConfig {
  id                 String   @id @default(uuid()) @db.Uuid
  accountId          String   @unique @map("account_id") @db.Uuid
  fixWeight          Decimal  @default("0.7") @map("fix_weight") @db.Decimal(3, 2)
  kpiWeight          Decimal  @default("0.2") @map("kpi_weight") @db.Decimal(3, 2)
  bonusWeight        Decimal  @default("0.1") @map("bonus_weight") @db.Decimal(3, 2)
  monthlySalesTarget BigInt   @map("monthly_sales_target")
  monthlyKpiBudget   BigInt   @map("monthly_kpi_budget")
  commissionPercent  Decimal  @default("1.5") @map("commission_percent") @db.Decimal(5, 2)
  kpiTiers           Json     @map("kpi_tiers")
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@map("hr_salary_config")
}

model HrKpiDailyLog {
  id                 String   @id @default(uuid()) @db.Uuid
  accountId          String   @map("account_id") @db.Uuid
  employeeId         String   @map("employee_id") @db.Uuid
  date               DateTime @db.Date
  personalSalesMinor BigInt   @map("personal_sales_minor")
  targetMinor        BigInt   @map("target_minor")
  achievementPercent Decimal  @map("achievement_percent") @db.Decimal(6, 2)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation("HrKpiDailyEmployee", fields: [employeeId], references: [id])

  @@unique([accountId, employeeId, date])
  @@index([accountId, date(sort: Desc)])
  @@map("hr_kpi_daily_log")
}

model HrKpiMonthlyScore {
  id                 String   @id @default(uuid()) @db.Uuid
  accountId          String   @map("account_id") @db.Uuid
  employeeId         String   @map("employee_id") @db.Uuid
  yearMonth          String   @map("year_month") @db.VarChar(7)
  totalSalesMinor    BigInt   @map("total_sales_minor")
  targetMinor        BigInt   @map("target_minor")
  achievementPercent Decimal  @map("achievement_percent") @db.Decimal(6, 2)
  tierPayoutPercent  Decimal  @map("tier_payout_percent") @db.Decimal(6, 2)
  kpiEarnedMinor     BigInt   @map("kpi_earned_minor")
  fixComponentMinor  BigInt   @map("fix_component_minor")
  bonusSumMinor      BigInt   @map("bonus_sum_minor")
  fineSumMinor       BigInt   @map("fine_sum_minor")
  commissionMinor    BigInt   @map("commission_minor")
  finalSalaryMinor   BigInt   @map("final_salary_minor")
  computedAt         DateTime @default(now()) @map("computed_at") @db.Timestamptz()

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation("HrKpiMonthlyEmployee", fields: [employeeId], references: [id])

  @@unique([accountId, employeeId, yearMonth])
  @@index([accountId, yearMonth])
  @@map("hr_kpi_monthly_score")
}

model HrEmployeePermission {
  id          String  @id @default(uuid()) @db.Uuid
  accountId   String  @map("account_id") @db.Uuid
  employeeId  String  @map("employee_id") @db.Uuid
  pageKey     String  @map("page_key") @db.VarChar(50)
  section     String? @db.VarChar(50)
  accessLevel String  @default("read") @map("access_level") @db.VarChar(20)

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation("HrPermEmployee", fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([accountId, employeeId, pageKey, section])
  @@map("hr_employee_permission")
}

model HrRole {
  id        String  @id @default(uuid()) @db.Uuid
  accountId String  @map("account_id") @db.Uuid
  value     String  @db.VarChar(50)
  label     String  @db.VarChar(100)
  isDefault Boolean @default(false) @map("is_default")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, value])
  @@map("hr_role")
}

model HrNotificationTemplate {
  id                    String  @id @default(uuid()) @db.Uuid
  accountId             String  @map("account_id") @db.Uuid
  docType               String  @map("doc_type") @db.VarChar(50)
  eventType             String  @map("event_type") @db.VarChar(50)
  templateText          String  @map("template_text")
  isActive              Boolean @default(true) @map("is_active")
  largeSaleMinThreshold BigInt? @map("large_sale_min_threshold")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, docType, eventType])
  @@map("hr_notification_template")
}

model HrActivityLog {
  id         String   @id @default(uuid()) @db.Uuid
  accountId  String   @map("account_id") @db.Uuid
  actorId    String?  @map("actor_id") @db.Uuid
  action     String   @db.VarChar(50)
  entityType String   @map("entity_type") @db.VarChar(50)
  entityId   String?  @map("entity_id") @db.Uuid
  diff       Json?
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz()

  account Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  actor   Employee? @relation("HrActivityActor", fields: [actorId], references: [id])

  @@index([accountId, createdAt(sort: Desc)])
  @@index([accountId, entityType, entityId, createdAt(sort: Desc)])
  @@map("hr_activity_log")
}
```

- [ ] **Step 2: Add back-relations to `Employee` model**

Return to `model Employee {` (Task 10 area). Find the existing relations block (`account Account @relation...`, `ownedProducts Product[]`, etc.) and add at the end:

```prisma
  hrPermissions       HrEmployeePermission[] @relation("HrPermEmployee")
  hrTemplatesAssigned HrTaskTemplate[]       @relation("HrTemplateAssignee")
  hrTemplatesChecker  HrTaskTemplate[]       @relation("HrTemplateChecker")
  hrTaskLogsAssigned  HrTaskLog[]            @relation("HrTaskAssignee")
  hrTaskLogsChecked   HrTaskLog[]            @relation("HrTaskChecker")
  hrAttendances       HrAttendance[]         @relation("HrAttendanceEmployee")
  hrAttendancesEdited HrAttendance[]         @relation("HrAttendanceEditor")
  hrBonusFinesOwned   HrBonusFineLog[]       @relation("HrBonusEmployee")
  hrBonusFinesCreated HrBonusFineLog[]       @relation("HrBonusCreator")
  hrKpiDaily          HrKpiDailyLog[]        @relation("HrKpiDailyEmployee")
  hrKpiMonthly        HrKpiMonthlyScore[]    @relation("HrKpiMonthlyEmployee")
  hrOutboxEntries     HrTelegramOutbox[]     @relation("HrOutboxEmployee")
  hrActivities        HrActivityLog[]        @relation("HrActivityActor")
```

- [ ] **Step 3: Add back-relations to `Task` model**

In `model Task {`, append to its relation block (search for `task.module.ts` neighbor relations or the `account Account ...` line):

```prisma
  hrTemplate HrTaskTemplate? @relation(fields: [hrTemplateId], references: [id])
  hrTaskLog  HrTaskLog?
```

- [ ] **Step 4: Add back-relations to `Account` model**

Find `model Account {` (likely top of schema.prisma). At the end of its relations block (where lots of `xxxs Xxx[]` lines exist), append:

```prisma
  hrTaskTemplates         HrTaskTemplate[]
  hrTaskLogs              HrTaskLog[]
  hrAttendances           HrAttendance[]
  hrTelegramAccounts      HrTelegramAccount[]
  hrTelegramSessions      HrTelegramSession[]
  hrChatHistories         HrChatHistory[]
  hrTelegramOutbox        HrTelegramOutbox[]
  hrBonusFineLogs         HrBonusFineLog[]
  hrBonusFineRules        HrBonusFineRule[]
  hrSalaryConfig          HrSalaryConfig?
  hrKpiDailyLogs          HrKpiDailyLog[]
  hrKpiMonthlyScores      HrKpiMonthlyScore[]
  hrEmployeePermissions   HrEmployeePermission[]
  hrRoles                 HrRole[]
  hrNotificationTemplates HrNotificationTemplate[]
  hrActivityLogs          HrActivityLog[]
```

- [ ] **Step 5: Add back-relations to `Counterparty` model**

Find `model Counterparty {`. Append:

```prisma
  hrChatHistories  HrChatHistory[]    @relation("HrChatHistoryCp")
  hrOutboxEntries  HrTelegramOutbox[] @relation("HrOutboxCp")
```

- [ ] **Step 6: Validate schema**

Defer to Task 16 (`pnpm prisma validate` runs after `pnpm install`). Visual sanity-check now: ensure no unmatched `@relation` names (e.g. `HrTemplateAssignee` appears in both `HrTaskTemplate.assignedEmployee` and `Employee.hrTemplatesAssigned`).

---

### Task 13: Generate migration + append RLS policies

Prisma auto-generates the migration SQL; we manually append RLS policies for the 16 new HR tables (and partial unique index on Employee.username).

**Files:**
- Create (via prisma migrate): `packages/db/prisma/migrations/<timestamp>_hr_module_foundation/migration.sql`
- Manually append RLS block to that file.

- [ ] **Step 1: Generate migration (defer to Task 16 after install)**

This step requires `pnpm install` first (Task 16). Plan the command:

```bash
pnpm --filter @moysklad/db prisma migrate dev --name hr_module_foundation --create-only
```

`--create-only` writes the SQL but does NOT apply — gives us a chance to append RLS.

- [ ] **Step 2: Plan the RLS append block (do not run yet)**

After Task 16 generates the migration SQL file, append the following SQL block to it. Save the block to track now in: `apps/api/src/modules/hr/hr-shared/_migration-rls-append.sql` (a tracked reference, not auto-applied):

```sql
-- ============================================================================
-- HR module RLS policies (multi-tenant isolation)
-- Appended manually after `prisma migrate dev --create-only`.
-- App sets current_setting('app.account_id') via Prisma middleware before
-- every query — see packages/db/src/account-context.ts.
-- ============================================================================

-- Partial unique index on Employee.username (only when NOT NULL)
DROP INDEX IF EXISTS "Employee_account_username_uk";
CREATE UNIQUE INDEX "Employee_account_username_uk"
  ON "Employee"("account_id", "username")
  WHERE "username" IS NOT NULL;

-- Enable RLS + tenant_isolation policy for each new HR table
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'hr_task_template',
    'hr_task_log',
    'hr_attendance',
    'hr_telegram_account',
    'hr_telegram_session',
    'hr_chat_history',
    'hr_telegram_outbox',
    'hr_bonus_fine_log',
    'hr_bonus_fine_rule',
    'hr_salary_config',
    'hr_kpi_daily_log',
    'hr_kpi_monthly_score',
    'hr_employee_permission',
    'hr_role',
    'hr_notification_template',
    'hr_activity_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("account_id" = current_setting(''app.account_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END $$;
```

- [ ] **Step 3: Create the reference SQL file now (Task 16 will copy into migration)**

Create `apps/api/src/modules/hr/hr-shared/_migration-rls-append.sql` with the content above. This is a tracked source-of-truth for the RLS block.

---

### Task 14: Seed defaults script

Per-account default rollar (4 ta), admin `HrEmployeePermission` 8 ta page uchun, `HrSalaryConfig` default.

**Files:**
- Create: `packages/db/prisma/seed-hr.ts`
- Modify: `packages/db/package.json` (add `seed:hr` script)

- [ ] **Step 1: Create seed file**

Create `packages/db/prisma/seed-hr.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Administrator' },
  { value: 'cashier', label: 'Kassir' },
  { value: 'warehouse', label: 'Omborchi' },
  { value: 'staff', label: 'Xodim' },
];

const DEFAULT_KPI_TIERS = [
  { min: 50, payout: 20 },
  { min: 75, payout: 50 },
  { min: 100, payout: 100 },
  { min: 120, payout: 130 },
];

const HR_PAGE_KEYS = [
  'dashboard',
  'messages',
  'reports',
  'employees',
  'tasks',
  'oylik',
  'activity',
  'settings',
];

async function seedHrDefaults() {
  const accounts = await prisma.account.findMany({ select: { id: true } });
  console.log(`Seeding HR defaults for ${accounts.length} account(s)...`);

  for (const acct of accounts) {
    // 1. Default 4 HrRole
    for (const role of DEFAULT_ROLES) {
      await prisma.hrRole.upsert({
        where: { accountId_value: { accountId: acct.id, value: role.value } },
        create: { accountId: acct.id, value: role.value, label: role.label, isDefault: true },
        update: { label: role.label, isDefault: true },
      });
    }

    // 2. HrSalaryConfig per-account singleton
    await prisma.hrSalaryConfig.upsert({
      where: { accountId: acct.id },
      create: {
        accountId: acct.id,
        monthlySalesTarget: BigInt(20_000_000_00),  // 20M UZS in tiyin
        monthlyKpiBudget: BigInt(2_000_000_00),
        kpiTiers: DEFAULT_KPI_TIERS,
      },
      update: {},
    });

    // 3. Mark owner employees as HR admin + checker, assign all 8 permissions
    const owners = await prisma.employee.findMany({
      where: { accountId: acct.id, ownerId: null },
      select: { id: true, hrRoles: true },
    });

    for (const owner of owners) {
      // Update only if HR fields not yet set (don't override manual changes)
      if (!owner.hrRoles.includes('admin')) {
        await prisma.employee.update({
          where: { id: owner.id },
          data: {
            hrRoles: ['admin'],
            isChecker: true,
          },
        });
      }

      // Grant all 8 page permissions as 'full'
      for (const pageKey of HR_PAGE_KEYS) {
        await prisma.hrEmployeePermission.upsert({
          where: {
            accountId_employeeId_pageKey_section: {
              accountId: acct.id,
              employeeId: owner.id,
              pageKey,
              section: null,
            },
          },
          create: {
            accountId: acct.id,
            employeeId: owner.id,
            pageKey,
            accessLevel: 'full',
          },
          update: {},
        });
      }
    }

    console.log(`  Account ${acct.id}: roles + salary config + ${owners.length} admin permissions ✓`);
  }

  console.log('HR defaults seed complete.');
}

seedHrDefaults()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add npm script to `packages/db/package.json`**

In the `scripts` object, add:

```jsonc
{
  "scripts": {
    // ...existing...
    "seed:hr": "tsx prisma/seed-hr.ts"
  }
}
```

- [ ] **Step 3: Run seed (defer to Task 16 after migration applied)**

Plan the command for Task 16:

```bash
pnpm --filter @moysklad/db seed:hr
```

---

### Task 15: Web — HR sidebar + layout + 10 sub-pages + i18n

Frontend foundation: top-nav HR item, sub-nav layout, 10 placeholder sahifa, uz/ru tarjima.

**Files:**
- Modify: `packages/design-system/src/icons/action-icons.ts`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/messages/uz.json`
- Modify: `apps/web/src/messages/ru.json`
- Create: `apps/web/src/app/(app)/hr/layout.tsx`
- Create: `apps/web/src/app/(app)/hr/page.tsx`
- Create: `apps/web/src/app/(app)/hr/employees/page.tsx`
- Create: `apps/web/src/app/(app)/hr/attendance/page.tsx`
- Create: `apps/web/src/app/(app)/hr/tasks/page.tsx`
- Create: `apps/web/src/app/(app)/hr/review/page.tsx`
- Create: `apps/web/src/app/(app)/hr/my-tasks/page.tsx`
- Create: `apps/web/src/app/(app)/hr/payroll/page.tsx`
- Create: `apps/web/src/app/(app)/hr/messages/page.tsx`
- Create: `apps/web/src/app/(app)/hr/reports/page.tsx`
- Create: `apps/web/src/app/(app)/hr/settings/page.tsx`

- [ ] **Step 1: Add HR icon to action-icons.ts**

Open `packages/design-system/src/icons/action-icons.ts`. Find the module nav icon block (around line 154 — `homepage: BarChart3,` etc.). Add `UserCog` import at top with other lucide imports:

```ts
import {
  // ...existing imports...
  UserCog,
} from 'lucide-react';
```

Then in the module-level icons block (after `apps: Puzzle,` on line 166):

```ts
  // ...
  apps: Puzzle,
  hr: UserCog,
```

- [ ] **Step 2: Add HR nav item in layout.tsx**

Open `apps/web/src/app/(app)/layout.tsx`. Add a new `tHr` translations hook with the others (line 22-31):

```ts
const tHr = useTranslations('subnav.hr');
```

In the `moduleNav` array, after the `apps` entry (line 164-168), insert:

```ts
{
  key: 'hr',
  label: tNav('hr'),
  href: '/hr',
  icon: <Icons.hr className={navIconClass} />,
},
```

Add the HR subnav definition after the `productSubNav` declaration (around line 320):

```ts
const hrSubNav: SubNavItem[] = [
  { key: 'home', label: tHr('home'), href: '/hr' },
  { key: 'employees', label: tHr('employees'), href: '/hr/employees' },
  { key: 'attendance', label: tHr('attendance'), href: '/hr/attendance' },
  { key: 'tasks', label: tHr('tasks'), href: '/hr/tasks' },
  { key: 'review', label: tHr('review'), href: '/hr/review' },
  { key: 'my-tasks', label: tHr('my_tasks'), href: '/hr/my-tasks' },
  { key: 'payroll', label: tHr('payroll'), href: '/hr/payroll' },
  { key: 'messages', label: tHr('messages'), href: '/hr/messages' },
  { key: 'reports', label: tHr('reports'), href: '/hr/reports' },
  { key: 'settings', label: tHr('settings'), href: '/hr/settings' },
];
```

In the `activeModule` ternary (around line 322-385), add an HR branch. Find the last branch (likely `pathname === '/' ? 'homepage' : null`) and modify the chain to add HR detection BEFORE the homepage check:

```ts
: pathname.startsWith('/hr')
  ? 'hr'
  : pathname === '/'
    ? 'homepage'
    : null;
```

In the `subNavItems` ternary (around line 392-415), add an HR branch:

```ts
: activeModule === 'hr'
  ? matchActive(hrSubNav)
  : null;
```

(Insert this branch alphabetically — after `ecom` branch but before the final `: null`.)

- [ ] **Step 3: Add uz/ru translations**

In `apps/web/src/messages/uz.json`, find the `"nav"` object (around line 306-321) and add `"hr"` key (after `"apps": "Yechimlar",`):

```jsonc
"nav": {
  // ...existing...
  "apps": "Yechimlar",
  "hr": "HR",
  "settings": "Sozlamalar"
}
```

Then in the same file, find the `"subnav"` object and add a new `"hr"` sub-object (alphabetical position):

```jsonc
"subnav": {
  // ...existing entries (crm, ecom, ...)
  "hr": {
    "home": "Bosh sahifa",
    "employees": "Xodimlar",
    "attendance": "Davomat",
    "tasks": "Vazifalar",
    "review": "Tekshiruv",
    "my_tasks": "Mening vazifalarim",
    "payroll": "Oylik",
    "messages": "Xabarlar",
    "reports": "Hisobotlar",
    "settings": "Sozlamalar"
  },
  // ...
}
```

Now `apps/web/src/messages/ru.json` — same structure with Russian labels:

```jsonc
"nav": {
  // ...existing...
  "apps": "Решения",
  "hr": "HR",
  "settings": "Настройки"
}
```

```jsonc
"subnav": {
  // ...
  "hr": {
    "home": "Главная",
    "employees": "Сотрудники",
    "attendance": "Учёт времени",
    "tasks": "Задачи",
    "review": "Проверка",
    "my_tasks": "Мои задачи",
    "payroll": "Зарплата",
    "messages": "Сообщения",
    "reports": "Отчёты",
    "settings": "Настройки"
  },
  // ...
}
```

- [ ] **Step 4: Create `apps/web/src/app/(app)/hr/layout.tsx`**

```tsx
// HR module layout — wraps all /hr/* pages. The top-level (app)/layout.tsx
// already renders the SubNav based on activeModule==='hr'; this nested
// layout adds the page container without duplicating the subnav.
export default function HrLayout({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4">{children}</div>;
}
```

- [ ] **Step 5: Create 10 placeholder pages**

Each page is a minimal placeholder. Use this template — replace `<PageTitle>` and `<sprintKey>` per page:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function <PageName>Page() {
  const t = useTranslations('subnav.hr');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--ms-text-strong)]">
        {t('<i18nKey>')}
      </h1>
      <p className="text-sm text-[var(--ms-text-muted)]">
        P0 placeholder — full implementation in sprint <sprintKey> (see master spec § 2).
      </p>
    </div>
  );
}
```

Create the 10 files:

| File | `<PageName>` | `<i18nKey>` | `<sprintKey>` |
|---|---|---|---|
| `hr/page.tsx` | `HrHome` | `home` | `P6 (HR-Dashboard)` |
| `hr/employees/page.tsx` | `HrEmployees` | `employees` | `P1 (HR-Employee)` |
| `hr/attendance/page.tsx` | `HrAttendance` | `attendance` | `P2 (HR-Attendance)` |
| `hr/tasks/page.tsx` | `HrTasks` | `tasks` | `P3 (HR-Tasks + Review)` |
| `hr/review/page.tsx` | `HrReview` | `review` | `P3 (HR-Tasks + Review)` |
| `hr/my-tasks/page.tsx` | `HrMyTasks` | `my_tasks` | `P3 (HR-Tasks + Review)` |
| `hr/payroll/page.tsx` | `HrPayroll` | `payroll` | `P5 (HR-Oylik + KPI)` |
| `hr/messages/page.tsx` | `HrMessages` | `messages` | `P4 (HR-Telegram bridge)` |
| `hr/reports/page.tsx` | `HrReports` | `reports` | `P6 (HR-Dashboard + Reports)` |
| `hr/settings/page.tsx` | `HrSettings` | `settings` | `P1+ (HR-Employee + later)` |

---

### Task 16: Sprint final gate + commit

Bu sprint'ning yagona quality gate + commit step. Yuqoridagi 15 ta task'ni QILGAN keyin.

**Files:** (no new files; verify all)

- [ ] **Step 1: Install dependencies**

```bash
cd D:/projects/moysklad
pnpm install
```

Expected: no errors, lockfile updated. If `telegram` package install fails (native binding warnings normal on Windows for gramjs's crypto adapters), check error output — gramjs uses pure JS crypto on Node, should succeed.

- [ ] **Step 2: Prisma — generate client + create migration + append RLS + apply**

```bash
pnpm --filter @moysklad/db prisma generate
```

Expected: `Generated Prisma Client` log.

```bash
pnpm --filter @moysklad/db prisma migrate dev --name hr_module_foundation --create-only
```

Expected: new directory `packages/db/prisma/migrations/<timestamp>_hr_module_foundation/` with `migration.sql`.

Append RLS block (from `apps/api/src/modules/hr/hr-shared/_migration-rls-append.sql` — Task 13) to the migration file:

```bash
cat apps/api/src/modules/hr/hr-shared/_migration-rls-append.sql >> packages/db/prisma/migrations/*_hr_module_foundation/migration.sql
```

Apply the migration:

```bash
pnpm --filter @moysklad/db prisma migrate dev
```

Expected: `Database is now in sync` log.

- [ ] **Step 3: Seed HR defaults**

```bash
pnpm --filter @moysklad/db seed:hr
```

Expected: `HR defaults seed complete.` (per-account roles + salary config + admin perms).

- [ ] **Step 4: Run all quality gates**

```bash
pnpm --filter @moysklad/api typecheck
pnpm --filter @moysklad/web typecheck
pnpm --filter @moysklad/db typecheck
pnpm --filter @moysklad/api test
```

Expected:
- API typecheck: 0 errors
- Web typecheck: 0 errors
- DB typecheck: 0 errors
- API tests: 5 new (crypto.util) + 5 new (tz.util) = 10 new tests pass, all existing tests still pass

Then lint:

```bash
pnpm biome check apps/api apps/web packages/db --error-on-warnings
```

Expected: 0 errors, 0 warnings (Biome). If any new files have lint issues (long lines, import order), fix them.

Build:

```bash
pnpm --filter @moysklad/api build
pnpm --filter @moysklad/web build
```

Expected: successful production builds, no type errors.

- [ ] **Step 5: Smoke test — start dev server, visit /hr in browser (manual)**

```bash
# Terminal 1:
pnpm --filter @moysklad/api dev
# Terminal 2:
pnpm --filter @moysklad/web dev
```

In browser open `http://localhost:3000/hr` (after login as `admin@demo.local` / `admin123`):
- HR sub-nav with 10 items visible
- Top-nav HR icon (UserCog) active
- "Bosh sahifa" placeholder text rendered
- Click each sub-nav item, verify navigates and shows placeholder
- Switch locale to ru — labels change to "Главная", "Сотрудники", etc.

If any visual breaks → fix before commit.

- [ ] **Step 6: Sprint commit (single cohesive commit per user rule)**

Stage all P0 changes:

```bash
git add packages/db/prisma/ \
        apps/api/src/modules/hr/ \
        apps/api/src/app.module.ts \
        apps/api/package.json \
        apps/api/.env.example \
        apps/web/src/app/\(app\)/ \
        apps/web/src/messages/ \
        packages/design-system/src/icons/action-icons.ts \
        packages/db/package.json
```

Verify staged files:

```bash
git status --short
```

Expected: all P0 files staged (M = modified, A = added). No untracked HR files.

Commit with HEREDOC and git identity env:

```bash
GIT_AUTHOR_NAME="Ozodbek" \
GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" \
GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "$(cat <<'EOF'
feat(hr): P0 foundation — schema, module skeleton, web shell

P0 sprint complete (master spec § 2). Foundation for 7 sprint HR module
integration. Implementation per docs/superpowers/plans/2026-05-20-p0-hr-foundation.md.

- Prisma: 16 yangi hr_* table + Employee/Task additive kengaytma
  (kind discriminator + 7 ta nullable HR field har birida) + RLS
  policy har 16 hr_* table'da (multi-tenant isolation)
- NPM deps: gramjs (telegram ^2.26), @nestjs/websockets,
  @nestjs/event-emitter, date-fns-tz, eta, ws
- NestJS HrModule + 17 sub-module skeleton (P1-P6 implementation)
- AES-256-GCM encryption helper (MTProto session storage) + tests
- TZ helpers (Asia/Tashkent +05) + tests
- Domain event types (5 ta MoySklad event + 2 ta HR-internal)
- HrPermissionGuard placeholder (P0 pass-through; P1 enforce)
- Web: HR top-nav item + 10 ta subnav + 10 ta placeholder page
- i18n: nav.hr + subnav.hr.* uz + ru
- Seed: default 4 HrRole + admin HrEmployeePermission x 8 + HrSalaryConfig

Yangibolim kodi REFERENCE ONLY — har modul TypeScript'da noldan yozildi.
Sprint single-gate qoidasi (har sub-task'da commit yo'q, sprint oxirida
bitta cohesive commit + bitta gate).
EOF
)"
```

Expected: husky pre-commit + commit-msg hooks pass. New commit hash printed.

- [ ] **Step 7: Verify commit + push (optional, user choice)**

```bash
git log --oneline -3
```

Expected: 3 most recent commits, latest being `feat(hr): P0 foundation...`.

Do NOT push automatically. Ask user if they want to push (per user rule: "destructive/shared actions need confirmation").

---

## Self-Review

After implementation, verify the plan against the spec:

### Spec coverage check

| Spec § | P0 task | Status |
|---|---|---|
| § 1 backend folder tree (17 sub-modules) | Task 7 + 8 | ✅ |
| § 1 frontend `(app)/hr/` 10 sub-pages | Task 15 | ✅ |
| § 1 NestJS EventEmitter setup | Task 9 (EventEmitterModule.forRoot) | ✅ |
| § 3 Employee additive 7 field | Task 10 | ✅ |
| § 3 Task discriminator + 7 HR field | Task 11 | ✅ |
| § 3 16 ta HR table | Task 12 | ✅ |
| § 4 HrPermissionGuard + decorator | Task 6 (placeholder) — full enforce in P1 | ✅ (skeleton) |
| § 4 default HrRole + HrSalaryConfig + admin perms seed | Task 14 | ✅ |
| § 5 NPM paketlar (gramjs, websockets, eta, date-fns-tz) | Task 1 | ✅ |
| § 5 encryption helper (AES-GCM, HR_SESSION_KEY) | Task 2 + 3 | ✅ |
| § 5 domain event types | Task 5 | ✅ |
| § 6 additive migration | Task 13 | ✅ |
| § 6 RLS policy each hr_* | Task 13 | ✅ |
| § 7 sprint final gate | Task 16 | ✅ |

### Placeholder scan

Searched for "TBD", "TODO", "implement later" — none present (every step has executable code or exact commands).

The `HrPermissionGuard` (Task 6) is explicitly marked P0 PLACEHOLDER — this is documented in code comments and tracked for P1 implementation. Not a plan placeholder, but a phased delivery note.

### Type consistency

- `HrPageKey` type defined Task 6, used in Task 14 seed.
- `HrTaskTemplate.assignedEmployeeId` Task 12 ↔ `Employee.hrTemplatesAssigned` relation Task 12 step 2 — names match (`HrTemplateAssignee`).
- `Task.hrTemplateId` Task 11 ↔ `HrTaskTemplate.taskInstances` Task 12 — relation auto-resolved.
- `Task.kind: TaskKind` Task 11 ↔ `enum TaskKind { CRM HR }` Task 11 — defined in same task.
- `accountId_value` composite key in seed (Task 14) ↔ `@@unique([accountId, value])` on HrRole Task 12 — matches.

No type mismatches found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-p0-hr-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (Tasks 1-15), review between tasks, fast iteration. Task 16 (sprint gate + commit) executed in main session to verify all gates personally.

**2. Inline Execution** — Execute all tasks in this session via `executing-plans`, batch checkpoints (e.g. after Task 7, Task 12, Task 16).

**Which approach?**

Considerations:
- P0 has 15 implementation tasks + 1 gate. Subagent dispatch saves my context for review.
- All tasks are well-specified — subagents won't need clarification on most.
- Task 9 (app.module.ts modify) and Task 15 (layout.tsx modify) require careful integration with existing files — me reviewing the diff matters.
- Foydalanuvchi qoidasi: "speed + quality + no ceremony" — subagent parallel dispatch optimal.
