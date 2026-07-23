// LIVE BROWSER smoke — the «Ячейка» CellPickerField renders + opens + selects in
// a real document editor. Creates a draft Enter (product, no cell) via API, opens
// /enters/<id>, finds the cell-picker trigger in the position row, opens the panel
// (Все ячейки / С этим товаром tabs), picks a cell, asserts the trigger shows the
// «Зона / Ячейка» label. Checks 0 console errors. Cleans up via API.
import { chromium } from 'playwright';
const WEB = process.env.WEB || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const out = { steps: [], consoleErrors: [] };
const ok = (m, c, e = '') => {
  c ? out.steps.push(`OK  ${m}${e ? ` (${e})` : ''}`) : out.steps.push(`BAD ${m}${e ? ` (${e})` : ''}`);
  console.log(`  ${c ? '✓' : '✗'} ${m}${e ? ` — ${e}` : ''}`);
};
let token = '';
async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { status: r.status, json: j };
}

token = (await api('POST', '/auth/login', { email: 'admin@demo.local', password: 'admin123' })).json?.accessToken;
const orgId = (await api('GET', '/organizations?limit=1')).json?.items?.[0]?.id;
const productId = (await api('GET', '/products?limit=1')).json?.items?.[0]?.id;
const storeId = (await api('POST', '/admin/stores', { name: `ЦЕРТ-pickerui ${Date.now()}` })).json?.id;
const zoneId = (await api('POST', `/admin/stores/${storeId}/zones`, { name: 'Зона P' })).json?.id;
await api('POST', `/admin/stores/${storeId}/cells`, { name: 'P-1', zoneId });
await api('POST', `/admin/stores/${storeId}/cells`, { name: 'P-2', zoneId });
const enterId = (await api('POST', '/enters', {
  organizationId: orgId,
  storeId,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: '4', costMinor: '30000' }],
})).json?.id;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(90000);
page.setDefaultNavigationTimeout(180000);
page.on('console', (m) => m.type() === 'error' && out.consoleErrors.push(m.text().slice(0, 200)));
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));
try {
  await fetch(`${WEB}/enters/${enterId}`).catch(() => {}); // warm compile
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await page.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
  ok('logged in', true);

  await page.goto(`${WEB}/enters/${enterId}`, { waitUntil: 'domcontentloaded' });
  const trigger = page.locator('[data-test-id="cell-picker-trigger"]').first();
  await trigger.waitFor({ timeout: 90000 });
  ok('cell-picker trigger renders in the position row', true);

  await trigger.click();
  const panel = page.locator('[data-test-id="cell-picker-panel"]').first();
  await panel.waitFor({ timeout: 15000 });
  ok('panel opens', true);
  const panelText = await panel.innerText();
  ok('2 tabs «Все ячейки» / «С этим товаром»', /Все ячейки/.test(panelText) && /С этим товаром/.test(panelText));
  const opt = page.locator('[data-test-id^="cell-opt-"]').filter({ hasText: 'P-1' }).first();
  await opt.click();
  await page.waitForTimeout(800);
  const label = await trigger.innerText();
  ok('picking a cell sets the «Зона / Ячейка» label', /Зона P\s*\/\s*P-1/.test(label), label.trim());

  ok('0 console errors', out.consoleErrors.length === 0, out.consoleErrors.join(' | ').slice(0, 200));
} catch (e) {
  ok('EXCEPTION', false, e.message);
} finally {
  await browser.close();
  // cleanup: delete the draft enter (drafts are deletable) then the store
  await api('DELETE', `/enters/${enterId}`).catch(() => {});
  await api('DELETE', `/admin/stores/${storeId}`).catch(() => {});
  const bad = out.steps.filter((s) => s.startsWith('BAD')).length;
  console.log(`\nRESULT: ${out.steps.filter((s) => s.startsWith('OK')).length} ok, ${bad} bad`);
  process.exit(bad ? 1 : 0);
}
