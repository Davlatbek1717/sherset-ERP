// LIVE API cert — warehouse address storage (Зоны + Ячейки) CRUD round-trip.
// Creates a throwaway store, exercises every zone/cell endpoint + the guards,
// then deletes the store (cascade drops its zones/cells) → self-cleaning.
// Run: node scripts/cert-store-cells-2026-06-26.mjs   (API must be on :4000)
const BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const EMAIL = 'admin@demo.local';
const PASSWORD = 'admin123';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

let token = '';
async function api(method, path, body, expect) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (expect !== undefined && res.status !== expect) {
    console.log(`    ! ${method} ${path} → ${res.status} (wanted ${expect}): ${JSON.stringify(json)?.slice(0, 160)}`);
  }
  return { status: res.status, json };
}

const BOGUS = '00000000-0000-0000-0000-0000000000ff';
let storeId = '';

try {
  // ---- login ----
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.json?.accessToken || login.json?.token || login.json?.access_token || '';
  ok('login → token', !!token);
  if (!token) throw new Error('no token');

  // ---- create a throwaway store ----
  const mk = await api('POST', '/admin/stores', { name: `ЦЕРТ-ячейка ${Date.now()}` }, 201);
  storeId = mk.json?.id || '';
  ok('create throwaway store', !!storeId, storeId);
  if (!storeId) throw new Error('no store');

  // ---- empty snapshot ----
  const empty = await api('GET', `/admin/stores/${storeId}/address-storage`, undefined, 200);
  if (empty.status === 404) {
    console.log('\n  ⚠ /address-storage 404 — the running API is STALE (no new routes). Restart `pnpm dev` / fresh api.');
  }
  ok('GET address-storage (empty)', empty.status === 200 && Array.isArray(empty.json?.zones) && empty.json.zones.length === 0 && empty.json.cells.length === 0);

  // ---- zones ----
  const zA = await api('POST', `/admin/stores/${storeId}/zones`, { name: 'Зона A' }, 201);
  ok('create zone A', zA.status === 201 && !!zA.json?.id);
  const zB = await api('POST', `/admin/stores/${storeId}/zones`, { name: 'Зона B' }, 201);
  ok('create zone B', zB.status === 201 && !!zB.json?.id);
  const zDup = await api('POST', `/admin/stores/${storeId}/zones`, { name: 'Зона A' }, 400);
  ok('duplicate zone name → 400', zDup.status === 400);
  const zEmpty = await api('POST', `/admin/stores/${storeId}/zones`, { name: '   ' }, 400);
  ok('empty zone name → 400', zEmpty.status === 400);

  // ---- cells ----
  const c1 = await api('POST', `/admin/stores/${storeId}/cells`, { name: '1', zoneId: zA.json.id, barcode: '4780000000001' }, 201);
  ok('create cell 1 (in zone A, with barcode)', c1.status === 201 && c1.json?.zoneId === zA.json.id && c1.json?.barcode === '4780000000001');
  const c2 = await api('POST', `/admin/stores/${storeId}/cells`, { name: '2' }, 201);
  ok('create cell 2 (no zone = Без зоны)', c2.status === 201 && c2.json?.zoneId === null);
  const cDup = await api('POST', `/admin/stores/${storeId}/cells`, { name: '1' }, 400);
  ok('duplicate cell name → 400', cDup.status === 400);
  const cBadZone = await api('POST', `/admin/stores/${storeId}/cells`, { name: '3', zoneId: BOGUS }, 400);
  ok('cell with foreign/bogus zoneId → 400', cBadZone.status === 400);

  // ---- snapshot with counts + zoneName ----
  const snap = await api('GET', `/admin/stores/${storeId}/address-storage`, undefined, 200);
  const zoneA = snap.json?.zones?.find((z) => z.id === zA.json.id);
  const zoneB = snap.json?.zones?.find((z) => z.id === zB.json.id);
  ok('snapshot: 2 zones, 2 cells', snap.json?.zones?.length === 2 && snap.json?.cells?.length === 2);
  ok('zone A cellCount = 1', zoneA?.cellCount === 1, `got ${zoneA?.cellCount}`);
  ok('zone B cellCount = 0', zoneB?.cellCount === 0, `got ${zoneB?.cellCount}`);
  const cell1 = snap.json?.cells?.find((c) => c.id === c1.json.id);
  const cell2 = snap.json?.cells?.find((c) => c.id === c2.json.id);
  ok('cell 1 zoneName = «Зона A»', cell1?.zoneName === 'Зона A', `got ${cell1?.zoneName}`);
  ok('cell 2 zoneName = null (no zone)', cell2?.zoneName === null);

  // ---- reassign / rename ----
  const reassign = await api('PATCH', `/admin/stores/${storeId}/cells/${c2.json.id}`, { zoneId: zB.json.id }, 200);
  ok('reassign cell 2 → zone B', reassign.status === 200 && reassign.json?.zoneId === zB.json.id);
  const unassign = await api('PATCH', `/admin/stores/${storeId}/cells/${c2.json.id}`, { zoneId: null }, 200);
  ok('unassign cell 2 (zoneId=null)', unassign.status === 200 && unassign.json?.zoneId === null);
  const rename = await api('PATCH', `/admin/stores/${storeId}/zones/${zA.json.id}`, { name: 'Зона A1' }, 200);
  ok('rename zone A → «Зона A1»', rename.status === 200 && rename.json?.name === 'Зона A1');

  // ---- delete zone A → cell 1 SetNull (not deleted) ----
  const delZ = await api('DELETE', `/admin/stores/${storeId}/zones/${zA.json.id}`, undefined, 200);
  ok('delete zone A', delZ.status === 200);
  const snap2 = await api('GET', `/admin/stores/${storeId}/address-storage`, undefined, 200);
  ok('after zone-delete: 1 zone left', snap2.json?.zones?.length === 1 && snap2.json.zones[0].id === zB.json.id);
  const cell1after = snap2.json?.cells?.find((c) => c.id === c1.json.id);
  ok('cell 1 survives, now zoneless (SetNull)', !!cell1after && cell1after.zoneId === null);

  // ---- delete a cell ----
  const delC = await api('DELETE', `/admin/stores/${storeId}/cells/${c1.json.id}`, undefined, 200);
  ok('delete cell 1', delC.status === 200);

  // ---- tenant / not-found guards ----
  const ghostGet = await api('GET', `/admin/stores/${BOGUS}/address-storage`, undefined, 404);
  ok('address-storage on bogus store → 404', ghostGet.status === 404);
  const ghostZone = await api('POST', `/admin/stores/${BOGUS}/zones`, { name: 'X' }, 404);
  ok('create zone on bogus store → 404', ghostZone.status === 404);
  const ghostCellPatch = await api('PATCH', `/admin/stores/${storeId}/cells/${BOGUS}`, { name: 'X' }, 404);
  ok('patch non-existent cell → 404', ghostCellPatch.status === 404);

  // ---- cleanup: delete the throwaway store (cascade drops remaining zone+cell) ----
  const delStore = await api('DELETE', `/admin/stores/${storeId}`, undefined, 200);
  ok('delete throwaway store (cascade cleanup)', delStore.status === 200);
  storeId = '';
} catch (e) {
  console.log('  ✗ EXCEPTION', e.message);
  fail++;
} finally {
  // safety net: if we bailed mid-run, still try to remove the throwaway store
  if (storeId && token) {
    await api('DELETE', `/admin/stores/${storeId}`).catch(() => {});
    console.log(`  (cleaned up leftover store ${storeId})`);
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
