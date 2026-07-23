// READ-ONLY: reliably open an existing moysklad Отгрузка (Playwright click, no save),
// then list every field label in the doc form + isolate the «Дополнительные поля»
// (custom-fields) section. Determines if «Тип возврата» / «Уста» are doc custom fields.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/demands-list-2026-06-26/moysklad');
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
const p = await (await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(EMAIL).catch(() => {});
  await p.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await p.waitForTimeout(12000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#demand`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(10000);

  // close the filter so it doesn't pollute the label scan
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  if ((await fb.count())) { await fb.click().catch(() => {}); await p.waitForTimeout(1000); }

  // open first demand: real Playwright click on the № link (GWT-friendly)
  const numLink = p.locator('a[href*="demand/edit"]').first();
  let clicked = false;
  if (await numLink.count()) { await numLink.click().catch(() => {}); clicked = true; }
  if (!clicked) {
    // fallback: double-click the first data row
    await p.locator('table tr').nth(1).dblclick().catch(() => {});
  }
  await p.waitForTimeout(9000);
  out.docUrl = p.url();
  await p.screenshot({ path: resolve(OUT, '60-demand-doc.png'), fullPage: true });

  out.scan = await p.evaluate(() => {
    const leaf = [...document.querySelectorAll('.gwt-Label, label, span, div')]
      .filter((e) => !e.children.length);
    const labels = leaf
      .map((e) => ({ t: (e.textContent || '').trim(), top: Math.round(e.getBoundingClientRect().top), left: Math.round(e.getBoundingClientRect().left) }))
      .filter((x) => x.t.length > 1 && x.t.length < 45 && x.top > 80);
    const hdr = leaf.find((e) => /^Дополнительные поля$|^Доп\. поля$/i.test((e.textContent || '').trim()));
    let afterHeader = [];
    if (hdr) {
      const hy = hdr.getBoundingClientRect().top;
      afterHeader = [...new Set(labels.filter((l) => l.top >= hy - 5 && l.top < hy + 300).map((l) => l.t))];
    }
    const find = (t) => labels.find((l) => l.t === t);
    return {
      onEditForm: /demand\/edit/.test(location.hash) || !!hdr,
      hasAdditionalHeader: !!hdr,
      customFieldsAfterHeader: afterHeader,
      returnType: find('Тип возврата') ? { top: find('Тип возврата').top, left: find('Тип возврата').left } : null,
      usta: find('Уста') ? { top: find('Уста').top, left: find('Уста').left } : null,
      additionalHeaderTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
    };
  });
  // close without saving
  await p.keyboard.press('Escape').catch(() => {});
} catch (e) {
  out.error = String(e).slice(0, 500);
}
writeFileSync(resolve(OUT, 'demand-doc-open.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
