import { Prisma } from '@moysklad/db';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INTERVALS, classifyAbc } from './abc.js';

const D = (v: string | number) => new Prisma.Decimal(v);
const make = (productId: string, value: number) => ({ productId, salesValue: D(value) });

describe('classifyAbc — empty + edge cases', () => {
  it('returns empty result for empty input', () => {
    const r = classifyAbc([]);
    expect(r.items).toEqual([]);
    expect(r.totalValue).toBe('0');
    expect(r.counts).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('all-zero values: classifies everything as C', () => {
    const r = classifyAbc([make('p-1', 0), make('p-2', 0), make('p-3', 0)]);
    expect(r.totalValue).toBe('0');
    expect(r.counts).toEqual({ a: 0, b: 0, c: 3 });
    expect(r.items.every((i) => i.class === 'C')).toBe(true);
    expect(r.items.every((i) => i.share === 0)).toBe(true);
  });

  it('single item: classifies as A regardless of value', () => {
    const r = classifyAbc([make('p-1', 1000)]);
    expect(r.counts).toEqual({ a: 1, b: 0, c: 0 });
    expect(r.items[0]?.class).toBe('A');
    expect(r.items[0]?.share).toBeCloseTo(1.0);
    expect(r.items[0]?.cumulativeShare).toBeCloseTo(1.0);
  });
});

describe('classifyAbc — Pareto distribution', () => {
  it('top contributors land in A, tail in C (80/20 rule)', () => {
    const items = [
      make('p-1', 800),
      make('p-2', 50),
      make('p-3', 50),
      make('p-4', 30),
      make('p-5', 20),
      make('p-6', 15),
      make('p-7', 15),
      make('p-8', 10),
      make('p-9', 5),
      make('p-10', 5),
    ];
    const r = classifyAbc(items);

    expect(r.totalValue).toBe('1000.00');
    expect(r.counts.a).toBeGreaterThanOrEqual(1);
    expect(r.counts.c).toBeGreaterThanOrEqual(1);
    expect(r.items[0]?.productId).toBe('p-1');
    expect(r.items[0]?.class).toBe('A');
    expect(r.items[r.items.length - 1]?.class).toBe('C');
  });

  it('sorts items by salesValue descending (highest first)', () => {
    const r = classifyAbc([make('p-1', 100), make('p-2', 500), make('p-3', 300)]);
    expect(r.items.map((i) => i.productId)).toEqual(['p-2', 'p-3', 'p-1']);
  });

  it('respects custom thresholds (A=70%, B=90%)', () => {
    const items = [make('p-1', 500), make('p-2', 250), make('p-3', 150), make('p-4', 100)];
    const r = classifyAbc(items, { aMax: 0.7, bMax: 0.9 });
    expect(r.items[0]?.class).toBe('A');
    expect(r.items[1]?.class).toBe('B');
    expect(r.items[2]?.class).toBe('B');
    expect(r.items[3]?.class).toBe('C');
  });

  it('cumulativeShare strictly non-decreasing, ends near 1.0', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      make(`p-${String(i + 1).padStart(2, '0')}`, (20 - i) * 10),
    );
    const r = classifyAbc(items);
    for (let i = 1; i < r.items.length; i += 1) {
      expect(r.items[i]?.cumulativeShare).toBeGreaterThanOrEqual(r.items[i - 1]?.cumulativeShare);
    }
    expect(r.items[r.items.length - 1]?.cumulativeShare).toBeCloseTo(1.0, 4);
  });

  it('tie-break: equal values sort by productId ascending (deterministic)', () => {
    const r = classifyAbc([make('p-3', 100), make('p-1', 100), make('p-2', 100)]);
    expect(r.items.map((i) => i.productId)).toEqual(['p-1', 'p-2', 'p-3']);
  });
});

describe('classifyAbc — boundary precision', () => {
  it('handles Decimal precision correctly (no float drift)', () => {
    const items = [make('p-1', 0.3), make('p-2', 0.2), make('p-3', 0.1)];
    const r = classifyAbc(items);
    expect(r.totalValue).toBe('0.60');
    expect(r.items[0]?.share).toBeCloseTo(0.5);
  });

  it('item exactly at A boundary (cum == aMax) goes to A', () => {
    const r = classifyAbc([make('p-1', 80), make('p-2', 20)], { aMax: 0.8, bMax: 0.95 });
    expect(r.items[0]?.class).toBe('A');
  });

  it('high-cardinality input (100 items)', () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      make(`p-${String(i + 1).padStart(3, '0')}`, Math.floor(1000 / (i + 1))),
    );
    const r = classifyAbc(items);
    expect(r.items).toHaveLength(100);
    expect(r.counts.a + r.counts.b + r.counts.c).toBe(100);
    expect(Number(r.totalValue)).toBeGreaterThan(0);
  });
});

describe('DEFAULT_INTERVALS', () => {
  it('A items count weekly (7 days)', () => {
    expect(DEFAULT_INTERVALS.A).toBe(7);
  });

  it('B items count bi-weekly (14 days)', () => {
    expect(DEFAULT_INTERVALS.B).toBe(14);
  });

  it('C items count monthly (30 days)', () => {
    expect(DEFAULT_INTERVALS.C).toBe(30);
  });
});
