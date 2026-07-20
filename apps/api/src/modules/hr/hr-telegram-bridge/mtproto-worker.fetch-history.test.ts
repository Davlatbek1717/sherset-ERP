import { describe, expect, it, vi } from 'vitest';
import { MtprotoWorkerService } from './mtproto-worker.service.js';

// Shifrlangan blob'ni ochish talab qilinmasin — dekript = identity.
vi.mock('../hr-shared/crypto.util.js', () => ({ decryptHrSession: (v: string) => v }));

function makeWorker(historyPage: unknown[]) {
  const handle = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isUserAuthorized: vi.fn(async () => true),
    resolvePhone: vi.fn(async () => ({ userId: '42', accessHash: '7' })),
    hydrateEntity: vi.fn((c: unknown) => ({ peer: c })),
    getHistory: vi.fn(async () => historyPage),
    onIncomingMessage: vi.fn(),
    sendMessage: vi.fn(),
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
  return { svc, handle };
}

describe('MtprotoWorkerService.fetchHistory', () => {
  it('slot-1 klient orqali getHistory sahifasini qaytaradi', async () => {
    const page = [{ tgMessageId: 10, direction: 'out', text: 'salom' }];
    const { svc, handle } = makeWorker(page);
    const res = await svc.fetchHistory({ accountId: 'acc', phone: '+998901234567', limit: 100 });
    expect(res.slot).toBe(1);
    // peerId = resolvePhone descriptor'idagi userId (chatId birlashishi uchun)
    expect(res.peerId).toBe('42');
    expect(res.messages).toEqual(page);
    // resolveEntity: cache miss → resolvePhone → hydrateEntity → getHistory
    expect(handle.getHistory).toHaveBeenCalledWith(
      { peer: { userId: '42', accessHash: '7' } },
      { limit: 100, offsetId: undefined, minId: undefined },
    );
  });

  it("offsetId/minId ni getHistory'ga uzatadi", async () => {
    const { svc, handle } = makeWorker([]);
    await svc.fetchHistory({
      accountId: 'acc',
      phone: '+998901234567',
      limit: 50,
      offsetId: 99,
      minId: 5,
    });
    expect(handle.getHistory).toHaveBeenCalledWith(expect.anything(), {
      limit: 50,
      offsetId: 99,
      minId: 5,
    });
  });
});
