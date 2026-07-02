# Analitika — Foundation, Data Model & Sozlamalar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the "Analitika" top-nav section (tab + sub-nav + route skeleton), its 5 Prisma data models, RBAC entity, and a fully working Sozlamalar page (variance thresholds + reason-code CRUD) — the first shippable, testable vertical slice that proves the whole stack end-to-end.

**Architecture:** New `apps/web/src/app/(app)/analitika/*` route group wired into the existing `layout.tsx` nav. New `apps/api/src/modules/analitika/` NestJS module mirrors the `expense-item` module pattern (controller + service + Zod schema + module + vitest). New Prisma models are **additive-only** (plain scalar UUID columns + `@@index`, no `@relation` to core tables) so the migration touches no existing tables. RBAC adds one `analitika` entity reusing the standard action set (view/create/update/delete/approve).

**Tech Stack:** Next.js App Router + next-intl (uz/ru) + @tanstack/react-query + @moysklad/ui · NestJS + Fastify + Zod · Prisma + Postgres · vitest · biome.

**Spec:** `docs/superpowers/specs/2026-05-25-analitika-module-design.md`

---

## File Structure

**Web:**
- `apps/web/src/messages/uz.json` / `ru.json` — add `nav.analitika`, `subnav.analitika.*`, `pages.analitika_settings.*`
- `apps/web/src/app/(app)/layout.tsx` — add NavItem + subnav + active-module wiring
- `apps/web/src/app/(app)/analitika/page.tsx` — Boshqaruv paneli skeleton
- `apps/web/src/app/(app)/analitika/kontragentlar/page.tsx` — skeleton
- `apps/web/src/app/(app)/analitika/mahsulotlar/page.tsx` — skeleton
- `apps/web/src/app/(app)/analitika/buyurtmalar/page.tsx` — skeleton
- `apps/web/src/app/(app)/analitika/inventerizatsiya/page.tsx` — skeleton
- `apps/web/src/app/(app)/analitika/sozlamalar/page.tsx` — **real** (variance + reason codes)

**Design system:**
- `packages/design-system/src/icons/action-icons.ts` — add `analitika` icon

**DB:**
- `packages/db/prisma/schema.prisma` — 5 new models (append at end)

**API:**
- `apps/api/src/modules/permissions/permissions.types.ts` — add `'analitika'` entity
- `apps/api/src/modules/permissions/permissions.service.ts` — add `'analitika'` to entities array
- `apps/api/src/modules/analitika/reason-code.schema.ts` (+ `.test.ts`)
- `apps/api/src/modules/analitika/reason-code.service.ts`
- `apps/api/src/modules/analitika/reason-code.controller.ts`
- `apps/api/src/modules/analitika/variance-config.schema.ts` (+ `.test.ts`)
- `apps/api/src/modules/analitika/variance-config.service.ts`
- `apps/api/src/modules/analitika/variance-config.controller.ts`
- `apps/api/src/modules/analitika/analitika.module.ts`
- `apps/api/src/app.module.ts` — register `AnalitikaModule`

---

### Task 1: i18n keys (uz + ru)

**Files:**
- Modify: `apps/web/src/messages/uz.json` (inside `"nav"` at ~line 324, and `"subnav"` at ~line 326, and `"pages"` at ~line 696)
- Modify: `apps/web/src/messages/ru.json` (same anchors)

- [ ] **Step 1: Add `nav.analitika` to uz.json**

In `uz.json`, change the `"nav"` block's last entry from:
```json
    "hr": "HR",
    "settings": "Sozlamalar"
  },
```
to:
```json
    "hr": "HR",
    "settings": "Sozlamalar",
    "analitika": "Analitika"
  },
```

- [ ] **Step 2: Add `subnav.analitika` block to uz.json**

Inside the `"subnav"` object (right after the opening `"subnav": {` at ~line 326), insert:
```json
    "analitika": {
      "dashboard": "Boshqaruv paneli",
      "counterparties": "Kontragentlar tahlili",
      "products": "Mahsulotlar",
      "orders": "Buyurtmalar",
      "inventory": "Inventerizatsiya",
      "settings": "Sozlamalar"
    },
```

- [ ] **Step 3: Add `pages.analitika_settings` + `pages.analitika_common` to uz.json**

Inside the `"pages"` object (right after `"pages": {` at ~line 696), insert:
```json
    "analitika_common": {
      "soon": "Bu bo'lim tez orada to'ldiriladi"
    },
    "analitika_settings": {
      "title": "Analitika sozlamalari",
      "variance_title": "Farq chegaralari",
      "variance_hint": "Sanashdagi farq foizi qaysi chegaradan boshlab sariq yoki qizil bo'lishini belgilang.",
      "green_max": "Yashil chegarasi (% gacha)",
      "yellow_max": "Sariq chegarasi (% gacha)",
      "save": "Saqlash",
      "saved": "Saqlandi",
      "reason_title": "Sabab kodlari",
      "reason_hint": "Sanashni tasdiqlash yoki rad etishda tanlanadigan sabablar.",
      "reason_add": "Yangi sabab",
      "reason_label": "Sabab nomi",
      "reason_empty": "Hali sabab kodi yo'q",
      "edit": "Tahrirlash",
      "delete": "O'chirish",
      "delete_confirm": "Bu sabab kodini o'chirishni tasdiqlaysizmi?",
      "active": "Faol",
      "cancel": "Bekor qilish"
    },
```

- [ ] **Step 4: Mirror all three into ru.json**

In `ru.json`, apply the same three insertions with Russian values:
```json
    "analitika": "Аналитика"
```
```json
    "analitika": {
      "dashboard": "Панель управления",
      "counterparties": "Анализ контрагентов",
      "products": "Товары",
      "orders": "Заказы",
      "inventory": "Инвентаризация",
      "settings": "Настройки"
    },
```
```json
    "analitika_common": {
      "soon": "Этот раздел скоро будет дополнен"
    },
    "analitika_settings": {
      "title": "Настройки аналитики",
      "variance_title": "Пороги отклонения",
      "variance_hint": "Задайте, с какого процента отклонения счёт становится жёлтым или красным.",
      "green_max": "Граница зелёного (до %)",
      "yellow_max": "Граница жёлтого (до %)",
      "save": "Сохранить",
      "saved": "Сохранено",
      "reason_title": "Коды причин",
      "reason_hint": "Причины, выбираемые при подтверждении или отклонении счёта.",
      "reason_add": "Новая причина",
      "reason_label": "Название причины",
      "reason_empty": "Кодов причин пока нет",
      "edit": "Редактировать",
      "delete": "Удалить",
      "delete_confirm": "Подтвердите удаление этого кода причины?",
      "active": "Активен",
      "cancel": "Отмена"
    },
```

- [ ] **Step 5: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/messages/uz.json','utf8'));JSON.parse(require('fs').readFileSync('apps/web/src/messages/ru.json','utf8'));console.log('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/messages/uz.json apps/web/src/messages/ru.json
git commit -m "feat(analitika): add nav/subnav/settings i18n keys (uz+ru)"
```

---

### Task 2: Analitika nav icon

**Files:**
- Modify: `packages/design-system/src/icons/action-icons.ts:168` (module-level icons block)

- [ ] **Step 1: Map the `analitika` icon**

`ChartBar` is already imported at the top of the file (line ~28), so no new import is needed. In the "Module-level icons" block, change:
```ts
  apps: Puzzle,
  hr: UserCog,
```
to:
```ts
  apps: Puzzle,
  hr: UserCog,
  analitika: ChartBar,
```

- [ ] **Step 2: Verify typecheck of design-system**

Run: `pnpm --filter @moysklad/ui typecheck`
Expected: PASS (0 errors). If the package filter name differs, use `pnpm --filter @moysklad/design-system typecheck`.

- [ ] **Step 3: Commit**

```bash
git add packages/design-system/src/icons/action-icons.ts
git commit -m "feat(analitika): add Analitika nav icon"
```

---

### Task 3: Wire the Analitika tab + sub-nav into the layout

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Add the translations hook**

After the line `const tHr = useTranslations('subnav.hr');` (~line 35) add:
```ts
  const tAnalitika = useTranslations('subnav.analitika');
```

- [ ] **Step 2: Add the NavItem at the end of `moduleNav`**

In the `moduleNav` array, after the `hr` entry object (the one ending `icon: <Icons.hr className={navIconClass} />,\n    },`), add:
```ts
    {
      key: 'analitika',
      label: tNav('analitika'),
      href: '/analitika',
      icon: <Icons.analitika className={navIconClass} />,
    },
```

- [ ] **Step 3: Add the `analitikaSubNav` array**

After the `hrSubNav` array definition (ends `];` near line 340), add:
```ts
  const analitikaSubNav: SubNavItem[] = [
    { key: 'dashboard', label: tAnalitika('dashboard'), href: '/analitika' },
    { key: 'counterparties', label: tAnalitika('counterparties'), href: '/analitika/kontragentlar' },
    { key: 'products', label: tAnalitika('products'), href: '/analitika/mahsulotlar' },
    { key: 'orders', label: tAnalitika('orders'), href: '/analitika/buyurtmalar' },
    { key: 'inventory', label: tAnalitika('inventory'), href: '/analitika/inventerizatsiya' },
    { key: 'settings', label: tAnalitika('settings'), href: '/analitika/sozlamalar' },
  ];
```

- [ ] **Step 4: Add `analitika` to the `activeModule` chain**

In the `activeModule` ternary, replace the tail:
```ts
                            : pathname.startsWith('/hr')
                              ? 'hr'
                              : pathname === '/'
                                ? 'homepage'
                                : null;
```
with:
```ts
                            : pathname.startsWith('/hr')
                              ? 'hr'
                              : pathname.startsWith('/analitika')
                                ? 'analitika'
                                : pathname === '/'
                                  ? 'homepage'
                                  : null;
```

- [ ] **Step 5: Add `analitika` to the `subNavItems` chain**

In the `subNavItems` ternary, replace the tail:
```ts
                            : activeModule === 'hr'
                              ? matchActive(hrSubNav)
                              : null;
```
with:
```ts
                            : activeModule === 'hr'
                              ? matchActive(hrSubNav)
                              : activeModule === 'analitika'
                                ? matchActive(analitikaSubNav)
                                : null;
```

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter @moysklad/web typecheck`
Expected: PASS (0 errors).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(app\)/layout.tsx
git commit -m "feat(analitika): wire Analitika tab and sub-nav into layout"
```

---

### Task 4: Route skeleton pages

These make every sub-nav link resolve (no 404). Five are throwaway placeholders; the sixth (`sozlamalar`) is replaced with real content in Task 15.

**Files:**
- Create: `apps/web/src/app/(app)/analitika/page.tsx`
- Create: `apps/web/src/app/(app)/analitika/kontragentlar/page.tsx`
- Create: `apps/web/src/app/(app)/analitika/mahsulotlar/page.tsx`
- Create: `apps/web/src/app/(app)/analitika/buyurtmalar/page.tsx`
- Create: `apps/web/src/app/(app)/analitika/inventerizatsiya/page.tsx`
- Create: `apps/web/src/app/(app)/analitika/sozlamalar/page.tsx`

- [ ] **Step 1: Create the dashboard skeleton** (`analitika/page.tsx`)

```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function AnalitikaDashboardPage() {
  const tSub = useTranslations('subnav.analitika');
  const tCommon = useTranslations('pages.analitika_common');
  return (
    <div className="p-6">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{tSub('dashboard')}</h1>
      <p className="mt-2 text-[var(--ms-text-muted)] text-sm">{tCommon('soon')}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the four other placeholders**

`analitika/kontragentlar/page.tsx` — same as Step 1 but:
- function `AnalitikaCounterpartiesPage`, heading key `tSub('counterparties')`.

`analitika/mahsulotlar/page.tsx` — function `AnalitikaProductsPage`, key `tSub('products')`.

`analitika/buyurtmalar/page.tsx` — function `AnalitikaOrdersPage`, key `tSub('orders')`.

`analitika/inventerizatsiya/page.tsx` — function `AnalitikaInventoryPage`, key `tSub('inventory')`.

Each file body (substitute NAME and KEY):
```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function NAME() {
  const tSub = useTranslations('subnav.analitika');
  const tCommon = useTranslations('pages.analitika_common');
  return (
    <div className="p-6">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{tSub('KEY')}</h1>
      <p className="mt-2 text-[var(--ms-text-muted)] text-sm">{tCommon('soon')}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create the sozlamalar placeholder** (`analitika/sozlamalar/page.tsx`)

Use the same template, function `AnalitikaSettingsPage`, key `tSub('settings')`. (Replaced in Task 15.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @moysklad/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/analitika
git commit -m "feat(analitika): add route skeleton pages for all sub-nav sections"
```

---

### Task 5: Prisma data models + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append at end of file)

- [ ] **Step 1: Append the 5 models at the end of `schema.prisma`**

```prisma
// =====================================================================
// Analitika module — bolt-on analytics/inventory-counting domain.
// Additive-only: plain scalar UUID columns (no @relation to core tables)
// so migrations never ALTER existing tables. Referential integrity is
// enforced at the application layer. "expectedQty" snapshots Stock at
// count time ("REGOS qoldig'i" in the spec = local stock).
// =====================================================================

model AnalitikaCount {
  id             String    @id @default(uuid()) @db.Uuid
  accountId      String    @map("account_id") @db.Uuid
  productId      String    @map("product_id") @db.Uuid
  storeId        String    @map("store_id") @db.Uuid
  expectedQty    Decimal   @map("expected_qty") @db.Decimal(20, 6)
  kamQty         Decimal   @default(0) @map("kam_qty") @db.Decimal(20, 6)
  kopQty         Decimal   @default(0) @map("kop_qty") @db.Decimal(20, 6)
  netQty         Decimal   @map("net_qty") @db.Decimal(20, 6)
  salePriceMinor BigInt    @map("sale_price_minor")
  status         String    @db.VarChar(10) // green | yellow | red
  decision       String?   @db.VarChar(12) // accepted | rejected | null
  counterId      String    @map("counter_id") @db.Uuid
  countedAt      DateTime  @default(now()) @map("counted_at") @db.Timestamptz()
  reviewerId     String?   @map("reviewer_id") @db.Uuid
  reviewedAt     DateTime? @map("reviewed_at") @db.Timestamptz()
  reasonCodeId   String?   @map("reason_code_id") @db.Uuid
  note           String?

  @@unique([accountId, productId, storeId])
  @@index([accountId, status, countedAt(sort: Desc)])
  @@index([accountId, counterId])
  @@map("analitika_counts")
}

model AnalitikaReasonCode {
  id        String  @id @default(uuid()) @db.Uuid
  accountId String  @map("account_id") @db.Uuid
  label     String  @db.VarChar(100)
  active    Boolean @default(true)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@unique([accountId, label])
  @@index([accountId, active])
  @@map("analitika_reason_codes")
}

model AnalitikaVarianceConfig {
  id           String  @id @default(uuid()) @db.Uuid
  accountId    String  @unique @map("account_id") @db.Uuid
  greenMaxPct  Decimal @default(5) @map("green_max_pct") @db.Decimal(6, 2)
  yellowMaxPct Decimal @default(15) @map("yellow_max_pct") @db.Decimal(6, 2)

  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("analitika_variance_configs")
}

model AnalitikaOrder {
  id             String   @id @default(uuid()) @db.Uuid
  accountId      String   @map("account_id") @db.Uuid
  number         String   @db.VarChar(40)
  counterpartyId String?  @map("counterparty_id") @db.Uuid
  state          String   @default("formed") @db.VarChar(20) // draft | formed | done
  totalMinor     BigInt   @default(0) @map("total_minor")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz()

  lines AnalitikaOrderLine[]

  @@unique([accountId, number])
  @@index([accountId, createdAt(sort: Desc)])
  @@map("analitika_orders")
}

model AnalitikaOrderLine {
  id         String  @id @default(uuid()) @db.Uuid
  orderId    String  @map("order_id") @db.Uuid
  accountId  String  @map("account_id") @db.Uuid
  productId  String  @map("product_id") @db.Uuid
  qty        Decimal @db.Decimal(20, 6)
  priceMinor BigInt  @map("price_minor")
  sumMinor   BigInt  @map("sum_minor")

  order AnalitikaOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([accountId, productId])
  @@map("analitika_order_lines")
}
```

- [ ] **Step 2: Create the migration (DB must be running on :5433)**

Run: `pnpm --filter @moysklad/db exec prisma migrate dev --name analitika_module`
Expected: "Your database is now in sync with your schema." and a new folder under `packages/db/prisma/migrations/`.

- [ ] **Step 3: Generate the client**

Run: `pnpm --filter @moysklad/db generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Typecheck db package**

Run: `pnpm --filter @moysklad/db typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(analitika): add count/reason-code/variance/order Prisma models + migration"
```

---

### Task 6: Register the `analitika` RBAC entity (type)

**Files:**
- Modify: `apps/api/src/modules/permissions/permissions.types.ts:111`

- [ ] **Step 1: Add the entity to the union**

Change the `| 'settings';` line (last entry of `PermissionEntity`) to:
```ts
  | 'settings'
  // Analitika module
  | 'analitika';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS (no consumer breaks — new value is additive).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/permissions/permissions.types.ts
git commit -m "feat(analitika): add 'analitika' permission entity type"
```

---

### Task 7: Seed the `analitika` entity in the permission matrix

**Files:**
- Modify: `apps/api/src/modules/permissions/permissions.service.ts:194-289` (the `entities` array)

- [ ] **Step 1: Read the array to find the exact insertion point**

Run: `sed -n '194,290p' apps/api/src/modules/permissions/permissions.service.ts`
Expected: an array literal `const entities: PermissionEntity[] = [ ... ];` containing `'expenseitem'`, `'auditlog'`, `'settings'`, etc.

- [ ] **Step 2: Append `'analitika'` to the array**

Add `'analitika',` as the final element of the `entities` array (immediately before the closing `];`). Keep the existing comma style.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/permissions/permissions.service.ts
git commit -m "feat(analitika): seed 'analitika' entity into role permission matrix"
```

---

### Task 8: Reason-code Zod schema + tests

**Files:**
- Create: `apps/api/src/modules/analitika/reason-code.schema.ts`
- Test: `apps/api/src/modules/analitika/reason-code.schema.test.ts`

- [ ] **Step 1: Write the failing test**

`reason-code.schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  CreateReasonCodeSchema,
  ReasonCodeFilterSchema,
  UpdateReasonCodeSchema,
} from './reason-code.schema.js';

describe('CreateReasonCodeSchema', () => {
  it('accepts a minimal payload', () => {
    expect(CreateReasonCodeSchema.safeParse({ label: "O'g'irlik" }).success).toBe(true);
  });

  it('rejects an empty label', () => {
    expect(CreateReasonCodeSchema.safeParse({ label: '' }).success).toBe(false);
  });

  it('rejects label > 100 chars', () => {
    expect(CreateReasonCodeSchema.safeParse({ label: 'a'.repeat(101) }).success).toBe(false);
  });

  it('defaults active to true', () => {
    const r = CreateReasonCodeSchema.safeParse({ label: 'Buzilgan' });
    if (!r.success) throw r.error;
    expect(r.data.active).toBe(true);
  });
});

describe('UpdateReasonCodeSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(UpdateReasonCodeSchema.safeParse({}).success).toBe(true);
  });
});

describe('ReasonCodeFilterSchema', () => {
  it('parses activeOnly from string', () => {
    const r = ReasonCodeFilterSchema.safeParse({ activeOnly: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.activeOnly).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/analitika/reason-code.schema.test.ts`
Expected: FAIL — cannot resolve `./reason-code.schema.js`.

- [ ] **Step 3: Write the schema**

`reason-code.schema.ts`:
```ts
import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CreateReasonCodeSchema = z.object({
  label: z.string().min(1).max(100),
  active: z.boolean().default(true),
});
export type CreateReasonCodeInput = z.infer<typeof CreateReasonCodeSchema>;

export const UpdateReasonCodeSchema = CreateReasonCodeSchema.partial();
export type UpdateReasonCodeInput = z.infer<typeof UpdateReasonCodeSchema>;

export const ReasonCodeFilterSchema = z.object({
  activeOnly: boolFromString.optional(),
});
export type ReasonCodeFilterInput = z.infer<typeof ReasonCodeFilterSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/analitika/reason-code.schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analitika/reason-code.schema.ts apps/api/src/modules/analitika/reason-code.schema.test.ts
git commit -m "feat(analitika): reason-code Zod schema + tests"
```

---

### Task 9: Reason-code service

**Files:**
- Create: `apps/api/src/modules/analitika/reason-code.service.ts`

- [ ] **Step 1: Write the service** (mirrors `expense-item.service.ts`)

```ts
import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateReasonCodeInput,
  CreateReasonCodeSchema,
  ReasonCodeFilterSchema,
  type UpdateReasonCodeInput,
  UpdateReasonCodeSchema,
} from './reason-code.schema.js';

const DEFAULT_REASON_CODES = ["O'g'irlik", 'Buzilgan', "Muddati o'tgan", 'Sanab xato qilingan'];

@Injectable()
export class ReasonCodeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ReasonCodeFilterSchema.parse(rawFilter);
    const where: Prisma.AnalitikaReasonCodeWhereInput = {
      accountId,
      ...(filter.activeOnly ? { active: true } : {}),
    };
    const items = await this.prisma.client.analitikaReasonCode.findMany({
      where,
      orderBy: { label: 'asc' },
      take: 200,
    });
    return { items, total: items.length };
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.analitikaReasonCode.create({
        data: { accountId, label: parsed.label, active: parsed.active },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);
    const data: Prisma.AnalitikaReasonCodeUpdateInput = {};
    if (parsed.label !== undefined) data.label = parsed.label;
    if (parsed.active !== undefined) data.active = parsed.active;
    try {
      return await this.prisma.client.analitikaReasonCode.update({
        where: { id, accountId },
        data,
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.analitikaReasonCode.delete({ where: { id, accountId } });
    return { ok: true };
  }

  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.analitikaReasonCode.findFirst({ where: { accountId } });
    if (existing) return;
    for (const label of DEFAULT_REASON_CODES) {
      await this.prisma.client.analitikaReasonCode.create({ data: { accountId, label } });
    }
  }

  private async findById(accountId: string, id: string) {
    const row = await this.prisma.client.analitikaReasonCode.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`ReasonCode ${id} not found`);
    return row;
  }

  private parseCreate(raw: unknown): CreateReasonCodeInput {
    const r = CreateReasonCodeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateReasonCodeInput {
    const r = UpdateReasonCodeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('Bu nomli sabab kodi allaqachon mavjud');
    }
    throw e as Error;
  }
}
```

- [ ] **Step 2: Typecheck** (the model types exist after Task 5's `generate`)

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS. (If `analitikaReasonCode` is missing on the client, re-run `pnpm --filter @moysklad/db generate`.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/analitika/reason-code.service.ts
git commit -m "feat(analitika): reason-code service (CRUD + default seed)"
```

---

### Task 10: Reason-code controller

**Files:**
- Create: `apps/api/src/modules/analitika/reason-code.controller.ts`

- [ ] **Step 1: Write the controller** (mirrors `expense-item.controller.ts`)

```ts
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ReasonCodeService } from './reason-code.service.js';

@Controller('analitika/reason-codes')
@UseGuards(JwtAuthGuard)
export class ReasonCodeController {
  constructor(@Inject(ReasonCodeService) private readonly svc: ReasonCodeService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    await this.svc.seedDefaultsIfEmpty(user.accountId);
    return this.svc.list(user.accountId, query);
  }

  @Post()
  @RequirePermission({ entity: 'analitika', action: 'update' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'analitika', action: 'update' })
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'analitika', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/analitika/reason-code.controller.ts
git commit -m "feat(analitika): reason-code controller"
```

---

### Task 11: Variance-config Zod schema + tests

**Files:**
- Create: `apps/api/src/modules/analitika/variance-config.schema.ts`
- Test: `apps/api/src/modules/analitika/variance-config.schema.test.ts`

- [ ] **Step 1: Write the failing test**

`variance-config.schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { UpdateVarianceConfigSchema } from './variance-config.schema.js';

describe('UpdateVarianceConfigSchema', () => {
  it('accepts valid thresholds', () => {
    const r = UpdateVarianceConfigSchema.safeParse({ greenMaxPct: 5, yellowMaxPct: 15 });
    expect(r.success).toBe(true);
  });

  it('rejects negative percentages', () => {
    expect(UpdateVarianceConfigSchema.safeParse({ greenMaxPct: -1, yellowMaxPct: 15 }).success).toBe(false);
  });

  it('rejects yellowMaxPct <= greenMaxPct', () => {
    expect(UpdateVarianceConfigSchema.safeParse({ greenMaxPct: 20, yellowMaxPct: 10 }).success).toBe(false);
  });

  it('rejects percentages over 100', () => {
    expect(UpdateVarianceConfigSchema.safeParse({ greenMaxPct: 5, yellowMaxPct: 150 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/analitika/variance-config.schema.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the schema**

`variance-config.schema.ts`:
```ts
import { z } from 'zod';

export const UpdateVarianceConfigSchema = z
  .object({
    greenMaxPct: z.number().min(0).max(100),
    yellowMaxPct: z.number().min(0).max(100),
  })
  .refine((v) => v.yellowMaxPct > v.greenMaxPct, {
    message: 'yellowMaxPct must be greater than greenMaxPct',
    path: ['yellowMaxPct'],
  });
export type UpdateVarianceConfigInput = z.infer<typeof UpdateVarianceConfigSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/analitika/variance-config.schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analitika/variance-config.schema.ts apps/api/src/modules/analitika/variance-config.schema.test.ts
git commit -m "feat(analitika): variance-config Zod schema + tests"
```

---

### Task 12: Variance-config service

**Files:**
- Create: `apps/api/src/modules/analitika/variance-config.service.ts`

- [ ] **Step 1: Write the service** (get-or-create defaults; upsert on update)

```ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpdateVarianceConfigSchema } from './variance-config.schema.js';

const DEFAULT_GREEN = 5;
const DEFAULT_YELLOW = 15;

@Injectable()
export class VarianceConfigService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Always returns a config — creates the default row on first read. */
  async get(accountId: string) {
    const existing = await this.prisma.client.analitikaVarianceConfig.findUnique({
      where: { accountId },
    });
    if (existing) return this.serialize(existing);
    const created = await this.prisma.client.analitikaVarianceConfig.create({
      data: { accountId, greenMaxPct: DEFAULT_GREEN, yellowMaxPct: DEFAULT_YELLOW },
    });
    return this.serialize(created);
  }

  async update(accountId: string, raw: unknown) {
    const r = UpdateVarianceConfigSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const row = await this.prisma.client.analitikaVarianceConfig.upsert({
      where: { accountId },
      create: { accountId, greenMaxPct: r.data.greenMaxPct, yellowMaxPct: r.data.yellowMaxPct },
      update: { greenMaxPct: r.data.greenMaxPct, yellowMaxPct: r.data.yellowMaxPct },
    });
    return this.serialize(row);
  }

  // Decimal columns come back as Prisma.Decimal — convert to number for JSON.
  private serialize(row: { id: string; accountId: string; greenMaxPct: unknown; yellowMaxPct: unknown }) {
    return {
      id: row.id,
      accountId: row.accountId,
      greenMaxPct: Number(row.greenMaxPct),
      yellowMaxPct: Number(row.yellowMaxPct),
    };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/analitika/variance-config.service.ts
git commit -m "feat(analitika): variance-config service (get-or-create + upsert)"
```

---

### Task 13: Variance-config controller

**Files:**
- Create: `apps/api/src/modules/analitika/variance-config.controller.ts`

- [ ] **Step 1: Write the controller**

```ts
import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { VarianceConfigService } from './variance-config.service.js';

@Controller('analitika/settings/variance')
@UseGuards(JwtAuthGuard)
export class VarianceConfigController {
  constructor(@Inject(VarianceConfigService) private readonly svc: VarianceConfigService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.get(user.accountId);
  }

  @Put()
  @RequirePermission({ entity: 'analitika', action: 'update' })
  async update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.update(user.accountId, body);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/analitika/variance-config.controller.ts
git commit -m "feat(analitika): variance-config controller"
```

---

### Task 14: Analitika NestJS module + app registration

**Files:**
- Create: `apps/api/src/modules/analitika/analitika.module.ts`
- Modify: `apps/api/src/app.module.ts` (import + `imports: []` array)

- [ ] **Step 1: Write the module**

`analitika.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReasonCodeController } from './reason-code.controller.js';
import { ReasonCodeService } from './reason-code.service.js';
import { VarianceConfigController } from './variance-config.controller.js';
import { VarianceConfigService } from './variance-config.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ReasonCodeController, VarianceConfigController],
  providers: [ReasonCodeService, VarianceConfigService],
  exports: [ReasonCodeService, VarianceConfigService],
})
export class AnalitikaModule {}
```

- [ ] **Step 2: Import it in `app.module.ts`**

Add (alphabetically near the top, after the `AuditLogModule` import line):
```ts
import { AnalitikaModule } from './modules/analitika/analitika.module.js';
```

- [ ] **Step 3: Register it in the `imports` array**

Add `AnalitikaModule,` to the `@Module({ imports: [ ... ] })` array (place it next to other feature modules, e.g. after `AuditLogModule,`).

Run to confirm the array location: `grep -n "AuditLogModule," apps/api/src/app.module.ts`

- [ ] **Step 4: Typecheck + full API tests**

Run: `pnpm --filter @moysklad/api typecheck`
Expected: PASS.
Run: `pnpm --filter @moysklad/api exec vitest run src/modules/analitika`
Expected: PASS (10 tests: 6 reason-code + 4 variance-config).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analitika/analitika.module.ts apps/api/src/app.module.ts
git commit -m "feat(analitika): register AnalitikaModule (reason-codes + variance)"
```

---

### Task 15: Sozlamalar web page (real)

Replaces the Task 4 skeleton with a working variance form + reason-code CRUD calling the new endpoints.

**Files:**
- Modify (overwrite): `apps/web/src/app/(app)/analitika/sozlamalar/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client';

import { api } from '@/lib/api-client';
import { Button, ConfirmDialog, Icons, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface VarianceConfig {
  greenMaxPct: number;
  yellowMaxPct: number;
}
interface ReasonCode {
  id: string;
  label: string;
  active: boolean;
}
interface ReasonListResponse {
  items: ReasonCode[];
  total: number;
}

export default function AnalitikaSettingsPage() {
  const t = useTranslations('pages.analitika_settings');
  const qc = useQueryClient();

  // ---- Variance thresholds ----
  const varianceQuery = useQuery<VarianceConfig>({
    queryKey: ['analitika', 'variance'],
    queryFn: () => api.get<VarianceConfig>('/analitika/settings/variance'),
  });
  const [green, setGreen] = useState('');
  const [yellow, setYellow] = useState('');
  useEffect(() => {
    if (varianceQuery.data) {
      setGreen(String(varianceQuery.data.greenMaxPct));
      setYellow(String(varianceQuery.data.yellowMaxPct));
    }
  }, [varianceQuery.data]);

  const saveVariance = useMutation({
    mutationFn: () =>
      api.put('/analitika/settings/variance', {
        greenMaxPct: Number(green),
        yellowMaxPct: Number(yellow),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analitika', 'variance'] }),
  });

  // ---- Reason codes ----
  const reasonsQuery = useQuery<ReasonListResponse>({
    queryKey: ['analitika', 'reason-codes'],
    queryFn: () => api.get<ReasonListResponse>('/analitika/reason-codes'),
  });
  const [newLabel, setNewLabel] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidateReasons = () =>
    qc.invalidateQueries({ queryKey: ['analitika', 'reason-codes'] });

  const addReason = useMutation({
    mutationFn: () => api.post('/analitika/reason-codes', { label: newLabel.trim() }),
    onSuccess: () => {
      setNewLabel('');
      invalidateReasons();
    },
  });
  const toggleReason = useMutation({
    mutationFn: (r: ReasonCode) => api.patch(`/analitika/reason-codes/${r.id}`, { active: !r.active }),
    onSuccess: invalidateReasons,
  });
  const removeReason = useMutation({
    mutationFn: (id: string) => api.delete(`/analitika/reason-codes/${id}`),
    onSuccess: () => {
      setDeleteId(null);
      invalidateReasons();
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>

      {/* Variance thresholds */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <h2 className="font-medium text-[var(--ms-text-primary)]">{t('variance_title')}</h2>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('variance_hint')}</p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('green_max')}</span>
            <Input
              type="number"
              value={green}
              onChange={(e) => setGreen(e.target.value)}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('yellow_max')}</span>
            <Input
              type="number"
              value={yellow}
              onChange={(e) => setYellow(e.target.value)}
              className="w-40"
            />
          </label>
          <Button onClick={() => saveVariance.mutate()} disabled={saveVariance.isPending}>
            {t('save')}
          </Button>
          {saveVariance.isSuccess && (
            <span className="text-[var(--ms-success-600)] text-sm">{t('saved')}</span>
          )}
        </div>
      </section>

      {/* Reason codes */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <h2 className="font-medium text-[var(--ms-text-primary)]">{t('reason_title')}</h2>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('reason_hint')}</p>

        <div className="mt-4 flex items-center gap-2">
          <Input
            value={newLabel}
            placeholder={t('reason_label')}
            onChange={(e) => setNewLabel(e.target.value)}
            className="max-w-xs"
          />
          <Button
            onClick={() => addReason.mutate()}
            disabled={addReason.isPending || newLabel.trim().length === 0}
          >
            {t('reason_add')}
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-[var(--ms-border)]">
          {(reasonsQuery.data?.items ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span
                className={
                  r.active ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)] line-through'
                }
              >
                {r.label}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[var(--ms-text-muted)] text-xs">
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={() => toggleReason.mutate(r)}
                  />
                  {t('active')}
                </label>
                <button
                  type="button"
                  aria-label={t('delete')}
                  className="text-[var(--ms-text-muted)] hover:text-[var(--ms-destructive-500)]"
                  onClick={() => setDeleteId(r.id)}
                >
                  <Icons.delete className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          {reasonsQuery.data && reasonsQuery.data.items.length === 0 && (
            <li className="py-3 text-[var(--ms-text-muted)] text-sm">{t('reason_empty')}</li>
          )}
        </ul>
      </section>

      <ConfirmDialog
        open={deleteId !== null}
        title={t('delete')}
        message={t('delete_confirm')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => deleteId && removeReason.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the imported UI primitives exist**

Run: `grep -rn "export .*\\b\\(Button\\|Input\\|ConfirmDialog\\)\\b" packages/design-system/src/index.ts`
Expected: all three are exported. If `ConfirmDialog`'s prop names differ (e.g. `description` instead of `message`, `onClose` instead of `onCancel`), adjust the JSX to match its actual signature — check with `grep -rn "interface ConfirmDialog" packages/design-system/src`. Likewise confirm `Icons.delete` exists (`grep -n "delete:" packages/design-system/src/icons/action-icons.ts`); if not, use `Icons.trash`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @moysklad/web typecheck`
Expected: PASS. Fix any prop-name mismatches surfaced here.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/analitika/sozlamalar/page.tsx
git commit -m "feat(analitika): Sozlamalar page — variance thresholds + reason-code CRUD"
```

---

### Task 16: Full gate + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Whole-repo typecheck**

Run: `pnpm typecheck`
Expected: PASS (all packages).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors. Fix any biome findings in the new files (`pnpm lint:fix` for autofixable).

- [ ] **Step 3: Run all API tests**

Run: `pnpm --filter @moysklad/api test`
Expected: existing suite still green + 10 new analitika tests.

- [ ] **Step 4: Manual smoke (real-data gate, CLAUDE.md)**

Start dev (`pnpm dev`), log in as `admin@demo.local` / `admin123`, then:
- Confirm the **Analitika** tab appears last in the top navbar with the chart icon.
- Click it → the 6-item sub-nav renders; each link navigates without a 404.
- Open **Sozlamalar** → variance form loads with defaults 5 / 15; change to 7 / 20, Save → "Saqlandi"; reload → values persisted.
- Add a reason code "Test sabab" → appears in the list; toggle Active off → strikethrough; delete → ConfirmDialog → confirm → removed.
- Adversarial: set green=20, yellow=10 → Save → expect a 400 (server refuses; surface the message, not a generic error). Set yellow=150 → 400.

- [ ] **Step 5: Final commit (if smoke required fixes)**

```bash
git add -A
git commit -m "fix(analitika): address smoke-test findings in foundation slice"
```

---

## Self-Review

**1. Spec coverage (this slice = spec phases P0, P1, P7):**
- Nav tab + sub-nav + i18n + route skeleton + RBAC entity → Tasks 1-4, 6, 7 ✓ (P0)
- 5 Prisma models + migration → Task 5 ✓ (P1)
- Variance thresholds + reason codes (backend + UI) → Tasks 8-15 ✓ (P7)
- Out of scope for this plan (later plans): Inventerizatsiya counting/approval/report (P2-P4), Kontragent analysis + order builder (P5), Mahsulotlar/savat + Buyurtmalar (P6), Dashboard (P8). Tracked in the spec's phase table.

**2. Placeholder scan:** No "TBD"/"implement later". Every code step contains full source. Skeleton pages (Task 4) are intentional, complete files (not placeholders) replaced for `sozlamalar` in Task 15.

**3. Type consistency:**
- Prisma model names used in services match Task 5: `analitikaReasonCode`, `analitikaVarianceConfig` (camelCase client accessors), with `Prisma.AnalitikaReasonCodeWhereInput` / `AnalitikaReasonCodeUpdateInput`.
- Permission entity `'analitika'` defined (Task 6), seeded (Task 7), referenced in both controllers (Tasks 10, 13).
- i18n keys defined in Task 1 (`pages.analitika_settings.*`, `subnav.analitika.*`, `nav.analitika`) match every `useTranslations` call in Tasks 3, 4, 15.
- Endpoint paths consistent: controller `analitika/reason-codes` + `analitika/settings/variance` ↔ web `api.*('/analitika/reason-codes')`, `api.*('/analitika/settings/variance')` (api-client prepends `/api/v1`).

**4. Known verification points (flagged inline, not assumptions):** UI primitive prop names (`ConfirmDialog`, `Input`, `Button`) and `Icons.delete` are verified in Task 15 Step 2 before typecheck; the `permissions.service.ts` entities-array shape is read in Task 7 Step 1 before editing; the `@moysklad/ui` typecheck filter name has a fallback noted in Task 2 Step 2.
