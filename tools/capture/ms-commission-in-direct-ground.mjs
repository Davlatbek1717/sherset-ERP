import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: ground the «Полученный отчёт комиссионера» (in) create editor by
// navigating DIRECTLY to its stable new-doc hash (#commissionreportin/edit?new),
// discovered from the out run. No menu clicking (reliable). Also re-confirms the
// out editor. Auto-accepts any beforeunload dialog. NOTHING saved. Creds from .env.local.
import { chromium } from 'playwright';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-reports-new-2026-06-28/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept().catch(() => {})); // accept "unsaved changes"
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f, full = false) =>
  p.screenshot({ path: resolve(OUT, f), fullPage: full }).catch(() => {});

const readEditor = () =>
  p.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.top >= 0 && r.top < 2500;
    };
    const labels = [...document.querySelectorAll('*')]
      .filter((e) => !e.children.length && vis(e))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: clean(e.textContent), top: Math.round(r.top), left: Math.round(r.left) };
      })
      .filter((o) => o.t && o.t.length > 0 && o.t.length < 60)
      .sort((a, c) => a.top - c.top || a.left - c.left);
    const tableHeaders = [
      ...new Set(
        [...document.querySelectorAll('th, .gwt-Label')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top > 150 && r.top < 900 && r.width > 8 && !e.children.length;
          })
          .map((e) => clean(e.textContent))
          .filter((t) => t && t.length > 0 && t.length < 30),
      ),
    ];
    return { url: location.hash, title: clean(document.title), tableHeaders, labels: labels.slice(0, 90) };
  });

const ground = async (hash, tag) => {
  const base = p.url().split('#')[0];
  await p.goto(`${base}${hash}`, { waitUntil: 'domcontentloaded' });
  const loaded = await p
    .waitForFunction(() => /Сохранить/.test(document.body.innerText), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  await p.waitForTimeout(5000);
  await shot(`${tag}-direct-full.png`, true);
  await shot(`${tag}-direct-top.png`, false);
  return { loaded, url: p.url().split('/').pop(), ...(await readEditor()) };
};

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])')
    .first()
    .fill(EMAIL)
    .catch(() => {});
  await p
    .locator('input[type="password"]')
    .first()
    .fill(PASSWORD)
    .catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);

  out.in = await ground('#commissionreportin/edit?new', 'in');
  out.outConfirm = await ground('#commissionreportout/edit?new', 'out2');
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-in-direct-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ inLoaded: out.in?.loaded, inUrl: out.in?.url, inTitle: out.in?.title, inHeaders: out.in?.tableHeaders, outConfirmUrl: out.outConfirm?.url }, null, 2));
await b.close();
