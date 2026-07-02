// READ-ONLY: locate the «Смотрит» (who-is-viewing) indicator in the moysklad CO
// detail top-right header cluster and clip it tightly to show the user WHERE it sits.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'customerorder-detail-live-2026-06-24');
mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120_000);
const out = {};

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(12000);
  const base = page.url().split('#')[0];
  // direct hash-open the order whose first capture had «Смотрит» in headerText
  await page.goto(`${base}#customerorder/edit?id=a0fac2ff-6faa-11f1-0a80-1f67000852c8`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(16000);
  out.opened = (await page.locator(':text-is("Создать документ") >> visible=true').count()) > 0;
  // «Смотрит» is a presence indicator — give it extra time to register the viewer
  await page.waitForTimeout(4000);

  // locate «Смотрит» (and the owner/«Изменения» cluster) bounding boxes
  out.boxes = await page.evaluate(() => {
    const find = (re) => [...document.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && re.test((e.textContent || '').trim()),
    );
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), text: (e.textContent||'').trim().slice(0,30) }; };
    return {
      smotrit: r(find(/^Смотрит$/)),
      izmeneniya: r(find(/^Изменения$/)),
      owner: r(find(/Азизбек/)),
    };
  });

  // clip the owner / «Смотрит» / «Изменения» cluster (measured at x≈657-874, y≈119)
  await page.screenshot({ path: resolve(OUT, '30-smotrit-cluster.png'), clip: { x: 560, y: 96, width: 420, height: 56 } }).catch(() => {});
  // also a full top strip for context
  await page.screenshot({ path: resolve(OUT, '32-top-strip.png'), clip: { x: 0, y: 70, width: 1000, height: 90 } }).catch(() => {});
  // tight clip around «Смотрит» if found
  const s = out.boxes?.smotrit;
  if (s && s.w) {
    await page.screenshot({ path: resolve(OUT, '31-smotrit-tight.png'), clip: { x: Math.max(0, s.x - 40), y: Math.max(0, s.y - 14), width: 240, height: 50 } }).catch(() => {});
  }
} catch (e) { out.error = String(e).slice(0, 300); }
writeFileSync(resolve(OUT, 'co-smotrit-locate.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
