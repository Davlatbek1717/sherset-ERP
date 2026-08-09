import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from './auth.schema.js';
import {
  MEDIA_TOKEN_COOKIE,
  MEDIA_TOKEN_TTL_SEC,
  deriveMediaSecret,
  signMediaToken,
  verifyMediaToken,
} from './media-token.js';

/**
 * Faza Q13 (`AUTH-04` qoldig'i) — media marshrutlari uchun **imzolangan,
 * qisqa muddatli, alohida auditoriyali** token. Uch xossa test bilan qulflanadi:
 *
 *  1. **Kalit ajratilgan** — imzo `JWT_SECRET` dan HMAC bilan HOSILA qilingan
 *     kalitda. Access-JWT bilan bir kalitda EMAS ⇒ media-token boshqa
 *     endpointga (`verifyAccessToken`) yaramaydi va aksincha.
 *  2. **Auditoriya + muddat** — payload'da `aud: 'media'` va `exp`; muddati
 *     tugagan yoki auditoriyasi boshqa token — RAD.
 *  3. **Buzilmaslik** — payload yoki imzoning bitta bayti o'zgarsa RAD
 *     (solishtirish doimiy-vaqtda, `secretEquals`).
 */

const SECRET = 'jwt-secret-for-tests';

const USER: AuthenticatedUser = {
  sub: 'emp-1',
  accountId: 'acc-1',
  email: 'a@b.uz',
  name: 'Ali',
  username: 'ali',
  hrRoles: ['admin'],
  isChecker: false,
  uiMode: 'full',
  hrPermissions: [{ pageKey: 'employees', section: null, accessLevel: 'read' }],
};

describe('media-token (Faza Q13)', () => {
  it('cookie nomi va TTL — qisqa muddat (≤ 1 soat)', () => {
    expect(MEDIA_TOKEN_COOKIE).toBe('ms_mt');
    expect(MEDIA_TOKEN_TTL_SEC).toBeGreaterThan(0);
    expect(MEDIA_TOKEN_TTL_SEC).toBeLessThanOrEqual(60 * 60);
  });

  it('hosila kalit JWT_SECRET dan FARQ qiladi (audience ajratmasi)', () => {
    const derived = deriveMediaSecret(SECRET);
    expect(derived).not.toBe(SECRET);
    expect(derived.length).toBeGreaterThan(20);
    // deterministik
    expect(deriveMediaSecret(SECRET)).toBe(derived);
    // boshqa sir → boshqa kalit
    expect(deriveMediaSecret(`${SECRET}x`)).not.toBe(derived);
  });

  it('bo‘sh sir — FAIL-CLOSED (throw), jim ishlamaydi', () => {
    expect(() => deriveMediaSecret('')).toThrow();
  });

  it('muddat ichida — claim‘lar butunicha qaytadi', () => {
    const now = 1_700_000_000_000;
    const token = signMediaToken(USER, { secret: SECRET, nowMs: now });
    const got = verifyMediaToken(token, { secret: SECRET, nowMs: now + 60_000 });
    expect(got).toEqual(USER);
  });

  it('muddat tugagach — null (401 manbasi)', () => {
    const now = 1_700_000_000_000;
    const token = signMediaToken(USER, { secret: SECRET, nowMs: now });
    const after = now + (MEDIA_TOKEN_TTL_SEC + 1) * 1000;
    expect(verifyMediaToken(token, { secret: SECRET, nowMs: after })).toBeNull();
  });

  it('boshqa sir bilan imzolangan token — RAD', () => {
    const token = signMediaToken(USER, { secret: 'other-secret' });
    expect(verifyMediaToken(token, { secret: SECRET })).toBeNull();
  });

  it('payload buzilgan (boshqa akkaunt qo‘yilgan) — RAD', () => {
    const token = signMediaToken(USER, { secret: SECRET });
    const [ver, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8'));
    decoded.accountId = 'acc-EVIL';
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    expect(verifyMediaToken(`${ver}.${forged}.${sig}`, { secret: SECRET })).toBeNull();
  });

  it('imzo buzilgan — RAD', () => {
    const token = signMediaToken(USER, { secret: SECRET });
    expect(verifyMediaToken(`${token}x`, { secret: SECRET })).toBeNull();
  });

  it('shaklsiz / bo‘sh kirish — RAD (throw emas)', () => {
    for (const bad of [null, undefined, '', 'abc', 'v1.abc', 'v9.a.b']) {
      expect(verifyMediaToken(bad, { secret: SECRET })).toBeNull();
    }
  });

  it('access-JWT shaklidagi qator media-token sifatida O‘TMAYDI', () => {
    // uch bo'lakli, lekin bizning HMAC'imiz bilan imzolanmagan
    const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJlbXAtMSJ9.c2ln';
    expect(verifyMediaToken(jwtLike, { secret: SECRET })).toBeNull();
  });
});
