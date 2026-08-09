import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiTokenService } from './api-token.service.js';

/**
 * Faza 24 (`INT-07`) — yaratish tomoni.
 *
 * Scope endi guard'da MAJBURLANADI ⇒ typo'li scope («prodcut:read») endi
 * jimgina «hech narsa ochilmaydi» degani. Admin buni yaratish paytida
 * bilishi kerak, birinchi 403 dan emas. Shu sabab create-da sintaksis
 * tekshiriladi va normallashtiriladi.
 */

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1';

function makeService() {
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'tok-1',
    name: args.data.name,
    ...args.data,
  }));
  const prisma = { client: { apiToken: { create, findFirst: vi.fn(), update: vi.fn() } } };
  return { svc: new ApiTokenService(prisma as never), create };
}

describe('ApiTokenService.create — scope validatsiyasi', () => {
  it('to`g`ri scope`larni normallashtirib saqlaydi', async () => {
    const { svc, create } = makeService();
    await svc.create(ACCOUNT_ID, null, {
      name: 'Integration',
      scopes: [' Product ', 'demand:READ'],
    });
    expect(create.mock.calls[0]?.[0].data.scopes).toEqual(['product', 'demand:read']);
  });

  it('scope`siz token avvalgidek yaratiladi (bo`sh massiv)', async () => {
    const { svc, create } = makeService();
    await svc.create(ACCOUNT_ID, null, { name: 'Legacy' });
    expect(create.mock.calls[0]?.[0].data.scopes).toEqual([]);
  });

  it('yaroqsiz scope sintaksisini rad etadi', async () => {
    const { svc, create } = makeService();
    await expect(
      svc.create(ACCOUNT_ID, null, { name: 'Bad', scopes: ['product:delete'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('plaintext tokenni bir marta qaytaradi (regress)', async () => {
    const { svc } = makeService();
    const r = await svc.create(ACCOUNT_ID, null, { name: 'Integration' });
    expect(r.token).toMatch(/^[0-9a-f]{40}$/);
  });
});

/**
 * Faza Q14 (`INT-07` DEFER-4) — slug REYESTRIGA solishtirish.
 *
 * Faza 24 faqat sintaksisni tekshirardi: `prodcut:read` grammatikaga mos
 * ⇒ o'tib ketardi, keyin fail-closed bo'lgani uchun HECH NARSA ochmasdi.
 * Admin buni faqat integratsiyaning birinchi 403 ida bilardi. Endi noma'lum
 * slug yaratish paytida rad etiladi va xato matni QAYSI slug ekanini aytadi.
 */
describe('ApiTokenService.create — slug reyestri (Faza Q14)', () => {
  it('noma`lum slug`ni RAD etadi va nomini xato matnida ko`rsatadi', async () => {
    const { svc, create } = makeService();
    await expect(
      svc.create(ACCOUNT_ID, null, { name: 'Typo', scopes: ['prodcut:read'] }),
    ).rejects.toThrow(/prodcut:read/);
    expect(create).not.toHaveBeenCalled();
  });

  it('bir nechta noto`g`ri slug — hammasi sanab o`tiladi', async () => {
    const { svc } = makeService();
    await expect(
      svc.create(ACCOUNT_ID, null, { name: 'Typo', scopes: ['product', 'orders', 'kontragent'] }),
    ).rejects.toThrow(/orders[\s\S]*kontragent|kontragent[\s\S]*orders/);
  });

  it('noma`lum slug BadRequestException (400) beradi', async () => {
    const { svc } = makeService();
    await expect(
      svc.create(ACCOUNT_ID, null, { name: 'Typo', scopes: ['nosuchslug'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reyestrdagi slug va `*` o`tadi (regress)', async () => {
    const { svc, create } = makeService();
    await svc.create(ACCOUNT_ID, null, {
      name: 'Ok',
      scopes: ['*', 'product:read', 'customerorder:write', 'retaildemand'],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('ApiTokenService.list — sir oshkor bo`lmaydi (Faza Q14)', () => {
  it('tanlangan ustunlar orasida tokenHash YO`Q', async () => {
    const findMany = vi.fn(async (_args: { select: Record<string, unknown> }) => []);
    const prisma = { client: { apiToken: { findMany } } };
    const svc = new ApiTokenService(prisma as never);
    await svc.list(ACCOUNT_ID);
    const select = findMany.mock.calls[0]?.[0]?.select as Record<string, unknown>;
    expect(select).toBeDefined();
    expect(Object.keys(select)).not.toContain('tokenHash');
  });
});
