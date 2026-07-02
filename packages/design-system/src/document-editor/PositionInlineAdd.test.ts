import { describe, expect, it } from 'vitest';
import { type CatalogResult, findCatalogMatch } from './PositionInlineAdd.tsx';

const r = (primary: string, raw?: unknown): CatalogResult => ({ id: primary, primary, raw });

describe('findCatalogMatch', () => {
  it('matches on exact code (case-insensitive)', () => {
    const results = [r('Apple', { code: 'A1' }), r('Banana', { code: 'B2' })];
    expect(findCatalogMatch(results, 'b2')?.primary).toBe('Banana');
  });

  it('matches on article', () => {
    const results = [r('X', { article: 'ART-9' }), r('Y', { article: 'ART-1' })];
    expect(findCatalogMatch(results, 'ART-9')?.primary).toBe('X');
  });

  it('matches on a barcode', () => {
    const results = [r('Z', { barcodes: ['4780012345678', '111'] })];
    expect(findCatalogMatch(results, '4780012345678')?.primary).toBe('Z');
  });

  it('matches on product name (primary)', () => {
    const results = [r('Coca-Cola 1L', {}), r('Pepsi', {})];
    expect(findCatalogMatch(results, 'coca-cola 1l')?.primary).toBe('Coca-Cola 1L');
  });

  it('falls back to the single result when there is no exact match', () => {
    const results = [r('OnlyOne', { code: 'ZZZ' })];
    expect(findCatalogMatch(results, 'some name')?.primary).toBe('OnlyOne');
  });

  it('returns undefined when ambiguous (>1 result, no exact match)', () => {
    const results = [r('One', { code: 'A' }), r('Two', { code: 'B' })];
    expect(findCatalogMatch(results, 'nope')).toBeUndefined();
  });

  it('returns undefined for no results', () => {
    expect(findCatalogMatch([], 'A1')).toBeUndefined();
  });

  it('prefers an exact match over the single-result fallback ordering', () => {
    const results = [r('First', { code: 'X1' }), r('Second', { code: 'KEY' })];
    expect(findCatalogMatch(results, 'KEY')?.primary).toBe('Second');
  });
});
