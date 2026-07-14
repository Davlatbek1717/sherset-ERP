/**
 * Thin fetch wrapper — adds Authorization header from in-memory token
 * and handles auto-refresh on 401.
 */

import { getAccessToken, refresh } from './auth-store';

const BASE = '/api/v1';

/**
 * API xatosi. `isNetwork` — internet/proxy muammosi (server mantiqi emas):
 * UI buni «Internet yo'q» deb ko'rsatadi, «Saqlab bo'lmadi» deb emas.
 */
export interface ApiError extends Error {
  status?: number;
  body?: unknown;
  isNetwork?: boolean;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Only declare a JSON content-type when we actually send a body. A body-less
    // request (GET, DELETE) carrying `Content-Type: application/json` is rejected
    // by the Next.js rewrite proxy (undici) with a 400 "Body cannot be empty when
    // content-type is set to 'application/json'" — which silently broke every
    // `api.delete` in the browser. The backend itself does not require it.
    ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // TARMOQ XATOSI (2026-07-13 UX auditi): ilgari `fetch` try/catch'siz edi —
  // do'kon Wi-Fi'si uzilsa yoki VPS javob bermasa, foydalanuvchi inglizcha
  // «TypeError: Failed to fetch» ni ko'rardi va «dastur buzildi» deb qo'ng'iroq
  // qilardi. Endi bu ANIQ tarmoq xatosi sifatida belgilanadi va UI unga mos
  // tushunarli xabar ko'rsatadi.
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (cause) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const err = new Error(
      offline ? 'Internet aloqasi yo‘q' : 'Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.',
    ) as ApiError;
    err.status = 0;
    err.isNetwork = true;
    err.cause = cause;
    throw err;
  }

  if (res.status === 401 && retry && token) {
    // Try to refresh once and retry the original request
    const refreshed = await refresh();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!res.ok) {
    const text = await res.text();
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    let parsed: unknown = null;
    if (isJson) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    // JSON emas (nginx 502/504 XOM HTML sahifasi) — uni foydalanuvchiga
    // KO'RSATMAYMIZ. Ilgari toast ichida «<html><head><title>502…» chiqardi.
    const message =
      (parsed as { message?: string } | null)?.message ??
      (res.status >= 500
        ? 'Server javob bermadi. Bir ozdan keyin qayta urinib ko‘ring.'
        : `Xatolik (HTTP ${res.status})`);

    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.body = parsed;
    err.isNetwork = res.status >= 502 && res.status <= 504;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Download a binary response (XLSX, PDF, etc.) using the same auth as
 * `request`. Triggers a browser save dialog and resolves once kicked off.
 * Honours the server's Content-Disposition filename when present.
 */
async function download(path: string, fallbackFilename: string): Promise<void> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * POST a JSON body and download the binary response (PDF, XLSX...).
 * Used by bulk-print and other server-rendered file endpoints.
 * Honours Content-Disposition filename when present; falls back to
 * the supplied filename otherwise. Auto-refresh on 401 mirrors
 * `request()` semantics.
 */
async function postDownload(
  path: string,
  body: unknown,
  fallbackFilename: string,
  retry = true,
): Promise<void> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (res.status === 401 && retry && token) {
    const refreshed = await refresh();
    if (refreshed) return postDownload(path, body, fallbackFilename, false);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST download failed: HTTP ${res.status} ${text}`);
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * POST a JSON body and open the binary response (PDF) INLINE in a new browser
 * tab — moysklad's «Открыть в браузере» print behaviour (vs `postDownload`'s
 * save-to-disk). Auth + 401-refresh mirror `request()`. The blob URL is revoked
 * after a delay so the opened tab has time to load it.
 */
async function postOpenInBrowser(path: string, body: unknown, retry = true): Promise<void> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (res.status === 401 && retry && token) {
    const refreshed = await refresh();
    if (refreshed) return postOpenInBrowser(path, body, false);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Print failed: HTTP ${res.status} ${text}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Give the new tab time to fetch the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  download,
  postDownload,
  postOpenInBrowser,
};
