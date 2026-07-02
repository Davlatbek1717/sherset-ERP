// READ-ONLY DOM probe: resolve where moysklad puts «Комментарий» on the CO editor
// (top-right meta vs bottom band — both seemed to appear in screenshots) and whether
// the «Уста» custom field has a «+» create button. No writes.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'co-detail-pixel-audit-2026-06-25');
mkdirSync(OUT, { recursive: true });
const MS_ORDER = 'a0fac2ff-6faa-11f1-0a80-1f67000852c8';
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120000);
const out = {};
try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.fill(env.MOYSKLAD_EMAIL).catch(() => {});
  await passEl.fill(env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(12000);
  const base = page.url().split('#')[0];
  await page.goto(`${base}#customerorder/edit?id=${MS_ORDER}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);

  // All textareas with bbox + nearest preceding label text
  out.textareas = await page.$$eval('textarea', (tas) =>
    tas.map((t) => {
      const r = t.getBoundingClientRect();
      // find a label: previous siblings / ancestor row text
      let lbl = '';
      let n = t;
      for (let i = 0; i < 6 && n; i++) {
        const prev = n.previousElementSibling;
        if (prev && (prev.textContent || '').trim()) { lbl = (prev.textContent || '').trim(); break; }
        n = n.parentElement;
      }
      return {
        label: lbl.slice(0, 40),
        placeholder: (t.getAttribute('placeholder') || '').slice(0, 40),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0,
      };
    }).filter((t) => t.visible),
  );

  // «Комментарий» label nodes + their bbox (to see top-right vs bottom)
  out.commentLabels = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0);
    return leaves
      .filter((e) => (e.textContent || '').trim() === 'Комментарий')
      .map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; });
  });

  // «Уста» row: is there a + button near it?
  out.usta = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0);
    const node = leaves.find((e) => (e.textContent || '').trim() === 'Уста');
    if (!node) return 'label-not-found';
    let row = node;
    for (let i = 0; i < 5 && row.parentElement; i++) row = row.parentElement;
    const txt = (row.textContent || '');
    const html = row.innerHTML || '';
    return { hasPlus: /[＋+]/.test(txt) || /\bplus\b|add-button|btn-add/i.test(html), rowText: txt.replace(/\s+/g, ' ').slice(0, 60) };
  });
} catch (e) {
  out.error = String(e).slice(0, 300);
}
writeFileSync(resolve(OUT, 'comment-dom-probe.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
