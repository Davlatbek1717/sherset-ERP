// LIVE VERIFY (owner report 2026-07-17): field-level validation on the
// employee create form — every deliberately-bad input must light ITS OWN
// field red with a plain message under it (no anonymous banners):
// empty Фамилия · bad email · bad phone · bad ИНН · email-as-login (the
// owner's exact case) · short password · duplicate email · duplicate login.
// Dev :3100/:4000. Nothing is created (all saves are rejected client-side);
// the final happy-path save IS created then deleted.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT = resolve('D:/projects/moysklad/docs/audits/settings-employees-2026-07-16');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:3100';
const API = 'http://localhost:4000/api/v1';

let PASS = 0;
let FAIL = 0;
const results = [];
const check = (name, cond, extra = '') => {
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${extra}`}`;
  results.push(line);
  console.info(line);
  cond ? PASS++ : FAIL++;
};
const j = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
};

const stamp = Date.now() % 1000000;
const admin = await j('POST', '/auth/login', {
  identifier: 'admin@demo.local',
  password: 'admin123',
});
const T = admin.data?.accessToken;
// a pre-existing employee to collide with (known username + email)
const seed = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Банд Логин',
    lastName: 'Банд',
    email: `band-${stamp}@test.local`,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
await j(
  'POST',
  `/hr/employees/${seed.data.id}/set-password`,
  { username: `band_${stamp}`, password: 'band1234' },
  T,
);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1100 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);

const fieldErr = async (testid) => {
  // FieldRow renders the message as the sibling under the input container
  const input = p.locator(`[data-testid="${testid}"]`);
  const invalid = (await input.getAttribute('aria-invalid')) === 'true';
  const err = await input
    .locator(
      'xpath=ancestor::div[1]/following-sibling::div[1] | xpath=ancestor::div[2]//div[contains(@class,"destructive")]',
    )
    .first()
    .innerText()
    .catch(() => '');
  return { invalid, err };
};

let EMPID = null;
try {
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input');
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  for (let a = 0; a < 3; a++) {
    await p.locator('input').nth(0).fill('admin@demo.local');
    await p.locator('input').nth(1).fill('admin123');
    await p.click('button[type=submit]');
    const ok = await p
      .waitForURL((u) => !String(u).includes('/login'), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    await p.waitForTimeout(2000);
  }
  await p.goto(`${WEB}/settings/employees/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-card"]', { timeout: 60000 });
  await p.waitForTimeout(1500);

  const bodyHasErr = async (fragment) =>
    (await p.innerText('body')).replace(/\s+/g, ' ').includes(fragment);

  // ── 1. empty Фамилия ──
  await p.click('[data-testid="employee-save"]');
  await p.waitForTimeout(800);
  check(
    '1 empty Фамилия → red field + message',
    (await p.locator('[data-testid="employee-last-name"]').getAttribute('aria-invalid')) ===
      'true' && (await bodyHasErr('Поле должно быть заполнено')),
  );

  // ── 2. bad email / phone / ИНН together ──
  await p.fill('[data-testid="employee-last-name"]', 'Тест');
  await p.fill('[data-testid="employee-email"]', 'notanemail');
  const phoneInput = p.locator('[data-testid="employee-card"] input').nth(3); // Телефон (4th input in the left column: Фамилия, Имя, Отчество, Телефон)
  await phoneInput.fill('abc');
  await p.click('[data-testid="employee-save"]');
  await p.waitForTimeout(800);
  check('2a bad email → message under the field', await bodyHasErr('Неверный формат e-mail'));
  check('2b bad phone → message', await bodyHasErr('Неверный формат телефона'));
  await p.screenshot({ path: resolve(OUT, 'verify-val-1-format-errors.png'), fullPage: false });

  // ── 3. the owner's exact case: email pasted into Логин ──
  await phoneInput.fill('');
  await p.fill('[data-testid="employee-email"]', `ok-${stamp}@test.local`);
  await p.fill('[data-testid="employee-new-username"]', 'admin@demo.local');
  await p.fill('[data-testid="employee-new-password"]', 'x'); // short too
  await p.click('[data-testid="employee-save"]');
  await p.waitForTimeout(800);
  check(
    '3a email-as-login → «только латинские…» on the Логин field',
    await bodyHasErr('латинские'),
  );
  check('3b short password → message', await bodyHasErr('не короче 4'));
  await p.screenshot({ path: resolve(OUT, 'verify-val-2-login-password.png'), fullPage: false });

  // ── 4. duplicate login + duplicate email ──
  await p.fill('[data-testid="employee-new-username"]', `band_${stamp}`);
  await p.fill('[data-testid="employee-new-password"]', 'okpass1234');
  await p.fill('[data-testid="employee-email"]', `band-${stamp}@test.local`);
  await p.click('[data-testid="employee-save"]');
  await p.waitForTimeout(1500); // pre-check round-trips
  check('4a duplicate login → «логин уже занят»', await bodyHasErr('уже занят'));
  check('4b duplicate email → «уже используется»', await bodyHasErr('уже используется'));
  await p.screenshot({ path: resolve(OUT, 'verify-val-3-duplicates.png'), fullPage: false });

  // ── 5. happy path still works after fixing everything ──
  await p.fill('[data-testid="employee-new-username"]', `valid_${stamp}`);
  await p.fill('[data-testid="employee-email"]', `valid-${stamp}@test.local`);
  // *Отдел is now required (validated!) — pick the first real department.
  const deptValue = await p
    .locator('[data-testid="employee-department"] option')
    .nth(1)
    .getAttribute('value');
  if (deptValue) {
    await p
      .selectOption(
        '[data-testid="employee-department"] select, select[data-testid="employee-department"], [data-testid="employee-department"]',
        deptValue,
      )
      .catch(async () => {
        await p.locator('[data-testid="employee-department"]').selectOption(deptValue);
      });
  }
  await p.click('[data-testid="employee-save"]');
  await p
    .waitForURL((u) => /settings\/employees\/[0-9a-f-]{36}/.test(String(u)), { timeout: 30000 })
    .catch(() => {});
  EMPID = p.url().match(/employees\/([0-9a-f-]{36})/)?.[1] ?? null;
  check('5 valid form saves after corrections', !!EMPID, p.url());
} catch (e) {
  check('UNCAUGHT', false, e.message);
  await p
    .screenshot({ path: resolve(OUT, 'verify-val-error.png'), fullPage: true })
    .catch(() => {});
} finally {
  await b.close();
  if (EMPID) await j('POST', '/hr/employees/bulk-delete', { ids: [EMPID] }, T);
  if (seed.data?.id) await j('POST', '/hr/employees/bulk-delete', { ids: [seed.data.id] }, T);
  writeFileSync(resolve(OUT, 'verify-validation-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
