/**
 * Runtime verification (B6 S15): the counterparty «Доступ» section write-path —
 * Сотрудник (ownerId) · Отдел (groupId) · Общий доступ (shared). ownerId was
 * previously NON-writable (create forced it to the creator; update never handled
 * it); this slice makes it a connect/disconnect relation like groupId, accepts an
 * explicit null clear (.nullish()), and the FE «Доступ» editor threads all three.
 *
 * Live checks (full path HTTP → controller → service → Prisma → HTTP boundary):
 *   A) PATCH {groupId, shared:true, ownerId:null}  → 200; scalars reflect it; v0→v1
 *      (proves group CONNECT + shared write + owner DISCONNECT in one save)
 *   B) GET  → findById nested: group.id matches, shared:true, owner:null
 *   C) PATCH {ownerId: emp}                          → 200; ownerId===emp; v1→v2
 *      (proves the NEW owner CONNECT write-path — the gap this slice closes)
 *   D) GET  → findById nested owner.id===emp, owner.name present
 *   E) PATCH {shared:false}                          → 200; shared===false (toggles back)
 *   F) ADVERSARIAL PATCH {ownerId: BAD_UUID}         → 400 BAD_REFERENCE
 *      (a bad owner connect is mapped by the shared 11ac classifier exactly like a
 *      bad group connect — proves the new connect path degrades safely, NOT raw 500)
 *   G) explicit ZERO 5xx across every request
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/verify-counterparty-access-smoke.mts
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev). Creates + cleans up its own rows.
 */
import { prisma } from '../packages/db/src/index.ts';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';

// Must match PrismaExceptionFilter.BAD_REFERENCE_MESSAGE — asserting on it proves
// the 400 came from the bad-connect branch of mapVersionedUpdateError (11ac).
const BAD_REFERENCE_MESSAGE = "Bog'langan yozuv topilmadi yoki noto'g'ri";
const BAD_UUID = '00000000-0000-0000-0000-0000000000ff';

let TOKEN = '';

// biome-ignore lint/suspicious/noExplicitAny: smoke-only loose JSON
async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  // biome-ignore lint/suspicious/noExplicitAny: smoke-only loose JSON
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const results: boolean[] = [];
const pass = (m: string) => {
  results.push(true);
  console.log(`  ✓ ${m}`);
};
const fail = (m: string) => {
  results.push(false);
  console.log(`  ✗ ${m}`);
};

const tag = Date.now();
const PFX = `SMOKE-ACCESS-${tag}`;
const statuses: number[] = [];

async function patch(id: string, body: Record<string, unknown>) {
  const r = await api('PATCH', `/counterparties/${id}`, body);
  statuses.push(r.status);
  return r;
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in\n');

  // Reference rows for the valid connect paths.
  const emps = await api('GET', '/employees?limit=20');
  const emp: string | undefined = emps.json?.items?.[0]?.id;
  if (!emp) throw new Error(`no employees to pick an owner: ${JSON.stringify(emps.json)}`);
  const grps = await api('GET', '/groups?limit=20');
  const grp: string | undefined = grps.json?.items?.[0]?.id;
  if (!grp) console.log('  (no groups seeded — group-connect asserted as skipped)\n');

  try {
    const created = await api('POST', '/counterparties', { name: `${PFX}-cp` });
    if (created.status !== 201) throw new Error(`create: ${created.status} ${JSON.stringify(created.json)}`);
    const id: string = created.json.id;
    let version: number = created.json.version;
    // create defaults ownerId to the creator → a non-null starting owner, so the
    // disconnect in (A) is non-vacuous.
    if (created.json.ownerId) pass('create defaults ownerId to the creator (non-null owner to disconnect from)');
    else fail(`create ownerId expected non-null (creator), got ${JSON.stringify(created.json.ownerId)}`);

    // A) group connect + shared write + owner disconnect in one save
    const a = await patch(id, { ownerId: null, groupId: grp ?? undefined, shared: true, version });
    const aOk =
      a.status === 200 &&
      a.json?.ownerId === null &&
      (grp ? a.json?.groupId === grp : true) &&
      a.json?.shared === true &&
      a.json?.version === version + 1;
    if (aOk) {
      pass(`PATCH {ownerId:null${grp ? ', groupId' : ''}, shared:true} → 200; ownerId=null${grp ? `, groupId=${grp.slice(0, 8)}…` : ''}, shared=true; v${version}→${a.json.version}`);
      version = a.json.version;
    } else fail(`A → ${a.status} ${JSON.stringify(a.json)}`);

    // B) findById nested reflects the change
    const b = await api('GET', `/counterparties/${id}`);
    const bOk = b.json?.owner === null && b.json?.shared === true && (grp ? b.json?.group?.id === grp : true);
    if (bOk) pass('GET → nested owner:null, shared:true' + (grp ? ', group.id matches' : ''));
    else fail(`B → owner=${JSON.stringify(b.json?.owner)} shared=${b.json?.shared} group=${JSON.stringify(b.json?.group)}`);

    // C) owner CONNECT (the new write-path)
    const c = await patch(id, { ownerId: emp, version });
    if (c.status === 200 && c.json?.ownerId === emp && c.json?.version === version + 1) {
      pass(`PATCH {ownerId: emp} → 200; ownerId connected; v${version}→${c.json.version} (NEW owner write-path)`);
      version = c.json.version;
    } else fail(`C → ${c.status} ${JSON.stringify(c.json)}`);

    // D) findById nested owner re-appears
    const d = await api('GET', `/counterparties/${id}`);
    if (d.json?.owner?.id === emp && typeof d.json?.owner?.name === 'string') pass(`GET → nested owner.id===emp, owner.name="${d.json.owner.name}"`);
    else fail(`D → owner=${JSON.stringify(d.json?.owner)}`);

    // E) shared toggles back to false
    const e = await patch(id, { shared: false, version });
    if (e.status === 200 && e.json?.shared === false) {
      pass('PATCH {shared:false} → 200; shared=false (toggles back)');
      version = e.json.version;
    } else fail(`E → ${e.status} ${JSON.stringify(e.json)}`);

    // F) ADVERSARIAL bad owner connect → 400 (mapped by the shared 11ac classifier)
    const f = await patch(id, { ownerId: BAD_UUID, version });
    if (f.status === 400 && f.json?.message === BAD_REFERENCE_MESSAGE)
      pass('ADVERSARIAL PATCH bad ownerId → 400 BAD_REFERENCE (owner connect covered by 11ac mapVersionedUpdateError, not raw 500)');
    else fail(`F → ${f.status} ${JSON.stringify(f.json)} (expected 400 BAD_REFERENCE)`);

    // G) explicit ZERO 5xx
    const serv5xx = statuses.filter((s) => s >= 500).length;
    if (serv5xx === 0) pass(`explicitly ZERO 5xx across ${statuses.length} requests`);
    else fail(`${serv5xx}/${statuses.length} requests were 5xx; statuses=${statuses.join(',')}`);
  } finally {
    await prisma.counterparty.deleteMany({ where: { name: { startsWith: PFX } } }).catch(() => {});
    await prisma.$disconnect();
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
