// READ-ONLY live grounding of the moysklad «Деньги → Платежи» FILTER panel
// (#paymentin list → click «Фильтр» → capture every field + control type +
// whether a field opens a MULTI-SELECT checkbox dropdown). NEVER saves/deletes
// — only opens the filter + inspects one picker, then Escapes.
// Credentials from .env.local, never printed. Mirrors ms-paymentin-detail-ground.mjs.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/payments-in-audit-2026-06-25/moysklad');
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
const out = { site: SITE };
const shot = (f, clip) =>
  p.screenshot(clip ? { path: resolve(OUT, f), clip } : { path: resolve(OUT, f), fullPage: false }).catch(() => {});

try {
  // ---- login ----
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
  await p.waitForTimeout(12000);
  await p.keyboard.press('Enter').catch(() => {});
  await p.waitForTimeout(4000);
  out.loggedInUrl = p.url();

  // ---- LIST ----
  const base = p.url().split('#')[0];
  await p.goto(`${base}#paymentin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);

  // ---- open «Фильтр» ----
  const filterBtn = p.locator(':text-is("Фильтр") >> visible=true').first();
  out.filterButtonFound = (await filterBtn.count()) > 0;
  if (out.filterButtonFound) {
    await filterBtn.click().catch(() => {});
    await p.waitForTimeout(3000);
  }
  await shot('30-filter-open.png');
  await shot('31-filter-panel.png', { x: 0, y: 120, width: 1680, height: 760 });

  // capture every filter ROW: label + the control kind in that row
  out.filterFields = await p.evaluate(() => {
    // moysklad filter rows are label/control pairs in a popup/panel. Collect
    // label-like texts that sit left of a control, with the control's tag.
    const rows = [];
    const labelEls = [...document.querySelectorAll('td, div, span, label')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 110 || r.top > 920 || r.height > 36 || r.width < 30 || r.width > 260) return false;
      const t = (el.textContent || '').trim();
      return /^[А-ЯA-Z][а-яёa-zA-Z.,()№/ -]+\*?:?$/.test(t) && t.length >= 3 && t.length < 32 && el.children.length <= 1;
    });
    const seen = new Set();
    for (const el of labelEls) {
      const t = (el.textContent || '').trim().replace(/:$/, '');
      if (seen.has(t)) continue;
      seen.add(t);
      const r = el.getBoundingClientRect();
      // find the nearest control to the right on the same row
      let kind = 'unknown';
      const candidates = [...document.querySelectorAll('input, select, button, .gwt-ListBox, [role="combobox"], [role="listbox"]')];
      for (const c of candidates) {
        const cr = c.getBoundingClientRect();
        if (Math.abs(cr.top - r.top) < 24 && cr.left >= r.right - 8 && cr.left < r.right + 420) {
          kind = c.tagName.toLowerCase() + (c.getAttribute('type') ? `[${c.getAttribute('type')}]` : '');
          break;
        }
      }
      rows.push({ label: t, control: kind, x: Math.round(r.left), y: Math.round(r.top) });
    }
    return rows.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 40);
  });

  // ---- probe ONE reference field (Контрагент) for multi-select ----
  const agentField = p.locator(':text-is("Контрагент") >> visible=true').first();
  if (await agentField.count()) {
    await agentField.click().catch(() => {});
    await p.waitForTimeout(1500);
    await shot('32-filter-agent-open.png');
    out.agentDropdown = await p.evaluate(() => {
      const pops = [...document.querySelectorAll('.gwt-PopupPanel, [role="listbox"], [role="menu"]')].filter(
        (e) => e.getBoundingClientRect().height > 20,
      );
      const last = pops[pops.length - 1];
      if (!last) return { hasCheckboxes: false, sampleItems: [] };
      const hasCheckboxes = last.querySelectorAll('input[type="checkbox"]').length > 0;
      const sampleItems = [...last.querySelectorAll('td, .gwt-MenuItem, [role="option"], div')]
        .map((e) => (e.textContent || '').trim())
        .filter((t) => t && t.length < 50)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 12);
      const hasSearch = last.querySelectorAll('input[type="text"]').length > 0;
      return { hasCheckboxes, hasSearch, sampleItems };
    });
    await p.keyboard.press('Escape').catch(() => {});
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'payments-filter-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
