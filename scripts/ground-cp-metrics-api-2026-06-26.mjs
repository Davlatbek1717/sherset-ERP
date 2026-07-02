// GROUND (moysklad REST API, READ-ONLY) the counterparty «Показатели» tab data:
//   1) GET /entity/organization        → our org names (to confirm the «Баланс:»
//      breakdown is grouped per ORGANIZATION — its line names should match).
//   2) GET /report/counterparty/{id}    → the exact «Показатели» field shape/semantics
//      (Продажи / Прибыль / Возвраты / Баланс) — so we are 1:1 with moysklad, not guessing.
// No writes. Dumps raw JSON to the audit dir.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/cp-metrics-tab-2026-06-26');
fs.mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const API_BASE = env.MOYSKLAD_API_BASE || 'https://api.moysklad.ru/api/remap/1.2';
const API_TOKEN = env.MOYSKLAD_REAL_API_TOKEN || env.MOYSKLAD_API_TOKEN;
const H = { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json;charset=utf-8' };
const log = (...a) => console.log(...a);
const get = async (url) => {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${url}\n${(await r.text()).slice(0, 300)}`);
  return r.json();
};

try {
  // 1) organizations (our legal entities) — names to compare with the «Баланс» breakdown.
  const orgs = await get(`${API_BASE}/entity/organization?limit=100`);
  const orgNames = (orgs.rows || []).map((o) => o.name);
  log('ORGANIZATIONS (' + orgNames.length + '):', JSON.stringify(orgNames));

  // 2) find the counterparty «Устасизлар Азизбек» (the one we screenshotted).
  const cps = await get(
    `${API_BASE}/entity/counterparty?limit=5&filter=${encodeURIComponent('name~Устасизлар Азизбек')}`,
  );
  let cp = (cps.rows || [])[0];
  if (!cp) {
    // fallback: a cp that has sales (via a recent customerorder/demand)
    const dem = await get(`${API_BASE}/entity/demand?limit=20&order=moment,desc`);
    const href = (dem.rows || []).find((d) => d.agent?.meta?.href)?.agent?.meta?.href;
    if (href) cp = await get(href);
  }
  if (!cp) throw new Error('no counterparty found');
  const cpId = cp.id;
  log('\nCP:', cp.name, cpId);

  // 3) the single-counterparty report = the «Показатели» panel source.
  const rep = await get(`${API_BASE}/report/counterparty/${cpId}`);
  fs.writeFileSync(path.join(OUT, '02-report-counterparty.json'), JSON.stringify(rep, null, 2));
  log('\nREPORT/COUNTERPARTY keys:', JSON.stringify(Object.keys(rep)));
  // print the scalar metric fields (skip meta/nested)
  for (const [k, v] of Object.entries(rep)) {
    if (v != null && typeof v !== 'object') log('  ', k, '=', v);
  }

  fs.writeFileSync(
    path.join(OUT, '02-organizations.json'),
    JSON.stringify(orgNames, null, 2),
  );
  log('\nDONE →', OUT);
} catch (e) {
  log('ERROR', e.message);
}
