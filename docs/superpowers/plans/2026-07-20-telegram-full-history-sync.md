# Telegram to'liq-tarix sync (Faza-1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qarzdorlar/kontragent/buyurtma panellari mijoz bilan bo'lgan **butun** Telegram dialogini (ikki tomonlama, media bilan, telefondan qo'lda yozilganlar ham) ko'rsatishi — MTProto userbot orqali talab-bo'yicha backfill + ishonchli doimiy sync.

**Architecture:** `TelegramChatMessage` = yagona kanonik transkript. On-demand backfill dvigateli (`getHistory` sahifalab, dedup, media darhol yuklab) + boot'da doimiy kiruvchi-listener (send'ga bog'liq emas) + past-chastotali catch-up. `HrTelegramOutbox` faqat yetkazilmagan chiquvchi overlay bo'lib qoladi.

**Tech Stack:** NestJS + Prisma (`@moysklad/db`) · gramjs (MTProto, `telegram` paketi, faqat `gramjs-client.factory.ts`da) · `@nestjs/schedule` cron · Next.js + TanStack Query (web panel) · Vitest (qo'lda Prisma `vi.fn()` mock + fake `TelegramClientFactory`, DB'siz).

## Global Constraints

- **Hamma OPUS'da**, subagent/fan-out ham (`model:'sonnet'` UZATMA) — CLAUDE.md §0.
- **Parallel-sessiya (CLAUDE.md §6):** `hr-telegram-*` fayllarga boshqa sessiya tegayotgan bo'lishi mumkin. Faqat nomli fayllarni tahrirla; interfeyslarga metod **additiv** qo'sh; `git add -A`/`git commit -a` TAQIQ (hook bloklaydi) — aniq yo'llar bilan stage.
- **Commit subject kichik harf** bilan (commitlint `subject-case`: sentence/pascal-case rad etadi) — masalan `feat(telegram): ...`.
- **Gate (commit-nuqta, markazda):** `pnpm typecheck` 0 · `pnpm lint` (biome) 0 · api+web Vitest regressiya YO'Q.
- **Halollik:** natija **«Phase-1, runtime-unverified»** deb belgilanadi; real userbot smoke = Faza-2 QA. «done/production-ready» deyilmaydi.
- **Media file_reference eskiradi** → backfill/live'da media **darhol** `Attachment`ga yuklab olinadi (lazy EMAS).
- Spec: [`docs/superpowers/specs/2026-07-20-telegram-full-history-sync-design.md`](../specs/2026-07-20-telegram-full-history-sync-design.md).

---

## File Structure

| Fayl | Mas'uliyat | Amal |
|---|---|---|
| `packages/db/prisma/schema.prisma` | `TelegramChat`/`TelegramChatMessage` yangi maydonlar + `TelegramBackfillJob` model + `@@unique` | Modify |
| `apps/api/src/modules/hr/hr-telegram-bridge/telegram-client-factory.ts` | `HistoryMtprotoMessage` + `getHistory` interfeysga (additiv) | Modify |
| `apps/api/src/modules/hr/hr-telegram-bridge/gramjs-client.factory.ts` | `getHistory` real gramjs impl + `resolveGramjsMedia` helper | Modify |
| `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-adapter.ts` | `MtprotoAdapter.fetchHistory` + Noop impl | Modify |
| `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts` | `fetchHistory` (slot-loop) + `OnModuleInit` boot-receivers | Modify |
| `apps/api/src/modules/hr/hr-telegram-account/hr-telegram-account.service.ts` | `listActiveSlots()` (boot uchun) | Modify |
| `apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.ts` | Backfill FSM cron + catch-up cron | **Create** |
| `apps/api/src/modules/hr/hr-telegram-bridge/backfill-plan.util.ts` | Sof funksiyalar: cursor/dedup/direction map (unit-test yadrosi) | **Create** |
| `apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-bridge.module.ts` | Yangi provider'larni ro'yxatga olish | Modify |
| `apps/api/src/modules/telegram/telegram.service.ts` | `counterpartyThread` refaktor (kanonik+overlay+pagination+status) + `requestCounterpartySync` | Modify |
| `apps/api/src/modules/telegram/telegram.controller.ts` | `POST /counterparty/:id/sync` + `before` query | Modify |
| `apps/web/src/components/telegram/order-telegram-panel.tsx` | Backfill-banner + scroll-back + sync-trigger | Modify |
| `apps/web/src/messages/{ru,uz}.json` | `telegram_panel` yangi kalitlar | Modify |

**Bog'liqlik tartibi:** A (schema) → B (factory getHistory) → C (adapter+worker fetchHistory) → D (backfill worker) → E (boot receivers + catch-up) → F (sync endpoint) → G (thread refaktor) → H (panel+i18n). Har task mustaqil testlanadi va commit qilinadi.

---

## Task A: DB sxema — kanonik transkript maydonlari + backfill job

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`TelegramChat` ~8261, `TelegramChatMessage` ~8303)
- Create: migration (prisma generatsiya qiladi)

**Interfaces:**
- Produces: `TelegramChat.historyOldestId/historyComplete/syncNewestId`; `TelegramChatMessage.replyToTgMessageId/editedAt/readByPeerAt/outboxRefId` + `@@unique([chatRefId, tgMessageId])`; yangi model `TelegramBackfillJob`.

- [ ] **Step 1: Sxemaga maydonlar qo'sh**

`TelegramChat` modeliga (mavjud maydonlardan keyin, `@@unique`/`@@index`lardan oldin):
```prisma
  // Backfill/sync kursorlari (2026-07-20 to'liq-tarix)
  historyOldestId  BigInt?  // backfill'da yetilgan eng eski tgMessageId (orqaga sahifalash)
  historyComplete  Boolean  @default(false) // dialog boshiga yetildi
  syncNewestId     BigInt?  // catch-up uchun eng yangi ma'lum tgMessageId
```

`TelegramChatMessage` modeliga (mavjud maydonlardan keyin):
```prisma
  replyToTgMessageId BigInt?   // javob berilgan xabar (Faza-2 uchun oldindan)
  editedAt           DateTime? // Telegram'da tahrirlangan bo'lsa
  readByPeerAt       DateTime? // mijoz o'qigan vaqti (Faza-3 uchun oldindan)
  outboxRefId        String?   // yetkazilgan HrTelegramOutbox qatoriga bog' (dedup)
```
va model ichidagi `@@index([accountId, chatRefId, createdAt(sort: Desc)])` yonida:
```prisma
  @@unique([chatRefId, tgMessageId])
```
> Eslatma: `tgMessageId` `BigInt?` — mavjud NULL qatorlar (Bot API yozganlar) bo'lishi mumkin. Postgres'da `UNIQUE` bir nechta NULL'ga ruxsat beradi, shuning uchun bu xavfsiz; faqat haqiqiy `tgMessageId`li qatorlar dedup qilinadi.

- [ ] **Step 2: Yangi `TelegramBackfillJob` modelini qo'sh** (`TelegramChatMessage`dan keyin)

```prisma
/// Talab-bo'yicha to'liq-tarix backfill navbati (2026-07-20). Panel birinchi
/// ochilganda upsert qilinadi; TelegramBackfillWorker drenaj qiladi.
model TelegramBackfillJob {
  id               String    @id @default(uuid())
  accountId        String
  counterpartyId   String
  phone            String
  status           String    @default("queued") // queued|running|done|error
  requestedAt      DateTime  @default(now())
  startedAt        DateTime?
  finishedAt       DateTime?
  messagesImported Int       @default(0)
  cursorOffsetId   BigInt?   // keyingi sahifa uchun offsetId (0/NULL = eng yangidan)
  failReason       String?

  account      Account      @relation(fields: [accountId], references: [id], onDelete: Cascade)
  counterparty Counterparty @relation("TgBackfillCp", fields: [counterpartyId], references: [id], onDelete: Cascade)

  @@unique([accountId, counterpartyId])
  @@index([status, requestedAt])
  @@map("telegram_backfill_job")
}
```
`Counterparty` modeliga teskari relatsiya qatori qo'sh (mavjud `HrTelegramOutbox` relatsiyalari yonida):
```prisma
  telegramBackfillJobs TelegramBackfillJob[] @relation("TgBackfillCp")
```
`Account` modeliga (agar boshqa Telegram relatsiyalari ro'yxati bo'lsa, yonига):
```prisma
  telegramBackfillJobs TelegramBackfillJob[]
```

- [ ] **Step 3: Migratsiya + client regeneratsiya**

Run: `pnpm --filter @moysklad/db exec prisma migrate dev --name telegram_full_history_sync`
Expected: yangi papka `packages/db/prisma/migrations/<ts>_telegram_full_history_sync/` + `Prisma Client` regeneratsiya.
> Lokal Postgres o'chiq bo'lsa (NEXT.md ogohlantiradi): avval `pnpm --filter @moysklad/db exec prisma migrate diff`dan SQL yozib, keyin DB ko'tarilganda `migrate deploy`. Client'ni baribir regen qil: `pnpm --filter @moysklad/db exec prisma generate`.

- [ ] **Step 4: Typecheck — yangi maydonlar client'da paydo bo'lganini tasdiqla**

Run: `pnpm --filter @moysklad/db typecheck && pnpm --filter @moysklad/api typecheck`
Expected: PASS (0 xato).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/src/generated
git commit -m "feat(telegram): to'liq-tarix uchun sxema — kanonik transkript + backfill job"
```

---

## Task B: Factory `getHistory` — dialog tarixini sahifalab o'qish

**Files:**
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/telegram-client-factory.ts`
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/gramjs-client.factory.ts`
- Test: `apps/api/src/modules/hr/hr-telegram-bridge/backfill-plan.util.test.ts` (B'da direction/kind map sof funksiya sifatida testlanadi)
- Create: `apps/api/src/modules/hr/hr-telegram-bridge/backfill-plan.util.ts`

**Interfaces:**
- Consumes: `TelegramClientHandle`, `IncomingMtprotoMessage` (mavjud).
- Produces: `HistoryMtprotoMessage`; `TelegramClientHandle.getHistory(entity, {limit, offsetId?, minId?}): Promise<HistoryMtprotoMessage[]>`; sof `mapGramjsDirection`, `resolveMediaKind` (util).

- [ ] **Step 1: Sof util testini yoz** (`backfill-plan.util.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { mediaKindFromFlags, olderCursor } from './backfill-plan.util.js';

describe('mediaKindFromFlags', () => {
  it('photo bayrog\'i → photo', () => {
    expect(mediaKindFromFlags({ photo: true })).toEqual({ kind: 'photo', mimeType: 'image/jpeg' });
  });
  it('hech qanday media → text', () => {
    expect(mediaKindFromFlags({})).toEqual({ kind: 'text', mimeType: null });
  });
});

describe('olderCursor — sahifa ichidagi eng kichik tgMessageId', () => {
  it('eng kichik id ni qaytaradi (orqaga sahifalash)', () => {
    expect(olderCursor([{ tgMessageId: 40 }, { tgMessageId: 12 }, { tgMessageId: 33 }])).toBe(12);
  });
  it("bo'sh sahifa → null", () => {
    expect(olderCursor([])).toBeNull();
  });
});
```

- [ ] **Step 2: Test ishlamasligini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/backfill-plan.util.test.ts`
Expected: FAIL — «Cannot find module './backfill-plan.util.js'».

- [ ] **Step 3: `backfill-plan.util.ts` yoz**

```ts
/** Backfill dvigateli uchun DB/gramjs'siz sof yordamchilar (unit-test yadrosi). */

export interface MediaFlags {
  photo?: boolean;
  voice?: boolean;
  video?: boolean;
  document?: boolean;
  documentMime?: string | null;
}

export type MediaKind = 'text' | 'photo' | 'document' | 'voice' | 'video';

/** gramjs Message media-getterlaridan (photo/voice/video/document) kind+mime. */
export function mediaKindFromFlags(f: MediaFlags): { kind: MediaKind; mimeType: string | null } {
  if (f.photo) return { kind: 'photo', mimeType: 'image/jpeg' };
  if (f.voice) return { kind: 'voice', mimeType: 'audio/ogg' };
  if (f.video) return { kind: 'video', mimeType: 'video/mp4' };
  if (f.document) return { kind: 'document', mimeType: f.documentMime ?? 'application/octet-stream' };
  return { kind: 'text', mimeType: null };
}

/** Sahifadagi eng kichik tgMessageId — keyingi (eskiroq) sahifa offsetId'si. */
export function olderCursor(page: { tgMessageId: number }[]): number | null {
  if (page.length === 0) return null;
  return page.reduce((min, m) => (m.tgMessageId < min ? m.tgMessageId : min), page[0].tgMessageId);
}
```

- [ ] **Step 4: Test o'tishini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/backfill-plan.util.test.ts`
Expected: PASS.

- [ ] **Step 5: `HistoryMtprotoMessage` + `getHistory` interfeysga qo'sh** (`telegram-client-factory.ts`, `IncomingMtprotoMessage`dan keyin)

```ts
/**
 * Backfill (dialog tarixi) uchun normalizatsiyalangan xabar — `IncomingMtprotoMessage`
 * bilan bir xil media-yuklash intizomi, LEKIN `direction` bor (tarix ikkala
 * yo'nalishni ham qaytaradi) va `date` (Telegram unix soniyasi, createdAt uchun).
 */
export interface HistoryMtprotoMessage {
  tgMessageId: number;
  direction: 'in' | 'out';
  text: string;
  /** Telegram unix vaqti (soniya) — TelegramChatMessage.createdAt uchun. */
  date: number;
  senderName: string | null;
  fwdFromName: string | null;
  replyToTgMessageId: number | null;
  kind: 'text' | 'photo' | 'document' | 'voice' | 'video';
  mimeType: string | null;
  fileName: string | null;
  downloadMedia: (() => Promise<Buffer>) | null;
}
```
`TelegramClientHandle` interfeysiga (`onIncomingMessage`dan keyin) qo'sh:
```ts
  /**
   * Dialog tarixini sahifalab o'qiydi (yangi→eski). `entity` — `resolvePhone`
   * → `hydrateEntity` natijasi. `offsetId` 0/undefined = eng yangidan; eskiroq
   * sahifa uchun oldingi sahifaning eng kichik `tgMessageId`sini uzat. `minId`
   * > 0 bo'lsa — faqat `minId`dan yangi xabarlar (catch-up). Bizning OWN
   * chiquvchi xabarlarimiz ham qaytadi (`direction:'out'`).
   */
  getHistory(
    entity: unknown,
    opts: { limit: number; offsetId?: number; minId?: number },
  ): Promise<HistoryMtprotoMessage[]>;
```

- [ ] **Step 6: gramjs impl'ni yoz** (`gramjs-client.factory.ts`)

Fayl oxiriga module-level helper qo'sh (mavjud `extractFwdFromName` yonida):
```ts
/** gramjs Message → media kind/mime/fileName (onIncomingMessage bilan bir mantiq). */
function resolveGramjsMedia(msg: Api.Message): {
  kind: IncomingMtprotoMessage['kind'];
  mimeType: string | null;
  fileName: string | null;
} {
  if (msg.photo) return { kind: 'photo', mimeType: 'image/jpeg', fileName: null };
  if (msg.voice) return { kind: 'voice', mimeType: msg.voice.mimeType ?? 'audio/ogg', fileName: null };
  if (msg.videoNote || msg.video) {
    const doc = msg.video ?? msg.videoNote;
    return { kind: 'video', mimeType: doc?.mimeType ?? 'video/mp4', fileName: null };
  }
  if (msg.document) {
    const nameAttr = msg.document.attributes.find(
      (a): a is Api.DocumentAttributeFilename => a.className === 'DocumentAttributeFilename',
    );
    return {
      kind: 'document',
      mimeType: msg.document.mimeType ?? 'application/octet-stream',
      fileName: nameAttr?.fileName ?? null,
    };
  }
  return { kind: 'text', mimeType: null, fileName: null };
}
```
`GramjsClientHandle` sinfiga metod qo'sh (`onIncomingMessage`dan keyin):
```ts
  async getHistory(
    entity: unknown,
    opts: { limit: number; offsetId?: number; minId?: number },
  ): Promise<import('./telegram-client-factory.js').HistoryMtprotoMessage[]> {
    const msgs = await this.client.getMessages(entity as never, {
      limit: opts.limit,
      ...(opts.offsetId ? { offsetId: opts.offsetId } : {}),
      ...(opts.minId ? { minId: opts.minId } : {}),
    });
    const out: import('./telegram-client-factory.js').HistoryMtprotoMessage[] = [];
    for (const msg of msgs) {
      // `getMessages` xizmat-xabarlarni (MessageService) ham qaytarishi mumkin —
      // ularda `.message`/`.text` yo'q; matn ham media ham bo'lmasa o'tkaz.
      const media = resolveGramjsMedia(msg as Api.Message);
      const text = (msg as Api.Message).message ?? '';
      if (!text && media.kind === 'text') continue;
      const m = msg as Api.Message;
      const sender = (await m.getSender().catch(() => undefined)) as Api.User | undefined;
      out.push({
        tgMessageId: m.id,
        direction: m.out ? 'out' : 'in',
        text,
        date: m.date,
        senderName: m.out
          ? null
          : [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || null,
        fwdFromName: extractFwdFromName(m),
        replyToTgMessageId: m.replyTo?.replyToMsgId ?? null,
        kind: media.kind,
        mimeType: media.mimeType,
        fileName: media.fileName,
        downloadMedia:
          media.kind === 'text'
            ? null
            : async () => {
                const data = await m.downloadMedia();
                if (!Buffer.isBuffer(data)) throw new Error('downloadMedia: Buffer kutilgan edi');
                return data;
              },
      });
    }
    return out;
  }
```

- [ ] **Step 7: Typecheck + biome**

Run: `pnpm --filter @moysklad/api typecheck && pnpm exec biome check apps/api/src/modules/hr/hr-telegram-bridge`
Expected: PASS 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/hr/hr-telegram-bridge/telegram-client-factory.ts apps/api/src/modules/hr/hr-telegram-bridge/gramjs-client.factory.ts apps/api/src/modules/hr/hr-telegram-bridge/backfill-plan.util.ts apps/api/src/modules/hr/hr-telegram-bridge/backfill-plan.util.test.ts
git commit -m "feat(telegram): getHistory — dialog tarixini sahifalab o'qish"
```

---

## Task C: Adapter + worker `fetchHistory` — slot-loop bilan tarix olish

**Files:**
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-adapter.ts`
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts`
- Test: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.fetch-history.test.ts`

**Interfaces:**
- Consumes: `TelegramClientHandle.getHistory` (Task B), `HistoryMtprotoMessage`.
- Produces: `MtprotoAdapter.fetchHistory(opts): Promise<{ slot: number; messages: HistoryMtprotoMessage[] }>`; `MtprotoWorkerService.fetchHistory` (implements it), reusing slot-loop + flood + `withTimeout`.

- [ ] **Step 1: Interfeysga qo'sh** (`mtproto-adapter.ts`)

`MtprotoAdapter` interfeysiga:
```ts
  /** Dialog tarixini bitta sahifa oladi (backfill/catch-up). Flood'da MtprotoFloodError. */
  fetchHistory(opts: {
    accountId: string;
    phone: string;
    limit: number;
    offsetId?: number;
    minId?: number;
  }): Promise<{ slot: number; messages: import('./telegram-client-factory.js').HistoryMtprotoMessage[] }>;
```
`NoopMtprotoAdapter`ga (HR_TELEGRAM_DISABLED holati):
```ts
  async fetchHistory(): Promise<{ slot: number; messages: [] }> {
    return { slot: 0, messages: [] };
  }
```

- [ ] **Step 2: Worker testini yoz** (`mtproto-worker.fetch-history.test.ts`)

```ts
import { describe, expect, it, vi } from 'vitest';
import { MtprotoWorkerService } from './mtproto-worker.service.js';

function makeWorker(historyPage: unknown[]) {
  const handle = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isUserAuthorized: vi.fn(async () => true),
    resolvePhone: vi.fn(async () => ({ userId: '42', accessHash: '7' })),
    hydrateEntity: vi.fn((c) => ({ peer: c })),
    getHistory: vi.fn(async () => historyPage),
    onIncomingMessage: vi.fn(),
  };
  const factory = { createClient: vi.fn(() => handle) };
  const accounts = {
    isFlooded: vi.fn(async () => false),
    findActiveBySlot: vi.fn(async (_a: string, slot: number) =>
      slot === 1 ? { apiId: 1, apiHashEncrypted: 'h', sessionEncrypted: 's' } : null,
    ),
    setFloodWaitUntil: vi.fn(),
  };
  const entityCache = { get: vi.fn(async () => null), set: vi.fn(async () => {}) };
  const inbound = { handleIncoming: vi.fn() };
  const svc = new MtprotoWorkerService(
    factory as never,
    accounts as never,
    entityCache as never,
    inbound as never,
  );
  return { svc, handle, factory };
}

// decryptHrSession'ni mock qil (shifrlangan blob'ni ochish talab qilinmasin).
vi.mock('../hr-shared/crypto.util.js', () => ({ decryptHrSession: (v: string) => v }));

describe('MtprotoWorkerService.fetchHistory', () => {
  it('slot-1 klient orqali getHistory sahifasini qaytaradi', async () => {
    const page = [{ tgMessageId: 10, direction: 'out', text: 'salom' }];
    const { svc, handle } = makeWorker(page);
    const res = await svc.fetchHistory({ accountId: 'acc', phone: '+998901234567', limit: 100 });
    expect(res.slot).toBe(1);
    expect(res.messages).toEqual(page);
    expect(handle.getHistory).toHaveBeenCalledWith(
      { peer: { userId: '42', accessHash: '7' } },
      { limit: 100, offsetId: undefined, minId: undefined },
    );
  });
});
```

- [ ] **Step 3: Test ishlamasligini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/mtproto-worker.fetch-history.test.ts`
Expected: FAIL — `svc.fetchHistory is not a function`.

- [ ] **Step 4: `fetchHistory`ni `MtprotoWorkerService`ga qo'sh** (`sendMessage`dan keyin, `resolveEntity`ni qayta ishlatib)

```ts
  async fetchHistory(opts: {
    accountId: string;
    phone: string;
    limit: number;
    offsetId?: number;
    minId?: number;
  }): Promise<{ slot: number; messages: HistoryMtprotoMessage[] }> {
    const errors: Error[] = [];
    for (const slot of MtprotoWorkerService.SLOTS) {
      if (await this.accounts.isFlooded(opts.accountId, slot)) continue;
      try {
        const client = await this.ensureClient(opts.accountId, slot);
        if (!client) continue;
        const entity = await this.resolveEntity(client, opts.accountId, slot, opts.phone);
        const messages = await withTimeout(
          client.getHistory(entity, {
            limit: opts.limit,
            offsetId: opts.offsetId,
            minId: opts.minId,
          }),
          'getHistory',
        );
        return { slot, messages };
      } catch (e) {
        if (isGramjsFloodError(e)) {
          const until = new Date(Date.now() + e.seconds * 1000);
          await this.accounts.setFloodWaitUntil(opts.accountId, slot, until).catch(() => {});
          errors.push(new MtprotoFloodError(slot, e.seconds));
          continue;
        }
        errors.push(e as Error);
        this.logger.warn(
          `fetchHistory failed slot=${slot} acc=${opts.accountId}: ${(e as Error).message}`,
        );
      }
    }
    const flood = errors.find((e): e is MtprotoFloodError => e instanceof MtprotoFloodError);
    if (flood) throw flood;
    throw new Error(
      errors.length === 0
        ? 'mtproto_no_active_slot'
        : `mtproto_history_failed: ${errors.map((e) => e.message).join(' | ')}`.slice(0, 500),
    );
  }
```
Faylning yuqorisidagi importга `HistoryMtprotoMessage` type'ini qo'sh:
```ts
  type HistoryMtprotoMessage,
```
(`telegram-client-factory.js` import bloki ichida.)

- [ ] **Step 5: Test o'tishini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/mtproto-worker.fetch-history.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @moysklad/api typecheck`
```bash
git add apps/api/src/modules/hr/hr-telegram-bridge/mtproto-adapter.ts apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.fetch-history.test.ts
git commit -m "feat(telegram): adapter+worker fetchHistory (slot-loop, flood-aware)"
```

---

## Task D: Backfill worker — talab-bo'yicha to'liq-tarix FSM

**Files:**
- Create: `apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.ts`
- Test: `apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.test.ts`
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-bridge.module.ts`

**Interfaces:**
- Consumes: `MtprotoWorkerService.fetchHistory` (Task C via `MTPROTO_ADAPTER`), `PrismaService`, `AttachmentService`.
- Produces: `TelegramBackfillWorkerService.runOnce(): Promise<{ imported: number; done: number }>`; upserts `TelegramChat`/`TelegramChatMessage` (dedup `@@unique([chatRefId, tgMessageId])`) + advances `TelegramBackfillJob` FSM.

**Konstantalar:** `MAX_PAGES_PER_TICK = 3`, `PAGE_SIZE = 100`.

- [ ] **Step 1: Testni yoz** (queued job → sahifa import + cursor + done)

```ts
import { describe, expect, it, vi } from 'vitest';
import { TelegramBackfillWorkerService } from './telegram-backfill-worker.service.js';

function makePrisma(job: Record<string, unknown> | null) {
  const messages: unknown[] = [];
  return {
    messages,
    client: {
      telegramBackfillJob: {
        findFirst: vi.fn(async () => job),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({})),
      },
      telegramChat: {
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ id: 'chat1' })),
        update: vi.fn(async () => ({})),
      },
      telegramChatMessage: {
        upsert: vi.fn(async (arg: { create: unknown }) => {
          messages.push(arg.create);
          return { id: `m${messages.length}` };
        }),
      },
    },
  };
}

describe('TelegramBackfillWorkerService.runOnce', () => {
  it("queued job → tarix sahifasi import qilinadi, bo'sh keyingi sahifa → done", async () => {
    const prisma = makePrisma({
      id: 'job1',
      accountId: 'acc',
      counterpartyId: 'cp1',
      phone: '+998901234567',
      status: 'queued',
      cursorOffsetId: null,
    });
    // 1-sahifa: 2 xabar; 2-sahifa: bo'sh → historyComplete.
    const adapter = {
      fetchHistory: vi
        .fn()
        .mockResolvedValueOnce({
          slot: 1,
          messages: [
            { tgMessageId: 20, direction: 'out', text: 'a', date: 1700000000, kind: 'text', mimeType: null, fileName: null, senderName: null, fwdFromName: null, replyToTgMessageId: null, downloadMedia: null },
            { tgMessageId: 19, direction: 'in', text: 'b', date: 1699999999, kind: 'text', mimeType: null, fileName: null, senderName: 'Ali', fwdFromName: null, replyToTgMessageId: null, downloadMedia: null },
          ],
        })
        .mockResolvedValueOnce({ slot: 1, messages: [] }),
    };
    const attachments = { createFromBuffer: vi.fn() };
    const svc = new TelegramBackfillWorkerService(prisma as never, adapter as never, attachments as never);

    const res = await svc.runOnce();

    expect(res.imported).toBe(2);
    expect(prisma.messages).toHaveLength(2);
    // done: historyComplete=true + status done
    expect(prisma.client.telegramBackfillJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }),
    );
  });

  it('job yo\'q → hech narsa, imported=0', async () => {
    const prisma = makePrisma(null);
    const adapter = { fetchHistory: vi.fn() };
    const svc = new TelegramBackfillWorkerService(prisma as never, { } as never, attachmentsNoop());
    const res = await svc.runOnce();
    expect(res.imported).toBe(0);
    expect(adapter.fetchHistory).not.toHaveBeenCalled();
  });
});

function attachmentsNoop() {
  return { createFromBuffer: () => {} } as never;
}
```

- [ ] **Step 2: Test ishlamasligini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.test.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 3: `telegram-backfill-worker.service.ts` yoz**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AttachmentService } from '../../attachment/attachment.service.js';
import { MTPROTO_ADAPTER, type MtprotoAdapter, isMtprotoFloodError } from './mtproto-adapter.js';
import { olderCursor } from './backfill-plan.util.js';

/**
 * Talab-bo'yicha to'liq-tarix backfill (2026-07-20). Panel `POST
 * /counterparty/:id/sync` bilan `TelegramBackfillJob` qo'yadi; bu worker
 * har 20s bitta `queued` job'ni oladi va dialog tarixini sahifalab
 * (yangi→eski) `TelegramChatMessage`ga yozadi (dedup `@@unique`).
 * Har tick faqat N sahifa (klientni uzoq ushlamaslik + flood hurmati) —
 * qolgani job 'queued' holida keyingi tick'ga qoladi. Dialog boshiga
 * yetganda `historyComplete=true`, job='done'.
 */
@Injectable()
export class TelegramBackfillWorkerService {
  private readonly logger = new Logger(TelegramBackfillWorkerService.name);
  private static readonly MAX_PAGES_PER_TICK = 3;
  private static readonly PAGE_SIZE = 100;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MTPROTO_ADAPTER) private readonly adapter: MtprotoAdapter,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  @Cron('*/20 * * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`Backfill tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<{ imported: number; done: number }> {
    const job = await this.prisma.client.telegramBackfillJob.findFirst({
      where: { status: 'queued' },
      orderBy: { requestedAt: 'asc' },
    });
    if (!job) return { imported: 0, done: 0 };

    // Atomik claim: queued → running (parallel instansiya poygasi).
    const claim = await this.prisma.client.telegramBackfillJob.updateMany({
      where: { id: job.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });
    if (claim.count === 0) return { imported: 0, done: 0 };

    let imported = 0;
    let offsetId = job.cursorOffsetId ? Number(job.cursorOffsetId) : undefined;
    let complete = false;
    try {
      for (let page = 0; page < TelegramBackfillWorkerService.MAX_PAGES_PER_TICK; page++) {
        const { messages } = await this.adapter.fetchHistory({
          accountId: job.accountId,
          phone: job.phone,
          limit: TelegramBackfillWorkerService.PAGE_SIZE,
          offsetId,
        });
        if (messages.length === 0) {
          complete = true;
          break;
        }
        const chat = await this.ensureChat(job.accountId, job.counterpartyId, job.phone);
        for (const m of messages) {
          const created = await this.prisma.client.telegramChatMessage.upsert({
            where: { chatRefId_tgMessageId: { chatRefId: chat.id, tgMessageId: BigInt(m.tgMessageId) } },
            update: {},
            create: {
              accountId: job.accountId,
              chatRefId: chat.id,
              direction: m.direction,
              text: m.text.slice(0, 4096),
              tgMessageId: BigInt(m.tgMessageId),
              senderName: m.senderName,
              kind: m.kind,
              mimeType: m.mimeType,
              fileName: m.fileName,
              fwdFromName: m.fwdFromName,
              replyToTgMessageId:
                m.replyToTgMessageId != null ? BigInt(m.replyToTgMessageId) : null,
              createdAt: new Date(m.date * 1000),
            },
          });
          imported++;
          if (m.downloadMedia) {
            await this.storeMedia(job.accountId, created.id, m).catch((e: Error) =>
              this.logger.warn(`backfill media saqlanmadi: ${e.message}`),
            );
          }
        }
        const oldest = olderCursor(messages.map((m) => ({ tgMessageId: m.tgMessageId })));
        offsetId = oldest ?? offsetId;
        await this.prisma.client.telegramChat.update({
          where: { id: chat.id },
          data: { historyOldestId: offsetId != null ? BigInt(offsetId) : undefined },
        });
        if (messages.length < TelegramBackfillWorkerService.PAGE_SIZE) {
          complete = true;
          break;
        }
      }

      await this.prisma.client.telegramBackfillJob.update({
        where: { id: job.id },
        data: {
          status: complete ? 'done' : 'queued',
          cursorOffsetId: offsetId != null ? BigInt(offsetId) : null,
          messagesImported: { increment: imported },
          ...(complete ? { finishedAt: new Date() } : {}),
        },
      });
      if (complete) {
        await this.markChatComplete(job.accountId, job.counterpartyId);
      }
      return { imported, done: complete ? 1 : 0 };
    } catch (e) {
      const flood = isMtprotoFloodError(e);
      await this.prisma.client.telegramBackfillJob.update({
        where: { id: job.id },
        // Flood → keyin qayta urinish uchun 'queued'; boshqa xato → 'error'.
        data: flood
          ? { status: 'queued', requestedAt: new Date(Date.now() + 60_000) }
          : { status: 'error', failReason: `${(e as Error).message}`.slice(0, 500) },
      });
      this.logger.warn(`Backfill job ${job.id} ${flood ? 'flood→requeue' : 'error'}: ${(e as Error).message}`);
      return { imported, done: 0 };
    }
  }

  private async ensureChat(accountId: string, counterpartyId: string, phone: string) {
    const existing = await this.prisma.client.telegramChat.findFirst({
      where: { accountId, counterpartyId },
      select: { id: true },
    });
    if (existing) return existing;
    // Bog'langan chat yo'q — backfill uchun counterparty bo'yicha yaratamiz.
    return this.prisma.client.telegramChat.upsert({
      where: { accountId_counterpartyId: { accountId, counterpartyId } },
      update: {},
      create: {
        accountId,
        // chatId noma'lum (hali xabar kelmagan) → phone-hash sentinel EMAS;
        // counterparty bo'yicha yagona bog'liq chat sifatida ochamiz. Kiruvchi
        // kelganда handleIncoming haqiqiy chatId bilan alohida chat ochishi
        // mumkin; catch-up/merge counterpartyId bo'yicha ishlaydi (thread query
        // counterpartyId bo'yicha oxirgisini oladi).
        chatId: BigInt(0),
        phone,
        source: 'mtproto',
        counterpartyId,
        boundBy: 'auto',
        lastMessageAt: new Date(),
      },
    });
  }

  private async markChatComplete(accountId: string, counterpartyId: string): Promise<void> {
    await this.prisma.client.telegramChat.updateMany({
      where: { accountId, counterpartyId },
      data: { historyComplete: true },
    });
  }

  private async storeMedia(
    accountId: string,
    messageId: string,
    m: { downloadMedia: (() => Promise<Buffer>) | null; fileName: string | null; mimeType: string | null },
  ): Promise<void> {
    if (!m.downloadMedia) return;
    const buffer = await m.downloadMedia();
    const attachment = await this.attachments.createFromBuffer(accountId, null, {
      entity: 'TelegramChatMessage',
      entityId: messageId,
      filename: m.fileName ?? 'telegram-file',
      mime: m.mimeType ?? 'application/octet-stream',
      buffer,
      description: 'Telegram chat — backfill fayli (MTProto)',
    });
    await this.prisma.client.telegramChatMessage.update({
      where: { id: messageId },
      data: { attachmentId: attachment.id },
    });
  }
}
```
> ⚠️ **Grounding TODO (executor):** `telegramChat` uchun `@@unique([accountId, counterpartyId])` sxemada YO'Q (hozir `@@unique([accountId, chatId])` bor). `ensureChat` upsert'i uchun **A-task'ga `@@unique([accountId, counterpartyId])` qo'sh** (yoki `ensureChat`ni `findFirst`+`create` shakliga o'zgartir). Rejaga sodiq: A-task Step-1'ga shu unique'ni qo'shish afzal — chunki thread query ham counterparty bo'yicha yagona chatni kutadi.

- [ ] **Step 4: A-task sxemasiga counterparty-unique qo'sh** (yuqoridagi TODO)

`TelegramChat` modeliga: `@@unique([accountId, counterpartyId])` — va bu `counterpartyId` NULL bo'lishi mumkinligini hisobga ol (Postgres multi-NULL OK). Migratsiyani yangilab regen qil.

- [ ] **Step 5: Test o'tishini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.test.ts`
Expected: PASS (test mock'idagi `telegramChatMessage.upsert` `where: { chatRefId_tgMessageId }` shape'ini qabul qilishi uchun mock'ni moslashtir — `upsert: vi.fn(async (arg) => { messages.push(arg.create); return {...} })` allaqachon shunday).

- [ ] **Step 6: Provider'ni modulega ro'yxatga ol** (`hr-telegram-bridge.module.ts`)

`providers` massiviga `TelegramBackfillWorkerService` qo'sh; `AttachmentModule`ni `imports`ga qo'sh (agar yo'q bo'lsa — `AttachmentService`ni olish uchun; `telegram.module.ts`da mavjud namunani ko'chir).

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @moysklad/api typecheck`
```bash
git add apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.ts apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.test.ts apps/api/src/modules/hr/hr-telegram-bridge/hr-telegram-bridge.module.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(telegram): backfill worker — talab-bo'yicha to'liq-tarix FSM"
```

---

## Task E: Boot-receivers + catch-up — ishonchli doimiy sync

**Files:**
- Modify: `apps/api/src/modules/hr/hr-telegram-account/hr-telegram-account.service.ts` (`listActiveSlots`)
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts` (`OnModuleInit` → `startReceivers`)
- Modify: `apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.ts` (catch-up cron)
- Test: `apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.receivers.test.ts`

**Interfaces:**
- Consumes: `HrTelegramAccountService.listActiveSlots(): Promise<{accountId:string, slot:number}[]>`; `MtprotoWorkerService.ensureClient` (mavjud, private) — `startReceivers` public wrapper qiladi.
- Produces: boot'da har faol akkaunt+slot uchun ulangan klient + listener (send'siz); catch-up cron `syncNewestId`ni ilgarilaydi.

- [ ] **Step 1: `listActiveSlots` testi + impl** (`hr-telegram-account.service.ts`)

Test (`hr-telegram-account.service.test.ts` mavjud bo'lsa unga qo'sh, aks holda yangi):
```ts
it('listActiveSlots — faol, sessiyali slotlarni qaytaradi', async () => {
  const rows = [{ accountId: 'a', slot: 1 }, { accountId: 'b', slot: 2 }];
  const prisma = { client: { hrTelegramAccount: { findMany: vi.fn(async () => rows) } } };
  const svc = new HrTelegramAccountService(prisma as never /*, ...boshqa dep*/);
  expect(await svc.listActiveSlots()).toEqual(rows);
  expect(prisma.client.hrTelegramAccount.findMany).toHaveBeenCalledWith({
    where: { isActive: true, sessionEncrypted: { not: null } },
    select: { accountId: true, slot: true },
  });
});
```
Impl:
```ts
  /** Boot-receiver'lar uchun — barcha faol, sessiyali (accountId, slot) juftliklari. */
  async listActiveSlots(): Promise<{ accountId: string; slot: number }[]> {
    return this.prisma.client.hrTelegramAccount.findMany({
      where: { isActive: true, sessionEncrypted: { not: null } },
      select: { accountId: true, slot: true },
    });
  }
```

- [ ] **Step 2: `MtprotoWorkerService`ga `OnModuleInit` + `startReceivers`**

Sinf deklaratsiyasini o'zgartir: `implements MtprotoAdapter, OnModuleInit` (importга `OnModuleInit` qo'sh). Konstruktorga `HrTelegramAccountService` allaqachon bor. Qo'sh:
```ts
  async onModuleInit(): Promise<void> {
    // Boot'da barcha faol userbotlarga ulanamiz va kiruvchi listener'ni
    // biriktiramiz — SEND'GA BOG'LIQ EMAS. Ilgari listener faqat birinchi
    // send'da (ensureClient) ulanardi → hech qachon xabar yubormagan mijoz
    // javobi TINGLANMAS edi (bug ildizi). Boot ulanishini bloklamaymiz.
    void this.startReceivers();
  }

  async startReceivers(): Promise<void> {
    let slots: { accountId: string; slot: number }[] = [];
    try {
      slots = await this.accounts.listActiveSlots();
    } catch (e) {
      this.logger.warn(`startReceivers: slot ro'yxati xato: ${(e as Error).message}`);
      return;
    }
    for (const { accountId, slot } of slots) {
      // ensureClient ulaydi + onIncomingMessage biriktiradi (mavjud). Xato
      // bitta akkauntni to'xtatmasin.
      try {
        const c = await this.ensureClient(accountId, slot);
        if (c) this.logger.log(`Telegram receiver ready acc=${accountId} slot=${slot}`);
      } catch (e) {
        this.logger.warn(`receiver ulanmadi acc=${accountId} slot=${slot}: ${(e as Error).message}`);
      }
    }
  }
```

- [ ] **Step 3: Boot-receiver testi** (`mtproto-worker.receivers.test.ts`)

```ts
it('startReceivers — har faol slotga ensureClient (listener biriktiriladi)', async () => {
  const handle = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isUserAuthorized: vi.fn(async () => true),
    onIncomingMessage: vi.fn(),
    resolvePhone: vi.fn(),
    hydrateEntity: vi.fn(),
    getHistory: vi.fn(),
  };
  const factory = { createClient: vi.fn(() => handle) };
  const accounts = {
    listActiveSlots: vi.fn(async () => [{ accountId: 'acc', slot: 1 }]),
    findActiveBySlot: vi.fn(async () => ({ apiId: 1, apiHashEncrypted: 'h', sessionEncrypted: 's' })),
  };
  const svc = new MtprotoWorkerService(factory as never, accounts as never, { get: vi.fn(), set: vi.fn() } as never, { handleIncoming: vi.fn() } as never);
  await svc.startReceivers();
  expect(handle.onIncomingMessage).toHaveBeenCalledTimes(1);
});
```
(`vi.mock('../hr-shared/crypto.util.js', ...)` C-task testidagidek qo'sh.)

- [ ] **Step 4: Catch-up cron'ni backfill worker'ga qo'sh** (`telegram-backfill-worker.service.ts`)

```ts
  /**
   * Catch-up — doimiy listener uzilgan payt o'tkazib yuborilgan xabarlarni
   * to'ldiradi. `syncNewestId`li bog'langan chatlar uchun `minId` bilan yangi
   * xabarlarni tortadi. Past chastota + tick'ga cheklov (flood-xavfsiz).
   */
  @Cron('0 */5 * * * *') // har 5 daqiqa
  async catchUpTick(): Promise<void> {
    const chats = await this.prisma.client.telegramChat.findMany({
      where: { counterpartyId: { not: null }, syncNewestId: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: 20,
      select: { id: true, accountId: true, counterpartyId: true, phone: true, syncNewestId: true },
    });
    for (const chat of chats) {
      if (!chat.phone) continue;
      try {
        const { messages } = await this.adapter.fetchHistory({
          accountId: chat.accountId,
          phone: chat.phone,
          limit: 50,
          minId: Number(chat.syncNewestId),
        });
        for (const m of messages) {
          await this.prisma.client.telegramChatMessage.upsert({
            where: { chatRefId_tgMessageId: { chatRefId: chat.id, tgMessageId: BigInt(m.tgMessageId) } },
            update: {},
            create: {
              accountId: chat.accountId,
              chatRefId: chat.id,
              direction: m.direction,
              text: m.text.slice(0, 4096),
              tgMessageId: BigInt(m.tgMessageId),
              senderName: m.senderName,
              kind: m.kind,
              mimeType: m.mimeType,
              fileName: m.fileName,
              fwdFromName: m.fwdFromName,
              createdAt: new Date(m.date * 1000),
            },
          });
          if (m.downloadMedia) {
            await this.storeMedia(chat.accountId, /* messageId */ '', m).catch(() => {});
          }
        }
        const newest = messages.reduce((mx, m) => Math.max(mx, m.tgMessageId), Number(chat.syncNewestId));
        await this.prisma.client.telegramChat.update({
          where: { id: chat.id },
          data: { syncNewestId: BigInt(newest) },
        });
      } catch (e) {
        this.logger.warn(`catch-up chat=${chat.id}: ${(e as Error).message}`);
      }
    }
  }
```
> Eslatma: `storeMedia`ga to'g'ri `messageId` uzatish uchun upsert natijasini (`created.id`) ushlab, media saqlashni undan keyin chaqir (backfill'dagi bilan bir xil naqsh — executor upsert natijasini o'zgaruvchiga oladi). Yuqoridagi qisqartma `''` — implementatsiyada `created.id` bilan almashtiriladi.

- [ ] **Step 5: `handleIncoming`da `syncNewestId`ni yangilash** (`telegram.service.ts`, Task G bilan birga qilinsa ham bo'ladi)

`handleIncoming` ичida `telegramChat.upsert`ning `update`/`create` bloklariga `syncNewestId: chatId`... aslida `syncNewestId` = kelgan `tgMessageId`. `create`dan keyin qo'sh:
```ts
    await this.prisma.client.telegramChat.update({
      where: { id: chat.id },
      data: { syncNewestId: BigInt(msg.tgMessageId) },
    });
```
(Faqat kelgan id kattaroq bo'lsa — oddiy `update`, monotonlik kam ahamiyatли; catch-up baribir `minId`dan ishlaydi.)

- [ ] **Step 6: Testlar o'tishini tasdiqla + typecheck**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/hr/hr-telegram-bridge/mtproto-worker.receivers.test.ts && pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/hr/hr-telegram-account/hr-telegram-account.service.ts apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.service.ts apps/api/src/modules/hr/hr-telegram-bridge/mtproto-worker.receivers.test.ts apps/api/src/modules/hr/hr-telegram-bridge/telegram-backfill-worker.service.ts apps/api/src/modules/telegram/telegram.service.ts
git commit -m "feat(telegram): boot-receiverlar + catch-up — ishonchli doimiy sync"
```

---

## Task F: `POST /counterparty/:id/sync` — backfill trigger

**Files:**
- Modify: `apps/api/src/modules/telegram/telegram.service.ts` (`requestCounterpartySync`)
- Modify: `apps/api/src/modules/telegram/telegram.controller.ts` (endpoint)
- Test: `apps/api/src/modules/telegram/telegram.service.test.ts` (mavjud faylga qo'sh)

**Interfaces:**
- Produces: `TelegramService.requestCounterpartySync(accountId, counterpartyId): Promise<{ status: string }>` — `TelegramBackfillJob` upsert (queued).

- [ ] **Step 1: Testni yoz** (mavjud test harness — makeService uslubi)

```ts
describe('TelegramService.requestCounterpartySync', () => {
  it('telefonli kontragent → backfill job queued', async () => {
    const upsert = vi.fn(async () => ({ status: 'queued' }));
    const prisma = {
      client: {
        counterparty: { findFirst: vi.fn(async () => ({ id: 'cp1', phone: '901234567' })) },
        telegramBackfillJob: { upsert },
      },
    };
    const svc = new TelegramService(prisma as never, {} as never, {} as never);
    const res = await svc.requestCounterpartySync('acc', 'cp1');
    expect(res).toEqual({ status: 'queued' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_counterpartyId: { accountId: 'acc', counterpartyId: 'cp1' } },
        create: expect.objectContaining({ status: 'queued', phone: '+998901234567' }),
      }),
    );
  });

  it("telefon YO'Q → no_phone, job qo'yilmaydi", async () => {
    const upsert = vi.fn();
    const prisma = { client: { counterparty: { findFirst: vi.fn(async () => ({ id: 'cp1', phone: null })) }, telegramBackfillJob: { upsert } } };
    const svc = new TelegramService(prisma as never, {} as never, {} as never);
    expect(await svc.requestCounterpartySync('acc', 'cp1')).toEqual({ status: 'no_phone' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test ishlamasligini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/telegram/telegram.service.test.ts -t requestCounterpartySync`
Expected: FAIL — `requestCounterpartySync is not a function`.

- [ ] **Step 3: `requestCounterpartySync`ni yoz** (`telegram.service.ts`)

`normalizeTelegramPhone` allaqachon import qilingan (`notifyCounterparty` ishlatadi). Qo'sh:
```ts
  /** Panel birinchi ochilganda — kontragentning to'liq Telegram tarixini backfill navbatiga qo'yadi. */
  async requestCounterpartySync(
    accountId: string,
    counterpartyId: string,
  ): Promise<{ status: string }> {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');
    let phone: string | null = null;
    try {
      phone = normalizeTelegramPhone(cp.phone);
    } catch {
      phone = null;
    }
    if (!phone) return { status: 'no_phone' };

    const job = await this.prisma.client.telegramBackfillJob.upsert({
      where: { accountId_counterpartyId: { accountId, counterpartyId } },
      // Mavjud 'error' bo'lsa qayta urinishga ruxsat; 'running'/'queued'/'done' — o'zgarishsiz.
      update: {},
      create: { accountId, counterpartyId, phone, status: 'queued' },
      select: { status: true },
    });
    return { status: job.status };
  }
```

- [ ] **Step 4: Controller endpoint'ini qo'sh** (`telegram.controller.ts`, `counterpartyTelegramProfile`dan keyin)

```ts
  /** Panel birinchi ochilganda to'liq tarix backfill'ini boshlaydi. */
  @Post('counterparty/:id/sync')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async syncCounterparty(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.requestCounterpartySync(user.accountId, id);
  }
```

- [ ] **Step 5: Test o'tishini tasdiqla + typecheck**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/telegram/telegram.service.test.ts && pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/telegram/telegram.service.ts apps/api/src/modules/telegram/telegram.service.test.ts apps/api/src/modules/telegram/telegram.controller.ts
git commit -m "feat(telegram): POST /counterparty/:id/sync — backfill trigger"
```

---

## Task G: `counterpartyThread` refaktori — kanonik transkript + overlay + pagination

**Files:**
- Modify: `apps/api/src/modules/telegram/telegram.service.ts` (`counterpartyThread` ~687-779)
- Test: `apps/api/src/modules/telegram/telegram.thread.test.ts`

**Interfaces:**
- Consumes: `TelegramChatMessage` (kanonik), `HrTelegramOutbox` (yetkazilmagan overlay), `TelegramBackfillJob` (status).
- Produces: `counterpartyThread` javobi endi `{ counterparty, connected, fromNumber, items, backfill: { status, messagesImported } | null, hasMore, oldestCursor }` qaytaradi. `?before=<ISO>&limit=` qabul qiladi.

- [ ] **Step 1: Testni yoz** (kanonik + overlay dedup)

```ts
import { describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service.js';

describe('counterpartyThread — kanonik transkript + yetkazilmagan overlay', () => {
  it('backfilled xabar bilan mos tgMessageId li yetkazilgan outbox DUBL EMAS', async () => {
    const chat = { id: 'chat1' };
    const prisma = {
      client: {
        counterparty: { findFirst: vi.fn(async () => ({ id: 'cp1', name: 'Ali', phone: '901' })) },
        telegramChat: { findFirst: vi.fn(async () => chat) },
        telegramChatMessage: {
          findMany: vi.fn(async () => [
            { id: 'm1', direction: 'out', text: 'a', kind: 'text', autoKind: null, attachmentId: null, fileName: null, mimeType: null, fwdFromName: null, tgMessageId: 100n, createdAt: new Date('2026-07-20T10:00:00Z') },
          ]),
        },
        hrTelegramOutbox: {
          findMany: vi.fn(async () => [
            // yetkazilgan (tgMessageId=100) → dubl, ko'rsatilmaydi
            { id: 'o1', messageText: 'a', status: 'sent', telegramMessageId: '100', sourceEventType: 'manual_chat', createdAt: new Date('2026-07-20T09:59:00Z') },
            // yetkazilmagan (pending) → overlay ko'rsatiladi
            { id: 'o2', messageText: 'kutmoqda', status: 'pending', telegramMessageId: null, sourceEventType: 'debt.reminder', createdAt: new Date('2026-07-20T11:00:00Z') },
          ]),
        },
        hrTelegramAccount: { findFirst: vi.fn(async () => ({ phoneNumber: '+99890' })) },
        telegramBackfillJob: { findFirst: vi.fn(async () => ({ status: 'done', messagesImported: 5 })) },
      },
    };
    const svc = new TelegramService(prisma as never, {} as never, {} as never);
    const res = await svc.counterpartyThread('acc', 'cp1', {});
    const ids = res.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('m1');       // kanonik
    expect(ids).toContain('ob-o2');    // yetkazilmagan overlay
    expect(ids).not.toContain('ob-o1'); // yetkazilgan dubl YO'Q
    expect(res.backfill).toEqual({ status: 'done', messagesImported: 5 });
  });
});
```

- [ ] **Step 2: Test ishlamasligini tasdiqla**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/telegram/telegram.thread.test.ts`
Expected: FAIL (eski `counterpartyThread` `telegramChatMessage.findMany`ni `businessChat` topilгандагина chaqiradi + dedup yo'q → `ob-o1` chiqadi).

- [ ] **Step 3: `counterpartyThread`ни almashtir** (butun metodni ~687-779)

```ts
  /** Panel oqimi — KANONIK transkript (TelegramChatMessage) + yetkazilmagan outbox overlay. */
  async counterpartyThread(
    accountId: string,
    counterpartyId: string,
    raw: Record<string, unknown>,
  ) {
    const limit = Math.min(Number(raw.limit) || 50, 200);
    const before = typeof raw.before === 'string' ? new Date(raw.before) : null;
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');

    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { accountId, counterpartyId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });

    // Kanonik: TelegramChatMessage (backfilled + jonli, ikki-tomonlama).
    const canonical = chat
      ? await this.prisma.client.telegramChatMessage.findMany({
          where: {
            accountId,
            chatRefId: chat.id,
            ...(before ? { createdAt: { lt: before } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
      : [];
    // Yetkazilgan tgMessageId'lar to'plami — mos outbox qatorini overlay'dan chiqarish uchun.
    const deliveredIds = new Set(
      canonical.filter((m) => m.tgMessageId != null).map((m) => String(m.tgMessageId)),
    );

    // Overlay: yetkazilmagan (yoki hali kanonikda yo'q) chiquvchi outbox.
    const outbox = await this.prisma.client.hrTelegramOutbox.findMany({
      where: { accountId, counterpartyId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const overlay = outbox.filter(
      (m) => m.telegramMessageId == null || !deliveredIds.has(String(m.telegramMessageId)),
    );

    type ThreadItem = {
      id: string; direction: 'in' | 'out'; text: string; status: string | null;
      kind: string; autoKind: string | null; attachmentId: string | null;
      fileName: string | null; mimeType: string | null; fwdFromName: string | null; createdAt: Date;
    };
    const merged: ThreadItem[] = [
      ...canonical.map((m) => ({
        id: `tg-${m.id}`,
        direction: m.direction as 'in' | 'out',
        text: m.text ?? '',
        status: null,
        kind: m.kind ?? 'text',
        autoKind: m.autoKind,
        attachmentId: m.attachmentId,
        fileName: m.fileName,
        mimeType: m.mimeType,
        fwdFromName: m.fwdFromName,
        createdAt: m.createdAt,
      })),
      ...overlay.map((m) => ({
        id: `ob-${m.id}`,
        direction: 'out' as const,
        text: m.messageText,
        status: m.status,
        kind: 'text',
        autoKind: m.sourceEventType === 'manual_chat' ? null : (m.sourceEventType ?? null),
        attachmentId: null,
        fileName: null,
        mimeType: null,
        fwdFromName: null,
        createdAt: m.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const page = merged.slice(-limit);
    const hasMore = merged.length > page.length || canonical.length === limit;

    const userbot = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, isActive: true, sessionEncrypted: { not: null } },
      select: { phoneNumber: true },
    });
    const job = await this.prisma.client.telegramBackfillJob.findFirst({
      where: { accountId, counterpartyId },
      select: { status: true, messagesImported: true },
    });

    return {
      counterparty: { id: cp.id, name: cp.name, phone: cp.phone },
      connected: !!userbot,
      fromNumber: userbot?.phoneNumber ?? null,
      items: page,
      backfill: job ? { status: job.status, messagesImported: job.messagesImported } : null,
      hasMore,
      oldestCursor: page.length > 0 ? page[0].createdAt.toISOString() : null,
    };
  }
```

- [ ] **Step 4: Test o'tishini tasdiqla + typecheck**

Run: `pnpm --filter @moysklad/api exec vitest run src/modules/telegram/telegram.thread.test.ts && pnpm --filter @moysklad/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telegram/telegram.service.ts apps/api/src/modules/telegram/telegram.thread.test.ts
git commit -m "feat(telegram): thread refaktori — kanonik transkript + yetkazilmagan overlay + pagination"
```

---

## Task H: Panel — backfill-banner + scroll-back + sync-trigger + i18n

**Files:**
- Modify: `apps/web/src/components/telegram/order-telegram-panel.tsx`
- Modify: `apps/web/src/messages/ru.json`, `apps/web/src/messages/uz.json`
- Test: `apps/web/src/components/telegram/order-telegram-panel.test.tsx`

**Interfaces:**
- Consumes: `GET /telegram/counterparty/:id/thread` (endi `backfill/hasMore/oldestCursor` bilan), `POST /telegram/counterparty/:id/sync`.
- Produces: panel banner (`backfill.status`) + «Eski xabarlarni yuklash» tugmasi (`hasMore`) + ochilganda `sync` trigger.

- [ ] **Step 1: i18n kalitlar qo'sh** (`ru.json` va `uz.json` — `telegram_panel` namespace ichiga)

`ru.json`:
```json
"backfill_loading": "История загружается… ({count} сообщений)",
"backfill_error": "Не удалось загрузить историю",
"load_older": "Загрузить старые сообщения"
```
`uz.json`:
```json
"backfill_loading": "Tarix yuklanmoqda… ({count} ta xabar)",
"backfill_error": "Tarixni yuklab bo'lmadi",
"load_older": "Eski xabarlarni yuklash"
```

- [ ] **Step 2: Panel testini yoz** (banner ko'rinishi)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// api-client + next-intl mock qil (mavjud web test naqshiga qara: masalan
// boshqa *.test.tsx da useTranslations mock'i bor). Bu yerda backfill.status
// 'running' bo'lganda banner matni chiqishini tekshiramiz.
```
> Executor eslatmasi: web komponent testlari uchun `apps/web`da mavjud `*.test.tsx` naqshini (QueryClient wrapper + `vi.mock('@/lib/api-client')` + `next-intl` mock) ko'chir. Test faqat: `thread` javobi `backfill:{status:'running',messagesImported:3}` bo'lганда `getByText`/`data-test-id="tg-backfill-banner"` chiqishini tasdiqlaydi.

- [ ] **Step 3: Panelga banner + scroll-back + sync-trigger qo'sh**

`ThreadResponse` interfeysiga qo'sh:
```ts
  backfill: { status: string; messagesImported: number } | null;
  hasMore: boolean;
  oldestCursor: string | null;
```
Komponent ichida (`sendMut`dan keyin):
```ts
  // Panel birinchi ochilganda backfill hali so'ralmagan bo'lsa — boshlaymiz.
  const syncMut = useMutation({
    mutationFn: () => api.post(`/telegram/counterparty/${counterpartyId}/sync`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger once when backfill missing
  useEffect(() => {
    if (data && data.backfill === null && data.connected && !syncMut.isPending) {
      syncMut.mutate();
    }
  }, [data?.backfill, data?.connected]);
```
Xabar oqimi `<div ref={scrollRef} ...>` ichida, `items.map`dan OLDIN backfill banneri + «eski yuklash» tugmasi:
```tsx
        {data?.backfill && data.backfill.status !== 'done' && (
          <div
            className="mb-1 rounded bg-[var(--ms-bg-surface)] px-2 py-1 text-center text-[var(--ms-text-muted)] text-xs"
            data-test-id="tg-backfill-banner"
          >
            {data.backfill.status === 'error'
              ? t('backfill_error')
              : t('backfill_loading', { count: data.backfill.messagesImported })}
          </div>
        )}
        {data?.hasMore && (
          <button
            type="button"
            onClick={() => setBeforeCursor(data.oldestCursor)}
            className="mb-1 block w-full text-[var(--ms-text-brand)] text-xs underline"
            data-test-id="tg-load-older"
          >
            {t('load_older')}
          </button>
        )}
```
> Scroll-back to'liq (cheksiz) implementatsiyasi uchun `beforeCursor` state + `QKEY`ga qo'shib, kanonik sahifalarni yig'ib borish kerak. **Minimal Faza-1:** `setBeforeCursor` bilan `queryFn`ga `?before=` uzatib **oldingi sahifani** ko'rsatish (to'liq accumulate = Faza-2 polish). `queryFn`ni yangila:
```ts
    queryFn: () =>
      api.get<ThreadResponse>(
        `/telegram/counterparty/${counterpartyId}/thread${beforeCursor ? `?before=${encodeURIComponent(beforeCursor)}` : ''}`,
      ),
```
va `const [beforeCursor, setBeforeCursor] = useState<string | null>(null);` qo'sh; `QKEY`ni `['tg-counterparty-thread', counterpartyId, beforeCursor]` qil.

- [ ] **Step 4: i18n gate + web test + typecheck**

Run: `pnpm i18n:gate && pnpm --filter @moysklad/web exec vitest run src/components/telegram/order-telegram-panel.test.tsx && pnpm --filter @moysklad/web typecheck`
Expected: PASS (i18n `backfill_*`/`load_older` ru+uz mavjud; hardcoded yo'q).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/telegram/order-telegram-panel.tsx apps/web/src/components/telegram/order-telegram-panel.test.tsx apps/web/src/messages/ru.json apps/web/src/messages/uz.json
git commit -m "feat(telegram): panel — backfill banner + eski-xabar yuklash + sync-trigger"
```

---

## Yakuniy gate (Faza-1 tugagach, commit-nuqta)

- [ ] `pnpm typecheck` → 0
- [ ] `pnpm lint` → 0
- [ ] `pnpm --filter @moysklad/api exec vitest run` → regressiya yo'q (yangi testlar yashil)
- [ ] `pnpm --filter @moysklad/web exec vitest run` → regressiya yo'q
- [ ] `pnpm i18n:gate` → 0
- [ ] NEXT.md + PARITY-STATUS'ga qatorlar qo'sh: **«Telegram to'liq-tarix Faza-1 — Phase-1, runtime-unverified (browser-smoke YO'Q)»**; Faza 2–4 QA-backlog'ga.
- [ ] **Faza-2 QA (alohida sessiya):** real userbot bilan backfill smoke (mijoz ochilganda to'liq tarix keladimi; media yuklanadimi; catch-up ishlaydimi; dubl yo'qmi).

---

## Self-Review (spec qamrovi)

| Spec talabi | Task |
|---|---|
| Kanonik transkript (§1) | A (sxema), G (thread) |
| Dedup outbox↔message (§1) | A (`@@unique`), G (overlay filter) |
| Backfill dvigateli (§2) | B (getHistory), C (fetchHistory), D (worker), F (trigger) |
| Ishonchli oldinga sync — boot listener (§3) | E |
| Catch-up (§3) | E |
| Thread pagination (§4) | G (`before`), H (load-older) |
| Panel banner + scroll-back (§5) | H |
| Media darhol yuklash (§6) | D (`storeMedia`), mavjud `handleIncoming` |
| Xato/flood (§7) | C, D (flood→requeue), E (boot try/catch) |
| Testlash (§8) | Har task TDD; yakuniy gate |
| Ko'lam chegarasi + parallel-sessiya (§9) | Global Constraints; reply/read maydonlari A'da nullable |

**Ochiq nozikliklar (executor hal qiladi, hujjatlangan):** `TelegramChat`ga `@@unique([accountId, counterpartyId])` (Task D Step-4) · web komponent-test naqshi (Task H Step-2) · catch-up `storeMedia` `created.id` (Task E Step-4 eslatmasi).
