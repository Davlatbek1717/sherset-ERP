# Kassada «Xaridordan qaytarish» (cheksiz vozvrat) — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kassir asl cheksiz, mijoz tanlab, tovarni qaytarib olsin — pulni naqd bersa kassadan chiqsin, bermasa mijoz qarzi kamaysin; ikkala hujjat bitta tranzaksiyada.

**Architecture:** Yangi `pos-return` moduli mavjud `SalesReturnService` va `CashOutService` ni **bitta tranzaksiyada** kompozitsiya qiladi. Buning uchun har ikki servisning tranzaksiya-ichi mantig'i alohida `*InTx` metodga ajratiladi; ommaviy metodlar o'sha metodni o'z tranzaksiyasi bilan chaqiradi (mavjud chaqiruvchilar o'zgarmaydi). POS'da yangi `qaytarish` rejimi «Sotuv» ekranining tuzilishini takrorlaydi, lekin boshqa rangda.

**Tech Stack:** NestJS + Prisma (PostgreSQL) · Next.js App Router + React Query · Vitest · Zod

**Spec:** `docs/superpowers/specs/2026-08-16-kassa-xaridordan-qaytarish-design.md`

## Global Constraints

- Pul har doim **minor birlik** (`bigint`, tiyin). `number` ga o'girish TAQIQ.
- Valyuta faqat **`UZS`** (`BASE_CURRENCY`). Dollar qaytarish qamrovdan tashqarida.
- **NULL ≠ 0**: tan narx yig'ilmagan bo'lsa `null`, `0n` EMAS.
- Har yangi `.tsx` fayl → **TO'LIQ web Vitest suite** yugurtiriladi (tor gate konvensiya qo'riqchilarini ko'rmaydi).
- Yangi NestJS moduli **`app.module.ts` ga OSHKORA qo'shiladi**, aks holda prodda 404 (`app-boot.test.ts` qo'riqchisi bor).
- i18n: barcha matn `apps/web/src/messages/{ru,uz}.json` da, komponentda hardcode TAQIQ.
- Kassirga `cashout` ruxsati **BERILMAYDI** — chiqim hujjatini servis ichkarida yaratadi.
- Gate har commitda: `pnpm typecheck` · `npx biome check` · tegishli Vitest.

---

### Task 1: `CashOutOperation` qaytarishga bog'lanadi (sxema)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `CashOutOperation`, model `SalesReturn`)
- Create: `packages/db/prisma/migrations/20260816130000_pos_return_links/migration.sql`
- Test: `apps/api/src/modules/pos-return/pos-return-schema.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `CashOutOperation.salesReturnId: String?` · `CashOutOperation.targetKind` qiymati `'salesreturn'` · `SalesReturn.cashierSessionId: String?` · `SalesReturn` da `@@unique([accountId, syncId])`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/pos-return/pos-return-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Sxema qo'riqchisi — migratsiya YOZILGANINI emas, MODEL to'g'ri ekanini
 * tekshiradi. Prisma client generatsiyasiz ishlaydi (CI'da baza yo'q).
 */
const SCHEMA = readFileSync(
  join(process.cwd(), '../../packages/db/prisma/schema.prisma'),
  'utf8',
);

function modelBlock(name: string): string {
  const m = SCHEMA.match(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, 'm'));
  if (!m) throw new Error(`model ${name} topilmadi`);
  return m[0];
}

describe('POS qaytarish — sxema bog`lanishlari', () => {
  it('CashOutOperation qaytarishga bog`lana oladi', () => {
    const b = modelBlock('CashOutOperation');
    expect(b).toContain('salesReturnId');
    expect(b).toContain('salesReturn');
  });

  it('SalesReturn smenaga bog`lanadi (smena hisobi uchun)', () => {
    expect(modelBlock('SalesReturn')).toContain('cashierSessionId');
  });

  it('SalesReturn syncId UNIKAL — takroriy bosishda ikki hujjat bo`lmaydi', () => {
    expect(modelBlock('SalesReturn')).toMatch(/@@unique\(\[accountId, syncId\]\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return/pos-return-schema.test.ts`
Expected: FAIL — «salesReturnId» topilmaydi.

- [ ] **Step 3: Modify the schema**

`packages/db/prisma/schema.prisma`, `model CashOutOperation` ichiga (mavjud `invoiceInId` yonига):

```prisma
  // POS qaytarish: «bu pul qaysi qaytarish uchun chiqdi». `targetKind` endi
  // 'invoicein' | 'salesreturn'. SetNull — qaytarish o'chsa order qoladi
  // (pul haqiqatan chiqqan, izini yo'qotib bo'lmaydi).
  salesReturnId String? @map("sales_return_id") @db.Uuid
  salesReturn   SalesReturn? @relation(fields: [salesReturnId], references: [id], onDelete: SetNull)
```

`model SalesReturn` ichiga:

```prisma
  /// Qaysi kassir smenasida rasmiylashtirildi. Smena yopilishida kutilgan
  /// naqd shu bo'yicha hisoblanadi (faqat NAQD qaytarishlar chegiriladi —
  /// «naqdmi?» savoliga bog'langan CashOut mavjudligi javob beradi).
  cashierSessionId String? @map("cashier_session_id") @db.Uuid
```

`model SalesReturn` ning teskari relation va indeks qismiga:

```prisma
  cashierSession   CashierSession?    @relation(fields: [cashierSessionId], references: [id], onDelete: SetNull)
  cashOutOperations CashOutOperation[]

  @@unique([accountId, syncId])
  @@index([accountId, cashierSessionId])
```

`model CashierSession` ga teskari relation qo'shiladi:

```prisma
  salesReturns SalesReturn[]
```

- [ ] **Step 4: Write the migration SQL**

`packages/db/prisma/migrations/20260816130000_pos_return_links/migration.sql`:

```sql
-- POS qaytarish: chiqim orderini qaytarishga bog'lash
ALTER TABLE "cash_out_operations" ADD COLUMN "sales_return_id" UUID;
ALTER TABLE "cash_out_operations"
  ADD CONSTRAINT "cash_out_operations_sales_return_id_fkey"
  FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE SET NULL;
CREATE INDEX "cash_out_operations_account_id_sales_return_id_idx"
  ON "cash_out_operations" ("account_id", "sales_return_id");

-- Smena hisobi uchun havola
ALTER TABLE "sales_returns" ADD COLUMN "cashier_session_id" UUID;
ALTER TABLE "sales_returns"
  ADD CONSTRAINT "sales_returns_cashier_session_id_fkey"
  FOREIGN KEY ("cashier_session_id") REFERENCES "cashier_sessions"("id") ON DELETE SET NULL;
CREATE INDEX "sales_returns_account_id_cashier_session_id_idx"
  ON "sales_returns" ("account_id", "cashier_session_id");

-- Takroriy bosishda ikki hujjat bo'lmasligi. Mavjud qatorlarda syncId NULL —
-- Postgres'da NULL lar unikal indeksni buzmaydi, backfill KERAK EMAS.
CREATE UNIQUE INDEX "sales_returns_account_id_sync_id_key"
  ON "sales_returns" ("account_id", "sync_id");
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return/pos-return-schema.test.ts`
Expected: PASS (3 test)

- [ ] **Step 6: Regenerate the Prisma client and typecheck**

Run: `pnpm --filter @moysklad/db generate && pnpm typecheck`
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260816130000_pos_return_links apps/api/src/modules/pos-return/pos-return-schema.test.ts
git commit -m "feat(kassa): POS qaytarish uchun sxema bog'lanishlari"
```

---

### Task 2: Hisob-kitob sof funksiyasi

**Files:**
- Create: `apps/api/src/modules/pos-return/pos-return-settlement.ts`
- Test: `apps/api/src/modules/pos-return/pos-return-settlement.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `posReturnSettlement(i: { settlement: 'CASH' | 'DEBT'; sumMinor: bigint }): { balanceDeltaMinor: bigint; cashOutMinor: bigint | null }`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/pos-return/pos-return-settlement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { posReturnSettlement } from './pos-return-settlement.js';

/**
 * Spek §6 — pul oqimining YAGONA manbai. Bu sof funksiya bo'lgani uchun
 * Prisma'siz sinaladi; servis undan o'qiydi, o'z nusxasini yozmaydi.
 */
describe('posReturnSettlement', () => {
  it('QARZGA: balans −summa, chiqim YO`Q', () => {
    expect(posReturnSettlement({ settlement: 'DEBT', sumMinor: 75_000_00n })).toEqual({
      balanceDeltaMinor: -75_000_00n,
      cashOutMinor: null,
    });
  });

  it('NAQD: chiqim summasi to`liq — balans sof effekti NOLGA keladi', () => {
    // SalesReturn.post() −summa yozadi, CashOut.post() +summa yozadi.
    // Bu funksiya QAYTARISH hujjatining deltasini va chiqim summasini beradi.
    const r = posReturnSettlement({ settlement: 'CASH', sumMinor: 75_000_00n });
    expect(r.balanceDeltaMinor).toBe(-75_000_00n);
    expect(r.cashOutMinor).toBe(75_000_00n);
    // Sof effekt: −summa + summa = 0
    expect(r.balanceDeltaMinor + (r.cashOutMinor ?? 0n)).toBe(0n);
  });

  it('NAQD va jami 0 — chiqim ochilmaydi (0 so`mlik order ma`nosiz)', () => {
    expect(posReturnSettlement({ settlement: 'CASH', sumMinor: 0n }).cashOutMinor).toBeNull();
  });

  it('manfiy summa qabul qilinmaydi', () => {
    expect(() => posReturnSettlement({ settlement: 'CASH', sumMinor: -1n })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return/pos-return-settlement.test.ts`
Expected: FAIL — modul topilmaydi.

- [ ] **Step 3: Write the implementation**

`apps/api/src/modules/pos-return/pos-return-settlement.ts`:

```ts
/**
 * POS qaytarishining PUL QARORI — yagona manba (spek §6).
 *
 * Ikki rejim, ikki xil natija:
 *  · `DEBT` — faqat `SalesReturn` post qilinadi ⇒ mijoz balansi `−summa`
 *    (bizga qarzi kamayadi). Kassaga tegilmaydi.
 *  · `CASH` — ustiga `CashOut` ochiladi ⇒ balans `+summa` qaytaradi va
 *    sof effekt NOLGA keladi (tovar oldik, pul berdik — hisob yopiq),
 *    kassa qoldig'i esa `−summa`.
 *
 * Nega sof funksiya: xuddi shu qarorni servis ham, testlar ham o'qiydi.
 * Ikki nusxa yozilsa ular jimgina ayrilardi va pul noto'g'ri chiqardi.
 */
export interface PosReturnSettlementInput {
  settlement: 'CASH' | 'DEBT';
  /** Qaytarish jami — tiyinda, manfiy bo'la olmaydi. */
  sumMinor: bigint;
}

export interface PosReturnSettlement {
  /** `SalesReturn.post()` balansga yozadigan delta. */
  balanceDeltaMinor: bigint;
  /** Ochiladigan chiqim orderi summasi; `null` = order ochilmaydi. */
  cashOutMinor: bigint | null;
}

export function posReturnSettlement(i: PosReturnSettlementInput): PosReturnSettlement {
  if (i.sumMinor < 0n) {
    throw new Error(`posReturnSettlement: manfiy summa (${i.sumMinor})`);
  }
  return {
    balanceDeltaMinor: -i.sumMinor,
    // 0 so'mlik chiqim orderi ma'nosiz — hujjat ochilmaydi, lekin
    // qaytarishning O'ZI o'tadi (tovar keladi, pul harakat qilmaydi).
    cashOutMinor: i.settlement === 'CASH' && i.sumMinor > 0n ? i.sumMinor : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return/pos-return-settlement.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pos-return/pos-return-settlement.ts apps/api/src/modules/pos-return/pos-return-settlement.test.ts
git commit -m "feat(kassa): POS qaytarish hisob-kitob funksiyasi"
```

---

### Task 3: `SalesReturnService` tashqi tranzaksiyani qabul qiladi

**Files:**
- Modify: `apps/api/src/modules/sales-return/sales-return.service.ts` (`post()` — 1062-qator atrofi)
- Test: `apps/api/src/modules/sales-return/sales-return-external-tx.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `SalesReturnService.postInTx(tx: Prisma.TransactionClient, accountId: string, userId: string, id: string, existing: Awaited<ReturnType<SalesReturnService['findById']>>): Promise<unknown>` — **public**

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/sales-return/sales-return-external-tx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SalesReturnService } from './sales-return.service.js';

/**
 * Task 3 shartnomasi: tranzaksiya-ichi mantiq TASHQARIDAN chaqirilishi
 * mumkin. POS qaytarishi `SalesReturn` va `CashOut` ni BITTA tranzaksiyada
 * post qiladi — ikki alohida tranzaksiya bo'lsa biri o'tib ikkinchisi
 * yiqilishi mumkin edi (pul chiqmagan qaytarish).
 */
describe('SalesReturnService — tashqi tranzaksiya shartnomasi', () => {
  it('postInTx PUBLIC va tranzaksiya klientini birinchi argument qabul qiladi', () => {
    const fn = (SalesReturnService.prototype as unknown as Record<string, unknown>).postInTx;
    expect(typeof fn).toBe('function');
    // (tx, accountId, userId, id, existing) — 5 argument
    expect((fn as (...a: unknown[]) => unknown).length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/sales-return/sales-return-external-tx.test.ts`
Expected: FAIL — `postInTx` `undefined`.

- [ ] **Step 3: Extract the transaction body**

`sales-return.service.ts` da hozirgi `private async post(...)` ichidagi `this.prisma.client.$transaction(async (tx) => { … })` **tanasi** o'zgarmagan holda yangi public metodga ko'chiriladi, `post()` esa uni chaqiradi:

```ts
  /**
   * Tranzaksiya ICHIDAGI post mantig'i — tashqaridan berilgan `tx` bilan
   * ishlaydi. POS qaytarishi (`pos-return`) buni CashOut bilan BITTA
   * tranzaksiyada chaqiradi: biri yiqilsa ikkalasi ham qaytadi.
   *
   * `post()` ning o'zi o'zgarmadi — u shu metodni o'z tranzaksiyasi bilan
   * chaqiradi, ya'ni MAVJUD chaqiruvchilar uchun hech narsa o'zgarmagan.
   */
  async postInTx(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<SalesReturnService['findById']>>,
  ) {
    // ⬇︎ hozirgi $transaction callback'ining TANASI aynan shu yerga ko'chadi
    //    (TOCTOU claim → stock.applyDeltas → balance.applyDelta → return)
  }

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<SalesReturnService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted allowed (current: ${existing.state})`);
    }
    return this.prisma.client.$transaction(
      (tx) => this.postInTx(tx, accountId, userId, id, existing),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
```

🔴 `isolationLevel` ni hozirgi `post()` dagi qiymatdan **aynan ko'chir** — o'zgartirma.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/modules/sales-return`
Expected: PASS — yangi test + mavjud `sales-return` testlarining HAMMASI (regressiya yo'q).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/sales-return/
git commit -m "refactor(kassa): SalesReturn.postInTx — tashqi tranzaksiya"
```

---

### Task 4: `CashOutService` tashqi tranzaksiyani qabul qiladi

**Files:**
- Modify: `apps/api/src/modules/cash-out/cash-out.service.ts` (`post()` — 463-qator atrofi)
- Test: `apps/api/src/modules/cash-out/cash-out-external-tx.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `CashOutService.postInTx(tx: Prisma.TransactionClient, accountId: string, userId: string, id: string, existing: Awaited<ReturnType<CashOutService['findById']>>): Promise<unknown>` — **public**

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/cash-out/cash-out-external-tx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CashOutService } from './cash-out.service.js';

describe('CashOutService — tashqi tranzaksiya shartnomasi', () => {
  it('postInTx PUBLIC va tranzaksiya klientini birinchi argument qabul qiladi', () => {
    const fn = (CashOutService.prototype as unknown as Record<string, unknown>).postInTx;
    expect(typeof fn).toBe('function');
    expect((fn as (...a: unknown[]) => unknown).length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/cash-out/cash-out-external-tx.test.ts`
Expected: FAIL — `postInTx` `undefined`.

- [ ] **Step 3: Extract the transaction body**

Task 3 dagi AYNI naqsh: hozirgi `post()` ichidagi `$transaction` **tanasi** `postInTx` ga ko'chadi (TOCTOU `transitionWithClaim` → `money.applyDeltas(−summa)` → `balance.applyDelta(+summa)`), `post()` esa:

```ts
  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashOutService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }
    return this.prisma.client.$transaction((tx) =>
      this.postInTx(tx, accountId, userId, id, existing),
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/modules/cash-out`
Expected: PASS — yangi test + mavjud `cash-out` testlari.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cash-out/
git commit -m "refactor(kassa): CashOut.postInTx — tashqi tranzaksiya"
```

---

### Task 5: `pos-return` moduli — servis, kontroller, sxema

**Files:**
- Create: `apps/api/src/modules/pos-return/pos-return.schema.ts`
- Create: `apps/api/src/modules/pos-return/pos-return.service.ts`
- Create: `apps/api/src/modules/pos-return/pos-return.controller.ts`
- Create: `apps/api/src/modules/pos-return/pos-return.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/pos-return/pos-return.service.test.ts`

**Interfaces:**
- Consumes: `posReturnSettlement` (Task 2) · `SalesReturnService.postInTx` (Task 3) · `CashOutService.postInTx` (Task 4)
- Produces: `POST /pos/returns` · `PosReturnService.create(accountId, userId, raw): Promise<{ id: string; name: string; sumMinor: string; cashOutId: string | null }>`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/pos-return/pos-return.service.test.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosReturnService } from './pos-return.service.js';

const ACC = 'acc-1';
const USER = 'user-1';

function harness(over: { openSession?: boolean } = {}) {
  const salesReturn = { postInTx: vi.fn(async () => ({ id: 'sr-1', name: 'VP-1' })) };
  const cashOut = { postInTx: vi.fn(async () => ({ id: 'co-1' })) };
  const tx = {
    salesReturn: {
      create: vi.fn(async () => ({ id: 'sr-1', name: 'VP-1', sumMinor: 75_000_00n })),
    },
    cashOut: { create: vi.fn(async () => ({ id: 'co-1' })) },
    cashOutOperation: { create: vi.fn(async () => ({ id: 'op-1' })) },
    cashierAuditEvent: { createMany: vi.fn(async () => ({ count: 1 })) },
  };
  const client = {
    cashierSession: {
      findFirst: vi.fn(async () =>
        over.openSession === false
          ? null
          : { id: 'sess-1', cashDeskId: 'cd-1', storeId: 'st-1', state: 'open' },
      ),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const svc = new PosReturnService(
    { client } as never,
    salesReturn as never,
    cashOut as never,
  );
  return { svc, salesReturn, cashOut, tx };
}

const body = (settlement: 'CASH' | 'DEBT') => ({
  agentId: '11111111-1111-1111-1111-111111111111',
  organizationId: '22222222-2222-2222-2222-222222222222',
  settlement,
  syncId: '33333333-3333-3333-3333-333333333333',
  positions: [
    { productId: '44444444-4444-4444-4444-444444444444', quantity: '1', priceMinor: '7500000' },
  ],
});

describe('PosReturnService', () => {
  it('QARZGA: faqat qaytarish post qilinadi, chiqim orderi OCHILMAYDI', async () => {
    const h = harness();
    const r = await h.svc.create(ACC, USER, body('DEBT'));
    expect(h.salesReturn.postInTx).toHaveBeenCalledTimes(1);
    expect(h.cashOut.postInTx).not.toHaveBeenCalled();
    expect(r.cashOutId).toBeNull();
  });

  it('NAQD: qaytarish VA chiqim orderi BITTA tranzaksiyada post qilinadi', async () => {
    const h = harness();
    const r = await h.svc.create(ACC, USER, body('CASH'));
    expect(h.salesReturn.postInTx).toHaveBeenCalledTimes(1);
    expect(h.cashOut.postInTx).toHaveBeenCalledTimes(1);
    expect(r.cashOutId).toBe('co-1');
    // Ikkalasi ham AYNI tx obyektini oldi — alohida tranzaksiya emas.
    expect(h.salesReturn.postInTx.mock.calls[0]?.[0]).toBe(
      h.cashOut.postInTx.mock.calls[0]?.[0],
    );
  });

  it('NAQD: chiqim orderi qaytarishga BOG`LANADI', async () => {
    const h = harness();
    await h.svc.create(ACC, USER, body('CASH'));
    expect(h.tx.cashOutOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetKind: 'salesreturn', salesReturnId: 'sr-1' }),
      }),
    );
  });

  it('ochiq smena yo`q → 409, hech narsa yozilmaydi', async () => {
    const h = harness({ openSession: false });
    await expect(h.svc.create(ACC, USER, body('CASH'))).rejects.toBeInstanceOf(ConflictException);
    expect(h.salesReturn.postInTx).not.toHaveBeenCalled();
  });

  it('har qaytarish audit jurnaliga yoziladi (settlement bilan)', async () => {
    const h = harness();
    await h.svc.create(ACC, USER, body('CASH'));
    expect(h.tx.cashierAuditEvent.createMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return/pos-return.service.test.ts`
Expected: FAIL — modul topilmaydi.

- [ ] **Step 3: Write the Zod schema**

`apps/api/src/modules/pos-return/pos-return.schema.ts`:

```ts
import { z } from 'zod';

/** Tiyin — satr sifatida keladi (JSON'da bigint yo'q). */
const MinorString = z.string().regex(/^\d+$/, 'minor birlik butun son bo`lishi kerak');

export const PosReturnPositionSchema = z.object({
  productId: z.string().uuid(),
  /** O'nlik satr (scale 6) — 1.5 kg ham qaytariladi. */
  quantity: z.string().regex(/^\d+(\.\d{1,6})?$/),
  /**
   * Birlik narxi. 0 RUXSAT ETILADI — sovg'a qaytarilishi mumkin (tovar
   * keladi, pul harakat qilmaydi). Spek §10.
   */
  priceMinor: MinorString,
});

export const CreatePosReturnSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  /** Bermasa smenaning ombori olinadi. */
  storeId: z.string().uuid().optional(),
  settlement: z.enum(['CASH', 'DEBT']),
  /** Takroriy bosishga qarshi kalit — POS bir marta yaratadi. */
  syncId: z.string().uuid(),
  positions: z.array(PosReturnPositionSchema).min(1, 'kamida bitta tovar kerak'),
});

export type CreatePosReturnInput = z.infer<typeof CreatePosReturnSchema>;
```

- [ ] **Step 4: Write the service**

`apps/api/src/modules/pos-return/pos-return.service.ts`:

```ts
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { CashOutService } from '../cash-out/cash-out.service.js';
import { CASHIER_EVENT } from '../retail-sale/cashier-audit.js';
import { SalesReturnService } from '../sales-return/sales-return.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreatePosReturnSchema } from './pos-return.schema.js';
import { posReturnSettlement } from './pos-return-settlement.js';

/**
 * Kassadagi «Xaridordan qaytarish» — asl cheksiz (spek §4).
 *
 * 🔴 Ikki hujjat BITTA tranzaksiyada: `SalesReturn` (tovar omborga, balans
 * −summa) va naqd bo'lsa `CashOut` (kassa −summa, balans +summa). Ketma-ket
 * chaqirilsa oraliqda uzilish qaytarishni o'tkazib, pulni chiqarmay
 * qoldirardi — kassir pulni qo'lda bergan, balans esa bizni qarzdor
 * ko'rsatardi.
 *
 * 🔴 Ruxsat: endpoint `salesreturn.create` bilan qo'riqlanadi. Kassirda
 * `cashout` ATAYLAB yo'q (firibgarlikka moyil huquq) — chiqim hujjatini shu
 * servis ichkarida yaratadi, ya'ni kassir tor imkoniyat oladi, keng huquq emas.
 */
@Injectable()
export class PosReturnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SalesReturnService) private readonly salesReturn: SalesReturnService,
    @Inject(CashOutService) private readonly cashOut: CashOutService,
  ) {}

  async create(accountId: string, userId: string, raw: unknown) {
    const data = CreatePosReturnSchema.parse(raw);

    // Ochiq smena — ikkala rejimda ham shart: naqd uchun kassa kerak,
    // qarzga uchun hujjat smenaga bog'lanadi (smena hisobi, spek §7).
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId: userId, state: 'open' },
      select: { id: true, cashDeskId: true, storeId: true },
    });
    if (!session) {
      throw new ConflictException("Ochiq smena yo'q — avval smena oching.");
    }

    const sumMinor = data.positions.reduce(
      (acc, p) => acc + BigInt(p.priceMinor) * BigInt(Math.round(Number(p.quantity) * 1e6)) / 1_000_000n,
      0n,
    );
    const plan = posReturnSettlement({ settlement: data.settlement, sumMinor });
    if (data.settlement === 'CASH' && plan.cashOutMinor === null) {
      throw new BadRequestException('Naqd qaytarish uchun jami 0 dan katta bo`lishi kerak.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.salesReturn.create({
        data: {
          accountId,
          ownerId: userId,
          name: '',
          agentId: data.agentId,
          organizationId: data.organizationId,
          storeId: data.storeId ?? session.storeId,
          cashierSessionId: session.id,
          syncId: data.syncId,
          currency: 'UZS',
          state: 'draft',
          sumMinor,
          positions: {
            create: data.positions.map((p) => ({
              accountId,
              productId: p.productId,
              quantity: p.quantity,
              priceMinor: BigInt(p.priceMinor),
            })),
          },
        },
      });

      const existing = await this.salesReturn.findById(accountId, created.id);
      await this.salesReturn.postInTx(tx, accountId, userId, created.id, existing);

      let cashOutId: string | null = null;
      if (plan.cashOutMinor !== null) {
        const co = await tx.cashOut.create({
          data: {
            accountId,
            ownerId: userId,
            name: '',
            agentId: data.agentId,
            organizationId: data.organizationId,
            cashDeskId: session.cashDeskId,
            expenseItem: 'Qaytarish',
            currency: 'UZS',
            state: 'draft',
            sumMinor: plan.cashOutMinor,
          },
        });
        const coExisting = await this.cashOut.findById(accountId, co.id);
        await this.cashOut.postInTx(tx, accountId, userId, co.id, coExisting);
        await tx.cashOutOperation.create({
          data: {
            accountId,
            cashOutId: co.id,
            targetKind: 'salesreturn',
            salesReturnId: created.id,
            amountMinor: plan.cashOutMinor,
          },
        });
        cashOutId = co.id;
      }

      await tx.cashierAuditEvent.createMany({
        data: [
          {
            accountId,
            sessionId: session.id,
            type: CASHIER_EVENT.returnCreated,
            docId: created.id,
            payload: {
              name: created.name,
              agentId: data.agentId,
              sumMinor: sumMinor.toString(),
              settlement: data.settlement,
              lineCount: data.positions.length,
            },
          },
        ],
      });

      return {
        id: created.id,
        name: created.name,
        sumMinor: sumMinor.toString(),
        cashOutId,
      };
    });
  }
}
```

- [ ] **Step 4b: Add the audit event constant (shu taskda, aks holda kompilyatsiya yiqiladi)**

`apps/api/src/modules/retail-sale/cashier-audit.ts` dagi `CASHIER_EVENT` obyektiga:

```ts
  /** Kassadagi «Xaridordan qaytarish» (asl cheksiz). Payload: name · agentId
   *  · sumMinor · settlement ('CASH'|'DEBT') · lineCount. */
  returnCreated: 'RETURN_CREATED',
```

Mavjud `cashier-audit.test.ts` OXIRIGA qo'shiladi (🔴 fayl ustidan Write QILMA —
mavjud testlar jimgina o'chadi):

```ts
describe('CASHIER_EVENT.returnCreated', () => {
  it('qaytarish hodisasi turi mavjud va boshqalardan farq qiladi', () => {
    expect(CASHIER_EVENT.returnCreated).toBe('RETURN_CREATED');
    const all = Object.values(CASHIER_EVENT);
    expect(new Set(all).size).toBe(all.length);
  });
});
```

- [ ] **Step 5: Write the controller and module**

`apps/api/src/modules/pos-return/pos-return.controller.ts`:

```ts
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { PosReturnService } from './pos-return.service.js';

@Controller('pos/returns')
export class PosReturnController {
  constructor(@Inject(PosReturnService) private readonly svc: PosReturnService) {}

  /**
   * Kassadagi qaytarish. Ruxsat ATAYLAB `salesreturn.create` — `cashout`
   * EMAS: kassir umumiy pul-chiqarish huquqini olmaydi (spek §9).
   */
  @Post()
  @RequirePermission({ entity: 'salesreturn', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }
}
```

`apps/api/src/modules/pos-return/pos-return.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CashOutModule } from '../cash-out/cash-out.module.js';
import { SalesReturnModule } from '../sales-return/sales-return.module.js';
import { PosReturnController } from './pos-return.controller.js';
import { PosReturnService } from './pos-return.service.js';

// 🔴 Ikki modul OSHKORA import qilinadi — @Global in'yeksiyaga tayanish
// qo'riqsiz (loyihaning ma'lum bug-klassi).
@Module({
  imports: [SalesReturnModule, CashOutModule],
  controllers: [PosReturnController],
  providers: [PosReturnService],
})
export class PosReturnModule {}
```

`apps/api/src/app.module.ts` — import va `imports:` ro'yxatiga `PosReturnModule` qo'shiladi (aks holda prodda 404).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return src/app-boot.test.ts`
Expected: PASS (5 servis testi + app-boot).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/pos-return/ apps/api/src/app.module.ts
git commit -m "feat(kassa): POST /pos/returns — qaytarish va chiqim bitta tranzaksiyada"
```

---

### Task 6: Menejer paneli qaytarish summasini o'qiydi

**Files:**
- Modify: `apps/api/src/modules/manager/kpi/daily-kpi-drilldown.service.ts` (`amountOfEvent`, ~486-qator)
- Test: `apps/api/src/modules/manager/kpi/daily-kpi-drilldown.test.ts` (mavjud faylga qo'shiladi)

**Interfaces:**
- Consumes: `CASHIER_EVENT.returnCreated` (Task 5, Step 4b)
- Produces: —

- [ ] **Step 1: Write the failing test**

Mavjud drilldown testiga qo'shiladi (🔴 fayl ustidan Write QILMA):

```ts
describe('amountOfEvent — qaytarish', () => {
  it('qaytarish hodisasining pul hissasi sumMinor dan o`qiladi', () => {
    // Menejer paneli «kim qancha qaytardi» ni shu summadan hisoblaydi.
    const rows = drilldownRows([
      { type: CASHIER_EVENT.returnCreated, payload: { sumMinor: '7500000' } },
    ]);
    expect(rows[0]?.amountMinor).toBe('7500000');
  });
});
```

🔴 Agar `drilldownRows` eksport qilinmagan bo'lsa — mavjud testdagi
chaqiruv naqshini AYNAN takrorla (o'sha fayldan ko'chir), yangi API o'ylab topma.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/manager/kpi`
Expected: FAIL — summa `null`.

- [ ] **Step 3: Teach the manager panel to read the amount**

`daily-kpi-drilldown.service.ts` → `amountOfEvent` switch'iga:

```ts
    case CASHIER_EVENT.returnCreated:
      return bigOf(p.sumMinor)?.toString() ?? null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/modules/manager src/modules/retail-sale/cashier-audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/manager/kpi/
git commit -m "feat(kassa): menejer paneli qaytarish summasini o'qiydi"
```

---

### Task 7: Smena hisobi naqd qaytarishni chegiradi

**Files:**
- Modify: `apps/api/src/modules/cashier-session/cashier-session.service.ts` (`gatherShiftCashInputs`, ~600-630-qator)
- Test: `apps/api/src/modules/cashier-session/shift-cash-returns.test.ts`

**Interfaces:**
- Consumes: `SalesReturn.cashierSessionId` (Task 1) · `CashOutOperation.salesReturnId` (Task 1)
- Produces: `returnsCashMinor` endi POS qaytarishlarini ham qamraydi

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/cashier-session/shift-cash-returns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectedCashMinor } from './cashier-session-reconciliation.js';

/**
 * 🔴 SPEK §7 — eng nozik joy. Smenada NAQD qaytarish bo'lsa kutilgan naqd
 * aynan o'sha summaga kamayishi SHART. Aks holda kassir smena yopganda kam
 * pul bilan qoladi va unga asossiz KAMOMAD yoziladi — o'zi hech narsa
 * qilmagan holda.
 *
 * QARZGA qaytarish esa kutilgan naqdga TEGMAYDI — undan pul chiqmagan.
 */
describe('Smena hisobi — POS qaytarishlari', () => {
  const base = {
    openingCashMinor: 1_000_000n,
    salesCashMinor: 500_000n,
    drawerInMinor: 0n,
    drawerOutMinor: 0n,
    returnsCashMinor: 0n,
  };

  it('naqd qaytarish kutilgan naqdni AYNAN o`sha summaga kamaytiradi', () => {
    const before = expectedCashMinor(base);
    const after = expectedCashMinor({ ...base, returnsCashMinor: 75_000n });
    expect(before - after).toBe(75_000n);
  });

  it('qarzga qaytarish kutilgan naqdga tegmaydi', () => {
    // Qarzga qaytarish `returnsCashMinor` ga QO'SHILMAYDI (chiqim orderi yo'q).
    expect(expectedCashMinor({ ...base, returnsCashMinor: 0n })).toBe(
      expectedCashMinor(base),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `cd apps/api && pnpm vitest run src/modules/cashier-session/shift-cash-returns.test.ts`
Expected: PASS — formula allaqachon `returnsCashMinor` ni chegiradi. **Bu test formulani QULFLAYDI**; asosiy ish keyingi qadamda — o'sha a'zoni to'ldirish.

- [ ] **Step 3: Feed POS returns into `returnsCashMinor`**

`cashier-session.service.ts` → `gatherShiftCashInputs` da mavjud `refundAgg` yonига yangi agregat qo'shiladi va natijada qo'shiladi:

```ts
      // POS qaytarishlari (spek §7): shu smenadagi qaytarishlarga bog'langan
      // chiqim orderlari. «Naqdmi?» savoliga ALOHIDA BAYROQ emas, bog'langan
      // CashOut MAVJUDLIGI javob beradi — ikkinchi haqiqat manbai yaratilmaydi.
      this.prisma.client.cashOutOperation.aggregate({
        where: {
          accountId,
          targetKind: 'salesreturn',
          salesReturn: { cashierSessionId: sessionId, state: 'posted' },
        },
        _sum: { amountMinor: true },
      }),
```

va qaytarilayotgan obyektda:

```ts
      returnsCashMinor:
        (refundAgg._sum.cashAmountMinor ?? 0n) + (posReturnAgg._sum.amountMinor ?? 0n),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/modules/cashier-session`
Expected: PASS — yangi test + mavjud smena testlari (regressiya yo'q).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cashier-session/
git commit -m "fix(kassa): POS qaytarishi smena naqd hisobiga tushadi"
```

---

### Task 8: POS «Qaytarish» rejimi — ekran

**Files:**
- Create: `apps/web/src/app/(app)/sotuv/_components/qaytarish-mode.tsx`
- Modify: `apps/web/src/components/pos/pos-sidebar.tsx` (`PosMode` unioni + ro'yxat)
- Modify: `apps/web/src/app/(app)/sotuv/page.tsx` (rejim render'i)
- Modify: `apps/web/src/messages/uz.json`, `apps/web/src/messages/ru.json`
- Test: `apps/web/src/app/(app)/sotuv/__tests__/qaytarish-mode.test.tsx`

**Interfaces:**
- Consumes: `POST /pos/returns` (Task 5)
- Produces: `PosMode` ga `'qaytarish'` qiymati

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/(app)/sotuv/__tests__/qaytarish-mode.test.tsx`:

```tsx
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { at, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/auth-store', () => ({
  isKioskUser: () => false,
  useAuth: () => ({ user: { id: 'u-1', name: 'Kassir' }, accessToken: 't', initialized: true }),
  getAccessToken: () => 't',
  refresh: async () => false,
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  window.localStorage.clear();
});

async function openReturnMode(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(<SotuvPage />);
  await screen.findAllByTestId('sotuv-product');
  await user.click(screen.getByTestId('pos-mode-qaytarish'));
}

describe('POS «Qaytarish» rejimi', () => {
  it('rejim ochiladi va SOTUVDAN ajralib turadi', async () => {
    const user = userEvent.setup();
    await openReturnMode(user);
    expect(screen.getByTestId('qaytarish-panel')).toBeInTheDocument();
  });

  it('🔴 mijoz tanlanmaguncha ikkala tugma ham O`CHIQ', async () => {
    const user = userEvent.setup();
    await openReturnMode(user);
    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));

    expect(screen.getByTestId('qaytarish-cash')).toBeDisabled();
    expect(screen.getByTestId('qaytarish-debt')).toBeDisabled();
    expect(screen.getByTestId('qaytarish-agent-hint')).toBeInTheDocument();
  });

  it('tovar savatga tushadi va narx kartochkadan keladi', async () => {
    const user = userEvent.setup();
    await openReturnMode(user);
    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));

    const line = await screen.findByTestId('qaytarish-line');
    expect(within(line).getByTestId('qaytarish-line-price').textContent).toContain('10 000');
  });

  it('🔴 tasdiq oynasisiz yuborilmaydi', async () => {
    const user = userEvent.setup();
    await openReturnMode(user);
    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('qaytarish-agent-pick'));
    await user.click(await screen.findByTestId('qaytarish-agent-option-0'));
    await user.click(screen.getByTestId('qaytarish-cash'));

    expect(await screen.findByTestId('qaytarish-confirm')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('tasdiqlangach /pos/returns chaqiriladi (settlement bilan)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ id: 'sr-1', name: 'VP-1', sumMinor: '1000000' });
    await openReturnMode(user);
    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('qaytarish-agent-pick'));
    await user.click(await screen.findByTestId('qaytarish-agent-option-0'));
    await user.click(screen.getByTestId('qaytarish-cash'));
    await user.click(await screen.findByTestId('qaytarish-confirm-ok'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, payload] = vi.mocked(api.post).mock.calls[0] as [string, { settlement: string }];
    expect(url).toBe('/pos/returns');
    expect(payload.settlement).toBe('CASH');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run "src/app/(app)/sotuv/__tests__/qaytarish-mode.test.tsx"`
Expected: FAIL — `pos-mode-qaytarish` topilmaydi.

- [ ] **Step 3: Extend `PosMode` and the sidebar**

`pos-sidebar.tsx`:

```ts
export type PosMode = 'sotuv' | 'navbat' | 'zakazlar' | 'cheklar' | 'mijozlar' | 'smena' | 'qaytarish';
```

ro'yxatga (`cheklar` dan keyin), `Undo2` ikonkasi bilan:

```tsx
    { key: 'qaytarish', icon: Undo2, label: t('sidebar_qaytarish') },
```

va tugmaga `data-test-id={`pos-mode-${item.key}`}` qo'shiladi (agar hali yo'q bo'lsa).

- [ ] **Step 4: Write the mode component**

`qaytarish-mode.tsx` — skelet (savat/setka `sotuv-mode.tsx` dan AYNAN o'sha
komponentlar bilan, faqat rang va tugmalar boshqa):

```tsx
'use client';

import { api } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import type { CartLine } from './pos-types';

/**
 * Kassadagi «Xaridordan qaytarish» — asl cheksiz (spek §5).
 *
 * 🔴 Rangi ATAYLAB «Sotuv»dan boshqa: ikki ekran bir xil ko'rinsa kassir
 * noto'g'ri rejimda ishlab ketadi va sotuv o'rniga qaytarish yozadi.
 */
export function QaytarishMode({ lines, onClear }: { lines: CartLine[]; onClear: () => void }) {
  const [agent, setAgent] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState<'CASH' | 'DEBT' | null>(null);
  // 🔴 syncId savat uchun BIR MARTA yaratiladi: qayta urinishda o'sha qiymat
  // ketadi ⇒ server unikal indeks bilan ikkinchi hujjatni rad etadi.
  const syncId = useRef(crypto.randomUUID());

  const sumMinor = useMemo(
    () => lines.reduce((a, l) => a + l.priceMinor * BigInt(l.quantity), 0n),
    [lines],
  );
  const blocked = !agent || lines.length === 0;

  const submit = useMutation({
    mutationFn: async (settlement: 'CASH' | 'DEBT') =>
      api.post('/pos/returns', {
        agentId: agent?.id,
        organizationId: ORG_ID,
        settlement,
        syncId: syncId.current,
        positions: lines.map((l) => ({
          productId: l.productId,
          quantity: String(l.quantity),
          priceMinor: l.priceMinor.toString(),
        })),
      }),
    onSuccess: () => {
      syncId.current = crypto.randomUUID(); // keyingi qaytarish uchun yangi kalit
      onClear();
    },
  });

  return (
    <div data-test-id="qaytarish-panel" className="border-l-4 border-[var(--ms-destructive-500)]">
      <h2 className="font-bold text-2xl text-[var(--ms-destructive-500)]">{t('qaytarish_title')}</h2>

      {agent ? (
        <button type="button" data-test-id="qaytarish-agent-pick">{agent.name}</button>
      ) : (
        <>
          <button type="button" data-test-id="qaytarish-agent-pick">{t('qaytarish_agent_pick')}</button>
          <p data-test-id="qaytarish-agent-hint">{t('qaytarish_agent_hint')}</p>
        </>
      )}

      {lines.map((l) => (
        <div key={l.productId} data-test-id="qaytarish-line">
          <span>{l.productName}</span>
          <span data-test-id="qaytarish-line-price">{formatMoney(l.priceMinor)}</span>
        </div>
      ))}

      <button type="button" data-test-id="qaytarish-cash" disabled={blocked}
              onClick={() => setPending('CASH')}>{t('qaytarish_cash')}</button>
      <button type="button" data-test-id="qaytarish-debt" disabled={blocked}
              onClick={() => setPending('DEBT')}>{t('qaytarish_debt')}</button>

      {/* 🔴 modal={false} SHART — Radix modal qobiqning ekran klaviaturasini
          o'ldiradi (loyihaning ma'lum bug-klassi). */}
      {pending && (
        <Dialog open modal={false}>
          <div data-test-id="qaytarish-confirm">
            <p>{agent?.name} · {formatMoney(sumMinor)}</p>
            <p>{pending === 'CASH' ? t('qaytarish_confirm_cash') : t('qaytarish_confirm_debt')}</p>
            <button type="button" data-test-id="qaytarish-confirm-ok"
                    onClick={() => submit.mutate(pending)}>{tCommon('confirm')}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
```

🔴 `ORG_ID`, `formatMoney`, `t`, `tCommon`, `Dialog` — `sotuv-mode.tsx` dagi
AYNI manbalardan olinadi (yangi yordamchi yozma). Tovar setkasi, qidiruv va
skaner ham o'sha komponentlar.

- [ ] **Step 5: Add i18n keys**

`uz.json` va `ru.json` ga: `sidebar_qaytarish` · `qaytarish_title` · `qaytarish_agent_hint` · `qaytarish_agent_pick` · `qaytarish_cash` · `qaytarish_debt` · `qaytarish_confirm_title` · `qaytarish_confirm_cash` · `qaytarish_confirm_debt` · `qaytarish_success` · `qaytarish_no_cash`.

- [ ] **Step 6: Run the FULL web suite**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS — yangi `.tsx` konvensiya qo'riqchilarini uyg'otadi, shuning uchun TOR emas TO'LIQ suite.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(app\)/sotuv/_components/qaytarish-mode.tsx apps/web/src/app/\(app\)/sotuv/__tests__/qaytarish-mode.test.tsx apps/web/src/app/\(app\)/sotuv/page.tsx apps/web/src/components/pos/pos-sidebar.tsx apps/web/src/messages/uz.json apps/web/src/messages/ru.json
git commit -m "feat(kassa): POS «Qaytarish» rejimi"
```

---

### Task 9: Naqd yetmasligi — kassirga aniq xabar

**Files:**
- Modify: `apps/api/src/modules/pos-return/pos-return.service.ts`
- Test: `apps/api/src/modules/pos-return/pos-return-cash-guard.test.ts`

**Interfaces:**
- Consumes: `PosReturnService.create` (Task 5)
- Produces: —

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/pos-return/pos-return-cash-guard.test.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosReturnService } from './pos-return.service.js';

/**
 * Spek §10 — eng ehtimolli xato. Kassada 200 000 bor, mijoz 500 000 lik
 * tovar qaytardi. Pul servisi kassani minusga chiqarmaydi, lekin xato matni
 * umumiy bo'lardi. Kassirga MAVJUD SUMMA ko'rinishi shart, aks holda u nima
 * qilishni bilmaydi.
 */
describe('PosReturnService — kassada naqd yetmasligi', () => {
  it('xato matnida mavjud summa KO`RINADI va qaytarish yaratilmaydi', async () => {
    const salesReturn = { postInTx: vi.fn() };
    const cashOut = { postInTx: vi.fn() };
    const client = {
      cashierSession: {
        findFirst: vi.fn(async () => ({ id: 's1', cashDeskId: 'cd-1', storeId: 'st-1' })),
      },
      cashDesk: { findFirst: vi.fn(async () => ({ balanceMinor: 200_000_00n })) },
      $transaction: vi.fn(),
    };
    const svc = new PosReturnService({ client } as never, salesReturn as never, cashOut as never);

    const err = await svc
      .create('acc-1', 'u-1', {
        agentId: '11111111-1111-1111-1111-111111111111',
        organizationId: '22222222-2222-2222-2222-222222222222',
        settlement: 'CASH',
        syncId: '33333333-3333-3333-3333-333333333333',
        positions: [
          { productId: '44444444-4444-4444-4444-444444444444', quantity: '1', priceMinor: '50000000' },
        ],
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain('200 000');
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(salesReturn.postInTx).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return/pos-return-cash-guard.test.ts`
Expected: FAIL — xato otilmaydi.

- [ ] **Step 3: Add the pre-check**

`pos-return.service.ts` da, tranzaksiyadan OLDIN (naqd rejimida):

```ts
    if (plan.cashOutMinor !== null) {
      // Oldindan tekshiruv — pul servisi baribir minusga qo'ymaydi, lekin
      // uning xatosi umumiy. Kassirga MAVJUD summa aytiladi, aks holda u
      // nima qilishni bilmaydi (qarzga yozsinmi? kassaga pul solsinmi?).
      const desk = await this.prisma.client.cashDesk.findFirst({
        where: { id: session.cashDeskId, accountId },
        select: { balanceMinor: true },
      });
      const have = desk?.balanceMinor ?? 0n;
      if (have < plan.cashOutMinor) {
        const fmt = (v: bigint) => (v / 100n).toLocaleString('ru-RU');
        throw new BadRequestException(
          `Kassada ${fmt(have)} so'm bor, ${fmt(plan.cashOutMinor)} so'm chiqara olmaysiz. ` +
            `Qarzga yozing yoki kassaga pul kirim qiling.`,
        );
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/modules/pos-return`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pos-return/
git commit -m "feat(kassa): naqd yetmasa kassirga mavjud summa aytiladi"
```

---

### Task 10: Qaytarish cheki chop etiladi

**Files:**
- Modify: `apps/web/src/app/(app)/sotuv/_components/qaytarish-mode.tsx`
- Modify: `apps/web/src/lib/print-agent.ts`
- Test: `apps/web/src/app/(app)/sotuv/__tests__/qaytarish-print.test.tsx`

**Interfaces:**
- Consumes: `POST /pos/returns` javobi (`{ id, name, sumMinor, cashOutId }`)
- Produces: `printReturnReceiptViaAgent(input): Promise<{ handled: boolean; ok: boolean }>`

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/(app)/sotuv/__tests__/qaytarish-print.test.tsx`:

```tsx
import { printReturnReceiptViaAgent } from '@/lib/print-agent';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { at, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/auth-store', () => ({
  isKioskUser: () => false,
  useAuth: () => ({ user: { id: 'u-1', name: 'Kassir' }, accessToken: 't', initialized: true }),
  getAccessToken: () => 't',
  refresh: async () => false,
}));
vi.mock('@/lib/print-agent', () => ({
  hasNativePrinting: vi.fn(() => false),
  fetchAgentPrinters: vi.fn(async () => []),
  printReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  printReturnReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  vi.mocked(printReturnReceiptViaAgent).mockClear();
});

describe('Qaytarish cheki', () => {
  it('muvaffaqiyatli qaytarishdan keyin chek chop etiladi', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      id: 'sr-1', name: 'VP-2026-00001', sumMinor: '1000000', cashOutId: 'co-1',
    });
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');
    await user.click(screen.getByTestId('pos-mode-qaytarish'));
    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('qaytarish-agent-pick'));
    await user.click(await screen.findByTestId('qaytarish-agent-option-0'));
    await user.click(screen.getByTestId('qaytarish-cash'));
    await user.click(await screen.findByTestId('qaytarish-confirm-ok'));

    await waitFor(() => expect(printReturnReceiptViaAgent).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(printReturnReceiptViaAgent).mock.calls[0]?.[0] as { name: string };
    expect(arg.name).toBe('VP-2026-00001');
  });

  it('🔴 chop yiqilsa qaytarish BEKOR BO`LMAYDI — pul allaqachon berilgan', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ id: 'sr-1', name: 'VP-1', sumMinor: '1000000', cashOutId: null });
    vi.mocked(printReturnReceiptViaAgent).mockRejectedValue(new Error('printer yo`q'));
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');
    await user.click(screen.getByTestId('pos-mode-qaytarish'));
    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('qaytarish-agent-pick'));
    await user.click(await screen.findByTestId('qaytarish-agent-option-0'));
    await user.click(screen.getByTestId('qaytarish-debt'));
    await user.click(await screen.findByTestId('qaytarish-confirm-ok'));

    // Savat baribir bo'shaydi — hujjat serverda o'tgan, chop faqat qog'oz.
    await waitFor(() => expect(screen.queryByTestId('qaytarish-line')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run "src/app/(app)/sotuv/__tests__/qaytarish-print.test.tsx"`
Expected: FAIL — `printReturnReceiptViaAgent` eksport qilinmagan.

- [ ] **Step 3: Add the print helper**

`print-agent.ts` ga — mavjud `printReceiptViaAgent` naqshini AYNAN takrorlab
(uch qatlamli fallback: qobiq → HTTP agent → brauzer), sarlavhasi «QAYTARISH»
va hujjat raqami bilan. 🔴 Yangi renderer YOZMA: chek uch joyda chiziladi
(React · Electron HTML · ESC/POS) va biri o'zgarsa qolgani eskiradi — mavjud
chek shablonini parametr bilan qayta ishlat.

- [ ] **Step 4: Call it after a successful return**

`qaytarish-mode.tsx` → `submit.onSuccess` ichida, savatni tozalashdan OLDIN:

```ts
      // 🔴 Chop yiqilishi qaytarishni BEKOR QILMAYDI — hujjat serverda
      // o'tgan va pul berilgan bo'lishi mumkin. Xato faqat ko'rsatiladi.
      void printReturnReceiptViaAgent({ name: res.name, sumMinor: res.sumMinor, lines })
        .catch(() => toast.error(t('qaytarish_print_failed')));
```

- [ ] **Step 5: Run the FULL web suite**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/print-agent.ts apps/web/src/app/\(app\)/sotuv/
git commit -m "feat(kassa): qaytarish cheki chop etiladi"
```

---

### Task 11: Yakuniy gate va hujjat

**Files:**
- Modify: `NEXT.md`
- Modify: `docs/superpowers/specs/2026-08-16-kassa-xaridordan-qaytarish-design.md` (holat yorlig'i)

- [ ] **Step 1: Run the full gate**

```bash
pnpm typecheck
npx biome check apps/api/src/modules/pos-return apps/web/src/app/\(app\)/sotuv
cd apps/api && pnpm vitest run
cd ../web && pnpm vitest run
```
Expected: typecheck 0 · biome 0 · ikkala suite yashil.

- [ ] **Step 2: Mark the spec**

Spek boshiga: `> Holat: **implementatsiya tugadi (Phase-1)** — brauzer va qurilma QA QILINMAGAN.`

- [ ] **Step 3: Add the NEXT.md entry**

Sana+harf yorlig'i bilan (band harflarni avval `grep` bilan tekshir), tarkibi: nima qurildi, qaysi tasklar, gate natijalari, va **«browser-smoke YO'Q»** ochiq yozuvi.

- [ ] **Step 4: Commit**

```bash
git add NEXT.md docs/superpowers/specs/2026-08-16-kassa-xaridordan-qaytarish-design.md
git commit -m "docs(kassa): qaytarish implementatsiyasi — Phase-1 yakuni"
```

---

## Deploy (alohida qadam, egasining ruxsati bilan)

Migratsiya bor ⇒ `deploy-smart.sh` uni `prisma migrate deploy` bilan qo'llaydi.
🔴 Deploy'dan oldin `df -h /` — disk 94% da edi.

```bash
bash /var/www/sherset-v2/go-deploy.sh   # DS_TARGET=v2 + nohup deploy-smart.sh
```
Keyin: `curl erp.sherset.uz → 200`, `curl :4001/api/v1/health → 200`.
