import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * AUTH-04 — `?access_token=` query-param faqat header yubora olmaydigan
 * marshrutlarda qabul qilinishi kerak. Aks holda amaldagi JWT istalgan
 * endpoint URL'ida yuradi va nginx access-log / brauzer-tarix / Referer
 * orqali sizadi.
 *
 * **Faza Q13 (2026-08-09) — allowlist SSE'gacha qisqardi.** Media
 * marshrutlari (`/images/:id/raw`, `/attachments/:id/raw`,
 * `/hr/employees/:id/image/raw`, `/purchase-orders/list-report`) endi
 * **amaldagi access-token'ni query'da QABUL QILMAYDI** — ular
 * HttpOnly `ms_mt` cookie'sidagi imzolangan, qisqa muddatli media-token
 * bilan ishlaydi (URL'da hech qanday sir yo'q ⇒ log/tarix sizishi nolga
 * tushdi). SSE (`/notifications/stream`) ATAYLAB qoladi: `EventSource`
 * custom header ham, cross-window cookie kafolati ham bermaydi.
 *
 * Semantika:
 *  - Authorization: Bearer — HAR marshrutda ishlaydi (asosiy yo'l);
 *  - query-token — FAQAT SSE oqimida;
 *  - media-cookie — FAQAT media marshrutlarida;
 *  - query-token boshqa istalgan endpointda → 401, token verify ham
 *    chaqirilmaydi (log-sizgan token bilan API'ni ochib bo'lmaydi).
 */

interface FakeReq {
  headers: Record<string, string | undefined>;
  url: string;
  query?: Record<string, unknown>;
  cookies?: Record<string, string | undefined>;
  user?: unknown;
}

function ctx(req: FakeReq) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

const MEDIA_USER = { sub: 'emp-9', accountId: 'acc-9' };

function makeGuard() {
  const verify = vi.fn().mockResolvedValue({ sub: 'emp-1', accountId: 'acc-1' });
  const verifyMedia = vi.fn((raw: string | null | undefined) =>
    raw === 'media-ok' ? MEDIA_USER : null,
  );
  const guard = new JwtAuthGuard({
    verifyAccessToken: verify,
    verifyMediaToken: verifyMedia,
  } as never);
  return { guard, verify, verifyMedia };
}

const MEDIA_URLS = [
  '/api/v1/images/img-9/raw',
  '/api/v1/attachments/att-3/raw',
  '/api/v1/purchase-orders/list-report?state=filtered',
  '/api/v1/hr/employees/emp-7/image/raw',
];

describe('JwtAuthGuard token transport (AUTH-04)', () => {
  it('Bearer header har qanday marshrutda ishlaydi', async () => {
    const { guard, verify } = makeGuard();
    const req: FakeReq = { headers: { authorization: 'Bearer tok-1' }, url: '/api/v1/payment-in' };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('tok-1');
    expect(req.user).toEqual({ sub: 'emp-1', accountId: 'acc-1' });
  });

  it('query-token SSE oqimida qabul qilinadi', async () => {
    const { guard } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/notifications/stream?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });

  it.each(MEDIA_URLS)('query-token media marshrutida endi RAD etiladi: %s', async (url) => {
    const { guard, verify } = makeGuard();
    const sep = url.includes('?') ? '&' : '?';
    const req: FakeReq = {
      headers: {},
      url: `${url}${sep}access_token=tok-1`,
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(MEDIA_URLS)('media-cookie media marshrutida qabul qilinadi: %s', async (url) => {
    const { guard, verifyMedia } = makeGuard();
    const req: FakeReq = { headers: {}, url, cookies: { ms_mt: 'media-ok' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(verifyMedia).toHaveBeenCalledWith('media-ok');
    expect(req.user).toEqual(MEDIA_USER);
  });

  it('muddati tugagan / yaroqsiz media-cookie → 401', async () => {
    const { guard } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/images/img-9/raw',
      cookies: { ms_mt: 'media-expired' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
  });

  it('media-cookie ODDIY endpointda ishlamaydi (audience ajratmasi)', async () => {
    const { guard, verifyMedia } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/payment-in',
      cookies: { ms_mt: 'media-ok' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verifyMedia).not.toHaveBeenCalled();
  });

  it('media-cookie SSE oqimida ham ishlamaydi (faqat media yo‘llari)', async () => {
    const { guard, verifyMedia } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/notifications/stream',
      cookies: { ms_mt: 'media-ok' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verifyMedia).not.toHaveBeenCalled();
  });

  it.each(MEDIA_URLS)('Bearer header media marshrutida ham ishlayveradi: %s', async (url) => {
    const { guard, verify } = makeGuard();
    const req: FakeReq = { headers: { authorization: 'Bearer tok-1' }, url };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('tok-1');
  });

  it('query-token ODDIY endpointda RAD etiladi (401, verify chaqirilmaydi)', async () => {
    const { guard, verify } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/payment-in?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('prefiks-o‘xshash marshrut allowlist’ga tushmaydi', async () => {
    const { guard } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/notifications/stream/extra?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
  });

  it('token umuman yo‘q → 401', async () => {
    const { guard } = makeGuard();
    const req: FakeReq = { headers: {}, url: '/api/v1/products' };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
  });
});
