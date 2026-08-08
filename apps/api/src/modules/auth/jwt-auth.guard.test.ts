import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * AUTH-04 — `?access_token=` query-param faqat header yubora olmaydigan
 * marshrutlarda (SSE oqimi + <img>/top-level-nav media yo'llari) qabul
 * qilinishi kerak. Aks holda amaldagi JWT istalgan endpoint URL'ida yuradi
 * va nginx access-log / brauzer-tarix / Referer orqali sizadi.
 *
 * Semantika:
 *  - Authorization: Bearer — HAR marshrutda ishlaydi (asosiy yo'l);
 *  - query-token — FAQAT allowlist'dagi marshrutlarda (SSE + media raw);
 *  - query-token boshqa istalgan endpointda → 401, token verify ham
 *    chaqirilmaydi (log-sizgan token bilan API'ni ochib bo'lmaydi).
 */

interface FakeReq {
  headers: Record<string, string | undefined>;
  url: string;
  query?: Record<string, unknown>;
  user?: unknown;
}

function ctx(req: FakeReq) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function makeGuard() {
  const verify = vi.fn().mockResolvedValue({ sub: 'emp-1', accountId: 'acc-1' });
  const guard = new JwtAuthGuard({ verifyAccessToken: verify } as never);
  return { guard, verify };
}

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

  it.each([
    '/api/v1/images/img-9/raw?access_token=tok-1',
    '/api/v1/attachments/att-3/raw?access_token=tok-1',
    '/api/v1/purchase-orders/list-report?access_token=tok-1&state=filtered',
    '/api/v1/hr/employees/emp-7/image/raw?access_token=tok-1',
  ])('query-token media marshrutida qabul qilinadi: %s', async (url) => {
    const { guard } = makeGuard();
    const req: FakeReq = { headers: {}, url, query: { access_token: 'tok-1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
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
