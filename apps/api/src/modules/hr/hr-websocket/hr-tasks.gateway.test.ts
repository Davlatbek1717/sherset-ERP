import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTasksGateway, extractWsToken, shouldDeliverTo } from './hr-tasks.gateway.js';

function makeTokens() {
  return {
    verifyAccessToken: vi.fn(),
  };
}

function makeReq(opts: { url?: string; cookie?: string } = {}): IncomingMessage {
  return {
    url: opts.url ?? '/api/v1/ws/hr/tasks',
    headers: { cookie: opts.cookie },
  } as unknown as IncomingMessage;
}

function makeWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  };
}

// ─── pure helper tests ──────────────────────────────────────────────────

describe('extractWsToken', () => {
  it('returns token from ?token=… query', () => {
    expect(extractWsToken(makeReq({ url: '/api/v1/ws/hr/tasks?token=abc.def.ghi' }))).toBe(
      'abc.def.ghi',
    );
  });

  it('returns token from access_token cookie when no query', () => {
    expect(extractWsToken(makeReq({ cookie: 'foo=bar; access_token=xyz.uvw.qrs' }))).toBe(
      'xyz.uvw.qrs',
    );
  });

  it('prefers query over cookie when both present', () => {
    expect(
      extractWsToken(makeReq({ url: '/api/v1/ws/hr/tasks?token=Q', cookie: 'access_token=C' })),
    ).toBe('Q');
  });

  it('returns null when neither present', () => {
    expect(extractWsToken(makeReq())).toBeNull();
  });

  it('returns null when ?token= is empty', () => {
    expect(extractWsToken(makeReq({ url: '/api/v1/ws/hr/tasks?token=' }))).toBeNull();
  });
});

describe('shouldDeliverTo', () => {
  const admin = { sub: 'admin-1', accountId: 'acc1', isAdmin: true };
  const employee = { sub: 'emp-1', accountId: 'acc1', isAdmin: false };

  it('blocks cross-account delivery (admin or not)', () => {
    expect(shouldDeliverTo(admin, 'acc-OTHER', 'emp-1')).toBe(false);
    expect(shouldDeliverTo(employee, 'acc-OTHER', 'emp-1')).toBe(false);
  });

  it('admin within same account always receives', () => {
    expect(shouldDeliverTo(admin, 'acc1', 'emp-1')).toBe(true);
    expect(shouldDeliverTo(admin, 'acc1', 'emp-99')).toBe(true);
  });

  it('employee receives only their own task events', () => {
    expect(shouldDeliverTo(employee, 'acc1', 'emp-1')).toBe(true);
    expect(shouldDeliverTo(employee, 'acc1', 'emp-OTHER')).toBe(false);
  });
});

// ─── gateway behaviour tests ────────────────────────────────────────────

describe('HrTasksGateway.handleConnection', () => {
  let tokens: ReturnType<typeof makeTokens>;
  let gateway: HrTasksGateway;

  beforeEach(() => {
    tokens = makeTokens();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    gateway = new HrTasksGateway(tokens as any);
  });

  it('closes with 4401 when no token present', async () => {
    const ws = makeWs();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await gateway.handleConnection(ws as any, makeReq());
    expect(ws.close).toHaveBeenCalledWith(4401, 'unauthorized');
    expect(gateway.clientCount).toBe(0);
  });

  it('closes with 4401 when token verification throws', async () => {
    tokens.verifyAccessToken.mockRejectedValue(new Error('jwt expired'));
    const ws = makeWs();
    await gateway.handleConnection(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      ws as any,
      makeReq({ url: '/ws?token=bad' }),
    );
    expect(ws.close).toHaveBeenCalledWith(4401, 'invalid_token');
    expect(gateway.clientCount).toBe(0);
  });

  it('accepts valid token and registers client with isAdmin flag', async () => {
    tokens.verifyAccessToken.mockResolvedValue({
      sub: 'admin-1',
      accountId: 'acc1',
      hrRoles: ['admin', 'cashier'],
    });
    const ws = makeWs();
    await gateway.handleConnection(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      ws as any,
      makeReq({ url: '/ws?token=valid' }),
    );
    expect(gateway.clientCount).toBe(1);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ event: 'connected', payload: { sub: 'admin-1', isAdmin: true } }),
    );
  });

  it('non-admin (no hrRoles admin) gets isAdmin=false', async () => {
    tokens.verifyAccessToken.mockResolvedValue({
      sub: 'emp-1',
      accountId: 'acc1',
      hrRoles: ['cashier'],
    });
    const ws = makeWs();
    await gateway.handleConnection(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      ws as any,
      makeReq({ url: '/ws?token=valid' }),
    );
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ event: 'connected', payload: { sub: 'emp-1', isAdmin: false } }),
    );
  });
});

describe('HrTasksGateway event routing', () => {
  let tokens: ReturnType<typeof makeTokens>;
  let gateway: HrTasksGateway;

  beforeEach(() => {
    tokens = makeTokens();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    gateway = new HrTasksGateway(tokens as any);
  });

  async function connect(opts: { sub: string; accountId: string; admin?: boolean }) {
    tokens.verifyAccessToken.mockResolvedValueOnce({
      sub: opts.sub,
      accountId: opts.accountId,
      hrRoles: opts.admin ? ['admin'] : [],
    });
    const ws = makeWs();
    await gateway.handleConnection(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      ws as any,
      makeReq({ url: '/ws?token=t' }),
    );
    ws.send.mockClear();
    return ws;
  }

  it('task_dispatched fans out to admin + assignee only (not other employees)', async () => {
    const admin = await connect({ sub: 'admin-1', accountId: 'acc1', admin: true });
    const assignee = await connect({ sub: 'emp-1', accountId: 'acc1' });
    const other = await connect({ sub: 'emp-OTHER', accountId: 'acc1' });
    const otherAccount = await connect({ sub: 'emp-1', accountId: 'acc-2' });

    gateway.onTaskDispatched({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      triggeredBy: 'manual',
    });

    expect(admin.send).toHaveBeenCalledOnce();
    expect(assignee.send).toHaveBeenCalledOnce();
    expect(other.send).not.toHaveBeenCalled();
    expect(otherAccount.send).not.toHaveBeenCalled();

    const adminPayload = JSON.parse(admin.send.mock.calls[0]?.[0] as string);
    expect(adminPayload.event).toBe('task_dispatched');
    expect(adminPayload.payload.taskLogId).toBe('log-1');
  });

  it('task_finalized routed by accountId + employeeId scope', async () => {
    const admin = await connect({ sub: 'admin-1', accountId: 'acc1', admin: true });
    const assignee = await connect({ sub: 'emp-1', accountId: 'acc1' });

    gateway.onTaskFinalized({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      status: 'answered_yes',
    });

    expect(admin.send).toHaveBeenCalledOnce();
    expect(assignee.send).toHaveBeenCalledOnce();
    expect(JSON.parse(admin.send.mock.calls[0]?.[0] as string).event).toBe('task_finalized');
  });

  it('task_deadline_expired routed and announced with right event name', async () => {
    const admin = await connect({ sub: 'admin-1', accountId: 'acc1', admin: true });

    gateway.onTaskDeadlineExpired({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
    });

    expect(admin.send).toHaveBeenCalledOnce();
    expect(JSON.parse(admin.send.mock.calls[0]?.[0] as string).event).toBe('task_deadline_expired');
  });

  it('task_answered routed to admin + answering employee only', async () => {
    const admin = await connect({ sub: 'admin-1', accountId: 'acc1', admin: true });
    const emp = await connect({ sub: 'emp-1', accountId: 'acc1' });
    const other = await connect({ sub: 'emp-OTHER', accountId: 'acc1' });

    gateway.onTaskAnswered({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      status: 'answered_text',
      requiresReview: false,
    });

    expect(admin.send).toHaveBeenCalledOnce();
    expect(emp.send).toHaveBeenCalledOnce();
    expect(other.send).not.toHaveBeenCalled();
    expect(JSON.parse(admin.send.mock.calls[0]?.[0] as string).event).toBe('task_answered');
  });

  it('pending_review delivered to the CHECKER, not the answering employee', async () => {
    const admin = await connect({ sub: 'admin-1', accountId: 'acc1', admin: true });
    const checker = await connect({ sub: 'checker-1', accountId: 'acc1' });
    const answerer = await connect({ sub: 'emp-1', accountId: 'acc1' });

    gateway.onTaskPendingReview({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      checkerId: 'checker-1',
    });

    expect(admin.send).toHaveBeenCalledOnce(); // admins always receive
    expect(checker.send).toHaveBeenCalledOnce(); // routed to the checker
    expect(answerer.send).not.toHaveBeenCalled(); // NOT the answering employee
    expect(JSON.parse(checker.send.mock.calls[0]?.[0] as string).event).toBe('pending_review');
  });

  it('skips clients with non-OPEN readyState', async () => {
    tokens.verifyAccessToken.mockResolvedValueOnce({
      sub: 'admin-1',
      accountId: 'acc1',
      hrRoles: ['admin'],
    });
    const ws = makeWs(/* CONNECTING */ 0);
    await gateway.handleConnection(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      ws as any,
      makeReq({ url: '/ws?token=t' }),
    );
    ws.send.mockClear();

    gateway.onTaskDispatched({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      triggeredBy: 'manual',
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handleDisconnect drops the client from the registry', async () => {
    const ws = await connect({ sub: 'admin-1', accountId: 'acc1', admin: true });
    expect(gateway.clientCount).toBe(1);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    gateway.handleDisconnect(ws as any);
    expect(gateway.clientCount).toBe(0);
  });
});
