import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard.js';

/**
 * AUTH-04 regressiya qulfi — PermissionsGuard ham token'ni o'zi backfill
 * qiladi (APP_GUARD kontroller-guarddan OLDIN yuradi), shuning uchun
 * query-token cheklovi bu yerda ham bir xil bo'lishi shart. Aks holda
 * JwtAuthGuard yopilgan teshik @RequirePermission'li endpointlarda
 * qaytadan ochiladi.
 */

interface FakeReq {
  headers: Record<string, string | undefined>;
  url: string;
  query?: Record<string, unknown>;
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
  const require = vi.fn().mockResolvedValue(undefined);
  const guard = new PermissionsGuard(
    { get: () => ({ entity: 'product', action: 'view' }) } as never,
    { require } as never,
    { verifyAccessToken: verify } as never,
  );
  return { guard, verify, require };
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

  it('query-token allowlist marshrutida ishlaydi (list-report)', async () => {
    const { guard, require } = makeGuard();
    const req: FakeReq = {
      headers: {},
      url: '/api/v1/purchase-orders/list-report?access_token=tok-1',
      query: { access_token: 'tok-1' },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(require).toHaveBeenCalledWith('emp-1', 'product', 'view', 'OWN');
  });

  it('Bearer header avvalgidek har joyda ishlaydi', async () => {
    const { guard } = makeGuard();
    const req: FakeReq = { headers: { authorization: 'Bearer tok-1' }, url: '/api/v1/products' };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });
});
