/**
 * filterFromQueryString + queryFromFilter tests — verify the
 * URL-↔FilterDrawerValues round-trip used by every list page's
 * SavedFiltersPills.
 *
 * Adversarial focus: NaN guards on numeric fields, unknown params
 * silently ignored, leading "?" tolerated, empty string returns empty
 * object, encode + decode round-trips losslessly.
 */
import { describe, expect, it } from 'vitest';
import { filterFromQueryString, queryFromFilter } from './filter-from-query';

describe('filterFromQueryString', () => {
  it('returns an empty object for an empty string', () => {
    expect(filterFromQueryString('')).toEqual({});
  });

  it('decodes the FilterDrawerValues string fields', () => {
    const result = filterFromQueryString(
      'momentFrom=2026-04-01&momentTo=2026-04-30&agentId=ag-1&organizationId=org-1&storeId=st-1&ownerId=u-1',
    );
    expect(result).toEqual({
      momentFrom: '2026-04-01',
      momentTo: '2026-04-30',
      agentId: 'ag-1',
      organizationId: 'org-1',
      storeId: 'st-1',
      ownerId: 'u-1',
    });
  });

  it('decodes numeric range fields as numbers', () => {
    const result = filterFromQueryString('sumMinorFrom=1000&sumMinorTo=50000');
    expect(result.sumMinorFrom).toBe(1000);
    expect(result.sumMinorTo).toBe(50000);
  });

  it('drops numeric fields whose value is NaN', () => {
    const result = filterFromQueryString('sumMinorFrom=oops&sumMinorTo=10');
    expect(result.sumMinorFrom).toBeUndefined();
    expect(result.sumMinorTo).toBe(10);
  });

  it('drops empty string values rather than treating them as set', () => {
    const result = filterFromQueryString('momentFrom=&agentId=');
    expect(result.momentFrom).toBeUndefined();
    expect(result.agentId).toBeUndefined();
  });

  it('tolerates a leading "?" prefix on the query string', () => {
    const result = filterFromQueryString('?momentFrom=2026-04-01&agentId=ag-1');
    expect(result.momentFrom).toBe('2026-04-01');
    expect(result.agentId).toBe('ag-1');
  });

  it('silently ignores unknown query params', () => {
    const result = filterFromQueryString('momentFrom=2026-04-01&paymentStatus=paid&extraStuff=xyz');
    expect(result.momentFrom).toBe('2026-04-01');
    expect(Object.keys(result)).toEqual(['momentFrom']);
  });

  it('preserves the *Label twin fields when both are saved together', () => {
    const result = filterFromQueryString(
      'agentId=ag-1&agentLabel=Acme%20Corp&organizationId=org-1&organizationLabel=My%20Co',
    );
    expect(result.agentId).toBe('ag-1');
    expect(result.agentLabel).toBe('Acme Corp');
    expect(result.organizationId).toBe('org-1');
    expect(result.organizationLabel).toBe('My Co');
  });

  it('decodes negative numbers (rare but valid)', () => {
    const result = filterFromQueryString('sumMinorFrom=-500&sumMinorTo=500');
    expect(result.sumMinorFrom).toBe(-500);
    expect(result.sumMinorTo).toBe(500);
  });
});

describe('queryFromFilter', () => {
  it('returns an empty string for an empty filter object', () => {
    expect(queryFromFilter({})).toBe('');
  });

  it('encodes string and numeric fields', () => {
    const qs = queryFromFilter({
      momentFrom: '2026-04-01',
      agentId: 'ag-1',
      sumMinorFrom: 1000,
      sumMinorTo: 50000,
    });
    const usp = new URLSearchParams(qs);
    expect(usp.get('momentFrom')).toBe('2026-04-01');
    expect(usp.get('agentId')).toBe('ag-1');
    expect(usp.get('sumMinorFrom')).toBe('1000');
    expect(usp.get('sumMinorTo')).toBe('50000');
  });

  it('omits undefined and empty values', () => {
    const qs = queryFromFilter({
      momentFrom: '2026-04-01',
      momentTo: undefined,
      agentId: '',
    });
    const usp = new URLSearchParams(qs);
    expect(usp.get('momentFrom')).toBe('2026-04-01');
    expect(usp.has('momentTo')).toBe(false);
    expect(usp.has('agentId')).toBe(false);
  });

  it('omits non-finite numbers (NaN, Infinity)', () => {
    const qs = queryFromFilter({
      sumMinorFrom: Number.NaN,
      sumMinorTo: Number.POSITIVE_INFINITY,
    });
    expect(qs).toBe('');
  });

  it('encodes labels alongside their IDs', () => {
    const qs = queryFromFilter({
      agentId: 'ag-1',
      agentLabel: 'Acme Corp',
      organizationId: 'org-1',
      organizationLabel: 'My Co',
    });
    const usp = new URLSearchParams(qs);
    expect(usp.get('agentLabel')).toBe('Acme Corp');
    expect(usp.get('organizationLabel')).toBe('My Co');
  });

  it('round-trips losslessly through filterFromQueryString', () => {
    const original = {
      momentFrom: '2026-04-01',
      momentTo: '2026-04-30',
      agentId: 'ag-1',
      organizationId: 'org-1',
      storeId: 'st-1',
      sumMinorFrom: 1000,
      sumMinorTo: 50000,
    };
    const decoded = filterFromQueryString(queryFromFilter(original));
    expect(decoded).toEqual(original);
  });
});
