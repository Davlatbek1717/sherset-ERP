import { describe, expect, it, vi } from 'vitest';
import { MtprotoWorkerService } from './mtproto-worker.service.js';

// Shifrlangan blob dekripti = identity (kredensial ochish talab qilinmasin).
vi.mock('../hr-shared/crypto.util.js', () => ({ decryptHrSession: (v: string) => v }));

function makeHandle() {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isUserAuthorized: vi.fn(async () => true),
    onIncomingMessage: vi.fn(),
    resolvePhone: vi.fn(),
    hydrateEntity: vi.fn(),
    getHistory: vi.fn(),
    sendMessage: vi.fn(),
  };
}

describe('MtprotoWorkerService.startReceivers (boot)', () => {
  it('har faol slotga ensureClient — kiruvchi listener biriktiriladi', async () => {
    const handle = makeHandle();
    const factory = { createClient: vi.fn(() => handle) };
    const accounts = {
      listActiveSlots: vi.fn(async () => [{ accountId: 'acc', slot: 1 }]),
      findActiveBySlot: vi.fn(async () => ({
        apiId: 1,
        apiHashEncrypted: 'h',
        sessionEncrypted: 's',
      })),
    };
    const svc = new MtprotoWorkerService(
      factory as never,
      accounts as never,
      { get: vi.fn(), set: vi.fn() } as never,
      { handleIncoming: vi.fn() } as never,
    );
    await svc.startReceivers();
    expect(handle.onIncomingMessage).toHaveBeenCalledTimes(1);
  });

  it("bir akkaunt xatosi qolganlarni to'xtatmaydi", async () => {
    const good = makeHandle();
    let call = 0;
    const factory = {
      createClient: vi.fn(() => {
        call++;
        if (call === 1) throw new Error('birinchi ulanish xatosi');
        return good;
      }),
    };
    const accounts = {
      listActiveSlots: vi.fn(async () => [
        { accountId: 'a', slot: 1 },
        { accountId: 'b', slot: 2 },
      ]),
      findActiveBySlot: vi.fn(async () => ({
        apiId: 1,
        apiHashEncrypted: 'h',
        sessionEncrypted: 's',
      })),
    };
    const svc = new MtprotoWorkerService(
      factory as never,
      accounts as never,
      { get: vi.fn(), set: vi.fn() } as never,
      { handleIncoming: vi.fn() } as never,
    );
    await expect(svc.startReceivers()).resolves.not.toThrow();
    // Ikkinchi akkaunt baribir ulandi.
    expect(good.onIncomingMessage).toHaveBeenCalledTimes(1);
  });
});
