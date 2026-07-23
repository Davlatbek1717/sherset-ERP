import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY grounding of an EXISTING moysklad «Счет покупателю» editor (the [id]/edit
// view) — to confirm [id]-specific chrome vs the blank /new form: record-nav «N из M»,
// title-row status pills (Оплачено/Отгружено?), toolbar. Opens the first list row's
// editor by its href. NEVER saves. Creds from .env.local.
import { chromium } from 'playwright';

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
const shot = (f, clip) =>
  p.screenshot(clip ? { path: resolve(OUT, f), clip } : { path: resolve(OUT, f) }).catch(() => {});

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
  await p.waitForTimeout(12000);
  // Click the FIRST data row (opens its editor). moysklad rows = the grid's first cell link.
  out.editHref = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) =>
      /invoiceout\/edit/.test(x.getAttribute('href') || ''),
    );
    return a ? a.getAttribute('href') : null;
  });
  if (!out.editHref) {
    // fallback: click first row cell
    const firstRow = p.locator('.grid-canvas .slick-row, [class*="row"]').first();
    await firstRow.click({ position: { x: 120, y: 8 } }).catch(() => {});
  } else {
    const url = out.editHref.startsWith('#') ? `${base}${out.editHref}` : out.editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await p
    .locator(':text-is("Сохранить") >> visible=true')
    .first()
    .waitFor({ timeout: 40000 })
    .catch(() => {});
  await p.waitForTimeout(6000);

  await shot('50-id-editor-full.png');
  await shot('51-id-editor-titlerow.png', { x: 0, y: 108, width: 1340, height: 80 });
  await shot('52-id-editor-toolbar.png', { x: 0, y: 105, width: 900, height: 40 });

  out.titleRow = await p.evaluate(() => {
    // text in the title band (y 108..190): «Счет покупателю № … от … Статус … Проведено …» + any pills
    const items = [];
    for (const el of document.querySelectorAll('div, span, td, button, a')) {
      const r = el.getBoundingClientRect();
      if (r.top < 108 || r.top > 195 || r.height > 36 || r.width < 8 || el.children.length > 1)
        continue;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 40) items.push({ t, x: Math.round(r.left), y: Math.round(r.top) });
    }
    const seen = new Set();
    return items
      .filter((i) => (seen.has(i.t + i.x) ? false : seen.add(i.t + i.x)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, 30);
  });

  out.toolbar = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a.Button, .Button')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 55 && r.top < 135 && r.width > 8;
      })
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && t.length < 28);
    return [...new Set(btns)].slice(0, 24);
  });

  out.headerSignals = await p.evaluate(() => {
    const body = document.body.innerText || '';
    return {
      hasRecordNav: /\b\d+\s+из\s+\d+\b/.test(body),
      recordNavText: (body.match(/\b\d+\s+из\s+\d+\b/) || [null])[0],
      hasOplachenoPill: /Оплачен|Не оплачен|Частично оплачен/.test(body),
      hasOtgruzhenoPill: /Отгружен|Не отгружен/.test(body),
      hasStatusPill: /Статус/.test(body),
      hasProvedeno: /Проведено/.test(body),
    };
  });
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'id-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
