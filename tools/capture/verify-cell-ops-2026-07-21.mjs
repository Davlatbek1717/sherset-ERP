// Live verify — owner 2026-07-21 cell-ops task (3 bands, NO deploy):
//   Band 1: occupied-cell dialog has NO «Almashtirish» — only «Birga qo'shish».
//   Band 2: «Sanash» — scan cell → cards → qty input gating → save writes count.
//   Band 3: «Ko'rish» rich rows (qty/image/description) + «Ko'chirish» modal
//           (search, checkbox single-select blue, move + success message).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const SHOT = (n) =>
  `C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/ecd49c65-6131-411b-88bd-e39b0aeb9ede/scratchpad/cellops-${n}.png`;
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

const stores = await apiCall('GET', '/admin/stores?limit=10', token);
const store = (stores.json?.items ?? stores.json ?? [])[0];
const storeId = store?.id;
const mkCell = async (name, barcode) =>
  (await apiCall('POST', `/admin/stores/${storeId}/cells`, token, { name, barcode })).json?.id;
const cell1 = await mkCell('TEST-OPS-01', 'OPSCELL111');
const cell2 = await mkCell('TEST-OPS-02', 'OPSCELL222');
const prods = await apiCall('GET', '/products?limit=10', token);
const withId = (prods.json?.items ?? [])
  .map((p) => ({ p, code: p.barcodes?.[0] ?? p.packBarcodes?.[0] ?? p.code ?? p.article }))
  .filter((x) => x.code);
const [A, B] = withId;
console.log(`seed: store=${store?.name} cells=${cell1},${cell2} A=${A?.p.name} B=${B?.p.name}`);
if (!storeId || !cell1 || !cell2 || !A || !B) {
  console.log('SEED FAIL');
  process.exit(1);
}
// Bind product A to cell1 (the Sanash/Ko'rish/Ko'chirish subject).
await apiCall('POST', `/admin/stores/${storeId}/cells/${cell1}/products`, token, {
  productIds: [A.p.id],
});

const cellStock = async (cid) =>
  (await apiCall('GET', `/admin/stores/${storeId}/cells/${cid}/stock`, token)).json?.items ?? [];
const cellBound = async (cid) =>
  (await apiCall('GET', `/admin/stores/${storeId}/cells/${cid}/products`, token)).json?.items ??
  [];

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

  // ════ BAND 2 — «Sanash» ════
  const countBtn = page.locator('[data-test-id="cell-count-open"]');
  ok('B2: Sanash button next to Scan', (await countBtn.count()) === 1);
  await countBtn.click();
  const countModal = page.locator('[data-testid="cell-count-modal"]');
  await countModal.waitFor({ state: 'visible', timeout: 8000 });
  const qtyInput = page.locator('[data-test-id="cell-count-qty"]');
  ok('B2: qty input disabled before any cell/product', await qtyInput.isDisabled());
  const cInput = page.locator('[data-test-id="cell-count-input"]');
  await cInput.fill('OPSCELL111');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const card = page.locator(`[data-test-id="cell-count-card-${A.p.id}"]`);
  ok('B2: scanned cell shows its product card', (await card.count()) === 1);
  ok(
    'B2: single product AUTO-selected (blue)',
    (await card.getAttribute('data-selected')) === 'true',
  );
  ok('B2: qty input ENABLED after selection', !(await qtyInput.isDisabled()));
  await page.screenshot({ path: SHOT('b2-1-card-selected') });
  await qtyInput.fill('30');
  await page.click('[data-test-id="cell-count-save"]');
  await page.waitForTimeout(1200);
  ok('B2: modal closes on save', !(await countModal.isVisible().catch(() => false)));
  const s1 = await cellStock(cell1);
  ok(
    'B2: count 30 SAVED for the product',
    s1.some((i) => i.assortmentId === A.p.id && Number(i.qty) === 30),
    JSON.stringify(s1.map((i) => ({ n: i.name, q: i.qty }))),
  );

  // ════ BAND 3a — «Ko'rish» ════
  const viewBtn = page.locator(`[data-test-id="cell-view-${cell1}"]`);
  ok('B3a: Ko\'rish button on the cell row', (await viewBtn.count()) === 1);
  await viewBtn.click();
  const contents = page.locator('[data-testid="cell-contents-modal"]');
  await contents.waitFor({ state: 'visible', timeout: 8000 });
  const row = page.locator('[data-test-id="cell-contents-row"]');
  ok('B3a: big product row renders', (await row.count()) === 1);
  const qtyCell = await page
    .locator(`[data-test-id="cell-contents-qty-${A.p.id}"]`)
    .textContent();
  ok('B3a: row shows the counted qty 30', (qtyCell ?? '').trim() === '30', `"${qtyCell}"`);
  ok(
    'B3a: row has image or initial avatar',
    (await row.locator('img, span.flex.h-12').count()) >= 1,
  );
  await page.screenshot({ path: SHOT('b3a-contents') });

  // ════ BAND 3b — «Ko'chirish» ════
  await page.click(`[data-test-id="cell-contents-move-${A.p.id}"]`);
  const moveModal = page.locator('[data-testid="cell-move-modal"]');
  await moveModal.waitFor({ state: 'visible', timeout: 8000 });
  ok(
    'B3b: move modal lists other cells with checkboxes',
    (await page.locator('[data-test-id^="cell-move-row-"]').count()) >= 1,
  );
  // search filters (type part of the target's code)
  await page.fill('[data-test-id="cell-move-search"]', '222');
  await page.waitForTimeout(400);
  const targetRow = page.locator(`[data-test-id="cell-move-row-${cell2}"]`);
  ok('B3b: search narrows to the matching cell', (await targetRow.count()) === 1);
  // checkbox select → blue highlight
  await targetRow.locator('button[role="checkbox"]').click();
  await page.waitForTimeout(300);
  ok(
    'B3b: selected row highlights (blue)',
    (await targetRow.getAttribute('data-selected')) === 'true',
  );
  await page.screenshot({ path: SHOT('b3b-1-target-selected') });
  await page.click('[data-test-id="cell-move-confirm"]');
  await page.waitForTimeout(1800);
  const notice = (await page
    .locator('[data-test-id="cell-contents-notice"]')
    .textContent()
    .catch(() => '')) ?? '';
  ok(
    'B3b: success message «…ko\'chirildi» shown',
    notice.includes('TEST-OPS-02'),
    notice.trim().slice(0, 80),
  );
  const s2 = await cellStock(cell2);
  const b2 = await cellBound(cell2);
  const s1after = await cellStock(cell1);
  ok(
    'B3b: qty 30 MOVED to target cell',
    s2.some((i) => i.assortmentId === A.p.id && Number(i.qty) === 30),
  );
  ok('B3b: binding followed to target', b2.some((x) => x.id === A.p.id));
  ok(
    'B3b: source cell is now empty',
    !s1after.some((i) => i.assortmentId === A.p.id && Number(i.qty) > 0),
  );
  await page.screenshot({ path: SHOT('b3b-2-moved') });
  // close contents modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ════ BAND 1 — occupied-cell dialog WITHOUT «Almashtirish» ════
  await page.click('[data-test-id="cell-scan-open"]');
  const scanModal = page.locator('[data-testid="cell-scan-modal"]');
  await scanModal.waitFor({ state: 'visible', timeout: 8000 });
  const sInput = page.locator('[data-test-id="cell-scan-input"]');
  await sInput.fill('OPSCELL222'); // cell2 now holds product A
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await sInput.fill(String(B.code)); // different product → conflict dialog
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  const conflict = page.locator('[data-testid="cell-scan-conflict"]');
  ok('B1: occupied-cell dialog opens', await conflict.isVisible());
  ok(
    'B1: NO «Almashtirish» button',
    (await page.locator('[data-test-id="cell-scan-replace"]').count()) === 0,
  );
  ok(
    'B1: «Birga qo\'shish» present',
    (await page.locator('[data-test-id="cell-scan-add-together"]').count()) === 1,
  );
  await page.screenshot({ path: SHOT('b1-conflict-no-replace') });
  await page.click('[data-test-id="cell-scan-conflict-cancel"]');
  await page.waitForTimeout(300);
  await page.click('[data-test-id="cell-scan-cancel"]'); // discard, nothing saved
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT('error') }).catch(() => {});
} finally {
  // cleanup: zero counts, unbind, delete test cells
  for (const cid of [cell1, cell2]) {
    for (const i of await cellStock(cid).catch(() => [])) {
      if (i.assortmentKind === 'product' && Number(i.qty) > 0) {
        await apiCall('PUT', `/admin/stores/${storeId}/cells/${cid}/stock`, token, {
          assortmentId: i.assortmentId,
          qty: '0',
        });
      }
    }
    for (const x of await cellBound(cid).catch(() => [])) {
      await apiCall('DELETE', `/admin/stores/${storeId}/cells/${cid}/products/${x.id}`, token);
    }
    await apiCall('DELETE', `/admin/stores/${storeId}/cells/${cid}`, token).catch(() => {});
  }
  console.log('\n=== RESULTS ===');
  console.log(results.join('\n'));
  await browser.close();
}
