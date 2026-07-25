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

/**
 * Fuller Prisma double that also models `hrTelegramOutbox` (findFirst for
 * dedup + create for enqueue) so the counterparty MTProto path can be asserted.
 * `existingRow` seeds the dedup lookup (a prior row for the same document).
 */
function makePrismaFull(
  opts: {
    name?: string | null;
    phone?: string | null;
    existingRow?: boolean;
    createImpl?: () => Promise<unknown>;
  } = {},
) {
  const cp = opts.name === null ? null : { name: opts.name ?? 'Akme', phone: opts.phone ?? null };
  const outboxCreate = vi.fn(opts.createImpl ?? (async () => ({ id: 'out-1' })));
  const outboxFindFirst = vi.fn(async () => (opts.existingRow ? { id: 'out-existing' } : null));
  return {
    prisma: {
      client: {
        counterparty: { findFirst: vi.fn(async () => cp) },
        hrTelegramOutbox: { findFirst: outboxFindFirst, create: outboxCreate },
      },
    },
    outboxCreate,
    outboxFindFirst,
  };
}

/** The `data` object passed to the last hrTelegramOutbox.create call. */
function lastOutboxData(create: ReturnType<typeof vi.fn>): {
  toPhone: string;
  messageText: string;
  sourceEventType: string;
  sourceDocId: string | null;
  status: string;
  counterpartyId: string;
} {
  return create.mock.calls.at(-1)?.[0].data;
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
    process.env.DEBT_NOTIFY_ENABLED = '';
  });

  it('kill-switch: DEBT_NOTIFY_ENABLED=false → total no-op (no lookup, no fetch)', async () => {
    process.env.DEBT_NOTIFY_ENABLED = 'false';
    const prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(prisma as any);
    await svc.onBalanceChanged(baseEvent);
    expect(prisma.client.counterparty.findFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(body.text).toContain('📄 *Kirim (xarid)*');
    expect(body.text).toContain('👤 «Akme»');
    expect(body.text).toContain("📥 Qarzga tovar olindi: *10 000 so'm*");
    expect(body.text).toContain("💰 Jami: «Akme» bizga 50 000 so'm qarzdor");
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
    const t = lastFetchBody(fetchMock).text;
    expect(t).toContain('👤 «Beta»');
    expect(t).toContain("💵 Kontragent to'ladi: *20 000 so'm*");
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

  // ── Counterparty MTProto outbox path ───────────────────────────────────────
  describe('counterparty notice (MTProto outbox)', () => {
    it('no phone → no outbox row (owner alert still sent)', async () => {
      const { prisma, outboxCreate } = makePrismaFull({ name: 'Akme', phone: null });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged(baseEvent);
      expect(outboxCreate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1); // owner send is independent
    });

    it('blank/whitespace phone → treated as missing → no outbox row', async () => {
      const { prisma, outboxCreate } = makePrismaFull({ name: 'Akme', phone: '   ' });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged(baseEvent);
      expect(outboxCreate).not.toHaveBeenCalled();
    });

    it('they owe us (positive balance) → enqueues "qarzingiz bor" to their phone', async () => {
      const { prisma, outboxCreate } = makePrismaFull({
        name: 'Akme',
        phone: '+998901112233',
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged({
        ...baseEvent,
        source: 'invoiceOut',
        newBalanceMinor: 5_000_000n,
      });
      expect(outboxCreate).toHaveBeenCalledTimes(1);
      const data = lastOutboxData(outboxCreate);
      expect(data.toPhone).toBe('+998901112233');
      expect(data.messageText).toContain("💰 Jami qarzingiz: 50 000 so'm");
      expect(data.sourceEventType).toBe('debt.counterparty_notify');
      expect(data.sourceDocId).toBe('inv-1');
      expect(data.status).toBe('pending');
      expect(data.counterpartyId).toBe('cp-1');
    });

    it('we owe them (negative balance) → enqueues "Sizga qarzimiz … tez orada to\'lanadi"', async () => {
      const { prisma, outboxCreate } = makePrismaFull({ name: 'Beta', phone: '998900000000' });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged({
        ...baseEvent,
        source: 'paymentOut',
        newBalanceMinor: -2_000_000n,
      });
      expect(lastOutboxData(outboxCreate).messageText).toContain(
        "💰 Sizga qarzimiz: 20 000 so'm — tez orada to'lanadi",
      );
    });

    it('payment (paymentIn) → enqueues a "to\'lovingiz qabul qilindi" receipt', async () => {
      const { prisma, outboxCreate } = makePrismaFull({ name: 'Akme', phone: '998911234567' });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged({
        ...baseEvent,
        source: 'paymentIn',
        deltaMinor: -2_000_000n,
        newBalanceMinor: 3_000_000n,
      });
      const text = lastOutboxData(outboxCreate).messageText;
      expect(text).toContain("✅ To'lovingiz qabul qilindi: 20 000 so'm");
      expect(text).toContain("💰 Qolgan qarzingiz: 30 000 so'm");
    });

    it('owner AND counterparty both enqueue for one event', async () => {
      const { prisma, outboxCreate } = makePrismaFull({ name: 'Akme', phone: '998911234567' });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged(baseEvent);
      expect(fetchMock).toHaveBeenCalledTimes(1); // owner (Bot API)
      expect(outboxCreate).toHaveBeenCalledTimes(1); // counterparty (MTProto outbox)
    });

    it('dedup: an existing row for the same docId → no second enqueue', async () => {
      const { prisma, outboxCreate, outboxFindFirst } = makePrismaFull({
        name: 'Akme',
        phone: '998911234567',
        existingRow: true,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged(baseEvent);
      expect(outboxFindFirst).toHaveBeenCalledTimes(1);
      expect(outboxCreate).not.toHaveBeenCalled();
    });

    it('deliveries are independent: outbox create throwing does not skip owner send', async () => {
      const { prisma } = makePrismaFull({
        name: 'Akme',
        phone: '998911234567',
        createImpl: async () => {
          throw new Error('db down');
        },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await expect(svc.onBalanceChanged(baseEvent)).resolves.not.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1); // owner still delivered
    });

    it('no source (reversal) → neither owner nor counterparty is notified', async () => {
      const { prisma, outboxCreate } = makePrismaFull({ name: 'Akme', phone: '998911234567' });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const svc = new CounterpartyDebtNotifier(prisma as any);
      await svc.onBalanceChanged({ ...baseEvent, source: undefined });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(outboxCreate).not.toHaveBeenCalled();
    });
  });
});
