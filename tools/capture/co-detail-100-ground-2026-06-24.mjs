// READ-ONLY comprehensive ground-truth for the CO /[id] → 100% 1:1 pass.
// Captures the REMAINING unknowns the layout pass didn't cover:
//   A. position NAME cell with an image product (img + bold code + name)
//   B. which meta fields have a «+» create button (DOM scan by label)
//   C. «Валюта» ✎ — what it opens (click, screenshot)
//   D. toolbar + top-right owner/«Смотрит»/«Изменения» cluster (clip)
//   E. «Скидка» column format («0%» percent vs plain number)
// Fresh login from .env.local (creds never printed). NEVER clicks Сохранить/Удалить.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'customerorder-detail-live-2026-06-24');
mkdirSync(OUT, { recursive: true });
// the first capture's order had image rows (a0fac2ff…); reopen it for the name cell.
const IMG_ORDER = 'a0fac2ff-6faa-11f1-0a80-1f67000852c8';

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

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120_000);
const out = {};
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  if ((await loginEl.inputValue().catch(() => '')).length === 0) {
    await loginEl.click().catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 20 }).catch(() => {});
  }
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]', 'input[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await page.waitForTimeout(12000);
  const base = page.url().split('#')[0];

  // open the image-product order directly via hash route
  await page.goto(`${base}#customerorder/edit?id=${IMG_ORDER}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(14000);
  out.opened = (await page.locator(':text-is("Создать документ") >> visible=true').count()) > 0;
  out.url = page.url();

  // D. toolbar + owner/«Смотрит»/«Изменения» top strip
  await shot('20-toolbar.png', { clip: { x: 0, y: 70, width: 1660, height: 58 } });
  await shot('21-owner-cluster.png', { clip: { x: 760, y: 80, width: 900, height: 130 } });

  // A. position NAME cell with image — clip first ~5 rows
  await shot('22-name-cells.png', { clip: { x: 0, y: 470, width: 760, height: 230 } });
  out.nameCells = await page
    .$$eval('.slick-row', (rows) =>
      rows.slice(0, 6).map((r) => {
        const hasImg = !!r.querySelector('img');
        return { hasImg, text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
      }),
    )
    .catch(() => []);

  // B. «+» create buttons per meta field — scan labels and look for a nearby +.
  out.plusButtons = await page.evaluate(() => {
    const labels = [
      'Организация', 'Контрагент', 'Склад', 'Договор', 'Проект', 'Канал продаж',
      'Валюта документа', 'Счёт', 'Уста', 'Санаси',
    ];
    const res = {};
    const all = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0);
    for (const lab of labels) {
      const node = all.find((e) => (e.textContent || '').trim() === lab);
      if (!node) { res[lab] = 'label-not-found'; continue; }
      // walk up to the field row, then look for a + / pencil within it
      let row = node;
      for (let i = 0; i < 5 && row.parentElement; i++) row = row.parentElement;
      const rowText = (row.textContent || '');
      const html = row.innerHTML || '';
      res[lab] = {
        hasPlus: /[＋+]/.test(rowText) || /plus|add/i.test(html),
        hasPencil: /✎|✏|pencil|edit/i.test(html) || /[✎✏]/.test(rowText),
      };
    }
    return res;
  });

  // E. «Скидка» column header + a data cell sample (percent?)
  out.discountSample = await page
    .$$eval('.slick-cell', (cells) => {
      const out = [];
      for (const c of cells) {
        const t = (c.textContent || '').trim();
        if (/%$/.test(t) && t.length <= 8) out.push(t);
      }
      return [...new Set(out)].slice(0, 8);
    })
    .catch(() => []);

  // C. «Валюта» ✎ — click the pencil next to Валюта and capture what opens.
  try {
    const valRow = page.locator(':text-is("Валюта документа") >> visible=true').first();
    if (await valRow.count()) {
      // the ✎ is a sibling icon; click the nearest pencil-like control after the label
      const pencil = page.locator('text=Валюта документа').locator('xpath=following::*[contains(@class,"pencil") or contains(@class,"edit") or name()="img"][1]');
      await pencil.first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await shot('23-valuta-pencil.png', { clip: { x: 0, y: 120, width: 900, height: 460 } });
      out.valutaPopupText = await page
        .$$eval('.gwt-PopupPanel, [class*=opupPanel]', (els) =>
          els.map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean),
        )
        .catch(() => []);
      await page.keyboard.press('Escape').catch(() => {});
    }
  } catch (e) {
    out.valutaErr = String(e).slice(0, 120);
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'co-100-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
