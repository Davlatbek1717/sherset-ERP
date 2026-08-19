import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DebtService } from './debt.service.js';

/**
 * QO'NG'IROQ NATIJASI «To'ladi» — NAQD pul KASSAGA tushishi shart.
 *
 * 🔴 Jonli nuqson (egasi, 2026-08-19): «mijoz kartasida ko'rsatadi, lekin
 * olingan pul ham kassaga tushadi — u kassadagi pulga qo'shilishi kerak».
 * O'lchov prodda: bu yo'l (`markCall`) `DebtPayment` qatorini yozardi-yu,
 * `cashDeskId` ham, `retailShiftId` ham QO'YMASDI va pul daftariga
 * (`money.applyDeltas`) UMUMAN tegmasdi — 5 ta naqd to'lov, 44 947 075 so'm,
 * kassa qoldig'ida ham, smenada ham ko'rinmagan. Kassir yo'llari
 * (`addCashPayment`, POS) esa boshidan yozardi: bitta jismoniy hodisaning
 * ikki yo'li ayrilib qolgan edi.
 *
 * Qulflanadigan shartnomalar:
 *  1. naqd to'lov kassa qoldig'ini KREDITLAYDI (`money.applyDeltas`);
 *  2. to'lov qatorida `cashDeskId` saqlanadi;
 *  3. o'sha kassada OCHIQ smena bo'lsa — `retailShiftId` unga biriktiriladi
 *     (aks holda yashiqqa fizik kirgan pul kassirning kutilgan naqdida
 *     ko'rinmay, unga SOXTA KAMOMAD yozilardi);
 *  4. naqd BO'LMAGAN kanal (Click/hisob raqam) yashiqqa TUSHMAYDI;
 *  5. bir nechta faol kassa bo'lsa va tanlanmagan bo'lsa — BALAND OVOZDA
 *     xato (jimgina «birinchisiga» yozish pulni yo'qotardi).
 *
 * NON-VACUOUS: tuzatishdan oldin 1–3 punktlarning hammasi bo'sh/`null` edi.
 */

const ACC = 'acc-1';
const CP = 'cp-1';
const DEBT = 'debt-1';
const DESK = '44444444-4444-4444-4444-444444444444';
const DESK2 = '55555555-5555-5555-5555-555555555555';
const SHIFT = '66666666-6666-4666-8666-666666666666';

interface Row {
  [k: string]: unknown;
}

function makeSvc(opts: { desks?: string[]; openShift?: boolean; deskCurrency?: string } = {}) {
  const desks = opts.desks ?? [DESK];
  const payments: Row[] = [];
  const cashDeltas: Row[] = [];

  const debtRow = {
    id: DEBT,
    accountId: ACC,
    counterpartyId: CP,
    name: 'QRZ-1',
    totalMinor: 100_000n,
    paidMinor: 0n,
    currency: 'UZS',
    status: 'unpaid',
    deletedAt: null,
  };

  const tx = {
    debtPayment: {
      create: async (args: { data: Row }) => {
        const row = {
          id: `pay-${payments.length + 1}`,
          batchId: null,
          reversedAt: null,
          ...args.data,
        };
        payments.push(row);
        return { ...row };
      },
      aggregate: async () => ({
        _sum: {
          amountMinor: payments.reduce((s, p) => s + (p.amountMinor as bigint), 0n),
        },
      }),
    },
    debtNote: { create: async () => ({ id: 'note-1' }) },
    debt: {
      findFirstOrThrow: async () => debtRow,
      update: async (args: { data: Row }) => ({ ...debtRow, ...args.data }),
    },
  };

  const client = {
    debt: { findFirst: async () => debtRow },
    cashDesk: {
      findMany: async () => desks.map((id) => ({ id })),
      findFirst: async (args: { where: { id: string } }) =>
        desks.includes(args.where.id) ? { currency: opts.deskCurrency ?? 'UZS' } : null,
    },
    cashierSession: {
      findFirst: async () => (opts.openShift ? { id: SHIFT } : null),
    },
    debtPayment: { update: async () => ({}) },
    $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx),
  };

  const money = {
    applyDeltas: vi.fn(async (_tx: unknown, _acc: string, ds: Row[]) => {
      cashDeltas.push(...ds);
    }),
  };

  const svc = new DebtService(
    { client } as never,
    { createFromBuffer: vi.fn(async () => ({ id: 'att-1' })) } as never, // attachments
    undefined as never, // htmlPdf
    { applyDelta: vi.fn(async () => undefined) } as never, // balances
    { notifyCounterparty: vi.fn() } as never, // telegram
    undefined as never, // sms
    undefined as never, // msgTemplates
    money as never,
  );
  return { svc, payments, cashDeltas, money };
}

/** «To'ladi» + naqd — oynadan keladigan minimal payload. */
function paidCash(over: Row = {}): Row {
  return {
    outcome: 'paid_full',
    paymentKind: 'cash',
    currency: 'UZS',
    amountMinor: '40000',
    ...over,
  };
}

describe("Qo'ng'iroq natijasi — naqd to'lov KASSAGA tushadi", () => {
  it('🔴 kassa qoldig`i kreditlanadi (pul daftariga yoziladi)', async () => {
    const h = makeSvc();
    await h.svc.markCall(ACC, 'u1', 'admin', DEBT, paidCash({ cashDeskId: DESK }));

    expect(h.money.applyDeltas).toHaveBeenCalled();
    expect(h.cashDeltas).toHaveLength(1);
    expect(h.cashDeltas[0]).toMatchObject({ sourceId: DESK, deltaMinor: 40_000n });
  });

  it('to`lov qatorida `cashDeskId` saqlanadi (mijoz kartasi bilan kassa bog`lanadi)', async () => {
    const h = makeSvc();
    await h.svc.markCall(ACC, 'u1', 'admin', DEBT, paidCash({ cashDeskId: DESK }));

    expect(h.payments[0]).toMatchObject({ cashDeskId: DESK, method: 'cash' });
  });

  it('🔴 kassada OCHIQ smena bo`lsa to`lov unga biriktiriladi (soxta kamomad bo`lmasin)', async () => {
    const h = makeSvc({ openShift: true });
    await h.svc.markCall(ACC, 'u1', 'admin', DEBT, paidCash({ cashDeskId: DESK }));

    expect(h.payments[0]?.retailShiftId).toBe(SHIFT);
  });

  it('smena ochiq bo`lmasa `retailShiftId` NULL qoladi (0 EMAS, taxmin ham emas)', async () => {
    const h = makeSvc({ openShift: false });
    await h.svc.markCall(ACC, 'u1', 'admin', DEBT, paidCash({ cashDeskId: DESK }));

    expect(h.payments[0]?.retailShiftId).toBeNull();
  });

  it('bitta faol kassa bo`lsa — tanlanmasa ham o`sha kassaga tushadi', async () => {
    const h = makeSvc({ desks: [DESK] });
    await h.svc.markCall(ACC, 'u1', 'admin', DEBT, paidCash());

    expect(h.payments[0]?.cashDeskId).toBe(DESK);
    expect(h.cashDeltas).toHaveLength(1);
  });

  it('🔴 bir nechta faol kassa + tanlanmagan ⇒ XATO (jim yozib yubormaydi)', async () => {
    const h = makeSvc({ desks: [DESK, DESK2] });

    await expect(h.svc.markCall(ACC, 'u1', 'admin', DEBT, paidCash())).rejects.toThrow(
      BadRequestException,
    );
    expect(h.payments).toHaveLength(0);
    expect(h.money.applyDeltas).not.toHaveBeenCalled();
  });

  it('Click (naqd emas) — kassaga TUSHMAYDI, lekin to`lov yoziladi', async () => {
    const h = makeSvc();
    await h.svc.markCall(
      ACC,
      'u1',
      'admin',
      DEBT,
      paidCash({ paymentKind: 'click', screenshotBase64: 'iVBORw0KGgo=' }),
    );

    expect(h.payments).toHaveLength(1);
    expect(h.payments[0]?.cashDeskId).toBeNull();
    expect(h.cashDeltas).toHaveLength(0);
  });

  it('to`lovsiz natija («to`lamadi») kassaga tegmaydi', async () => {
    const h = makeSvc();
    await h.svc.markCall(ACC, 'u1', 'admin', DEBT, {
      outcome: 'not_paid',
      nextContactAt: new Date('2026-08-25T09:00:00Z'),
    });

    expect(h.payments).toHaveLength(0);
    expect(h.money.applyDeltas).not.toHaveBeenCalled();
  });
});
