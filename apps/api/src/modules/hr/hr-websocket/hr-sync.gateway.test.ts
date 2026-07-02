import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrSyncGateway } from './hr-sync.gateway.js';

function makeTokens() {
  return { verifyAccessToken: vi.fn() };
}

/** Prisma double whose outbox.count returns per-status fixtures. */
function makePrisma(counts = { pending: 2, sentToday: 5, failed: 1 }) {
  return {
    client: {
      hrTelegramOutbox: {
        count: vi.fn(async (args: { where: { status?: unknown } }) => {
          const s = args.where.status as { in?: string[] } | string | undefined;
          if (typeof s === 'object' && s?.in) return counts.pending; // pending + retry
          if (s === 'sent') return counts.sentToday;
          if (s === 'failed') return counts.failed;
          return 0;
        }),
      },
    },
  };
}

function makeReq(opts: { url?: string; cookie?: string } = {}): IncomingMessage {
  return {
    url: opts.url ?? '/api/v1/ws/hr/sync',
    headers: { cookie: opts.cookie },
  } as unknown as IncomingMessage;
}

function makeWs(readyState = 1) {
  return { readyState, send: vi.fn(), close: vi.fn() };
}

function makeGateway(prisma = makePrisma()) {
  const tokens = makeTokens();
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  const gateway = new HrSyncGateway(tokens as any, prisma as any);
  return { gateway, tokens, prisma };
}

describe('HrSyncGateway.handleConnection', () => {
  let ctx: ReturnType<typeof makeGateway>;
  beforeEach(() => {
    ctx = makeGateway();
  });

  it('closes 4401 when no token present', async () => {
    const ws = makeWs();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await ctx.gateway.handleConnection(ws as any, makeReq());
    expect(ws.close).toHaveBeenCalledWith(4401, 'unauthorized');
    expect(ctx.gateway.clientCount).toBe(0);
  });

  it('closes 4403 for a non-admin (admin-only channel)', async () => {
    ctx.tokens.verifyAccessToken.mockResolvedValue({
      sub: 'emp-1',
      accountId: 'acc1',
      hrRoles: ['cashier'],
    });
    const ws = makeWs();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await ctx.gateway.handleConnection(ws as any, makeReq({ url: '/ws?token=t' }));
    expect(ws.close).toHaveBeenCalledWith(4403, 'forbidden');
    expect(ctx.gateway.clientCount).toBe(0);
  });

  it('closes 4401 when token verification throws', async () => {
    ctx.tokens.verifyAccessToken.mockRejectedValue(new Error('jwt expired'));
    const ws = makeWs();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await ctx.gateway.handleConnection(ws as any, makeReq({ url: '/ws?token=bad' }));
    expect(ws.close).toHaveBeenCalledWith(4401, 'invalid_token');
  });

  it('admin: registers + sends connected then a sync_status snapshot', async () => {
    ctx.tokens.verifyAccessToken.mockResolvedValue({
      sub: 'admin-1',
      accountId: 'acc1',
      hrRoles: ['admin'],
    });
    const ws = makeWs();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await ctx.gateway.handleConnection(ws as any, makeReq({ url: '/ws?token=t' }));

    expect(ctx.gateway.clientCount).toBe(1);
    expect(ws.send).toHaveBeenCalledTimes(2);
    const first = JSON.parse(ws.send.mock.calls[0]?.[0] as string);
    const second = JSON.parse(ws.send.mock.calls[1]?.[0] as string);
    expect(first.event).toBe('connected');
    expect(second.event).toBe('sync_status');
    expect(second.payload.pending).toBe(2);
    expect(second.payload.sentToday).toBe(5);
    expect(second.payload.failed).toBe(1);
    expect(typeof second.payload.workerEnabled).toBe('boolean');
  });

  it('handleDisconnect drops the client', async () => {
    ctx.tokens.verifyAccessToken.mockResolvedValue({
      sub: 'admin-1',
      accountId: 'acc1',
      hrRoles: ['admin'],
    });
    const ws = makeWs();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await ctx.gateway.handleConnection(ws as any, makeReq({ url: '/ws?token=t' }));
    expect(ctx.gateway.clientCount).toBe(1);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    ctx.gateway.handleDisconnect(ws as any);
    expect(ctx.gateway.clientCount).toBe(0);
  });
});

describe('HrSyncGateway.snapshot + pushUpdates', () => {
  it('snapshot scopes outbox counts to the account', async () => {
    const { gateway, prisma } = makeGateway(makePrisma({ pending: 3, sentToday: 9, failed: 0 }));
    const snap = await gateway.snapshot('acc-xyz');
    expect(snap).toEqual({
      workerEnabled: snap.workerEnabled, // env-dependent boolean
      pending: 3,
      sentToday: 9,
      failed: 0,
    });
    // every count query carried the accountId scope
    for (const call of prisma.client.hrTelegramOutbox.count.mock.calls) {
      expect((call[0] as { where: { accountId: string } }).where.accountId).toBe('acc-xyz');
    }
  });

  it('pushUpdates is a no-op with zero connected clients', async () => {
    const { gateway, prisma } = makeGateway();
    await gateway.pushUpdates();
    expect(prisma.client.hrTelegramOutbox.count).not.toHaveBeenCalled();
  });
});
