import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard.js';

/**
 * AUTH-04 regressiya qulfi — PermissionsGuard ham token'ni o'zi backfill
 * qiladi (APP_GUARD kontroller-guarddan OLDIN yuradi), shuning uchun
 * query-token cheklovi bu yerda ham bir xil bo'lishi shart. Aks holda
 * JwtAuthGuard yopilgan teshik @RequirePermission'li endpointlarda
 * qaytadan ochiladi.
 *
 * **Faza Q13:** media marshrutlari query-token'dan HttpOnly `ms_mt`
 * media-cookie'siga o'tdi — backfill yo'li ham xuddi shu ikki qoidaga
 * bo'ysunadi (query-token faqat SSE; media-cookie faqat media yo'llari).
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
    getHandler: () => function handler() {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function makeGuard() {
  const verify = vi.fn().mockResolvedValue({ sub: 'emp-1', accountId: 'acc-1' });
  const verifyMedia = vi.fn((raw: string | null | undefined) =>
    raw === 'media-ok' ? { sub: 'emp-9', accountId: 'acc-9' } : null,
  );
  const require = vi.fn().mockResolvedValue(undefined);
  const guard = new PermissionsGuard(
    { get: () => ({ entity: 'product', action: 'view' }) } as never,
    { require } as never,
    { verifyAccessToken: verify, verifyMediaToken: verifyMedia } as never,
  );
  return { guard, verify, verifyMedia, require };
}

describe('PermissionsGuard token backfill (AUTH-04)', () => {
  it('query-token oddiy endpointda RAD etiladi', async () => {
    const { guard, verify } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/products?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('query-token SSE oqimida ishlaydi (yagona qolgan allowlist)', async () => {
    const { guard, require } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/notifications/stream?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(require).toHaveBeenCalledWith('emp-1', 'product', 'view', 'OWN');
  });

  it('query-token media marshrutida endi RAD etiladi (list-report, Faza Q13)', async () => {
    const { guard, verify } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/purchase-orders/list-report?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('media-cookie media marshrutida backfill qiladi (list-report)', async () => {
    const { guard, require } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/purchase-orders/list-report?state=new',
      cookies: { ms_mt: 'media-ok' },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(require).toHaveBeenCalledWith('emp-9', 'product', 'view', 'OWN');
  });

  it('media-cookie oddiy endpointda RAD etiladi', async () => {
    const { guard, verifyMedia } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/products',
      cookies: { ms_mt: 'media-ok' },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(UnauthorizedException);
    expect(verifyMedia).not.toHaveBeenCalled();
  });

  it('Bearer header avvalgidek har joyda ishlaydi', async () => {
    const { guard } = makeGuard();
    const req: FakeReq = { headers: { authorization: 'Bearer tok-1' }, url: '/api/v1/products' };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });
});
