/**
 * Live CAMERA-ONLY proof, REPEATED with DIFFERENT barcodes — owner 2026-07-21:
 * «kamida 5–10 marta, turli shtrix-kodlar bilan… video orqali natijani
 * taqdim eting».
 *
 * No keyboard touches the scan modal. Each round launches its OWN Chrome with
 * a synthetic camera feed (--use-file-for-fake-video-capture) playing REAL
 * Code-128 barcodes drawn from the app's own encoder into a Y4M video:
 * ~10s CELL label, ~20s PRODUCT label, looping. Every round uses a DIFFERENT
 * cell-barcode + product-barcode pair and its own fixtures: camera reads the
 * cell → card 1 (№ 1→№ 2) → camera reads the product → binds → DB row
 * checked. No video recording — owner 2026-07-21: videolar kerak emas.
 *
 * Run: cd apps/api && npx tsx ../../tools/capture/verify-cell-scan-camera-2026-07-20.mts
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { code128Widths } from '../../apps/web/src/lib/vendor/code128.ts';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const STORE = process.env.STORE_ID || 'd7d27173-b402-469b-9c08-7dd9c130382a';
// 5 rounds, 5 DIFFERENT barcode pairs — varied length/charset on purpose.
const PAIRS = [
  { cell: { name: 'SKAN-R1', barcode: 'CELL-CAM-2026' }, prod: '20260000000480' },
  { cell: { name: 'SKAN-R2', barcode: '04-03-01-05' }, prod: '4780000112345' },
  { cell: { name: 'SKAN-R3', barcode: 'A1-B2-C3' }, prod: '2000000000017' },
  { cell: { name: 'SKAN-R4', barcode: 'POLKA-77' }, prod: 'PRD-2026-XY' },
  { cell: { name: 'SKAN-R5', barcode: 'Z9-99-99-99' }, prod: '4870001234561' },
];
// PAIR_IDX=n reruns a single pair (0-based) — e.g. to retry a flaky round.
const ONLY = process.env.PAIR_IDX ? Number(process.env.PAIR_IDX) : null;
const ACTIVE = ONLY === null ? PAIRS : [PAIRS[ONLY] as (typeof PAIRS)[number]];
const ROUNDS = Math.min(Number(process.env.ROUNDS || ACTIVE.length), ACTIVE.length);
const results: string[] = [];
let failed = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) failed++;
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`;
  results.push(line);
  console.log(line);
};

// ── Y4M synthesis: bars → Y plane columns (black 16 / white 235) ──────────
// SMALL=1 simulates a label at arm's length: the code spans only ~28% of a
// wide frame — the case the whole-frame-downscale decoder physically cannot
// read (bars < 1px) and the alternating center-zoom view exists to catch.
const SMALL = process.env.SMALL === '1';
const W = SMALL ? 1280 : 640;
const H = SMALL ? 360 : 120;
function barcodeColumns(code: string): Uint8Array {
  const widths = code128Widths(code);
  if (!widths) throw new Error(`unencodable: ${code}`);
  const modules = widths.reduce((a, b) => a + b, 0) + 20;
  const span = SMALL ? Math.round(W * 0.28) : W;
  const scale = Math.max(1, Math.floor(span / modules));
  const pad = Math.floor((W - modules * scale) / 2);
  const cols = new Uint8Array(W).fill(235);
  let x = pad + 10 * scale;
  widths.forEach((w, i) => {
    const px = w * scale;
    if (i % 2 === 0) cols.fill(16, x, x + px);
    x += px;
  });
  return cols;
}
function frameFor(cols: Uint8Array): Buffer {
  const y = Buffer.alloc(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) y[r * W + c] = cols[c] as number;
  const uv = Buffer.alloc((W / 2) * (H / 2), 128);
  return Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv]);
}
function buildY4m(cellCode: string, prodCode: string): string {
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F6:1 Ip A1:1 C420jpeg\n`);
  const cellFrame = frameFor(barcodeColumns(cellCode));
  const prodFrame = frameFor(barcodeColumns(prodCode));
  const frames: Buffer[] = [header];
  for (let i = 0; i < 60; i++) frames.push(cellFrame); // ~10s cell label
  for (let i = 0; i < 120; i++) frames.push(prodFrame); // ~20s product label
  const file = join(mkdtempSync(join(tmpdir(), 'scan-cam-')), 'barcodes.y4m');
  writeFileSync(file, Buffer.concat(frames));
  return file;
}

const login = async (): Promise<string> =>
  (
    await (
      await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
      })
    ).json()
  ).accessToken;

const j = (tok: string, method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

async function runRound(round: number, pair: (typeof PAIRS)[number], tok: string) {
  const videoFile = buildY4m(pair.cell.barcode, pair.prod);
  console.log(`round ${round} feed: cell=${pair.cell.barcode} product=${pair.prod}`);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${videoFile}`,
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    locale: 'ru-RU',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const created: { cellId?: string; productId?: string } = {};
  const poll = async (fn: () => Promise<boolean>, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };

  try {
    const c = await j(tok, 'POST', `/admin/stores/${STORE}/cells`, pair.cell);
    created.cellId = c.data?.id;
    const p = await j(tok, 'POST', '/products', {
      name: `Kamera Sinov ${round}`,
      uom: 'шт',
      barcodes: [pair.prod],
    });
    created.productId = p.data?.id;
    ok(`round ${round}: fixtures created`, !!created.cellId && !!created.productId);

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-test-id="cell-add-product-${created.cellId}"]`, {
      timeout: 30000,
    });
    await page.click(`[data-test-id="cell-add-product-${created.cellId}"]`);
    await page.waitForSelector('[data-test-id="cell-scan-open"]', { timeout: 15000 });
    await page.click('[data-test-id="cell-scan-open"]');
    await page.waitForSelector('[data-testid="cell-scan-modal"]', { timeout: 10000 });
    const cellCard = page.locator('[data-test-id="cell-scan-cell-card"]');
    await page
      .locator('[data-test-id="cell-scan-video"]')
      .waitFor({ state: 'visible', timeout: 15000 });

    const cellSeen = await poll(
      async () => ((await cellCard.textContent()) ?? '').includes(pair.cell.name),
      60_000,
    );
    ok(`round ${round}: CAMERA read the CELL label → card 1`, cellSeen);
    const readShown =
      (await page
        .locator('[data-test-id="cell-scan-read"]')
        .textContent()
        .catch(() => '')) ?? '';
    ok(
      `round ${round}: decoded code is SHOWN on screen (nothing silent)`,
      readShown.includes(pair.cell.barcode) || readShown.includes(pair.prod),
      JSON.stringify(readShown),
    );

    const bound = await poll(async () => {
      const logText =
        (await page
          .locator('[data-test-id="cell-scan-log"]')
          .textContent()
          .catch(() => '')) ?? '';
      return logText.includes(`Kamera Sinov ${round}`);
    }, 60_000);
    ok(`round ${round}: CAMERA read the PRODUCT label → bound`, bound);

    const db = await j(tok, 'GET', `/admin/stores/${STORE}/cells/${created.cellId}/products`);
    ok(
      `round ${round}: DB has the binding`,
      ((db.data?.items ?? []) as Array<{ id: string }>).some((x) => x.id === created.productId),
    );
    if (round === 1) await page.screenshot({ path: 'tasdiq-cam-round1.png' });
  } catch (e) {
    ok(`round ${round}: EXCEPTION`, false, String(e).slice(0, 300));
    await page.screenshot({ path: `tasdiq-cam-error-r${round}.png` }).catch(() => {});
  } finally {
    try {
      if (created.cellId && created.productId) {
        await j(
          tok,
          'DELETE',
          `/admin/stores/${STORE}/cells/${created.cellId}/products/${created.productId}`,
        );
      }
      if (created.cellId) await j(tok, 'DELETE', `/admin/stores/${STORE}/cells/${created.cellId}`);
      if (created.productId) await j(tok, 'DELETE', `/products/${created.productId}`);
    } catch (e) {
      console.log(`round ${round} cleanup failed: ${String(e).slice(0, 120)}`);
    }
    await ctx.close();
    await browser.close();
  }
}

const tok = await login();
for (let round = 1; round <= ROUNDS; round++) {
  await runRound(round, ACTIVE[round - 1] as (typeof PAIRS)[number], tok);
  // Breather between Chrome launches — this box has 7.7GB RAM; back-to-back
  // instances starved round 4 into a zero-decode flake once.
  if (round < ROUNDS) await new Promise((r) => setTimeout(r, 4000));
}
console.log(
  `\n=== camera-only ×${ROUNDS} (turli kodlar) — ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`,
);
process.exit(failed ? 1 : 0);
