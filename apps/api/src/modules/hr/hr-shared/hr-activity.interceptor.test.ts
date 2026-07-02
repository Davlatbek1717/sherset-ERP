import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { HrActivityInterceptor, entityType, redact } from './hr-activity.interceptor.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeCtx(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeNext(responseBody: unknown): CallHandler {
  return { handle: () => of(responseBody) };
}

function makePrisma() {
  return { client: { hrActivityLog: { create: vi.fn(async () => ({})) } } };
}

describe('entityType', () => {
  it('derives hr_<segment> from the url', () => {
    expect(entityType('/api/v1/hr/task-templates/abc')).toBe('hr_task_templates');
    expect(entityType('/api/v1/hr/telegram-accounts')).toBe('hr_telegram_accounts');
  });
});

describe('redact', () => {
  it('replaces sensitive keys, keeps the rest', () => {
    const out = redact({
      slot: 1,
      phoneNumber: '+998901234567',
      apiHash: 'super-secret-hash',
      password: 'p@ss',
      code: '12345',
      title: 'Kassa',
    });
    expect(out).toEqual({
      slot: 1,
      phoneNumber: '+998901234567',
      apiHash: '[redacted]',
      password: '[redacted]',
      code: '[redacted]',
      title: 'Kassa',
    });
  });

  it('returns undefined for non-objects', () => {
    expect(redact(null)).toBeUndefined();
    expect(redact('x')).toBeUndefined();
  });
});

describe('HrActivityInterceptor', () => {
  it('logs an HR create with redacted diff', async () => {
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const it_ = new HrActivityInterceptor(prisma as any);
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/hr/telegram-accounts',
      user: { sub: 'emp-1', accountId: 'acc-1' },
      body: { phoneNumber: '+998900000000', apiHash: 'secret' },
    };
    it_.intercept(makeCtx(req), makeNext({ id: 'tg-1' })).subscribe();
    await flush();

    expect(prisma.client.hrActivityLog.create).toHaveBeenCalledTimes(1);
    const data = prisma.client.hrActivityLog.create.mock.calls[0]?.[0]?.data;
    expect(data.accountId).toBe('acc-1');
    expect(data.actorId).toBe('emp-1');
    expect(data.action).toBe('create');
    expect(data.entityType).toBe('hr_telegram_accounts');
    expect(data.entityId).toBe('tg-1');
    expect(data.diff.apiHash).toBe('[redacted]'); // secret never stored
    expect(data.diff.phoneNumber).toBe('+998900000000');
  });

  it('DELETE → action delete, entityId from params, no diff', async () => {
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const it_ = new HrActivityInterceptor(prisma as any);
    const req = {
      method: 'DELETE',
      originalUrl: '/api/v1/hr/task-templates/tpl-9',
      user: { sub: 'admin-1', accountId: 'acc-1' },
      params: { id: 'tpl-9' },
    };
    it_.intercept(makeCtx(req), makeNext({ ok: true })).subscribe();
    await flush();

    const data = prisma.client.hrActivityLog.create.mock.calls[0]?.[0]?.data;
    expect(data.action).toBe('delete');
    expect(data.entityId).toBe('tpl-9');
    expect(data.diff).toBeUndefined();
  });

  it('does NOT log GET requests', async () => {
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const it_ = new HrActivityInterceptor(prisma as any);
    it_
      .intercept(
        makeCtx({
          method: 'GET',
          originalUrl: '/api/v1/hr/task-templates',
          user: { accountId: 'a' },
        }),
        makeNext([]),
      )
      .subscribe();
    await flush();
    expect(prisma.client.hrActivityLog.create).not.toHaveBeenCalled();
  });

  it('does NOT log non-HR mutations', async () => {
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const it_ = new HrActivityInterceptor(prisma as any);
    it_
      .intercept(
        makeCtx({ method: 'POST', originalUrl: '/api/v1/demands', user: { accountId: 'a' } }),
        makeNext({ id: 'd-1' }),
      )
      .subscribe();
    await flush();
    expect(prisma.client.hrActivityLog.create).not.toHaveBeenCalled();
  });

  it('no user → no log (and never throws)', async () => {
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const it_ = new HrActivityInterceptor(prisma as any);
    it_
      .intercept(
        makeCtx({ method: 'POST', originalUrl: '/api/v1/hr/roles', body: {} }),
        makeNext({ id: 'r-1' }),
      )
      .subscribe();
    await flush();
    expect(prisma.client.hrActivityLog.create).not.toHaveBeenCalled();
  });
});
