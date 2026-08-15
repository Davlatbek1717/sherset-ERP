import { describe, expect, it } from 'vitest';
import { newDraftId, parseCartDrafts, serializeCartDrafts } from './cart-drafts';

/**
 * QORALAMA (hold order) SAQLASH SHARTNOMASI — 2026-08-16, egasi so'rovi.
 *
 * Savat qatorlari `bigint` maydonlar tashiydi (`priceMinor`, `costMinor`,
 * `wholesaleMinor`, `basePriceMinor`) — oddiy `JSON.stringify` ular ustida
 * OTILADI. Serializatsiya shu sababdan replacer/reviver bilan: har qanday
 * bigint (kelajakda qo'shiladigan yangi maydon ham) avtomatik o'giriladi,
 * ya'ni CartLine kengaysa bu qatlam jim buzilmaydi.
 *
 * `parseCartDrafts` — FAIL-SAFE: buzuq/begona JSON hech qachon otmaydi,
 * bo'sh ro'yxat qaytadi (localStorage'ni boshqa versiya yozgan bo'lishi
 * mumkin — POS oq ekranga tushmasligi shart).
 */

const line = {
  productId: 'p1',
  productName: "Viko shit 4x vnut o'rnatma",
  quantity: '1.5',
  priceMinor: 3680000n,
  priceStr: '36800',
  availableStock: 996,
  costMinor: 2100000n,
  wholesaleMinor: null,
  basePriceMinor: 3680000n,
};

const draft = {
  id: 'd1',
  createdAt: 1765900800000,
  discountPct: 5,
  lines: [line],
};

describe('serialize → parse roundtrip', () => {
  it('bigint maydonlar (null bilan birga) aynan qaytadi', () => {
    const out = parseCartDrafts(serializeCartDrafts([draft]));
    expect(out).toEqual([draft]);
    expect(out[0]?.lines[0]?.priceMinor).toBe(3680000n);
    expect(out[0]?.lines[0]?.wholesaleMinor).toBeNull();
  });

  it('bir nechta qoralama tartibi saqlanadi', () => {
    const d2 = { ...draft, id: 'd2', lines: [{ ...line, productId: 'p2' }] };
    const out = parseCartDrafts(serializeCartDrafts([draft, d2]));
    expect(out.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it("kelajakdagi YANGI bigint maydon ham yo'qolmaydi (spread emas, replacer)", () => {
    const extended = {
      ...draft,
      lines: [{ ...line, futureMinor: 42n } as typeof line],
    };
    const out = parseCartDrafts(serializeCartDrafts([extended]));
    expect((out[0]?.lines[0] as unknown as { futureMinor: bigint }).futureMinor).toBe(42n);
  });
});

describe('parseCartDrafts — fail-safe', () => {
  it('null / bo‘sh satr → []', () => {
    expect(parseCartDrafts(null)).toEqual([]);
    expect(parseCartDrafts('')).toEqual([]);
  });

  it('buzuq JSON → [] (otmaydi)', () => {
    expect(parseCartDrafts('{oops')).toEqual([]);
  });

  it('massiv bo‘lmagan JSON → []', () => {
    expect(parseCartDrafts('{"id":"x"}')).toEqual([]);
  });

  it('shakli noto‘g‘ri element TASHLANADI, sog‘lari qoladi', () => {
    const good = serializeCartDrafts([draft]);
    const mixed = `${good.slice(0, -1)},{"id":"broken"}]`;
    const out = parseCartDrafts(mixed);
    expect(out.map((d) => d.id)).toEqual(['d1']);
  });

  it('qatorida priceMinor yo‘q qoralama TASHLANADI (savat oq ekranga tushmasin)', () => {
    const bad = JSON.stringify([
      { id: 'd3', createdAt: 1, discountPct: 0, lines: [{ productId: 'p', productName: 'x' }] },
    ]);
    expect(parseCartDrafts(bad)).toEqual([]);
  });
});

describe('newDraftId', () => {
  it('har chaqiruvda boshqa qiymat', () => {
    expect(newDraftId()).not.toBe(newDraftId());
  });
});
