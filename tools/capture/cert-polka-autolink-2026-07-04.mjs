// CERT — «Зона»→«Полка» rename + polka AUTO-LINK from the cell code's 2nd
// segment. Flow: store card → check table headers say «Полка» → «+ Ячейка» →
// type 05-07-01-01 (polka «07» does NOT exist yet) → commit → BOTH appear:
// polka row «07» in the polka table AND cell «05-07-01-01» attached to it.
// Second cell 05-07-02-02 → REUSES polka «07» (no duplicate). Cleanup via API.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const API = 'http://localhost:4023/api/v1';
const STORE = 'd7d27173-b402-469b-9c08-7dd9c130382a';
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-polka';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
await ctx.request.post(`${WEB}/api/v1/auth/login`, {
  data: { email: 'admin@demo.local', password: 'admin123' },
  headers: { 'Content-Type': 'application/json' },
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
const out = {};
async function addCell(code) {
  await p.locator('button', { hasText: 'Ячейка' }).last().click();
  await p.locator('[data-test-id="new-cell-row"]').waitFor({ timeout: 10000 });
  const segs = code.split('-');
  for (let i = 0; i < 4; i++) await p.locator(`[data-test-id="new-cell-seg-${i}"]`).fill(segs[i]);
  await p.locator('[data-test-id="new-cell-barcode-gen"]').click();
  await p.locator('[data-test-id="new-cell-seg-3"]').press('Enter');
  await p.waitForTimeout(1500);
}
try {
  await p.goto(`${WEB}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(`/stores/${STORE}`), { timeout: 20000 }).catch(() => {});
  }
  await p.locator('[data-test-id="address-storage"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1000);
  const sectionText = (await p.locator('[data-test-id="address-storage"]').innerText()).replace(/\s+/g, ' ');
  out.headerPolka = /Полка/.test(sectionText);
  out.noZonaWord = !/Зона|зоне|зоны/.test(sectionText);
  await p.screenshot({ path: resolve(OUT, '10-renamed.png') });

  await addCell('05-07-01-01');
  await addCell('05-07-02-02');
  await p.waitForTimeout(1000);
  const after = (await p.locator('[data-test-id="address-storage"]').innerText()).replace(/\s+/g, ' ');
  out.cellsVisible = /05-07-01-01/.test(after) && /05-07-02-02/.test(after);
  await p.screenshot({ path: resolve(OUT, '20-after-cells.png') });

  // API truth: polka «07» exists ONCE, both cells attached to it
  const login = await ctx.request.post(`${API}/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
    headers: { 'Content-Type': 'application/json' },
  });
  const token = (await login.json()).accessToken;
  const H = { Authorization: `Bearer ${token}` };
  const snap = await (await ctx.request.get(`${API}/admin/stores/${STORE}/address-storage`, { headers: H })).json();
  const polkas07 = (snap.zones ?? []).filter((z) => z.name === '07');
  out.polka07Count = polkas07.length;
  const certCells = (snap.cells ?? []).filter((c) => /^05-07-/.test(c.name));
  out.certCells = certCells.map((c) => ({ name: c.name, zoneName: c.zoneName }));
  out.bothAttached = certCells.length === 2 && certCells.every((c) => c.zoneId === polkas07[0]?.id);

  // cleanup: cells then the polka
  for (const c of certCells)
    await ctx.request.delete(`${API}/admin/stores/${STORE}/cells/${c.id}`, { headers: H });
  for (const z of polkas07)
    await ctx.request.delete(`${API}/admin/stores/${STORE}/zones/${z.id}`, { headers: H });
  out.cleanup = 'done';
  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await p.screenshot({ path: resolve(OUT, '99-error.png') }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
