import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptHrSession } from '../hr-shared/crypto.util.js';
import { MtprotoFloodError } from './mtproto-adapter.js';
import { MtprotoWorkerService } from './mtproto-worker.service.js';
import type {
  TelegramClientFactory,
  TelegramClientFactoryArgs,
  TelegramClientHandle,
} from './telegram-client-factory.js';

/** Mock client — every method is a vi.fn so tests can program outcomes per slot. */
function makeClient(overrides: Partial<TelegramClientHandle> = {}): TelegramClientHandle {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isUserAuthorized: vi.fn().mockResolvedValue(true),
    getEntity: vi.fn().mockResolvedValue({ id: 'entity-1' }),
    resolvePhone: vi.fn().mockResolvedValue({ id: 'entity-1' }),
    // Identity by default (tests below override to prove the worker ACTUALLY
    // calls this on both cache hit and miss, rather than bypassing it).
    hydrateEntity: vi.fn((cached: unknown) => cached),
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'm-1' }),
    sendCode: vi.fn().mockResolvedValue({ phoneCodeHash: 'hash' }),
    signIn: vi.fn().mockResolvedValue(undefined),
    checkPassword: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockReturnValue('session-str'),
    ...overrides,
  };
}

function makeFactory(handles: Map<string, TelegramClientHandle>): TelegramClientFactory {
  // Key the returned handle by apiId so the test can hand a per-slot mock.
  // Adapter creates one per (accountId, slot) via the account row's apiId.
  return {
    createClient(args: TelegramClientFactoryArgs): TelegramClientHandle {
      const key = String(args.apiId);
      const h = handles.get(key);
      if (!h) throw new Error(`no mock client registered for apiId=${args.apiId}`);
      return h;
    },
  };
}

function makeAccountsSvc(
  opts: {
    active?: Record<
      number,
      { apiId: number; apiHashEncrypted: string; sessionEncrypted: string | null }
    >;
    flooded?: Record<number, boolean>;
  } = {},
) {
  return {
    findActiveBySlot: vi.fn((_accountId: string, slot: number) => {
      const row = opts.active?.[slot];
      if (!row) return Promise.resolve(null);
      return Promise.resolve({
        ...row,
        id: `tg-${slot}`,
        accountId: 'acc1',
        slot,
        phoneNumber: '+998900000000',
        isActive: true,
      });
    }),
    isFlooded: vi.fn((_accountId: string, slot: number) =>
      Promise.resolve(Boolean(opts.flooded?.[slot])),
    ),
    setFloodWaitUntil: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEntityCache() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MtprotoWorkerService', () => {
  let apiHashEncrypted: string;
  let sessionEncrypted: string;

  beforeAll(() => {
    if (!process.env.HR_SESSION_KEY) {
      process.env.HR_SESSION_KEY = randomBytes(32).toString('base64');
    }
    apiHashEncrypted = encryptHrSession('real-api-hash-1234567890abcdef');
    sessionEncrypted = encryptHrSession('1ABCdef==session-string==');
  });

  let handles: Map<string, TelegramClientHandle>;
  let factory: TelegramClientFactory;
  let cache: ReturnType<typeof makeEntityCache>;

  beforeEach(() => {
    handles = new Map();
    factory = makeFactory(handles);
    cache = makeEntityCache();
  });

  it('happy path: routes through slot 1, persists entity in cache on miss', async () => {
    const client1 = makeClient();
    handles.set('100', client1);
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    const result = await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'salom',
    });

    expect(result).toEqual({ slot: 1, messageId: 'm-1' });
    expect(client1.resolvePhone).toHaveBeenCalledWith('+998901234567');
    expect(client1.sendMessage).toHaveBeenCalledWith({ id: 'entity-1' }, 'salom', {
      format: 'default',
    });
    expect(cache.set).toHaveBeenCalledWith('acc1', 1, '+998901234567', expect.anything());
  });

  // 2026-07-20b: debt-telegram.util.ts messages need MarkdownV2 (underline
  // support) — the worker opts in ONLY when sourceEventType starts with
  // `debt.`, so every other HR/supply/task notification's formatting stays
  // untouched (see the doc comment on the format decision in the service).
  it("sourceEventType 'debt.*' selects markdown-v2; everything else stays 'default'", async () => {
    const client1 = makeClient();
    handles.set('100', client1);
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'x',
      sourceEventType: 'debt.reminder',
    });
    expect(client1.sendMessage).toHaveBeenLastCalledWith(expect.anything(), 'x', {
      format: 'markdown-v2',
    });

    await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'y',
      sourceEventType: 'supply.posted',
    });
    expect(client1.sendMessage).toHaveBeenLastCalledWith(expect.anything(), 'y', {
      format: 'default',
    });

    await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'z' });
    expect(client1.sendMessage).toHaveBeenLastCalledWith(expect.anything(), 'z', {
      format: 'default',
    });
  });

  it('entity cache HIT skips resolvePhone (no network round-trip)', async () => {
    const client1 = makeClient();
    handles.set('100', client1);
    cache.get.mockResolvedValue({ id: 'cached-entity' });
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'x' });

    expect(client1.resolvePhone).not.toHaveBeenCalled();
    expect(client1.sendMessage).toHaveBeenCalledWith({ id: 'cached-entity' }, 'x', {
      format: 'default',
    });
    // 2026-07-20: the cached descriptor must ALSO be hydrated (see below for
    // the live-confirmed bug this proves is fixed: "Cannot cast User to any
    // kind of peer" on every cache-hit send before hydrateEntity existed).
    expect(client1.hydrateEntity).toHaveBeenCalledWith({ id: 'cached-entity' });
    expect(cache.set).not.toHaveBeenCalled();
  });

  // 2026-07-20c bug, confirmed live: a phone cached by an OLDER build (a
  // different descriptor shape than the current `{userId, accessHash}`)
  // makes hydrateEntity throw "invalid cached entity shape" — this used to
  // hard-fail the send outright. A malformed cache row is just a cache MISS
  // in disguise: fall through to a fresh resolvePhone instead of failing.
  it('hydrateEntity throwing on a stale/incompatible cache entry falls back to resolvePhone', async () => {
    const client1 = makeClient({
      hydrateEntity: vi.fn((cached: unknown) => {
        const c = cached as { userId?: string };
        if (c.userId !== '999') throw new Error('hydrateEntity: invalid cached entity shape');
        return { hydrated: true };
      }),
      resolvePhone: vi.fn().mockResolvedValue({ userId: '999', accessHash: '111' }),
    });
    handles.set('100', client1);
    cache.get.mockResolvedValue({ someOldShape: 'legacy-blob' });
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    const result = await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'x',
    });

    expect(result).toEqual({ slot: 1, messageId: 'm-1' });
    expect(client1.resolvePhone).toHaveBeenCalledWith('+998901234567');
    expect(client1.sendMessage).toHaveBeenCalledWith({ hydrated: true }, 'x', {
      format: 'default',
    });
    // Stale row gets overwritten with the fresh, correctly-shaped descriptor.
    expect(cache.set).toHaveBeenCalledWith(
      'acc1',
      1,
      '+998901234567',
      expect.objectContaining({ userId: '999', accessHash: '111' }),
    );
  });

  // 2026-07-20 bug, confirmed live: sending a JSON-round-tripped cached
  // entity straight to gramjs's sendMessage (skipping hydration) failed
  // EVERY time with "Cannot cast User to any kind of peer" — the first send
  // to a phone (cache miss, real object) worked; the very next send to the
  // SAME phone (cache hit) failed. hydrateEntity's OUTPUT — not the raw
  // cached/resolved descriptor — must be what actually reaches sendMessage,
  // on BOTH paths.
  describe('hydrateEntity output (not the raw descriptor) reaches sendMessage', () => {
    it('cache HIT', async () => {
      const client1 = makeClient({
        hydrateEntity: vi.fn((cached) => ({ hydrated: true, from: cached })),
      });
      handles.set('100', client1);
      cache.get.mockResolvedValue({ userId: '123', accessHash: '456' });
      const accounts = makeAccountsSvc({
        active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
      });
      const adapter = new MtprotoWorkerService(
        factory,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        accounts as any,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        cache as any,
      );

      await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'x' });

      expect(client1.sendMessage).toHaveBeenCalledWith(
        { hydrated: true, from: { userId: '123', accessHash: '456' } },
        'x',
        { format: 'default' },
      );
    });

    it('cache MISS (fresh resolvePhone result)', async () => {
      const client1 = makeClient({
        resolvePhone: vi.fn().mockResolvedValue({ userId: '789', accessHash: '000' }),
        hydrateEntity: vi.fn((raw) => ({ hydrated: true, from: raw })),
      });
      handles.set('100', client1);
      const accounts = makeAccountsSvc({
        active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
      });
      const adapter = new MtprotoWorkerService(
        factory,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        accounts as any,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        cache as any,
      );

      await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'x' });

      expect(client1.sendMessage).toHaveBeenCalledWith(
        { hydrated: true, from: { userId: '789', accessHash: '000' } },
        'x',
        { format: 'default' },
      );
      // The RAW (un-hydrated) descriptor is what's persisted — hydration
      // happens on read, every time, not once at write time.
      expect(cache.set).toHaveBeenCalledWith(
        'acc1',
        1,
        '+998901234567',
        expect.objectContaining({ userId: '789', accessHash: '000' }),
      );
    });
  });

  // 2026-07-20 bug: `getEntity(phone)` only resolves numbers gramjs already
  // knows (existing contacts/chats) — a brand-new customer phone threw
  // "Cannot find any entity", so their first-ever reminder never sent.
  // `resolvePhone` (contacts.ImportContacts) must be used instead, and it
  // must work for a number NOT already a contact.
  it('resolves and sends to a phone that is NOT an existing contact', async () => {
    const client1 = makeClient({
      resolvePhone: vi.fn().mockResolvedValue({ id: 'new-customer-entity' }),
    });
    handles.set('100', client1);
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    const result = await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998914460528',
      text: 'Sizga 1 000 so‘m miqdorida qarz rasmiylashtirildi.',
    });

    expect(result).toEqual({ slot: 1, messageId: 'm-1' });
    expect(client1.resolvePhone).toHaveBeenCalledWith('+998914460528');
    expect(client1.sendMessage).toHaveBeenCalledWith(
      { id: 'new-customer-entity' },
      'Sizga 1 000 so‘m miqdorida qarz rasmiylashtirildi.',
      { format: 'default' },
    );
  });

  it('phone genuinely not on Telegram → clear error, not a silent hang', async () => {
    const client1 = makeClient({
      resolvePhone: vi
        .fn()
        .mockRejectedValue(new Error('resolvePhone: "+998900000001" Telegram\'da topilmadi')),
    });
    handles.set('100', client1);
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await expect(
      adapter.sendMessage({ accountId: 'acc1', toPhone: '+998900000001', text: 'x' }),
    ).rejects.toThrow(/topilmadi/);
    expect(client1.sendMessage).not.toHaveBeenCalled();
  });

  it('2-slot failover: slot 1 FloodWaitError → slot 2 delivers', async () => {
    const floodErr = Object.assign(new Error('FLOOD_WAIT_60'), {
      className: 'FloodWaitError',
      seconds: 60,
    });
    const client1 = makeClient({ sendMessage: vi.fn().mockRejectedValue(floodErr) });
    const client2 = makeClient({ sendMessage: vi.fn().mockResolvedValue({ messageId: 'm-2' }) });
    handles.set('100', client1);
    handles.set('200', client2);

    const accounts = makeAccountsSvc({
      active: {
        1: { apiId: 100, apiHashEncrypted, sessionEncrypted },
        2: { apiId: 200, apiHashEncrypted, sessionEncrypted },
      },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    const result = await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'salom',
    });

    expect(result).toEqual({ slot: 2, messageId: 'm-2' });
    // Flood-wait persisted for slot 1
    expect(accounts.setFloodWaitUntil).toHaveBeenCalledWith('acc1', 1, expect.any(Date));
  });

  it('already-flooded slot is skipped silently (no client creation)', async () => {
    const client2 = makeClient({ sendMessage: vi.fn().mockResolvedValue({ messageId: 'm-2' }) });
    const factorySpy = vi.fn((_args: TelegramClientFactoryArgs) => client2);
    const accounts = makeAccountsSvc({
      active: {
        1: { apiId: 100, apiHashEncrypted, sessionEncrypted },
        2: { apiId: 200, apiHashEncrypted, sessionEncrypted },
      },
      flooded: { 1: true }, // slot 1 in active flood window
    });

    const adapter = new MtprotoWorkerService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      { createClient: factorySpy } as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    const result = await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'x',
    });

    expect(result.slot).toBe(2);
    // Factory was called ONLY for slot 2 (apiId=200), never for the flooded slot 1
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy.mock.calls[0]?.[0]?.apiId).toBe(200);
  });

  it('both slots flooded → throws MtprotoFloodError (worker honors retryAfter)', async () => {
    const flood1 = Object.assign(new Error('FLOOD_WAIT_30'), {
      className: 'FloodWaitError',
      seconds: 30,
    });
    const flood2 = Object.assign(new Error('FLOOD_WAIT_60'), {
      className: 'FloodWaitError',
      seconds: 60,
    });
    handles.set('100', makeClient({ sendMessage: vi.fn().mockRejectedValue(flood1) }));
    handles.set('200', makeClient({ sendMessage: vi.fn().mockRejectedValue(flood2) }));

    const accounts = makeAccountsSvc({
      active: {
        1: { apiId: 100, apiHashEncrypted, sessionEncrypted },
        2: { apiId: 200, apiHashEncrypted, sessionEncrypted },
      },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await expect(
      adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'x' }),
    ).rejects.toBeInstanceOf(MtprotoFloodError);
  });

  it('no active slots → throws no_active_slot Error (NOT flood)', async () => {
    const accounts = makeAccountsSvc({ active: {} });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await expect(
      adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'x' }),
    ).rejects.toThrow(/no_active_slot/);
  });

  it('slot with un-authorized session is skipped (admin must re-login)', async () => {
    const client1 = makeClient({ isUserAuthorized: vi.fn().mockResolvedValue(false) });
    const client2 = makeClient();
    handles.set('100', client1);
    handles.set('200', client2);
    const accounts = makeAccountsSvc({
      active: {
        1: { apiId: 100, apiHashEncrypted, sessionEncrypted },
        2: { apiId: 200, apiHashEncrypted, sessionEncrypted },
      },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    const result = await adapter.sendMessage({
      accountId: 'acc1',
      toPhone: '+998901234567',
      text: 'x',
    });
    expect(result.slot).toBe(2);
    expect(client1.disconnect).toHaveBeenCalled(); // unauthorized client released
  });

  it('client pool: second send to same (account, slot) reuses connection', async () => {
    const client1 = makeClient();
    const factorySpy = vi.fn(() => client1);
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      { createClient: factorySpy } as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'a' });
    await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'b' });

    expect(factorySpy).toHaveBeenCalledTimes(1); // pool hit on second send
    expect(client1.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('releaseClient(): drops cached client and disconnects', async () => {
    const client1 = makeClient();
    handles.set('100', client1);
    const accounts = makeAccountsSvc({
      active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
    });
    const adapter = new MtprotoWorkerService(
      factory,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      accounts as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      cache as any,
    );

    await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'a' });
    adapter.releaseClient('acc1', 1);
    expect(client1.disconnect).toHaveBeenCalled();
  });

  // 2026-07-20 incident: a gramjs call that never settles (VPS network trouble
  // to Telegram) has no built-in timeout — it hung `sendMessage` forever,
  // which left HrTelegramOutboxWorker's `running` guard stuck `true` and
  // permanently wedged the whole outbound queue (reproduced even right after
  // a fresh `pm2 restart`). A 25s ceiling around each gramjs call turns a
  // hang into an ordinary rejected Error the existing retry logic can handle.
  describe('hung gramjs call does not wedge the worker forever', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sendMessage that never resolves times out and fails over to slot 2', async () => {
      const client1 = makeClient({
        // Simulates the observed hang: the promise never settles.
        sendMessage: vi.fn(() => new Promise<{ messageId: string }>(() => {})),
      });
      const client2 = makeClient({ sendMessage: vi.fn().mockResolvedValue({ messageId: 'm-2' }) });
      handles.set('100', client1);
      handles.set('200', client2);

      const accounts = makeAccountsSvc({
        active: {
          1: { apiId: 100, apiHashEncrypted, sessionEncrypted },
          2: { apiId: 200, apiHashEncrypted, sessionEncrypted },
        },
      });
      const adapter = new MtprotoWorkerService(
        factory,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        accounts as any,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        cache as any,
      );

      const resultPromise = adapter.sendMessage({
        accountId: 'acc1',
        toPhone: '+998901234567',
        text: 'salom',
      });
      // Flush the 25s timeout on slot 1 so the adapter can move on to slot 2.
      await vi.advanceTimersByTimeAsync(26_000);
      const result = await resultPromise;

      expect(result).toEqual({ slot: 2, messageId: 'm-2' });
    });

    it('all slots hung → rejects instead of hanging the caller forever', async () => {
      const client1 = makeClient({
        sendMessage: vi.fn(() => new Promise<{ messageId: string }>(() => {})),
      });
      handles.set('100', client1);
      const accounts = makeAccountsSvc({
        active: { 1: { apiId: 100, apiHashEncrypted, sessionEncrypted } },
      });
      const adapter = new MtprotoWorkerService(
        factory,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        accounts as any,
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
        cache as any,
      );

      const resultPromise = adapter.sendMessage({
        accountId: 'acc1',
        toPhone: '+998901234567',
        text: 'salom',
      });
      const assertion = expect(resultPromise).rejects.toThrow(
        /mtproto_timeout|mtproto_all_slots_failed/,
      );
      await vi.advanceTimersByTimeAsync(26_000);
      await assertion;
    });
  });
});
