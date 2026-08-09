import { describe, expect, it, vi } from 'vitest';
import { DATA_QUALITY } from '../../report/metrics/index.js';
import type { MoneyMapBlock, MoneyMapBlockKey } from './money-map.js';
import { MoneyMapService } from './money-map.service.js';

/**
 * MK15 — «Korxona puli qayerda» I/O qatlami.
 *
 * Bu yerdagi test-mavzu: **har blok AYNAN o'z servisidan keladi** va **manba
 * yiqilsa panel yolg'on nol ko'rsatmaydi**. Pul qoidalarining o'zi sof
 * `money-map.ts` da (18 test) va manba servislarida sinalgan.
 */

const ACCOUNT = 'acc-1';

function makeService(
  over: {
    sourceBalances?: (kind: string) => Promise<unknown>;
    counterpartyReport?: () => Promise<unknown>;
    driverCash?: () => Promise<unknown>;
    inTransit?: () => Promise<unknown>;
    currencies?: unknown[];
  } = {},
) {
  const money = {
    sourceBalances: vi.fn(async (_acc: string, kind: string) =>
      over.sourceBalances
        ? await over.sourceBalances(kind)
        : kind === 'cash_desk'
          ? [{ id: 'k1', currency: 'UZS', balanceMinor: 1_000n, ledgered: true }]
          : [{ id: 'b1', currency: 'UZS', balanceMinor: 2_000n, ledgered: true }],
    ),
  };
  const counterpartyBalances = {
    counterpartyBalanceReport: vi.fn(
      over.counterpartyReport ??
        (async () => ({
          summaries: {
            totalDebtMinor: '3000',
            totalCreditMinor: '4000',
            currency: 'UZS',
            unconvertedByCurrency: [],
          },
        })),
    ),
  };
  const driverCash = {
    outstandingByCurrency: vi.fn(
      over.driverCash ?? (async () => [{ currency: 'UZS', amountMinor: 5_000n }]),
    ),
  };
  const inTransit = {
    getInTransitValueByCurrency: vi.fn(
      over.inTransit ?? (async () => [{ currency: 'UZS', amountMinor: 6_000n }]),
    ),
  };
  const prisma = {
    client: {
      currency: {
        findMany: vi.fn(async () =>
          over.currencies !== undefined
            ? over.currencies
            : [
                {
                  code: '860',
                  isoCode: 'UZS',
                  default: true,
                  rateValue: 100_000_000n,
                  multiplicity: 1,
                  indirect: false,
                },
              ],
        ),
      },
    },
  };
  const svc = new MoneyMapService(
    prisma as never,
    money as never,
    counterpartyBalances as never,
    driverCash as never,
    inTransit as never,
  );
  return { svc, money, counterpartyBalances, driverCash, inTransit };
}

function block(blocks: MoneyMapBlock[], key: MoneyMapBlockKey): MoneyMapBlock {
  const b = blocks.find((x) => x.key === key);
  if (!b) throw new Error(`blok yo'q: ${key}`);
  return b;
}

describe('MoneyMapService.snapshot — har raqam O‘Z servisidan', () => {
  it('oltita blok ham qaytadi', async () => {
    const { svc } = makeService();
    const snap = await svc.snapshot(ACCOUNT);
    expect(snap.blocks.map((b) => b.key)).toEqual([
      'cash',
      'bank',
      'customer_debt',
      'supplier_debt',
      'driver_cash',
      'goods_in_transit',
    ]);
  });

  it('har blokda provenance (qaysi servis) ko‘rinadi', async () => {
    const { svc } = makeService();
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'cash').source).toContain('MoneyService');
    expect(block(snap.blocks, 'bank').source).toContain('MoneyService');
    expect(block(snap.blocks, 'customer_debt').source).toContain('CounterpartyBalanceService');
    expect(block(snap.blocks, 'supplier_debt').source).toContain('CounterpartyBalanceService');
    expect(block(snap.blocks, 'driver_cash').source).toContain('DriverCashService');
    expect(block(snap.blocks, 'goods_in_transit').source).toContain('StockInTransitService');
  });

  it('summalar mos servisdan olinadi', async () => {
    const { svc } = makeService();
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'cash').amountMinor).toBe('1000');
    expect(block(snap.blocks, 'bank').amountMinor).toBe('2000');
    expect(block(snap.blocks, 'customer_debt').amountMinor).toBe('3000');
    expect(block(snap.blocks, 'supplier_debt').amountMinor).toBe('4000');
    expect(block(snap.blocks, 'driver_cash').amountMinor).toBe('5000');
    expect(block(snap.blocks, 'goods_in_transit').amountMinor).toBe('6000');
  });

  it("mijoz qarzi «bizga qarz», ta'minotchi qarzi «biz qarz» tomonidan olinadi", async () => {
    const { svc, counterpartyBalances } = makeService();
    await svc.snapshot(ACCOUNT);
    // Hisobot BIR MARTA chaqiriladi — ikkala raqam bitta javobning ikki
    // tomonidan olinadi (ikki so'rov = ikki xil paytdagi holat xavfi).
    expect(counterpartyBalances.counterpartyBalanceReport).toHaveBeenCalledTimes(1);
  });

  it('sof qoldiq: aktivlar − passiv', async () => {
    const { svc } = makeService();
    const snap = await svc.snapshot(ACCOUNT);
    // (1000 + 2000 + 3000 + 5000 + 6000) − 4000 = 13 000
    expect(snap.summary.netMinor).toBe('13000');
    expect(snap.summary.currency).toBe('UZS');
  });
});

describe('MoneyMapService.snapshot — manba javob bermasa «hisoblanmadi»', () => {
  it('yiqilgan manba blokini null qiladi, boshqalarini emas', async () => {
    const { svc } = makeService({
      driverCash: async () => {
        throw new Error('DB down');
      },
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'driver_cash').amountMinor).toBeNull();
    expect(block(snap.blocks, 'driver_cash').quality).toBe(DATA_QUALITY.uncollected);
    expect(block(snap.blocks, 'cash').amountMinor).toBe('1000');
  });

  it('bitta manba yiqilsa SOF QOLDIQ null — yarim yig‘indi berilmaydi', async () => {
    const { svc } = makeService({
      inTransit: async () => {
        throw new Error('DB down');
      },
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(snap.summary.netMinor).toBeNull();
    expect(snap.summary.quality).toBe(DATA_QUALITY.partial);
  });

  it('kontragent hisoboti yiqilsa IKKALA qarz bloki ham «hisoblanmadi»', async () => {
    const { svc } = makeService({
      counterpartyReport: async () => {
        throw new Error('DB down');
      },
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'customer_debt').amountMinor).toBeNull();
    expect(block(snap.blocks, 'supplier_debt').amountMinor).toBeNull();
  });
});

describe('MoneyMapService.snapshot — bank qoldig‘i provenance (NULL ≠ 0)', () => {
  const bankRows = (rows: Array<{ balanceMinor: bigint | null }>) => async (kind: string) =>
    kind === 'cash_desk'
      ? [{ id: 'k1', currency: 'UZS', balanceMinor: 0n, ledgered: true }]
      : rows.map((r, i) => ({
          id: `b${i}`,
          currency: 'UZS',
          balanceMinor: r.balanceMinor,
          ledgered: r.balanceMinor !== null,
        }));

  it('hech bir hisob o‘lchanmagan — blok «hisoblanmadi», 0 EMAS', async () => {
    const { svc } = makeService({ sourceBalances: bankRows([{ balanceMinor: null }]) });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'bank').amountMinor).toBeNull();
    expect(block(snap.blocks, 'bank').quality).toBe(DATA_QUALITY.uncollected);
  });

  it('bir qismi o‘lchanmagan — raqam bor, lekin «qisman»', async () => {
    const { svc } = makeService({
      sourceBalances: bankRows([{ balanceMinor: 900n }, { balanceMinor: null }]),
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'bank').amountMinor).toBe('900');
    expect(block(snap.blocks, 'bank').quality).toBe(DATA_QUALITY.partial);
  });

  it('hammasi o‘lchangan — «to‘liq»', async () => {
    const { svc } = makeService({
      sourceBalances: bankRows([{ balanceMinor: 900n }, { balanceMinor: 100n }]),
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'bank').amountMinor).toBe('1000');
    expect(block(snap.blocks, 'bank').quality).toBe(DATA_QUALITY.complete);
  });

  it('bank hisobi umuman yo‘q — «o‘lchandi va nol» EMAS, «hisoblanmadi»', async () => {
    // Hisob ochilmagan tenant uchun «bankda 0 so'm» degan javob ham yolg'on:
    // o'lchanadigan narsa yo'q.
    const { svc } = makeService({ sourceBalances: bankRows([]) });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'bank').amountMinor).toBeNull();
  });

  it('kassa qoldig‘i 0 bo‘lsa — bu HAQIQIY nol («to‘liq»)', async () => {
    const { svc } = makeService({ sourceBalances: bankRows([{ balanceMinor: 500n }]) });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'cash').amountMinor).toBe('0');
    expect(block(snap.blocks, 'cash').quality).toBe(DATA_QUALITY.complete);
  });
});

describe('MoneyMapService.snapshot — kurs shartnomasi', () => {
  it('kursi yo‘q valyutadagi kassa jamiga qo‘shilmaydi, alohida chiqadi', async () => {
    const { svc } = makeService({
      sourceBalances: async (kind: string) =>
        kind === 'cash_desk'
          ? [
              { id: 'k1', currency: 'UZS', balanceMinor: 1_000n, ledgered: true },
              { id: 'k2', currency: 'EUR', balanceMinor: 700n, ledgered: true },
            ]
          : [{ id: 'b1', currency: 'UZS', balanceMinor: 2_000n, ledgered: true }],
    });
    const snap = await svc.snapshot(ACCOUNT);
    const cash = block(snap.blocks, 'cash');
    expect(cash.amountMinor).toBe('1000');
    expect(cash.unconvertedByCurrency).toEqual([{ currency: 'EUR', amountMinor: '700' }]);
    expect(snap.summary.unconvertedByCurrency).toEqual([{ currency: 'EUR', amountMinor: '700' }]);
  });

  it('kontragent hisobotining konvertatsiya qilinmagan qoldig‘i BIR MARTA sanaladi', async () => {
    // Hisobot bitta scope-daraja raqamini qaytaradi (debitor/kreditor bo'yicha
    // ajratilmagan). Uni ikkala qarz blokiga ham ilib qo'yish o'sha pulni
    // yakunda IKKI MARTA ko'rsatardi.
    const { svc } = makeService({
      counterpartyReport: async () => ({
        summaries: {
          totalDebtMinor: '3000',
          totalCreditMinor: '0',
          currency: 'UZS',
          unconvertedByCurrency: [{ currency: 'USD', amountMinor: '250' }],
        },
      }),
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(snap.summary.unconvertedByCurrency).toEqual([{ currency: 'USD', amountMinor: '250' }]);
  });

  it("konvertatsiya qilinmagan qoldiq ta'minotchi blokini ham «qisman» qiladi", async () => {
    // Pul faqat bir blokda ko'rsatiladi, lekin BAYROQ ikkalasida ham tushadi —
    // aks holda ta'minotchi qarzi «to'liq» bo'lib ko'rinardi.
    const { svc } = makeService({
      counterpartyReport: async () => ({
        summaries: {
          totalDebtMinor: '3000',
          totalCreditMinor: '0',
          currency: 'UZS',
          unconvertedByCurrency: [{ currency: 'USD', amountMinor: '250' }],
        },
      }),
    });
    const snap = await svc.snapshot(ACCOUNT);
    expect(block(snap.blocks, 'customer_debt').quality).toBe(DATA_QUALITY.partial);
    expect(block(snap.blocks, 'supplier_debt').quality).toBe(DATA_QUALITY.partial);
    expect(block(snap.blocks, 'supplier_debt').unconvertedByCurrency).toEqual([]);
  });
});
