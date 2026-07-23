import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { buildAttributesArray, parseExpand, toUzsMinor } from './moysklad-compat.wire.js';

describe('toUzsMinor — Biznesjon item C (money must not float)', () => {
  it("Biznesjon's exact evidence: $823.00 @ 12200.0 → 1 004 060 000 tiyin (~10 mln so'm)", () => {
    expect(toUzsMinor(82300n, 1220000000000n)).toBe(1_004_060_000);
  });

  it('UZS documents are identity (rate 1e8 = 1.0)', () => {
    expect(toUzsMinor(1_500_000n, 100_000_000n)).toBe(1_500_000);
  });

  it('rounds half away from zero on fractional tiyin', () => {
    expect(toUzsMinor(1n, 150_000_000n)).toBe(2); // 1.5 → 2
    expect(toUzsMinor(1n, 140_000_000n)).toBe(1); // 1.4 → 1
    expect(toUzsMinor(-1n, 150_000_000n)).toBe(-2); // -1.5 → -2
  });

  it('large sums stay exact (BigInt path, no float drift)', () => {
    // 5 mlrd so'm in cents at rate 12 345.678: 500_000_000 × 12345.678
    expect(toUzsMinor(500_000_000n, 1_234_567_800_000n)).toBe(6_172_839_000_000);
  });
});

describe('parseExpand', () => {
  const FK = ['agentId', 'organizationId', 'storeId'];

  it('accepts fk relations and positions.assortment', () => {
    const r = parseExpand(['agent', 'positions.assortment'], FK, true);
    expect(r.fields).toEqual(['agent']);
    expect(r.positions).toBe(true);
    expect(r.positionsAssortment).toBe(true);
  });

  it('plain positions without assortment', () => {
    const r = parseExpand(['positions'], FK, true);
    expect(r.positions).toBe(true);
    expect(r.positionsAssortment).toBe(false);
  });

  it('unknown token → 412 (no silent ignore)', () => {
    expect(() => parseExpand(['bogus'], FK, true)).toThrow(HttpException);
  });

  it('positions on an entity without positions → 412', () => {
    expect(() => parseExpand(['positions'], FK, false)).toThrow(HttpException);
  });

  it('no expand → empty result', () => {
    expect(parseExpand(undefined, FK, true)).toEqual({
      fields: [],
      positions: false,
      positionsAssortment: false,
    });
  });
});

describe('buildAttributesArray — Biznesjon item D (Уста/tgid flow)', () => {
  const BASE = 'https://x/api/v1/api/remap/1.2';
  const defs = [
    {
      id: 'def-usta',
      code: 'usta',
      name: 'Уста',
      type: 'reference',
      referenceEntity: 'Counterparty',
    },
    { id: 'def-tgid', code: 'tgid', name: 'tgid', type: 'string', referenceEntity: null },
    { id: 'def-empty', code: 'empty', name: 'Empty', type: 'string', referenceEntity: null },
  ];

  it('object storage → moysklad-style array, defs order, unset codes skipped', () => {
    const refNames = new Map([['Counterparty:cp-1', 'Али уста']]);
    const arr = buildAttributesArray(
      { usta: 'cp-1', tgid: '123456789', empty: '' },
      defs,
      'demand',
      BASE,
      refNames,
    );
    expect(arr).toHaveLength(2);
    expect(arr[0]).toMatchObject({
      id: 'def-usta',
      name: 'Уста',
      type: 'reference',
      value: {
        meta: { href: `${BASE}/entity/counterparty/cp-1`, type: 'counterparty' },
        name: 'Али уста',
      },
    });
    expect(arr[0].meta.href).toBe(`${BASE}/entity/demand/metadata/attributes/def-usta`);
    expect(arr[1]).toMatchObject({ id: 'def-tgid', name: 'tgid', value: '123456789' });
  });

  it('unresolved reference falls back to the raw id as name', () => {
    const arr = buildAttributesArray({ usta: 'cp-x' }, defs, 'demand', BASE, new Map());
    expect(arr[0].value).toMatchObject({ name: 'cp-x' });
  });

  it('empty storage → empty array (never {})', () => {
    expect(buildAttributesArray({}, defs, 'demand', BASE, new Map())).toEqual([]);
  });
});
