/** Owner 2026-07-23: «Скидка» header must be a BUTTON that opens the modal.
 * Live proof on TWO sections: button visible + click opens the modal. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const PAGES = [
  { route: '/customer-orders/new', shot: 'tasdiq-skidka-1-co.png' },
  { route: '/purchase-orders/new', shot: 'tasdiq-skidka-2-po.png' },
];
let failed = 0;
const ok = (n, c, extra = '') => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  for (const { route, shot } of PAGES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator('[data-test-id="position-discount-menu"]');
    await btn.waitFor({ state: 'visible', timeout: 30000 });
    const style = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopWidth, bg: cs.backgroundColor, deco: cs.textDecorationLine };
    });
    ok(`${route}: «Скидка» endi TUGMA (border bor, underline yo'q)`, style.border !== '0px' && style.deco !== 'underline', JSON.stringify(style));
    await btn.click();
    const modal = page.locator('[data-testid="position-discount-modal"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    ok(`${route}: bosilganda modal ochildi`, await modal.isVisible());
    await page.screenshot({ path: shot });
    await page.keyboard.press('Escape');
  }
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 200));
} finally {
  await browser.close();
  console.log(failed ? `FAILED=${failed}` : 'ALL PASS');
}
