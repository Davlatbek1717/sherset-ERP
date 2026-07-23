/** Owner 2026-07-23: «Договорная цена» must exist in EVERY positions section.
 * Live sweep: button visible (blue-slot toolbar) + click opens the modal, on
 * every new-route; [id] routes are verified via the first existing doc. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const NEW_ROUTES = [
  'customer-orders/new', 'demands/new', 'invoices-out/new', 'sales-returns/new',
  'purchase-orders/new', 'supplies/new', 'invoices-in/new', 'purchase-returns/new',
  'enters/new', 'losses/new', 'moves/new', 'internal-orders/new',
  'commission-reports/new', 'commission-reports/new-in',
];
const ID_LISTS = [
  ['purchase-orders', '/purchase-orders'], ['supplies', '/supplies'],
  ['invoices-in', '/invoices-in'], ['purchase-returns', '/purchase-returns'],
  ['enters', '/enters'], ['losses', '/losses'], ['moves', '/moves'],
];
let failed = 0;
const ok = (n, c, extra = '') => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${extra ? ` — ${extra}` : ''}`);
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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.setDefaultTimeout(20000);

async function checkRoute(route) {
  try {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator('[data-test-id="position-agreement-button"]');
    await btn.waitFor({ state: 'visible', timeout: 25000 });
    await btn.click();
    const modal = page.locator('[data-test-id="position-agreement-save"]');
    const opened = await modal
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    ok(`${route}: Kelishuv tugma + modal`, opened);
    if (opened) await page.keyboard.press('Escape');
  } catch (e) {
    ok(`${route}: Kelishuv tugma + modal`, false, String(e).slice(0, 120));
  }
}

try {
  const tok = await login();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });

  for (const r of NEW_ROUTES) await checkRoute(r);

  for (const [slug, apiPath] of ID_LISTS) {
    const r = await fetch(`${API}${apiPath}?limit=1`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then((x) => x.json())
      .catch(() => null);
    const id = r?.items?.[0]?.id;
    if (!id) {
      console.log(`SKIP ${slug}/[id] — hujjat yo'q`);
      continue;
    }
    await checkRoute(`${slug}/${id}`);
  }
} finally {
  await browser.close();
  console.log(failed ? `FAILED=${failed}` : 'ALL PASS');
}
