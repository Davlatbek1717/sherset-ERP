import { describe, expect, it } from 'vitest';
import { drawerMoneyDeltas } from './drawer-money-ledger.js';

const BASE = {
  cashDeskId: 'desk-1',
  currency: 'UZS',
  sumMinor: 500_000n,
  documentId: 'doc-1',
} as const;

describe('drawerMoneyDeltas — yashiq amali pul daftarida', () => {
  it('Внесение MUSBAT delta beradi', () => {
    const [d] = drawerMoneyDeltas({ ...BASE, kind: 'in' });
    expect(d?.deltaMinor).toBe(500_000n);
    expect(d?.documentKind).toBe('drawer_cash_in');
    expect(d?.sourceKind).toBe('cash_desk');
    expect(d?.sourceId).toBe('desk-1');
  });

  it('Изъятие/xarajat/inkassatsiya MANFIY delta beradi', () => {
    const [d] = drawerMoneyDeltas({ ...BASE, kind: 'out' });
    expect(d?.deltaMinor).toBe(-500_000n);
    expect(d?.documentKind).toBe('drawer_cash_out');
  });

  it('nol summa daftarga YOZILMAYDI (bo`sh harakat qatori qolmasin)', () => {
    expect(drawerMoneyDeltas({ ...BASE, kind: 'in', sumMinor: 0n })).toEqual([]);
    expect(drawerMoneyDeltas({ ...BASE, kind: 'out', sumMinor: 0n })).toEqual([]);
  });

  it('overdraft qo`riqchisi CHETLAB O`TILMAYDI (allowNegative berilmaydi)', () => {
    // Yashiqdan yo'q pulni chiqarib bo'lmaydi — bu qoida shu yerda tug'iladi.
    const [d] = drawerMoneyDeltas({ ...BASE, kind: 'out' });
    expect(d).not.toHaveProperty('allowNegative');
  });

  it('valyuta va hujjat havolasi o`zgarmasdan uzatiladi', () => {
    const [d] = drawerMoneyDeltas({
      ...BASE,
      kind: 'out',
      currency: 'UZS',
      documentId: 'doc-42',
      description: 'Изъятие ИЗ-2026-00007',
    });
    expect(d?.currency).toBe('UZS');
    expect(d?.documentId).toBe('doc-42');
    expect(d?.description).toBe('Изъятие ИЗ-2026-00007');
  });
});
