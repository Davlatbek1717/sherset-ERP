// LIVE BROWSER CERT — warehouse card «Адресное хранение товаров» UI (phase 2).
// Creates a throwaway store via API, opens /settings/stores/<id>, exercises the
// Зоны + Ячейки tables (render · add zone · add cell-in-zone · inline rename ·
// delete cell · delete zone), checks 0 console errors, then deletes the store
// (cascade cleanup). Demo creds admin@demo.local/admin123 are PUBLIC.
import { chromium } from 'playwright';

const WEB = process.env.WEB || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => {
  out.steps.push(`OK  ${m}`);
  console.log('  ✓', m);
};
const bad = (m) => {
  out.steps.push(`BAD ${m}`);
  console.log('  ✗', m);
};

async function apiLogin() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
  });
  const j = await r.json();
  return j.accessToken || j.token || j.access_token;
}
const authH = (token) => ({ Authorization: `Bearer ${token}` });
async function apiCreateStore(token, name) {
  const r = await fetch(`${API}/admin/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authH(token) },
    body: JSON.stringify({ name }),
  });
  return (await r.json()).id;
}
async function apiSnapshot(token, id) {
  return fetch(`${API}/admin/stores/${id}/address-storage`, { headers: authH(token) }).then((r) =>
    r.json(),
  );
}
async function apiDeleteStore(token, id) {
  await fetch(`${API}/admin/stores/${id}`, { method: 'DELETE', headers: authH(token) });
}

const token = await apiLogin();
if (!token) {
  console.log('API login failed');
  process.exit(2);
}
const storeId = await apiCreateStore(token, `ЦЕРТ-UI ${Date.now()}`);
ok(`throwaway store ${storeId}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
// Warm up the route so the fresh `next dev` compiles it before the browser
// navigates (first-compile of a heavy route can exceed the nav timeout).
await fetch(`${WEB}/settings/stores/${storeId}`).catch(() => {});

const page = await ctx.newPage();
page.setDefaultTimeout(90000);
page.setDefaultNavigationTimeout(180000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

try {
  // ---- login ----
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await page.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
    });
  ok('logged in');

  // ---- open the store card ----
  await page.goto(`${WEB}/settings/stores/${storeId}`, { waitUntil: 'domcontentloaded' });
  const section = page.locator('[data-test-id="address-storage"]');
  await section.waitFor({ timeout: 90000 });
  ok('«Адресное хранение» section renders');

  const bodyText = await section.innerText();
  if (/Зона/.test(bodyText) && /Ячейка/.test(bodyText) && !/address_storage\./.test(bodyText)) {
    ok('headers «Зона»/«Ячейка» i18n resolved (not raw keys)');
  } else {
    bad(`headers missing or raw key: ${bodyText.slice(0, 120)}`);
  }
  if (/Без зоны хранения/.test(bodyText)) ok('«Без зоны хранения» bucket row present');
  else bad('no «Без зоны хранения» row');

  // ---- add a zone ----
  await page.locator('[data-test-id="new-zone-name"]').fill('Зона-Ц');
  await page.locator('[data-test-id="add-zone"]').click();
  await page.waitForTimeout(1800);
  let zoneRows = await page.locator('[data-test-id^="zone-row-"]').count();
  if (zoneRows >= 1) ok(`zone added (rows=${zoneRows})`);
  else bad('zone not added');

  // ---- add a cell in that zone ----
  await page.locator('[data-test-id="new-cell-name"]').fill('Я-1');
  await page.locator('[data-test-id="new-cell-zone"]').selectOption({ label: 'Зона-Ц' }).catch(() => {});
  await page.locator('[data-test-id="add-cell"]').click();
  await page.waitForTimeout(1800);
  let cellRows = await page.locator('[data-test-id^="cell-row-"]').count();
  if (cellRows >= 1) ok(`cell added (rows=${cellRows})`);
  else bad('cell not added');

  // ---- API confirms the cell is wired to the zone (cellCount = 1) ----
  const snap1 = await apiSnapshot(token, storeId);
  const z1 = snap1.zones[0];
  if (z1 && z1.cellCount === 1) ok('zone «Всего ячеек» = 1 (cell wired to zone)');
  else bad(`zone cellCount expected 1, got ${z1?.cellCount}`);

  // ---- inline rename the zone ----
  const zoneNameInput = page.locator('[data-test-id^="zone-name-"]').first();
  await zoneNameInput.fill('Зона-Ц2');
  await zoneNameInput.press('Enter');
  await page.waitForTimeout(1500);
  const snap2 = await apiSnapshot(token, storeId);
  if (snap2.zones[0]?.name === 'Зона-Ц2') ok('inline rename persisted (Зона-Ц → Зона-Ц2)');
  else bad(`rename not persisted, got ${snap2.zones[0]?.name}`);

  // ---- delete the cell ----
  await page.locator('[data-test-id^="cell-del-"]').first().click();
  await page.waitForTimeout(1500);
  cellRows = await page.locator('[data-test-id^="cell-row-"]').count();
  if (cellRows === 0) ok('cell deleted');
  else bad(`cell not deleted (rows=${cellRows})`);

  // ---- delete the zone ----
  await page.locator('[data-test-id^="zone-del-"]').first().click();
  await page.waitForTimeout(1500);
  zoneRows = await page.locator('[data-test-id^="zone-row-"]').count();
  if (zoneRows === 0) ok('zone deleted');
  else bad(`zone not deleted (rows=${zoneRows})`);

  await page
    .screenshot({ path: 'D:/projects/moysklad/docs/audits/cell-storage-2026-06-26/ours-card-ui.png', fullPage: true })
    .catch(() => {});

  const snap3 = await apiSnapshot(token, storeId);
  if (snap3.zones.length === 0 && snap3.cells.length === 0) ok('API confirms 0 zones/cells after UI deletes');
  else bad(`leftover: z=${snap3.zones.length} c=${snap3.cells.length}`);

  if (out.consoleErrors.length === 0) ok('0 console errors');
  else bad(`${out.consoleErrors.length} console errors: ${out.consoleErrors.join(' | ').slice(0, 300)}`);
} catch (e) {
  bad(`EXCEPTION ${e.message}`);
} finally {
  await browser.close();
  await apiDeleteStore(token, storeId).catch(() => {});
  const okN = out.steps.filter((s) => s.startsWith('OK')).length;
  const badN = out.steps.filter((s) => s.startsWith('BAD')).length;
  console.log(`\nRESULT: ${okN} ok, ${badN} bad`);
  process.exit(badN ? 1 : 0);
}
