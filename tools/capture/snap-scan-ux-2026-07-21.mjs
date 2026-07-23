/** One-off: screenshot the scan modal after a cell read — banner + stepper +
 * card ring visible (owner 2026-07-21 UX report). */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const STORE = process.env.STORE_ID || 'd7d27173-b402-469b-9c08-7dd9c130382a';

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

const tok = await login();
const cellRes = await j(tok, 'POST', `/admin/stores/${STORE}/cells`, {
  name: 'UX-SNAP',
  barcode: 'UX-SNAP-01',
});
const cellId = cellRes.data?.id;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  await page.goto(`${BASE}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-test-id="cell-add-product-${cellId}"]`, { timeout: 30000 });
  await page.click(`[data-test-id="cell-add-product-${cellId}"]`);
  await page.waitForSelector('[data-test-id="cell-scan-open"]', { timeout: 15000 });
  await page.click('[data-test-id="cell-scan-open"]');
  await page.waitForSelector('[data-testid="cell-scan-modal"]', { timeout: 10000 });
  await page.screenshot({ path: 'tasdiq-ux-1-step1.png' });
  await page.fill('[data-test-id="cell-scan-input"]', 'UX-SNAP-01');
  await page.press('[data-test-id="cell-scan-input"]', 'Enter');
  await page.waitForSelector('[data-test-id="cell-scan-banner"]', { timeout: 10000 });
  await page.screenshot({ path: 'tasdiq-ux-2-cell-read-banner.png' });
  console.log('snapshots saved: tasdiq-ux-1-step1.png, tasdiq-ux-2-cell-read-banner.png');
} finally {
  if (cellId) await j(tok, 'DELETE', `/admin/stores/${STORE}/cells/${cellId}`);
  await browser.close();
}
