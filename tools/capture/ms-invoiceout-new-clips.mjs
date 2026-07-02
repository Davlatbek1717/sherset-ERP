// READ-ONLY tight-clip re-ground of the moysklad «Счет покупателю» CREATE form, for
// three money/state-critical regions: (a) title row «Проведено» checkbox state,
// (b) totals VAT toggles (НДС / Цена включает НДС), (c) position header (НДС col + ⚙).
// Opens the blank form via the list «Счет» button. NEVER saves. Creds from .env.local.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/invoices-out-new-2026-06-26/moysklad');
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
const shot = (f, clip) => p.screenshot({ path: resolve(OUT, f), clip }).catch(() => {});

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
  await p.keyboard.press('Enter').catch(() => {});
  await p.waitForTimeout(3000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#invoiceout`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  const createBtn = p.locator(':text-is("Счет") >> visible=true').first();
  await createBtn.click().catch(() => {});
  await p
    .locator(':text-is("Сохранить") >> visible=true')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {});
  await p.waitForTimeout(4000);

  await shot('clip-title.png', { x: 30, y: 152, width: 720, height: 38 });
  await shot('clip-totals.png', { x: 720, y: 540, width: 420, height: 105 });
  await shot('clip-poshdr.png', { x: 30, y: 448, width: 1080, height: 28 });

  // Read the actual checked-state of the three checkboxes from the DOM (ground truth).
  out.checkboxes = await p.evaluate(() => {
    const pick = (re) => {
      const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((c) => {
        const lbl = c.closest('label') || c.parentElement?.parentElement || c.parentElement;
        return lbl && re.test(lbl.textContent || '');
      });
      return cb ? cb.checked : 'not-found';
    };
    return {
      provedeno: pick(/Проведено/),
      nds: pick(/^.{0,4}НДС:?$/m),
      priceIncludesNds: pick(/Цена включает НДС/),
    };
  });
  // Also dump all checkbox label/checked pairs near the top for disambiguation.
  out.allCheckboxes = await p.evaluate(() =>
    [...document.querySelectorAll('input[type="checkbox"]')].slice(0, 12).map((c) => {
      const lbl = c.closest('label') || c.parentElement;
      const r = c.getBoundingClientRect();
      return {
        checked: c.checked,
        y: Math.round(r.y),
        label: ((lbl && lbl.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      };
    }),
  );
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'clips-state.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
