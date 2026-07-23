import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: ground the «⊕ Отчет комиссионера ▾» create dropdown + the «Тип документа»
// filter select options on #commissionreport. Settles whether the list unions
// in+out report types. Nothing is created. Creds from .env.local.
import { chromium } from 'playwright';

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
  const base = p.url().split('#')[0];
  await p.goto(`${base}#commissionreport`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);

  // A) Click the create button «Отчет комиссионера ▾» (the dropdown arrow) and read items.
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a, span, div')].find(
      (e) =>
        /^Отчет комиссионера/.test((e.textContent || '').trim()) &&
        e.getBoundingClientRect().top < 200,
    );
    if (btn) {
      // click the dropdown arrow within / next to it
      const arrow = btn.querySelector('[class*="arrow"], [class*="Arrow"], img') || btn;
      arrow.click();
    }
  });
  await p.waitForTimeout(1500);
  await shot('40-create-menu.png');
  out.createMenu = await p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"], [class*="Menu"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 30 && r.top > 100;
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const items = [...last.querySelectorAll('*')]
      .filter((e) => !e.children.length)
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 1 && t.length < 60);
    return { open: true, items: [...new Set(items)] };
  });
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(500);

  // B) Open «Фильтр», then read «Тип документа» select options.
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  if ((await fb.count()) && (await fb.isVisible().catch(() => false))) {
    await fb.click().catch(() => {});
    await p.waitForTimeout(2000);
  }
  // click the «Тип документа» select (it shows «Все»)
  await p.evaluate(() => {
    const lab = [...document.querySelectorAll('*')].find(
      (e) => !e.children.length && (e.textContent || '').trim() === 'Тип документа',
    );
    if (!lab) return;
    let el = lab.parentElement;
    for (let i = 0; i < 4 && el; i++) {
      const box = el.querySelector('select, [class*="combo"], [class*="Combo"], input, [tabindex]');
      if (box) {
        box.click();
        return;
      }
      el = el.parentElement;
    }
  });
  await p.waitForTimeout(1200);
  await shot('41-doctype-options.png');
  out.docTypeOptions = await p.evaluate(() => {
    // native select?
    const sel = [...document.querySelectorAll('select')].find((s) =>
      /Все/.test(s.textContent || ''),
    );
    if (sel) return { kind: 'select', options: [...sel.options].map((o) => o.textContent.trim()) };
    // popup list?
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="listbox"], [class*="dropdown"], [class*="Dropdown"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 20 && r.top > 100;
    });
    const last = pops[pops.length - 1];
    if (!last) return { kind: 'none' };
    const items = [...last.querySelectorAll('*')]
      .filter((e) => !e.children.length)
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && t.length < 50);
    return { kind: 'popup', options: [...new Set(items)] };
  });
  await p.keyboard.press('Escape').catch(() => {});

  // C) also read «Статус» select options (the status dropdown)
  await p.evaluate(() => {
    const lab = [...document.querySelectorAll('*')].find(
      (e) => !e.children.length && (e.textContent || '').trim() === 'Статус',
    );
    if (!lab) return;
    let el = lab.parentElement;
    for (let i = 0; i < 4 && el; i++) {
      const box = el.querySelector('select, [class*="combo"], [class*="Combo"], input, [tabindex]');
      if (box) {
        box.click();
        return;
      }
      el = el.parentElement;
    }
  });
  await p.waitForTimeout(1000);
  await shot('42-status-options.png');
  out.statusOptions = await p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="listbox"], [class*="dropdown"], [class*="Dropdown"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 20 && r.top > 100;
    });
    const last = pops[pops.length - 1];
    if (!last) return { kind: 'none' };
    const items = [...last.querySelectorAll('*')]
      .filter((e) => !e.children.length)
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && t.length < 50);
    return { kind: 'popup', options: [...new Set(items)] };
  });
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-createmenu-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
