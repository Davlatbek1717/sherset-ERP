import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { POS_DEVICE_MAX_ATTEMPTS, PosDeviceService } from './pos-device.service.js';

interface Row {
  id: string;
  accountId: string;
  storeId: string;
  cashDeskId: string;
  organizationId: string;
  name: string;
  secretHash: string;
  revokedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

function makePrisma(row: Row | null) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const creates: Array<Record<string, unknown>> = [];
  const client = {
    posDevice: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi
        .fn()
        .mockImplementation(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updates.push(args);
          return row;
        }),
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        creates.push(args.data);
        return { id: 'dev-new', name: args.data.name };
      }),
    },
  };
  return { prisma: { client } as never, updates, creates, client };
}

async function makeRow(secret: string, over: Partial<Row> = {}): Promise<Row> {
  return {
    id: 'dev-1',
    accountId: 'acc-1',
    storeId: 'store-1',
    cashDeskId: 'desk-1',
    organizationId: 'org-1',
    name: '1-kassa',
    secretHash: await argon2.hash(secret),
    revokedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    ...over,
  };
}

describe('PosDeviceService.pair', () => {
  it('kalitni QAYTARADI, lekin bazaga faqat xeshini yozadi', async () => {
    const { prisma, creates } = makePrisma(null);
    const svc = new PosDeviceService(prisma);
    const out = await svc.pair('acc-1', 'emp-1', {
      name: '1-kassa',
      storeId: 'store-1',
      cashDeskId: 'desk-1',
      organizationId: 'org-1',
    });
    expect(out.deviceSecret).toMatch(/^[0-9a-f]{64}$/);
    const written = creates[0] as Record<string, string>;
    // Ochiq kalit HECH QAYERDA saqlanmaydi.
    expect(JSON.stringify(creates)).not.toContain(out.deviceSecret);
    // Xesh haqiqatan shu kalitniki (bo'sh/soxta xesh emas).
    expect(await argon2.verify(written.secretHash, out.deviceSecret)).toBe(true);
  });

  it('har juftlashda YANGI kalit beradi', async () => {
    const svc = new PosDeviceService(makePrisma(null).prisma);
    const input = {
      name: 'k',
      storeId: 'store-1',
      cashDeskId: 'desk-1',
      organizationId: 'org-1',
    };
    const a = await svc.pair('acc-1', 'emp-1', input);
    const b = await svc.pair('acc-1', 'emp-1', input);
    expect(a.deviceSecret).not.toBe(b.deviceSecret);
  });
});

describe('PosDeviceService.verify', () => {
  it('to`g`ri kalit → kontekst qaytadi', async () => {
    const row = await makeRow('s3cret');
    const svc = new PosDeviceService(makePrisma(row).prisma);
    const ctx = await svc.verify('dev-1', 's3cret');
    expect(ctx).toMatchObject({ accountId: 'acc-1', cashDeskId: 'desk-1', storeId: 'store-1' });
  });

  it('noto`g`ri kalit → 401', async () => {
    const row = await makeRow('s3cret');
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 'boshqa')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('qurilma yo`q → 401 (mavjudligini oshkor qilmaydi)', async () => {
    const svc = new PosDeviceService(makePrisma(null).prisma);
    await expect(svc.verify('yo-q', 's3cret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bekor qilingan qurilma → 401', async () => {
    const row = await makeRow('s3cret', { revokedAt: new Date() });
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 's3cret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('qulflangan qurilma → 423, qolgan daqiqa xabarda', async () => {
    const row = await makeRow('s3cret', { lockedUntil: new Date(Date.now() + 10 * 60_000) });
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 's3cret')).rejects.toThrow(/daqiqa/);
  });

  it('qulf muddati o`tgan → o`tkazadi', async () => {
    const row = await makeRow('s3cret', { lockedUntil: new Date(Date.now() - 60_000) });
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 's3cret')).resolves.toBeTruthy();
  });
});

describe('PosDeviceService.registerFailure', () => {
  it('chegaraga yetganda qulflaydi', async () => {
    const row = await makeRow('s3cret', { failedAttempts: POS_DEVICE_MAX_ATTEMPTS - 1 });
    const { prisma, updates } = makePrisma(row);
    await new PosDeviceService(prisma).registerFailure('dev-1');
    expect(updates[0]?.data.lockedUntil).toBeInstanceOf(Date);
  });

  it('chegaradan past — faqat hisoblagich oshadi, qulf yo`q', async () => {
    const row = await makeRow('s3cret', { failedAttempts: 0 });
    const { prisma, updates } = makePrisma(row);
    await new PosDeviceService(prisma).registerFailure('dev-1');
    expect(updates[0]?.data.failedAttempts).toBe(1);
    expect(updates[0]?.data.lockedUntil).toBeNull();
  });

  it('qurilma yo`q bo`lsa jim qaytadi (yozuvsiz)', async () => {
    const { prisma, updates } = makePrisma(null);
    await new PosDeviceService(prisma).registerFailure('yo-q');
    expect(updates).toHaveLength(0);
  });
});

describe('PosDeviceService.registerSuccess', () => {
  it('hisoblagichni nolga tushiradi va lastSeenAt yozadi', async () => {
    const row = await makeRow('s3cret', { failedAttempts: 3 });
    const { prisma, updates } = makePrisma(row);
    await new PosDeviceService(prisma).registerSuccess('dev-1');
    expect(updates[0]?.data).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    expect(updates[0]?.data.lastSeenAt).toBeInstanceOf(Date);
  });
});
