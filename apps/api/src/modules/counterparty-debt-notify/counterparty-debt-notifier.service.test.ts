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
    /** Kontragent `attributes`. `{ tgid }` bo'lsa «tanish kontakt». */
    attributes?: Record<string, unknown> | null;
    /** Bog'langan Telegram chatlari soni. */
    chatCount?: number;
    /** Oxirgi daqiqada yozilgan mijoz-xabarlari soni (portlash qulfi uchun). */
    recentNotifyCount?: number;
    /** Hujjat meta'si — `fetchDocMeta` shu jadvallardan o'qiydi. */
    doc?: { name?: string; moment?: Date; createdAt?: Date } | null;
    /** Kontragentga bog'langan Telegram chati (yo'q bo'lsa `null`). */
    chatRow?: { id: string } | null;
    /** `telegramChatMessage.create` xatosini modellash uchun. */
    chatMessageCreateImpl?: () => Promise<unknown>;
    /** Akkaunt tashkiloti — chekda org yo'q bo'lsa shunga tushiladi. */
    organization?: { name: string } | null;
    /** Chek tafsiloti — `fetchReceiptDetails` (faqat retailsale) o'qiydi. */
    receipt?: {
      payedSumMinor?: bigint;
      organization?: { name: string } | null;
      positions?: Array<{ quantity: string; product: { name: string; uom: string | null } | null }>;
    };
  } = {},
) {
  const cp =
    opts.name === null
      ? null
      : {
          name: opts.name ?? 'Akme',
          phone: opts.phone ?? null,
          // Sukut `{ tgid }` ATAYLAB: shu fayldagi MAVJUD testlar «tanish
          // kontakt» qulfidan o'zgartirishsiz o'tsin.
          attributes: opts.attributes ?? { tgid: '123' },
        };
  const outboxCreate = vi.fn(opts.createImpl ?? (async () => ({ id: 'out-1' })));
  const outboxFindFirst = vi.fn(async () => (opts.existingRow ? { id: 'out-existing' } : null));
  const outboxCount = vi.fn(async () => opts.recentNotifyCount ?? 0);
  const chatCount = vi.fn(async () => opts.chatCount ?? 0);
  const docRow = opts.doc === undefined ? null : opts.doc;
  const docFind = vi.fn(async () => docRow);
  // `retailSale.findFirst` IKKI joydan chaqiriladi — `fetchDocMeta` (raqam+sana)
  // va `fetchReceiptDetails` (tovarlar+to'langan). Bitta obyekt ikkalasini ham
  // qondiradi: har biri o'ziga keragini oladi.
  const saleFind = vi.fn(async () =>
    docRow === null && opts.receipt === undefined ? null : { ...docRow, ...(opts.receipt ?? {}) },
  );
  const chatMessageCreate = vi.fn(opts.chatMessageCreateImpl ?? (async () => ({ id: 'tcm-1' })));
  const chatFindFirst = vi.fn(async () => opts.chatRow ?? null);
  // 2026-08-28: dedup endi TRANZAKSIYA + maslahat-qulfi ichida bajariladi
  // (`enqueueOnce`). Double `$transaction` ni AYNI `client` ustida ochadi —
  // `hrTelegramOutbox` bir xil obyekt, ya'ni mavjud testlarning kutgan
  // `outboxFindFirst`/`outboxCreate` chaqiruvlari o'zgarishsiz qoladi.
  const advisoryLocks: unknown[][] = [];
  const client: Record<string, unknown> = {
    counterparty: { findFirst: vi.fn(async () => cp) },
    telegramChat: { count: chatCount, findFirst: chatFindFirst },
    telegramChatMessage: { create: chatMessageCreate },
    hrTelegramOutbox: { findFirst: outboxFindFirst, create: outboxCreate, count: outboxCount },
    // `fetchDocMeta` shu jadvallardan o'qiydi (turiga qarab bittasi).
    retailSale: { findFirst: saleFind },
    debt: { findFirst: docFind },
    debtPayment: { findFirst: docFind },
    organization: { findFirst: vi.fn(async () => opts.organization ?? null) },
  };
  // $executeRaw: jonli kod qulfni shu bilan oladi (pg_advisory_xact_lock
  // `void` qaytargani uchun $queryRaw yaramaydi — 2026-08-30 prod regressiyasi).
  client.$executeRaw = vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
    advisoryLocks.push(values);
    return 0;
  });
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return {
    prisma: { client },
    outboxCreate,
    outboxFindFirst,
    outboxCount,
    chatCount,
    docFind,
    chatMessageCreate,
    chatFindFirst,
    /** Har `enqueueOnce` ning maslahat-qulfi kalitlari (poyga testlari uchun). */
    advisoryLocks,
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
    // Text alerts are opt-in (default OFF); enable for the delivery tests below.
    process.env.DEBT_NOTIFY_ENABLED = 'true';
    // Xavfsizlik qulflari mavjud testlarga xalaqit bermasin — ular alohida
    // `describe` blokida ataylab yoqiladi.
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'false';
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '20';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.DEBT_NOTIFY_BOT_TOKEN = '';
    process.env.DEBT_NOTIFY_CHAT_ID = '';
    process.env.DEBT_NOTIFY_THRESHOLD_MINOR = '';
    process.env.DEBT_NOTIFY_ENABLED = '';
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = '';
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '';
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
      expect(data.messageText).toContain("💰 *Jami qarzingiz: 50 000 so'm*");
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
        "💰 *Sizga qarzimiz: 20 000 so'm* — tez orada to'lanadi",
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
      expect(text).toContain("💰 *Qolgan qarzingiz: 30 000 so'm*");
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

  describe('hujjat meta — kassa oqimi turlari', () => {
    it('retailsale: chek raqami va sanasi xabar sarlavhasiga tushadi', async () => {
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        doc: { name: 'CHK-2026-00042', moment: new Date('2026-08-16T06:02:00Z') },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged({
        ...baseEvent,
        source: 'retailsale',
        docType: 'retailsale',
        docId: 'rs-1',
      });
      expect(lastOutboxData(outboxCreate).messageText).toContain('№CHK‑2026‑00042');
      expect(lastOutboxData(outboxCreate).messageText).toContain('16.08.2026');
    });

    it("debt: QRZ raqami va createdAt sanasi tushadi (moment maydoni YO'Q)", async () => {
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        doc: { name: 'QRZ-2026-00007', createdAt: new Date('2026-08-16T06:02:00Z') },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged({
        ...baseEvent,
        source: 'debt',
        docType: 'debt',
        docId: 'debt-1',
      });
      expect(lastOutboxData(outboxCreate).messageText).toContain('№QRZ‑2026‑00007');
      expect(lastOutboxData(outboxCreate).messageText).toContain('16.08.2026');
    });

    it("debtpayment: batch'ning o'z raqami yo'q — faqat sana chiqadi", async () => {
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        doc: { createdAt: new Date('2026-08-16T06:02:00Z') },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged({
        ...baseEvent,
        source: 'debtpayment',
        docType: 'debtpayment',
        docId: 'batch-1',
        deltaMinor: -1_000_000n,
        newBalanceMinor: 4_000_000n,
      });
      const text = lastOutboxData(outboxCreate).messageText;
      expect(text).toContain('16.08.2026');
      expect(text).not.toContain('№');
    });
  });

  describe('chek tafsiloti xabarga tushadi', () => {
    it('kassa savdosi: do`kon nomi, tovarlar va to`lov taqsimoti', async () => {
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        doc: { name: 'CHK-2026-00042', moment: new Date('2026-08-16T06:02:00Z') },
        receipt: {
          payedSumMinor: 70_000_00n,
          organization: { name: "SHERSET ELEKTRO TOVAR DO'KONI" },
          positions: [
            { quantity: '100.000000', product: { name: 'Kabel VVG 3x2.5', uom: 'm' } },
            { quantity: '2.500000', product: { name: 'Sim', uom: 'kg' } },
          ],
        },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged({
        ...baseEvent,
        source: 'retailsale',
        docType: 'retailsale',
        docId: 'rs-1',
        deltaMinor: 100_000_00n,
        newBalanceMinor: 690_899_400n,
      });
      const t = lastOutboxData(outboxCreate).messageText;
      expect(t.split('\n')[0]).toBe("SHERSET ELEKTRO TOVAR DO'KONI");
      // Decimal «100.000000» → «100», «2.500000» → «2.5»
      expect(t).toContain('• Kabel VVG 3x2.5 — 100 m');
      expect(t).toContain('• Sim — 2.5 kg');
      expect(t).toContain("💵 To'landi: 70 000 so'm");
      // 2026-08-16: «Qarzga yozildi» qatori olib tashlandi — u `deltaMinor`
      // ning o'zi edi, ya'ni «Qarzga qo'shildi» ni takrorlardi. O'rniga uch
      // raqam yig'iladi: Jami summa = To'landi + Qarzga qo'shildi.
      expect(t).not.toContain('Qarzga yozildi');
      expect(t).toContain("🛒 Qarzga qo'shildi: +100 000 so'm");
      expect(t).toContain("Jami summa: 170 000 so'm");
    });

    it('🔴 chek tashkilotga bog`lanmagan bo`lsa akkaunt tashkilotiga tushadi', async () => {
      // Prodda o'lchangan: 33 ta chekning birortasida ham organizationId yo'q,
      // shuning uchun do'kon nomi xabarda hech qachon chiqmasdi.
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        doc: { name: 'CHK-1', moment: new Date('2026-08-16T06:02:00Z') },
        receipt: { payedSumMinor: 0n, organization: null, positions: [] },
        organization: { name: 'Sherset elektro tovarlar' },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged({
        ...baseEvent,
        source: 'retailsale',
        docType: 'retailsale',
        docId: 'rs-1',
      });
      expect(lastOutboxData(outboxCreate).messageText.split('\n')[0]).toBe(
        'Sherset elektro tovarlar',
      );
    });

    it('boshqa manbada chek tafsiloti O`QILMAYDI (ortiqcha so`rov yo`q)', async () => {
      const { prisma } = makePrismaFull({ phone: '+998901234567' });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      const p = prisma as any;
      await new CounterpartyDebtNotifier(p).onBalanceChanged({
        ...baseEvent,
        source: 'paymentIn',
        docType: 'paymentIn',
        docId: 'pi-1',
        deltaMinor: -1_000_000n,
        newBalanceMinor: 1_000_000n,
      });
      expect(p.client.retailSale.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('suhbat ipi — chiquvchi avtomatik xabar ko`rinadi', () => {
    const retailEvt: CounterpartyBalanceChangedEvent = {
      ...baseEvent,
      source: 'retailsale',
      docType: 'retailsale',
      docId: 'rs-1',
    };

    it('chat MAVJUD bo`lsa — xabar ipga yoziladi (direction out + autoKind + outboxId)', async () => {
      const { prisma, chatMessageCreate } = makePrismaFull({
        phone: '+998901234567',
        chatRow: { id: 'chat-1' },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvt);
      const data = chatMessageCreate.mock.calls.at(-1)?.[0].data;
      expect(data.chatRefId).toBe('chat-1');
      expect(data.direction).toBe('out');
      expect(data.autoKind).toBe('debt_issued');
      expect(data.outboxId).toBe('out-1');
      expect(data.text).toContain('Qarzga');
    });

    it('qarz to`lovida autoKind = payment', async () => {
      const { prisma, chatMessageCreate } = makePrismaFull({
        phone: '+998901234567',
        chatRow: { id: 'chat-1' },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged({
        ...retailEvt,
        source: 'debtpayment',
        docType: 'debtpayment',
        deltaMinor: -1_000_000n,
        newBalanceMinor: 4_000_000n,
      });
      expect(chatMessageCreate.mock.calls.at(-1)?.[0].data.autoKind).toBe('payment');
    });

    it('chat YO`Q bo`lsa — ipga yozilmaydi, lekin xabar baribir navbatga tushadi', async () => {
      const { prisma, chatMessageCreate, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        chatRow: null,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvt);
      expect(outboxCreate).toHaveBeenCalled();
      expect(chatMessageCreate).not.toHaveBeenCalled();
    });

    it('ip yozuvi yiqilsa xabar TO`XTAMAYDI (outbox yozilgan)', async () => {
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        chatRow: { id: 'chat-1' },
        chatMessageCreateImpl: async () => {
          throw new Error('db down');
        },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await expect(
        new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvt),
      ).resolves.toBeUndefined();
      expect(outboxCreate).toHaveBeenCalled();
    });
  });

  describe('xavfsizlik qulflari', () => {
    const retailEvent: CounterpartyBalanceChangedEvent = {
      ...baseEvent,
      source: 'retailsale',
      docType: 'retailsale',
      docId: 'rs-1',
    };

    it("ommaviy portlash: daqiqalik chegara to'lgan bo'lsa yozmaydi", async () => {
      process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '2';
      const { prisma, outboxCreate, outboxCount } = makePrismaFull({
        phone: '+998901234567',
        recentNotifyCount: 2,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
      expect(outboxCount).toHaveBeenCalled();
      expect(outboxCreate).not.toHaveBeenCalled();
    });

    it('chegara ostida bo`lsa yoziladi', async () => {
      process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '20';
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        recentNotifyCount: 3,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
      expect(outboxCreate).toHaveBeenCalled();
    });

    it("noma'lum kontakt (tgid yo'q, chat yo'q) ⇒ yozmaydi", async () => {
      process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'true';
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        attributes: {},
        chatCount: 0,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
      expect(outboxCreate).not.toHaveBeenCalled();
    });

    it("tgid yo'q, lekin bog'langan chat bor ⇒ yoziladi", async () => {
      process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'true';
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        attributes: {},
        chatCount: 1,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
      expect(outboxCreate).toHaveBeenCalled();
    });

    it("qulf o'chirilsa (false) noma'lum kontaktga ham yoziladi", async () => {
      process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'false';
      const { prisma, outboxCreate } = makePrismaFull({
        phone: '+998901234567',
        attributes: {},
        chatCount: 0,
      });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
      expect(outboxCreate).toHaveBeenCalled();
    });
  });
});

/**
 * 🔴 DEDUP POYGASI (2026-08-28).
 *
 * TUZATISHDAN OLDINGI holat: dedup «`findFirst` → `create`» edi va bu
 * READ COMMITTED da ATOMIK EMAS. Bir hujjatning ikki hodisasi bir vaqtda
 * kelsa (hodisalar `{ async, promisify }` bilan navbatsiz ishlaydi) ikkalasi
 * ham «qator yo'q ekan» deb ko'rib, mijozga IKKI xabar ketardi.
 *
 * Yechim: tekshir-keyin-yoz `$transaction` + `pg_advisory_xact_lock` ichida.
 *
 * Quyidagi double Postgres semantikasini HALOL modellaydi: `findFirst`
 * `await` bilan YIELD qiladi (ya'ni ikki oqim haqiqatan bir-birining orasiga
 * tusha oladi), `$executeRaw` esa kalit bo'yicha NAVBAT tutadi va qulf
 * tranzaksiya tugaganda bo'shaydi.
 *
 * NON-VACUOUS: qulf hech nima qilmasa (eski kod yo'li) `findFirst` ning
 * yield'i tufayli ikkala oqim ham bo'sh jadval ko'radi va IKKI qator yoziladi.
 */
function makeRacyPrisma() {
  const rows: Array<{ id: string; sourceDocId: string | null }> = [];
  const held = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();

  async function acquire(key: string, owned: Set<string>) {
    if (owned.has(key)) return;
    while (held.has(key)) {
      await new Promise<void>((resolve) => {
        const q = waiters.get(key) ?? [];
        q.push(resolve);
        waiters.set(key, q);
      });
    }
    held.add(key);
    owned.add(key);
  }
  function releaseAll(owned: Set<string>) {
    for (const key of owned) {
      held.delete(key);
      waiters.get(key)?.shift()?.();
    }
    owned.clear();
  }

  const outbox = {
    findFirst: vi.fn(async (args: { where: { sourceDocId: string } }) => {
      await Promise.resolve(); // qulfsiz o'qish — YIELD qiladi
      return rows.find((r) => r.sourceDocId === args.where.sourceDocId) ?? null;
    }),
    create: vi.fn(async (args: { data: { sourceDocId: string | null } }) => {
      const row = { id: `out-${rows.length + 1}`, sourceDocId: args.data.sourceDocId };
      rows.push(row);
      return { id: row.id };
    }),
    count: vi.fn(async () => 0),
  };

  const base = {
    counterparty: {
      findFirst: vi.fn(async () => ({
        name: 'Akme',
        phone: '+998901234567',
        attributes: { tgid: '1' },
      })),
    },
    telegramChat: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => null) },
    telegramChatMessage: { create: vi.fn(async () => ({ id: 'tcm' })) },
    hrTelegramOutbox: outbox,
    retailSale: { findFirst: vi.fn(async () => null) },
    debt: { findFirst: vi.fn(async () => null) },
    debtPayment: { findFirst: vi.fn(async () => null) },
    organization: { findFirst: vi.fn(async () => null) },
  };

  const client = {
    ...base,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const owned = new Set<string>();
      try {
        return await fn({
          ...base,
          $executeRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
            await acquire(String(values[0]), owned);
            return 0;
          },
        });
      } finally {
        releaseAll(owned);
      }
    }),
  };
  return { prisma: { client }, rows, outbox };
}

describe('CounterpartyDebtNotifier — dedup poygasi (atomik outbox)', () => {
  const event = (docId: string): CounterpartyBalanceChangedEvent => ({
    accountId: 'acc-1',
    counterpartyId: 'cp-1',
    currency: 'UZS',
    deltaMinor: -2_616_000n,
    newBalanceMinor: 0n,
    source: 'debtpayment',
    docType: 'debtpayment',
    docId,
  });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }) as Response),
    );
    process.env.DEBT_NOTIFY_ENABLED = 'true';
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'false';
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '100';
    process.env.DEBT_NOTIFY_BOT_TOKEN = '';
    process.env.DEBT_NOTIFY_CHAT_ID = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.DEBT_NOTIFY_ENABLED = '';
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = '';
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '';
  });

  it('AYNI hujjatning ikki PARALLEL hodisasi — BITTA outbox qatori', async () => {
    const { prisma, rows } = makeRacyPrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(prisma as any);

    await Promise.all([svc.onBalanceChanged(event('b-1')), svc.onBalanceChanged(event('b-1'))]);

    expect(rows).toHaveLength(1);
  });

  it('BOSHQA hujjatlar bir-birini bloklamaydi — ikki qator', async () => {
    const { prisma, rows } = makeRacyPrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(prisma as any);

    await Promise.all([svc.onBalanceChanged(event('b-1')), svc.onBalanceChanged(event('b-2'))]);

    expect(rows).toHaveLength(2);
  });

  it('qulf tranzaksiya tugagach BO`SHAYDI — ketma-ket chaqiruv osilib qolmaydi', async () => {
    const { prisma, rows } = makeRacyPrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new CounterpartyDebtNotifier(prisma as any);

    await svc.onBalanceChanged(event('b-1'));
    await svc.onBalanceChanged(event('b-2'));

    expect(rows.map((r) => r.sourceDocId)).toEqual(['b-1', 'b-2']);
  });
});
