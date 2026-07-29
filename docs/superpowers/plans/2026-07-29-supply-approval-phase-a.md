# Qabul-tasdiqlash workflow — Faza A (BE state-machine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qabul (Supply) hujjatiga taminotchi→omborchi→admin tasdiqlash state-machine'ini backend'da qurish — stock faqat admin tasdig'ida oshadi.

**Architecture:** Toza FSM-logika (`supply-approval.fsm.ts`) barcha bosqich-o'tish qoidalarini ushlaydi va to'liq unit-test qilinadi. Yupqa `SupplyApprovalService` FSM'ni Prisma-I/O bilan bog'laydi va admin-tasdig'ida mavjud `SupplyService.transition(...,'post')`ni chaqirib stock'ni oshiradi. Endpointlar yangi `supply-approval` modulida izolyatsiya qilinadi (§6 — `counterparty-statement`/`supply.service` fayllariga tegilmaydi). Telegram (Faza B) va ERP-UI (Faza C) alohida.

**Tech Stack:** NestJS (tsx, ESM `.js` importlar) · Prisma (`@Global()` PrismaService, `this.prisma.client`) · Zod DTO · Vitest (pure-logic, `import { describe, expect, it } from 'vitest'`).

## Global Constraints

- **OPUS sifat** · gate commit-nuqtada: `pnpm typecheck` 0 · `pnpm biome check` 0 · api Vitest regress yo'q.
- **§6 izolyatsiya (MAJBURIY):** butun yangi mantiq `apps/api/src/modules/supply-approval/` da. `supply.service.ts` / `counterparty-statement/*` / `permissions.types.ts` **o'zgartirilMAYDI**. Yagona umumiy-fayl o'zgarishi: `schema.prisma` (additive) + `app.module.ts` (1 import + 1 qator).
- **Permission model = fixed enum** (`view|create|update|delete|approve|print`) — yangi action YO'Q. `update` (send/omborchi/reject) + `approve` (admin) qayta ishlatiladi.
- **ESM:** har relative import `.js` bilan tugaydi. **Prisma access:** `this.prisma.client.<model>`.
- **Migration timestamp** oxirgidan (`20260728140000_ms_pick_lists`) keyin: `20260729130000_add_supply_approval`.
- **Status HALOL:** Faza A commit = «Phase-1: BE strukturaviy, runtime-tasdiqlanmagan» (browser/DB-smoke Phase-2).

---

### Task 1: Schema + migration + Prisma client regen

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (Supply model @ 5094 — maydon qo'shish; yangi model 5195-dan keyin)
- Create: `packages/db/prisma/migrations/20260729130000_add_supply_approval/migration.sql`

**Interfaces:**
- Produces: Prisma models `Supply.approvalStage: string`, `SupplyApprovalEvent`, `supply.approvalEvents` relation.

- [ ] **Step 1: Supply modeliga maydon + relation qo'shish**

`schema.prisma` — `statusId` qatoridan keyin (5166 atrofida), boshqa skalar maydonlar orasiga:
```prisma
  /// Multi-role approval workflow bosqichi (2026-07-29 spec). FSM `state` +
  /// `applicable`dan ORTOGONAL; taminotchi→omborchi→admin zanjirini boshqaradi.
  /// Stock faqat admin-tasdig'ida (stage→completed → transition 'post') oshadi.
  approvalStage   String  @default("none") @map("approval_stage") @db.VarChar(30) // none|awaiting_supplier|delivering|awaiting_admin|completed
```
Relations blokiga (`positions SupplyPosition[]` qatoridan keyin, 5179 atrofida):
```prisma
  approvalEvents      SupplyApprovalEvent[]
```

- [ ] **Step 2: SupplyApprovalEvent modelini qo'shish**

`schema.prisma` — Supply `}` (5195) va `model SupplyPosition` (5200) orasiga:
```prisma
/// Qabul-tasdiqlash workflow audit-izi (2026-07-29 spec). Har bosqich-o'tishiga
/// (forward yoki reject) bitta qator — kim / qachon / sabab / omborchi-tuzatishlari.
model SupplyApprovalEvent {
  id        String @id @default(uuid()) @db.Uuid
  accountId String @map("account_id") @db.Uuid
  supplyId  String @map("supply_id") @db.Uuid
  supply    Supply @relation(fields: [supplyId], references: [id], onDelete: Cascade)

  fromStage String  @map("from_stage") @db.VarChar(30)
  toStage   String  @map("to_stage") @db.VarChar(30)
  action    String  @db.VarChar(20) // send | supplier_ok | omborchi_ok | admin_ok | reject
  actorType String  @map("actor_type") @db.VarChar(20) // supplier | omborchi | admin | system
  actorId   String? @map("actor_id") @db.Uuid
  reason    String? @db.Text
  detail    Json?   // omborchi tuzatishlari: [{positionId, was, now}]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@index([accountId, supplyId, createdAt])
  @@map("supply_approval_events")
}
```

- [ ] **Step 3: Migration SQL yozish**

`packages/db/prisma/migrations/20260729130000_add_supply_approval/migration.sql`:
```sql
-- Qabul-tasdiqlash workflow (2026-07-29 spec): Supply.approval_stage + audit jadval
ALTER TABLE "supplies" ADD COLUMN "approval_stage" VARCHAR(30) NOT NULL DEFAULT 'none';

CREATE TABLE "supply_approval_events" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "supply_id" UUID NOT NULL,
    "from_stage" VARCHAR(30) NOT NULL,
    "to_stage" VARCHAR(30) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_approval_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supply_approval_events_account_id_supply_id_created_at_idx"
    ON "supply_approval_events"("account_id", "supply_id", "created_at");

ALTER TABLE "supply_approval_events" ADD CONSTRAINT "supply_approval_events_supply_id_fkey"
    FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Prisma client regen + typecheck**

Run: `pnpm --filter @moysklad/db prisma:generate` (yoki `pnpm --filter @moysklad/db exec prisma generate`)
Expected: xatosiz; `SupplyApprovalEvent` client'da paydo bo'ladi.
Run: `pnpm --filter @moysklad/db typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260729130000_add_supply_approval/migration.sql
git commit -m "feat(supply-approval): schema + migration — approvalStage + audit-log jadval"
```

---

### Task 2: FSM pure logic + tests (CORE)

**Files:**
- Create: `apps/api/src/modules/supply-approval/supply-approval.fsm.ts`
- Test: `apps/api/src/modules/supply-approval/supply-approval.fsm.test.ts`

**Interfaces:**
- Produces: `ApprovalStage`, `ApprovalAction`, `ActorType` types; `FORWARD` map; `forwardTarget(action, current): ApprovalStage`; `rejectTarget(current): ApprovalStage`; `diffAdjustments(positions, adjustments): AdjustmentDetail[]`. Har biri wrong-input'da `ConflictException`/`BadRequestException` (from `@nestjs/common`).

- [ ] **Step 1: Failing test yozish** — `supply-approval.fsm.test.ts`:
```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { diffAdjustments, forwardTarget, rejectTarget } from './supply-approval.fsm.js';

describe('supply-approval FSM — forward', () => {
  it('send: none → awaiting_supplier', () => expect(forwardTarget('send', 'none')).toBe('awaiting_supplier'));
  it('supplier_ok: awaiting_supplier → delivering', () => expect(forwardTarget('supplier_ok', 'awaiting_supplier')).toBe('delivering'));
  it('omborchi_ok: delivering → awaiting_admin', () => expect(forwardTarget('omborchi_ok', 'delivering')).toBe('awaiting_admin'));
  it('admin_ok: awaiting_admin → completed', () => expect(forwardTarget('admin_ok', 'awaiting_admin')).toBe('completed'));
  it('noto\'g\'ri bosqichda 409', () => {
    expect(() => forwardTarget('admin_ok', 'delivering')).toThrow(ConflictException);
    expect(() => forwardTarget('send', 'completed')).toThrow(ConflictException);
  });
});

describe('supply-approval FSM — reject (back)', () => {
  it('awaiting_supplier → none', () => expect(rejectTarget('awaiting_supplier')).toBe('none'));
  it('delivering → awaiting_supplier', () => expect(rejectTarget('delivering')).toBe('awaiting_supplier'));
  it('awaiting_admin → delivering', () => expect(rejectTarget('awaiting_admin')).toBe('delivering'));
  it('none/completed rad etib bo\'lmaydi', () => {
    expect(() => rejectTarget('none')).toThrow(ConflictException);
    expect(() => rejectTarget('completed')).toThrow(ConflictException);
  });
});

describe('supply-approval FSM — diffAdjustments', () => {
  const pos = [{ id: 'p1', quantity: '10' }, { id: 'p2', quantity: '5' }];
  it('faqat o\'zgargan qatorlar', () => {
    expect(diffAdjustments(pos, [{ positionId: 'p1', quantity: '8' }, { positionId: 'p2', quantity: '5' }]))
      .toEqual([{ positionId: 'p1', was: '10', now: '8' }]);
  });
  it('o\'zgarish yo\'q → []', () => expect(diffAdjustments(pos, [{ positionId: 'p2', quantity: '5' }])).toEqual([]));
  it('noma\'lum pozitsiya → BadRequest', () => expect(() => diffAdjustments(pos, [{ positionId: 'x', quantity: '1' }])).toThrow(BadRequestException));
});
```

- [ ] **Step 2: Test fail bo'lishini tasdiqlash**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/supply-approval/supply-approval.fsm.test.ts`
Expected: FAIL ("Cannot find module './supply-approval.fsm.js'").

- [ ] **Step 3: FSM implementatsiyasi** — `supply-approval.fsm.ts`:
```ts
import { BadRequestException, ConflictException } from '@nestjs/common';

export const APPROVAL_STAGES = ['none', 'awaiting_supplier', 'delivering', 'awaiting_admin', 'completed'] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];
export type ForwardAction = 'send' | 'supplier_ok' | 'omborchi_ok' | 'admin_ok';
export type ApprovalAction = ForwardAction | 'reject';
export type ActorType = 'supplier' | 'omborchi' | 'admin' | 'system';

/** Har forward-action qaysi bosqichdan qaysisiga o'tishi. */
export const FORWARD: Record<ForwardAction, { from: ApprovalStage; to: ApprovalStage }> = {
  send: { from: 'none', to: 'awaiting_supplier' },
  supplier_ok: { from: 'awaiting_supplier', to: 'delivering' },
  omborchi_ok: { from: 'delivering', to: 'awaiting_admin' },
  admin_ok: { from: 'awaiting_admin', to: 'completed' },
};

/** Reject: rad etsa bo'ladigan har bosqich → oldingisiga. */
const BACK: Partial<Record<ApprovalStage, ApprovalStage>> = {
  awaiting_supplier: 'none',
  delivering: 'awaiting_supplier',
  awaiting_admin: 'delivering',
};

export function forwardTarget(action: ForwardAction, current: ApprovalStage): ApprovalStage {
  const step = FORWARD[action];
  if (step.from !== current) {
    throw new ConflictException(`Noto'g'ri bosqich: '${action}' faqat '${step.from}'da mumkin (joriy: '${current}')`);
  }
  return step.to;
}

export function rejectTarget(current: ApprovalStage): ApprovalStage {
  const prev = BACK[current];
  if (!prev) throw new ConflictException(`'${current}' bosqichini rad etib bo'lmaydi`);
  return prev;
}

export interface QtyAdjustment { positionId: string; quantity: string }
export interface AdjustmentDetail { positionId: string; was: string; now: string }

/** Omborchi sanagan miqdorlar uchun audit-detali — FAQAT o'zgargan qatorlar. */
export function diffAdjustments(
  positions: { id: string; quantity: string }[],
  adjustments: QtyAdjustment[],
): AdjustmentDetail[] {
  const byId = new Map(positions.map((p) => [p.id, p.quantity]));
  const out: AdjustmentDetail[] = [];
  for (const a of adjustments) {
    const was = byId.get(a.positionId);
    if (was === undefined) throw new BadRequestException(`Pozitsiya topilmadi: ${a.positionId}`);
    if (was !== a.quantity) out.push({ positionId: a.positionId, was, now: a.quantity });
  }
  return out;
}
```

- [ ] **Step 4: Test pass bo'lishini tasdiqlash**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/supply-approval/supply-approval.fsm.test.ts`
Expected: PASS (13 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/supply-approval/supply-approval.fsm.ts apps/api/src/modules/supply-approval/supply-approval.fsm.test.ts
git commit -m "feat(supply-approval): FSM pure-logic — forward/reject/adjustment-diff + testlar"
```

---

### Task 3: Zod DTO schema + tests

**Files:**
- Create: `apps/api/src/modules/supply-approval/supply-approval.schema.ts`
- Test: `apps/api/src/modules/supply-approval/supply-approval.schema.test.ts`

**Interfaces:**
- Produces: `OmborchiConfirmSchema` (→ `{ adjustments: {positionId, quantity}[] }`, default `[]`), `RejectSchema` (→ `{ reason: string }`, min 1), + `OmborchiConfirmDto`/`RejectDto` types.

- [ ] **Step 1: Failing test** — `supply-approval.schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { OmborchiConfirmSchema, RejectSchema } from './supply-approval.schema.js';
const UUID = '11111111-1111-1111-1111-111111111111';

describe('OmborchiConfirmSchema', () => {
  it('valid adjustments', () => expect(OmborchiConfirmSchema.safeParse({ adjustments: [{ positionId: UUID, quantity: '8.5' }] }).success).toBe(true));
  it('adjustments default []', () => expect(OmborchiConfirmSchema.parse({}).adjustments).toEqual([]));
  it('non-decimal quantity rad', () => expect(OmborchiConfirmSchema.safeParse({ adjustments: [{ positionId: UUID, quantity: 'abc' }] }).success).toBe(false));
  it('non-uuid positionId rad', () => expect(OmborchiConfirmSchema.safeParse({ adjustments: [{ positionId: 'x', quantity: '1' }] }).success).toBe(false));
});
describe('RejectSchema', () => {
  it('bo\'sh sabab rad', () => expect(RejectSchema.safeParse({ reason: '' }).success).toBe(false));
  it('sabab bilan qabul', () => expect(RejectSchema.safeParse({ reason: 'kam keldi' }).success).toBe(true));
});
```

- [ ] **Step 2: Fail tasdiqlash** — Run: `pnpm --filter @moysklad/api exec vitest run src/modules/supply-approval/supply-approval.schema.test.ts` → FAIL (module yo'q).

- [ ] **Step 3: Schema** — `supply-approval.schema.ts`:
```ts
import { z } from 'zod';

const decimalStr = z.string().regex(/^\d+(\.\d+)?$/, "Musbat o'nlik son bo'lishi kerak");

export const OmborchiConfirmSchema = z.object({
  adjustments: z.array(z.object({ positionId: z.string().uuid(), quantity: decimalStr })).default([]),
});
export type OmborchiConfirmDto = z.infer<typeof OmborchiConfirmSchema>;

export const RejectSchema = z.object({
  reason: z.string().trim().min(1, 'Sabab majburiy').max(500),
});
export type RejectDto = z.infer<typeof RejectSchema>;
```

- [ ] **Step 4: Pass tasdiqlash** — Run yuqoridagi vitest → PASS (6 test).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/supply-approval/supply-approval.schema.ts apps/api/src/modules/supply-approval/supply-approval.schema.test.ts
git commit -m "feat(supply-approval): omborchi-confirm + reject Zod DTO + testlar"
```

---

### Task 4: SupplyApprovalService (FSM ↔ Prisma I/O)

**Files:**
- Create: `apps/api/src/modules/supply-approval/supply-approval.service.ts`

**Interfaces:**
- Consumes: `PrismaService` (`../../prisma/prisma.service.js`), `SupplyService` (`../supply/supply.service.js`, metod `transition(accountId, userId, id, 'post')`), FSM (`FORWARD`, `rejectTarget`, `diffAdjustments`), schema (`OmborchiConfirmSchema`, `RejectSchema`).
- Produces: `SupplyApprovalService` — `getApproval`, `send`, `omborchiConfirm`, `adminConfirm`, `reject`, `applySupplierDecision` (Faza B uchun exported).

> **Test eslatma:** service = yupqa I/O qatlam; mantiq Task-2/3 pure-testlarda qamrab olingan. Faza A'da service **typecheck** bilan verifikatsiya (DB-integration = Phase-2 QA). Yangi DB-test yozilmaydi (mavjud pattern: pure-logic).

- [ ] **Step 1: Service implementatsiyasi** — `supply-approval.service.ts`:
```ts
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SupplyService } from '../supply/supply.service.js';
import { type ActorType, type ApprovalStage, diffAdjustments, rejectTarget } from './supply-approval.fsm.js';
import { OmborchiConfirmSchema, RejectSchema } from './supply-approval.schema.js';

@Injectable()
export class SupplyApprovalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SupplyService) private readonly supply: SupplyService,
  ) {}

  /** Joriy bosqich + event-tarixi (yangisi birinchi). */
  async getApproval(accountId: string, supplyId: string) {
    const s = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: { approvalStage: true, state: true, applicable: true },
    });
    if (!s) throw new NotFoundException('Qabul topilmadi');
    const events = await this.prisma.client.supplyApprovalEvent.findMany({
      where: { accountId, supplyId }, orderBy: { createdAt: 'desc' },
    });
    return { stage: s.approvalStage as ApprovalStage, state: s.state, applicable: s.applicable, events };
  }

  /** Atomik bosqich-da'vosi — updateMany joriy bosqichga gate. count 0 → 409/404. */
  private async claim(accountId: string, supplyId: string, from: ApprovalStage, to: ApprovalStage) {
    const res = await this.prisma.client.supply.updateMany({
      where: { id: supplyId, accountId, approvalStage: from, deletedAt: null },
      data: { approvalStage: to },
    });
    if (res.count === 0) {
      const exists = await this.prisma.client.supply.findFirst({ where: { id: supplyId, accountId, deletedAt: null }, select: { approvalStage: true } });
      if (!exists) throw new NotFoundException('Qabul topilmadi');
      throw new ConflictException(`Bosqich '${from}' emas (joriy: '${exists.approvalStage}') — o'tish bekor`);
    }
  }

  private logEvent(
    tx: { supplyApprovalEvent: { create: (a: unknown) => Promise<unknown> } },
    accountId: string, supplyId: string, fromStage: ApprovalStage, toStage: ApprovalStage,
    action: string, actorType: ActorType, actorId: string | null, reason?: string, detail?: unknown,
  ) {
    return tx.supplyApprovalEvent.create({
      data: { accountId, supplyId, fromStage, toStage, action, actorType, actorId, reason: reason ?? null, detail: detail ?? undefined },
    });
  }

  /** Egasi taminotchiga yuboradi (none → awaiting_supplier). Faza B: shu yerda Excel+Telegram. */
  async send(accountId: string, userId: string, id: string) {
    await this.claim(accountId, id, 'none', 'awaiting_supplier');
    await this.logEvent(this.prisma.client, accountId, id, 'none', 'awaiting_supplier', 'send', 'system', userId);
    return this.getApproval(accountId, id);
  }

  /** Omborchi sanaydi + tuzatadi (delivering → awaiting_admin). */
  async omborchiConfirm(accountId: string, userId: string, id: string, raw: unknown) {
    const dto = OmborchiConfirmSchema.parse(raw);
    const positions = await this.prisma.client.supplyPosition.findMany({ where: { supplyId: id, accountId }, select: { id: true, quantity: true } });
    const detail = diffAdjustments(positions.map((p) => ({ id: p.id, quantity: p.quantity.toString() })), dto.adjustments);
    await this.prisma.client.$transaction(async (tx) => {
      for (const d of detail) await tx.supplyPosition.update({ where: { id: d.positionId }, data: { quantity: d.now } });
      const res = await tx.supply.updateMany({ where: { id, accountId, approvalStage: 'delivering', deletedAt: null }, data: { approvalStage: 'awaiting_admin' } });
      if (res.count === 0) throw new ConflictException("Bosqich 'delivering' emas");
      await this.logEvent(tx, accountId, id, 'delivering', 'awaiting_admin', 'omborchi_ok', 'omborchi', userId, undefined, detail.length ? detail : undefined);
    });
    return this.getApproval(accountId, id);
  }

  /** Admin yakuniy tasdiq (awaiting_admin → completed) + stock post. */
  async adminConfirm(accountId: string, userId: string, id: string) {
    await this.claim(accountId, id, 'awaiting_admin', 'completed');
    try {
      await this.supply.transition(accountId, userId, id, 'post'); // draft→posted + stock
    } catch (e) {
      await this.prisma.client.supply.updateMany({ where: { id, accountId }, data: { approvalStage: 'awaiting_admin' } });
      throw e;
    }
    await this.logEvent(this.prisma.client, accountId, id, 'awaiting_admin', 'completed', 'admin_ok', 'admin', userId);
    return this.getApproval(accountId, id);
  }

  /** Omborchi/admin ERP'dan rad etadi — joriy bosqichdan oldingisiga, sabab bilan. */
  async reject(accountId: string, userId: string, id: string, raw: unknown, actorType: ActorType = 'omborchi') {
    const dto = RejectSchema.parse(raw);
    const s = await this.prisma.client.supply.findFirst({ where: { id, accountId, deletedAt: null }, select: { approvalStage: true } });
    if (!s) throw new NotFoundException('Qabul topilmadi');
    const from = s.approvalStage as ApprovalStage;
    const to = rejectTarget(from);
    await this.claim(accountId, id, from, to);
    await this.logEvent(this.prisma.client, accountId, id, from, to, 'reject', actorType, userId, dto.reason);
    return this.getApproval(accountId, id);
  }

  /** Faza B (Telegram callback) chaqiradi — taminotchi tasdiq/rad. */
  async applySupplierDecision(accountId: string, id: string, approve: boolean, reason?: string) {
    if (approve) {
      await this.claim(accountId, id, 'awaiting_supplier', 'delivering');
      await this.logEvent(this.prisma.client, accountId, id, 'awaiting_supplier', 'delivering', 'supplier_ok', 'supplier', null);
    } else {
      await this.claim(accountId, id, 'awaiting_supplier', 'none');
      await this.logEvent(this.prisma.client, accountId, id, 'awaiting_supplier', 'none', 'reject', 'supplier', null, reason);
    }
    return this.getApproval(accountId, id);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS. *(Agar `this.prisma.client` yoki `$transaction tx` tiplashda muammo bo'lsa — `supply.service.ts`dagi `$transaction`/`updateMany` ishlatilishini namuna sifatida ol; `logEvent` `tx` parametri tipini o'sha yerdagi tx tipiga moslashtir.)*

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/modules/supply-approval/supply-approval.service.ts
git commit -m "feat(supply-approval): SupplyApprovalService — bosqich-o'tish I/O + admin-stock-post + reject"
```

---

### Task 5: Controller + module + app.module registratsiya

**Files:**
- Create: `apps/api/src/modules/supply-approval/supply-approval.controller.ts`
- Create: `apps/api/src/modules/supply-approval/supply-approval.module.ts`
- Modify: `apps/api/src/app.module.ts` (import + imports[] ga qo'shish, SupplyModule yonida — 111 / 151 atrofida)

**Interfaces:**
- Consumes: `SupplyApprovalService`, auth-dekoratorlari (supply.controller.ts 18-21 + JwtAuthGuard bilan bir xil yo'llar).
- Produces: `SupplyApprovalController` (routes `GET/POST /supplies/:id/approval*`), `SupplyApprovalModule`.

- [ ] **Step 1: Controller** — `supply-approval.controller.ts` (auth-importlarni `supply.controller.ts`dan ko'chir: `AuthenticatedUser` ← `../auth/auth.schema.js`, `CurrentUser` ← `../auth/current-user.decorator.js`, `JwtAuthGuard` ← `supply.controller.ts`dagi import yo'li, `RequirePermission` ← `../permissions/require-permission.decorator.js`):
```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SupplyApprovalService } from './supply-approval.service.js';

@Controller('supplies')
@UseGuards(JwtAuthGuard)
export class SupplyApprovalController {
  constructor(private readonly svc: SupplyApprovalService) {}

  @Get(':id/approval')
  @RequirePermission({ entity: 'supply', action: 'view' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getApproval(user.accountId, id);
  }

  @Post(':id/approval/send')
  @RequirePermission({ entity: 'supply', action: 'update' })
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.send(user.accountId, user.sub, id);
  }

  @Post(':id/approval/omborchi-confirm')
  @RequirePermission({ entity: 'supply', action: 'update' })
  omborchiConfirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.omborchiConfirm(user.accountId, user.sub, id, body);
  }

  @Post(':id/approval/admin-confirm')
  @RequirePermission({ entity: 'supply', action: 'approve' })
  adminConfirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.adminConfirm(user.accountId, user.sub, id);
  }

  @Post(':id/approval/reject')
  @RequirePermission({ entity: 'supply', action: 'update' })
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.reject(user.accountId, user.sub, id, body);
  }
}
```
> **Diqqat (route kolliziya):** `supply.controller.ts` ham `@Controller('supplies')` bo'lishi mumkin — NestJS bir base-path'da ko'p controller'ga ruxsat beradi, chunki to'liq yo'llar (`/approval/*`) mavjud `/supplies/*` bilan kesishmaydi. Step 3'dan keyin `pnpm --filter @moysklad/api build` yoki dev-boot bilan route-registratsiya xatosi yo'qligini tekshir.

- [ ] **Step 2: Module** — `supply-approval.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupplyModule } from '../supply/supply.module.js';
import { SupplyApprovalController } from './supply-approval.controller.js';
import { SupplyApprovalService } from './supply-approval.service.js';

@Module({
  imports: [AuthModule, SupplyModule], // SupplyModule exports SupplyService; PrismaService global
  controllers: [SupplyApprovalController],
  providers: [SupplyApprovalService],
  exports: [SupplyApprovalService], // Faza B (Telegram) applySupplierDecision'ni chaqiradi
})
export class SupplyApprovalModule {}
```

- [ ] **Step 3: app.module.ts registratsiya** — import (SupplyModule import yonida, ~111) + imports[] (SupplyModule yonida, ~151):
```ts
import { SupplyApprovalModule } from './modules/supply-approval/supply-approval.module.js';
```
imports massiviga `SupplyModule,` dan keyin:
```ts
    SupplyApprovalModule,
```

- [ ] **Step 4: Typecheck + build tasdiqlash**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS.
Run: `pnpm --filter @moysklad/api exec vitest run src/modules/supply-approval` (barcha Faza A testlari)
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/supply-approval/supply-approval.controller.ts apps/api/src/modules/supply-approval/supply-approval.module.ts apps/api/src/app.module.ts
git commit -m "feat(supply-approval): controller (/supplies/:id/approval*) + modul + app.module registratsiya"
```

---

## Yakuniy gate (barcha task'dan keyin, 1 marta)

- [ ] `pnpm typecheck` → 0 xato
- [ ] `pnpm biome check apps/api/src/modules/supply-approval` → 0 (kerak bo'lsa `biome check --write`)
- [ ] `pnpm --filter @moysklad/api exec vitest run src/modules/supply-approval` → hammasi yashil
- [ ] api Vitest regress yo'q (mavjud testlar buzilmagan): `pnpm --filter @moysklad/api test` (yoki tegishli runner)
- [ ] NEXT.md `2026-07-29a` → yangi entry: «Faza A ✅ (Phase-1, runtime-unverified) · Faza B keyingi» + MEMORY.md `supply-approval-workflow.md` holatini yangila

## Self-Review (spec coverage)

- Spec §1 state-machine → Task 2 (FORWARD/BACK) ✅ · §2 model → Task 1 ✅ · §3.1 endpointlar → Task 5 ✅ ·
  §3.2 permission (aniqlashtirildi: yangi action YO'Q, update/approve) → Task 5 ✅ · §3.3 omborchi-tuzatish → Task 4 omborchiConfirm ✅ ·
  §3.4 stock-post → Task 4 adminConfirm ✅ · reject→qaytish → Task 4 reject ✅ · audit-log → Task 1+4 ✅.
- Spec §4 Telegram / §5 UI = Faza B/C (bu planga KIRMAYDI — atayin).
- Placeholder yo'q · tip-izchillik: `ApprovalStage`/`FORWARD`/`diffAdjustments` Task2'da ta'riflanib Task4'da ishlatiladi (nom mos).
