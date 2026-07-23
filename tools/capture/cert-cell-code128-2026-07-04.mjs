// CERT — structured cell code (4×2-digit segments → «01-02-03-04») + the
// Code 128 label. Flow: store card → «+ Ячейка» → type 4 segments + generate
// barcode → commit → row shows the composed code → 🖨 → label = big code text
// + LINEAR barcode; the barcode is then decoded INDEPENDENTLY from the SVG
// rect geometry (verified Code 128 table embedded below) and must equal the
// cell's stored barcode. Cleanup: the cert cell is deleted via the API.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const API = 'http://localhost:4023/api/v1';
const STORE = 'd7d27173-b402-469b-9c08-7dd9c130382a'; // Asosiy ombor
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-code128';
mkdirSync(OUT, { recursive: true });

// invariant-verified Code 128 table (same provenance as apps/web/src/lib/vendor/code128.ts)
const PATTERNS = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
const BY_PATTERN = new Map(PATTERNS.map((p, v) => [p, v]));
function decodeWidths(widths) {
  const symbols = [];
  for (let i = 0; i < widths.length; ) {
    const take = widths.length - i === 7 ? 7 : 6;
    const v = BY_PATTERN.get(widths.slice(i, i + take).join(''));
    if (v === undefined) return { error: `bad symbol @${i}` };
    symbols.push(v);
    i += take;
    if (take === 7) break;
  }
  const start = symbols[0];
  if (symbols[symbols.length - 1] !== 106) return { error: 'no stop' };
  let sum = start;
  const data = symbols.slice(1, -2);
  data.forEach((v, i) => { sum += (i + 1) * v; });
  if (sum % 103 !== symbols[symbols.length - 2]) return { error: 'checksum' };
  if (start === 105) return { text: data.map((v) => String(v).padStart(2, '0')).join('') };
  if (start === 104) return { text: data.map((v) => String.fromCharCode(v + 32)).join('') };
  return { error: `start ${start}` };
}

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
try {
  await p.goto(`${WEB}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(`/stores/${STORE}`), { timeout: 20000 }).catch(() => {});
  }
  // «+ Ячейка»
  await p.getByText('Ячейка', { exact: true }).last().waitFor({ timeout: 30000 });
  await p.locator('button', { hasText: 'Ячейка' }).last().click();
  await p.locator('[data-test-id="new-cell-row"]').waitFor({ timeout: 10000 });
  await p.screenshot({ path: resolve(OUT, '10-new-row.png') });
  // 4 segments — auto-advance on 2 digits
  out.seg0Prefill = await p.locator('[data-test-id="new-cell-seg-0"]').inputValue();
  await p.locator('[data-test-id="new-cell-seg-0"]').fill('01');
  await p.locator('[data-test-id="new-cell-seg-1"]').fill('02');
  await p.locator('[data-test-id="new-cell-seg-2"]').fill('03');
  await p.locator('[data-test-id="new-cell-seg-3"]').fill('04');
  // generate the barcode, then commit with Enter
  await p.locator('[data-test-id="new-cell-barcode-gen"]').click();
  const genBarcode = await p.locator('[data-test-id="new-cell-barcode"]').inputValue();
  out.genBarcode = genBarcode;
  await p.screenshot({ path: resolve(OUT, '20-filled.png') });
  await p.locator('[data-test-id="new-cell-seg-3"]').press('Enter');
  await p.waitForTimeout(1500);
  out.rowVisible = (await p.getByText('01-02-03-04', { exact: false }).count()) > 0;
  await p.screenshot({ path: resolve(OUT, '30-committed.png') });

  // 🖨 on the new row
  const row = p.locator('tr', { hasText: '01-02-03-04' }).first();
  await row.hover();
  await p.waitForTimeout(400);
  await row.locator('button:has(svg)').last().click();
  await p.locator('[data-test-id="cell-label-overlay"]').waitFor({ timeout: 10000 });
  await p.waitForTimeout(800);
  out.codeText = (await p.locator('[data-test-id="cell-label-code"]').first().textContent())?.trim();
  out.barcodePresent = (await p.locator('[data-test-id="cell-label-barcode"]').count()) > 0;
  out.qrFallbackUsed = (await p.locator('[data-test-id="cell-label-overlay"] [data-test-id="qr-tag-svg"]').count()) > 0;
  await p.screenshot({ path: resolve(OUT, '40-label.png') });

  // INDEPENDENT decode from rect geometry
  const widths = await p.evaluate(() => {
    const svg = document.querySelector('[data-test-id="cell-label-barcode"]');
    if (!svg) return null;
    const rects = [...svg.querySelectorAll('rect')].map((r) => ({
      x: Number(r.getAttribute('x')),
      w: Number(r.getAttribute('width')),
    }));
    const widths = [];
    let cursor = rects[0].x; // after the leading quiet zone
    for (const r of rects) {
      if (r.x > cursor) widths.push(r.x - cursor); // space
      widths.push(r.w); // bar
      cursor = r.x + r.w;
    }
    return widths;
  });
  out.decoded = widths ? decodeWidths(widths) : { error: 'no svg' };
  out.decodeMatchesBarcode = out.decoded?.text === genBarcode;

  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await p.screenshot({ path: resolve(OUT, '99-error.png') }).catch(() => {});
}
// CLEANUP: delete the cert cell via the API (Bearer)
try {
  const login = await ctx.request.post(`${API}/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
    headers: { 'Content-Type': 'application/json' },
  });
  const token = (await login.json()).accessToken;
  const H = { Authorization: `Bearer ${token}` };
  const snap = await (await ctx.request.get(`${API}/admin/stores/${STORE}/address-storage`, { headers: H })).json();
  const certCell = (snap.cells ?? []).find((c) => c.name === '01-02-03-04');
  if (certCell) {
    await ctx.request.delete(`${API}/admin/stores/${STORE}/cells/${certCell.id}`, { headers: H });
    out.cleanup = 'cert cell deleted';
  } else out.cleanup = 'cell not found (nothing to clean)';
} catch (e) {
  out.cleanup = `CLEANUP FAILED: ${String(e).slice(0, 120)}`;
}
console.log(JSON.stringify(out, null, 2));
await b.close();
