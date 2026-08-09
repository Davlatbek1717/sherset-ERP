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

/**
 * FE-07 — a DEAD session must stop looking alive.
 *
 * Bug: `refresh()` reported `false` on a 401 and left the store untouched —
 * `state.user` still held the old user and `ms:auth-hint` still said "1". The
 * layout's redirect effect only fires on `initialized && !user && !hasAuthHint()`,
 * so after the refresh cookie expired mid-session the app kept rendering the
 * full shell while EVERY request 401'd: menus, buttons and empty lists, with no
 * hint that the session was gone. Only a manual reload (which re-ran bootstrap
 * and hit the same 401 through `bootstrapSession`'s own clearing branch) escaped
 * to /login.
 *
 * The fix must distinguish "the server says this refresh token is dead"
 * (401/403 → clear + emit → redirect) from "we could not ask" (network error,
 * 5xx → keep the session; an offline blip or a restarting API must NOT log the
 * cashier out mid-sale).
 */
describe('auth-store refresh — dead session must not look alive (FE-07)', () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function loginResponse(): Response {
    return {
      ok: true,
      json: async () => ({
        accessToken: 'tok',
        user: { id: 'u1', name: 'QA', email: 'qa@x' },
      }),
    } as unknown as Response;
  }

  /** Logs in through the real store so the hint + in-memory token are set. */
  async function withLiveSession() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => loginResponse()),
    );
    const store = await import('./auth-store');
    await store.login('qa@x', 'pw');
    expect(store.getAccessToken()).toBe('tok');
    expect(store.hasAuthHint()).toBe(true);
    return store;
  }

  it('401 clears the in-memory token AND the auth hint (redirect can fire)', async () => {
    const store = await withLiveSession();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response),
    );
    expect(await store.refresh()).toBe(false);

    expect(store.getAccessToken()).toBeNull();
    // The hint is what suppresses the layout redirect — it MUST be gone, or
    // the user stays parked on a dead shell.
    expect(store.hasAuthHint()).toBe(false);
  });

  it('403 is treated the same (refresh token rejected, not a transport fault)', async () => {
    const store = await withLiveSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403 }) as unknown as Response),
    );
    expect(await store.refresh()).toBe(false);
    expect(store.getAccessToken()).toBeNull();
    expect(store.hasAuthHint()).toBe(false);
  });

  it('a network error does NOT log the user out (offline ≠ dead session)', async () => {
    const store = await withLiveSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await store.refresh()).toBe(false);
    expect(store.getAccessToken()).toBe('tok');
    expect(store.hasAuthHint()).toBe(true);
  });

  it('a 5xx does NOT log the user out (API restart ≠ dead session)', async () => {
    const store = await withLiveSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response),
    );
    expect(await store.refresh()).toBe(false);
    expect(store.getAccessToken()).toBe('tok');
    expect(store.hasAuthHint()).toBe(true);
  });

  it('subscribers are notified on the 401 clear — a mounted useAuth re-renders', async () => {
    const store = await withLiveSession();
    const { renderHook, act, waitFor } = await import('@testing-library/react');

    const { result } = renderHook(() => store.useAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response),
    );
    await act(async () => {
      await store.refresh();
    });

    // `initialized && !user` is exactly the layout's redirect condition.
    expect(result.current.initialized).toBe(true);
    expect(result.current.user).toBeNull();
  });
});
