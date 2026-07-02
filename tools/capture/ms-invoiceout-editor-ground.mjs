// READ-ONLY live grounding of the moysklad «Счет покупателю» (invoiceout) EDITOR.
// Grounds: (1) an EXISTING doc editor (populated) — full/meta/lower screenshots,
// ordered meta-field labels, toolbar buttons, tab strip, position columns; (2) the
// inline-vs-modal behaviour of ref fields — clicks Контрагент / Договор / Проект /
// Канал продаж and screenshots + DOM-classifies whether moysklad shows an INLINE
// dropdown (gwt-SuggestBox popup) or a MODAL dialog; (3) the NEW create form via the
// list «Счет» button (opens the blank editor, NO persist). NEVER clicks
// Сохранить/Удалить/Да — navigation + opening fields/menus + Escape only.
// Credentials from .env.local, never printed.  (sibling of ms-invoicein-editor-ground.mjs)
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
const out = { site: SITE };
const shot = (f, clip) =>
  p
    .screenshot(clip ? { path: resolve(OUT, f), clip } : { path: resolve(OUT, f), fullPage: false })
    .catch(() => {});

// Classify what popped up after clicking a field: inline gwt suggest-popup vs modal dialog.
const classifyPopup = () =>
  p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 40 && r.height > 20;
    };
    const dialogs = [...document.querySelectorAll('.gwt-DialogBox, .modal, [role="dialog"]')].filter(
      vis,
    );
    const suggests = [
      ...document.querySelectorAll(
        '.gwt-SuggestBoxPopup, .gwt-PopupPanel .item, .gwt-MenuBarPopup, .gwt-PopupPanel',
      ),
    ].filter(vis);
    const overlay = !![...document.querySelectorAll('.gwt-PopupPanelGlass, .modal-backdrop')].find(
      vis,
    );
    const sampleDialog = dialogs[0];
    const samplePopup = suggests.sort(
      (a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height,
    )[0];
    return {
      dialogCount: dialogs.length,
      hasOverlayGlass: overlay,
      dialogText: sampleDialog ? norm(sampleDialog.textContent).slice(0, 120) : null,
      popupRect: samplePopup
        ? (() => {
            const r = samplePopup.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            };
          })()
        : null,
      verdict: dialogs.length > 0 && overlay ? 'MODAL' : samplePopup ? 'INLINE-POPUP' : 'NONE',
    };
  });

const clickFieldByLabel = async (label, file) => {
  try {
    const cap = p.locator(`:text-is("${label}") >> visible=true`).first();
    if (!(await cap.count())) return { label, found: false };
    const box = await cap.boundingBox();
    if (!box) return { label, found: false };
    await p.mouse.click(box.x + box.width + 120, box.y + box.height / 2).catch(() => {});
    await p.waitForTimeout(1300);
    await shot(file);
    const cls = await classifyPopup();
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(500);
    return { label, found: true, ...cls };
  } catch (e) {
    return { label, found: false, error: String(e).slice(0, 160) };
  }
};

const orderedMetaFields = () =>
  p.evaluate(() => {
    const labels = [];
    for (const el of document.querySelectorAll('td, div, span, label')) {
      const r = el.getBoundingClientRect();
      if (r.top < 110 || r.top > 600 || r.height > 40 || r.width < 24) continue;
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
        return r.top > 55 && r.top < 135 && r.width > 8;
      })
      .map((e) => (e.textContent || '').trim())
      .filter((t) => t && t.length < 28);
    return [...new Set(btns)].slice(0, 24);
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
  await p.goto(`${base}#invoiceout`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);
  const editHref = await p.evaluate(() => {
    const a = document.querySelector('a[href*="invoiceout/edit"]');
    return a ? a.getAttribute('href') : null;
  });
  out.editHref = editHref;

  // ---- EXISTING EDITOR (populated) ----
  if (editHref) {
    const url = editHref.startsWith('#') ? `${base}${editHref}` : editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p
      .locator(':text-is("Сохранить") >> visible=true')
      .first()
      .waitFor({ timeout: 40000 })
      .catch(() => {});
    await p.waitForTimeout(6000);
    out.editorOpened = (await p.locator(':text-is("Сохранить") >> visible=true').count()) > 0;

    await shot('10-editor-full.png');
    await shot('11-editor-meta.png', { x: 0, y: 110, width: 1340, height: 480 });
    await shot('12-editor-lower.png', { x: 0, y: 560, width: 1680, height: 430 });

    out.metaFields = await orderedMetaFields();
    out.editorToolbar = await toolbarButtons();

    out.tabs = await p.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"], .gwt-TabBar *, .tabs *')]
        .map((e) => (e.textContent || '').trim())
        .filter((t) => /Связанн|Файл|Задач|Событ|Изменен|Позиц|Документ|Главн/i.test(t) && t.length < 30);
      return [...new Set(tabs)].slice(0, 12);
    });

    out.positionColumns = await p.evaluate(() => {
      const heads = [
        ...document.querySelectorAll(
          'th, [role="columnheader"], .gwt-table-header td, .header td',
        ),
      ]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.top > 400 && r.width > 8;
        })
        .map((e) => (e.textContent || '').trim())
        .filter((t) => t && t.length < 26);
      return [...new Set(heads)].slice(0, 24);
    });

    out.headerHints = await p.evaluate(() => {
      const body = document.body.innerText || '';
      const rate = body.match(/1\s*[A-Za-zА-Яа-я$]{1,6}\s*=\s*[\d  .,]+/);
      return {
        hasValuta: /Валюта/.test(body),
        rateText: rate ? rate[0].trim() : null,
        hasPlanData: /План\.?\s*дата|Срок оплаты/.test(body),
        hasNds: /НДС/.test(body),
        hasSchetOrg: /Счёт организации|Счет организации/.test(body),
        hasSchetKontr: /Счёт контрагента|Счет контрагента/.test(body),
        hasProekt: /Проект/.test(body),
        hasDogovor: /Договор/.test(body),
        hasKanalProdazh: /Канал продаж/.test(body),
        hasZakazPokupatelya: /Заказ покупателя/.test(body),
        hasSklad: /Склад/.test(body),
        hasVladelec: /Владелец/.test(body),
        hasOtgruzheno: /Отгружено/.test(body),
        hasRezerv: /Резерв/.test(body),
      };
    });

    // ---- INLINE-vs-MODAL: click ref fields, screenshot what pops up ----
    out.refFieldBehaviour = {};
    out.refFieldBehaviour.kontragent = await clickFieldByLabel(
      'Контрагент',
      '30-click-kontragent.png',
    );
    out.refFieldBehaviour.dogovor = await clickFieldByLabel('Договор', '31-click-dogovor.png');
    out.refFieldBehaviour.proekt = await clickFieldByLabel('Проект', '32-click-proekt.png');
    out.refFieldBehaviour.kanal = await clickFieldByLabel('Канал продаж', '34-click-kanal.png');

    // position-name field: click the first empty «Товар» cell in the grid (best effort)
    try {
      const addRow = p.locator(':text-is("Добавить позицию") >> visible=true').first();
      if (await addRow.count()) {
        const bx = await addRow.boundingBox();
        if (bx) {
          await p.mouse.click(bx.x + 200, bx.y).catch(() => {});
          await p.waitForTimeout(1200);
          await shot('33-click-position-name.png');
          out.refFieldBehaviour.positionName = await classifyPopup();
          await p.keyboard.press('Escape').catch(() => {});
        }
      }
    } catch {
      /* best effort */
    }
  }

  // ---- NEW create form (open blank editor via list «Счет» button) ----
  await p.goto(`${base}#invoiceout`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  try {
    const createBtn = p.locator(':text-is("Счет") >> visible=true').first();
    if (await createBtn.count()) {
      await createBtn.click().catch(() => {});
      await p
        .locator(':text-is("Сохранить") >> visible=true')
        .first()
        .waitFor({ timeout: 30000 })
        .catch(() => {});
      await p.waitForTimeout(4000);
      await shot('40-new-editor-full.png');
      await shot('41-new-editor-meta.png', { x: 0, y: 110, width: 1340, height: 480 });
      out.newToolbar = await toolbarButtons();
      out.newMetaFields = await orderedMetaFields();
      out.newHeaderHints = await p.evaluate(() => {
        const body = document.body.innerText || '';
        return {
          hasProvedeno: /Проведено/.test(body),
          provedenoChecked: (() => {
            const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((c) => {
              const lbl = c.closest('label') || c.parentElement;
              return lbl && /Проведено/.test(lbl.textContent || '');
            });
            return cb ? cb.checked : null;
          })(),
          hasKanalProdazh: /Канал продаж/.test(body),
          hasPlanData: /План\.?\s*дата|Срок оплаты/.test(body),
        };
      });
    } else {
      out.newToolbar = '(«Счет» create button not found)';
    }
  } catch (e) {
    out.newError = String(e).slice(0, 300);
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'editor-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
