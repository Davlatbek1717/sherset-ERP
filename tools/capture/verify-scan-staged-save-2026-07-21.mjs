// Live verify — scan window per owner 2026-07-21 final spec:
//   BIG «Scan» button top-right of the address-storage section (NOT inside the
//   per-cell product-add modal); free flow — scan any cell, then products,
//   switch cells mid-run; staged list; «Saqlash (N)» commits each row to ITS
//   cell; «Bekor qilish» discards; failures name their cause.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const SHOT = (n) =>
  `C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/ecd49c65-6131-411b-88bd-e39b0aeb9ede/scratchpad/scanstage-${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

async function apiCall(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

const login = await apiCall('POST', '/auth/login', null, {
  email: 'admin@demo.local',
  password: 'admin123',
});
const token = login.json?.accessToken;
if (!token) {
  console.log('LOGIN FAIL');
  process.exit(1);
}

// Seed: store + TWO test cells + two scannable products.
const stores = await apiCall('GET', '/admin/stores?limit=10', token);
const store = (stores.json?.items ?? stores.json ?? [])[0];
const storeId = store?.id;
const mkCell = async (name, barcode) =>
  (await apiCall('POST', `/admin/stores/${storeId}/cells`, token, { name, barcode })).json?.id;
const cell1 = await mkCell('TEST-SKAN-01', 'TESTCELL777');
const cell2 = await mkCell('TEST-SKAN-02', 'TESTCELL888');
const prods = await apiCall('GET', '/products?limit=10', token);
const withId = (prods.json?.items ?? [])
  .map((p) => ({ p, code: p.barcodes?.[0] ?? p.packBarcodes?.[0] ?? p.code ?? p.article }))
  .filter((x) => x.code);
const [A, B] = withId;
console.log(
  `seed: store=${store?.name} cells=${cell1},${cell2} A=${A?.p.name}(${A?.code}) B=${B?.p.name}(${B?.code})`,
);
if (!storeId || !cell1 || !cell2 || !A || !B) {
  console.log('SEED FAIL');
  process.exit(1);
}

const cellProducts = async (cid) =>
  (await apiCall('GET', `/admin/stores/${storeId}/cells/${cid}/products`, token)).json?.items ?? [];
const unbindAll = async (cid) => {
  for (const x of await cellProducts(cid)) {
    await apiCall('DELETE', `/admin/stores/${storeId}/cells/${cid}/products/${x.id}`, token);
  }
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

try {
  await page.goto(`${BASE}/stores/${storeId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}/stores/${storeId}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2500);

  // ── the BIG button sits on the page itself (top-right of the section) ──
  const openBtn = page.locator('[data-test-id="cell-scan-open"]');
  ok('Scan button on the store card (single, direct)', (await openBtn.count()) === 1);
  const box = await openBtn.boundingBox();
  ok('Scan button is the bigger size (h≥38px)', (box?.height ?? 0) >= 38, `h=${box?.height}`);
  await page.screenshot({ path: SHOT('0-button-top-right') });

  await openBtn.click();
  const modal = page.locator('[data-testid="cell-scan-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 8000 });
  const saveBtn = page.locator('[data-test-id="cell-scan-save"]');
  const input = page.locator('[data-test-id="cell-scan-input"]');
  const rows = page.locator('[data-test-id="cell-scan-log"] li');

  const scan = async (code) => {
    await input.fill(String(code));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
  };

  // ── free flow: cell1 → product A, then SWITCH to cell2 → product B ──
  await scan('TESTCELL777');
  await scan(A.code);
  ok('A staged to cell 1', (await rows.count()) === 1);
  await scan('TESTCELL888'); // mid-run cell switch — no obstacle
  await scan(B.code);
  ok('B staged to cell 2 (mid-run switch works)', (await rows.count()) === 2);
  ok('Saqlash shows (2)', ((await saveBtn.textContent()) ?? '').includes('(2)'));
  ok(
    'DB still EMPTY before save',
    (await cellProducts(cell1)).length === 0 && (await cellProducts(cell2)).length === 0,
  );
  await page.screenshot({ path: SHOT('1-two-cells-staged') });

  // ── Save → each row lands in ITS OWN cell ──
  await saveBtn.click();
  await page.waitForTimeout(1800);
  const in1 = await cellProducts(cell1);
  const in2 = await cellProducts(cell2);
  ok('A saved into cell 1', in1.some((x) => x.id === A.p.id), JSON.stringify(in1.map((x) => x.name)));
  ok('B saved into cell 2', in2.some((x) => x.id === B.p.id), JSON.stringify(in2.map((x) => x.name)));
  ok('pending list cleared after save', (await rows.count()) === 0);
  await page.screenshot({ path: SHOT('2-saved-two-cells') });

  // ── modal state survives the save (no reload): cell card still shows cell2 ──
  const cellCard = (await page
    .locator('[data-test-id="cell-scan-cell-card"]')
    .textContent()) ?? '';
  ok('modal did NOT reset after save (cell kept)', cellCard.includes('TEST-SKAN-02'), cellCard.trim().slice(0, 40));

  // ── Cancel path: unbind, stage again, Bekor → DB untouched ──
  await unbindAll(cell1);
  await unbindAll(cell2);
  await scan(A.code); // cell2 still current
  ok('re-scan stages again', (await rows.count()) === 1);
  await page.click('[data-test-id="cell-scan-cancel"]');
  await page.waitForTimeout(600);
  ok('Bekor qilish closes the modal', !(await modal.isVisible().catch(() => false)));
  ok(
    'DB untouched after cancel',
    (await cellProducts(cell1)).length === 0 && (await cellProducts(cell2)).length === 0,
  );
  await page.screenshot({ path: SHOT('3-cancelled') });
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT('error') }).catch(() => {});
} finally {
  await unbindAll(cell1).catch(() => {});
  await unbindAll(cell2).catch(() => {});
  await apiCall('DELETE', `/admin/stores/${storeId}/cells/${cell1}`, token).catch(() => {});
  await apiCall('DELETE', `/admin/stores/${storeId}/cells/${cell2}`, token).catch(() => {});
  console.log('\n=== RESULTS ===');
  console.log(results.join('\n'));
  await browser.close();
}
