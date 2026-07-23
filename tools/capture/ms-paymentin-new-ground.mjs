// READ-ONLY live grounding of the moysklad «Входящий платёж» (paymentin) CREATE editor.
// «+ Приход» on the «Платежи» page opens this. Grounds: (1) an EXISTING doc editor
// (populated) — full/meta/lower screenshots + ordered meta-field labels + toolbar + tabs
// + header hints (Статус/Владелец/Валюта/Счёт орг/контр/Проект/Договор); (2) the «Статус»
// pill dropdown options; (3) the «Создать» / Действия toolbar menus; (4) the BLANK create
// form (via list create button) — toolbar + meta labels. NEVER clicks Сохранить/Удалить/Да —
// navigation + opening fields/menus + Escape only. Credentials from .env.local, never printed.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/payments-in-new-2026-06-26/moysklad');
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
const out = { site: SITE };
const shot = (f, clip) =>
  p
    .screenshot(clip ? { path: resolve(OUT, f), clip } : { path: resolve(OUT, f), fullPage: false })
    .catch(() => {});

const metaLabels = () =>
  p.evaluate(() => {
    const labels = [];
    for (const el of document.querySelectorAll('td, div, span, label')) {
      const r = el.getBoundingClientRect();
      if (r.top < 110 || r.top > 640 || r.height > 40 || r.width < 24) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 42 || el.children.length > 1) continue;
      if (/^[А-ЯA-Z][а-яёa-z.,()\/ -]+\*?$/.test(t) && t.length >= 3)
        labels.push({ t, x: Math.round(r.left), y: Math.round(r.top) });
    }
    const seen = new Set();
    return labels
      .filter((l) => (seen.has(l.t) ? false : seen.add(l.t)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, 60);
  });

const toolbarButtons = () =>
  p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a.Button, .Button, .toolbar *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 55 && r.top < 140 && r.width > 8;
      })
      .map((e) => (e.textContent || '').trim())
      .filter((t) => t && t.length < 28);
    return [...new Set(btns)].slice(0, 28);
  });

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
  await p.keyboard.press('Enter').catch(() => {});
  await p.waitForTimeout(4000);
  out.loggedInUrl = p.url();
  const base = p.url().split('#')[0];

  // ---- LIST → grab first editor href ----
  await p.goto(`${base}#paymentin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);
  await shot('05-list.png');
  out.editHref = await p.evaluate(() => {
    const a = document.querySelector('a[href*="paymentin/edit"]');
    return a ? a.getAttribute('href') : null;
  });
  // create-button label(s) present on the list toolbar
  out.listCreateButtons = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a.Button, .Button')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 55 && r.top < 140 && r.width > 8;
      })
      .map((e) => (e.textContent || '').trim())
      .filter((t) => t && t.length < 28);
    return [...new Set(btns)];
  });

  // ---- EXISTING EDITOR (populated) ----
  if (out.editHref) {
    const url = out.editHref.startsWith('#') ? `${base}${out.editHref}` : out.editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p
      .locator(':text-is("Сохранить") >> visible=true')
      .first()
      .waitFor({ timeout: 40000 })
      .catch(() => {});
    await p.waitForTimeout(6000);
    out.editorOpened = (await p.locator(':text-is("Сохранить") >> visible=true').count()) > 0;

    await shot('10-editor-full.png');
    await shot('11-editor-meta.png', { x: 0, y: 110, width: 1340, height: 520 });
    await shot('12-editor-lower.png', { x: 0, y: 560, width: 1680, height: 430 });
    await shot('13-editor-right.png', { x: 1100, y: 55, width: 580, height: 220 });

    out.metaFields = await metaLabels();
    out.editorToolbar = await toolbarButtons();

    out.tabs = await p.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"], .gwt-TabBar *, .tabs *')]
        .map((e) => (e.textContent || '').trim())
        .filter((t) => /Связанн|Файл|Задач|Событ|Изменен|Позиц|Документ/i.test(t) && t.length < 30);
      return [...new Set(tabs)].slice(0, 12);
    });

    out.headerHints = await p.evaluate(() => {
      const body = document.body.innerText || '';
      const rate = body.match(/1\s*[A-Za-zА-Яа-я$]{1,6}\s*=\s*[\d  .,]+/);
      return {
        hasValuta: /Валюта/.test(body),
        rateText: rate ? rate[0].trim() : null,
        hasVhodNomer: /Входящий номер/.test(body),
        hasVhodData: /Входящая дата/.test(body),
        hasNaznachenie: /Назначение платежа/.test(body),
        hasStatus: /Статус/.test(body),
        hasProvedeno: /Проведен/.test(body),
        hasNds: /НДС|Сумма НДС/.test(body),
        hasSchetOrg: /Счёт организации|Счет организации/.test(body),
        hasSchetKontr: /Счёт контрагента|Счет контрагента/.test(body),
        hasProekt: /Проект/.test(body),
        hasDogovor: /Договор/.test(body),
        hasVladelec: /Владелец/.test(body),
        hasSmotrit: /Смотр/.test(body),
        hasIzmeneniya: /Изменени/.test(body),
        hasInputNds: /Входящий НДС/.test(body),
      };
    });

    // ---- «Статус» pill dropdown — click it, capture options ----
    try {
      const st = p.locator(':text-is("Статус") >> visible=true').first();
      if (await st.count()) {
        const bx = await st.boundingBox();
        if (bx) {
          await p.mouse.click(bx.x + bx.width + 90, bx.y + bx.height / 2).catch(() => {});
          await p.waitForTimeout(1200);
          await shot('20-status-dropdown.png');
          out.statusOptions = await p.evaluate(() => {
            const items = [...document.querySelectorAll('.gwt-PopupPanel *, [role="menuitem"], .menu-item, .item')]
              .map((e) => (e.textContent || '').trim())
              .filter((t) => t && t.length < 30);
            return [...new Set(items)].slice(0, 20);
          });
          await p.keyboard.press('Escape').catch(() => {});
          await p.waitForTimeout(400);
        }
      }
    } catch (e) {
      out.statusError = String(e).slice(0, 160);
    }

    // ---- toolbar menus: «Создать», «Действия», «Печать», «...» ----
    out.toolbarMenus = {};
    for (const [key, label] of [
      ['create', 'Создать'],
      ['actions', 'Действия'],
      ['print', 'Печать'],
    ]) {
      try {
        const btn = p.locator(`:text-is("${label}") >> visible=true`).first();
        if (await btn.count()) {
          await btn.click().catch(() => {});
          await p.waitForTimeout(1000);
          await shot(`2${key === 'create' ? 1 : key === 'actions' ? 2 : 3}-menu-${key}.png`);
          out.toolbarMenus[key] = await p.evaluate(() => {
            const items = [...document.querySelectorAll('.gwt-PopupPanel *, [role="menuitem"], .menu-item, .item')]
              .map((e) => (e.textContent || '').trim())
              .filter((t) => t && t.length < 40);
            return [...new Set(items)].slice(0, 24);
          });
          await p.keyboard.press('Escape').catch(() => {});
          await p.waitForTimeout(400);
        }
      } catch {
        /* best effort */
      }
    }
  }

  // ---- BLANK create form (open via list create button) ----
  await p.goto(`${base}#paymentin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  try {
    // the incoming-payments list create button is labeled «Входящий платеж»
    let createBtn = p.locator(':text-is("Входящий платеж") >> visible=true').first();
    if (!(await createBtn.count())) createBtn = p.locator(':text-is("Приход") >> visible=true').first();
    if (await createBtn.count()) {
      await createBtn.click().catch(() => {});
      await p
        .locator(':text-is("Сохранить") >> visible=true')
        .first()
        .waitFor({ timeout: 30000 })
        .catch(() => {});
      await p.waitForTimeout(4000);
      await shot('40-new-editor-full.png');
      await shot('41-new-editor-meta.png', { x: 0, y: 110, width: 1340, height: 520 });
      out.newToolbar = await toolbarButtons();
      out.newMetaFields = await metaLabels();
    } else {
      out.newToolbar = '(«Входящий платеж» create button not found)';
    }
  } catch (e) {
    out.newError = String(e).slice(0, 300);
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'paymentin-new-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
