import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTelegramEntityCacheService } from './entity-cache.service.js';

function makePrisma() {
  return {
    client: {
      hrTelegramSession: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
}

describe('HrTelegramEntityCacheService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrTelegramEntityCacheService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTelegramEntityCacheService(prisma as any);
  });

  it('get(): returns null on cache row miss', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue(null);
    expect(await svc.get('acc1', 1, '+998901234567')).toBeNull();
  });

  it('get(): returns null when row exists but phone not in map', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue({
      value: { '+998900000000': { id: 'e-1' } },
    });
    expect(await svc.get('acc1', 1, '+998901234567')).toBeNull();
  });

  it('get(): returns serialized entity on hit', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue({
      value: { '+998901234567': { id: 'e-1', accessHash: 'h' } },
    });
    expect(await svc.get('acc1', 1, '+998901234567')).toEqual({
      id: 'e-1',
      accessHash: 'h',
    });
  });

  it('get(): tolerates malformed value (non-object) → null', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue({
      value: null,
    });
    expect(await svc.get('acc1', 1, '+998901234567')).toBeNull();
  });

  it('set(): upserts merged map (preserves prior phones)', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue({
      value: { '+998900000000': { id: 'e-0' } },
    });
    await svc.set('acc1', 1, '+998901234567', { id: 'e-1' });

    const upsertCall = prisma.client.hrTelegramSession.upsert.mock.calls[0]?.[0] as {
      create: { value: Record<string, unknown> };
      update: { value: Record<string, unknown> };
    };
    expect(upsertCall.update.value).toEqual({
      '+998900000000': { id: 'e-0' },
      '+998901234567': { id: 'e-1' },
    });
    expect(upsertCall.create.value).toEqual(upsertCall.update.value);
  });

  it('set(): creates fresh map on first cache row for (account, slot)', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue(null);
    await svc.set('acc1', 2, '+998901234567', { id: 'e-1' });
    const upsertCall = prisma.client.hrTelegramSession.upsert.mock.calls[0]?.[0] as {
      where: { accountId_accountSlot_key: { accountId: string; accountSlot: number; key: string } };
      create: { value: Record<string, unknown> };
    };
    expect(upsertCall.where.accountId_accountSlot_key).toEqual({
      accountId: 'acc1',
      accountSlot: 2,
      key: 'entity_cache',
    });
    expect(upsertCall.create.value).toEqual({ '+998901234567': { id: 'e-1' } });
  });

  it('invalidate(): removes single phone entry, keeps others', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue({
      value: {
        '+998900000000': { id: 'e-0' },
        '+998901234567': { id: 'e-1' },
      },
    });
    await svc.invalidate('acc1', 1, '+998901234567');
    const updateCall = prisma.client.hrTelegramSession.update.mock.calls[0]?.[0] as {
      data: { value: Record<string, unknown> };
    };
    expect(updateCall.data.value).toEqual({ '+998900000000': { id: 'e-0' } });
  });

  it('invalidate(): no-op when phone not in cache (no DB write)', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue({
      value: { '+998900000000': { id: 'e-0' } },
    });
    await svc.invalidate('acc1', 1, '+998901234567');
    expect(prisma.client.hrTelegramSession.update).not.toHaveBeenCalled();
  });

  it('invalidate(): no-op when cache row missing', async () => {
    prisma.client.hrTelegramSession.findUnique.mockResolvedValue(null);
    await svc.invalidate('acc1', 1, '+998901234567');
    expect(prisma.client.hrTelegramSession.update).not.toHaveBeenCalled();
  });

  it('clear(): deletes the cache row for (account, slot)', async () => {
    prisma.client.hrTelegramSession.delete.mockResolvedValue({} as never);
    await svc.clear('acc1', 1);
    expect(prisma.client.hrTelegramSession.delete).toHaveBeenCalledWith({
      where: {
        accountId_accountSlot_key: {
          accountId: 'acc1',
          accountSlot: 1,
          key: 'entity_cache',
        },
      },
    });
  });

  it('clear(): missing row throw is swallowed (idempotent)', async () => {
    prisma.client.hrTelegramSession.delete.mockRejectedValue(new Error('not found'));
    await expect(svc.clear('acc1', 1)).resolves.not.toThrow();
  });
});
