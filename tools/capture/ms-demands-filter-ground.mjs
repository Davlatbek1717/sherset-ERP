// READ-ONLY: ground the moysklad «Отгрузки» FILTER precisely (new design).
//  A) panel field labels IN ORDER, scoped to the filter panel (the box that
//     contains the «Найти» button) — NOT the grid headers.
//  B) open the ⚙ field-visibility menu → canonical field list + checked state
//     (this separates STANDARD fields from this account's custom fields).
//  C) click «Контрагент» + «Склад» inside the panel → confirm inline
//     checkbox-dropdown (multi-select) + search input.
// Nothing is saved (filter selections persist nothing). Creds from .env.local.
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
const p = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f) }).catch(() => {});

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

  // ensure filter is open (button «Фильтр»)
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  if ((await fb.count()) && (await fb.isVisible().catch(() => false))) {
    await fb.click().catch(() => {});
    await p.waitForTimeout(2000);
  }

  // A) panel field labels IN ORDER, scoped to the panel containing «Найти»
  out.panelFields = await p.evaluate(() => {
    // find the filter panel: nearest ancestor of the «Найти» button that also
    // contains «Очистить»
    const findBtn = [...document.querySelectorAll('button, a, span, div')].find(
      (e) => (e.textContent || '').trim() === 'Найти',
    );
    if (!findBtn) return { error: 'no Найти' };
    let panel = findBtn;
    for (let i = 0; i < 8 && panel.parentElement; i++) {
      panel = panel.parentElement;
      if ((panel.textContent || '').includes('Очистить') && panel.querySelectorAll('input,select,[class*="combo"],[class*="Combo"]').length > 5)
        break;
    }
    const pr = panel.getBoundingClientRect();
    // collect leaf label-like nodes inside the panel, above the grid
    const labs = [];
    for (const e of panel.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
      const r = e.getBoundingClientRect();
      if (t.length > 1 && t.length < 34 && r.width > 0 && r.height > 0 && !/^[\d\s.,:–-]+$/.test(t))
        labs.push({ t, top: Math.round(r.top), left: Math.round(r.left) });
    }
    labs.sort((a, b) => a.top - b.top || a.left - b.left);
    const seen = new Set();
    const ordered = [];
    for (const l of labs) {
      const key = l.t;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(l);
      }
    }
    return { panelRect: { w: Math.round(pr.width), h: Math.round(pr.height) }, labels: ordered };
  });

  // B) open the ⚙ gear inside the filter panel → field-visibility checklist
  // The gear sits next to Найти/Очистить/bookmark. Click the last small icon button there.
  await p.evaluate(() => {
    const findBtn = [...document.querySelectorAll('button, a, span, div')].find(
      (e) => (e.textContent || '').trim() === 'Найти',
    );
    if (!findBtn) return;
    let panel = findBtn;
    for (let i = 0; i < 6 && panel.parentElement; i++) panel = panel.parentElement;
    // gear = an icon-only button/img near the action row (no text, small)
    const icons = [...panel.querySelectorAll('img, [class*="settings"], [class*="Settings"], [class*="gear"], button')].filter((e) => {
      const r = e.getBoundingClientRect();
      const txt = (e.textContent || '').trim();
      return r.top < findBtn.getBoundingClientRect().bottom + 30 && r.width > 8 && r.width < 40 && r.height > 8 && r.height < 40 && txt.length === 0;
    });
    const gear = icons[icons.length - 1];
    if (gear) gear.click();
  });
  await p.waitForTimeout(1500);
  await shot('30-filter-gear.png');
  out.gearMenu = await p.evaluate(() => {
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"]')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 60 && r.top > 60;
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const items = [...last.querySelectorAll('label, li, [role="menuitemcheckbox"], div')]
      .map((e) => {
        const cb = e.querySelector('input[type="checkbox"]');
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return cb && t && t.length < 40 ? { t, checked: cb.checked } : null;
      })
      .filter(Boolean);
    // de-dup
    const seen = new Set();
    const u = [];
    for (const it of items) {
      if (!seen.has(it.t)) {
        seen.add(it.t);
        u.push(it);
      }
    }
    return { open: true, count: u.length, items: u };
  });
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(500);

  // C) click «Контрагент» then «Склад» inside the panel → popup type
  const inspect = () =>
    p.evaluate(() => {
      const pops = [...document.querySelectorAll('.gwt-PopupPanel, [role="listbox"], [class*="dropdown"], [class*="Dropdown"], [class*="popup"], [class*="Popup"]')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 100 && r.height > 30 && r.top > 60;
      });
      const last = pops[pops.length - 1];
      if (!last) return { open: false };
      const r = last.getBoundingClientRect();
      return {
        open: true,
        checkboxes: last.querySelectorAll('input[type="checkbox"]').length,
        textInputs: last.querySelectorAll('input[type="text"], input:not([type])').length,
        isModalCentered: Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 140 && r.top > 140,
        width: Math.round(r.width),
        sample: (last.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      };
    });
  const clickPanelField = (lbl) =>
    p.evaluate((label) => {
      const findBtn = [...document.querySelectorAll('button, a, span, div')].find((e) => (e.textContent || '').trim() === 'Найти');
      let panel = findBtn;
      for (let i = 0; i < 6 && panel?.parentElement; i++) panel = panel.parentElement;
      const lab = [...panel.querySelectorAll('*')].find((e) => !e.children.length && (e.textContent || '').trim() === label);
      if (!lab) return false;
      let el = lab.parentElement;
      for (let i = 0; i < 4 && el; i++) {
        const box = el.querySelector('input, [class*="combo"], [class*="Combo"], select, [tabindex]');
        if (box) {
          box.scrollIntoView({ block: 'center' });
          box.click();
          return true;
        }
        el = el.parentElement;
      }
      return false;
    }, lbl);
  out.refType = {};
  for (const lbl of ['Контрагент', 'Склад']) {
    const clicked = await clickPanelField(lbl);
    await p.waitForTimeout(1200);
    out.refType[lbl] = { clicked, ...(await inspect()) };
    await shot(`40-ref-${lbl}.png`);
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }

  // D) the «Показать итоги» totals toggle at the bottom
  out.showTotals = await p.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => !e.children.length && /Показать итоги/.test(e.textContent || ''));
    return el ? { present: true, text: el.textContent.trim() } : { present: false };
  });
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'demands-filter-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
