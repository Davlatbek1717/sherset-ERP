// READ-ONLY: prove the ORIGIN of «Тип возврата» + «Уста» on the moysklad #demand
// filter. Custom (additional) fields come from the entity's ATTRIBUTE METADATA —
// each has a UUID `id`, a `type`, and an `entityType`/`customEntityMeta`. Standard
// fields don't. We (1) intercept moysklad API responses and capture the JSON
// context around each label, (2) inspect the filter-field DOM control id/name for a
// UUID (custom) vs a semantic key (standard). Nothing is written. Creds from .env.local.
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
const TARGETS = ['Тип возврата', 'Уста'];

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = { metadataHits: [], domControls: {} };

// Intercept JSON responses; when a body mentions a target label, extract the
// enclosing JSON object so we can see if it's an attribute (UUID id + type).
p.on('response', async (res) => {
  try {
    const url = res.url();
    const ct = (res.headers()['content-type'] || '');
    if (!/json/.test(ct)) return;
    if (!/moysklad/.test(url)) return;
    const text = await res.text();
    for (const label of TARGETS) {
      if (!text.includes(label)) continue;
      // pull a window around each occurrence to inspect the JSON shape
      let idx = 0;
      const wins = [];
      while ((idx = text.indexOf(label, idx)) !== -1 && wins.length < 3) {
        wins.push(text.slice(Math.max(0, idx - 320), idx + 120).replace(/\s+/g, ' '));
        idx += label.length;
      }
      out.metadataHits.push({ label, url: url.split('?')[0].slice(-80), windows: wins });
    }
  } catch {}
});

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
  await p.goto(`${base}#demand`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  // open «Фильтр» to force the filter metadata to render
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  await fb.click().catch(() => {});
  await p.waitForTimeout(3000);

  // DOM: for each label (targets + a known-standard control «Контрагент»),
  // find the nearest input/select and dump its identifying attributes + whether
  // any id/name/for contains a UUID (custom-attribute marker).
  out.domControls = await p.evaluate((labels) => {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const result = {};
    for (const lbl of labels) {
      const labelEl = [...document.querySelectorAll('.gwt-Label, label, span, div')].find(
        (e) => !e.children.length && (e.textContent || '').trim() === lbl,
      );
      if (!labelEl) {
        result[lbl] = { found: false };
        continue;
      }
      // walk up + find the control
      let el = labelEl.parentElement;
      let ctrl = null;
      for (let i = 0; i < 5 && el; i++) {
        ctrl = el.querySelector('input, select, [class*="combo"], [class*="Combo"], [tabindex]');
        if (ctrl) break;
        el = el.parentElement;
      }
      const around = (labelEl.closest('td,div')?.outerHTML || labelEl.parentElement?.outerHTML || '').slice(0, 600);
      result[lbl] = {
        found: true,
        ctrlTag: ctrl?.tagName,
        ctrlId: ctrl?.id || null,
        ctrlName: ctrl?.getAttribute?.('name') || null,
        ctrlClass: (ctrl?.className || '').toString().slice(0, 120),
        uuidNearby: uuidRe.test(around) ? (around.match(uuidRe)?.[0] ?? null) : null,
        htmlSnippet: around.replace(/\s+/g, ' '),
      };
    }
    return result;
  }, [...TARGETS, 'Контрагент', 'Адрес доставки']);

  await p.screenshot({ path: resolve(OUT, '50-customfield-origin.png') });
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'customfield-origin.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
