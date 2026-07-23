// CERT — /payments column-settings ⚙ now lists all 30 moysklad options (was 16).
// Opens the gear, counts toggles, asserts the 14 new keys present, toggles two new
// data-backed columns ON and confirms they render as table headers. 0 console errors
// (esp. no MISSING_MESSAGE). Read-only (no doc writes). User dev server :3100.
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3100';
const OUT = resolve('D:/projects/moysklad/docs/audits/payments-columns-2026-06-28');
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);
const sel = (tid) => `[data-test-id="${tid}"], [data-testid="${tid}"]`;

const b = await chromium.launch({ headless: true });
const page = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 160));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 160)}`));

// the 14 newly-added column keys
const NEW_KEYS = [
  'accrualDate', 'linked', 'notLinked', 'expenseItem', 'incomingNumber', 'incomingDate',
  'project', 'contract', 'salesChannel', 'shared', 'ownerGroup', 'ownerEmployee',
  'updatedWhen', 'modifiedBy',
];

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 }).catch(() => {});
    });
  ok('logged in');

  await page.goto(`${BASE}/payments`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('column-customizer-trigger')).waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  ok('/payments renders');

  // open the gear
  await page.locator(sel('column-customizer-trigger')).click().catch(() => {});
  await page.locator(sel('column-customizer-panel')).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  const toggleCount = await page.locator('[data-test-id^="column-toggle-"]').count();
  out.toggleCount = toggleCount;
  if (toggleCount === 30) ok(`⚙ lists ${toggleCount} column options (moysklad = 30)`);
  else bad(`⚙ lists ${toggleCount} options (expected 30)`);

  // assert each new key is present in the gear
  let missing = [];
  for (const k of NEW_KEYS) {
    if ((await page.locator(sel(`column-toggle-${k}`)).count()) === 0) missing.push(k);
  }
  if (missing.length === 0) ok(`all 14 new column options present in ⚙`);
  else bad(`missing column options: ${missing.join(', ')}`);

  // rows-per-page present
  if ((await page.locator(sel('rows-per-page-25')).count()) >= 1) ok('«Количество строк» 25/50/100 present');
  else bad('rows-per-page selector missing');

  await page.screenshot({ path: resolve(OUT, 'our-columns-gear.png') });

  // toggle TWO data-backed new columns ON (Проект + Привязано) and confirm headers
  for (const k of ['project', 'linked']) {
    await page.locator(sel(`column-toggle-${k}`)).click().catch(() => {});
    await page.waitForTimeout(300);
  }
  // close gear
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (body.includes('Проект')) ok('toggled «Проект» → header visible in table');
  else bad('«Проект» header not visible after toggle');
  if (body.includes('Привязано')) ok('toggled «Привязано» → header visible in table');
  else bad('«Привязано» header not visible after toggle');

  await page.screenshot({ path: resolve(OUT, 'our-columns-toggled.png') });
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await b.close();
}
out.consoleErrorCount = out.consoleErrors.length;
out.consoleSample = out.consoleErrors.slice(0, 4);
out.pass = out.steps.filter((s) => s.startsWith('OK')).length;
out.fail = out.steps.filter((s) => s.startsWith('BAD')).length;
console.log(JSON.stringify(out, null, 2));
