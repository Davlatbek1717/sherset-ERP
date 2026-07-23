// READ-ONLY: open an EXISTING moysklad Отгрузка (no save) and capture its
// «Дополнительные поля» (custom fields) section — the authoritative list of THIS
// account's custom attributes on a demand. Also re-search ALL responses for both
// «Тип возврата» and «Уста». Determines standard-vs-custom for each. Never saves.
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
const labelSeen = { 'Тип возврата': [], Уста: [] };
p.on('response', async (res) => {
  try {
    const ct = res.headers()['content-type'] || '';
    if (!/json|text/.test(ct)) return;
    const t = await res.text();
    for (const lbl of Object.keys(labelSeen)) {
      if (t.includes(lbl)) labelSeen[lbl].push(res.url().split('/').slice(-1)[0].split('?')[0]);
    }
  } catch {}
});

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

  // open the first demand row (click its № link → edit view, read-only; we never save)
  const opened = await p.evaluate(() => {
    const link = document.querySelector('a[href*="demand/edit"], td a');
    if (link) { link.scrollIntoView(); link.click(); return link.textContent.trim(); }
    return null;
  });
  out.openedRow = opened;
  await p.waitForTimeout(8000);
  out.docUrl = p.url();
  await p.screenshot({ path: resolve(OUT, '60-demand-doc.png'), fullPage: true });

  // find the «Дополнительные поля» section + list every field label in the open doc
  out.docFields = await p.evaluate(() => {
    const all = [...document.querySelectorAll('.gwt-Label, label, span, div')];
    // section header
    const hdr = all.find((e) => /Дополнительные поля|Доп\. поля|Дополнительно/i.test((e.textContent || '').trim()) && (e.textContent || '').trim().length < 30);
    // all field-like labels in the doc form
    const labels = all
      .filter((e) => !e.children.length)
      .map((e) => ({ t: (e.textContent || '').trim(), top: Math.round(e.getBoundingClientRect().top) }))
      .filter((x) => x.t.length > 1 && x.t.length < 40);
    const hasReturnType = labels.some((l) => l.t === 'Тип возврата');
    const hasUsta = labels.some((l) => l.t === 'Уста');
    // labels that appear AFTER the «Дополнительные поля» header (custom fields)
    let customAfter = [];
    if (hdr) {
      const hy = hdr.getBoundingClientRect().top;
      customAfter = [...new Set(labels.filter((l) => l.top >= hy - 5 && l.top < hy + 220).map((l) => l.t))];
    }
    return {
      hasAdditionalSection: !!hdr,
      additionalHeaderText: hdr?.textContent?.trim() || null,
      customFieldsAfterHeader: customAfter,
      docHasReturnTypeLabel: hasReturnType,
      docHasUstaLabel: hasUsta,
    };
  });
} catch (e) {
  out.error = String(e).slice(0, 500);
}
out.labelInResponses = {
  'Тип возврата': [...new Set(labelSeen['Тип возврата'])],
  Уста: [...new Set(labelSeen.Уста)],
};
writeFileSync(resolve(OUT, 'demand-doc-customfields.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
