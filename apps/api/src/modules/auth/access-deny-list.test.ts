import { createHmac } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AccessDenyList } from './access-deny-list.js';
import type { AuthenticatedUser } from './auth.schema.js';
import { MEDIA_TOKEN_TTL_SEC, deriveMediaSecret, signMediaToken } from './media-token.js';
import { TokenService } from './token.service.js';

/**
 * **Faza Q12 — offboarding access-JWT deny-list (`AUTH-05` qoldig'i).**
 *
 * Faza 23 refresh-tokenlarni offboarding tranzaksiyasida bekor qildi, lekin
 * **amaldagi access-JWT** (`JWT_ACCESS_TTL`, default `15m` — `auth.module.ts`)
 * imzo tekshiruvidan boshqa hech narsani ko'rmasdi: bo'shatilgan xodim token
 * muddati tugagunicha ishlashda davom etardi. Media-token (Faza Q13) esa 60
 * daqiqa yashaydi — ta'sir oynasi 4x kattaroq.
 *
 * Semantika (shu fayl qulflaydi):
 *  - deny-list manbasi DB (`employee.archived` + `employee_offboardings.completed_at`),
 *    ya'ni restart'da yo'qolmaydi; in-process `TtlCache` faqat tezlatgich;
 *  - `iat < revokedAt` => 401; `iat > revokedAt` (qayta ishga olingan xodim) => ishlaydi;
 *  - `archived` => SHARTSIZ 401 (arxivlangan xodim login ham qila olmaydi,
 *    `auth.service.ts:43`; refresh ham rad etadi, `auth.service.ts:169`);
 *  - `iat` YO'Q + bekor qilish BOR => fail-closed (chiqarilish vaqtini isbotlab
 *    bo'lmaydi); `iat` yo'q + bekor qilish yo'q => ta'sir yo'q;
 *  - `revokeAllForEmployee` in-process "floor" qo'yadi => bekor qilish DB keshi
 *    eskirishini kutmasdan DARHOL kuchga kiradi;
 *  - loader xatosi (DB blip) hammani chiqarib yubormaydi, lekin floor qoladi.
 */

const SECRET = 'test-secret-q12';

const USER: AuthenticatedUser = {
  sub: 'emp-1',
  accountId: 'acc-1',
  email: 'a@b.uz',
  name: 'A',
  username: null,
  hrRoles: [],
  isChecker: false,
  hrPermissions: [],
};

function makeJwt() {
  return new JwtService({ secret: SECRET, signOptions: { expiresIn: '15m' } });
}

interface FakeState {
  archived?: boolean;
  completedAt?: Date | null;
}

function makePrisma(states: Record<string, FakeState>) {
  const employeeFind = vi.fn(async (args: { where: { id: string } }) => {
    const s = states[args.where.id];
    return s ? { archived: s.archived ?? false } : null;
  });
  const offboardingFind = vi.fn(async (args: { where: { employeeId: string } }) => {
    const s = states[args.where.employeeId];
    if (!s || s.completedAt === undefined) return null;
    return { completedAt: s.completedAt };
  });
  return {
    prisma: {
      client: {
        employee: { findUnique: employeeFind },
        employeeOffboarding: { findUnique: offboardingFind },
        refreshToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
      },
    },
    employeeFind,
    offboardingFind,
  };
}

function makeService(states: Record<string, FakeState>) {
  const { prisma, employeeFind, offboardingFind } = makePrisma(states);
  const config = { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) };
  const jwt = makeJwt();
  const svc = new TokenService(jwt as never, config as never, prisma as never);
  return { svc, jwt, employeeFind, offboardingFind };
}

/**
 * Berilgan `iat` bilan access-JWT. `jsonwebtoken` payload'dagi `iat` ni hurmat
 * qiladi va `exp = iat + expiresIn` qiladi — quyidagi birinchi test buni jonli
 * tasdiqlaydi, ya'ni "iat bor" da'vosi taxmin emas.
 */
function signAt(jwt: JwtService, sub: string, iatSec: number) {
  return jwt.sign({ ...USER, sub, iat: iatSec }, { expiresIn: '15m' });
}

/** Faza Q12 dan OLDINGI format: `iat` maydonisiz media-token (moslik yo'li). */
function legacyMediaToken(sub: string, expSec: number) {
  const payload = { ...USER, sub, aud: 'media', exp: expSec };
  const body = `v1.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
  const sig = createHmac('sha256', deriveMediaSecret(SECRET)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

const NOW = Date.now();
const NOW_SEC = Math.floor(NOW / 1000);

describe('access-JWT `iat` — jonli tasdiqlash', () => {
  it('@nestjs/jwt imzolagan payload`da `iat` BOR va TTL 15 daqiqa', () => {
    const jwt = makeJwt();
    const decoded = jwt.verify<{ iat?: number; exp?: number }>(jwt.sign({ ...USER }));
    expect(typeof decoded.iat).toBe('number');
    expect((decoded.exp ?? 0) - (decoded.iat ?? 0)).toBe(15 * 60);
  });

  it('payload`dagi `iat` hurmat qilinadi (test-fixture shartnomasi)', () => {
    const jwt = makeJwt();
    const decoded = jwt.verify<{ iat?: number }>(signAt(jwt, 'emp-1', NOW_SEC - 300));
    expect(decoded.iat).toBe(NOW_SEC - 300);
  });
});

describe('TokenService.verifyAccessToken — offboarding deny-list', () => {
  it('(1) bo`shatishdan KEYIN eski access-token 401 beradi', async () => {
    const { svc, jwt } = makeService({
      'emp-1': { archived: true, completedAt: new Date(NOW - 60_000) },
    });
    await expect(svc.verifyAccessToken(signAt(jwt, 'emp-1', NOW_SEC - 300))).rejects.toThrow();
  });

  it('(2) BOSHQA xodimning tokeni ishlayveradi', async () => {
    const { svc, jwt } = makeService({
      'emp-1': { archived: true, completedAt: new Date(NOW - 60_000) },
      'emp-2': {},
    });
    await expect(svc.verifyAccessToken(signAt(jwt, 'emp-2', NOW_SEC - 300))).resolves.toMatchObject(
      { sub: 'emp-2' },
    );
  });

  it('(3) bekor qilishdan KEYIN chiqarilgan token ishlaydi (`iat` > revokedAt)', async () => {
    // Qayta ishga olingan xodim: `completed_at` qatori qoladi, `archived` yechiladi.
    const { svc, jwt } = makeService({
      'emp-1': { archived: false, completedAt: new Date(NOW - 600_000) },
    });
    await expect(svc.verifyAccessToken(signAt(jwt, 'emp-1', NOW_SEC - 10))).resolves.toMatchObject({
      sub: 'emp-1',
    });
    await expect(svc.verifyAccessToken(signAt(jwt, 'emp-1', NOW_SEC - 700))).rejects.toThrow();
  });

  it('arxivlangan xodim SHARTSIZ rad etiladi (yangi `iat` bo`lsa ham)', async () => {
    const { svc, jwt } = makeService({ 'emp-1': { archived: true } });
    await expect(svc.verifyAccessToken(signAt(jwt, 'emp-1', NOW_SEC))).rejects.toThrow();
  });

  it('DB`da xodim topilmasa — fail-closed (o`chirilgan xodim tokeni o`lik)', async () => {
    const { svc, jwt } = makeService({});
    await expect(svc.verifyAccessToken(signAt(jwt, 'emp-404', NOW_SEC))).rejects.toThrow();
  });

  it('(4) kesh TTL ichida DB BIR MARTA so`raladi', async () => {
    const { svc, jwt, employeeFind, offboardingFind } = makeService({ 'emp-2': {} });
    const tok = signAt(jwt, 'emp-2', NOW_SEC - 10);
    await svc.verifyAccessToken(tok);
    await svc.verifyAccessToken(tok);
    await svc.verifyAccessToken(tok);
    expect(employeeFind).toHaveBeenCalledTimes(1);
    expect(offboardingFind).toHaveBeenCalledTimes(1);
  });

  it('`revokeAllForEmployee` keshni kutmasdan DARHOL kuchga kiradi', async () => {
    const { svc, jwt } = makeService({ 'emp-2': {} });
    const tok = signAt(jwt, 'emp-2', NOW_SEC - 10);
    await expect(svc.verifyAccessToken(tok)).resolves.toMatchObject({ sub: 'emp-2' });
    // DB-fake hamon "ruxsat" deydi, lekin in-process floor darhol yopadi.
    await svc.revokeAllForEmployee('emp-2');
    await expect(svc.verifyAccessToken(tok)).rejects.toThrow();
  });
});

describe('media-token deny-list (Faza Q13 eslatmasi — TTL 60 daqiqa)', () => {
  it('bo`shatilgan xodimning media-cookie`si ham o`lik (null => guard 401)', async () => {
    const { svc } = makeService({
      'emp-1': { archived: true, completedAt: new Date(NOW - 60_000) },
    });
    const raw = signMediaToken({ ...USER, sub: 'emp-1' }, { secret: SECRET, nowMs: NOW - 300_000 });
    await expect(svc.verifyMediaToken(raw)).resolves.toBeNull();
  });

  it('bekor qilinmagan xodimning media-cookie`si ishlaydi', async () => {
    const { svc } = makeService({ 'emp-2': {} });
    const raw = signMediaToken({ ...USER, sub: 'emp-2' }, { secret: SECRET, nowMs: NOW });
    await expect(svc.verifyMediaToken(raw)).resolves.toMatchObject({ sub: 'emp-2' });
  });

  it('`iat`siz ESKI media-token chiqarilish vaqti `exp - TTL` deb baholanadi', async () => {
    expect(MEDIA_TOKEN_TTL_SEC).toBe(3600);
    // revokedAt = 10 daqiqa oldin.
    const states = { 'emp-3': { archived: false, completedAt: new Date(NOW - 600_000) } };
    // exp = hozir + 30 daq  =>  hosila iat = hozir - 30 daq  <  revokedAt  => RAD.
    const stale = legacyMediaToken('emp-3', NOW_SEC + 1800);
    await expect(makeService(states).svc.verifyMediaToken(stale)).resolves.toBeNull();
    // exp = hozir + 58 daq  =>  hosila iat = hozir - 2 daq  >  revokedAt  => QABUL.
    const fresh = legacyMediaToken('emp-3', NOW_SEC + 3480);
    await expect(makeService(states).svc.verifyMediaToken(fresh)).resolves.toMatchObject({
      sub: 'emp-3',
    });
  });
});

describe('AccessDenyList — birlik semantikasi', () => {
  const constLoader = (state: { archived: boolean; revokedAt: Date | null }) => {
    const calls = { n: 0 };
    const load = async () => {
      calls.n += 1;
      return state;
    };
    return { load, calls };
  };

  it('bekor qilish YO`Q => `iat`siz token ham o`tadi', async () => {
    const { load } = constLoader({ archived: false, revokedAt: null });
    const dl = new AccessDenyList(load);
    await expect(dl.isRevoked('e1', undefined)).resolves.toBe(false);
  });

  it('bekor qilish BOR + `iat` YO`Q => fail-closed', async () => {
    const { load } = constLoader({ archived: false, revokedAt: new Date(NOW) });
    const dl = new AccessDenyList(load);
    await expect(dl.isRevoked('e1', undefined)).resolves.toBe(true);
  });

  it('loader xatosi hammani chiqarib yubormaydi, lekin floor kuchda qoladi', async () => {
    const dl = new AccessDenyList(async () => {
      throw new Error('db down');
    });
    await expect(dl.isRevoked('e1', NOW_SEC)).resolves.toBe(false);
    dl.markRevoked('e1', NOW);
    await expect(dl.isRevoked('e1', NOW_SEC - 60)).resolves.toBe(true);
  });

  it('TTL tugagach DB qayta so`raladi', async () => {
    const { load, calls } = constLoader({ archived: false, revokedAt: null });
    const dl = new AccessDenyList(load, 5);
    await dl.isRevoked('e1', NOW_SEC);
    await dl.isRevoked('e1', NOW_SEC);
    expect(calls.n).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    await dl.isRevoked('e1', NOW_SEC);
    expect(calls.n).toBe(2);
  });
});
