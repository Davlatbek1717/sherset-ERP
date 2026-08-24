import { describe, expect, it } from 'vitest';
import {
  PlacementSource,
  allocatePlacement,
  readUnassignedSource,
  totalTakenMicro,
} from './pool-placement.js';

/**
 * F7 — joylashtirish dvigateli (sof) qulfi: manba tartibi, sequential tannarx
 * (warehouse-split intizomi: bo'shagan manba qoldiq tiyinni TO'LIQ beradi),
 * rezerv himoyasi, same-store vs cross-store semantikasi.
 */

const M = (n: number | string) => BigInt(Math.round(Number(n) * 1e6));

describe('readUnassignedSource', () => {
  it("faqat aynan true bo'lsa hovuz", () => {
    expect(readUnassignedSource({ __unassignedSource: true })).toBe(true);
    expect(readUnassignedSource({ __unassignedSource: 'true' })).toBe(false);
    expect(readUnassignedSource({ __unassignedSource: 1 })).toBe(false);
    expect(readUnassignedSource({})).toBe(false);
    expect(readUnassignedSource(null)).toBe(false);
    expect(readUnassignedSource([])).toBe(false);
  });
});

describe('PlacementSource — same-store manba', () => {
  it('remainder = qty − assigned − reserved; take assigned ni oshiradi, cost 0', () => {
    const s = new PlacementSource({
      storeId: 'S1',
      qty: '100',
      assignedQty: '60',
      reservedQty: '10',
      costBalanceMinor: 500_000n,
      crossStore: false,
    });
    expect(s.availableMicro()).toBe(M(30));
    const t1 = s.take(M(20));
    expect(t1).toEqual({ takeMicro: M(20), costMinor: 0n });
    // ichki holat kamaygan: endi faqat 10 qoldi
    const t2 = s.take(M(25));
    expect(t2.takeMicro).toBe(M(10));
    expect(s.availableMicro()).toBe(0n);
  });

  it('manfiy remainder 0 deb o`qiladi (yacheyka jami ombordan oshgan holat)', () => {
    const s = new PlacementSource({
      storeId: 'S1',
      qty: '5',
      assignedQty: '9',
      reservedQty: '0',
      costBalanceMinor: 0n,
      crossStore: false,
    });
    expect(s.availableMicro()).toBe(0n);
    expect(s.take(M(1)).takeMicro).toBe(0n);
  });
});

describe('PlacementSource — cross-store (hovuz) manba', () => {
  it('tannarx o`rtacha-tortilgan va SEQUENTIAL: bo`shaganda qoldiq tiyin to`liq ketadi', () => {
    // 3 dona, 1000 tiyin asos (333.33.. har biriga)
    const s = new PlacementSource({
      storeId: 'POOL',
      qty: '3',
      assignedQty: '0',
      reservedQty: '0',
      costBalanceMinor: 1000n,
      crossStore: true,
    });
    const t1 = s.take(M(1));
    expect(t1.costMinor).toBe(333n);
    const t2 = s.take(M(1));
    expect(t2.costMinor).toBe(334n); // 667/2 yaxlitlanadi
    const t3 = s.take(M(1));
    // oxirgisi manbani bo'shatadi — qolgan 333 tiyin TO'LIQ ketadi, jami 1000
    expect(t1.costMinor + t2.costMinor + t3.costMinor).toBe(1000n);
  });

  it('rezervlangan tovar talanmaydi', () => {
    const s = new PlacementSource({
      storeId: 'POOL',
      qty: '10',
      assignedQty: '0',
      reservedQty: '7',
      costBalanceMinor: 0n,
      crossStore: true,
    });
    expect(s.take(M(10)).takeMicro).toBe(M(3));
  });
});

describe('allocatePlacement — tartiblangan ochko`z taqsimot', () => {
  const mk = (storeId: string, qty: string, cross: boolean) =>
    new PlacementSource({
      storeId,
      qty,
      assignedQty: '0',
      reservedQty: '0',
      costBalanceMinor: 0n,
      crossStore: cross,
    });

  it('birinchi manba yetsa faqat undan olinadi', () => {
    const takes = allocatePlacement([mk('OWN', '50', false), mk('POOL', '100', true)], M(20));
    expect(takes).toHaveLength(1);
    expect(takes[0]).toMatchObject({ storeId: 'OWN', qty: '20', crossStore: false });
  });

  it('yetmasa keyingi manbadan bo`linadi; jami yetmasa qisman qaytadi', () => {
    const takes = allocatePlacement([mk('OWN', '5', false), mk('POOL', '8', true)], M(20));
    expect(takes.map((t) => [t.storeId, t.qty])).toEqual([
      ['OWN', '5'],
      ['POOL', '8'],
    ]);
    expect(totalTakenMicro(takes)).toBe(M(13)); // qolgan 7 — chaqiruvchida surplus
  });

  it('bo`sh manbalar tashlab ketiladi, want<=0 bo`sh ro`yxat', () => {
    expect(allocatePlacement([mk('A', '0', false)], M(5))).toEqual([]);
    expect(allocatePlacement([mk('A', '9', false)], 0n)).toEqual([]);
  });

  it('kasr miqdorlar aniq (micro-BigInt, float drift yo`q)', () => {
    const takes = allocatePlacement([mk('A', '0.1', false), mk('B', '0.2', true)], M('0.3'));
    expect(totalTakenMicro(takes)).toBe(M('0.3'));
    expect(takes.map((t) => t.qty)).toEqual(['0.1', '0.2']);
  });
});
