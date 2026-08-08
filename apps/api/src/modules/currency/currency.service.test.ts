import { describe, expect, it, vi } from 'vitest';
import { CurrencyService } from './currency.service.js';

// M-03 (Faza 16): CBU feed ALPHA kod ('USD') bilan keladi, Currency.code esa
// yangi konventsiyada NUMERIC ('840'). Matching ALPHA isoCode orqali bo'lishi
// SHART — aks holda AUTO valyuta kursi hech qachon yangilanmaydi.

function makeService(
  rows: Array<{ id: string; code: string; isoCode: string | null; margin: null }>,
) {
  const client = {
    currency: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const service = new CurrencyService({ client } as never);
  return { service, client };
}

describe('applyAutoRatesFromSource — CBU alpha ↔ Currency matching (M-03)', () => {
  it('numeric-code valyuta (code=840, isoCode=USD) ALPHA isoCode orqali yangilanadi', async () => {
    const { service, client } = makeService([
      { id: 'c1', code: '840', isoCode: 'USD', margin: null },
    ]);
    const updated = await service.applyAutoRatesFromSource([
      { currency: 'USD', rate: '12800.5', nominal: 1 },
    ]);
    expect(updated).toBe(1);
    // 12 800.5 × 1e8 — kanonik rateValue masshtabi
    expect(client.currency.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: { rateValue: 1_280_050_000_000n },
      }),
    );
  });

  it('legacy qator (code=USD alpha, isoCode bo‘sh) ham mos keladi — regress yo‘q', async () => {
    const { service, client } = makeService([
      { id: 'c2', code: 'USD', isoCode: null, margin: null },
    ]);
    const updated = await service.applyAutoRatesFromSource([
      { currency: 'USD', rate: '12000', nominal: 1 },
    ]);
    expect(updated).toBe(1);
    expect(client.currency.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c2' } }),
    );
  });

  it('feed’da yo‘q valyuta tegilmaydi', async () => {
    const { service, client } = makeService([
      { id: 'c3', code: '978', isoCode: 'EUR', margin: null },
    ]);
    const updated = await service.applyAutoRatesFromSource([
      { currency: 'USD', rate: '12800.5', nominal: 1 },
    ]);
    expect(updated).toBe(0);
    expect(client.currency.update).not.toHaveBeenCalled();
  });
});
