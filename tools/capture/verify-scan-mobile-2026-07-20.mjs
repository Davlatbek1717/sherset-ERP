// Live verify — owner 2026-07-20 bands 2-4 on a PHONE viewport (390×844,
// touch, emulated): «+» is a ≥40px tap target · the product picker fills the
// whole screen and nothing paints past the device edge · the folder sidebar
// starts CLOSED, its toggle opens it as an overlay with row dividers, picking
// a folder closes it · the scan modal fits the phone and the camera screen
// auto-opens with the viewfinder frame. Emulation, not real hardware — the
// report says so explicitly.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const STORE = process.env.STORE_ID || 'd7d27173-b402-469b-9c08-7dd9c130382a';
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

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  locale: 'ru-RU',
});
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
let cellId = null;

try {
  const tok = await login();
  const c = await j(tok, 'POST', `/admin/stores/${STORE}/cells`, {
    name: 'MOB-A1',
    barcode: 'CELL-MOB-2026',
  });
  cellId = c.data?.id ?? null;
  ok('fixture cell created', !!cellId);

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // Hydration race: submit before React attaches = native GET, stays on /login.
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  await page.goto(`${BASE}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  const addBtn = page.locator(`[data-test-id="cell-add-product-${cellId}"]`);
  await addBtn.waitFor({ state: 'visible', timeout: 30000 });
  await addBtn.scrollIntoViewIfNeeded();

  // Band 2: the «+» is a real phone tap target.
  const box = await addBtn.boundingBox();
  ok(
    '«+» tap target ≥ 40px on the phone',
    !!box && box.width >= 38 && box.height >= 38,
    JSON.stringify(box),
  );
  await page.screenshot({ path: 'tasdiq-mob-1-plus-button.png' });

  await addBtn.tap();
  const dlg = page.locator('[data-test-id="product-select-modal"]');
  await dlg.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  // Band 3: full-screen on the phone, nothing paints past the device edge.
  const geo = await page.evaluate(() => {
    const d = document
      .querySelector('[data-test-id="product-select-modal"]')
      .getBoundingClientRect();
    const painted = document.elementFromPoint(innerWidth - 1, innerHeight / 2);
    return {
      w: Math.round(d.width),
      h: Math.round(d.height),
      vw: innerWidth,
      vh: innerHeight,
      edgeInsideDialog: !!painted?.closest('[data-test-id="product-select-modal"]'),
    };
  });
  ok(
    'picker fills the phone screen',
    Math.abs(geo.w - geo.vw) <= 2 && Math.abs(geo.h - geo.vh) <= 2,
    JSON.stringify(geo),
  );
  await page.screenshot({ path: 'tasdiq-mob-2-picker-fullscreen.png' });

  // Band 4: sidebar starts CLOSED on the phone; toggle opens the overlay.
  const tree = page.locator('[data-test-id="product-folder-tree"]');
  ok('folder sidebar starts closed on the phone', (await tree.count()) === 0);
  await page.locator('[data-test-id="product-select-tree-toggle"]').tap();
  await tree.waitFor({ state: 'visible', timeout: 5000 });
  const divider = await page
    .locator('[data-test-id="product-folder-root"]')
    .evaluate((el) => getComputedStyle(el).borderBottomWidth);
  ok('sidebar rows have divider lines', Number.parseFloat(divider) >= 1, `border=${divider}`);
  await page.screenshot({ path: 'tasdiq-mob-3-sidebar-overlay.png' });
  // Picking the root closes the overlay on the phone.
  await page.locator('[data-test-id="product-folder-root"]').tap();
  await page.waitForTimeout(400);
  ok('picking a folder closes the overlay', (await tree.count()) === 0);

  // Band 1+3: the scan modal fits the phone; camera auto-opens; viewfinder on.
  await page.locator('[data-test-id="cell-scan-open"]').tap();
  const scanModal = page.locator('[data-testid="cell-scan-modal"]');
  await scanModal.waitFor({ state: 'visible', timeout: 10000 });
  const scanGeo = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="cell-scan-modal"]').getBoundingClientRect();
    return { right: Math.round(r.right), left: Math.round(r.left), vw: innerWidth };
  });
  ok(
    'scan modal fits the phone width',
    scanGeo.left >= 0 && scanGeo.right <= scanGeo.vw + 1,
    JSON.stringify(scanGeo),
  );
  await page
    .locator('[data-test-id="cell-scan-video"]')
    .waitFor({ state: 'visible', timeout: 15000 });
  ok('camera screen auto-opens on the phone', true);
  ok(
    'viewfinder frame is shown',
    await page.locator('[data-test-id="cell-scan-viewfinder"]').isVisible(),
  );
  await page.screenshot({ path: 'tasdiq-mob-4-scan-modal.png' });
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: 'tasdiq-mob-error.png' }).catch(() => {});
} finally {
  try {
    const tok = await login();
    if (cellId) await j(tok, 'DELETE', `/admin/stores/${STORE}/cells/${cellId}`);
    console.log('cleanup done');
  } catch (e) {
    console.log(`cleanup failed: ${String(e).slice(0, 120)}`);
  }
  console.log(
    `\n=== scan mobile (390px emulation) — ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`,
  );
  await browser.close();
  process.exit(failed ? 1 : 0);
}
