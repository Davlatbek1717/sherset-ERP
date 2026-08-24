import { describe, expect, it } from 'vitest';
import {
  type ControlPositionBefore,
  controlEditNotificationBody,
  isControlReady,
  planControlEdit,
} from './retail-control.js';
import { ControlEditSchema } from './retail-sale.schema.js';

/**
 * G2 — kontrol oqimi qaror moduli (sof) testlari.
 *
 * Reja 5-band: «navbat filtri (qisman yopilgan tasklar tushmasin)» va tahrir
 * chegaralari shu yerda qulflanadi — servis simlari alohida faylda.
 */

// ─── Navbatga tushish sharti ────────────────────────────────────────────────

describe('isControlReady — navbat sharti', () => {
  it('hamma topshiriq yopiq (done) — navbatga TUSHADI', () => {
    expect(isControlReady([{ status: 'done' }, { status: 'done' }])).toBe(true);
  });

  it('qisman yopilgan (pending/in_progress bor) — TUSHMAYDI', () => {
    expect(isControlReady([{ status: 'done' }, { status: 'pending' }])).toBe(false);
    expect(isControlReady([{ status: 'done' }, { status: 'in_progress' }])).toBe(false);
  });

  it("topshiriqsiz chek TUSHMAYDI (send-to-picking'ning best-effort oynasi)", () => {
    expect(isControlReady([])).toBe(false);
  });

  it('cancelled ham «yopiq» hisoblanadi (done bilan aralash)', () => {
    expect(isControlReady([{ status: 'done' }, { status: 'cancelled' }])).toBe(true);
  });
});

// ─── Tahrir rejasi ──────────────────────────────────────────────────────────

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

function pos(
  id: string,
  productId: string,
  quantity: string,
  priceMinor: bigint,
  over: Partial<ControlPositionBefore> = {},
): ControlPositionBefore {
  return {
    id,
    productId,
    productName: `Tovar ${id}`,
    quantity,
    priceMinor,
    discount: '0',
    sumMinor: priceMinor * BigInt(quantity.split('.')[0] ?? '0'),
    ...over,
  };
}

describe('planControlEdit — tahrir rejasi', () => {
  it("qator o'chirish: removed + rezerv-bo'shatish to'liq miqdorda", () => {
    const plan = planControlEdit(
      [pos('a', P1, '2', 50_000n), pos('b', P2, '3', 10_000n)],
      [{ id: 'a', quantity: '2' }],
    );
    expect(plan.refusals).toEqual([]);
    expect(plan.removed.map((r) => r.id)).toEqual(['b']);
    expect(plan.releaseByProduct).toEqual([{ productId: P2, qty: '3' }]);
    expect(plan.newSumMinor).toBe(100_000n);
    expect(plan.noop).toBe(false);
  });

  it("sonni kamaytirish: qator summasi qayta hisoblanadi, delta rezervdan bo'shaydi", () => {
    const plan = planControlEdit([pos('a', P1, '4', 25_000n)], [{ id: 'a', quantity: '1.5' }]);
    expect(plan.refusals).toEqual([]);
    expect(plan.keeps).toHaveLength(1);
    expect(plan.keeps[0]?.changed).toBe(true);
    // 25 000 × 1.5 = 37 500
    expect(plan.keeps[0]?.sumMinor).toBe(37_500n);
    expect(plan.newSumMinor).toBe(37_500n);
    expect(plan.releaseByProduct).toEqual([{ productId: P1, qty: '2.5' }]);
  });

  it('chegirmali qator kamayganda summa computePositions arifmetikasi bilan', () => {
    // 10 000 × 2 = 20 000; 10% chegirma → 18 000
    const plan = planControlEdit(
      [pos('a', P1, '3', 10_000n, { discount: '10' })],
      [{ id: 'a', quantity: '2' }],
    );
    expect(plan.refusals).toEqual([]);
    expect(plan.keeps[0]?.sumMinor).toBe(18_000n);
  });

  it("KO'PAYTIRISH rad etiladi (yig'ilmagan tovar chekka qo'shilmaydi)", () => {
    const plan = planControlEdit([pos('a', P1, '2', 50_000n)], [{ id: 'a', quantity: '3' }]);
    expect(plan.refusals.join(' ')).toContain('OSHIRA olmaydi');
    expect(plan.keeps).toEqual([]);
    expect(plan.releaseByProduct).toEqual([]);
  });

  it("bo'sh ro'yxat rad etiladi (bo'sh chek uchun bekor qilish bor)", () => {
    const plan = planControlEdit([pos('a', P1, '2', 50_000n)], []);
    expect(plan.refusals.join(' ')).toContain('kamida bitta tovar');
  });

  it("noma'lum qator id rad etiladi", () => {
    const plan = planControlEdit(
      [pos('a', P1, '2', 50_000n)],
      [
        { id: 'a', quantity: '2' },
        { id: 'yoq-qator', quantity: '1' },
      ],
    );
    expect(plan.refusals.join(' ')).toContain('yoq-qator');
  });

  it('takror qator id rad etiladi', () => {
    const plan = planControlEdit(
      [pos('a', P1, '2', 50_000n)],
      [
        { id: 'a', quantity: '1' },
        { id: 'a', quantity: '2' },
      ],
    );
    expect(plan.refusals.join(' ')).toContain('ikki marta');
  });

  it("0 miqdor rad etiladi (qator o'chirish — ro'yxatdan chiqarish)", () => {
    const plan = planControlEdit([pos('a', P1, '2', 50_000n)], [{ id: 'a', quantity: '0' }]);
    expect(plan.refusals.join(' ')).toContain('0');
  });

  it("noto'g'ri miqdor satri rad etiladi", () => {
    const plan = planControlEdit([pos('a', P1, '2', 50_000n)], [{ id: 'a', quantity: 'abc' }]);
    expect(plan.refusals.join(' ')).toContain("Noto'g'ri miqdor");
  });

  it("o'zgarishsiz yuborilsa noop", () => {
    const plan = planControlEdit(
      [pos('a', P1, '2', 50_000n), pos('b', P2, '3', 10_000n)],
      [
        { id: 'a', quantity: '2' },
        { id: 'b', quantity: '3' },
      ],
    );
    expect(plan.refusals).toEqual([]);
    expect(plan.noop).toBe(true);
    expect(plan.releaseByProduct).toEqual([]);
  });

  it("bitta mahsulot ikki qatorda — bo'shatish mahsulot kesimida YIG'ILADI", () => {
    const plan = planControlEdit(
      [pos('a', P1, '2', 50_000n), pos('b', P1, '3', 40_000n)],
      [{ id: 'a', quantity: '1' }],
    );
    // a: 2→1 (delta 1) + b o'chirildi (delta 3) = 4
    expect(plan.releaseByProduct).toEqual([{ productId: P1, qty: '4' }]);
  });

  it("productId=null qator (buzilgan katalog) rezerv-bo'shatishga tushmaydi", () => {
    const plan = planControlEdit(
      [pos('a', P1, '2', 50_000n), { ...pos('b', P2, '3', 10_000n), productId: null }],
      [{ id: 'a', quantity: '2' }],
    );
    expect(plan.removed.map((r) => r.id)).toEqual(['b']);
    expect(plan.releaseByProduct).toEqual([]);
  });
});

describe('controlEditNotificationBody — kassir toasti', () => {
  it("o'chirilgan va o'zgargan qatorlarni nomi bilan aytadi", () => {
    const plan = planControlEdit(
      [pos('a', P1, '4', 25_000n), pos('b', P2, '3', 10_000n)],
      [{ id: 'a', quantity: '2' }],
    );
    const body = controlEditNotificationBody(plan);
    expect(body).toContain('− Tovar b');
    expect(body).toContain('Tovar a: 4 → 2');
  });
});

// ─── Kirish sxemasi ─────────────────────────────────────────────────────────

describe('ControlEditSchema', () => {
  const VALID = {
    version: 3,
    positions: [{ id: '33333333-3333-4333-8333-333333333333', quantity: '2.5' }],
  };

  it("to'g'ri kirishni qabul qiladi", () => {
    expect(ControlEditSchema.parse(VALID).version).toBe(3);
  });

  it("uuid bo'lmagan qator id rad etiladi", () => {
    expect(() =>
      ControlEditSchema.parse({ ...VALID, positions: [{ id: 'x', quantity: '1' }] }),
    ).toThrow();
  });

  it('manfiy/harfli miqdor satri rad etiladi', () => {
    for (const quantity of ['-1', 'abc', '1,5', '']) {
      expect(() =>
        ControlEditSchema.parse({
          ...VALID,
          positions: [{ id: VALID.positions[0]?.id, quantity }],
        }),
      ).toThrow();
    }
  });

  it('version majburiy', () => {
    expect(() => ControlEditSchema.parse({ positions: VALID.positions })).toThrow();
  });
});
