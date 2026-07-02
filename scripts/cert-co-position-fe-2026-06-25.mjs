// LIVE FE CERT — CO detail «N из ВСЕГО ‹ ›» record navigator renders on a DIRECT
// URL visit (the exact thing the user reported missing) with the REAL total, and
// the ‹ › walk the whole set. Runs against a throwaway `next dev` on :3211 with an
// isolated NEXT_DISTDIR (does NOT touch the prod dev:fast server on :3100).
// Proves: the /position request fires, the counter shows the real total, prev is
// disabled on the first record, clicking next advances the counter + URL, 0 errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3211';
const API = 'http://127.0.0.1:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/co-position-fe-cert-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [], positionRequests: [] };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

// deterministic ids + expected total straight from the API
const lr = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
const list = await (await fetch(`${API}/customer-orders?limit=3`, { headers: { authorization: `Bearer ${accessToken}` } })).json();
const firstId = list.items?.[0]?.id;
const secondId = list.items?.[1]?.id;
const total = list.total;
out.firstId = firstId; out.total = total;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
const shot = (f) => page.screenshot({ path: resolve(OUT, f) }).catch(() => {});
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 200)}`));
page.on('request', (r) => { if (/\/customer-orders\/[^/]+\/position/.test(r.url())) out.positionRequests.push(r.url().replace(BASE, '')); });

try {
  // 1. login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(async () => {
    await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  });
  ok(`logged in`);

  // 2. DIRECT URL to the CO detail (no list click — the reported scenario)
  await page.goto(`${BASE}/customer-orders/${firstId}`, { waitUntil: 'domcontentloaded' });
  const counter = page.locator('[data-test-id="detail-toolbar-position"]');
  await counter.waitFor({ state: 'visible', timeout: 90000 });
  ok('counter renders on a DIRECT URL visit');
  await shot('01-direct-url-counter.png');

  // 3. the /position request fired (proves server mode is live)
  if (out.positionRequests.length > 0) ok(`/position request fired (${out.positionRequests[0]})`);
  else bad('no /position request fired — server mode not active');

  // 4. counter shows the REAL total (e.g. «1 из 20417»), not a page size
  const text = (await counter.textContent())?.trim() || '';
  out.counterText = text;
  if (text.includes(String(total))) ok(`counter shows the REAL total: «${text}»`);
  else bad(`counter total mismatch: «${text}» (expected to contain ${total})`);
  if (/(^|\D)1(\D|$)/.test(text)) ok('counter current = 1 (first record)'); else bad(`current not 1: «${text}»`);

  // 5. prev disabled on the first record, next enabled
  const prevDisabled = await page.locator('[data-test-id="detail-toolbar-prev"]').isDisabled();
  const nextDisabled = await page.locator('[data-test-id="detail-toolbar-next"]').isDisabled();
  if (prevDisabled) ok('prev ‹ disabled on first record'); else bad('prev ‹ should be disabled on first record');
  if (!nextDisabled) ok('next › enabled on first record'); else bad('next › should be enabled');

  // 6. click next → URL advances to the 2nd doc + counter shows current 2
  await page.locator('[data-test-id="detail-toolbar-next"]').click();
  await page.waitForURL((u) => u.pathname.endsWith(`/customer-orders/${secondId}`), { timeout: 30000 }).catch(() => {});
  if (page.url().endsWith(`/customer-orders/${secondId}`)) ok('next › navigated to the 2nd document'); else bad(`next did not navigate (url ${page.url().replace(BASE, '')})`);
  await counter.waitFor({ state: 'visible', timeout: 60000 });
  const text2 = (await counter.textContent())?.trim() || '';
  out.counterText2 = text2;
  if (/(^|\D)2(\D|$)/.test(text2)) ok(`counter advanced to current = 2 («${text2}»)`); else bad(`counter did not advance: «${text2}»`);
  await shot('02-after-next.png');
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  out.consoleErrorCount = out.consoleErrors.length;
  out.PASS = out.steps.every((s) => s.startsWith('✓')) && out.consoleErrors.length === 0 && !out.error;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
