import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CounterpartyBalanceChangedEvent } from '../hr/hr-shared/hr-events.types.js';
import { CounterpartyDebtNotifier } from './counterparty-debt-notifier.service.js';

function makePrisma(opts: { name?: string | null } = {}) {
  return {
    client: {
      counterparty: {
        findFirst: vi.fn(async () =>
          opts.name === undefined
            ? { name: 'Akme' }
            : opts.name === null
              ? null
              : { name: opts.name },
        ),
      },
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

const baseEvent: CounterpartyBalanceChangedEvent = {
  accountId: 'acc-1',
  counterpartyId: 'cp-1',
  currency: 'UZS',
  deltaMinor: 1_000_000n,
  newBalanceMinor: 5_000_000n,
  source: 'invoiceIn',
  docType: 'invoiceIn',
  docId: 'inv-1',
};

describe('CounterpartyDebtNotifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    process.env.DEBT_NOTIFY_BOT_TOKEN = 'tok123';
    process.env.DEBT_NOTIFY_CHAT_ID = '-100999';
    process.env.DEBT_NOTIFY_THRESHOLD_MINOR = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.DEBT_NOTIFY_BOT_TOKEN = '';
    process.env.DEBT_NOTIFY_CHAT_ID = '';
    process.env.DEBT_NOTIFY_THRESHOLD_MINOR = '';
  });

  it('sendViaBot: no-op when token/chat not configured', async () => {
    process.env.DEBT_NOTIFY_BOT_TOKEN = '';
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma() as any);
    await svc.sendViaBot('hi');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendViaBot: POSTs to the group with Markdown + chat_id', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma() as any);
    await svc.sendViaBot('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.telegram.org/bottok123/sendMessage');
    const body = lastFetchBody(fetchMock);
    expect(body.chat_id).toBe('-100999');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toBe('hello');
  });

  it('onBalanceChanged: invoiceIn → 🔴 debt-increased message', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma({ name: 'Akme' }) as any);
    await svc.onBalanceChanged(baseEvent);
    const body = lastFetchBody(fetchMock);
    expect(body.text).toContain('🔴 *Qarz oshdi*');
    expect(body.text).toContain('Akmega');
    expect(body.text).toContain("+10 000 so'm");
    expect(body.text).toContain("Umumiy qarz: 50 000 so'm");
  });

  it('onBalanceChanged: paymentIn → 🔵 counterparty-paid message', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma({ name: 'Beta' }) as any);
    await svc.onBalanceChanged({
      ...baseEvent,
      source: 'paymentIn',
      deltaMinor: -2_000_000n,
      newBalanceMinor: 3_000_000n,
    });
    expect(lastFetchBody(fetchMock).text).toContain("🔵 *Kontragent to'ladi* — Beta 20 000");
  });

  it('onBalanceChanged: no source (reversal/rebalance) → no message', async () => {
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(prisma as any);
    await svc.onBalanceChanged({ ...baseEvent, source: undefined });
    expect(prisma.client.counterparty.findFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('onBalanceChanged: counterparty not found → no message', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma({ name: null }) as any);
    await svc.onBalanceChanged(baseEvent);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('onBalanceChanged: threshold exceeded → ⚠️ warning line appended', async () => {
    process.env.DEBT_NOTIFY_THRESHOLD_MINOR = '4000000'; // 40 000 so'm; balance 50 000 > it
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma({ name: 'Akme' }) as any);
    await svc.onBalanceChanged(baseEvent);
    expect(lastFetchBody(fetchMock).text).toContain('⚠️ Diqqat');
  });

  it('onBalanceChanged: below threshold → no ⚠️ line', async () => {
    process.env.DEBT_NOTIFY_THRESHOLD_MINOR = '9000000'; // 90 000 so'm; balance 50 000 < it
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma({ name: 'Akme' }) as any);
    await svc.onBalanceChanged(baseEvent);
    expect(lastFetchBody(fetchMock).text).not.toContain('⚠️');
  });

  it('errors are swallowed (never throws into the event bus)', async () => {
    const prisma = makePrisma();
    prisma.client.counterparty.findFirst = vi.fn(async () => {
      throw new Error('db down');
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(prisma as any);
    await expect(svc.onBalanceChanged(baseEvent)).resolves.not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws even when the Bot API send itself fails', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500 }) as Response);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(makePrisma({ name: 'Akme' }) as any);
    await expect(svc.onBalanceChanged(baseEvent)).resolves.not.toThrow();
  });
});
