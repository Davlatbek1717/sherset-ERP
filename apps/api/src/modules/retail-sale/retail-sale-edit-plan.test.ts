import { describe, expect, it } from 'vitest';
import {
  type EditRequest,
  type PostedSaleSnapshot,
  formatQty,
  parseQty,
  planReceiptEdit,
} from './retail-sale-edit-plan.js';

const P1 = 'prod-1';
const P2 = 'prod-2';

/** 5 dona × 10 000 so'm = 50 000 so'm, hammasi naqd to'langan. */
const before: PostedSaleSnapshot = {
  positions: [{ productId: P1, quantity: '5', sumMinor: 50_000_00n }],
  paidMinor: 50_000_00n,
  debtMinor: 0n,
  agentId: null,
  refundedQty: {},
};

const req = (over: Partial<EditRequest> = {}): EditRequest => ({
  positions: [{ productId: P1, quantity: '5', sumMinor: 50_000_00n }],
  paidMinor: 50_000_00n,
  debtMinor: 0n,
  agentId: null,
  ...over,
});

describe('parseQty / formatQty — o`nlik aniqligi', () => {
  it('butun va kasr sonlar', () => {
    expect(parseQty('5')).toBe(5_000_000n);
    expect(parseQty('2.5')).toBe(2_500_000n);
    expect(parseQty('0.000001')).toBe(1n);
  });

  it('noto`g`ri satr → null (jimgina 0 EMAS)', () => {
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('-1')).toBeNull();
    expect(parseQty('1.1234567')).toBeNull(); // 6 xonadan ortiq
  });

  it('formatQty ortiqcha nollarni olib tashlaydi', () => {
    expect(formatQty(5_000_000n)).toBe('5');
    expect(formatQty(2_500_000n)).toBe('2.5');
    expect(formatQty(-3_000_000n)).toBe('-3');
  });
});

describe('planReceiptEdit — sof farq hisobi', () => {
  it('miqdor kamaytirilsa tovar omborga QAYTADI va kassadan pul chiqadi', () => {
    const plan = planReceiptEdit(
      before,
      req({
        positions: [{ productId: P1, quantity: '3', sumMinor: 30_000_00n }],
        paidMinor: 30_000_00n,
      }),
    );
    expect(plan.refusals).toEqual([]);
    expect(plan.stockDeltas).toEqual([{ productId: P1, qtyDelta: '2' }]); // musbat = qaytadi
    expect(plan.cashDeltaMinor).toBe(-20_000_00n); // kassadan chiqadi
    expect(plan.newSumMinor).toBe(30_000_00n);
  });

  it('miqdor oshirilsa tovar ombordan CHIQADI va kassaga pul kiradi', () => {
    const plan = planReceiptEdit(
      before,
      req({
        positions: [{ productId: P1, quantity: '8', sumMinor: 80_000_00n }],
        paidMinor: 80_000_00n,
      }),
    );
    expect(plan.stockDeltas).toEqual([{ productId: P1, qtyDelta: '-3' }]);
    expect(plan.cashDeltaMinor).toBe(30_000_00n);
  });

  it('yangi tovar qo`shilsa va eskisi olib tashlansa — ikkala delta ham chiqadi', () => {
    const plan = planReceiptEdit(
      before,
      req({
        positions: [{ productId: P2, quantity: '2', sumMinor: 50_000_00n }],
      }),
    );
    expect(plan.stockDeltas).toEqual(
      expect.arrayContaining([
        { productId: P1, qtyDelta: '5' }, // butunlay qaytadi
        { productId: P2, qtyDelta: '-2' }, // chiqadi
      ]),
    );
    expect(plan.cashDeltaMinor).toBe(0n); // summa o'zgarmadi
  });

  it('kasr miqdor (2.5 kg → 1.25 kg)', () => {
    const plan = planReceiptEdit(
      {
        ...before,
        positions: [{ productId: P1, quantity: '2.5', sumMinor: 25_000_00n }],
        paidMinor: 25_000_00n,
      },
      req({
        positions: [{ productId: P1, quantity: '1.25', sumMinor: 12_500_00n }],
        paidMinor: 12_500_00n,
      }),
    );
    expect(plan.stockDeltas).toEqual([{ productId: P1, qtyDelta: '1.25' }]);
  });

  it('hech narsa o`zgarmasa → noop (servis yozuvsiz qaytadi)', () => {
    const plan = planReceiptEdit(before, req());
    expect(plan.noop).toBe(true);
    expect(plan.stockDeltas).toEqual([]);
    expect(plan.cashDeltaMinor).toBe(0n);
  });
});

describe('planReceiptEdit — qarz va mijoz', () => {
  it('naqddan qarzga o`tkazilsa balansga musbat delta', () => {
    const plan = planReceiptEdit(
      before,
      req({ paidMinor: 20_000_00n, debtMinor: 30_000_00n, agentId: 'cp-1' }),
    );
    expect(plan.refusals).toEqual([]);
    expect(plan.cashDeltaMinor).toBe(-30_000_00n);
    expect(plan.balanceDeltaMinor).toBe(30_000_00n);
  });

  it('qarz to`liq to`langanga o`zgartirilsa balans MANFIY delta', () => {
    const plan = planReceiptEdit(
      { ...before, paidMinor: 0n, debtMinor: 50_000_00n, agentId: 'cp-1' },
      req({ paidMinor: 50_000_00n, debtMinor: 0n, agentId: 'cp-1' }),
    );
    expect(plan.balanceDeltaMinor).toBe(-50_000_00n);
    expect(plan.cashDeltaMinor).toBe(50_000_00n);
  });

  it('mijozsiz qarz RAD ETILADI', () => {
    const plan = planReceiptEdit(
      before,
      req({ paidMinor: 0n, debtMinor: 50_000_00n, agentId: null }),
    );
    expect(plan.refusals.join(' ')).toMatch(/mijoz tanlanishi shart/);
  });

  it('🔴 mijoz almashtirilsa agentChanged va noop=false — sof farq YETARLI EMAS', () => {
    const plan = planReceiptEdit(
      { ...before, paidMinor: 0n, debtMinor: 50_000_00n, agentId: 'cp-1' },
      req({ paidMinor: 0n, debtMinor: 50_000_00n, agentId: 'cp-2' }),
    );
    // Summa o'zgarmagan ⇒ balanceDelta 0. Agar servis faqat shunga qarasa,
    // qarz ESKI mijozda qolib ketardi. `agentChanged` shuni oldini oladi.
    expect(plan.balanceDeltaMinor).toBe(0n);
    expect(plan.agentChanged).toBe(true);
    expect(plan.noop).toBe(false);
  });

  it('mijoz o`zgarmasa agentChanged=false', () => {
    const plan = planReceiptEdit(
      { ...before, paidMinor: 0n, debtMinor: 50_000_00n, agentId: 'cp-1' },
      req({ paidMinor: 20_000_00n, debtMinor: 30_000_00n, agentId: 'cp-1' }),
    );
    expect(plan.agentChanged).toBe(false);
    expect(plan.balanceDeltaMinor).toBe(-20_000_00n);
  });
});

describe('planReceiptEdit — rad etish qulflari', () => {
  it("to'lov taqsimoti jamiga teng bo'lmasa rad etiladi", () => {
    const plan = planReceiptEdit(before, req({ paidMinor: 10_000_00n, debtMinor: 0n }));
    expect(plan.refusals.join(' ')).toMatch(/taqsimoti jamiga teng emas/);
  });

  it('bo`sh chek rad etiladi (buning uchun qaytarish bor)', () => {
    const plan = planReceiptEdit(before, req({ positions: [], paidMinor: 0n }));
    expect(plan.refusals.join(' ')).toMatch(/kamida bitta tovar/);
  });

  it('🔴 qaytarilgan miqdordan PASTGA tushirish rad etiladi', () => {
    const plan = planReceiptEdit(
      { ...before, refundedQty: { [P1]: '3' } },
      req({
        positions: [{ productId: P1, quantity: '2', sumMinor: 20_000_00n }],
        paidMinor: 20_000_00n,
      }),
    );
    expect(plan.refusals.join(' ')).toMatch(/allaqachon qaytarilgan/);
  });

  it('qaytarilgan miqdorga TENG qilish mumkin (chegara ochiq)', () => {
    const plan = planReceiptEdit(
      { ...before, refundedQty: { [P1]: '3' } },
      req({
        positions: [{ productId: P1, quantity: '3', sumMinor: 30_000_00n }],
        paidMinor: 30_000_00n,
      }),
    );
    expect(plan.refusals).toEqual([]);
  });

  it('noto`g`ri miqdor satri rad etiladi', () => {
    const plan = planReceiptEdit(
      before,
      req({ positions: [{ productId: P1, quantity: 'abc', sumMinor: 10_00n }], paidMinor: 10_00n }),
    );
    expect(plan.refusals.join(' ')).toMatch(/Noto'g'ri miqdor/);
  });

  it('rad etilgan rejada deltalar BO`SH bo`ladi (yarim qo`llanish bo`lmasin)', () => {
    const plan = planReceiptEdit(before, req({ paidMinor: 1n, debtMinor: 0n }));
    expect(plan.refusals.length).toBeGreaterThan(0);
    expect(plan.stockDeltas).toEqual([]);
    expect(plan.cashDeltaMinor).toBe(0n);
    expect(plan.balanceDeltaMinor).toBe(0n);
  });
});
