import type { FastifyRequest } from 'fastify';
import { MEDIA_TOKEN_COOKIE } from './media-token.js';

/**
 * AUTH-04: `?access_token=` query-param fallback'i faqat brauzer header yubora
 * OLMAYDIGAN marshrutlarda qabul qilinadi — boshqa hamma joyda faqat
 * `Authorization: Bearer`. Aks holda amaldagi JWT istalgan endpoint URL'ida
 * yuradi va nginx access-log / brauzer-tarix / Referer orqali sizadi.
 *
 * **Faza Q13 (2026-08-09):** allowlist 5 marshrutdan **1 taga** qisqardi.
 * Media yo'llari (`<img src>`, `<a download>`, top-level PDF navigatsiyasi)
 * endi URL'da EMAS, HttpOnly `ms_mt` **media-cookie**'sida yuradi
 * (`media-token.ts`) — o'sha 4 yo'lda log/tarix sizishi nolga tushdi.
 *
 * Query'da qolgan yagona marshrut — **SSE** (`/notifications/stream`).
 * Bu ATAYLAB: `EventSource` custom header qo'ya olmaydi, cookie esa bu yerda
 * yetarli emas — mijoz-ekran (Electron) kabi oynalarda oqim boshqa kontekstda
 * ochilishi mumkin, shuning uchun SSE o'z tokenini o'zi olib yuradi.
 * `observability.ts` access-log'da uni redakt qiladi.
 */
const QUERY_TOKEN_ROUTES: readonly RegExp[] = [/^\/api\/v1\/notifications\/stream$/];

/**
 * Media-cookie QABUL QILINADIGAN marshrutlar (hammasi read-only GET).
 * Ro'yxatda YO'Q marshrut media-cookie'ni ko'rmaydi ham — token audience'i
 * kriptografik ajratilgan bo'lsa-da, transport ham default-deny.
 */
const MEDIA_COOKIE_ROUTES: readonly RegExp[] = [
  /^\/api\/v1\/images\/[^/]+\/raw$/,
  /^\/api\/v1\/attachments\/[^/]+\/raw$/,
  /^\/api\/v1\/purchase-orders\/list-report$/,
  /^\/api\/v1\/hr\/employees\/[^/]+\/image\/raw$/,
];

function pathOf(url: string): string {
  return url.split('?')[0] ?? '';
}

export function isQueryTokenRoute(url: string): boolean {
  const path = pathOf(url);
  return QUERY_TOKEN_ROUTES.some((re) => re.test(path));
}

/** Media-cookie shu marshrutda qabul qilinadimi (Faza Q13). */
export function isMediaCookieRoute(url: string): boolean {
  const path = pathOf(url);
  return MEDIA_COOKIE_ROUTES.some((re) => re.test(path));
}

type TokenRequest = Pick<FastifyRequest, 'headers' | 'url'> & {
  query?: unknown;
  cookies?: Record<string, string | undefined>;
};

/**
 * Bearer token extraction — JwtAuthGuard va PermissionsGuard uchun yagona
 * manba (ilgari ikki nusxa edi, cheklov qo'shilganda ajralib ketmasin).
 */
export function extractToken(req: TokenRequest): string | null {
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

/**
 * Media-cookie'ni oladi — FAQAT media marshrutlarida. Boshqa yo'lda cookie
 * mavjud bo'lsa ham `null` qaytadi (guard uni verify ham qilmaydi).
 */
export function extractMediaToken(req: TokenRequest): string | null {
  if (!isMediaCookieRoute(req.url)) return null;
  const raw = req.cookies?.[MEDIA_TOKEN_COOKIE];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}
