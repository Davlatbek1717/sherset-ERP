// LIVE VERIFY (owner 2026-07-19): «Настроить права» rebuilt to MoySklad's REAL
// mechanism — no role input on the card; the button opens the «Настройка
// доступа» modal (role dropdown + «Изменить роль», left section tabs
// Показатели…Задачи, per-section checkboxes, green «Сохранить настройки»).
// Admin unchecks Просматривать on Отгрузки and on every Деньги entity; the
// employee then logs in: Деньги is gone from the bar, Продажи keeps Заказы but
// loses the Отгрузки tab, GET /demands is 403. Everything created is deleted.
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

const admin = await j('POST', '/auth/login', {
  identifier: 'admin@demo.local',
  password: 'admin123',
});
const T = admin.data?.accessToken;
const stamp = Date.now() % 1000000;

// role with FULL access (copy of Administrator's matrix)
const roles = await j('GET', '/roles', null, T);
const adminRole = roles.data?.items?.find((r) => r.name === 'Administrator');
const adminDetail = await j('GET', `/roles/${adminRole.id}`, null, T);
const demoRole = await j(
  'POST',
  '/roles',
  {
    name: `AccessDemo-${stamp}`,
    description: 'access-settings verify',
    permissions: adminDetail.data.permissions,
  },
  T,
);
check('setup: demo role created', !!demoRole.data?.id);

const emp = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Доступ Демо',
    lastName: 'Доступ',
    email: `access-${stamp}@test.local`,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
const EMP = emp.data?.id;
await j(
  'POST',
  `/hr/employees/${EMP}/set-password`,
  { username: `access_${stamp}`, password: 'access1234' },
  T,
);
await j('PUT', `/roles/employee/${EMP}`, { roleIds: [demoRole.data.id] }, T);
check('setup: employee + role assigned', !!EMP);

// entities whose Просматривать gets unchecked in the Деньги section
const MONEY_ENTITIES = [
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'bankimport',
  'counterpartyadjustment',
  'prepayment',
  'prepaymentreturn',
  'payroll',
  'cashdesk',
  'bankaccount',
];

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

try {
  // ── A. admin opens the card and the new dialog ──
  check('A0 admin login', await uiLogin('admin@demo.local', 'admin123'));
  await p.goto(`${WEB}/settings/employees/${EMP}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-configure-rights"]', { timeout: 90000 });
  check(
    'A1 NO role input on the card (MoySklad: button only)',
    (await p.locator('[data-testid="employee-role-select"]').count()) === 0,
  );
  await p.click('[data-testid="employee-configure-rights"]');
  await p.waitForSelector('[data-testid="access-settings-modal"]', { timeout: 30000 });
  check('A2 «Настройка доступа» modal opened', true);
  const modalText = await p.locator('[role="dialog"]').innerText();
  check('A3 modal title «Настройка доступа»', modalText.includes('Настройка доступа'));
  check('A4 role dropdown inside the modal', (await p.locator('[data-testid="access-role-select"]').count()) === 1);
  check('A5 «Изменить роль» link present', modalText.includes('Изменить роль'));
  const tabCount = await p.locator('[data-testid^="access-section-"]').count();
  check('A6 15 section tabs on the left', tabCount === 15, `got ${tabCount}`);

  // Показатели is the default section — its five screenshot rows
  await p.waitForSelector('[data-testid="access-row-report-view"]', { timeout: 30000 });
  const dashRows = await p.locator('[data-testid^="access-row-"]').count();
  check('A7 Показатели shows the 5 screenshot rows', dashRows === 5, `got ${dashRows}`);
  await p.screenshot({ path: resolve(OUT, 'verify-access-0-dashboard.png'), fullPage: false });

  // Продажи → uncheck Просматривать on Отгрузки
  await p.click('[data-testid="access-section-sales"]');
  const demandView = p.locator('[data-testid="access-demand-view"]');
  await demandView.waitFor({ state: 'visible' });
  check('A8 Отгрузки Просматривать is ON', (await demandView.getAttribute('data-state')) === 'checked');
  await demandView.click();
  check('A9 Отгрузки Просматривать switched OFF', (await demandView.getAttribute('data-state')) === 'unchecked');
  await p.screenshot({ path: resolve(OUT, 'verify-access-b-sales-section.png'), fullPage: false });

  // Деньги → uncheck Просматривать on every row
  await p.click('[data-testid="access-section-money"]');
  await p.locator('[data-testid="access-paymentin-view"]').waitFor({ state: 'visible' });
  for (const e of MONEY_ENTITIES) {
    const cb = p.locator(`[data-testid="access-${e}-view"]`);
    if ((await cb.getAttribute('data-state')) === 'checked') await cb.click();
  }
  check(
    'A10 all Деньги Просматривать OFF',
    (await p.locator('[data-testid="access-paymentin-view"]').getAttribute('data-state')) ===
      'unchecked',
  );
  await p.screenshot({ path: resolve(OUT, 'verify-access-a-dialog.png'), fullPage: false });

  await p.click('[data-testid="access-settings-save"]');
  await p.waitForSelector('[data-testid="access-settings-modal"]', {
    state: 'detached',
    timeout: 30000,
  });

  // API truth: view cells removed, others intact
  const after = await j('GET', `/roles/${demoRole.data.id}`, null, T);
  const cells = after.data?.permissions ?? [];
  const has = (entity, action) => cells.some((c) => c.entity === entity && c.action === action);
  check('A11 demand.view removed', !has('demand', 'view'));
  check('A12 demand.create kept (only Просматривать was unchecked)', has('demand', 'create'));
  check('A13 money view cells removed', !has('paymentin', 'view') && !has('cashout', 'view'));
  check('A14 customerorder.view kept', has('customerorder', 'view'));

  // ── B. the employee sees the result ──
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  check('B0 employee login', await uiLogin(`access_${stamp}`, 'access1234'));
  await p.waitForTimeout(5000); // permissions/me + nav
  const moduleBar = (await p.locator('nav').first().innerText()).replace(/\s+/g, ' ');
  check('B1 Деньги module GONE from the bar', !moduleBar.includes('Деньги'), moduleBar.slice(0, 200));
  check('B2 Продажи still visible', moduleBar.includes('Продажи'));
  await p.screenshot({ path: resolve(OUT, 'verify-access-c-no-money.png'), fullPage: false });

  await p.goto(`${WEB}/customer-orders`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const salesSubnav = (await p.locator('nav').last().innerText()).replace(/\s+/g, ' ');
  check('B3 Заказы покупателей tab present', salesSubnav.includes('Заказы покупателей'));
  check('B4 Отгрузки tab GONE', !salesSubnav.includes('Отгрузки'), salesSubnav.slice(0, 250));
  await p.screenshot({ path: resolve(OUT, 'verify-access-d-no-demands-tab.png'), fullPage: false });

  // server-side enforcement too
  const empLogin = await j('POST', '/auth/login', {
    identifier: `access_${stamp}`,
    password: 'access1234',
  });
  const demandsApi = await j('GET', '/demands?limit=1', null, empLogin.data?.accessToken);
  check('B5 /demands API 403 for the employee', demandsApi.status === 403, `got ${demandsApi.status}`);
} catch (e) {
  check('UNCAUGHT', false, e.message);
  await p.screenshot({ path: resolve(OUT, 'verify-access-error.png'), fullPage: true }).catch(() => {});
} finally {
  await b.close();
  if (EMP) await j('POST', '/hr/employees/bulk-delete', { ids: [EMP] }, T);
  if (demoRole.data?.id) await j('DELETE', `/roles/${demoRole.data.id}`, null, T);
  writeFileSync(resolve(OUT, 'verify-access-settings-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
