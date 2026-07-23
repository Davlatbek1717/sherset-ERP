// CERT (read-only-ish, NEVER clicks Удалить): the /commission-reports toolbar on the
// dev app (:3268). Logs in (admin@demo.local), selects a row, opens «Изменить» +
// «Печать» menus, opens the mass-edit modal, records console errors. Demo rows are
// never deleted.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3268';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-reports-list-2026-06-27/cert');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1000 } })).newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160));
});
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4000);
  await p.goto(`http://localhost:${PORT}/commission-reports`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await shot('00-list.png');

  // toolbar buttons present (UZ locale: O'zgartirish = Изменить, Chop etish = Печать)
  out.toolbar = await p.evaluate(() =>
    [...new Set([...document.querySelectorAll('button')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 30))].filter((t) =>
      /zgartirish|Chop etish|Komissioner hisoboti|Filtr/i.test(t),
    ),
  );

  // select the first row (Radix Checkbox = <button role="checkbox" aria-label="Select row">)
  out.rowCheckboxFound = await p.evaluate(() => {
    const cbs = [...document.querySelectorAll('[role="checkbox"][aria-label="Select row"]')];
    if (cbs[0]) { cbs[0].click(); return cbs.length; }
    return 0;
  });
  await p.waitForTimeout(900);
  out.selectionCountText = await p.evaluate(() => {
    // the toolbar «N» selection counter
    const el = [...document.querySelectorAll('*')].find((e) => !e.children.length && /^[1-9]\d* ta|tanlangan/i.test((e.getAttribute?.('aria-label') || '') + (e.textContent || '')));
    return el ? (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30) : null;
  });

  const openMenuByLabel = async (label) => {
    // Radix DropdownMenu opens on pointerdown — use a REAL Playwright click, not
    // an evaluate() .click() (which Radix ignores).
    await p
      .locator('button', { hasText: new RegExp(label, 'i') })
      .first()
      .click()
      .catch(() => {});
    await p.waitForTimeout(700);
    return p.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"], [class*="dropdown"], [class*="Dropdown"], [data-testid*="menu"]')].filter((e) => e.getBoundingClientRect().height > 20).pop();
      if (!menu) return { open: false };
      const items = [...menu.querySelectorAll('[role="menuitem"], button, li, div')]
        .map((e) => {
          const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
          const disabled = e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled') || /disabled|opacity-50/.test(e.className || '');
          return t && t.length > 1 && t.length < 40 ? { t, disabled } : null;
        })
        .filter(Boolean);
      const seen = new Set();
      const u = [];
      for (const it of items) if (!seen.has(it.t)) { seen.add(it.t); u.push(it); }
      return { open: true, items: u };
    });
  };

  out.izmenitMenu = await openMenuByLabel('zgartirish'); // O'zgartirish (apostrophe-safe)
  await shot('10-izmenit.png');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  out.pechatMenu = await openMenuByLabel('Chop etish');
  await shot('11-pechat.png');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  // open mass-edit modal via «Ommaviy tahrirlash» (Массовое редактирование)
  await openMenuByLabel('zgartirish');
  await p
    .locator('[role="menuitem"]', { hasText: /Ommaviy tahrirlash/ })
    .first()
    .click()
    .catch(() => {});
  await p.waitForTimeout(1000);
  await shot('12-massedit.png');
  out.massEditModal = await p.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], [data-testid*="mass-edit"], [class*="modal"], [class*="Modal"]')].filter((e) => e.getBoundingClientRect().height > 80).pop();
    if (!m) return { open: false };
    return {
      open: true,
      title: (m.querySelector('h1,h2,h3,[class*="title"],[class*="Title"]')?.textContent || '').trim().slice(0, 40),
      hasOwnerRow: /Egasi|Владелец/.test(m.textContent || ''),
      hasProjectRow: /Loyiha|Проект/.test(m.textContent || ''),
      hasDescriptionRow: /Izoh|Комментарий/.test(m.textContent || ''),
    };
  });
  await p.keyboard.press('Escape').catch(() => {});
} catch (e) {
  out.error = String(e).slice(0, 300);
}
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
