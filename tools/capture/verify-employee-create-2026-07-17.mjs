// LIVE E2E (owner acceptance 2026-07-17): «+ Сотрудник» → create form opens →
// fill ФИО + Логин + Пароль + role → Сохранить → employee exists → LOG IN as
// that employee with the given login+parol through the real login page.
// Dev :3100/:4000. The created employee is deleted at the end.
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
const USERNAME = `yangi_${stamp}`;
const PASSWORD = 'yangi1234';

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);

async function uiLogin(identifier, password) {
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input');
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  for (let a = 0; a < 3; a++) {
    await p.locator('input').nth(0).fill(identifier);
    await p.locator('input').nth(1).fill(password);
    await p.click('button[type=submit]');
    const ok = await p
      .waitForURL((u) => !String(u).includes('/login'), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return true;
    await p.waitForTimeout(2000);
  }
  return false;
}

let EMPID = null;
try {
  // ── A. «+ Сотрудник» opens the create form ──
  check('A0 admin UI login', await uiLogin('admin@demo.local', 'admin123'));
  await p.goto(`${WEB}/settings/employees`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employees-page"]');
  await p.waitForTimeout(2000);
  await p.click('[data-testid="employee-create"]');
  await p.waitForURL((u) => String(u).includes('/settings/employees/new'), { timeout: 60000 });
  await p.waitForSelector('[data-testid="employee-card"]', { timeout: 60000 });
  check('A1 create form opened after the button click', true);
  const formText = (await p.locator('[data-testid="employee-card"]').innerText()).replace(
    /\s+/g,
    ' ',
  );
  for (const label of [
    'Фамилия',
    'Вход в МойСклад',
    'Логин',
    'Пароль',
    'Системные роли',
    'Администратор',
    'Доступ только к точкам продаж',
    'Сеть',
    'IP адрес',
    'Уведомления',
  ]) {
    check(`A2 create form has «${label}»`, formText.includes(label));
  }
  await p.screenshot({ path: resolve(OUT, 'verify-create-a-form.png'), fullPage: true });

  // ── B. fill + save ──
  await p.fill('[data-testid="employee-last-name"]', 'Янги');
  await p.fill('[data-testid="employee-email"]', `yangi-${stamp}@test.local`);
  await p.fill('[data-testid="employee-new-username"]', USERNAME);
  await p.fill('[data-testid="employee-new-password"]', PASSWORD);
  await p.click('[data-testid="employee-save"]');
  await p.waitForURL((u) => /settings\/employees\/[0-9a-f-]{36}/.test(String(u)), {
    timeout: 30000,
  });
  EMPID = p.url().match(/employees\/([0-9a-f-]{36})/)?.[1] ?? null;
  check('B1 save redirects to the new employee card', !!EMPID, p.url());
  await p.waitForSelector('[data-testid="employee-card"]');
  await p.waitForTimeout(2000);
  const cardText = (await p.locator('[data-testid="employee-card"]').innerText()).replace(
    /\s+/g,
    ' ',
  );
  check('B2 card shows the assigned login', cardText.includes(USERNAME));
  await p.screenshot({ path: resolve(OUT, 'verify-create-b-saved.png'), fullPage: false });

  // ── C. the new employee logs in with the given login+parol (UI!) ──
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  check(
    'C1 new employee logs in via login page (username, not email)',
    await uiLogin(USERNAME, PASSWORD),
  );
  await p.waitForTimeout(3000);
  const navText = (await p.locator('nav').first().innerText()).replace(/\s+/g, ' ');
  check('C2 lands in the app (module bar rendered)', navText.includes('Показатели'));
  await p.screenshot({ path: resolve(OUT, 'verify-create-c-employee-login.png'), fullPage: false });
} catch (e) {
  check('UNCAUGHT', false, e.message);
  await p
    .screenshot({ path: resolve(OUT, 'verify-create-error.png'), fullPage: true })
    .catch(() => {});
} finally {
  await b.close();
  const admin = await j('POST', '/auth/login', {
    identifier: 'admin@demo.local',
    password: 'admin123',
  });
  if (EMPID)
    await j('POST', '/hr/employees/bulk-delete', { ids: [EMPID] }, admin.data?.accessToken);
  writeFileSync(resolve(OUT, 'verify-create-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
