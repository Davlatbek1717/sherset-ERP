// READ-ONLY grounding of the moysklad «Возврат поставщику» (purchase return) EDITOR.
// Opens an EXISTING return via the row's edit-href (structurally identical to the
// /new form, just pre-filled), reads the toolbar, meta fields, position columns,
// bottom band, status dropdown, owner widget. NEVER clicks Сохранить/Удалить/
// Провести/Создать — only reads DOM + opens dropdowns then Escape.
// Creds from .env.local, never printed.
//
// The /new editor and /edit editor share the SAME GWT form in moysklad, so the
// edit grounding is the authoritative layout truth for /purchase-returns/new too.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/purchase-return-new-2026-06-29/moysklad');
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

  // ---- open an existing purchase-return editor via the row's edit-href ----
  const base = p.url().split('#')[0];
  await p.goto(`${base}#purchasereturn`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  // count existing rows for context
  out.rowCount = await p.evaluate(
    () => document.querySelectorAll('a[href*="purchasereturn/edit"]').length,
  );
  const editHref = await p.evaluate(() => {
    const a =
      document.querySelector('a[href*="purchasereturn/edit"]') ||
      document.querySelector('a[href*="purchasereturn/"]');
    return a ? a.getAttribute('href') : null;
  });
  out.editHref = editHref;
  if (editHref) {
    const url = editHref.startsWith('#') ? `${base}${editHref}` : editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
  } else {
    // fallback: open a fresh create form via the «Возврат» / «+» button (NOT saved)
    for (const s of [
      'button:has-text("Возврат")',
      'a:has-text("Возврат")',
      '[title*="Добавить"]',
    ]) {
      const el = p.locator(s).first();
      if ((await el.count()) && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {});
        out.openedVia = s;
        break;
      }
    }
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
  await p
    .screenshot({ path: resolve(OUT, '10b-editor-fullpage.png'), fullPage: true })
    .catch(() => {});
  await shot('11-toolbar.png', { x: 0, y: 100, width: 1680, height: 70 });
  await shot('12-meta.png', { x: 0, y: 150, width: 1340, height: 340 });
  await shot('13-positions.png', { x: 0, y: 430, width: 1680, height: 320 });

  // ---- toolbar buttons (top action group) ----
  out.toolbar = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [
      ...new Set(
        [...document.querySelectorAll('button, [class*="Button"], [role="button"]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.top > 95 && r.top < 175 && r.width > 10;
          })
          .map((el) => norm(el.textContent))
          .filter((t) => t && t.length < 40),
      ),
    ];
  });

  // ---- meta field labels (top block), in DOM/visual order ----
  out.metaFields = await p.evaluate(() => {
    const labels = [];
    for (const el of document.querySelectorAll('td, div, span, label')) {
      const r = el.getBoundingClientRect();
      if (r.top < 150 || r.top > 470 || r.height > 40 || r.width < 25) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 40 || el.children.length > 1) continue;
      if (/^[А-ЯA-Z][а-яёa-zА-ЯA-Z./ -]+$/.test(t) && t.length >= 3)
        labels.push({ t, x: Math.round(r.left), y: Math.round(r.top) });
    }
    const seen = new Set();
    return labels
      .filter((l) => (seen.has(l.t) ? false : seen.add(l.t)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, 60);
  });

  // ---- position table column headers ----
  out.positionCols = await p.evaluate(() => {
    const heads = [...document.querySelectorAll('tr, .gwt-table-header, [role="row"]')].filter(
      (r) => {
        const t = r.getBoundingClientRect().top;
        return t > 390 && t < 540;
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
    return [
      ...new Set(els.map((e) => norm(e.textContent)).filter((t) => t && t.length < 60)),
    ].slice(0, 30);
  });

  // ---- whole-page keyword presence (fields we must mirror / suspects) ----
  out.keywords = await p.evaluate(() => {
    const body = document.body.innerText || '';
    const has = (w) => new RegExp(w).test(body);
    return {
      Организация: has('Организация'),
      Склад: has('Склад'),
      Контрагент: has('Контрагент'),
      Поставщик: has('Поставщик'),
      Договор: has('Договор'),
      Проект: has('Проект'),
      Комментарий: has('Комментарий'),
      Причина: has('Причина'),
      Приемка: has('Приемка|Приёмка'),
      Основание: has('Основание'),
      Валюта: has('Валюта'),
      Владелец: has('Владелец'),
      'Общий доступ': has('Общий доступ'),
      'Внешний код': has('Внешний код'),
      'Счет организации': has('Счет организации|Счёт организации'),
      'Счет контрагента': has('Счет контрагента|Счёт контрагента'),
      'Входящий номер': has('Входящий номер'),
      'Входящая дата': has('Входящая дата'),
      Печать: has('Печать'),
      'Создать документ': has('Создать'),
      Отправить: has('Отправить'),
      Изменить: has('Изменить'),
      Проведено: has('Проведено'),
      Статус: has('Статус'),
      Скидка: has('Скидка'),
      Цена: has('Цена'),
      'Сумма НДС': has('Сумма НДС'),
      Принято: has('Принято'),
      Остаток: has('Остаток'),
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
            .slice(0, 25)
        : [];
    });
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }

  // ---- owner widget (right of toolbar: «Владелец» Файзуллоев Ф. / Основной) ----
  out.ownerWidget = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('div, span, td')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top > 95 && r.top < 175 && r.left > 1100 && r.width > 20;
    });
    return [...new Set(els.map((e) => norm(e.textContent)).filter((t) => t && t.length < 50))].slice(
      0,
      12,
    );
  });
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'editor-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
