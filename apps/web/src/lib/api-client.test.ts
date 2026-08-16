/**
 * api-client contract locks — two independent regression guards.
 *
 * (1) Content-Type lock (browser-delete regression, Phase-2 QA 2026-06-06).
 * A body-less request (GET, DELETE) that carries `Content-Type: application/json`
 * is rejected by the Next.js rewrite proxy (undici) with
 *   400 "Body cannot be empty when content-type is set to 'application/json'".
 * That silently broke EVERY `api.delete` in the browser (49 call sites) — unit
 * tests and direct-to-backend smokes never traversed the proxy, so it went
 * unnoticed. The fix: only send a JSON content-type when there is an actual body.
 *
 * (2) 401→refresh→retry across EVERY transport (FE-06, 2026-08-09).
 * `request()` (JSON) has refreshed-and-retried since day one, but the three
 * binary transports were hand-copied from it and `download()` lost the retry
 * branch in the copy. The symptom is invisible to typecheck/lint and only shows
 * up after the access token expires: «Экспорт в XLSX» throws
 * `Download failed: HTTP 401` and the user has to reload the page, even though
 * the refresh cookie is still perfectly valid. All four transports now share one
 * `authedFetch`; these tests keep a future copy-paste from dropping it again.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.fn<() => string | null>();
const refresh = vi.fn<() => Promise<boolean>>();

vi.mock('./auth-store', () => ({
  getAccessToken: () => getAccessToken(),
  refresh: () => refresh(),
}));

import { api } from './api-client';

/** A minimal Response stand-in — happy-dom has no real fetch backend. */
function res(
  status: number,
  opts: { body?: unknown; blob?: Blob; headers?: Record<string, string> } = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(opts.headers ?? {}),
    json: async () => opts.body ?? {},
    text: async () => (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? {})),
    blob: async () => opts.blob ?? new Blob(['x'], { type: 'application/octet-stream' }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
const savedUrls: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  savedUrls.length = 0;
  getAccessToken.mockReturnValue('expired-token');
  refresh.mockResolvedValue(true);

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  // happy-dom implements neither createObjectURL nor anchor-triggered downloads.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      const u = `blob:mock/${savedUrls.length}`;
      savedUrls.push(u);
      return u;
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client content-type', () => {
  const headersOf = () =>
    (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string> | undefined;

  beforeEach(() => {
    fetchMock.mockResolvedValue(res(200, { body: {} }));
  });

  it('DELETE sends no Content-Type (body-less)', async () => {
    await api.delete('/print-templates/abc');
    expect(headersOf()?.['Content-Type']).toBeUndefined();
  });

  it('GET sends no Content-Type (body-less)', async () => {
    await api.get('/organizations');
    expect(headersOf()?.['Content-Type']).toBeUndefined();
  });

  it('POST sends Content-Type: application/json (has body)', async () => {
    await api.post('/payments-in', { sumMinor: '1' });
    expect(headersOf()?.['Content-Type']).toBe('application/json');
  });

  it('PATCH sends Content-Type: application/json (has body)', async () => {
    await api.patch('/print-templates/abc', { name: 'x' });
    expect(headersOf()?.['Content-Type']).toBe('application/json');
  });

  it('PUT sends Content-Type: application/json (has body)', async () => {
    await api.put('/roles/employee/abc', { roleIds: [] });
    expect(headersOf()?.['Content-Type']).toBe('application/json');
  });

  it('always sends Accept: application/json', async () => {
    await api.delete('/print-templates/abc');
    expect(headersOf()?.Accept).toBe('application/json');
  });
});

describe('401 → refresh → retry, on every transport', () => {
  const authOf = (call: unknown[] | undefined) =>
    ((call?.[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined)
      ?.Authorization;

  it('download() retries the export once with the refreshed token (FE-06 hole)', async () => {
    getAccessToken.mockReturnValueOnce('expired-token').mockReturnValue('fresh-token');
    fetchMock
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(
        res(200, { headers: { 'Content-Disposition': 'attachment; filename="report.xlsx"' } }),
      );

    await expect(api.download('/reports/x/export', 'fallback.xlsx')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('download() gives up after ONE retry (no infinite refresh loop)', async () => {
    fetchMock.mockResolvedValue(res(401));

    await expect(api.download('/reports/x/export', 'f.xlsx')).rejects.toThrow(/401/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('download() does not retry when the refresh itself fails', async () => {
    refresh.mockResolvedValue(false);
    fetchMock.mockResolvedValue(res(401));

    await expect(api.download('/reports/x/export', 'f.xlsx')).rejects.toThrow(/401/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('postDownload() retries once with the refreshed token', async () => {
    getAccessToken.mockReturnValueOnce('expired-token').mockReturnValue('fresh-token');
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200));

    await api.postDownload('/print/bulk', { ids: ['a'] }, 'doc.pdf');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('postOpenInBrowser() retries once with the refreshed token', async () => {
    getAccessToken.mockReturnValueOnce('expired-token').mockReturnValue('fresh-token');
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200));

    await api.postOpenInBrowser('/print/inline', { ids: ['a'] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('blobUrl() retries once with the refreshed token', async () => {
    getAccessToken.mockReturnValueOnce('expired-token').mockReturnValue('fresh-token');
    fetchMock
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(200, { blob: new Blob(['x'], { type: 'image/png' }) }));

    const out = await api.blobUrl('/debts/1/receipt');

    expect(out.mime).toBe('image/png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('get() retries once with the refreshed token (baseline, already worked)', async () => {
    getAccessToken.mockReturnValueOnce('expired-token').mockReturnValue('fresh-token');
    fetchMock
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(200, { body: { items: [] } }));

    await expect(api.get('/products')).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt a refresh when there was no token to begin with', async () => {
    getAccessToken.mockReturnValue(null);
    fetchMock.mockResolvedValue(res(401));

    await expect(api.download('/reports/x/export', 'f.xlsx')).rejects.toThrow(/401/);

    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AbortSignal forwarding (POS qidiruv bekor qilish, 2026-08-16)', () => {
  it("get() ixtiyoriy signalni fetch'ga uzatadi", async () => {
    fetchMock.mockResolvedValue(res(200, { body: { items: [] } }));
    const controller = new AbortController();

    await api.get('/products?search=kab', { signal: controller.signal });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('signal berilmasa fetch signalsiz ketadi (regress emas)', async () => {
    fetchMock.mockResolvedValue(res(200, { body: {} }));

    await api.get('/organizations');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });
});

describe('Content-Disposition filename handling (shared by both save paths)', () => {
  it('download() prefers the server filename over the caller fallback', async () => {
    const anchors: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => undefined;
        anchors.push(el as HTMLAnchorElement);
      }
      return el;
    });

    fetchMock.mockResolvedValue(
      res(200, { headers: { 'Content-Disposition': 'attachment; filename="Отчёт.xlsx"' } }),
    );
    await api.download('/reports/x/export', 'fallback.xlsx');
    expect(anchors[0]?.download).toBe('Отчёт.xlsx');

    fetchMock.mockResolvedValue(res(200));
    await api.download('/reports/x/export', 'fallback.xlsx');
    expect(anchors[1]?.download).toBe('fallback.xlsx');

    vi.mocked(document.createElement).mockRestore();
  });
});
