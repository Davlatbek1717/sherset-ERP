// Live verify — owner 2026-07-19 twin report:
//  (1) moysklad-style login «prefix@account» must SAVE on the employee card
//      (was rejected by FE regex + BE Zod + auth email-only lookup) and the
//      new employee must actually LOG IN with that username;
//  (2) password eye-toggle (PasswordInput) shows/hides the typed password.
// Flow: login-page eye check → admin login → /settings/employees/new
//   negative (cyrillic login → field error) → positive (omborchi01@… saves)
//   → fresh context logs in AS the new user → cleanup (delete employee).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const LOGIN = 'omborchi01@climart_santex_group';
const PASS = 'parol123';
const results = [];
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`;
  results.push(line);
  console.log(line);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
let createdId = null;

try {
  // ── 1. login-page eye toggle ──
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const pw = page.locator('[data-test-id="login-password"]');
  await pw.waitFor({ state: 'visible' });
  await pw.fill('admin123');
  ok('login password starts hidden', (await pw.getAttribute('type')) === 'password');
  await page.click('[data-test-id="password-toggle"]');
  ok('eye click reveals the password', (await pw.getAttribute('type')) === 'text');
  await page.screenshot({ path: 'tasdiq-eye-1-login-visible.png' });
  await page.click('[data-test-id="password-toggle"]');
  ok('second click hides it again', (await pw.getAttribute('type')) === 'password');

  // admin login
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });

  // ── 2. employee card: negative then positive ──
  await page.goto(`${BASE}/settings/employees/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.fill('[data-testid="employee-last-name"]', 'Omborchi Test');
  const allow = page.locator('[data-testid="employee-login-allowed"]');
  if ((await allow.getAttribute('data-state')) !== 'checked') await allow.click();
  // department is required once departments exist
  const dep = page.locator('[data-testid="employee-department"]');
  if (await dep.count()) await dep.selectOption({ index: 1 }).catch(() => {});

  // negative: cyrillic login → field-level error, nothing saved
  await page.fill('[data-testid="employee-new-username"]', 'омборчи@сантех');
  await page.fill('[data-testid="employee-new-password"]', PASS);

  // eye toggle on the card's password field
  const cardPw = page.locator('[data-testid="employee-new-password"]');
  ok('card password starts hidden', (await cardPw.getAttribute('type')) === 'password');
  await page.click('[data-test-id="password-toggle"]');
  ok('card eye reveals the password', (await cardPw.getAttribute('type')) === 'text');
  await page.screenshot({ path: 'tasdiq-eye-2-card-visible.png' });

  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(1200);
  const errText = await page
    .locator('[data-testid="employee-card"]')
    .getByText(/Логин|Login/)
    .filter({ hasText: /латин|lotin/i })
    .first()
    .textContent()
    .catch(() => null);
  ok(
    'cyrillic login → clear field error, not saved',
    !!errText && page.url().includes('/new'),
    JSON.stringify(errText),
  );
  await page.screenshot({ path: 'tasdiq-login-1-negative-error.png' });

  // positive: the owner's exact moysklad-style login
  await page.fill('[data-testid="employee-new-username"]', LOGIN);
  await page.click('[data-testid="employee-save"]');
  await page.waitForURL(/\/settings\/employees\/[0-9a-f-]{36}/, { timeout: 20000 });
  createdId = page.url().match(/employees\/([0-9a-f-]{36})/)?.[1] ?? null;
  ok('moysklad-style login SAVES (card opens)', !!createdId, page.url());
  await page.screenshot({ path: 'tasdiq-login-2-saved-card.png' });

  // ── 3. fresh context: log in AS the new user with the @-login ──
  const ctx2 = await browser.newContext({
    viewport: { width: 1600, height: 950 },
    locale: 'ru-RU',
  });
  const p2 = await ctx2.newPage();
  p2.setDefaultTimeout(30000);
  await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await p2.fill('[data-test-id="login-email"]', LOGIN);
  await p2.fill('[data-test-id="login-password"]', PASS);
  await p2.click('button[type=submit]');
  await p2.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  ok('new employee LOGS IN with the @-login', !p2.url().includes('/login'), p2.url());
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: 'tasdiq-login-3-logged-in-as-new.png' });
  await ctx2.close();
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: 'tasdiq-login-error.png' }).catch(() => {});
} finally {
  // cleanup: delete the created employee so the run is repeatable
  if (createdId) {
    try {
      const tok = (
        await (
          await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
          })
        ).json()
      ).accessToken;
      const del = await fetch(`${API}/hr/employees/${createdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      console.log(`cleanup: DELETE employee ${createdId} → ${del.status}`);
    } catch (e) {
      console.log(`cleanup failed: ${String(e).slice(0, 120)}`);
    }
  }
  console.log(
    `\n=== login@ + eye — ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`,
  );
  await browser.close();
  process.exit(failed ? 1 : 0);
}
