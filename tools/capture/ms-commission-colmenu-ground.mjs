// READ-ONLY: ground the #commissionreport GRID column ⚙ menu (the checklist the
// user showed) + re-read the toolbar + grid headers. The first list-ground failed
// to open this menu (open:false) → default columns were inferred, not grounded.
// Nothing saved. Creds from .env.local.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-reports-list-2026-06-27/moysklad');
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
const p = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])')
    .first()
    .fill(EMAIL)
    .catch(() => {});
  await p.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#commissionreport`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  out.url = p.url();

  // toolbar text (confirm Изменить/Печать present)
  out.toolbar = await p.evaluate(() =>
    [
      ...new Set(
        [...document.querySelectorAll('button, [role="button"], a')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top > 60 && r.top < 175 && r.width > 8 && r.height > 8;
          })
          .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t && t.length <= 30),
      ),
    ].slice(0, 25),
  );

  // grid headers in order (default-visible set, what actually renders)
  out.gridHeaders = await p.evaluate(() => {
    const ths = [...document.querySelectorAll('th')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return ths;
  });
  await shot('70-list-recheck.png');

  // Open the GRID column ⚙. It is the small gear at the far right of the header
  // row. Try several strategies; report which worked.
  const tryOpen = async (strategy) => {
    const ok = await p.evaluate((strat) => {
      const inHeader = (e) => {
        const r = e.getBoundingClientRect();
        return r.top > 60 && r.top < 260 && r.left > window.innerWidth - 260;
      };
      let gear = null;
      if (strat === 'th-last-icon') {
        const ths = [...document.querySelectorAll('th')];
        const last = ths[ths.length - 1];
        gear = last?.querySelector('img, [class*="gear"], [class*="settings"], [class*="Settings"], div, span') || last;
      } else if (strat === 'img-right') {
        gear = [...document.querySelectorAll('img')].filter(inHeader).pop();
      } else if (strat === 'any-small-right') {
        gear = [...document.querySelectorAll('img, span, div, button, td, th')]
          .filter((e) => {
            if (!inHeader(e)) return false;
            const r = e.getBoundingClientRect();
            return r.width > 6 && r.width < 36 && r.height > 6 && r.height < 36 && (e.textContent || '').trim() === '';
          })
          .pop();
      }
      if (gear) {
        gear.scrollIntoView({ block: 'center' });
        gear.click();
        return true;
      }
      return false;
    }, strategy);
    await p.waitForTimeout(1200);
    const menu = await p.evaluate(() => {
      const pops = [
        ...document.querySelectorAll(
          '.gwt-PopupPanel, [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"], [class*="Menu"]',
        ),
      ].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 90 && r.height > 80 && r.top > 60 && e.querySelector('input[type="checkbox"]');
      });
      const last = pops[pops.length - 1];
      if (!last) return { open: false };
      const items = [...last.querySelectorAll('label, li, [role="menuitemcheckbox"], div, tr')]
        .map((e) => {
          const cb = e.querySelector('input[type="checkbox"]');
          const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
          return cb && t && t.length < 40 ? { t, checked: cb.checked } : null;
        })
        .filter(Boolean);
      const seen = new Set();
      const u = [];
      for (const it of items) if (!seen.has(it.t)) { seen.add(it.t); u.push(it); }
      return { open: true, count: u.length, items: u };
    });
    return { ok, menu };
  };

  for (const strat of ['th-last-icon', 'img-right', 'any-small-right']) {
    const r = await tryOpen(strat);
    out[`colmenu_${strat}`] = r;
    if (r.menu.open && r.menu.count > 3) {
      out.columnMenu = { strategy: strat, ...r.menu };
      await shot('71-col-menu.png');
      break;
    }
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-colmenu-ground.json'), JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    { url: out.url, toolbar: out.toolbar, gridHeaders: out.gridHeaders, columnMenu: out.columnMenu, error: out.error },
    null,
    2,
  ),
);
await b.close();
