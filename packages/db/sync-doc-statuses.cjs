// Re-runnable sync: pull moysklad document custom-statuses (definitions) into the
// State table AND assign each imported document its moysklad status (statusId).
// Read-only against the moysklad REST API. Run after `db:seed-real` to keep the
// «Статус» list column in parity (seed-real imports docs but not their status).
//   node sync-doc-statuses.cjs   (or `pnpm --filter @moysklad/db db:sync-statuses`)
// Idempotent: upserts statuses by (account, entityType, name) and re-maps docs by
// externalCode. purchaseorder/purchasereturn have no moysklad statuses → omitted.
const fs = require('node:fs');
const { PrismaClient } = require('./src/generated');

const env = {};
const ENV_PATH = require('node:path').resolve(__dirname, '../../.env.local');
for (const l of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = l.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const TOKEN = env.MOYSKLAD_REAL_API_TOKEN || env.MOYSKLAD_API_TOKEN;
const BASE = (env.MOYSKLAD_API_BASE || 'https://api.moysklad.ru/api/remap/1.2').replace(/\/+$/, '');
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const H = { Authorization: `Bearer ${TOKEN}` };
const p = new PrismaClient();
const toHex = (c) =>
  c == null ? null : `#${Number(c).toString(16).toUpperCase().padStart(6, '0')}`;
const idFromHref = (href) => (href ? href.split('/').pop() : null);
// moysklad occasionally drops connections under load — retry with backoff.
async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.status === 429) {
        await new Promise((s) => setTimeout(s, 2000 * (attempt + 1)));
        continue;
      }
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((s) => setTimeout(s, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function backfill(msEntity, entityType, model) {
  // 1. statuses (definitions) → upsert our State rows
  const meta = await fetchJson(`${BASE}/entity/${msEntity}/metadata`);
  const states = meta.states || [];
  const idToName = new Map();
  for (const s of states) {
    idToName.set(s.id, s.name);
    await p.state.upsert({
      where: { accountId_entityType_name: { accountId: ACCOUNT_ID, entityType, name: s.name } },
      update: { color: toHex(s.color) },
      create: {
        accountId: ACCOUNT_ID,
        entityType,
        name: s.name,
        color: toHex(s.color),
        stateType: s.stateType || 'Regular',
      },
    });
  }
  const ourStates = await p.state.findMany({
    where: { accountId: ACCOUNT_ID, entityType },
    select: { id: true, name: true },
  });
  const nameToOurId = new Map(ourStates.map((s) => [s.name, s.id]));

  // 2. documents (expand state) → collect externalCode per our statusId
  const byStatus = new Map();
  let offset = 0;
  let total = 0;
  let withState = 0;
  for (;;) {
    const url = `${BASE}/entity/${msEntity}?limit=1000&offset=${offset}&expand=state`;
    const body = await fetchJson(url);
    const rows = body.rows || [];
    if (rows.length === 0) break;
    await new Promise((s) => setTimeout(s, 250));
    for (const r of rows) {
      total++;
      const name = r.state?.name ?? idToName.get(idFromHref(r.state?.meta?.href));
      const statusId = name ? nameToOurId.get(name) : null;
      if (statusId) {
        withState++;
        if (!byStatus.has(statusId)) byStatus.set(statusId, []);
        byStatus.get(statusId).push(`ms:${r.id}`);
      }
    }
    offset += 1000;
    if (rows.length < 1000) break;
  }
  // 3. batch-update statusId
  let updated = 0;
  for (const [statusId, codes] of byStatus) {
    const res = await model.updateMany({
      where: { accountId: ACCOUNT_ID, externalCode: { in: codes } },
      data: { statusId },
    });
    updated += res.count;
  }
  return { statuses: states.map((s) => `${s.name}(${toHex(s.color)})`), total, withState, updated };
}

(async () => {
  // Re-runnable: syncs moysklad document custom-statuses (definitions + per-doc
  // assignment) into our State table + each doc's statusId. purchaseorder /
  // purchasereturn have NO custom statuses in moysklad, so they're omitted.
  const specs = [
    ['supply', 'supply', p.supply],
    ['demand', 'demand', p.demand],
    ['customerorder', 'customerorder', p.customerOrder],
  ];
  for (const [msE, et, model] of specs) {
    try {
      const r = await backfill(msE, et, model);
      console.info(`${et.toUpperCase()}:`, JSON.stringify(r));
    } catch (e) {
      console.info(`${et}: ERR`, String(e).slice(0, 150));
    }
  }
  await p.$disconnect();
})().catch((e) => {
  console.info('ERR', String(e).slice(0, 400));
  process.exit(1);
});
