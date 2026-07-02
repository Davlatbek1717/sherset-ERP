// READ-ONLY grounding of the moysklad «Списания» FILTER <select> options.
// Logs in, #loss, opens «Фильтр», dumps every VISIBLE <select>'s label + option
// texts — to ground the boolean filters (Проведено / Напечатано / Отправлено /
// Общий доступ) exactly (do they show «Нет»/«Да» or symbols?). NEVER writes.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/losses-list-2026-06-25/moysklad');
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
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p
    .locator(
      'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])',
    )
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
  await p.waitForTimeout(12000);

  const base = p.url().split('#')[0];
  await p.goto(`${base}#loss`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  // dismiss any save modal
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }

  // moysklad's loss filter is OPEN by default — do NOT click «Фильтр» (that
  // would CLOSE it). Screenshot the current state, then dump selects directly.
  await p.screenshot({ path: resolve(OUT, 'filter-selects-state.png'), fullPage: false });

  // dump every <select> with a small option set (boolean/status filters),
  // de-duped by options signature (GWT pre-renders sibling templates).
  out.selects = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const labelFor = (sel) => {
      let node = sel;
      for (let i = 0; i < 5 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const lbl = node.querySelector('.gwt-Label, label, [class*="label"], [class*="Label"]');
        if (lbl && norm(lbl.textContent)) return norm(lbl.textContent);
      }
      return '';
    };
    const seen = new Set();
    const result = [];
    for (const sel of document.querySelectorAll('select')) {
      const options = [...sel.options].map((o) => norm(o.textContent));
      if (!options.length || options.length >= 12) continue;
      const sig = options.join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      result.push({ label: labelFor(sel), options, visible: !!sel.offsetParent });
    }
    return result;
  });
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'filter-selects-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 4000));
await b.close();
