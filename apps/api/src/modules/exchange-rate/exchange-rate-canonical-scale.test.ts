import { Prisma } from '@moysklad/db';
import { describe, expect, it, vi } from 'vitest';
import { ExchangeRateService } from './exchange-rate.service.js';

/**
 * F5 (MK31) — `GET /exchange-rates/rate` KANONIK kursni ham qaytaradi.
 *
 * NEGA: POS dollar to'lovini `usdRateMinor` (kanonik ×10^8) bilan yuboradi va
 * server sxemasi `< 1_000_000_000` bo'lgan qiymatni RAD ETADI
 * (`retail-sale.schema.ts` stale-scale guard). Endpoint esa CBU'ning o'nlik
 * satrini (`"12450.27"`) va `nominal` ni beradi. Agar bu ikkisidan kanonik
 * qiymatni KASSIR EKRANI yasasa, masshtab formulasi ikkinchi marta yozilardi —
 * aynan «nusxa bir shoxni yo'qotadi» klassi (nominal ≠ 1 valyutada 100× xato).
 * Shuning uchun o'girish SERVERDA, mavjud `cbuRateToRateValue` bilan bitta
 * joyda turadi va FE faqat tayyor qiymatni uzatadi.
 */

function makeService(row: unknown) {
  const prisma = {
    client: {
      exchangeRate: { findFirst: vi.fn(async () => row) },
    },
  };
  const currency = {} as never;
  return new ExchangeRateService(prisma as never, currency);
}

const ROW = (over: Partial<{ rate: string; nominal: number }> = {}) => ({
  date: new Date('2026-08-11T00:00:00.000Z'),
  currency: 'USD',
  rate: new Prisma.Decimal(over.rate ?? '12450.27'),
  nominal: over.nominal ?? 1,
  source: 'CBRU',
});

describe('ExchangeRateService.getRate — kanonik ×10^8', () => {
  it('o‘nlik kursni kanonik masshtabga o‘giradi (12 450,27 → 1 245 027 000 000)', async () => {
    const svc = makeService(ROW());
    const r = await svc.getRate('USD', new Date('2026-08-11T09:00:00.000Z'));
    expect(r.rate).toBe('12450.27');
    expect(r.rateMinor).toBe('1245027000000');
  });

  it('nominal ≠ 1 bo‘lganda BIR birlik kursi qaytadi (100 JPY = 8 500 → 85 × 10^8)', async () => {
    const svc = makeService(ROW({ rate: '8500', nominal: 100 }));
    const r = await svc.getRate('JPY', new Date('2026-08-11T09:00:00.000Z'));
    expect(r.rateMinor).toBe('8500000000');
  });

  it('qaytgan qiymat sxemaning stale-scale chegarasidan (10^9) o‘tadi', async () => {
    const svc = makeService(ROW());
    const r = await svc.getRate('USD', new Date('2026-08-11T09:00:00.000Z'));
    expect(BigInt(r.rateMinor) >= 1_000_000_000n).toBe(true);
  });

  it('UZS uchun ayni birlik kursi — 1 × 10^8', async () => {
    const svc = makeService(null);
    const r = await svc.getRate('UZS', new Date('2026-08-11T09:00:00.000Z'));
    expect(r.rateMinor).toBe('100000000');
  });

  it('kurs topilmasa xato otiladi — jim 1:1 ga TUSHMAYDI', async () => {
    const svc = makeService(null);
    await expect(svc.getRate('USD', new Date('2026-08-11T09:00:00.000Z'))).rejects.toThrow(
      /No rate found/,
    );
  });
});
