// CERT — multi-cell label printing (USER 2026-07-05): the overlay's checkbox
// dropdown lists ALL cells; every ticked cell prints its own sheet. Seeds 3
// cells via the API, opens the overlay from cell #1 (pre-checked), ticks the
// other two → 3 label sheets; copies ×2 → 6. Cleanup deletes the cert cells.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const API = 'http://localhost:4000/api/v1';
const STORE = 'd7d27173-b402-469b-9c08-7dd9c130382a';
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-label-multi';
mkdirSync(OUT, { recursive: true });
const CODES = ['01-01-01-01', '01-01-01-02', '01-01-01-03'];

const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
await ctx.request.post(`${WEB}/api/v1/auth/login`, {
  data: { email: 'admin@demo.local', password: 'admin123' },
  headers: { 'Content-Type': 'application/json' },
});
const login = await ctx.request.post(`${API}/auth/login`, {
  data: { email: 'admin@demo.local', password: 'admin123' },
  headers: { 'Content-Type': 'application/json' },
});
const token = (await login.json()).accessToken;
const H = { Authorization: `Bearer ${token}` };
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f) }).catch(() => {});
try {
  // seed 3 cert cells
  for (const name of CODES) {
    await ctx.request.post(`${API}/admin/stores/${STORE}/cells`, {
      headers: H,
      data: { name },
    });
  }

  await p.goto(`${WEB}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(`/stores/${STORE}`), { timeout: 20000 }).catch(() => {});
  }
  await p.getByText('01-01-01-01', { exact: false }).first().waitFor({ timeout: 30000 });
  const row = p.locator('tr', { hasText: '01-01-01-01' }).first();
  await row.hover();
  await p.waitForTimeout(400);
  await row.locator('button:has(svg)').last().click();
  await p.locator('[data-test-id="cell-label-overlay"]').waitFor({ timeout: 10000 });
  await p.waitForTimeout(800);
  out.initialLabels = await p.locator('[data-test-id="cell-label"]').count();

  // open the checkbox dropdown, tick the other two cells
  await p.locator('[data-test-id="cell-label-cells"]').click();
  await p.waitForTimeout(600);
  await shot('10-dropdown.png');
  for (const code of CODES.slice(1)) {
    await p.getByRole('option', { name: code }).click().catch(async () => {
      await p.getByText(code, { exact: true }).last().click();
    });
    await p.waitForTimeout(300);
  }
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  out.labelsAfterTick = await p.locator('[data-test-id="cell-label"]').count();
  out.labelCodes = await p
    .locator('[data-test-id="cell-label-code"]')
    .allInnerTexts()
    .then((a) => a.map((s) => s.trim()));
  await shot('20-three-labels.png');

  // copies ×2 → 6 sheets
  await p.fill('[data-test-id="cell-label-copies"]', '2');
  await p.waitForTimeout(500);
  out.labelsWithCopies = await p.locator('[data-test-id="cell-label"]').count();
  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
}
// cleanup cert cells (+ auto-created polka «01» if empty afterwards)
try {
  const snap = await (
    await ctx.request.get(`${API}/admin/stores/${STORE}/address-storage`, { headers: H })
  ).json();
  for (const c of (snap.cells ?? []).filter((c) => CODES.includes(c.name))) {
    await ctx.request.delete(`${API}/admin/stores/${STORE}/cells/${c.id}`, { headers: H });
  }
  out.cleanup = 'done';
} catch (e) {
  out.cleanup = `FAILED: ${String(e).slice(0, 120)}`;
}
console.log(JSON.stringify(out, null, 2));
await b.close();
