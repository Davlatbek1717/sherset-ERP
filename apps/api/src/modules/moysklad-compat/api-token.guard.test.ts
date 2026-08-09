import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiTokenGuard } from './api-token.guard.js';

/**
 * Faza 24 (`INT-07`) — guard darajasidagi scope-enforcement.
 *
 * Bug: muvaffaqiyatli ApiToken uchun `permissions: ['*']` QAT'IY yozilardi
 * va `apiToken.scopes` umuman o'qilmasdi ⇒ «faqat product» tokeni
 * kontragent/buyurtma/narxlarni ham o'qiy olardi.
 */

const TOKEN = 'a'.repeat(40);

function makeCtx(opts: { url?: string; method?: string; auth?: string }) {
  const req = {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/v1/api/remap/1.2/entity/product',
    ip: '1.2.3.4',
    headers: { authorization: opts.auth ?? `Bearer ${TOKEN}` },
  } as Record<string, unknown>;
  return {
    req,
    ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never,
  };
}

function makeGuard(apiToken: Record<string, unknown> | null) {
  const update = vi.fn(async () => ({}));
  const prisma = {
    client: {
      apiToken: {
        findUnique: vi.fn(async () => apiToken),
        update,
      },
    },
  };
  const tokens = { verifyAccessToken: vi.fn(async () => ({ sub: 'jwt-user' })) };
  return {
    guard: new ApiTokenGuard(prisma as never, tokens as never),
    update,
    verifyAccessToken: tokens.verifyAccessToken,
  };
}

function row(scopes: string[]) {
  return {
    id: 'tok-1',
    accountId: 'acc-1',
    employeeId: null,
    name: 'Integration',
    scopes,
    revokedAt: null,
    expiresAt: null,
    account: {},
    employee: null,
  };
}

describe('scope-cheklangan token', () => {
  it('o`z slug`iga kiradi', async () => {
    const { guard } = makeGuard(row(['product:read']));
    const { ctx, req } = makeCtx({ url: '/api/v1/api/remap/1.2/entity/product?limit=10' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.user as { permissions: string[] }).permissions).not.toContain('*');
  });

  it('BOSHQA slug`ga 403 (asosiy teshik)', async () => {
    const { guard } = makeGuard(row(['product:read']));
    const { ctx } = makeCtx({ url: '/api/v1/api/remap/1.2/entity/counterparty' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('read-scope bilan yozuvga 403', async () => {
    const { guard } = makeGuard(row(['product:read']));
    const { ctx } = makeCtx({
      url: '/api/v1/api/remap/1.2/entity/product',
      method: 'POST',
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('detail va positions marshrutlari ham tekshiriladi', async () => {
    const { guard } = makeGuard(row(['product:read']));
    const { ctx } = makeCtx({
      url: '/api/v1/api/remap/1.2/entity/demand/abc-1/positions?expand=assortment',
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('metadata ham scope ostida', async () => {
    const { guard } = makeGuard(row(['product:read']));
    const { ctx } = makeCtx({ url: '/api/v1/api/remap/1.2/entity/customerorder/metadata' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('scope`siz (eski) token', () => {
  it('bo`sh scopes = to`liq kirish, permissions [*]', async () => {
    const { guard } = makeGuard(row([]));
    const { ctx, req } = makeCtx({ url: '/api/v1/api/remap/1.2/entity/counterparty' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.user as { permissions: string[] }).permissions).toEqual(['*']);
  });

  it('lastUsedAt hali ham yangilanadi', async () => {
    const { guard, update } = makeGuard(row([]));
    const { ctx } = makeCtx({});
    await guard.canActivate(ctx);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('regress — auth qatlami', () => {
  it('revoked token JWT yo`liga tushadi va 401 beradi', async () => {
    const { guard } = makeGuard({ ...row([]), revokedAt: new Date() });
    const tokensReject = new ApiTokenGuard(
      {
        client: {
          apiToken: {
            findUnique: vi.fn(async () => ({ ...row([]), revokedAt: new Date() })),
            update: vi.fn(),
          },
        },
      } as never,
      {
        verifyAccessToken: vi.fn(async () => {
          throw new Error('bad');
        }),
      } as never,
    );
    const { ctx } = makeCtx({});
    await expect(tokensReject.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(guard).toBeDefined();
  });

  it('Bearer bo`lmasa 401', async () => {
    const { guard } = makeGuard(row([]));
    const { ctx } = makeCtx({ auth: 'Basic xyz' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ApiToken topilmasa JWT yo`li ishlaydi', async () => {
    const { guard } = makeGuard(null);
    const { ctx, req } = makeCtx({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.user as { sub: string }).sub).toBe('jwt-user');
  });
});
