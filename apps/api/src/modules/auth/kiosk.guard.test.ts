import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { KioskGuard } from './kiosk.guard.js';

/**
 * `KioskGuard` — server cheklovi (kassa TZ §3.1).
 *
 * Qulflanadigan shartnomalar (buzilsa xavfsizlik teshigi):
 *   1. kiosk foydalanuvchi ro'yxatdan tashqariga **403**;
 *   2. `full` foydalanuvchiga umuman tegilmaydi;
 *   3. tokensiz/buzuq so'rov **o'tkaziladi** — 401 `JwtAuthGuard` ning ishi
 *      (bu yerda bloklash public endpointlarni ham yopib qo'yardi);
 *   4. global guard `req.user` bo'sh bo'lsa **tokenni o'zi o'qiydi**
 *      (Nest'da global guard controller guardidan oldin ishlaydi).
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
  return { guard: new KioskGuard({ verifyAccessToken } as never), verifyAccessToken };
}

const KIOSK = { sub: 'emp-1', uiMode: 'kiosk' };
const FULL = { sub: 'emp-2', uiMode: 'full' };

describe('kiosk foydalanuvchi', () => {
  it('ruxsat etilgan endpointga o`tadi', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(makeCtx({ method: 'POST', url: '/api/v1/retail-sales', user: KIOSK })),
    ).resolves.toBe(true);
  });

  it('ro`yxatdan TASHQARIGA 403', async () => {
    const { guard } = makeGuard();
    // Chap menyuni yashirish buni to'xtatmasdi — bevosita URL bilan kirardi.
    await expect(
      guard.canActivate(
        makeCtx({ method: 'GET', url: '/api/v1/reports/profitability', user: KIOSK }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('o`qishga ochiq resursga YOZISH ham 403', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(makeCtx({ method: 'POST', url: '/api/v1/products', user: KIOSK })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('so`rov qatori qaror`ga ta`sir qilmaydi', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/retail-sales?state=ready', user: KIOSK })),
    ).resolves.toBe(true);
  });
});

describe('full foydalanuvchi — tegilmaydi', () => {
  it.each(['/api/v1/reports/profitability', '/api/v1/hr/employees', '/api/v1/manager/kpi/days'])(
    '%s → o`tadi',
    async (url) => {
      const { guard } = makeGuard();
      await expect(guard.canActivate(makeCtx({ url, user: FULL }))).resolves.toBe(true);
    },
  );

  it('`uiMode` umuman yo`q eski token ham full deb qaraladi', async () => {
    // Refresh'gacha hech kim jimgina cheklanib qolmasin.
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/hr/employees', user: { sub: 'x' } })),
    ).resolves.toBe(true);
  });
});

describe('autentifikatsiya bu guardning ishi EMAS', () => {
  it('tokensiz so`rov o`tkaziladi (401 ni JwtAuthGuard beradi)', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ url: '/api/v1/hr/employees' }))).resolves.toBe(true);
  });

  it('buzuq token o`tkaziladi', async () => {
    const { guard } = makeGuard(); // verify reject qiladi
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/hr/employees', authHeader: 'Bearer buzuq' })),
    ).resolves.toBe(true);
  });

  it('HTTP bo`lmagan kontekstga tegilmaydi', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(makeCtx({ type: 'ws', user: KIOSK }))).resolves.toBe(true);
  });
});

describe('global guard — `req.user` bo`sh bo`lsa tokenni O`ZI o`qiydi', () => {
  it('sarlavhadagi kiosk tokeni bloklaydi', async () => {
    // Nest'da global guard controller-darajasidagi JwtAuthGuard dan OLDIN
    // ishlaydi, ya'ni `req.user` hali to'ldirilmagan bo'ladi.
    const { guard, verifyAccessToken } = makeGuard(KIOSK);
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/hr/employees', authHeader: 'Bearer t' })),
    ).rejects.toThrow(ForbiddenException);
    expect(verifyAccessToken).toHaveBeenCalledWith('t');
  });

  it('`Bearer` bo`lmagan sarlavha o`qilmaydi', async () => {
    const { guard, verifyAccessToken } = makeGuard(KIOSK);
    await expect(
      guard.canActivate(makeCtx({ url: '/api/v1/hr/employees', authHeader: 'Basic abc' })),
    ).resolves.toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });
});
