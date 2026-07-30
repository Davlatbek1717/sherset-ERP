# Faza D1 — Telegram bog'lash poydevori (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Har xodim o'z Telegram akkauntini ERP-dagi Employee bilan bog'lasin (`Employee.telegramChatId`), toki D2/D3'da omborchi/admin unga inline-tugmali xabar olsin.

**Architecture:** ERP «Telegram ulash» → server bir-martalik token yaratadi + `t.me/<botUsername>?start=bind_<token>` deep-link qaytaradi → xodim havolani ochib botni START qiladi → bot `/start bind_<token>` ni tanadi → tokenli Employee'ni topib `telegramChatId = chat.id` saqlaydi → «✅ Ulandi». Bot API `chat_id` — inline-tugma FAQAT shunda ishlaydi.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js App Router (apps/web), mavjud `telegram.service`/`telegram.client`/`telegramConfig`.

## Global Constraints

- **Faqat sherset-v2** (climart-adoption branch); climart VPS READ-ONLY.
- **DI:** `@Inject(Service)` konvensiyasi MAJBURIY (biome `import type`ni DI'da buzadi).
- **Deploy sabog'i:** `migrate deploy` `generate` QILMAYDI — prod'da alohida `prisma generate` + api restart.
- **Gate (majburiy):** api+web typecheck 0 · biome 0 · i18n key-existence ru+uz · api Vitest regressiya yo'q.
- **Status HALOL:** «Phase-1: strukturaviy» — jonli-bot QA D4'gacha yo'q.
- **Bot username manbai:** `TelegramConfig.botUsername` (allaqachon saqlanadi — `getMe` shart emas).

## File Structure

- **Modify** `packages/db/prisma/schema.prisma` — `Employee` modeliga 3 maydon (`telegramChatId`, `telegramBindToken`, `telegramBindTokenExpiresAt`).
- **Create** `packages/db/prisma/migrations/<ts>_add_employee_telegram_chat_id/migration.sql`.
- **Create** `apps/api/src/modules/employee/employee-telegram.service.ts` — token yaratish/uzish + bind-by-token (pure-ish, DB bilan).
- **Create** `apps/api/src/modules/employee/employee-telegram.service.test.ts` — token TTL + bind mantiq (mock tx).
- **Modify** `apps/api/src/modules/employee/employee.controller.ts` (yoki mavjud) — 2 endpoint.
- **Modify** `apps/api/src/modules/telegram/telegram.service.ts` — `handleInbound` message-branch: `/start bind_` handler.
- **Modify** `apps/web/src/app/(app)/settings/employees/…` — «Telegram ulash / Uzish» UI + status.
- **Modify** `apps/web/src/messages/{uz,ru}.json` — yangi kalitlar.

> **Eslatma (Task 3 oldidan tekshir):** `apps/api/src/modules/employee/` aniq nomini + controller mavjudligini
> `ls apps/api/src/modules | grep -i employ` bilan tasdiqla; agar modul nomi boshqa bo'lsa (masalan `hr`/`staff`),
> yo'llarni moslashtir. Employee model `packages/db` sxemasida — bu aniq.

---

### Task 1: Migration — Employee'ga telegram maydonlari

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`model Employee`)
- Create: `packages/db/prisma/migrations/<ts>_add_employee_telegram_chat_id/migration.sql`

**Interfaces:**
- Produces: `Employee.telegramChatId: string | null`, `Employee.telegramBindToken: string | null`, `Employee.telegramBindTokenExpiresAt: Date | null`.

- [ ] **Step 1: Schema — 3 maydon qo'sh** (`model Employee` ichiga):

```prisma
  /// Bot API chat_id — qabul-tasdiqlash inline-tugmalari uchun (D1, 2026-07-30).
  telegramChatId             String?   @map("telegram_chat_id") @db.VarChar(64)
  /// Bir-martalik bog'lash tokeni (/start bind_<token>) + amal muddati.
  telegramBindToken          String?   @unique @map("telegram_bind_token") @db.VarChar(64)
  telegramBindTokenExpiresAt DateTime? @map("telegram_bind_token_expires_at") @db.Timestamptz()
```

- [ ] **Step 2: Migration SQL yoz** (`migration.sql`):

```sql
ALTER TABLE "employees" ADD COLUMN "telegram_chat_id" VARCHAR(64);
ALTER TABLE "employees" ADD COLUMN "telegram_bind_token" VARCHAR(64);
ALTER TABLE "employees" ADD COLUMN "telegram_bind_token_expires_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX "employees_telegram_bind_token_key" ON "employees"("telegram_bind_token");
```

> Jadval nomini tasdiqla: `grep '@@map' -A0 packages/db/prisma/schema.prisma | grep -i employe` (kutilgan `employees`).

- [ ] **Step 3: Lokal generate + migrate** (lokal DB — [[climart-adopt-local-db-untracked]] gotcha'lariga e'tibor):

Run: `cd packages/db && npx prisma migrate dev --name add_employee_telegram_chat_id`
Expected: migration qo'llanadi, client qayta generate bo'ladi, `Employee` tipida yangi maydonlar.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(telegram): employee telegram_chat_id + bind-token migration (D1)"
```

---

### Task 2: employee-telegram.service — token + bind mantiq (TDD)

**Files:**
- Create: `apps/api/src/modules/employee/employee-telegram.service.ts`
- Test: `apps/api/src/modules/employee/employee-telegram.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`, Node `crypto.randomBytes`.
- Produces:
  - `issueBindToken(accountId, employeeId): Promise<{ token: string; deepLink: string | null; expiresAt: Date }>`
  - `unbind(accountId, employeeId): Promise<void>` (telegramChatId = null)
  - `bindByToken(chatId: string, tokenRaw: string): Promise<{ employeeId: string; name: string } | null>` — token→employee (muddat ichida), chatId saqlaydi, tokenni iste'mol qiladi; topilmasa/muddati o'tgan bo'lsa `null`.
  - Pure helper `parseBindToken(text: string): string | null` — `/start bind_<token>` dan `<token>` ni ajratadi (aks holda null). **Bu pure funksiya — testда DB kerak emas.**

- [ ] **Step 1: Failing test — parseBindToken (pure)**

```ts
import { describe, expect, it } from 'vitest';
import { parseBindToken } from './employee-telegram.service.js';

describe('parseBindToken', () => {
  it('/start bind_<token> dan tokenni ajratadi', () => {
    expect(parseBindToken('/start bind_abc123')).toBe('abc123');
  });
  it('bind_ prefiksisiz /start → null', () => {
    expect(parseBindToken('/start')).toBeNull();
    expect(parseBindToken('salom')).toBeNull();
  });
  it("bo'sh token → null", () => {
    expect(parseBindToken('/start bind_')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** — `pnpm --filter @moysklad/api exec vitest run src/modules/employee/employee-telegram.service.test.ts` (parseBindToken aniqlanmagan).

- [ ] **Step 3: Minimal implement — parseBindToken + service skeleti**

```ts
import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

const BIND_PREFIX = '/start bind_';
const TTL_MS = 15 * 60 * 1000;

/** `/start bind_<token>` matnidan tokenni ajratadi (aks holda null). Pure. */
export function parseBindToken(text: string | null | undefined): string | null {
  if (!text || !text.startsWith(BIND_PREFIX)) return null;
  const token = text.slice(BIND_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

@Injectable()
export class EmployeeTelegramService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async issueBindToken(accountId: string, employeeId: string) {
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.prisma.client.employee.update({
      where: { id: employeeId, accountId },
      data: { telegramBindToken: token, telegramBindTokenExpiresAt: expiresAt },
    });
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    const deepLink = cfg?.botUsername ? `https://t.me/${cfg.botUsername}?start=bind_${token}` : null;
    return { token, deepLink, expiresAt };
  }

  async unbind(accountId: string, employeeId: string) {
    await this.prisma.client.employee.update({
      where: { id: employeeId, accountId },
      data: { telegramChatId: null, telegramBindToken: null, telegramBindTokenExpiresAt: null },
    });
  }

  /** Token→employee (muddat ichida) → chatId saqlaydi, tokenni iste'mol qiladi. */
  async bindByToken(chatId: string, tokenRaw: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { telegramBindToken: tokenRaw, telegramBindTokenExpiresAt: { gt: new Date() } },
      select: { id: true, accountId: true, fullName: true },
    });
    if (!emp) return null;
    await this.prisma.client.employee.update({
      where: { id: emp.id },
      data: { telegramChatId: chatId, telegramBindToken: null, telegramBindTokenExpiresAt: null },
    });
    return { employeeId: emp.id, name: emp.fullName };
  }
}
```

> `fullName` — Employee'ning nom-maydonini sxemadan tasdiqla (`grep -A15 'model Employee' … | grep -iE 'name'`); boshqacha bo'lsa (`name`/`firstName`) moslashtir.

- [ ] **Step 4: Run → PASS** (parseBindToken testlari).

- [ ] **Step 5: Failing test — bindByToken (mock prisma)** — muddati o'tgan token → null; amaldagi token → chatId saqlanadi + token null bo'ladi. Mock `prisma.client.employee.findFirst/update` (stock-service test uslubi: `new EmployeeTelegramService({ client: {...} } as never)`).

```ts
it('muddati ichidagi token → chatId saqlanadi, token isteʼmol qilinadi', async () => {
  const updates: unknown[] = [];
  const svc = new EmployeeTelegramService({
    client: {
      employee: {
        findFirst: async () => ({ id: 'e1', accountId: 'a1', fullName: 'Ali' }),
        update: async (args: unknown) => { updates.push(args); return {}; },
      },
    },
  } as never);
  const r = await svc.bindByToken('12345', 'tok');
  expect(r).toEqual({ employeeId: 'e1', name: 'Ali' });
  expect(updates[0]).toMatchObject({ data: { telegramChatId: '12345', telegramBindToken: null } });
});

it('token topilmasa → null', async () => {
  const svc = new EmployeeTelegramService({
    client: { employee: { findFirst: async () => null } },
  } as never);
  expect(await svc.bindByToken('1', 'x')).toBeNull();
});
```

- [ ] **Step 6: Run → PASS** (implement allaqachon yozilgan; agar fail bo'lsa moslashtir).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/employee/employee-telegram.service.ts apps/api/src/modules/employee/employee-telegram.service.test.ts
git commit -m "feat(telegram): employee bind-token service + parseBindToken (D1)"
```

---

### Task 3: Endpointlar + modul DI

**Files:**
- Modify: `apps/api/src/modules/employee/employee.controller.ts` (yoki mavjud controller)
- Modify: `apps/api/src/modules/employee/employee.module.ts` — `EmployeeTelegramService` provider + export

**Interfaces:**
- Consumes: `EmployeeTelegramService` (Task 2).
- Produces (REST):
  - `POST /employees/:id/telegram-bind-token` → `{ deepLink, expiresAt }` (ruxsat: employee `update`).
  - `DELETE /employees/:id/telegram` → `{ ok: true }` (ruxsat: employee `update`).

- [ ] **Step 1: Modulga provider qo'sh** — `@Module({ providers: [EmployeeTelegramService, …], exports: [EmployeeTelegramService] })` (D2/D3 uchun export kerak: telegram modul bind-by-token'ni chaqiradi).

- [ ] **Step 2: Controllerga 2 endpoint** (`@Inject(EmployeeTelegramService)` konvensiya; `@RequirePermission({entity:'employee', action:'update'})` mavjud pattern bo'yicha — tasdiqla):

```ts
@Post(':id/telegram-bind-token')
async issueTelegramBind(@Req() req: AuthedRequest, @Param('id') id: string) {
  return this.employeeTelegram.issueBindToken(req.accountId, id);
}

@Delete(':id/telegram')
async unbindTelegram(@Req() req: AuthedRequest, @Param('id') id: string) {
  await this.employeeTelegram.unbind(req.accountId, id);
  return { ok: true };
}
```

> `AuthedRequest`/`req.accountId`/`@RequirePermission` — controller'dagi MAVJUD endpointlarning aniq uslubini nusxala (guessing YO'Q).

- [ ] **Step 3: api-boot smoke** — `pnpm --filter @moysklad/api exec tsc --noEmit` (0), keyin api ishga tushib 200 berishi (DI sikl yo'qligini tasdiqlaydi).

- [ ] **Step 4: Commit** — `git commit -m "feat(telegram): employee telegram bind/unbind endpoints (D1)"`

---

### Task 4: telegram.service — `/start bind_` handler

**Files:**
- Modify: `apps/api/src/modules/telegram/telegram.service.ts` (`handleInbound` message-branch, ~L354 `autoBind` yonida)
- Modify: `apps/api/src/modules/telegram/telegram.module.ts` — `EmployeeModule` import (agar EmployeeTelegramService export qilingan modul boshqa bo'lsa, o'shani import). Sikl tekshir: employee modul telegram'ni import qilMAsligi kerak.

**Interfaces:**
- Consumes: `EmployeeTelegramService.parseBindToken` + `bindByToken`, `tgSendMessage`.

- [ ] **Step 1: Konstruktorga inject** — `@Inject(EmployeeTelegramService) private readonly employeeTelegram` (supply-approval'ning `@Inject` uslubi kabi — biome `import type` DI'ni buzadi).

- [ ] **Step 2: Message-branch'ga bind handler** (`parsed.text` mavjud joyда, `msg` create'dan keyin, `autoBind`dan OLDIN):

```ts
// ── XODIM TELEGRAM BOG'LASH (/start bind_<token>, D1 2026-07-30) ──────────
const bindToken = parseBindToken(parsed.text);
if (bindToken) {
  const bound = await this.employeeTelegram
    .bindByToken(String(parsed.chatId), bindToken)
    .catch(() => null);
  const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
  if (cfg?.botTokenCipher) {
    await tgSendMessage(decryptPassword(cfg.botTokenCipher), {
      chat_id: String(parsed.chatId),
      text: bound
        ? `✅ Ulandi. Salom, ${bound.name}! Endi qabul-tasdiqlash xabarlari shu chatga keladi.`
        : '⚠️ Havola eskirgan yoki yaroqsiz. ERP\'da «Telegram ulash»ni qayta bosing.',
    }).catch(() => {});
  }
  return { ok: true };
}
```

> `decryptPassword` importi (`../email/crypto.js` — supply-approval.service'dagi kabi) + `parseBindToken`/`EmployeeTelegramService` importlarini qo'sh.

- [ ] **Step 3: Failing/covering test (ixtiyoriy, unit)** — `handleInbound`ni to'liq mock qilish og'ir; MVP'da parseBindToken + bindByToken allaqachon Task 2'da qoplangan. Bu integratsiya D4 jonli-QA'da tasdiqlanadi. (Test yozilsa — `parsed.text='/start bind_x'` bo'lganda `bindByToken` chaqirilishini spy bilan tekshir.)

- [ ] **Step 4: Gate** — api typecheck 0 · biome 0 · to'liq api Vitest regressiya yo'q · api-boot 200 (telegram↔employee DI sikl yo'q).

- [ ] **Step 5: Commit** — `git commit -m "feat(telegram): /start bind_ xodim chat bog'lash handleInbound (D1)"`

---

### Task 5: ERP UI — «Telegram ulash / Uzish»

**Files:**
- Modify: `apps/web/src/app/(app)/settings/employees/…` (ro'yxat yoki detal — MAVJUD tuzilmani ko'r)
- Modify: `apps/web/src/messages/uz.json` + `ru.json`

**Interfaces:**
- Consumes: `POST /employees/:id/telegram-bind-token` → `{ deepLink, expiresAt }`; `DELETE /employees/:id/telegram`.

- [ ] **Step 1: i18n kalitlar** (uz + ru, ikkalasi ham — key-existence gate):

```
settings.employees.telegram_link        uz:"Telegram ulash"        ru:"Привязать Telegram"
settings.employees.telegram_unlink      uz:"Telegram uzish"        ru:"Отвязать Telegram"
settings.employees.telegram_linked      uz:"Ulangan"               ru:"Привязан"
settings.employees.telegram_link_hint   uz:"Havolani xodimga yuboring — u bosib botni ochsin (15 daqiqa amal qiladi)"  ru:"…"
settings.employees.telegram_no_bot      uz:"Avval Sozlamalar → Telegram'da botni ulang"  ru:"…"
```

- [ ] **Step 2: UI — har xodim qatorida holat + tugma**: `telegramChatId` bor bo'lsa «Ulangan ✓ + Uzish»; yo'q bo'lsa «Telegram ulash» → bosilganda token endpoint chaqiriladi → `deepLink` modalda ko'rsatiladi (nusxalash + QR ixtiyoriy). `deepLink === null` bo'lsa `telegram_no_bot` ogohlantirishi. `api.post`/`api.delete` — MAVJUD api-client uslubi; **konkret yo'llar** (contract-guard dinamik segmentni bloklaydi — `api.post('/employees/' + id + '/telegram-bind-token')` konkret literal segment bo'lgani uchun o'tadi, lekin tasdiqla).

- [ ] **Step 3: Gate** — web typecheck 0 · biome 0 · i18n key-existence uz+ru · contract-guard yashil.

- [ ] **Step 4: Commit** — `git commit -m "feat(telegram): employee sozlamada Telegram ulash/uzish UI (D1)"`

---

### Task 6: Deploy + jonli bog'lash smoke (Phase-1→ mini Phase-2)

- [ ] **Step 1: Push** (gh-token, [[sherset-vps-deploy]]).
- [ ] **Step 2: Box fetch/reset → HEAD tasdiqla.**
- [ ] **Step 3: Migration** — `set -a && . apps/api/.env && set +a && cd packages/db && npx prisma migrate deploy` (yangi migration qo'llanadi).
- [ ] **Step 4: `pnpm --filter @moysklad/db generate`** (MUHIM — migrate generate qilmaydi) → **api restart** (`pm2 restart sherset-v2-api`).
- [ ] **Step 5: Web build** (FE o'zgargan) — `pnpm --filter @moysklad/money build && pnpm --filter @moysklad/web build` (nohup) → `pm2 restart sherset-v2-web`.
- [ ] **Step 6: Verify** — erp.sherset.uz 200 · api health 200 · settings/employees'da «Telegram ulash» ko'rinadi · endpoint 200 (deepLink qaytaradi).
- [ ] **Step 7: Jonli bog'lash smoke** (bot sozlangan bo'lsa) — bitta xodim uchun havola → botni START → «✅ Ulandi» + DB'da `telegramChatId` to'ldi. (Bot yo'q bo'lsa — bu D4'ga qoladi, HALOL yozib qo'y.)
- [ ] **Step 8: NEXT.md + MEMORY.md** — D1 tugadi, D2 (omborchi Telegram) navbatда.

---

## Self-Review (yozilgandan keyin)

- **Spec qamrovi:** D1 = spec §«Bosqichlar» 1-band (bog'lash poydevori) — to'liq qoplangan. D2/D3/D4 alohida planlar.
- **Placeholder:** `<ts>` (migration timestamp), `<token>` (runtime) — format placeholder, TODO emas. Employee model nom-maydoni (`fullName`) + modul nomi + `@RequirePermission` uslubi — «tasdiqla» eslatmalari bilan belgilangan (guessing YO'Q).
- **Tip mosligi:** `telegramChatId: string|null` migration↔service↔UI bo'ylab izchil. `bindByToken` chatId'ni `String()` bilan uzatadi (Telegram chat.id BigInt bo'lishi mumkin — VARCHAR ustunga string).
- **Xavf:** DI sikl (telegram↔employee) — employee modul telegram'ni import qilMAsligi kerak (telegram→employee bir yo'nalish). Task 4'da tekshiriladi.
