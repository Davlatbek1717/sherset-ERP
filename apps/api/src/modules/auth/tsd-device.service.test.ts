import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { POS_DEVICE_MAX_ATTEMPTS } from './pos-device.service.js';
import { TsdDeviceService } from './tsd-device.service.js';

interface Row {
  id: string;
  accountId: string;
  storeId: string;
  name: string;
  secretHash: string;
  revokedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

function makePrisma(row: Row | null, store: { id: string } | null = { id: 'store-1' }) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const creates: Array<Record<string, unknown>> = [];
  const client = {
    store: { findFirst: vi.fn().mockResolvedValue(store) },
    tsdDevice: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi
        .fn()
        .mockImplementation(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updates.push(args);
          return row;
        }),
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        creates.push(args.data);
        return { id: 'tsd-new', name: args.data.name, storeId: args.data.storeId };
      }),
    },
  };
  return { prisma: { client } as never, updates, creates, client };
}

async function makeRow(secret: string, over: Partial<Row> = {}): Promise<Row> {
  return {
    id: 'tsd-1',
    accountId: 'acc-1',
    storeId: 'store-1',
    name: 'TSD-1',
    secretHash: await argon2.hash(secret),
    revokedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    ...over,
  };
}

describe('TsdDeviceService.pair', () => {
  it('kalitni QAYTARADI, bazaga faqat xeshini yozadi', async () => {
    const { prisma, creates } = makePrisma(null);
    const out = await new TsdDeviceService(prisma).pair('acc-1', 'emp-1', {
      name: 'TSD-1',
      storeId: 'store-1',
    });
    expect(out.deviceSecret).toMatch(/^[0-9a-f]{64}$/);
    // Ochiq kalit HECH QAYERDA saqlanmaydi.
    expect(JSON.stringify(creates)).not.toContain(out.deviceSecret);
    const written = creates[0] as Record<string, string>;
    await expect(argon2.verify(written.secretHash as string, out.deviceSecret)).resolves.toBe(true);
  });

  it('BEGONA akkauntning ombori bilan juftlab bo`lmaydi', async () => {
    // Tenant chegarasi: `pos_devices` da `store_id` FK yo'q edi, TSD da yopiq.
    const { prisma } = makePrisma(null, null);
    await expect(
      new TsdDeviceService(prisma).pair('acc-1', 'emp-1', { name: 'X', storeId: 'begona' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TsdDeviceService.verify', () => {
  it('to`g`ri kalit — kontekst qaytadi (kassa/tashkilot YO`Q)', async () => {
    const secret = 'a'.repeat(64);
    const { prisma } = makePrisma(await makeRow(secret));
    const ctx = await new TsdDeviceService(prisma).verify('tsd-1', secret);
    expect(ctx).toEqual({ id: 'tsd-1', accountId: 'acc-1', storeId: 'store-1', name: 'TSD-1' });
    expect(Object.keys(ctx)).not.toContain('cashDeskId');
  });

  it('qurilma yo`q / bekor qilingan / kalit noto`g`ri — BIR XIL 401', async () => {
    const secret = 'a'.repeat(64);
    const messages: string[] = [];
    for (const [row, key] of [
      [null, secret],
      [await makeRow(secret, { revokedAt: new Date() }), secret],
      [await makeRow(secret), 'b'.repeat(64)],
    ] as Array<[Row | null, string]>) {
      const { prisma } = makePrisma(row);
      const err = await new TsdDeviceService(prisma).verify('tsd-1', key).catch((e: Error) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      messages.push((err as Error).message);
    }
    // Farqli xabar qurilmalarni sanab chiqishga yo'l ochardi.
    expect(new Set(messages).size).toBe(1);
  });

  it('qulflangan qurilma — 423 va qolgan daqiqa', async () => {
    const secret = 'a'.repeat(64);
    const row = await makeRow(secret, { lockedUntil: new Date(Date.now() + 5 * 60_000) });
    const { prisma } = makePrisma(row);
    const err = (await new TsdDeviceService(prisma)
      .verify('tsd-1', secret)
      .catch((e: Error) => e)) as HttpException;
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(423);
  });
});

describe('TsdDeviceService.loadActive — refresh yo`li', () => {
  it('tirik qurilma qaytadi (KALIT so`ralmaydi)', async () => {
    const { prisma } = makePrisma(await makeRow('x'.repeat(64)));
    await expect(new TsdDeviceService(prisma).loadActive('tsd-1')).resolves.toMatchObject({
      id: 'tsd-1',
      storeId: 'store-1',
    });
  });

  it('bekor qilingan qurilma → null (sessiya refresh`da o`ladi)', async () => {
    const row = await makeRow('x'.repeat(64), { revokedAt: new Date() });
    const { prisma } = makePrisma(row);
    await expect(new TsdDeviceService(prisma).loadActive('tsd-1')).resolves.toBeNull();
  });
});

describe('TsdDeviceService — qulf hisoblagichi BAZADA', () => {
  it('chegaraga yetganda qulflaydi va hisoblagichni nolga tushiradi', async () => {
    const row = await makeRow('x'.repeat(64), { failedAttempts: POS_DEVICE_MAX_ATTEMPTS - 1 });
    const { prisma, updates } = makePrisma(row);
    await new TsdDeviceService(prisma).registerFailure('tsd-1');
    const data = updates[0]?.data as Record<string, unknown>;
    expect(data.failedAttempts).toBe(0);
    expect(data.lockedUntil).toBeInstanceOf(Date);
  });

  it('chegaradan oldin faqat hisoblagich o`sadi', async () => {
    const { prisma, updates } = makePrisma(await makeRow('x'.repeat(64), { failedAttempts: 1 }));
    await new TsdDeviceService(prisma).registerFailure('tsd-1');
    const data = updates[0]?.data as Record<string, unknown>;
    expect(data.failedAttempts).toBe(2);
    expect(data.lockedUntil).toBeNull();
  });

  it('versiya YUBORILMASA `appVersion` ustuni TEGILMAYDI', async () => {
    // Aks holda versiya yubormagan klient reyestrni o'chirib yuborardi (K07).
    const { prisma, updates } = makePrisma(await makeRow('x'.repeat(64)));
    const svc = new TsdDeviceService(prisma);
    await svc.registerSuccess('tsd-1');
    expect(updates[0]?.data).not.toHaveProperty('appVersion');
    await svc.registerSuccess('tsd-1', '0.1.0');
    expect(updates[1]?.data).toMatchObject({ appVersion: '0.1.0' });
  });
});
