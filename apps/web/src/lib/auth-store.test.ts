import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Refresh single-flight guard (2026-06-10).
 *
 * Bug-class: the API rotates the refresh cookie on every /auth/refresh (old
 * token consumed). Concurrent refresh calls — React StrictMode double-firing
 * the bootstrap effect, or a 401-retry overlapping a route-change bootstrap —
 * raced: the loser sent the consumed token, got 401 and logged the session
 * out. Presented as the "automation context bounces to /login on hard nav"
 * artifact (NEXT.md 06-03g). The fix shares ONE in-flight request across
 * concurrent callers; this locks it.
 */

describe('auth-store refresh — single-flight', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: () => Promise<Response>) {
    const fn = vi.fn(impl);
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  function okResponse(): Response {
    return {
      ok: true,
      json: async () => ({
        accessToken: 'tok',
        user: { id: 'u1', name: 'QA', email: 'qa@x', role: 'ADMIN' },
      }),
    } as unknown as Response;
  }

  it('concurrent refresh() calls share ONE network request', async () => {
    let release: (r: Response) => void = () => {};
    const gate = new Promise<Response>((res) => {
      release = res;
    });
    const fetchMock = stubFetch(() => gate);

    const { refresh } = await import('./auth-store');
    const p1 = refresh();
    const p2 = refresh(); // fired while p1 is still in flight
    release(okResponse());
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1); // NOT 2 — the race is gone
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  it('sequential refresh() calls each hit the network (flight slot is released)', async () => {
    const fetchMock = stubFetch(async () => okResponse());
    const { refresh } = await import('./auth-store');
    await refresh();
    await refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a failed refresh releases the flight slot and reports false', async () => {
    const fetchMock = stubFetch(async () => ({ ok: false }) as unknown as Response);
    const { refresh } = await import('./auth-store');
    expect(await refresh()).toBe(false);
    expect(await refresh()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
