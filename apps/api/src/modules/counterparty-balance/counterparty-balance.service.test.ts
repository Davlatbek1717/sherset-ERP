import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type ApplyDeltaMeta, CounterpartyBalanceService } from './counterparty-balance.service.js';

/**
 * Faza 9 (DUP-15/M-07): applyDelta endi IKKI yozuv qiladi — materiallashgan
 * `CounterpartyBalance` upsert + append-only `CounterpartyBalanceEntry` jurnal
 * qatori. Fake tx ikkalasini ham kuzatadi va materiallashgan balansni
 * HAQIQATDA yig'adi, shunda «Σ(jurnal) == materiallashgan» invariantini
 * mock-xulqiga emas, real hisobga qarab tekshirish mumkin.
 */
function makeTx() {
  const upsertArgs: Array<{
    where: { counterpartyId_currency: { counterpartyId: string; currency: string } };
    create: { balanceMinor: bigint };
    update: { balanceMinor: { increment: bigint } };
  }> = [];
  const entryArgs: Array<{
    data: {
      accountId: string;
      counterpartyId: string;
      organizationId: string | null;
      currency: string;
      deltaMinor: bigint;
      docType: string;
      docId: string;
    };
  }> = [];
  /** counterpartyId|currency → materiallashgan balans (upsert'ning natijasi). */
  const materialized = new Map<string, bigint>();

  const tx = {
    counterpartyBalance: {
      upsert: vi.fn().mockImplementation(async (args: (typeof upsertArgs)[number]) => {
        upsertArgs.push(args);
        const { counterpartyId, currency } = args.where.counterpartyId_currency;
        const key = `${counterpartyId}|${currency}`;
        const next = (materialized.get(key) ?? 0n) + args.update.balanceMinor.increment;
        materialized.set(key, next);
        return { balanceMinor: next };
      }),
    },
    counterpartyBalanceEntry: {
      create: vi.fn().mockImplementation(async (args: (typeof entryArgs)[number]) => {
        entryArgs.push(args);
        return { id: `entry-${entryArgs.length}` };
      }),
    },
  };
  return { tx, upsertArgs, entryArgs, materialized };
}

function svc() {
  const events = { emit: vi.fn() };
  return new CounterpartyBalanceService({} as never, events as never);
}

const META: ApplyDeltaMeta = {
  source: 'invoiceOut',
  docType: 'invoiceOut',
  docId: 'io-1',
  organizationId: 'org-1',
};

describe('CounterpartyBalanceService.applyDelta', () => {
  it('upserts on first write (create branch used on miss)', async () => {
    const { tx, upsertArgs } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', 1_000_000n, META);
    expect(upsertArgs).toHaveLength(1);
    expect(upsertArgs[0]!.create.balanceMinor).toBe(1_000_000n);
    expect(upsertArgs[0]!.update.balanceMinor.increment).toBe(1_000_000n);
  });

  it('short-circuits on zero delta', async () => {
    const { tx } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', 0n, META);
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('passes negative delta through (we-owe-them direction)', async () => {
    const { tx, upsertArgs } = makeTx();
    await svc().applyDelta(tx as never, 'a', 'c', 'UZS', -500_000n, META);
    expect(upsertArgs[0]!.update.balanceMinor.increment).toBe(-500_000n);
  });

  it('rejects non-3-letter currency codes', async () => {
    const { tx } = makeTx();
    await expect(svc().applyDelta(tx as never, 'a', 'c', 'USDT', 1n, META)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('keys upsert on the composite (counterpartyId, currency)', async () => {
    const { tx, upsertArgs } = makeTx();
    await svc().applyDelta(tx as never, 'a', 'cp-42', 'USD', 100n, META);
    expect(upsertArgs[0]!.where).toEqual({
      counterpartyId_currency: { counterpartyId: 'cp-42', currency: 'USD' },
    });
  });
});

describe('CounterpartyBalanceService.applyDelta — journal (Faza 9, DUP-15)', () => {
  it('writes one journal entry per applied delta, in the caller tx', async () => {
    const { tx, entryArgs } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', 1_000_000n, {
      source: 'invoiceOut',
      docType: 'invoiceOut',
      docId: 'io-77',
      organizationId: 'org-9',
    });
    expect(entryArgs).toHaveLength(1);
    expect(entryArgs[0]!.data).toEqual({
      accountId: 'acc-1',
      counterpartyId: 'cp-1',
      organizationId: 'org-9',
      currency: 'UZS',
      deltaMinor: 1_000_000n,
      docType: 'invoiceOut',
      docId: 'io-77',
    });
  });

  it('writes no journal entry when the delta is zero', async () => {
    const { tx } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', 0n, META);
    expect(tx.counterpartyBalanceEntry.create).not.toHaveBeenCalled();
  });

  it('writes no journal entry when the currency is rejected', async () => {
    const { tx } = makeTx();
    await expect(svc().applyDelta(tx as never, 'a', 'c', 'USDT', 1n, META)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.counterpartyBalanceEntry.create).not.toHaveBeenCalled();
  });

  it('records organizationId as null for documents that have no organization (Debt)', async () => {
    const { tx, entryArgs } = makeTx();
    await svc().applyDelta(tx as never, 'acc-1', 'cp-5', 'UZS', 250_000n, {
      docType: 'debt',
      docId: 'debt-1',
      organizationId: null,
    });
    expect(entryArgs[0]!.data.organizationId).toBeNull();
    expect(entryArgs[0]!.data.docType).toBe('debt');
  });

  it('keeps Σ(journal.deltaMinor) == materialized balance per counterparty×currency', async () => {
    const { tx, entryArgs, materialized } = makeTx();
    const s = svc();
    // Aralash stsenariy: bir kontragentga ikki valyuta + ikkinchi kontragent,
    // musbat/manfiy deltalar, nol delta (jurnalga tushmasligi kerak).
    const calls: Array<[string, string, bigint, ApplyDeltaMeta]> = [
      [
        'cp-1',
        'UZS',
        5_000_000n,
        { docType: 'invoiceOut', docId: 'io-1', organizationId: 'org-1' },
      ],
      [
        'cp-1',
        'UZS',
        -2_000_000n,
        { docType: 'paymentIn', docId: 'pi-1', organizationId: 'org-1' },
      ],
      ['cp-1', 'USD', 700n, { docType: 'invoiceOut', docId: 'io-2', organizationId: 'org-2' }],
      ['cp-1', 'UZS', 0n, { docType: 'cashIn', docId: 'ci-0', organizationId: 'org-1' }],
      ['cp-2', 'UZS', -900_000n, { docType: 'supply', docId: 'sup-1', organizationId: 'org-1' }],
      [
        'cp-2',
        'UZS',
        400_000n,
        { docType: 'purchaseReturn', docId: 'pr-1', organizationId: 'org-1' },
      ],
      ['cp-2', 'UZS', 300_000n, { docType: 'debt', docId: 'debt-2', organizationId: null }],
    ];
    for (const [counterpartyId, currency, delta, meta] of calls) {
      await s.applyDelta(tx as never, 'acc-1', counterpartyId, currency, delta, meta);
    }

    const journalSums = new Map<string, bigint>();
    for (const e of entryArgs) {
      const key = `${e.data.counterpartyId}|${e.data.currency}`;
      journalSums.set(key, (journalSums.get(key) ?? 0n) + e.data.deltaMinor);
    }

    expect([...journalSums.keys()].sort()).toEqual([...materialized.keys()].sort());
    for (const [key, sum] of journalSums) {
      expect(sum).toBe(materialized.get(key));
    }
    // Sanity: nol delta hech qayerga tushmadi (6 ta yozuv, 7 chaqiruv).
    expect(entryArgs).toHaveLength(6);
  });
});

/**
 * 2026-08-28 — «BITTA HUJJAT = BITTA XABAR».
 *
 * Bir hujjat bir necha `applyDelta` qilishi mumkin (POS qarz to'lovi FIFO
 * bo'yicha N qarzga bo'linadi). Jurnal bo'linishicha qolishi SHART, lekin
 * mijozga ketadigan xabar HUJJAT darajasida bo'lishi kerak — aks holda u
 * birinchi bo'lakning summasini «to'liq to'lov» deb o'qiydi.
 *
 * NON-VACUOUS: `notice` qo'llab-quvvatlanmagan kodda 1-test hodisani KO'RADI
 * (`emit` chaqirilgan), 3-test esa `emitDocumentNotice` yo'qligidan yiqiladi.
 */
function svcWithBalance(balanceMinor: bigint | null) {
  const events = { emit: vi.fn() };
  const findFirst = vi.fn(async () => (balanceMinor === null ? null : { balanceMinor }));
  const prisma = { client: { counterpartyBalance: { findFirst } } };
  return {
    service: new CounterpartyBalanceService(prisma as never, events as never),
    events,
    findFirst,
  };
}

const DOC_NOTICE = {
  accountId: 'acc-1',
  counterpartyId: 'cp-1',
  currency: 'UZS',
  source: 'debtpayment',
  docType: 'debtpayment',
  docId: 'batch-1',
} as const;

describe('CounterpartyBalanceService — hujjat darajasidagi xabar', () => {
  it("`notice: 'defer'` jurnalni yozadi, lekin hodisa CHIQARMAYDI", async () => {
    const { tx, entryArgs } = makeTx();
    const { service, events } = svcWithBalance(0n);
    await service.applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', -1_000_000n, {
      ...META,
      notice: 'defer',
    });
    // Pul daftari — o'zgarishsiz.
    expect(entryArgs).toHaveLength(1);
    expect(entryArgs[0]!.data.deltaMinor).toBe(-1_000_000n);
    // Xabar — chaqiruvchi hujjat tugagach o'zi beradi.
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("sukut (`notice` berilmagan) — eski xulq: har delta o'z hodisasini beradi", async () => {
    const { tx } = makeTx();
    const { service, events } = svcWithBalance(0n);
    await service.applyDelta(tx as never, 'acc-1', 'cp-1', 'UZS', -1_000_000n, META);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('`emitDocumentNotice` — YAKUNIY balans bilan bitta hodisa', async () => {
    const { service, events, findFirst } = svcWithBalance(0n);
    await service.emitDocumentNotice({ ...DOC_NOTICE, deltaMinor: -2_616_000n });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
    const payload = events.emit.mock.calls[0]![1] as {
      deltaMinor: bigint;
      newBalanceMinor: bigint;
      docId: string;
      source: string;
    };
    // 🔴 Nuqsonning o'zi: ilgari bu yerda bo'lak summasi (−1 572 000) va
    // O'RTADAGI balans (1 044 000) turardi.
    expect(payload.deltaMinor).toBe(-2_616_000n);
    expect(payload.newBalanceMinor).toBe(0n);
    expect(payload.docId).toBe('batch-1');
    expect(payload.source).toBe('debtpayment');
  });

  it('balans qatori yo`q bo`lsa hodisa chiqmaydi (aytadigan gap yo`q)', async () => {
    const { service, events } = svcWithBalance(null);
    await service.emitDocumentNotice({ ...DOC_NOTICE, deltaMinor: -1n });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('nol delta — hodisa ham, DB o`qishi ham yo`q', async () => {
    const { service, events, findFirst } = svcWithBalance(0n);
    await service.emitDocumentNotice({ ...DOC_NOTICE, deltaMinor: 0n });
    expect(findFirst).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('DB nosozligi CHAQIRUVCHIGA QAYTMAYDI — pul allaqachon commit bo`lgan', async () => {
    const events = { emit: vi.fn() };
    const prisma = {
      client: {
        counterpartyBalance: {
          findFirst: vi.fn(async () => {
            throw new Error('db down');
          }),
        },
      },
    };
    const service = new CounterpartyBalanceService(prisma as never, events as never);
    await expect(
      service.emitDocumentNotice({ ...DOC_NOTICE, deltaMinor: -1n }),
    ).resolves.toBeUndefined();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
