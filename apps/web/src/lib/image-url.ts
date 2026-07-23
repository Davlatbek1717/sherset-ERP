import { getAccessToken } from './auth-store';

/**
 * Authenticated `<img src>` for a product image's raw bytes.
 *
 * `GET /images/:id/raw` is JWT-guarded, and a plain `<img>` can't send the
 * `Authorization: Bearer` header — so the byte stream 401'd and every product
 * thumbnail rendered broken (alt text only). The access token lives in memory
 * (XSS-safe) and the refresh cookie is path-scoped to `/api/v1/auth`, so neither
 * reaches the image endpoint automatically. We therefore pass the in-memory
 * access token through the guard's `?access_token=` query fallback — the same
 * mechanism the SSE stream already uses, and the one auth channel available to
 * an `<img>` here.
 */
export function imageRawUrl(imageId: string): string {
  const token = getAccessToken();
  return `/api/v1/images/${imageId}/raw${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;
}

/**
 * Authenticated `<img src>` for the employee card «Изображение» photo —
 * same ?access_token= mechanism as imageRawUrl. `bust` forces a refetch
 * right after an upload/remove (the browser caches the raw URL).
 */
export function employeeImageRawUrl(employeeId: string, bust?: number): string {
  const token = getAccessToken();
  const params = new URLSearchParams();
  if (token) params.set('access_token', token);
  if (bust) params.set('v', String(bust));
  const qs = params.toString();
  return `/api/v1/hr/employees/${employeeId}/image/raw${qs ? `?${qs}` : ''}`;
}
