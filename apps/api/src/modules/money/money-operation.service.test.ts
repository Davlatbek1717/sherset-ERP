import { describe, expect, it, vi } from 'vitest';
import { MoneyOperationService } from './money-operation.service.js';

/**
 * Faza 17 / M-14 — «Платежи» ledger toolbar totals.
 *
 * Edi: `aggregate({ _sum: { deltaMinor } })` filtrsiz holatda USD sentini
 * UZS tiyiniga QO'SHIB bitta songa aylantirardi va UI uni «so'm» deb
 * ko'rsatardi — ko'p valyutali kassada bu son ma'nosiz, lekin foydalanuvchi
 * shunga qarab qaror qiladi. Endi totals har valyuta uchun alohida qaytadi.
 */

interface Row {
  currency: string;
  deltaMinor: bigint;
}

function makeService(rows: Row[]) {
  const client = {
    moneyOperation: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => rows.length),
      groupBy: vi.fn(async (args: { where?: { deltaMinor?: { gt?: bigint; lt?: bigint } } }) => {
        const dir = args.where?.deltaMinor;
        const scoped = rows.filter((r) =>
          dir?.gt !== undefined
            ? r.deltaMinor > 0n
            : dir?.lt !== undefined
              ? r.deltaMinor < 0n
              : true,
        );
        const byCur = new Map<string, bigint>();
        for (const r of scoped) byCur.set(r.currency, (byCur.get(r.currency) ?? 0n) + r.deltaMinor);
        return Array.from(byCur, ([currency, sum]) => ({
          currency,
          _sum: { deltaMinor: sum },
        }));
      }),
    },
    counterparty: { findMany: vi.fn(async () => []) },
  };
  return { svc: new MoneyOperationService({ client } as never), client };
}

describe('MoneyOperationService — per-valyuta totals (M-14)', () => {
  it('USD va UZS bitta songa QO‘SHILMAYDI — har valyuta alohida qator', async () => {
    const { svc } = makeService([
      { currency: 'UZS', deltaMinor: 500_000n },
      { currency: 'UZS', deltaMinor: -200_000n },
      { currency: 'USD', deltaMinor: 10_000n },
      { currency: 'USD', deltaMinor: -2_500n },
    ]);
    const res = await svc.list('acc', {});
    expect(res.totals.byCurrency).toEqual([
      { currency: 'UZS', inMinor: '500000', outMinor: '-200000', netMinor: '300000' },
      { currency: 'USD', inMinor: '10000', outMinor: '-2500', netMinor: '7500' },
    ]);
  });

  it('ko‘p valyuta bo‘lsa mixedCurrency bayrog‘i ko‘tariladi', async () => {
    const { svc } = makeService([
      { currency: 'UZS', deltaMinor: 1_000n },
      { currency: 'USD', deltaMinor: 1_000n },
    ]);
    const res = await svc.list('acc', {});
    expect(res.totals.mixedCurrency).toBe(true);
  });

  it('bitta valyutali kassa — bitta qator, mixedCurrency false', async () => {
    const { svc } = makeService([
      { currency: 'UZS', deltaMinor: 900n },
      { currency: 'UZS', deltaMinor: -400n },
    ]);
    const res = await svc.list('acc', {});
    expect(res.totals.mixedCurrency).toBe(false);
    expect(res.totals.byCurrency).toEqual([
      { currency: 'UZS', inMinor: '900', outMinor: '-400', netMinor: '500' },
    ]);
  });

  it('faqat chiqim bo‘lgan valyuta ham qatorda bor (kirim 0)', async () => {
    const { svc } = makeService([{ currency: 'EUR', deltaMinor: -7_000n }]);
    const res = await svc.list('acc', {});
    expect(res.totals.byCurrency).toEqual([
      { currency: 'EUR', inMinor: '0', outMinor: '-7000', netMinor: '-7000' },
    ]);
  });

  it('yozuv yo‘q — bo‘sh totals, mixedCurrency false', async () => {
    const { svc } = makeService([]);
    const res = await svc.list('acc', {});
    expect(res.totals.byCurrency).toEqual([]);
    expect(res.totals.mixedCurrency).toBe(false);
  });
});
