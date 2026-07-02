import { firstValueFrom, of } from 'rxjs';
/**
 * StripTenantInterceptor tests — verify accountId is removed from
 * every shape the API returns: top-level objects, arrays, nested
 * objects in `items[]`, deeply nested relations.
 *
 * The interceptor mutates the response in place to avoid copying
 * large lists, so each test creates fresh fixtures.
 */
import { describe, expect, it } from 'vitest';
import { StripTenantInterceptor } from './strip-tenant.interceptor.js';

const interceptor = new StripTenantInterceptor();

async function intercept(payload: unknown) {
  // Cast: the interceptor doesn't read ctx so a sentinel works.
  const result$ = interceptor.intercept({} as never, { handle: () => of(payload) });
  return firstValueFrom(result$);
}

describe('StripTenantInterceptor', () => {
  it('strips accountId from a top-level object', async () => {
    const out = (await intercept({
      id: 'doc-1',
      accountId: 'tenant-A',
      name: 'Demo',
    })) as Record<string, unknown>;
    expect(out.accountId).toBeUndefined();
    expect(out.id).toBe('doc-1');
    expect(out.name).toBe('Demo');
  });

  it('strips accountId from items[] array', async () => {
    const out = (await intercept({
      items: [
        { id: '1', accountId: 'tenant-A', name: 'A' },
        { id: '2', accountId: 'tenant-A', name: 'B' },
      ],
      total: 2,
    })) as { items: Array<Record<string, unknown>> };
    for (const item of out.items) {
      expect(item.accountId).toBeUndefined();
      expect(item.id).toBeDefined();
    }
  });

  it('strips accountId from a top-level array', async () => {
    const out = (await intercept([
      { id: '1', accountId: 'tenant-A' },
      { id: '2', accountId: 'tenant-A' },
    ])) as Array<Record<string, unknown>>;
    expect(out[0]?.accountId).toBeUndefined();
    expect(out[1]?.accountId).toBeUndefined();
  });

  it('strips accountId from nested relation objects', async () => {
    const out = (await intercept({
      id: 'doc-1',
      accountId: 'tenant-A',
      agent: {
        id: 'a-1',
        accountId: 'tenant-A', // also leaked from agent
        name: 'Acme',
      },
      organization: {
        id: 'o-1',
        accountId: 'tenant-A',
        name: 'My Co',
      },
    })) as Record<string, unknown>;
    expect(out.accountId).toBeUndefined();
    expect((out.agent as Record<string, unknown>).accountId).toBeUndefined();
    expect((out.organization as Record<string, unknown>).accountId).toBeUndefined();
    expect((out.agent as Record<string, unknown>).name).toBe('Acme');
  });

  it('strips accountId from arrays nested inside objects (positions[])', async () => {
    const out = (await intercept({
      id: 'doc-1',
      accountId: 'tenant-A',
      positions: [
        { id: 'p-1', accountId: 'tenant-A', quantity: 1 },
        { id: 'p-2', accountId: 'tenant-A', quantity: 2 },
      ],
    })) as { positions: Array<Record<string, unknown>> };
    expect(out.positions[0]?.accountId).toBeUndefined();
    expect(out.positions[1]?.accountId).toBeUndefined();
  });

  it('preserves null/undefined/primitive payloads as-is', async () => {
    expect(await intercept(null)).toBeNull();
    expect(await intercept(undefined)).toBeUndefined();
    expect(await intercept('hello')).toBe('hello');
    expect(await intercept(42)).toBe(42);
    expect(await intercept(true)).toBe(true);
  });

  it('does not strip ownerId, organizationId, or other "id" fields', async () => {
    const out = (await intercept({
      id: 'doc-1',
      accountId: 'tenant-A',
      ownerId: 'u-1',
      organizationId: 'o-1',
      groupId: 'g-1',
      stateId: 's-1',
    })) as Record<string, unknown>;
    expect(out.accountId).toBeUndefined();
    expect(out.ownerId).toBe('u-1');
    expect(out.organizationId).toBe('o-1');
    expect(out.groupId).toBe('g-1');
    expect(out.stateId).toBe('s-1');
  });

  it('handles empty arrays and empty objects', async () => {
    expect(await intercept([])).toEqual([]);
    expect(await intercept({})).toEqual({});
  });
});
