// DIAGNOSTIC: click through EVERY toolbar dropdown on the sales-return [id] + /new
// pages of the user's running app (:3100), report each menu item's text + whether
// it is disabled/clickable, screenshot each open menu. Grounds the "items not
// clickable" complaint against reality.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:3100';
const SR_ID = '5fdcfdf6-b0d2-4fa4-94ee-bf5d1eefbd9f';
const OUT = resolve('D:/projects/moysklad/docs/audits/sales-returns-1to1-2026-07-05/dropdowns');
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

// dump every currently-visible menu/dropdown item with its disabled state
async function dumpOpenMenu(tag) {
  return await page.evaluate(() => {
    const items = [];
    // radix/DS menus render role=menuitem or [data-radix-collection-item]; also plain buttons in a popover
    const nodes = document.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item], [class*="DropdownMenu"] button, [data-testid*="menu"] button');
    const seen = new Set();
    for (const n of nodes) {
      const txt = (n.textContent || '').trim().slice(0, 60);
      if (!txt || seen.has(txt)) continue;
      seen.add(txt);
      const disabled = n.hasAttribute('disabled') || n.getAttribute('aria-disabled') === 'true' || n.getAttribute('data-disabled') != null;
      const r = n.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;
      items.push({ txt, disabled, visible });
    }
    return items;
  });
}

async function login() {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await page.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await page.waitForTimeout(4500);
}

// click a toolbar trigger by its visible text, then dump the opened menu
async function probeDropdown(triggerText, file) {
  const out = { trigger: triggerText, opened: false, triggerDisabled: null, items: [] };
  const trig = page.locator(`button:has-text("${triggerText}")`).first();
  const cnt = await trig.count();
  if (cnt === 0) { out.error = 'TRIGGER NOT FOUND'; return out; }
  out.triggerDisabled = await trig.isDisabled().catch(() => null);
  if (out.triggerDisabled) { out.note = 'trigger disabled (cannot open)'; return out; }
  await trig.click().catch((e) => { out.error = String(e).slice(0, 80); });
  await page.waitForTimeout(700);
  out.items = await dumpOpenMenu(triggerText);
  out.opened = out.items.length > 0;
  await page.screenshot({ path: resolve(OUT, file) });
  // close
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  return out;
}

const report = { detail: {}, new: {} };
try {
  await login();

  // ---------- DETAIL [id] ----------
  await page.goto(`${WEB}/sales-returns/${SR_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: resolve(OUT, 'detail-00-loaded.png') });
  for (const [txt, file] of [
    ['Изменить', 'detail-01-izmenit.png'],
    ['Создать документ', 'detail-02-sozdat.png'],
    ['Печать', 'detail-03-pechat.png'],
    ['Отправить', 'detail-04-otpravit.png'],
    ['Статус', 'detail-05-status.png'],
  ]) {
    report.detail[txt] = await probeDropdown(txt, file);
  }

  // ---------- NEW ----------
  await page.goto(`${WEB}/sales-returns/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: resolve(OUT, 'new-00-loaded.png') });
  for (const [txt, file] of [
    ['Изменить', 'new-01-izmenit.png'],
    ['Создать документ', 'new-02-sozdat.png'],
    ['Печать', 'new-03-pechat.png'],
    ['Отправить', 'new-04-otpravit.png'],
    ['Статус', 'new-05-status.png'],
  ]) {
    report.new[txt] = await probeDropdown(txt, file);
  }
} catch (e) {
  report.fatal = String(e).slice(0, 200);
} finally {
  await b.close();
  console.log(JSON.stringify(report, null, 1));
}
