import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Content-Type lock (browser-delete regression guard).
 *
 * A body-less request (GET, DELETE) that carries `Content-Type: application/json`
 * is rejected by the Next.js rewrite proxy (undici) with
 *   400 "Body cannot be empty when content-type is set to 'application/json'".
 * That silently broke EVERY `api.delete` in the browser (49 call sites) — unit
 * tests and direct-to-backend smokes never traversed the proxy, so it went
 * unnoticed until Phase-2 browser-QA (2026-06-06). The fix: only send a JSON
 * content-type when there is an actual body. This pins that contract.
 */

vi.mock('./auth-store', () => ({
  getAccessToken: () => 'test-token',
  refresh: vi.fn(),
}));

import { api } from './api-client';

function mockFetch() {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '{}',
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function headersOf(fn: ReturnType<typeof mockFetch>): Record<string, string> {
  const init = fn.mock.calls[0]?.[1] as RequestInit;
  return init.headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('api client content-type', () => {
  it('DELETE sends no Content-Type (body-less)', async () => {
    const fn = mockFetch();
    await api.delete('/print-templates/abc');
    expect(headersOf(fn)['Content-Type']).toBeUndefined();
  });

  it('GET sends no Content-Type (body-less)', async () => {
    const fn = mockFetch();
    await api.get('/organizations');
    expect(headersOf(fn)['Content-Type']).toBeUndefined();
  });

  it('POST sends Content-Type: application/json (has body)', async () => {
    const fn = mockFetch();
    await api.post('/payments-in', { sumMinor: '1' });
    expect(headersOf(fn)['Content-Type']).toBe('application/json');
  });

  it('PATCH sends Content-Type: application/json (has body)', async () => {
    const fn = mockFetch();
    await api.patch('/print-templates/abc', { name: 'x' });
    expect(headersOf(fn)['Content-Type']).toBe('application/json');
  });

  it('PUT sends Content-Type: application/json (has body)', async () => {
    const fn = mockFetch();
    await api.put('/roles/employee/abc', { roleIds: [] });
    expect(headersOf(fn)['Content-Type']).toBe('application/json');
  });

  it('always sends Accept: application/json', async () => {
    const fn = mockFetch();
    await api.delete('/print-templates/abc');
    expect(headersOf(fn).Accept).toBe('application/json');
  });
});
