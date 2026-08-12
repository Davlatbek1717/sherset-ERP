import { describe, expect, it } from 'vitest';
import { debtCashDeskDeltas } from './debt-cash-ledger.js';

const BASE = {
  method: 'cash',
  cashDeskId: 'desk-1',
  amountMinor: 128_000_000n,
} as const;
const OPTS = { sign: 1n as 1n, documentId: 'batch-1', deskCurrency: 'UZS' };

describe('debtCashDeskDeltas — yashiq BITTA valyutali', () => {
  it("so'm to'lovi UZS yashiqqa TUSHADI", () => {
    const d = debtCashDeskDeltas({ ...BASE, currency: 'UZS' }, OPTS);
    expect(d).toHaveLength(1);
    expect(d[0]?.deltaMinor).toBe(128_000_000n);
    expect(d[0]?.currency).toBe('UZS');
  });

  it('🔴 DOLLAR to`lovi UZS yashiqqa TUSHMAYDI (bo`sh ro`yxat)', () => {
    // Ilgari bu yerda {currency:'USD'} deltasi qaytardi va MoneyService uni
    // «Currency mismatch» bilan rad etib, BUTUN to'lovni orqaga qaytarardi.
    const d = debtCashDeskDeltas({ ...BASE, currency: 'USD', amountOriginalMinor: 10_000n }, OPTS);
    expect(d).toEqual([]);
  });

  it('dollar YASHIQDA bo`lsa (USD kassa) — tushadi, SENTDA', () => {
    const d = debtCashDeskDeltas(
      { ...BASE, currency: 'USD', amountOriginalMinor: 10_000n },
      { ...OPTS, deskCurrency: 'USD' },
    );
    expect(d[0]?.deltaMinor).toBe(10_000n);
    expect(d[0]?.currency).toBe('USD');
  });

  it('storno ham AYNI qoidadan yuradi (sign -1)', () => {
    expect(debtCashDeskDeltas({ ...BASE, currency: 'USD' }, { ...OPTS, sign: -1n })).toEqual([]);
  });
});
