import { describe, expect, it } from 'vitest';
import {
  GenerateValidationError,
  cartesian,
  charSignature,
  normalizeAxes,
} from './variant-generate.util.js';

describe('normalizeAxes', () => {
  it('trims names and values', () => {
    const r = normalizeAxes([{ name: '  Цвет  ', values: ['  красный  ', 'синий'] }]);
    expect(r).toEqual([{ name: 'Цвет', values: ['красный', 'синий'] }]);
  });

  it('drops empty/whitespace values and dedups within an axis', () => {
    const r = normalizeAxes([{ name: 'Размер', values: ['S', '', '  ', 'S', 'M'] }]);
    expect(r).toEqual([{ name: 'Размер', values: ['S', 'M'] }]);
  });

  it('throws when an axis has no usable values', () => {
    expect(() => normalizeAxes([{ name: 'Цвет', values: ['', '   '] }])).toThrow(
      GenerateValidationError,
    );
  });

  it('rejects a duplicate characteristic name (case-insensitive)', () => {
    expect(() =>
      normalizeAxes([
        { name: 'Цвет', values: ['красный'] },
        { name: 'цвет', values: ['синий'] },
      ]),
    ).toThrow(GenerateValidationError);
  });

  it('rejects an empty characteristic name', () => {
    expect(() => normalizeAxes([{ name: '   ', values: ['x'] }])).toThrow(GenerateValidationError);
  });
});

describe('cartesian', () => {
  it('returns one combo per value for a single axis', () => {
    const combos = cartesian([{ name: 'Цвет', values: ['красный', 'синий'] }]);
    expect(combos).toEqual([
      [{ name: 'Цвет', value: 'красный' }],
      [{ name: 'Цвет', value: 'синий' }],
    ]);
  });

  it('produces the full product of two axes (2×3 = 6)', () => {
    const combos = cartesian([
      { name: 'Цвет', values: ['красный', 'синий'] },
      { name: 'Размер', values: ['S', 'M', 'L'] },
    ]);
    expect(combos).toHaveLength(6);
    // every combo carries exactly one value from each axis
    for (const combo of combos) {
      expect(combo.map((c) => c.name)).toEqual(['Цвет', 'Размер']);
    }
    expect(combos[0]).toEqual([
      { name: 'Цвет', value: 'красный' },
      { name: 'Размер', value: 'S' },
    ]);
  });

  it('multiplies three axes (2×2×2 = 8)', () => {
    const combos = cartesian([
      { name: 'A', values: ['1', '2'] },
      { name: 'B', values: ['x', 'y'] },
      { name: 'C', values: ['p', 'q'] },
    ]);
    expect(combos).toHaveLength(8);
    // all combos are unique
    const sigs = new Set(combos.map(charSignature));
    expect(sigs.size).toBe(8);
  });
});

describe('charSignature', () => {
  it('is order-independent (same set, different order → same signature)', () => {
    const a = charSignature([
      { name: 'Цвет', value: 'красный' },
      { name: 'Размер', value: 'S' },
    ]);
    const b = charSignature([
      { name: 'Размер', value: 'S' },
      { name: 'Цвет', value: 'красный' },
    ]);
    expect(a).toBe(b);
  });

  it('differs when a value differs', () => {
    const a = charSignature([{ name: 'Цвет', value: 'красный' }]);
    const b = charSignature([{ name: 'Цвет', value: 'синий' }]);
    expect(a).not.toBe(b);
  });

  it('does not collide on values containing separators', () => {
    const a = charSignature([
      { name: 'A', value: 'x' },
      { name: 'B', value: 'y' },
    ]);
    const b = charSignature([{ name: 'A', value: 'x","B","y' }]);
    expect(a).not.toBe(b);
  });
});
