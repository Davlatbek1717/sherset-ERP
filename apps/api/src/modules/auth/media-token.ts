import { createHmac } from 'node:crypto';
import { secretEquals } from '../shared/timing-safe.js';
import type { AuthenticatedUser } from './auth.schema.js';

/**
 * **Media-token (Faza Q13 — `AUTH-04` qoldig'i).**
 *
 * Faza 22 access-token'ni query'dan 5 marshrutga cheklagan edi, lekin o'sha
 * 5 yo'lda **amaldagi JWT hamon URL'da** yurardi ⇒ nginx access-log, brauzer
 * tarixi va `Referer` orqali sizardi. Bu modul media yo'llari uchun alohida,
 * **qisqa muddatli va boshqa hech qayerda yaramaydigan** sirni beradi.
 *
 * ### Nega imzo + cookie, `?access_token=` emas
 * Token **HttpOnly `ms_mt` cookie**'sida yuradi (`auth.controller.ts`), ya'ni
 * URL'da UMUMAN yo'q — log/tarix/Referer sizishi shu 4 yo'lda **nolga** tushdi
 * (query-param yechimi uni faqat qisqartirardi). Cookie `Path=/api/v1`,
 * `SameSite=strict`, prod'da `Secure` — cross-site `<img>`/navigatsiya uni
 * yubormaydi, JS o'qiy olmaydi.
 *
 * ### Nega kalit HOSILA (audience ajratmasi)
 * Imzo kaliti `JWT_SECRET` dan `HMAC-SHA256(JWT_SECRET, 'media-url-v1')`
 * bilan hosil qilinadi va format JWT EMAS (`v1.<payload>.<sig>`). Natijada
 * ajratish **kriptografik va strukturaviy**, «`aud` ni tekshirishni unutmaslik»
 * intizomiga tayanmaydi:
 *   - media-token'ni `verifyAccessToken` (JWT, boshqa kalit) hech qachon
 *     qabul qilmaydi ⇒ sizib ketgan media-token bilan API ochilmaydi;
 *   - access-JWT'ni `verifyMediaToken` qabul qilmaydi (HMAC mos kelmaydi).
 * Payload'da `aud: 'media'` ham bor — ikkinchi qatlam (defence in depth).
 *
 * ### TTL tanlovi — 60 daqiqa
 * Reja «5 daqiqa» taklif qilgan; **jonli xulq bilan solishtirilgach 60 daqiqa
 * tanlandi** va sababi shu:
 *   - `<img>` 401 olganda O'ZI qayta urinmaydi va FE'da re-render tetigi yo'q
 *     ⇒ muddat sahifa ochiq turganda tugasa, rasmlar **jimgina sinadi**;
 *   - cookie `/auth/login` va HAR `/auth/refresh` da qayta o'rnatiladi,
 *     access-JWT TTL esa 15 daqiqa (`JWT_ACCESS_TTL`) ⇒ amalda har ≤15
 *     daqiqada yangilanadi va 60 daqiqa 4× zaxira beradi;
 *   - qisqa TTL'ning xavfsizlik foydasi bu yerda kichik: sir URL'da emas,
 *     HttpOnly, `SameSite=strict`, faqat 4 ta **read-only GET** marshrutida
 *     va faqat o'z `accountId` doirasida ishlaydi.
 * Qoldiq holat (soatlab uxlagan tab keyin rasm re-render qilsa) hisobotda
 * ochiq yozilgan.
 *
 * ### Tenant/scope
 * Token access-JWT bilan **AYNAN bir xil** claim to'plamini olib yuradi
 * (`accountId`, `hrRoles`, `hrPermissions`, `uiMode`…), shuning uchun
 * `PermissionsGuard`/`HrPermissionGuard` va servis-darajadagi record-scope
 * qoidalari o'zgarishsiz ishlaydi — media so'rovi «kamroq tekshirilgan»
 * yo'lga aylanmaydi. Boshqa akkaunt resursi tokendagi `accountId` bo'yicha
 * kesiladi, payload'ni qo'lda o'zgartirish esa imzoni buzadi.
 */

/** HttpOnly media cookie nomi (`ms_rt` refresh cookie'siga parallel). */
export const MEDIA_TOKEN_COOKIE = 'ms_mt';

/** Media-token amal qilish muddati (sekund). Yuqoridagi izohda asoslangan. */
export const MEDIA_TOKEN_TTL_SEC = 60 * 60;

const VERSION = 'v1';
const AUDIENCE = 'media';
/** Kalit-hosila yorlig'i. O'zgartirilsa hamma amaldagi media-token bekor bo'ladi. */
const DERIVE_LABEL = 'media-url-v1';

interface MediaPayload extends AuthenticatedUser {
  aud: typeof AUDIENCE;
  /** Muddat tugash vaqti — UNIX sekund. */
  exp: number;
  /**
   * Chiqarilgan payt — UNIX sekund (Faza Q12 deny-list uchun). **Ixtiyoriy:**
   * Q12 dan oldin imzolangan tokenlarda bu maydon yo'q; u holda chiqarilish
   * vaqti `exp − MEDIA_TOKEN_TTL_SEC` deb baholanadi (eng erta mumkin bo'lgan
   * payt ⇒ deny-list solishtiruvi fail-closed tomonga xato qiladi).
   */
  iat?: number;
}

/**
 * Media-imzo kalitini `JWT_SECRET` dan hosil qiladi.
 *
 * FAIL-CLOSED: bo'sh sir bilan «hamma o'tadi» holatiga tushmaslik uchun
 * darhol throw (boot-secrets.ts naqshi).
 */
export function deriveMediaSecret(jwtSecret: string): string {
  if (!jwtSecret) {
    throw new Error('deriveMediaSecret: JWT_SECRET bo‘sh — media-token imzolab bo‘lmaydi');
  }
  return createHmac('sha256', jwtSecret).update(DERIVE_LABEL).digest('base64url');
}

function sign(body: string, mediaSecret: string): string {
  return createHmac('sha256', mediaSecret).update(body).digest('base64url');
}

/**
 * Media-token imzolaydi. `secret` — XOM `JWT_SECRET` (hosila ichkarida
 * olinadi, chaqiruvchi kalit-hosilani takrorlamasin).
 */
export function signMediaToken(
  user: AuthenticatedUser,
  opts: { secret: string; ttlSec?: number; nowMs?: number },
): string {
  const mediaSecret = deriveMediaSecret(opts.secret);
  const now = opts.nowMs ?? Date.now();
  const payload: MediaPayload = {
    ...user,
    aud: AUDIENCE,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + (opts.ttlSec ?? MEDIA_TOKEN_TTL_SEC),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const body = `${VERSION}.${encoded}`;
  return `${body}.${sign(body, mediaSecret)}`;
}

/**
 * Media-token'ni tekshiradi. Yaroqsiz/muddati tugagan/buzilgan holatda
 * **null** (throw emas) — chaqiruvchi guard 401 beradi.
 *
 * Imzo solishtiruvi `secretEquals` orqali **doimiy-vaqtda** (Faza 21 naqshi):
 * oddiy `===` birinchi farqli baytda to'xtaydi va imzoni baytma-bayt topish
 * uchun timing-oracle qoldiradi.
 */
export function verifyMediaToken(
  raw: string | null | undefined,
  opts: { secret: string; nowMs?: number },
): AuthenticatedUser | null {
  return verifyMediaTokenDetailed(raw, opts)?.user ?? null;
}

/**
 * `verifyMediaToken` ning to'liq natijasi: foydalanuvchi **va** tokenning
 * chiqarilgan payti (UNIX sekund). Ikkinchisi Faza Q12 deny-list'iga kerak —
 * `iat < revokedAt` bo'lsa media-cookie ham o'lik hisoblanadi.
 *
 * `iat` maydonsiz (Q12 dan oldingi) tokenlarda u `exp − MEDIA_TOKEN_TTL_SEC`
 * dan hosil qilinadi: bu token chiqarilishi mumkin bo'lgan **eng erta** payt,
 * ya'ni solishtiruv hech qachon tokenni haqiqiydan yangiroq ko'rsatmaydi.
 */
export function verifyMediaTokenDetailed(
  raw: string | null | undefined,
  opts: { secret: string; nowMs?: number },
): { user: AuthenticatedUser; iatSec: number } | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [version, encoded, signature] = parts as [string, string, string];
  if (version !== VERSION) return null;

  let mediaSecret: string;
  try {
    mediaSecret = deriveMediaSecret(opts.secret);
  } catch {
    return null;
  }
  if (!secretEquals(signature, sign(`${VERSION}.${encoded}`, mediaSecret))) return null;

  let payload: MediaPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as MediaPayload;
  } catch {
    return null;
  }
  if (!payload || payload.aud !== AUDIENCE) return null;
  if (typeof payload.exp !== 'number') return null;
  const now = opts.nowMs ?? Date.now();
  if (payload.exp * 1000 <= now) return null;

  const { aud: _aud, exp, iat, ...user } = payload;
  const iatSec = typeof iat === 'number' && Number.isFinite(iat) ? iat : exp - MEDIA_TOKEN_TTL_SEC;
  return { user, iatSec };
}
