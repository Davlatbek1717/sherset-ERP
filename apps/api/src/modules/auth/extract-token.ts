import type { FastifyRequest } from 'fastify';

/**
 * AUTH-04: `?access_token=` query-param fallback'i faqat brauzer header yubora
 * OLMAYDIGAN marshrutlarda qabul qilinadi — boshqa hamma joyda faqat
 * `Authorization: Bearer`. Aks holda amaldagi JWT istalgan endpoint URL'ida
 * yuradi va nginx access-log / brauzer-tarix / Referer orqali sizadi.
 *
 * Allowlist a'zolari (hammasi header-siz transport):
 *  - SSE oqimi — `EventSource` custom header qo'ya olmaydi;
 *  - <img src> media (`/raw`) — rasm teglari header yubormaydi;
 *  - top-level PDF navigatsiya (`window.open`) — bearer header yo'q.
 * Bu marshrutlarda token hali ham query'da yuradi (log-siziш yuzasi
 * qisqardi, nolga tushmadi) — to'liq yechim (signed-URL / cookie-media)
 * alohida faza.
 */
const QUERY_TOKEN_ROUTES: readonly RegExp[] = [
  /^\/api\/v1\/notifications\/stream$/,
  /^\/api\/v1\/images\/[^/]+\/raw$/,
  /^\/api\/v1\/attachments\/[^/]+\/raw$/,
  /^\/api\/v1\/purchase-orders\/list-report$/,
  /^\/api\/v1\/hr\/employees\/[^/]+\/image\/raw$/,
];

export function isQueryTokenRoute(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return QUERY_TOKEN_ROUTES.some((re) => re.test(path));
}

/**
 * Bearer token extraction — JwtAuthGuard va PermissionsGuard uchun yagona
 * manba (ilgari ikki nusxa edi, cheklov qo'shilganda ajralib ketmasin).
 */
export function extractToken(
  req: Pick<FastifyRequest, 'headers' | 'url'> & { query?: unknown },
): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  if (!isQueryTokenRoute(req.url)) {
    return null;
  }
  const queryToken = (req.query as { access_token?: unknown } | undefined)?.access_token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}
