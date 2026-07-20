# Telegram xabar shablon-kutubxonasi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram qarz-eslatma matnini sozlanadigan **shablon-kutubxonaga** aylantirish (bir nechta nomli shablon, har kanalда default) + tanlangan qarzdorlarga **tanlangan shablon** bilan yuborish. Committed SMS xulqi buzilmaydi.

**Architecture:** Committed `SmsTemplate` → kanal-aware **`MessageTemplate`** (`@@map("sms_templates")` saqlanadi — jadval o'zgarmaydi). `key`-unique olib tashlanadi (kutubxona); `channel`/`isDefault` qo'shiladi. Telegram uchun izolyatsiyalangan MarkdownV2-safe renderer. `sendBulkReminders`/cron default yoki tanlangan shablonni ishlatadi, shablon yo'q bo'lsa **fallback** = joriy hardcoded `reminderMessage`.

**Tech Stack:** NestJS + Prisma + Zod · Eta (izolyatsiyalangan instans) · Next.js App Router + React Query + `@moysklad/ui` · Vitest · next-intl (uz+ru).

## Global Constraints

- **Hamma OPUS'da** (subagent/fan-out ham) — CLAUDE.md §0.
- **Pul = `bigint` minor**, JSON'da string; hech qachon `number`ga aylantirma.
- **Validatsiya = Zod** (controller `@Body() body: unknown`, service `Schema.parse`).
- **Tenant:** har so'rov `accountId`-scoped (`@CurrentUser()` → `user.accountId`, `user.sub`).
- **Ruxsat:** shablon CRUD = `settings/view|update`; bulk yuborish = `debt/update`.
- **i18n:** hardcoded UI matn YO'Q — `messages/ru.json` + `uz.json` (ikkalasi).
- **Commit subject kichik harf** (commitlint `subject-case`); **`git add <aniq yo'l>`** — hech qachon `-A`/`.`; har commitdan oldin `git status --short` bilan staged ro'yxatni tasdiqla.
- **⚠️ PARALLEL-SESSIYA (§6):** barcode/supply uncommitted fayllariga TEGMA — `hr-telegram-bridge/template-render.util.ts`, `hr-notification-dispatcher.*`, `listeners/supply.listener.ts`, `supply.service.ts`, `hr-events.types.ts`, `hr-telegram-login.service.ts`, `telegram-lookup.service.ts`, `product.*`, `store-cell.controller.ts`, `store.schema.ts`, web `cell-labels/page.tsx`, `product-select-modal.tsx`. Bu feature ularga muhtoj EMAS. **Concurrent commit tangle xavfi** (ushbu sessiya guvohi bo'ldi) — commitdan keyin `git show --stat HEAD` bilan mazmunni tekshir.
- **Gate (commit-nuqta):** `pnpm typecheck` 0 · `pnpm lint` 0 · web+api Vitest regressiyasiz.
- **Halollik:** natija **«Phase-1, runtime-unverified»**; real userbot smoke = Phase-2. Migratsiya offline (Postgres o'chiq) → deploy'da `migrate deploy`.
- Spec: [`docs/superpowers/specs/2026-07-20-telegram-message-templates-design.md`](../specs/2026-07-20-telegram-message-templates-design.md).

---

## File Structure

| Fayl | Mas'uliyat | Amal |
|---|---|---|
| `packages/db/prisma/schema.prisma` (+migration) | `SmsTemplate`→`MessageTemplate` (channel/isDefault/key nullable, unique olib tashlash) | Modify |
| `packages/db/prisma/seed.ts` | `debt_reminder` sms → `isDefault=true`; telegram default seed | Modify |
| `apps/api/src/modules/sms/sms-template.schema.ts` | library Zod (channel/isDefault) | Modify |
| `apps/api/src/modules/sms/sms-template.service.ts` (+`.test.ts`) | library CRUD + `findDefault`/`setDefault` + kanal-aware render-validatsiya | Modify |
| `apps/api/src/modules/sms/sms-template.controller.ts` | library REST | Modify |
| `apps/api/src/modules/debt/telegram-template-render.util.ts` (+`.test.ts`) | MarkdownV2-safe Eta render | **Create** |
| `apps/api/src/modules/debt/debt.service.ts` | `sendBulkReminders` TG tarmog'i (templateId+fallback) + `sendTelegramReminder` | Modify |
| `apps/api/src/modules/debt/debt-reminder.service.ts` | cron default TG shabloni | Modify |
| `apps/api/src/modules/debt/debt.schema.ts` | `templateId?` bulk | Modify |
| `apps/web/src/lib/sms-api.ts` (yoki yangi `message-template-api.ts`) | library so'rovlar | Modify |
| `apps/web/src/lib/debt-api.ts` | `bulkReminders(ids, channel, templateId?)` | Modify |
| `apps/web/src/app/(app)/settings/sms/templates/page.tsx` | birlashgan kutubxona UI | Modify |
| `apps/web/src/components/debts/send-reminder-modal.tsx` | shablon-tanlagich | Modify |
| `apps/web/src/messages/{ru,uz}.json` | yangi kalitlar | Modify |

**Tartib:** 1(DB) → 2(renderer) → 3(service) → 4(debt wiring) → 5(api+i18n) → 6(settings UI) → 7(modal picker).

---

## Task 1: DB — `MessageTemplate` (kanal-aware kutubxona)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`model SmsTemplate` ~8041, `Account.smsTemplates` ~162)
- Modify: `packages/db/prisma/seed.ts`
- Create: migration (offline)

**Interfaces:**
- Produces: Prisma `messageTemplate` client; `MessageTemplate { id, accountId, channel, key?, name, body, enabled, isDefault }`, `@@map("sms_templates")`, `@@index([accountId, channel])`.

- [ ] **Step 1: Modelni umumlashtir** (`schema.prisma` — `model SmsTemplate`ni almashtir)

```prisma
/// Editable per-account message templates (multi-purpose LIBRARY, kanal-aware).
/// SMS: plain text. Telegram: GramJS MarkdownV2 (*qalin*/__tagliq__). Eta ({{= }})
/// render. Har kanalда ko'pi bilan bitta `isDefault` (avtomatik-oqim ishlatadi).
model MessageTemplate {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  channel   String   @default("sms") @db.VarChar(16) // 'sms' | 'telegram'
  /// Ixtiyoriy kod-kaliti (eski `debt_reminder` uchun). Kutubxona qatorlarida null.
  key       String?  @db.VarChar(50)
  name      String   @db.VarChar(120)
  body      String   @db.Text
  enabled   Boolean  @default(true)
  isDefault Boolean  @default(false) @map("is_default")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, channel])
  @@map("sms_templates")
}
```
`Account` modelida `smsTemplates SmsTemplate[]` → `messageTemplates MessageTemplate[]` (nom+tur yangilanadi).

- [ ] **Step 2: Seed'ni moslashtir** (`seed.ts` — mavjud `smsTemplate.upsert('debt_reminder')`ni top)

`prisma.smsTemplate` → `prisma.messageTemplate`; mavjud `debt_reminder` create'iga `channel: 'sms', isDefault: true` qo'sh. Keyin **Telegram default** seed qo'sh (idempotent, `key: 'debt_reminder'`, `channel:'telegram'`, `isDefault:true`, body = joriy hardcoded matnning shablon-versiyasi):
```ts
await prisma.messageTemplate.upsert({
  where: { id: `${DEMO_ACCOUNT_ID}-tg-debt` }, // deterministik id (seed idempotent)
  update: {},
  create: {
    id: `${DEMO_ACCOUNT_ID}-tg-debt`,
    accountId: DEMO_ACCOUNT_ID,
    channel: 'telegram',
    key: 'debt_reminder',
    name: 'Qarz eslatmasi (Telegram)',
    isDefault: true,
    enabled: true,
    body:
      "Assalomu alaykum, hurmatli {{= counterparty.name }}!\n\n" +
      "✅ Eslatib o'tamiz, Sizning *__{{= debt.remainingFormatted }}__* so'm miqdorida to'lanmagan qarzingiz mavjud. Iltimos, kelishilgan muddatda qarzdorlikni yopishingizni so'raymiz.\n\n" +
      "📞 *Savollar uchun:* {{= company.phone }}\n💳 *Karta raqam:* {{= company.card }}\n👨‍💻 *Karta egasi:* {{= company.cardOwner }}\n\n" +
      "Qarz - bu omonat, omonatga xiyonat bo'lmasin!\nSHERSET jamoasi!",
  },
});
```
> ⚠️ `{{= counterparty.name }}` qiymati render'da mdSafe-escape bo'ladi (Task 2) — seed body'ida escape QILINMAYDI (u shablon manbasi).

- [ ] **Step 3: Offline migratsiya + client regen** (bu sessiyadagi Task A naqshi)

Lokal Postgres o'chiq → `git show HEAD:packages/db/prisma/schema.prisma > /tmp/old.prisma` (scratchpad) → `prisma migrate diff --from-schema-datamodel /tmp/old.prisma --to-schema-datamodel prisma/schema.prisma --script > migration.sql` → yangi `migrations/<ts>_message_template_library/migration.sql`ga joylashtir (deploy-izoh bilan) → `prisma generate`.
Kutilgan SQL: `ALTER TABLE sms_templates ADD channel/key nullable/is_default; DROP unique sms_templates_account_id_key_key; CREATE INDEX ...channel`. `key` NOT NULL → nullable: `ALTER COLUMN key DROP NOT NULL`.
> Deploy-izoh: mavjud `debt_reminder` sms qatorini `is_default=true`, `channel='sms'`ga yangilash uchun migration oxiriga `UPDATE sms_templates SET is_default=true WHERE key='debt_reminder' AND channel='sms';` qo'sh (data backfill).

- [ ] **Step 4: typecheck (db) + generate tekshiruvi**

Run: `pnpm --filter @moysklad/db exec prisma validate && pnpm --filter @moysklad/db typecheck`
Expected: valid + tc 0. (`grep -rl messageTemplate packages/db/src/generated` — model bor.)

- [ ] **Step 5: Commit (FAQAT packages/db)**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/seed.ts packages/db/prisma/migrations packages/db/src/generated
git status --short   # faqat packages/db
git commit -m "feat(db): MessageTemplate — kanal-aware shablon kutubxonasi (SmsTemplate umumlashtirildi)"
git show --stat HEAD | grep '|'   # tangle tekshiruvi
```

---

## Task 2: Backend — Telegram MarkdownV2-safe renderer

**Files:**
- Create: `apps/api/src/modules/debt/telegram-template-render.util.ts` (+ `.test.ts`)

**Interfaces:**
- Produces: `renderTelegramTemplate(body, ctx): string`; `TelegramTemplateContext` (SMS bilan bir xil shakl); `mdSafeValue(s)` (variable-value escape). O'zgaruvchi qiymatlari MarkdownV2-escape, shablonning literal `*`/`__` o'tadi.

- [ ] **Step 1: Test yoz**

```ts
import { describe, expect, it } from 'vitest';
import { renderTelegramTemplate } from './telegram-template-render.util.js';

const ctx = {
  counterparty: { name: 'Akmal aka' },
  debt: { remainingFormatted: '1 250 000', totalFormatted: '2 000 000' },
  company: { phone: '+998900000000', card: '0000', cardOwner: 'Egasi' },
};

describe('renderTelegramTemplate', () => {
  it("o'zgaruvchini almashtiradi, shablonning *qalin*/__tagliq__ literal o'tadi", () => {
    const out = renderTelegramTemplate(
      'Salom {{= counterparty.name }}, *__{{= debt.remainingFormatted }}__* som',
      ctx,
    );
    expect(out).toBe('Salom Akmal aka, *__1 250 000__* som');
  });
  it("o'zgaruvchi QIYMATIdagi markdown belgisi escape qilinadi (format buzilmaydi)", () => {
    const out = renderTelegramTemplate('Ism: {{= counterparty.name }}', {
      ...ctx,
      counterparty: { name: 'a*b_c' },
    });
    // har maxsus belgidan keyin zero-width space (mdSafe) — displayда bilinmaydi
    expect(out).toContain('a*​b_​c');
  });
});
```

- [ ] **Step 2: Test — FAIL** · Run: `pnpm --filter @moysklad/api exec vitest run src/modules/debt/telegram-template-render.util.test.ts`

- [ ] **Step 3: Util yoz** (mdSafe mavjud `debt-telegram.util.ts`dan takrorlanadi — HR faylga tegmaslik uchun o'z nusxasi)

```ts
import { Eta } from 'eta';

const ZERO_WIDTH_SPACE = '​';
/** Variable QIYMATIdagi MarkdownV2 delimiterlarini zararsizlantiradi (mdSafe). */
export function mdSafeValue(s: string): string {
  return s.replace(/[*_~`|-]/g, (c) => c + ZERO_WIDTH_SPACE);
}

export interface TelegramTemplateContext {
  counterparty: { name: string };
  debt: { remainingFormatted: string; totalFormatted: string };
  company: { phone: string; card: string; cardOwner: string };
}

// SMS render bilan bir xil izolyatsiya intizomi (HR template-render'ga tegmaydi).
const eta = new Eta({
  tags: ['{{', '}}'],
  autoEscape: false,
  autoTrim: false,
  cache: false,
  useWith: true,
});

/** Kontekst string-qiymatlarini mdSafe qiladi, keyin Eta render qiladi. */
export function renderTelegramTemplate(body: string, ctx: TelegramTemplateContext): string {
  const safe: TelegramTemplateContext = {
    counterparty: { name: mdSafeValue(ctx.counterparty.name) },
    debt: {
      remainingFormatted: mdSafeValue(ctx.debt.remainingFormatted),
      totalFormatted: mdSafeValue(ctx.debt.totalFormatted),
    },
    company: {
      phone: mdSafeValue(ctx.company.phone),
      card: mdSafeValue(ctx.company.card),
      cardOwner: mdSafeValue(ctx.company.cardOwner),
    },
  };
  const out = eta.renderString(body, safe as unknown as Record<string, unknown>);
  if (typeof out !== 'string') throw new Error('renderTelegramTemplate: Eta returned non-string');
  return out;
}
```
> `remainingFormatted` bo'sh-joyli raqam (`1 250 000`) — `-` yo'q, escape ta'sir qilmaydi; lekin manfiy/format o'zgarsa xavfsiz.

- [ ] **Step 4: Test — PASS** · **Step 5: Commit**
```bash
git add apps/api/src/modules/debt/telegram-template-render.util.ts apps/api/src/modules/debt/telegram-template-render.util.test.ts
git commit -m "feat(debt): Telegram shablon renderer (MarkdownV2-safe Eta)"
```

---

## Task 3: Backend — MessageTemplate library service + schema + controller

**Files:**
- Modify: `apps/api/src/modules/sms/sms-template.schema.ts`
- Modify: `apps/api/src/modules/sms/sms-template.service.ts` (+ `.test.ts`)
- Modify: `apps/api/src/modules/sms/sms-template.controller.ts`

**Interfaces:**
- Produces:
  - `MessageTemplateService.list(accountId, channel?)`
  - `.findOne(accountId, id)` · `.create(accountId, raw)` · `.update(accountId, id, raw)` · `.remove(accountId, id)`
  - `.findDefault(accountId, channel): Promise<View | null>` (isDefault=true & enabled; yo'q bo'lsa null)
  - `.setDefault(accountId, id)` (tx: kanalda eski defaultни false)
  - `type MessageTemplateView = { id, channel, key, name, body, enabled, isDefault }`
  - REST: `GET /message-templates?channel=`, `POST /message-templates`, `PUT /message-templates/:id`, `DELETE /message-templates/:id`, `PUT /message-templates/:id/default`

- [ ] **Step 1: Zod schema** (`sms-template.schema.ts` — to'liq almashtir)

```ts
import { z } from 'zod';

export const CHANNELS = ['sms', 'telegram'] as const;
export type TemplateChannel = (typeof CHANNELS)[number];

export const CreateMessageTemplateSchema = z.object({
  channel: z.enum(CHANNELS),
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(4096),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
export const UpdateMessageTemplateSchema = CreateMessageTemplateSchema.partial().omit({ channel: true });
export type CreateMessageTemplateInput = z.infer<typeof CreateMessageTemplateSchema>;
```

- [ ] **Step 2: Service testini yoz** (kanal-render-validatsiya + setDefault invariant + findDefault)

```ts
import { describe, expect, it, vi } from 'vitest';
import { MessageTemplateService } from './sms-template.service.js';

function makePrisma(rows: Record<string, unknown>[] = []) {
  const store = [...rows];
  const client = {
    messageTemplate: {
      findMany: vi.fn(async () => store),
      findFirst: vi.fn(async () => store.find((r) => (r as { isDefault?: boolean }).isDefault) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.find((r) => (r as { id: string }).id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'x', ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      delete: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return { client } as never;
}

describe('MessageTemplateService', () => {
  it('create — telegram: MarkdownV2 render-validatsiyadan o\'tadi', async () => {
    const svc = new MessageTemplateService(makePrisma());
    const r = await svc.create('acc', { channel: 'telegram', name: 'Q', body: 'Salom {{= counterparty.name }}', enabled: true, isDefault: false });
    expect(r.channel).toBe('telegram');
  });
  it('create — buzuq o\'zgaruvchi rad etiladi (400)', async () => {
    const svc = new MessageTemplateService(makePrisma());
    await expect(svc.create('acc', { channel: 'sms', name: 'Q', body: '{{= custamer.name }}', enabled: true, isDefault: false })).rejects.toThrow();
  });
  it('findDefault — kanalning default+enabled shablonini qaytaradi', async () => {
    const svc = new MessageTemplateService(makePrisma([{ id: '1', channel: 'telegram', name: 'D', body: 'B', enabled: true, isDefault: true, key: null }]));
    const r = await svc.findDefault('acc', 'telegram');
    expect(r?.id).toBe('1');
  });
});
```

- [ ] **Step 3: Test — FAIL** · Run: `pnpm --filter @moysklad/api exec vitest run src/modules/sms/sms-template.service.test.ts`

- [ ] **Step 4: Service yoz** (`sms-template.service.ts` — to'liq almashtir; klass `MessageTemplateService`)

```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { renderTelegramTemplate } from '../debt/telegram-template-render.util.js';
import { renderSmsTemplate } from './sms-render.util.js';
import {
  CreateMessageTemplateSchema,
  type TemplateChannel,
  UpdateMessageTemplateSchema,
} from './sms-template.schema.js';

const SAMPLE = {
  counterparty: { name: 'Namuna Mijoz' },
  debt: { remainingFormatted: '1 250 000', totalFormatted: '2 000 000' },
  company: { phone: '+998900000000', card: '0000 0000 0000 0000', cardOwner: 'Namuna Egasi' },
};

export interface MessageTemplateView {
  id: string;
  channel: string;
  key: string | null;
  name: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

@Injectable()
export class MessageTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, channel?: TemplateChannel): Promise<MessageTemplateView[]> {
    const rows = await this.prisma.client.messageTemplate.findMany({
      where: { accountId, ...(channel ? { channel } : {}) },
      orderBy: [{ channel: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map(view);
  }

  async findOne(accountId: string, id: string): Promise<MessageTemplateView> {
    const row = await this.prisma.client.messageTemplate.findUnique({ where: { id } });
    if (!row || row.accountId !== accountId) throw new NotFoundException('Shablon topilmadi');
    return view(row);
  }

  /** Avtomatik-oqim uchun — kanalning default + enabled shabloni (yo'q bo'lsa null). */
  async findDefault(accountId: string, channel: TemplateChannel): Promise<MessageTemplateView | null> {
    const row = await this.prisma.client.messageTemplate.findFirst({
      where: { accountId, channel, isDefault: true, enabled: true },
    });
    return row ? view(row) : null;
  }

  async create(accountId: string, raw: unknown): Promise<MessageTemplateView> {
    const p = CreateMessageTemplateSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message).join(', '));
    this.validateBody(p.data.channel, p.data.body);
    return this.prisma.client.$transaction(async (tx) => {
      if (p.data.isDefault) await this.clearDefault(tx, accountId, p.data.channel);
      const row = await tx.messageTemplate.create({
        data: { accountId, channel: p.data.channel, name: p.data.name, body: p.data.body, enabled: p.data.enabled, isDefault: p.data.isDefault },
      });
      return view(row);
    });
  }

  async update(accountId: string, id: string, raw: unknown): Promise<MessageTemplateView> {
    const existing = await this.findOne(accountId, id); // 404 guard
    const p = UpdateMessageTemplateSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message).join(', '));
    if (p.data.body != null) this.validateBody(existing.channel as TemplateChannel, p.data.body);
    return this.prisma.client.$transaction(async (tx) => {
      if (p.data.isDefault) await this.clearDefault(tx, accountId, existing.channel as TemplateChannel);
      const row = await tx.messageTemplate.update({ where: { id }, data: p.data });
      return view(row);
    });
  }

  async setDefault(accountId: string, id: string): Promise<MessageTemplateView> {
    const t = await this.findOne(accountId, id);
    return this.prisma.client.$transaction(async (tx) => {
      await this.clearDefault(tx, accountId, t.channel as TemplateChannel);
      const row = await tx.messageTemplate.update({ where: { id }, data: { isDefault: true } });
      return view(row);
    });
  }

  async remove(accountId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(accountId, id); // 404 guard + tenant
    await this.prisma.client.messageTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private validateBody(channel: TemplateChannel, body: string): void {
    try {
      if (channel === 'telegram') renderTelegramTemplate(body, SAMPLE);
      else renderSmsTemplate(body, SAMPLE);
    } catch {
      throw new BadRequestException(
        "Shablon xato: noto'g'ri o'zgaruvchi yoki tag. Ruxsat: counterparty.name, debt.remainingFormatted, debt.totalFormatted, company.phone, company.card, company.cardOwner",
      );
    }
  }

  private async clearDefault(tx: { messageTemplate: { updateMany: (a: unknown) => Promise<unknown> } }, accountId: string, channel: TemplateChannel) {
    await tx.messageTemplate.updateMany({ where: { accountId, channel, isDefault: true }, data: { isDefault: false } });
  }
}

function view(r: { id: string; channel: string; key: string | null; name: string; body: string; enabled: boolean; isDefault: boolean }): MessageTemplateView {
  return { id: r.id, channel: r.channel, key: r.key, name: r.name, body: r.body, enabled: r.enabled, isDefault: r.isDefault };
}
```
> `$transaction(async (tx) => ...)` — `this.prisma.client.$transaction`. `tx.messageTemplate` interaktiv tranzaksiya klienti. Agar loyihada `this.prisma.client` to'g'ridan-to'g'ri `$transaction`ga ega bo'lmasa (wrapper), mavjud servislardagi tranzaksiya naqshini (`grep -rn '\$transaction' apps/api/src`) ko'r.

- [ ] **Step 5: Test — PASS**

- [ ] **Step 6: Controller yoz** (`sms-template.controller.ts` — to'liq almashtir)

```ts
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CHANNELS, type TemplateChannel } from './sms-template.schema.js';
import { MessageTemplateService } from './sms-template.service.js';

@Controller('message-templates')
@UseGuards(JwtAuthGuard)
export class MessageTemplateController {
  constructor(@Inject(MessageTemplateService) private readonly svc: MessageTemplateService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('channel') channel?: string) {
    const ch = CHANNELS.includes(channel as TemplateChannel) ? (channel as TemplateChannel) : undefined;
    return this.svc.list(user.accountId, ch);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'update' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Put(':id/default')
  @RequirePermission({ entity: 'settings', action: 'update' })
  setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.setDefault(user.accountId, id);
  }

  @Put(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
```
> **Marshrut tartibi:** `:id/default` `:id` dan OLDIN (statik segment). Provider/controller nomini `sms.module.ts`da yangila (`SmsTemplateService`→`MessageTemplateService`, controller nomi).

- [ ] **Step 7: SMS backward-compat — `findByKey` chaqiruvchilarni `findDefault`ga o'tkaz**

`grep -rn "findByKey\|SmsTemplateService" apps/api/src` — `debt.service.ts` `sendBulkReminders` SMS tarmog'i `this.smsTemplates.findByKey(accountId, 'debt_reminder')` → `this.msgTemplates.findDefault(accountId, 'sms')`. `template_disabled` sharti saqlanadi (findDefault enabled bo'lmaganini qaytarmaydi → null → `sms_no_template` reason; test yangilanadi). `sms.module.ts` va inject nomlarini yangila.

- [ ] **Step 8: typecheck + tegishli testlar + commit**

Run: `pnpm --filter @moysklad/api typecheck && pnpm --filter @moysklad/api exec vitest run src/modules/sms`
```bash
git add apps/api/src/modules/sms/sms-template.schema.ts apps/api/src/modules/sms/sms-template.service.ts apps/api/src/modules/sms/sms-template.service.test.ts apps/api/src/modules/sms/sms-template.controller.ts apps/api/src/modules/sms/sms.module.ts
git commit -m "feat(sms): MessageTemplate library service + controller (kanal-aware CRUD)"
```

---

## Task 4: Backend — Telegram shablonni send-oqimiga ulash

**Files:**
- Modify: `apps/api/src/modules/debt/debt.schema.ts` (`templateId?`)
- Modify: `apps/api/src/modules/debt/debt.service.ts` (`sendBulkReminders` TG + `sendTelegramReminder`)
- Modify: `apps/api/src/modules/debt/debt-reminder.service.ts` (cron)
- Modify: `apps/api/src/modules/debt/debt-bulk-reminder.test.ts`

**Interfaces:**
- Consumes: `MessageTemplateService.findDefault/findOne`, `renderTelegramTemplate` (Task 2), `reminderMessage` (fallback).
- Produces: `BulkRemindersSchema` + `templateId?: uuid`; TG tarmog'i tanlangan/default shablonni render qiladi, yo'q bo'lsa `reminderMessage` fallback.

- [ ] **Step 1: `debt.schema.ts` — `templateId` qo'sh**

```ts
export const BulkRemindersSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  channel: z.enum(['sms', 'telegram']),
  templateId: z.string().uuid().optional(),
});
```

- [ ] **Step 2: Testni yangila** (`debt-bulk-reminder.test.ts`) — TG shablon + fallback

Yangi testlar (mavjud `makeDeps`ni `msgTemplates` bilan kengaytir):
```ts
it('Telegram — tanlangan shablon render qilinadi', async () => {
  const { svc, telegram } = makeDeps([debtRow()], { tgDefault: { id: 't1', channel: 'telegram', name: 'D', body: 'Qarz {{= debt.remainingFormatted }}', enabled: true, isDefault: true } });
  await svc.sendBulkReminders('acc', 'u1', { ids: [debtRow().id], channel: 'telegram', templateId: 't1' });
  const sentText = telegram.notifyCounterparty.mock.calls[0][2];
  expect(sentText).toContain('1 250 000'); // rendered
});
it('Telegram — shablon yo\'q: fallback reminderMessage (hardcoded)', async () => {
  const { svc, telegram } = makeDeps([debtRow()], { tgDefault: null });
  await svc.sendBulkReminders('acc', 'u1', { ids: [debtRow().id], channel: 'telegram' });
  const sentText = telegram.notifyCounterparty.mock.calls[0][2];
  expect(sentText).toContain('Assalomu alaykum'); // fallback matn
});
```
`makeDeps`ga `msgTemplates = { findDefault: vi.fn().mockResolvedValue(opts.tgDefault ?? null), findOne: vi.fn().mockResolvedValue(opts.tgDefault ?? null) }` va `DebtService` konstruktoriga qo'shilgan tartibga mos uzat.

- [ ] **Step 3: Test — FAIL**

- [ ] **Step 4: `debt.service.ts` — TG tarmog'ini almashtir**

Konstruktorga `@Inject(MessageTemplateService) private readonly msgTemplates: MessageTemplateService` qo'sh (importi bilan). `sendBulkReminders` `channel==='telegram'` blokini:
```ts
    // channel === 'telegram'
    const contact = await this.sms.getContacts(accountId);
    // Tanlangan (templateId) yoki kanalning default shabloni; yo'q bo'lsa fallback.
    const tpl = templateId
      ? await this.msgTemplates.findOne(accountId, templateId).catch(() => null)
      : await this.msgTemplates.findDefault(accountId, 'telegram');
    for (const d of debts) {
      const name = d.counterparty?.name ?? 'mijoz';
      const remaining = d.totalMinor - d.paidMinor;
      if (remaining <= 0n) { skipped.push({ id: d.id, name, reason: 'no_debt' }); continue; }
      const text =
        tpl && tpl.enabled
          ? renderTelegramTemplate(tpl.body, {
              counterparty: { name },
              debt: { remainingFormatted: formatSomMinor(remaining), totalFormatted: formatSomMinor(d.totalMinor) },
              company: contact,
            })
          : reminderMessage({ name, remainingMinor: remaining, contact }); // fallback
      const res = await this.telegram
        .notifyCounterparty(accountId, d.counterpartyId, text, 'reminder')
        .catch(() => ({ sent: false, reason: 'send_error' }) as { sent: boolean; reason?: string });
      if (res.sent) queued += 1;
      else skipped.push({ id: d.id, name, reason: res.reason ?? 'no_telegram_chat' });
    }
    return { queued, skipped };
```
`const { ids, channel, templateId } = BulkRemindersSchema.parse(raw);` (templateId destructuring). Import: `renderTelegramTemplate`, `MessageTemplateService`. `formatSomMinor` allaqachon import.
> `sendTelegramReminder` (bitta, `debt.service.ts:235`) ham default TG shablonini ishlatsin: `const tpl = await this.msgTemplates.findDefault(accountId, 'telegram'); const text = tpl?.enabled ? renderTelegramTemplate(tpl.body, {...}) : reminderMessage({...})`.

- [ ] **Step 5: `debt-reminder.service.ts` (cron) — default TG shabloni**

`remindDueCalls` loopида `reminderMessage(...)` chaqiruvidan oldin account bo'yicha bir marta `const tpl = await this.msgTemplates.findDefault(accountId, 'telegram')` (mavjud `contactByAccount` map yonida `tplByAccount` map), keyin `const text = tpl?.enabled ? renderTelegramTemplate(tpl.body, ctx) : reminderMessage({...})`. `DebtReminderService` konstruktoriga `MessageTemplateService` inject (DebtModule allaqachon SmsModule import qiladi — `MessageTemplateService` export qilinsin).

- [ ] **Step 6: `debt.module.ts` — `MessageTemplateService` mavjudligini tasdiqla** (SmsModule export qiladi; DebtModule SmsModule import qiladi — Task 3 export'ini tekshir).

- [ ] **Step 7: Test — PASS + typecheck + commit**

Run: `pnpm --filter @moysklad/api typecheck && pnpm --filter @moysklad/api exec vitest run src/modules/debt`
```bash
git add apps/api/src/modules/debt/debt.schema.ts apps/api/src/modules/debt/debt.service.ts apps/api/src/modules/debt/debt-reminder.service.ts apps/api/src/modules/debt/debt-bulk-reminder.test.ts
git commit -m "feat(debt): Telegram eslatma tanlangan/default shablonni ishlatadi (fallback bilan)"
```

---

## Task 5: Frontend — message-template API + i18n

**Files:**
- Modify: `apps/web/src/lib/sms-api.ts` (yoki yangi `message-template-api.ts`)
- Modify: `apps/web/src/lib/debt-api.ts`
- Modify: `apps/web/src/messages/ru.json`, `uz.json`

- [ ] **Step 1: `sms-api.ts`da `listTemplates/saveTemplate`ni library shakliga o'zgartir**

```ts
export interface MessageTemplate { id: string; channel: 'sms' | 'telegram'; key: string | null; name: string; body: string; enabled: boolean; isDefault: boolean }

export const templateApi = {
  list: (channel?: 'sms' | 'telegram') => api.get<MessageTemplate[]>(`/message-templates${channel ? `?channel=${channel}` : ''}`),
  create: (body: { channel: string; name: string; body: string; enabled: boolean; isDefault: boolean }) => api.post<MessageTemplate>('/message-templates', body),
  update: (id: string, body: Partial<{ name: string; body: string; enabled: boolean; isDefault: boolean }>) => api.put<MessageTemplate>(`/message-templates/${id}`, body),
  setDefault: (id: string) => api.put<MessageTemplate>(`/message-templates/${id}/default`, {}),
  remove: (id: string) => api.delete<{ ok: true }>(`/message-templates/${id}`),
};
```
> Eski `smsApi.listTemplates/saveTemplate` chaqiruvchilarini (`grep -rn "listTemplates\|saveTemplate" apps/web/src`) yangi `templateApi`ga o'tkaz.

- [ ] **Step 2: `debt-api.ts` — `bulkReminders`ga `templateId`**

```ts
  bulkReminders: (ids: string[], channel: 'sms' | 'telegram', templateId?: string) =>
    api.post<{ queued: number; skipped: Array<{ id: string; name: string; reason: string }> }>(
      '/debts/reminders/bulk', { ids, channel, ...(templateId ? { templateId } : {}) },
    ),
```

- [ ] **Step 3: i18n kalitlar** (`ru.json` + `uz.json` — `message_templates` namespace)

`uz.json`:
```json
"message_templates": {
  "title": "Xabar shablonlari",
  "description": "SMS va Telegram uchun shablonlar. O'zgaruvchilar: {{= counterparty.name }}, {{= debt.remainingFormatted }}, {{= company.phone }}, {{= company.card }}, {{= company.cardOwner }}",
  "channel": "Kanal", "channel_sms": "SMS", "channel_telegram": "Telegram",
  "name": "Nomi", "body": "Matn", "enabled": "Faol", "is_default": "Asosiy",
  "new": "Yangi shablon", "edit": "Tahrirlash", "delete": "O'chirish",
  "delete_confirm": "Shablon o'chirilsinmi?", "preview": "Ko'rinishi",
  "insert_var": "O'zgaruvchi qo'shish", "set_default": "Asosiy qilish",
  "pick_template": "Shablon", "saved": "Saqlandi"
}
```
`ru.json` — mos rus tarjimalar (title «Шаблоны сообщений» va h.k.). **i18n gate ru+uz ikkalasini talab qiladi.**

- [ ] **Step 4: i18n gate + commit**

Run: `pnpm i18n:gate`
```bash
git add apps/web/src/lib/sms-api.ts apps/web/src/lib/debt-api.ts apps/web/src/messages/ru.json apps/web/src/messages/uz.json
git commit -m "feat(web): message-template library API + i18n"
```

---

## Task 6: Frontend — birlashgan «Xabar shablonlari» sahifasi

**Files:**
- Modify: `apps/web/src/app/(app)/settings/sms/templates/page.tsx`

**Interfaces:** `templateApi` (Task 5). Mavjud sahifaning textarea/preview/variable-inject/segment naqshini QAYTA ISHLAT.

- [ ] **Step 1: Sahifani kutubxonaga aylantir** — chap: shablonlar ro'yxati (kanal-badge + «Asosiy» chip), «Yangi shablon» tugma; o'ng: tanlangan/yangi shablon formasi (kanal select [yangi'da], nom, matn textarea, o'zgaruvchi-qo'shish tugmalari, **preview**, faol checkbox, «Asosiy qilish», Saqlash, O'chirish). React Query: `templateApi.list()`, mutatsiyalar `create/update/setDefault/remove` + `invalidateQueries`.

Namuna struktura (mavjud sahifadan className/`VARS` naqshini oling):
```tsx
'use client';
import { templateApi, type MessageTemplate } from '@/lib/message-template-api'; // yoki sms-api
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const VARS = ['counterparty.name', 'debt.remainingFormatted', 'debt.totalFormatted', 'company.phone', 'company.card', 'company.cardOwner'];

export default function MessageTemplatesPage() {
  const t = useTranslations('message_templates');
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ['message-templates'], queryFn: () => templateApi.list() });
  const [selected, setSelected] = useState<MessageTemplate | 'new' | null>(null);
  // ... form state (channel/name/body/enabled), preview (client-side Eta EMAS — oddiy
  // regex almashtirish namuna qiymatlar bilan yoki backend preview endpoint; MVP:
  // {{= X }}ni namuna qiymatga almashtiruvchi lokal helper), variable-insert, mutatsiyalar.
}
```
> **Preview:** MVP uchun frontend'da `{{= var }}`ni namuna qiymatga almashtiruvchi oddiy helper (Eta importsiz) — Telegram uchun `*`/`__`ni HTML `<b>`/`<u>`ga o'giruvchi yengil ko'rsatuv. (To'liq backend-preview endpoint = ixtiyoriy kelajak.)

- [ ] **Step 2: Web tc + biome + (mavjud bo'lsa) sahifa testi**

Run: `pnpm --filter @moysklad/web typecheck && pnpm exec biome check apps/web/src/app/\(app\)/settings/sms/templates/page.tsx`

- [ ] **Step 3: Commit**
```bash
git add "apps/web/src/app/(app)/settings/sms/templates/page.tsx"
git commit -m "feat(web): birlashgan xabar-shablon kutubxonasi sahifasi (SMS+Telegram)"
```

---

## Task 7: Frontend — send-reminder-modal shablon-tanlagich

**Files:**
- Modify: `apps/web/src/components/debts/send-reminder-modal.tsx`

- [ ] **Step 1: Modalga shablon dropdown qo'sh** — kanal (sms/telegram) tanlanганда `templateApi.list(channel)` bilan shu kanal shablonlari yuklanadi; default oldindan tanlanadi. Yuborishда `debtApi.bulkReminders(ids, channel, templateId)`.

```tsx
const { data: templates = [] } = useQuery({
  queryKey: ['message-templates', channel],
  queryFn: () => templateApi.list(channel),
  enabled: open,
});
const [templateId, setTemplateId] = useState<string | undefined>();
useEffect(() => { setTemplateId(templates.find((x) => x.isDefault)?.id ?? templates[0]?.id); }, [templates]);
// ... <select> {templates.map(...)} · sendMut → bulkReminders(ids, channel, templateId)
```
> Shablon bo'sh bo'lsa (kanalда yo'q) — dropdown yashiriladi, backend fallback ishlaydi (Telegram) yoki `template_disabled` (SMS).

- [ ] **Step 2: Web tc + biome + (mavjud bo'lsa) modal testi**

Run: `pnpm --filter @moysklad/web typecheck`

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/debts/send-reminder-modal.tsx
git commit -m "feat(web): eslatma modalida shablon-tanlagich"
```

---

## Yakuniy gate (Phase-1 tugagach)

- [ ] `pnpm typecheck` 0 · `pnpm lint` 0 · api+web Vitest regressiyasiz · `pnpm i18n:gate` 0.
- [ ] NEXT.md + PARITY-STATUS: **«Telegram xabar-shablon kutubxonasi — Phase-1, runtime-unverified (browser-smoke YO'Q; migratsiya deploy'da apply)»**.
- [ ] **Phase-2 QA (alohida):** real userbot bilan — sozlamada TG shablon yaratish → default belgilash → qarzdorlar tanlab yuborish → mijozда to'g'ri MarkdownV2 ko'rinish; fallback (shablon yo'q); SMS regressiya yo'qligi.

## Self-Review (spec qamrovi)

| Spec talabi | Task |
|---|---|
| Kutubxona (bir nechta shablon) | 1 (model), 3 (CRUD), 6 (UI) |
| Kanal-aware (SMS+Telegram, unify) | 1, 3, 6 |
| Telegram render (MarkdownV2-safe) | 2 |
| Tanlangan qarzdorlarga yuborish | 4 (templateId), 7 (picker) |
| Default + cron/bitta-yuborish | 3 (findDefault), 4 |
| Fallback (backward-compat) | 4 |
| SMS xulqi buzilmaydi | 3 Step-7 (findByKey→findDefault), testlar |
| i18n ru+uz | 5 |
| Parallel-sessiya izolyatsiya | Global Constraints |

**Ochiq nozikliklar (executor hal qiladi):** `$transaction` naqshi loyihada mavjudini tekshir (Task 3 Step-4 eslatma) · frontend preview MVP (Task 6) · `sms.module.ts` export'i (Task 3/4) · `settings/sms/templates` marshrut nomi saqlanadi yoki `message-templates`ga rename (link yangilash).
