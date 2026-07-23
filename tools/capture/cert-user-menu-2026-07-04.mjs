// CERT — moysklad-parity user menu (grounded docs/audits/user-menu-2026-07-04)
// at the user's real 1536-px CSS viewport. Checks: trigger fully visible (no
// horizontal overflow), dropdown = the exact 6-item set in order, «Новости»
// opens the notifications panel, offers/subscription pages render, logout
// lands on /login.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const OUT = 'D:/projects/moysklad/docs/audits/user-menu-2026-07-04/cert';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1536, height: 900 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
await ctx.request.post(`${WEB}/api/v1/auth/login`, {
  data: { email: 'admin@demo.local', password: 'admin123' },
  headers: { 'Content-Type': 'application/json' },
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f) }).catch(() => {});
try {
  await p.goto(`${WEB}/products`, { waitUntil: 'domcontentloaded' });
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes('/products'), { timeout: 20000 }).catch(() => {});
  }
  await p.locator('[data-test-id="user-menu-trigger"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1000);
  // overflow check at 1536: trigger's right edge must be INSIDE the viewport
  out.overflow = await p.evaluate(() => {
    const t = document.querySelector('[data-test-id="user-menu-trigger"]');
    const r = t.getBoundingClientRect();
    return {
      triggerRight: Math.round(r.right),
      viewport: window.innerWidth,
      fits: r.right <= window.innerWidth,
      docScrollX: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
  await shot('10-header-1536.png');

  // open the dropdown → items in exact order
  await p.locator('[data-test-id="user-menu-trigger"]').click();
  await p.waitForTimeout(700);
  out.items = await p
    .locator('[role="menuitem"]')
    .allInnerTexts()
    .then((a) => a.map((s) => s.replace(/\s+/g, ' ').trim()));
  await shot('20-dropdown.png');

  // «Новости» → notifications panel opens
  await p.locator('[data-test-id="user-menu-news"]').click();
  await p.waitForTimeout(1000);
  out.newsOpensPanel =
    (await p.getByText('Уведомления', { exact: true }).count()) > 0 ||
    (await p.locator('[data-test-id*="notification"]').count()) > 1;
  await shot('30-news-panel.png');
  await p.keyboard.press('Escape');

  // «Спецпредложения» page
  await p.locator('[data-test-id="user-menu-trigger"]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-test-id="user-menu-offers"]').click();
  await p.waitForTimeout(1500);
  out.offersPage = (await p.locator('[data-test-id="specialoffers-page"]').count()) > 0;

  // «Подписка» page
  await p.locator('[data-test-id="user-menu-trigger"]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-test-id="user-menu-subscription"]').click();
  await p.waitForTimeout(1500);
  out.subscriptionPage = (await p.locator('[data-test-id="subscription-page"]').count()) > 0;
  out.subscriptionText = (
    await p.locator('[data-test-id="subscription-page"]').innerText().catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  await shot('40-subscription.png');

  // «Настройки пользователя» → /settings/profile
  await p.locator('[data-test-id="user-menu-trigger"]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-test-id="user-menu-account"]').click();
  await p.waitForTimeout(1500);
  out.accountUrl = p.url();

  // «Выход» → /login
  await p.locator('[data-test-id="user-menu-trigger"]').click();
  await p.waitForTimeout(500);
  await p.locator('[data-test-id="user-menu-logout"]').click();
  await p.waitForTimeout(2500);
  out.logoutLandsOnLogin = p.url().includes('/login');
  await shot('50-logout.png');

  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
}
console.log(JSON.stringify(out, null, 2));
await b.close();
