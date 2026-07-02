// Reusable runtime smoke — refresh-rotation grace window (cross-tab race).
// Run: DATABASE_URL=<dev-url> node tools/scripts/verify-refresh-grace-smoke.mjs
// (needs the dev api on :4000 + seeded admin@demo.local). Proves, LIVE:
//   A. cross-tab race: two CONCURRENT refreshes with the same cookie → both 200
//   B. sequential grace: replaying the consumed cookie within 60s → 200 (sibling)
//   C. replay beyond grace (revoked_at aged -2min in DB) → 401 AND the whole
//      family is revoked (successor cookie also 401s afterwards)
//   D. a fresh login (new family) is unaffected → refresh 200
import crypto from 'node:crypto';
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const tokenOf = (cookie) => decodeURIComponent(cookie.split('=')[1]);

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@demo.local', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const rt = r.headers.getSetCookie().find((c) => c.startsWith('ms_rt='));
  return rt.split(';')[0];
}

async function refresh(cookie) {
  const r = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { cookie } });
  const rt = (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('ms_rt='));
  return { status: r.status, cookie: rt ? rt.split(';')[0] : null };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// ---- setup
const c0 = await login();
const row0 = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(tokenOf(c0)) } });
check('setup: login token rooted as its own family', row0?.familyId === row0?.id, `familyId=${row0?.familyId?.slice(0, 8)}`);

// ---- A: concurrent cross-tab race
const [a1, a2] = await Promise.all([refresh(c0), refresh(c0)]);
check('A: concurrent refresh #1 (cross-tab race)', a1.status < 300, `status=${a1.status}`);
check('A: concurrent refresh #2 (cross-tab race)', a2.status < 300, `status=${a2.status}`);

// ---- B: sequential grace replay of the consumed original cookie
const b = await refresh(c0);
check('B: replay of consumed cookie within grace → sibling, not logout', b.status < 300, `status=${b.status}`);

// successors all in the same family?
const fam = row0.familyId;
const famRows = await prisma.refreshToken.findMany({ where: { familyId: fam } });
check('B: every successor inherited the family', famRows.length >= 3 && famRows.every((r) => r.familyId === fam), `familySize=${famRows.length}`);

// ---- C: age the original token's revocation beyond the grace window, replay
await prisma.refreshToken.update({
  where: { tokenHash: sha256(tokenOf(c0)) },
  data: { revokedAt: new Date(Date.now() - 120_000) },
});
const c = await refresh(c0);
check('C: replay beyond grace → 401', c.status === 401, `status=${c.status}`);

const liveAfterNuke = await prisma.refreshToken.count({ where: { familyId: fam, revokedAt: null } });
check('C: whole family revoked in DB', liveAfterNuke === 0, `liveTokensInFamily=${liveAfterNuke}`);

const survivors = [a1.cookie, a2.cookie, b.cookie].filter(Boolean);
const dead = await refresh(survivors[survivors.length - 1]);
check('C: latest successor cookie also rejected after family revocation', dead.status === 401, `status=${dead.status}`);

// ---- D: fresh login = new family, unaffected
const d0 = await login();
const d = await refresh(d0);
check('D: fresh login refresh still works (other families untouched)', d.status < 300, `status=${d.status}`);

// ---- cleanup: remove every token this proof created (test families only)
const dRow = await prisma.refreshToken.findFirst({ where: { tokenHash: sha256(tokenOf(d.cookie ?? d0)) } });
const famD = dRow?.familyId;
const del = await prisma.refreshToken.deleteMany({ where: { familyId: { in: [fam, famD].filter(Boolean) } } });
console.log(`cleanup: deleted ${del.count} proof tokens`);

await prisma.$disconnect();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
