import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTelegramAccountService } from './hr-telegram-account.service.js';

function makePrisma() {
  return {
    client: {
      hrTelegramAccount: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      hrTelegramSession: {
        deleteMany: vi.fn(),
      },
    },
  };
}

function row(
  overrides: Partial<{
    id: string;
    slot: number;
    phoneNumber: string;
    apiId: number;
    sessionEncrypted: string | null;
    isActive: boolean;
    lastConnectedAt: Date | null;
    floodWaitUntil: Date | null;
    createdAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'tg-1',
    slot: overrides.slot ?? 1,
    phoneNumber: overrides.phoneNumber ?? '+998901234567',
    apiId: overrides.apiId ?? 12345,
    apiHashEncrypted: 'enc:enc:enc',
    sessionEncrypted: overrides.sessionEncrypted === undefined ? null : overrides.sessionEncrypted,
    isActive: overrides.isActive ?? false,
    lastConnectedAt: overrides.lastConnectedAt ?? null,
    floodWaitUntil: overrides.floodWaitUntil ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-05-21T10:00:00Z'),
  };
}

describe('HrTelegramAccountService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrTelegramAccountService;

  beforeAll(() => {
    if (!process.env.HR_SESSION_KEY) {
      process.env.HR_SESSION_KEY = randomBytes(32).toString('base64');
    }
  });

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTelegramAccountService(prisma as any);
  });

  it('list(): maps DB rows to DTOs without exposing encrypted blobs', async () => {
    prisma.client.hrTelegramAccount.findMany.mockResolvedValue([
      row({ id: 'tg-1', slot: 1, sessionEncrypted: 'enc' }),
      row({ id: 'tg-2', slot: 2, sessionEncrypted: null }),
    ]);
    const dtos = await svc.list('acc1');
    expect(dtos).toHaveLength(2);
    expect(dtos[0]?.hasSession).toBe(true);
    expect(dtos[1]?.hasSession).toBe(false);
    // No raw encrypted fields on the DTO
    // biome-ignore lint/suspicious/noExplicitAny: shape audit
    expect((dtos[0] as any).apiHashEncrypted).toBeUndefined();
    // biome-ignore lint/suspicious/noExplicitAny: shape audit
    expect((dtos[0] as any).sessionEncrypted).toBeUndefined();
  });

  it('findOne(): throws NotFound when account missing', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('acc1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('create(): normalizes phone (998-prefix expansion)', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(null); // no conflict
    prisma.client.hrTelegramAccount.create.mockResolvedValue(
      row({ id: 'tg-new', phoneNumber: '+998901234567' }),
    );

    const result = await svc.create('acc1', {
      slot: 1,
      phoneNumber: '901234567',
      apiId: 12345,
      apiHash: 'a-very-long-api-hash-from-my-telegram-org',
    });

    expect(result.phoneNumber).toBe('+998901234567');
    const createArgs = prisma.client.hrTelegramAccount.create.mock.calls[0]?.[0] as {
      data: { phoneNumber: string; apiHashEncrypted: string; isActive: boolean };
    };
    expect(createArgs.data.phoneNumber).toBe('+998901234567');
    // apiHash encrypted (3-part hex:hex:hex)
    expect(createArgs.data.apiHashEncrypted.split(':')).toHaveLength(3);
    // Not active until session set
    expect(createArgs.data.isActive).toBe(false);
  });

  it('create(): rejects garbage phone with BadRequest (not 500)', async () => {
    await expect(
      svc.create('acc1', {
        slot: 1,
        phoneNumber: 'not-a-phone',
        apiId: 1,
        apiHash: 'long-enough-api-hash-here',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('create(): rejects duplicate slot with Conflict', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      svc.create('acc1', {
        slot: 1,
        phoneNumber: '+998901234567',
        apiId: 1,
        apiHash: 'long-enough-api-hash-here',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.client.hrTelegramAccount.create).not.toHaveBeenCalled();
  });

  it('setActive(true): refuses activation when sessionEncrypted is null', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(
      row({ id: 'tg-1', sessionEncrypted: null }),
    );
    await expect(svc.setActive('acc1', 'tg-1', true)).rejects.toThrow(/Sessiya yo'q/);
    expect(prisma.client.hrTelegramAccount.update).not.toHaveBeenCalled();
  });

  it('setActive(true): allowed when session exists', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(
      row({ id: 'tg-1', sessionEncrypted: 'enc' }),
    );
    prisma.client.hrTelegramAccount.update.mockResolvedValue(
      row({ id: 'tg-1', sessionEncrypted: 'enc', isActive: true }),
    );
    const result = await svc.setActive('acc1', 'tg-1', true);
    expect(result.isActive).toBe(true);
  });

  it('setActive(false): always allowed even without session', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(
      row({ id: 'tg-1', sessionEncrypted: null, isActive: false }),
    );
    prisma.client.hrTelegramAccount.update.mockResolvedValue(row({ id: 'tg-1', isActive: false }));
    await expect(svc.setActive('acc1', 'tg-1', false)).resolves.toBeTruthy();
  });

  it('remove(): cascades by clearing HrTelegramSession rows for the slot', async () => {
    prisma.client.hrTelegramAccount.findFirst
      .mockResolvedValueOnce(row({ id: 'tg-1', slot: 2 })) // findInternal
      .mockResolvedValueOnce(row({ id: 'tg-1', slot: 2 })); // slot lookup
    prisma.client.hrTelegramAccount.delete.mockResolvedValue({} as never);
    prisma.client.hrTelegramSession.deleteMany.mockResolvedValue({ count: 3 });

    await svc.remove('acc1', 'tg-1');

    expect(prisma.client.hrTelegramSession.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'acc1', accountSlot: 2 },
    });
    expect(prisma.client.hrTelegramAccount.delete).toHaveBeenCalled();
  });

  it('setFloodWaitUntil() persists the window on the (acc, slot) row', async () => {
    const until = new Date('2026-05-21T11:00:00Z');
    prisma.client.hrTelegramAccount.updateMany.mockResolvedValue({ count: 1 });
    await svc.setFloodWaitUntil('acc1', 1, until);
    expect(prisma.client.hrTelegramAccount.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc1', slot: 1 },
      data: { floodWaitUntil: until },
    });
  });

  it('isFlooded(): true when floodWaitUntil > now, false otherwise', async () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValueOnce({ floodWaitUntil: future });
    expect(await svc.isFlooded('acc1', 1)).toBe(true);
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValueOnce({ floodWaitUntil: past });
    expect(await svc.isFlooded('acc1', 1)).toBe(false);
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValueOnce({ floodWaitUntil: null });
    expect(await svc.isFlooded('acc1', 1)).toBe(false);
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValueOnce(null);
    expect(await svc.isFlooded('acc1', 1)).toBe(false);
  });

  it('persistSession(): encrypts + auto-activates + clears flood-wait', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(row({ id: 'tg-1' }));
    prisma.client.hrTelegramAccount.update.mockResolvedValue(
      row({ id: 'tg-1', sessionEncrypted: 'enc', isActive: true }),
    );

    const result = await svc.persistSession('acc1', 'tg-1', '1ABCdef...session-string');

    expect(result.isActive).toBe(true);
    expect(result.hasSession).toBe(true);
    const updateArgs = prisma.client.hrTelegramAccount.update.mock.calls[0]?.[0] as {
      data: {
        sessionEncrypted: string;
        isActive: boolean;
        floodWaitUntil: null;
        lastConnectedAt: Date;
      };
    };
    expect(updateArgs.data.isActive).toBe(true);
    expect(updateArgs.data.floodWaitUntil).toBeNull();
    expect(updateArgs.data.lastConnectedAt).toBeInstanceOf(Date);
    // Encrypted (3-part hex format)
    expect(updateArgs.data.sessionEncrypted.split(':')).toHaveLength(3);
  });

  it('findActiveBySlot(): returns null when no active row in that slot', async () => {
    prisma.client.hrTelegramAccount.findFirst.mockResolvedValue(null);
    expect(await svc.findActiveBySlot('acc1', 1)).toBeNull();
  });
});
