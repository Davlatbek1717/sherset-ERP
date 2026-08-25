import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TsdGuard } from './tsd.guard.js';

/**
 * `TsdGuard` — server cheklovi (G-reja G5).
 *
 * Qulflanadigan shartnomalar (buzilsa xavfsizlik teshigi):
 *   1. TSD sessiyasi ro'yxatdan tashqariga **403** (ayniqsa narx yo'llariga);
 *   2. oddiy sessiyaga umuman tegilmaydi — `deviceMode` yo'q token cheklanmaydi
 *      (ESKI tokenlar jimgina qulflanib qolmasin);
 *   3. tokensiz/buzuq so'rov **o'tkaziladi** — 401 `JwtAuthGuard` ning ishi;
 *   4. global guard `req.user` bo'sh bo'lsa **tokenni o'zi o'qiydi**.
 */

function makeCtx(opts: {
  method?: string;
  url?: string;
  user?: unknown;
  authHeader?: string;
  type?: string;
}) {
  const req = {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/v1/products',
    user: opts.user,
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
  };
  return {
    getType: () => opts.type ?? 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function makeGuard(decoded?: unknown) {
  const verifyAccessToken = vi
    .fn()
    .mockImplementation(() =>
      decoded ? Promise.resolve(decoded) : Promise.reject(new Error('bad')),
    );
  return { guard: new TsdGuard({ verifyAccessToken } as never), verifyAccessToken };
}

const TSD = { sub: 'emp-1', deviceMode: 'tsd' };
const NORMAL = { sub: 'emp-2', uiMode: 'full' };
/** Kiosk kassiri — `deviceMode` YO'Q, ya'ni bu guard uni ko'rmaydi. */
const KIOSK = { sub: 'emp-3', uiMode: 'kiosk' };

describe('TSD sessiyasi', () => {
  it('ruxsat etilgan endpointga o`tadi', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/restock-tasks', user: TSD })),
    ).resolves.toBe(true);
  });

  it('NARX yo`liga 403 — asosiy sabab', async () => {
    const { guard } = makeGuard();
    // Terminal ekranida tugma ko'rsatmaslik himoya emas: token haqiqiy.
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/products?search=kabel', user: TSD })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('kassa yo`liga 403', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(makeCtx({ method: 'POST', url: '/api/v1/retail-sales', user: TSD })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('`req.user` bo`lmasa tokenni O`ZI o`qiydi', async () => {
    // Global guard controller guardidan OLDIN ishlaydi ⇒ `req.user` bo'sh.
    const { guard, verifyAccessToken } = makeGuard(TSD);
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/products', authHeader: 'Bearer x.y.z' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verifyAccessToken).toHaveBeenCalledWith('x.y.z');
  });
});

describe('TSD BO`LMAGAN sessiya — tegilmaydi', () => {
  it('oddiy foydalanuvchi cheklanmaydi', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ user: NORMAL }))).resolves.toBe(true);
  });

  it('kiosk kassiri bu guard uchun ko`rinmas (uni `KioskGuard` cheklaydi)', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ user: KIOSK }))).resolves.toBe(true);
  });

  it('`deviceMode` da`vosi yo`q ESKI token cheklanmaydi', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ user: { sub: 'emp-9' } }))).resolves.toBe(true);
  });
});

describe('autentifikatsiya bu guardning ishi EMAS', () => {
  it('tokensiz so`rov o`tkaziladi (401 ni JwtAuthGuard beradi)', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ url: '/api/v1/products' }))).resolves.toBe(true);
  });

  it('buzuq token o`tkaziladi', async () => {
    const { guard } = makeGuard(); // verify reject
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/products', authHeader: 'Bearer buzuq' })),
    ).resolves.toBe(true);
  });

  it('HTTP bo`lmagan kontekstga tegilmaydi', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ type: 'ws', user: TSD }))).resolves.toBe(true);
  });
});
