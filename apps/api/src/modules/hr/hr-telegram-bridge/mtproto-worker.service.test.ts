import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(client1.getEntity).toHaveBeenCalledWith('+998901234567');
    expect(client1.sendMessage).toHaveBeenCalledWith({ id: 'entity-1' }, 'salom');
    expect(cache.set).toHaveBeenCalledWith('acc1', 1, '+998901234567', expect.anything());
  });

  it('entity cache HIT skips getEntity (no network round-trip)', async () => {
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

    expect(client1.getEntity).not.toHaveBeenCalled();
    expect(client1.sendMessage).toHaveBeenCalledWith({ id: 'cached-entity' }, 'x');
    expect(cache.set).not.toHaveBeenCalled();
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
    const factorySpy = vi.fn(() => client2);
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
});
