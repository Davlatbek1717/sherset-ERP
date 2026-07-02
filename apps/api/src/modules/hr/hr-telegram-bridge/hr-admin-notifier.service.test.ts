import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HrAdminNotifier } from './hr-admin-notifier.service.js';

function makePrisma(
  opts: {
    log?: unknown;
    ledger?: Array<{ kind: string; amountMinor: bigint }>;
  } = {},
) {
  return {
    client: {
      hrTaskLog: { findFirst: vi.fn(async () => opts.log ?? null) },
      hrBonusFineLog: { findMany: vi.fn(async () => opts.ledger ?? []) },
    },
  };
}

function lastFetchBody(fetchMock: ReturnType<typeof vi.fn>): {
  text: string;
  chat_id: string;
  parse_mode: string;
} {
  const call = fetchMock.mock.calls[0];
  return JSON.parse((call?.[1] as { body: string }).body);
}

const baseLog = {
  status: 'answered_text',
  responseText: 'Bajarildi',
  answeredAt: new Date('2026-05-15T08:00:00Z'),
  template: { title: 'Kassa hisoboti' },
  employee: { name: 'Ali' },
};

describe('HrAdminNotifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    process.env.HR_ADMIN_BOT_TOKEN = 'tok123';
    process.env.HR_ADMIN_CHAT_ID = '-100999';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HR_ADMIN_BOT_TOKEN = '';
    process.env.HR_ADMIN_CHAT_ID = '';
  });

  it('sendViaBot: no-op when token/chat not configured', async () => {
    process.env.HR_ADMIN_BOT_TOKEN = ''; // empty ⇒ falsy ⇒ "not configured"
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrAdminNotifier(makePrisma() as any);
    await svc.sendViaBot('hi');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendViaBot: POSTs to Bot API with Markdown + chat_id when configured', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrAdminNotifier(makePrisma() as any);
    await svc.sendViaBot('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe('https://api.telegram.org/bottok123/sendMessage');
    const body = lastFetchBody(fetchMock);
    expect(body.chat_id).toBe('-100999');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toBe('hello');
  });

  it('onTaskFinalized: bonus case → "Vazifa bajarildi → Bonus" + amount', async () => {
    const svc = new HrAdminNotifier(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makePrisma({ log: baseLog, ledger: [{ kind: 'bonus', amountMinor: 300_000n }] }) as any,
    );
    await svc.onTaskFinalized({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      status: 'answered_text',
    });
    const body = lastFetchBody(fetchMock);
    expect(body.text).toContain('✅ *Vazifa bajarildi → Bonus*');
    expect(body.text).toContain('📋 Kassa hisoboti');
    expect(body.text).toContain('👤 Ali');
    expect(body.text).toContain("💰 *Bonus:* 3 000 so'm");
  });

  it('onTaskFinalized: answered_no with fine → "bajarilmadi → Jarima"', async () => {
    const svc = new HrAdminNotifier(
      makePrisma({
        log: { ...baseLog, status: 'answered_no', responseText: null },
        ledger: [{ kind: 'fine', amountMinor: 100_000n }],
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
      }) as any,
    );
    await svc.onTaskFinalized({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      status: 'answered_no',
    });
    const body = lastFetchBody(fetchMock);
    expect(body.text).toContain('❌ *Vazifa bajarilmadi → Jarima*');
    expect(body.text).toContain("💰 *Jarima:* 1 000 so'm");
    expect(body.text).toContain('💬 (matnsiz)'); // null responseText fallback
  });

  it('onTaskExpired: fine → "bajarilmadi → Jarima" + default response', async () => {
    const svc = new HrAdminNotifier(
      makePrisma({
        log: { ...baseLog, status: 'answered_no', responseText: null },
        ledger: [{ kind: 'fine', amountMinor: 50_000n }],
        // biome-ignore lint/suspicious/noExplicitAny: test wiring
      }) as any,
    );
    await svc.onTaskExpired({
      accountId: 'acc1',
      taskLogId: 'log-1',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
    });
    const body = lastFetchBody(fetchMock);
    expect(body.text).toContain('❌ *Vazifa bajarilmadi → Jarima*');
    expect(body.text).toContain('💬 Vaqt tugadi — avtomatik');
    expect(body.text).toContain("💰 *Jarima:* 500 so'm");
  });

  it('no log found → no message sent', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrAdminNotifier(makePrisma({ log: null }) as any);
    await svc.onTaskFinalized({
      accountId: 'acc1',
      taskLogId: 'missing',
      templateId: 'tpl-1',
      employeeId: 'emp-1',
      status: 'answered_yes',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('errors are swallowed (never throw into the event bus)', async () => {
    const prisma = makePrisma();
    prisma.client.hrTaskLog.findFirst = vi.fn(async () => {
      throw new Error('db down');
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrAdminNotifier(prisma as any);
    await expect(
      svc.onTaskFinalized({
        accountId: 'acc1',
        taskLogId: 'log-1',
        templateId: 'tpl-1',
        employeeId: 'emp-1',
        status: 'answered_yes',
      }),
    ).resolves.not.toThrow();
  });
});
