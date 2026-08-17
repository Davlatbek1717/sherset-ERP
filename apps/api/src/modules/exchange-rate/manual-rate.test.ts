import type { Prisma } from '@moysklad/db';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExchangeRateService } from './exchange-rate.service.js';

/**
 * Kursni QO'LDA qo'yish — `setManualRate` shartnomasi (egasi, 2026-08-17).
 *
 * 🔴 Qulflanadigan invariantlar (buzilsa pul yolg'on hisoblanadi):
 *   1. **Ikkala qatlam BIRGA** yoziladi — `exchange_rates` MANUAL qatori (kassa
 *      shundan o'qiydi) VA `Currency.rateValue` (ERP hujjatlari/hisobot). Faqat
 *      biri yozilsa chek bilan hisobot boshqa kursdan hisoblaydi.
 *   2. **Bitta tranzaksiya** — yarim qo'llanish bo'lmaydi.
 *   3. **Audit izi** — kim, qachon, nimadan nimaga.
 *   4. **Sana faqat bugungi UTC kuni** — o'tmish qayta hisoblanmaydi.
 *   5. **`nominal` meros oladi** — per-1000 kotirovkada 1000× xato bo'lmaydi.
 *   6. **Baza valyutasi rad**, **noma'lum valyuta 404**.
 */

const ACCOUNT = '00000000-0000-0000-0000-000000000001';
const USER = '885fb467-a269-4e87-be92-91159c95e834';
const USD_ID = '11111111-1111-1111-1111-111111111111';

interface Calls {
  rateUpsert: unknown[];
  currencyUpdate: unknown[];
  audit: unknown[];
  txCount: number;
}

function makeService(
  opts: {
    currencies?: Array<Record<string, unknown>>;
    knownNominal?: number | null;
    failCurrencyUpdate?: boolean;
  } = {},
) {
  const calls: Calls = { rateUpsert: [], currencyUpdate: [], audit: [], txCount: 0 };

  const currencies = opts.currencies ?? [
    {
      id: USD_ID,
      code: '840',
      isoCode: 'USD',
      default: false,
      rateValue: 1_200_000_000_000n,
      multiplicity: 1,
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      code: '860',
      isoCode: 'UZS',
      default: true,
      rateValue: 100_000_000n,
      multiplicity: 1,
    },
  ];

  const tx = {
    exchangeRate: {
      upsert: vi.fn(async (args: unknown) => {
        calls.rateUpsert.push(args);
        return {};
      }),
    },
    currency: {
      update: vi.fn(async (args: unknown) => {
        if (opts.failCurrencyUpdate) throw new Error('currency update failed');
        calls.currencyUpdate.push(args);
        return {};
      }),
    },
    auditLog: {
      create: vi.fn(async (args: unknown) => {
        calls.audit.push(args);
        return {};
      }),
    },
  };

  const prisma = {
    client: {
      currency: { findMany: vi.fn(async () => currencies) },
      exchangeRate: {
        findFirst: vi.fn(async () =>
          opts.knownNominal === null ? null : { nominal: opts.knownNominal ?? 1 },
        ),
      },
      auditLog: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        calls.txCount++;
        return fn(tx);
      }),
    },
  };

  const svc = new ExchangeRateService(prisma as never, {} as never);
  return { svc, calls, prisma, tx };
}

describe('setManualRate — ikkala qatlam bitta tranzaksiyada', () => {
  it('exchange_rates ga MANUAL qator yozadi (kassa shundan o`qiydi)', async () => {
    const { svc, calls } = makeService();
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });

    expect(calls.rateUpsert).toHaveLength(1);
    const args = calls.rateUpsert[0] as {
      where: { date_currency_source: { source: string; currency: string; date: Date } };
      create: { rate: Prisma.Decimal; nominal: number };
    };
    expect(args.where.date_currency_source.source).toBe('MANUAL');
    expect(args.where.date_currency_source.currency).toBe('USD');
    expect(args.create.rate.toString()).toBe('12000');
  });

  it('Currency.rateValue ni ×10^8 kanonik qiymatga yangilaydi', async () => {
    const { svc, calls } = makeService();
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });

    const args = calls.currencyUpdate[0] as {
      where: { id: string };
      data: { rateValue: bigint; rateUpdateType: string };
    };
    expect(args.where.id).toBe(USD_ID);
    expect(args.data.rateValue).toBe(1_200_000_000_000n); // 12000 × 1e8
    expect(args.data.rateUpdateType).toBe('MANUAL');
  });

  it('IKKALASI ham bitta $transaction ichida (yarim qo`llanish yo`q)', async () => {
    const { svc, calls } = makeService();
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });

    expect(calls.txCount).toBe(1);
    expect(calls.rateUpsert).toHaveLength(1);
    expect(calls.currencyUpdate).toHaveLength(1);
    expect(calls.audit).toHaveLength(1);
  });

  it('Currency yozuvi yiqilsa butun amal otiladi (kassa qatori yolg`iz qolmaydi)', async () => {
    const { svc } = makeService({ failCurrencyUpdate: true });
    await expect(
      svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' }),
    ).rejects.toThrow('currency update failed');
  });

  it('audit izini yozadi — kim, nimadan nimaga', async () => {
    const { svc, calls } = makeService();
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '13000' });

    const args = calls.audit[0] as {
      data: {
        userId: string;
        entity: string;
        action: string;
        entityId: string;
        fieldChanges: { rate: { before: string; after: string } };
      };
    };
    expect(args.data.userId).toBe(USER);
    expect(args.data.entity).toBe('currency');
    expect(args.data.entityId).toBe(USD_ID);
    expect(args.data.action).toBe('rate_change');
    expect(args.data.fieldChanges.rate.before).toBe('1200000000000');
    expect(args.data.fieldChanges.rate.after).toBe('1300000000000');
  });

  it('sana DOIM bugungi UTC kun boshi (o`tmish qayta hisoblanmaydi)', async () => {
    const { svc, calls } = makeService();
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });

    const args = calls.rateUpsert[0] as {
      where: { date_currency_source: { date: Date } };
    };
    const d = args.where.date_currency_source.date;
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
    const today = new Date();
    expect(d.getUTCFullYear()).toBe(today.getUTCFullYear());
    expect(d.getUTCMonth()).toBe(today.getUTCMonth());
    expect(d.getUTCDate()).toBe(today.getUTCDate());
  });

  it('qaytgan qator kassa kutgan shaklda — rateMinor kanonik', async () => {
    const { svc } = makeService();
    const row = await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });

    expect(row.source).toBe('MANUAL');
    expect(row.currency).toBe('USD');
    expect(row.rate).toBe('12000');
    // POS `usdRateMinor` ni shu masshtabda yuboradi (stale-scale qo'riqchisi
    // `< 10^9` ni rad etadi) — kichik chiqsa kassa to'lovi jimgina yiqiladi.
    expect(row.rateMinor).toBe('1200000000000');
    expect(BigInt(row.rateMinor) > 1_000_000_000n).toBe(true);
  });
});

describe('setManualRate — nominal merosi', () => {
  it('mavjud nominal=1000 bo`lsa kurs 1000 ga bo`linadi (100× xato emas)', async () => {
    const { svc, calls } = makeService({
      knownNominal: 1000,
      currencies: [
        {
          id: USD_ID,
          code: '410',
          isoCode: 'KRW',
          default: false,
          rateValue: 100_000_000n,
          multiplicity: 1,
        },
      ],
    });
    await svc.setManualRate(ACCOUNT, USER, { currency: 'KRW', rate: '9000' });

    const rate = calls.rateUpsert[0] as { create: { nominal: number } };
    expect(rate.create.nominal).toBe(1000);
    const cur = calls.currencyUpdate[0] as { data: { rateValue: bigint } };
    expect(cur.data.rateValue).toBe(900_000_000n); // 9000/1000 × 1e8
  });

  it('avval qator bo`lmasa nominal 1 bo`ladi', async () => {
    const { svc, calls } = makeService({ knownNominal: null });
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });
    const rate = calls.rateUpsert[0] as { create: { nominal: number } };
    expect(rate.create.nominal).toBe(1);
  });
});

describe('setManualRate — rad etish holatlari', () => {
  it('baza valyutasini rad etadi (kursi doim 1)', async () => {
    const { svc } = makeService();
    await expect(
      svc.setManualRate(ACCOUNT, USER, { currency: 'UZS', rate: '12000' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('akkauntda yo`q valyutani 404 qiladi (jimgina yaratmaydi)', async () => {
    const { svc, calls } = makeService();
    await expect(
      svc.setManualRate(ACCOUNT, USER, { currency: 'EUR', rate: '14000' }),
    ).rejects.toThrow(NotFoundException);
    expect(calls.txCount).toBe(0);
  });

  it('chegaradan tashqari qiymat yozilmaydi (validatsiya tranzaksiyadan OLDIN)', async () => {
    const { svc, calls } = makeService();
    await expect(
      svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12' }),
    ).rejects.toThrow();
    expect(calls.txCount).toBe(0);
    expect(calls.rateUpsert).toHaveLength(0);
  });

  it('legacy qator — isoCode yo`q, code da ALPHA (M-03) topiladi', async () => {
    const { svc, calls } = makeService({
      currencies: [
        {
          id: USD_ID,
          code: 'USD',
          isoCode: null,
          default: false,
          rateValue: 100_000_000n,
          multiplicity: 1,
        },
      ],
    });
    await svc.setManualRate(ACCOUNT, USER, { currency: 'USD', rate: '12000' });
    expect(calls.currencyUpdate).toHaveLength(1);
  });
});
