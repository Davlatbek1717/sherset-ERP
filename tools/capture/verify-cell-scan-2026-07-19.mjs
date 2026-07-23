// Live verify — owner 2026-07-20 redesigned two-step cell↔product scan flow.
// Covers: «Scan» button top-right before ✕ · picker table stays INSIDE the
// dialog (no horizontal escape) · modal starts at «№ 1» with empty cards ·
// scanning the shelf label fills card 1 and flips to «№ 2» · first product
// binds straight in · a SECOND product raises the occupied-cell dialog
// («Заменить / Добавить вместе / Отменить») — «add together» keeps both,
// «replace» leaves only the newcomer · unknown code → soft error · /scan
// resolves the cell barcode into the cell + contents. Fixtures cleaned up.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const STORE = process.env.STORE_ID || 'd7d27173-b402-469b-9c08-7dd9c130382a';
const CELL_B = { name: 'SKAN-B2', barcode: 'CELL-B2-2026' };
const P1 = { name: 'Skan Mahsulot Bir', barcode: '2026000000017' };
const P2 = { name: 'Skan Mahsulot Ikki', barcode: '2026000000024' };
const P3 = { name: 'Skan Mahsulot Uch', barcode: '2026000000031' };
const results = [];
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`;
  results.push(line);
  console.log(line);
};

const login = async () =>
  (
    await (
      await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
      })
    ).json()
  ).accessToken;

const j = (tok, method, path, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

// Fake camera: the scanning screen must OPEN BY ITSELF (owner 2026-07-20) —
// headless has no real webcam, Chrome's fake device stands in for it.
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const created = { cells: [], products: [] };

const pollBound = async (tok2, expect) => {
  const end = Date.now() + 12000;
  let items = [];
  while (Date.now() < end) {
    items =
      (await j(tok2, 'GET', `/admin/stores/${STORE}/cells/${created.cells[0]}/products`)).data
        ?.items ?? [];
    if (expect(items)) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  return items;
};

const scan = async (code) => {
  const input = page.locator('[data-test-id="cell-scan-input"]');
  await input.type(code, { delay: 12 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
};

try {
  const tok = await login();
  // ── fixtures ──
  const b = await j(tok, 'POST', `/admin/stores/${STORE}/cells`, CELL_B);
  if (b.data?.id) created.cells.push(b.data.id);
  for (const p of [P1, P2, P3]) {
    const r = await j(tok, 'POST', '/products', { name: p.name, uom: 'шт', barcodes: [p.barcode] });
    if (r.data?.id) created.products.push(r.data.id);
  }
  ok(
    'fixtures: cell + 3 products created',
    created.cells.length === 1 && created.products.length === 3,
  );

  // ── browser ──
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // Hydration race: submit before React attaches = native GET, stays on /login.
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  await page.goto(`${BASE}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-test-id="cell-add-product-${created.cells[0]}"]`, {
    timeout: 30000,
  });
  await page.click(`[data-test-id="cell-add-product-${created.cells[0]}"]`);

  // «Scan» sits top-right, immediately before the ✕.
  const scanBtn = page.locator('[data-test-id="cell-scan-open"]');
  await scanBtn.waitFor({ state: 'visible', timeout: 15000 });
  const pos = await page.evaluate(() => {
    const scanEl = document.querySelector('[data-test-id="cell-scan-open"]');
    const closeEl = document.querySelector('[data-test-id="product-select-close"]');
    const dlg = document.querySelector('[data-test-id="product-select-modal"]');
    const s = scanEl?.getBoundingClientRect();
    const c = closeEl?.getBoundingClientRect();
    const d = dlg?.getBoundingClientRect();
    return { scanRight: s?.right, closeLeft: c?.left, dlgRight: d?.right, scanLeft: s?.left };
  });
  ok(
    '«Scan» is top-right, just before ✕',
    pos.scanRight <= pos.closeLeft + 2 && pos.dlgRight - pos.closeLeft < 80,
    JSON.stringify(pos),
  );
  ok(
    'button label is human text, not a raw i18n key',
    (await scanBtn.textContent())?.trim() === 'Scan',
    await scanBtn.textContent(),
  );

  // Band 2: nothing may PAINT outside the dialog (rects of clipped scroller
  // content legitimately extend — the honest test is what elementFromPoint
  // sees just past the dialog edge: it must be the overlay, never a cell).
  const bounds = await page.evaluate(() => {
    const dlg = document.querySelector('[data-test-id="product-select-modal"]');
    const d = dlg.getBoundingClientRect();
    const probes = [d.top + 60, d.top + 140, d.top + d.height / 2];
    const escapes = probes
      .map((y) => document.elementFromPoint(Math.min(d.right + 20, innerWidth - 2), y))
      .filter((el) => el && dlg.contains(el));
    return { escaped: escapes.length, dlgRight: Math.round(d.right) };
  });
  ok(
    'picker grid does NOT paint outside the dialog (h-scroll inside)',
    bounds.escaped === 0,
    JSON.stringify(bounds),
  );
  await page.screenshot({ path: 'tasdiq-scan2-1-picker.png' });

  // ── the scan modal: starts at № 1 with empty cards ──
  await scanBtn.click();
  const modal = page.locator('[data-testid="cell-scan-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  const step = page.locator('[data-test-id="cell-scan-step"]');
  ok('opens at step «№ 1»', ((await step.textContent()) ?? '').includes('1'));
  // The scanning screen must open BY ITSELF — no extra button press.
  await page.waitForTimeout(1500);
  ok(
    'scanning screen (camera) opens by itself',
    await page.locator('[data-test-id="cell-scan-video"]').isVisible(),
  );
  const cellCard = page.locator('[data-test-id="cell-scan-cell-card"]');
  ok(
    'cards start empty and input is armed without a click',
    ((await cellCard.textContent()) ?? '').includes('—') &&
      (await page
        .locator('[data-test-id="cell-scan-input"]')
        .evaluate((el) => document.activeElement === el)),
  );
  await page.screenshot({ path: 'tasdiq-scan2-2-step1.png' });

  // ── scan the shelf label → card 1 + step № 2 ──
  await scan(CELL_B.barcode);
  ok(
    'cell label fills card 1 and flips to «№ 2»',
    ((await cellCard.textContent()) ?? '').includes(CELL_B.name) &&
      ((await step.textContent()) ?? '').includes('2'),
  );

  // ── first product → binds straight in ──
  await scan(P1.barcode);
  const logText =
    (await page
      .locator('[data-test-id="cell-scan-log"]')
      .textContent()
      .catch(() => '')) ?? '';
  ok('empty cell: first product binds directly', logText.includes(P1.name));
  await page.screenshot({ path: 'tasdiq-scan2-3-first-bound.png' });

  // ── second product → occupied-cell dialog with 3 buttons ──
  await scan(P2.barcode);
  const conflict = page.locator('[data-testid="cell-scan-conflict"]');
  await conflict.waitFor({ state: 'visible', timeout: 15000 });
  const conflictMsg =
    (await page.locator('[data-test-id="cell-scan-conflict-msg"]').textContent()) ?? '';
  ok(
    'occupied cell → dialog names the existing product',
    conflictMsg.includes(P1.name),
    conflictMsg,
  );
  await page.screenshot({ path: 'tasdiq-scan2-4-conflict.png' });

  // «Добавить вместе» → both products in the cell.
  await page.click('[data-test-id="cell-scan-add-together"]');
  const bothItems = await pollBound(tok, (it) => it.length === 2);
  ok("«Birga qo'shish» keeps both products", bothItems.length === 2, `items=${bothItems.length}`);

  // ── third product → dialog → «Заменить» → only the newcomer stays ──
  await scan(P3.barcode);
  await conflict.waitFor({ state: 'visible', timeout: 15000 });
  await page.click('[data-test-id="cell-scan-replace"]');
  const afterReplace = await pollBound(tok, (it) => it.length === 1 && it[0]?.name === P3.name);
  const names = afterReplace.map((x) => x.name);
  ok(
    '«Almashtirish» removes the old ones, binds the new',
    names.length === 1 && names[0] === P3.name,
    JSON.stringify(names),
  );
  await page.screenshot({ path: 'tasdiq-scan2-5-replaced.png' });

  // ── unknown code → soft error ──
  await scan('YOQKOD-404');
  const status = await page
    .locator('[data-test-id="cell-scan-status"]')
    .textContent()
    .catch(() => null);
  ok('unknown code → clear soft error', !!status, JSON.stringify(status));

  // ── /scan page resolves the shelf label ──
  await page.goto(`${BASE}/scan`, { waitUntil: 'domcontentloaded' });
  const scanInput = page.locator('[data-test-id="scan-input"]');
  await scanInput.waitFor({ state: 'visible' });
  await scanInput.type(CELL_B.barcode, { delay: 12 });
  await page.keyboard.press('Enter');
  const panel = page.locator('[data-test-id="scan-cell-panel"]');
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  const panelText = (await panel.textContent()) ?? '';
  ok(
    '/scan: shelf barcode shows the cell + its product',
    panelText.includes(CELL_B.name) && panelText.includes(P3.name),
    JSON.stringify(panelText.slice(0, 120)),
  );
  await page.screenshot({ path: 'tasdiq-scan2-6-scan-page.png' });
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: 'tasdiq-scan2-error.png' }).catch(() => {});
} finally {
  try {
    const tok = await login();
    for (const pid of created.products) {
      await j(tok, 'DELETE', `/admin/stores/${STORE}/cells/${created.cells[0]}/products/${pid}`);
    }
    for (const id of created.cells) {
      const r = await j(tok, 'DELETE', `/admin/stores/${STORE}/cells/${id}`);
      console.log(`cleanup cell ${id} → ${r.status}`);
    }
    for (const pid of created.products) {
      const r = await j(tok, 'DELETE', `/products/${pid}`);
      console.log(`cleanup product → ${r.status}`);
    }
  } catch (e) {
    console.log(`cleanup failed: ${String(e).slice(0, 120)}`);
  }
  console.log(
    `\n=== cell-scan v2 — ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`,
  );
  await browser.close();
  process.exit(failed ? 1 : 0);
}
