// READ-ONLY: does the moysklad «Счёт поставщика» EDITOR actually show «Внешний код»?
// Opens an existing invoicein editor, scrolls the whole form to the bottom, and
// searches the DOM for the «Внешний код» text — reporting found/not-found, its tag/
// role (link vs input vs label), and a screenshot of the bottom band. NEVER saves.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/invoices-in-new-2026-06-25/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('NO creds');
  process.exit(2);
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1100 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = { site: SITE };

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await login.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await login.fill(EMAIL).catch(() => {});
  await pass.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(13000);
  await p.keyboard.press('Enter').catch(() => {});
  await p.waitForTimeout(4000);
  const base = p.url().split('#')[0];

  // open the list, retry grabbing the editor href a few times (promo / slow load)
  await p.goto(`${base}#invoicein`, { waitUntil: 'domcontentloaded' });
  let editHref = null;
  for (let i = 0; i < 8 && !editHref; i++) {
    await p.waitForTimeout(4000);
    editHref = await p.evaluate(() => {
      const a = document.querySelector('a[href*="invoicein/edit"]');
      return a ? a.getAttribute('href') : null;
    });
  }
  out.editHref = editHref;
  if (!editHref) {
    out.note = 'could not open an existing invoicein editor (list empty or slow)';
  } else {
    const url = editHref.startsWith('#') ? `${base}${editHref}` : editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.locator(':text-is("Сохранить") >> visible=true').first().waitFor({ timeout: 40000 }).catch(() => {});
    await p.waitForTimeout(6000);

    // scroll the whole form to the bottom so a field below the positions is rendered
    for (let i = 0; i < 6; i++) {
      await p.mouse.wheel(0, 1500);
      await p.waitForTimeout(500);
    }
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(1000);

    out.externalCode = await p.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      // any leaf node whose text is exactly / contains «Внешний код»
      const all = [...document.querySelectorAll('a, span, div, label, td, th')];
      const exact = all.filter((e) => norm(e.textContent) === 'Внешний код' && e.children.length === 0);
      const contains = all.filter((e) => /Внешний код/.test(norm(e.textContent)) && e.children.length === 0);
      const bodyHas = /Внешний код/.test(document.body.innerText || '');
      const node = exact[0] || contains[0];
      if (!node) return { foundInBody: bodyHas, foundElement: false };
      const r = node.getBoundingClientRect();
      const tag = node.tagName.toLowerCase();
      const cs = getComputedStyle(node);
      const inputs = [...document.querySelectorAll('input[type="text"], input:not([type])')];
      const nearInput = inputs.find((i) => {
        const ir = i.getBoundingClientRect();
        return Math.abs(ir.top - r.top) < 28 && ir.left >= r.left - 4 && ir.left - r.right < 500;
      });
      return {
        foundInBody: bodyHas,
        foundElement: true,
        tag,
        className: (node.className || '').toString().slice(0, 80),
        cursor: cs.cursor,
        underline: cs.textDecorationLine,
        looksLikeLink: tag === 'a' || cs.cursor === 'pointer' || cs.textDecorationLine.includes('underline'),
        hasAdjacentInput: !!nearInput,
        y: Math.round(r.y),
      };
    });

    const y = out.externalCode?.y;
    if (typeof y === 'number') {
      await p.evaluate((yy) => window.scrollTo(0, Math.max(0, yy - 250)), y);
      await p.waitForTimeout(700);
    }
    await p.screenshot({ path: resolve(OUT, '51-extcode-check.png') }).catch(() => {});
  }
} catch (e) {
  out.error = String(e).slice(0, 300);
}

writeFileSync(resolve(OUT, 'extcode-check.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
