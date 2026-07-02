// READ-ONLY grounding of the moysklad «Списание» (loss) EDITOR (new/edit form).
// Opens an EXISTING loss via the row's edit-href (structurally identical to the
// /new form, just pre-filled), reads the toolbar, meta fields, position columns,
// bottom band, status dropdown. NEVER clicks Сохранить/Удалить/Провести — only
// reads DOM, opens dropdowns + Escape. Creds from .env.local, never printed.
//
// The /new editor and the /edit editor share the SAME GWT form in moysklad, so the
// edit grounding is the authoritative layout truth for /losses/new too.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/losses-new-2026-06-25/moysklad');
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
  p
    .screenshot(clip ? { path: resolve(OUT, f), clip } : { path: resolve(OUT, f), fullPage: false })
    .catch(() => {});

try {
  // ---- login ----
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

  // ---- open an existing loss editor via the row's edit-href ----
  const base = p.url().split('#')[0];
  await p.goto(`${base}#loss`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  // dismiss any leftover save modal
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  const editHref = await p.evaluate(() => {
    const a =
      document.querySelector('a[href*="loss/edit"]') ||
      document.querySelector('a[href*="loss/"]');
    return a ? a.getAttribute('href') : null;
  });
  out.editHref = editHref;
  if (editHref) {
    const url = editHref.startsWith('#') ? `${base}${editHref}` : editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await p
    .locator(':text-is("Сохранить") >> visible=true')
    .first()
    .waitFor({ timeout: 40000 })
    .catch(() => {});
  await p.waitForTimeout(6000);
  out.opened = (await p.locator(':text-is("Сохранить") >> visible=true').count()) > 0;
  out.url = p.url();

  // ---- screenshots: full page + bands ----
  await shot('10-editor-full.png', { x: 0, y: 0, width: 1680, height: 1000 });
  await p.screenshot({ path: resolve(OUT, '10b-editor-fullpage.png'), fullPage: true }).catch(() => {});
  await shot('11-toolbar.png', { x: 0, y: 100, width: 1680, height: 70 });
  await shot('12-meta.png', { x: 0, y: 150, width: 1300, height: 320 });
  await shot('13-positions.png', { x: 0, y: 420, width: 1680, height: 320 });

  // ---- toolbar buttons (top action group) ----
  out.toolbar = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('button, [class*="Button"], [role="button"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top > 95 && r.top < 175 && r.width > 10;
      })
      .map((el) => norm(el.textContent))
      .filter((t) => t && t.length < 40);
  });

  // ---- meta field labels (top block, label → control), in DOM/visual order ----
  out.metaFields = await p.evaluate(() => {
    const labels = [];
    for (const el of document.querySelectorAll('td, div, span, label')) {
      const r = el.getBoundingClientRect();
      if (r.top < 150 || r.top > 470 || r.height > 40 || r.width < 25) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 40 || el.children.length > 1) continue;
      if (/^[А-ЯA-Z][а-яёa-zА-ЯA-Z. ]+$/.test(t) && t.length >= 3)
        labels.push({ t, x: Math.round(r.left), y: Math.round(r.top) });
    }
    const seen = new Set();
    return labels
      .filter((l) => (seen.has(l.t) ? false : seen.add(l.t)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, 50);
  });

  // ---- position table column headers ----
  out.positionCols = await p.evaluate(() => {
    const heads = [...document.querySelectorAll('tr, .gwt-table-header, [role="row"]')].filter(
      (r) => {
        const t = r.getBoundingClientRect().top;
        return t > 380 && t < 520;
      },
    );
    let best = null;
    for (const h of heads) {
      const cells = [...h.querySelectorAll('th, td, [role="columnheader"], div')]
        .map((c) => (c.textContent || '').trim())
        .filter((t) => t && t.length < 24);
      if (cells.length > (best?.length ?? 0)) best = cells;
    }
    return best ? [...new Set(best)].slice(0, 24) : [];
  });

  // ---- bottom band: totals / Итого / Сумма / hints ----
  out.bottomBand = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('div, span, td')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top > 600 && r.top < 980 && r.width > 30;
    });
    return [...new Set(els.map((e) => norm(e.textContent)).filter((t) => t && t.length < 60))].slice(
      0,
      30,
    );
  });

  // ---- whole-page innertext keyword presence (sanity for fields we must mirror) ----
  out.keywords = await p.evaluate(() => {
    const body = document.body.innerText || '';
    const has = (w) => new RegExp(w).test(body);
    return {
      Организация: has('Организация'),
      Склад: has('Склад'),
      Проект: has('Проект'),
      Комментарий: has('Комментарий'),
      Причина: has('Причина'),
      'Статья расходов': has('Статья расходов'),
      Владелец: has('Владелец'),
      'Общий доступ': has('Общий доступ'),
      'Внешний код': has('Внешний код'),
      'Печать': has('Печать'),
      'Создать документ': has('Создать документ'),
      'Отправить': has('Отправить'),
      Изменить: has('Изменить'),
      Проведено: has('Проведено'),
      Скидка: has('Скидка'),
      Цена: has('Цена'),
      'Себестоимость': has('Себестоимость'),
    };
  });

  // ---- status pill / dropdown ----
  const statusTrig = p.locator(':text-is("Статус") >> visible=true').first();
  if (await statusTrig.count()) {
    await statusTrig.click().catch(() => {});
    await p.waitForTimeout(900);
    await shot('14-status.png');
    out.statusMenu = await p.evaluate(() => {
      const pops = [
        ...document.querySelectorAll('.gwt-PopupPanel, [role="menu"], .gwt-MenuBar-vertical'),
      ].filter((e) => e.getBoundingClientRect().height > 10);
      const last = pops[pops.length - 1];
      return last
        ? [...last.querySelectorAll('td, .gwt-MenuItem, [role="menuitem"], div')]
            .map((e) => (e.textContent || '').trim())
            .filter((t) => t && t.length < 40)
            .slice(0, 20)
        : [];
    });
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'editor-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
