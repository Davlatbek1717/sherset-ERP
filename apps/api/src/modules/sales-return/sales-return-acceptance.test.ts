import { describe, expect, it } from 'vitest';
import {
  BRAK_STORE_KEY,
  type CellTarget,
  computeReturnableLines,
  planAcceptance,
  readBrakStore,
} from './sales-return-acceptance.js';

/**
 * G3 — qabul yadrosining SOF qarorlari: chek bo'yicha cap arifmetikasi va
 * sifatli/brak bo'linishi. Simlar (Prisma, hujjat yaratish) uchun
 * `sales-return-acceptance-wiring.test.ts`.
 */

const P1 = 'prod-1';
const P2 = 'prod-2';

const sold = (rows: Array<[string, string, string]>) =>
  rows.map(([productId, quantity, priceMinor]) => ({
    productId,
    quantity,
    priceMinor,
    discount: '0',
  }));

// ─── readBrakStore ──────────────────────────────────────────────────────────

describe('readBrakStore — faqat aynan `true`', () => {
  it('true qiymatni tanidi', () => {
    expect(readBrakStore({ [BRAK_STORE_KEY]: true })).toBe(true);
  });

  it('truthy-lekin-true-emas qiymatlar BRAK qilmaydi (jimgina yoqilib qolmasin)', () => {
    expect(readBrakStore({ [BRAK_STORE_KEY]: 'true' })).toBe(false);
    expect(readBrakStore({ [BRAK_STORE_KEY]: 1 })).toBe(false);
    expect(readBrakStore({ [BRAK_STORE_KEY]: false })).toBe(false);
  });

  it('bo‘sh / notog‘ri attributes yiqilmaydi', () => {
    expect(readBrakStore(null)).toBe(false);
    expect(readBrakStore(undefined)).toBe(false);
    expect(readBrakStore('BRAK')).toBe(false);
    expect(readBrakStore([BRAK_STORE_KEY])).toBe(false);
    expect(readBrakStore({})).toBe(false);
  });
});

// ─── computeReturnableLines ─────────────────────────────────────────────────

describe('computeReturnableLines — chek bo‘yicha cap', () => {
  it('hech narsa qaytarilmagan bo‘lsa — hammasi qaytariladi', () => {
    const lines = computeReturnableLines(sold([[P1, '3', '10000']]), [], []);
    expect(lines).toEqual([
      {
        productId: P1,
        soldQty: '3',
        posRefundedQty: '0',
        warehouseReturnedQty: '0',
        remainingQty: '3',
        priceMinor: '10000',
        discount: '0',
      },
    ]);
  });

  it('POS mirror qaytarishi cap`ni kamaytiradi (pul kassada berilgan)', () => {
    const lines = computeReturnableLines(
      sold([[P1, '5', '10000']]),
      [{ productId: P1, quantity: '2' }],
      [],
    );
    expect(lines[0]?.remainingQty).toBe('3');
    expect(lines[0]?.posRefundedQty).toBe('2');
  });

  it('shu chekka bog‘langan avvalgi ВП ham cap`ni kamaytiradi', () => {
    const lines = computeReturnableLines(
      sold([[P1, '5', '10000']]),
      [],
      [{ productId: P1, quantity: '1' }],
    );
    expect(lines[0]?.remainingQty).toBe('4');
    expect(lines[0]?.warehouseReturnedQty).toBe('1');
  });

  it('IKKALA yo‘nalish birga hisoblanadi — ikki marta qaytarish yo‘li yopiq', () => {
    const lines = computeReturnableLines(
      sold([[P1, '5', '10000']]),
      [{ productId: P1, quantity: '2' }],
      [{ productId: P1, quantity: '2' }],
    );
    expect(lines[0]?.remainingQty).toBe('1');
  });

  it('bir tovar chekda ikki qatorda bo‘lsa YIG‘ILADI, narx birinchi qatordan', () => {
    const lines = computeReturnableLines(
      sold([
        [P1, '2', '10000'],
        [P1, '3', '99999'],
      ]),
      [],
      [],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.soldQty).toBe('5');
    expect(lines[0]?.priceMinor).toBe('10000');
  });

  it('to‘liq qaytarilgan qator 0 beradi, manfiyga tushmaydi', () => {
    const lines = computeReturnableLines(
      sold([[P1, '2', '10000']]),
      [{ productId: P1, quantity: '2' }],
      [{ productId: P1, quantity: '1' }],
    );
    expect(lines[0]?.remainingQty).toBe('0');
  });

  it('kasr miqdorlar aniq (float drift yo‘q)', () => {
    const lines = computeReturnableLines(
      sold([[P1, '0.3', '10000']]),
      [{ productId: P1, quantity: '0.1' }],
      [{ productId: P1, quantity: '0.1' }],
    );
    expect(lines[0]?.remainingQty).toBe('0.1');
  });

  it('chek tartibi saqlanadi', () => {
    const lines = computeReturnableLines(
      sold([
        [P2, '1', '500'],
        [P1, '1', '600'],
      ]),
      [],
      [],
    );
    expect(lines.map((l) => l.productId)).toEqual([P2, P1]);
  });
});

// ─── planAcceptance ─────────────────────────────────────────────────────────

const returnable = [
  {
    productId: P1,
    soldQty: '5',
    posRefundedQty: '0',
    warehouseReturnedQty: '0',
    remainingQty: '5',
    priceMinor: '10000',
    discount: '0',
  },
  {
    productId: P2,
    soldQty: '2',
    posRefundedQty: '0',
    warehouseReturnedQty: '0',
    remainingQty: '2',
    priceMinor: '20000',
    discount: '5',
  },
];

const targets: CellTarget[] = [
  { cellId: 'cell-good', cellName: '07-01-01-01', storeId: 'store-07', brak: false },
  { cellId: 'cell-good-2', cellName: '07-01-01-02', storeId: 'store-07', brak: false },
  { cellId: 'cell-brak', cellName: '99-01-01-01', storeId: 'store-brak', brak: true },
];

describe('planAcceptance — sifatli/brak bo‘linishi', () => {
  it('bitta omborga tushgan qatorlar BITTA hujjat', () => {
    const plan = planAcceptance(
      [
        { productId: P1, quantity: '2', cellId: 'cell-good' },
        { productId: P2, quantity: '1', cellId: 'cell-good-2' },
      ],
      returnable,
      targets,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.documents).toHaveLength(1);
    expect(plan.documents[0]?.storeId).toBe('store-07');
    expect(plan.documents[0]?.brak).toBe(false);
    expect(plan.documents[0]?.positions).toHaveLength(2);
  });

  it('brak qator ALOHIDA hujjatga ajraladi (bir hujjat = bir ombor)', () => {
    const plan = planAcceptance(
      [
        { productId: P1, quantity: '3', cellId: 'cell-good' },
        { productId: P1, quantity: '2', cellId: 'cell-brak' },
      ],
      returnable,
      targets,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.documents).toHaveLength(2);
    expect(plan.documents.map((d) => [d.storeId, d.brak])).toEqual([
      ['store-07', false],
      ['store-brak', true],
    ]);
  });

  it('narx/chegirma CHEKDAN olinadi, so‘rovdan emas', () => {
    const plan = planAcceptance(
      [{ productId: P2, quantity: '1', cellId: 'cell-good' }],
      returnable,
      targets,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.documents[0]?.positions[0]).toMatchObject({
      priceMinor: '20000',
      discount: '5',
      cellName: '07-01-01-01',
    });
  });

  it('bitta tovarni ikki yacheykaga bo‘lish mumkin — cap JAMI bo‘yicha', () => {
    const ok = planAcceptance(
      [
        { productId: P1, quantity: '3', cellId: 'cell-good' },
        { productId: P1, quantity: '2', cellId: 'cell-brak' },
      ],
      returnable,
      targets,
    );
    expect(ok.ok).toBe(true);

    const tooMuch = planAcceptance(
      [
        { productId: P1, quantity: '3', cellId: 'cell-good' },
        { productId: P1, quantity: '3', cellId: 'cell-brak' },
      ],
      returnable,
      targets,
    );
    expect(tooMuch.ok).toBe(false);
    if (tooMuch.ok) return;
    expect(tooMuch.error).toContain('Qaytarish mumkin: 5');
  });

  it('cap oshsa xato — sabab raqamlari bilan', () => {
    const plan = planAcceptance(
      [{ productId: P1, quantity: '9', cellId: 'cell-good' }],
      [{ ...returnable[0], posRefundedQty: '1', warehouseReturnedQty: '2', remainingQty: '2' }],
      targets,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('Qaytarish mumkin: 2');
    expect(plan.error).toContain('kassada qaytarilgan 1');
    expect(plan.error).toContain('omborda qabul qilingan 2');
  });

  it('chekda yo‘q tovar rad etiladi', () => {
    const plan = planAcceptance(
      [{ productId: 'begona', quantity: '1', cellId: 'cell-good' }],
      returnable,
      targets,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('chekda');
  });

  it('noma‘lum yacheyka rad etiladi', () => {
    const plan = planAcceptance(
      [{ productId: P1, quantity: '1', cellId: 'cell-yoq' }],
      returnable,
      targets,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('yacheyka');
  });

  it('nol / manfiy miqdor rad etiladi', () => {
    for (const q of ['0', '-1']) {
      const plan = planAcceptance(
        [{ productId: P1, quantity: q, cellId: 'cell-good' }],
        returnable,
        targets,
      );
      expect(plan.ok).toBe(false);
    }
  });

  it('bo‘sh so‘rov rad etiladi', () => {
    expect(planAcceptance([], returnable, targets).ok).toBe(false);
  });

  it('to‘liq qaytarilgan qator (remaining 0) yangi qabulni o‘tkazmaydi', () => {
    const plan = planAcceptance(
      [{ productId: P1, quantity: '1', cellId: 'cell-good' }],
      [{ ...returnable[0], posRefundedQty: '5', remainingQty: '0' }],
      targets,
    );
    expect(plan.ok).toBe(false);
  });
});
