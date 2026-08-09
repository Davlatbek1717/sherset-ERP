/**
 * Authenticated `<img src>` for a product image's raw bytes.
 *
 * `GET /images/:id/raw` is JWT-guarded and a plain `<img>` can't send the
 * `Authorization: Bearer` header, so these URLs used to carry the LIVE access
 * token as `?access_token=` — which meant a full-power JWT sat in every nginx
 * access-log line, in the browser history and in the `Referer` header
 * (`AUTH-04`).
 *
 * **Faza Q13 (2026-08-09):** the token is gone from the URL entirely. The
 * server now issues a separate, short-lived, media-audience token in the
 * HttpOnly `ms_mt` cookie (`Path=/api/v1`, `SameSite=strict`) on login and on
 * every `/auth/refresh`; a same-origin `<img>` sends it automatically. So the
 * URL is a plain path — nothing secret to leak — and the browser cache key is
 * stable across token rotations (it used to change on every refresh).
 *
 * See `apps/api/src/modules/auth/media-token.ts` for the token format, the
 * derived-key audience separation and the TTL rationale.
 */
export function imageRawUrl(imageId: string): string {
  return `/api/v1/images/${imageId}/raw`;
}

/**
 * Authenticated `<img src>` for the employee card «Изображение» photo —
 * same `ms_mt` media-cookie mechanism as imageRawUrl. `bust` forces a refetch
 * right after an upload/remove (the browser caches the raw URL).
 */
export function employeeImageRawUrl(employeeId: string, bust?: number): string {
  const base = `/api/v1/hr/employees/${employeeId}/image/raw`;
  return bust ? `${base}?v=${bust}` : base;
}
