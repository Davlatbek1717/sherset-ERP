import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../cashier-session/cashier-session.service.js';
import { SalesReturnAcceptanceService } from './sales-return-acceptance.service.js';

/**
 * G3 ↔ G1 ZANJIRI (reja G3, 3-vazifa: «post bo'lgan vozvrat kassirda
 * to'lanmagan bo'lib chiqishini UCHMA-UCH tekshir»).
 *
 * Zanjir: omborchi qabul qiladi → ВП `posted` bo'ladi → kassir mijoz
 * profilida «to'lanmagan vozvratlar» ro'yxatida ko'radi → to'laydi.
 *
 * Bu ikki fazani BOG'LAYDIGAN shartlar nozik va jimgina buzilishi mumkin:
 *   · `agentId` — qabul uni CHEKdan oladi; kassir ro'yxati esa AYNAN
 *     `agentId` bo'yicha qidiradi (mijoz profili). Chekda mijoz bo'lmasa
 *     qabul umuman o'tmasligi kerak (aks holda vozvrat hech kimga
 *     ko'rinmay «yo'qoladi»);
 *   · `state: 'posted'` — qoralama (`post:false`) ro'yxatga TUSHMASLIGI kerak;
 *   · `currency` — UZS bo'lmagan vozvrat `payable:false` (G1 chegarasi).
 *
 * Shuning uchun test qabul YOZGAN hujjat shaklini olib, uni AYNAN
 * `unpaidReturns` orqali o'tkazadi — ikkala uchi ham haqiqiy servis.
 */

const ACCOUNT = 'acc-1';
const USER = 'katta-omborchi-1';
const SALE = '11111111-1111-4111-8111-000000000001';
const AGENT = '11111111-1111-4111-8111-000000000002';
const ORG = '11111111-1111-4111-8111-000000000003';
const P1 = '11111111-1111-4111-8111-000000000004';
const CELL = '11111111-1111-4111-8111-000000000006';

/** Qabul servisi + `create()` chaqiruvini ushlab qoluvchi stub. */
function makeAcceptance(agentId: string | null = AGENT) {
  const captured: Array<Record<string, unknown>> = [];
  const create = vi.fn(async (_a: string, _u: string, input: Record<string, unknown>) => {
    captured.push(input);
    return {
      id: 'sr-1',
      name: 'ВП-2026-00007',
      state: input.applicable ? 'posted' : 'draft',
      sumMinor: 60000n,
    };
  });

  const client = {
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE,
        name: 'CH-00042',
        moment: new Date('2026-08-24T09:00:00Z'),
        state: 'posted',
        sumMinor: 250000n,
        agentId,
        organizationId: ORG,
        currency: 'UZS',
        rateValue: 100000000n,
        vatEnabled: true,
        vatIncluded: false,
        refundedFromId: null,
        agent: agentId ? { id: agentId, name: 'Mijoz A' } : null,
        positions: [{ productId: P1, quantity: '5', priceMinor: 30000n, discount: '0' }],
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    salesReturnPosition: { findMany: vi.fn().mockResolvedValue([]) },
    product: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: P1, name: 'Shurup 5mm', code: 'K1', article: null, barcodes: ['478'] },
        ]),
    },
    storeCell: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: CELL, name: '07-01-01-01', storeId: 'store-07', store: { attributes: {} } },
        ]),
    },
    organization: { findMany: vi.fn().mockResolvedValue([{ id: ORG }]) },
    store: { findMany: vi.fn().mockResolvedValue([]) },
  };

  return {
    service: new SalesReturnAcceptanceService({ client } as never, { create } as never),
    captured,
  };
}

/**
 * Kassir tomoni — `unpaidReturns` AYNAN qanday filtr qo'yishini `findMany`
 * chaqiruvidan olamiz va uni saqlangan qatorlarga o'zimiz qo'llaymiz. Ya'ni
 * test filtrni TAKRORLAMAYDI, servisning haqiqiy filtrini ishlatadi.
 */
function makeCashier(stored: Array<Record<string, unknown>>) {
  const client = {
    salesReturn: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        return stored.filter(
          (r) =>
            r.accountId === w.accountId &&
            r.agentId === w.agentId &&
            r.state === w.state &&
            (r.deletedAt ?? null) === (w.deletedAt ?? null),
        );
      }),
    },
  };
  return new CashierSessionService({ client } as never, {} as never, {} as never);
}

/** Qabul yozgan hujjatni «bazadagi qator» ko'rinishiga keltiradi. */
function asStoredRow(input: Record<string, unknown>) {
  const positions = input.positions as Array<{ quantity: string; priceMinor: string }>;
  const sumMinor = positions.reduce(
    (acc, p) => acc + BigInt(p.priceMinor) * BigInt(Math.round(Number(p.quantity))),
    0n,
  );
  return {
    accountId: ACCOUNT,
    id: 'sr-1',
    name: 'ВП-2026-00007',
    moment: new Date('2026-08-24T10:00:00Z'),
    agentId: input.agentId,
    currency: input.currency,
    state: input.applicable ? 'posted' : 'draft',
    deletedAt: null,
    sumMinor,
    payedSumMinor: 0n,
  };
}

describe('G3 → G1: qabul qilingan vozvrat kassirda «to‘lanmagan» bo‘lib chiqadi', () => {
  it('to‘liq zanjir — qabul → posted → kassir ro‘yxatida qaytim summasi bilan', async () => {
    const { service, captured } = makeAcceptance();
    await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '2', cellId: CELL }],
    });

    const row = asStoredRow(captured[0] as Record<string, unknown>);
    // Chek narxi 30 000 × 2 = 60 000 (qabul narx yubormaydi — chekdan olinadi).
    expect(row.sumMinor).toBe(60000n);
    expect(row.state).toBe('posted');
    expect(row.agentId).toBe(AGENT);

    const cashier = makeCashier([row]);
    const res = await cashier.unpaidReturns(ACCOUNT, { agentId: AGENT });

    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      name: 'ВП-2026-00007',
      sumMinor: '60000',
      payedSumMinor: '0',
      remainingMinor: '60000',
      payable: true,
    });
    expect(res.totalRemainingMinor).toBe('60000');
  });

  it('QORALAMA qabul (post:false) kassir ro‘yxatiga TUSHMAYDI', async () => {
    const { service, captured } = makeAcceptance();
    await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '2', cellId: CELL }],
      post: false,
    });

    const row = asStoredRow(captured[0] as Record<string, unknown>);
    expect(row.state).toBe('draft');

    const cashier = makeCashier([row]);
    const res = await cashier.unpaidReturns(ACCOUNT, { agentId: AGENT });
    expect(res.items).toEqual([]);
  });

  it('to‘langan vozvrat ro‘yxatdan chiqadi (cap ishlagach)', async () => {
    const { service, captured } = makeAcceptance();
    await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '2', cellId: CELL }],
    });
    const row = { ...asStoredRow(captured[0] as Record<string, unknown>), payedSumMinor: 60000n };

    const cashier = makeCashier([row]);
    const res = await cashier.unpaidReturns(ACCOUNT, { agentId: AGENT });
    expect(res.items).toEqual([]);
  });

  it('BOSHQA mijoz profilida ko‘rinmaydi', async () => {
    const { service, captured } = makeAcceptance();
    await service.accept(ACCOUNT, USER, SALE, {
      positions: [{ productId: P1, quantity: '2', cellId: CELL }],
    });
    const row = asStoredRow(captured[0] as Record<string, unknown>);

    const cashier = makeCashier([row]);
    const res = await cashier.unpaidReturns(ACCOUNT, {
      agentId: '11111111-1111-4111-8111-0000000000ff',
    });
    expect(res.items).toEqual([]);
  });

  /**
   * Mijozsiz chek qabul qilinmaydi — aks holda ВП `agentId` siz yozilib,
   * `unpaidReturns` (agentId bo'yicha) uni HECH QACHON topolmasdi: mijozga
   * qarzdorlik yozilar, lekin pulni olish yo'li bo'lmasdi.
   */
  it('mijozsiz chek — qabul umuman o‘tmaydi (vozvrat «yo‘qolmasin»)', async () => {
    const { service, captured } = makeAcceptance(null);
    await expect(
      service.accept(ACCOUNT, USER, SALE, {
        positions: [{ productId: P1, quantity: '2', cellId: CELL }],
      }),
    ).rejects.toThrow(/mijoz/i);
    expect(captured).toHaveLength(0);
  });
});
