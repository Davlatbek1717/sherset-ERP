// LIVE VERIFY (owner 2026-07-19, 2nd band): the module/tab toggle tree now
// ALSO lives on the employee card (the «Уведомления» area) and works
// INDEPENDENTLY of the untouched «Настройка доступа» modal. Admin switches
// Деньги OFF in the INLINE tree and saves; then unchecks Отгрузки
// Просматривать in the MODAL and saves; both effects must persist together,
// the inline tree must reflect the modal's change (shared role data), and the
// employee must lose Деньги + the Отгрузки tab (+ API 403).
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

const roles = await j('GET', '/roles', null, T);
const adminRole = roles.data?.items?.find((r) => r.name === 'Administrator');
const adminDetail = await j('GET', `/roles/${adminRole.id}`, null, T);
const demoRole = await j(
  'POST',
  '/roles',
  {
    name: `InlineDemo-${stamp}`,
    description: 'inline-rights verify',
    permissions: adminDetail.data.permissions,
  },
  T,
);
check('setup: demo role created', !!demoRole.data?.id);

const emp = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Инлайн Демо',
    lastName: 'Инлайн',
    email: `inline-${stamp}@test.local`,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
const EMP = emp.data?.id;
await j(
  'POST',
  `/hr/employees/${EMP}/set-password`,
  { username: `inline_${stamp}`, password: 'inline1234' },
  T,
);
await j('PUT', `/roles/employee/${EMP}`, { roleIds: [demoRole.data.id] }, T);
check('setup: employee + role assigned', !!EMP);

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
  // ── A. admin: INLINE tree on the card (Уведомления area) ──
  check('A0 admin login', await uiLogin('admin@demo.local', 'admin123'));
  await p.goto(`${WEB}/settings/employees/${EMP}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="role-access-inline"]', { timeout: 90000 });
  check('A1 inline rights section on the card', true);
  check(
    'A2 «Настроить права» button untouched',
    (await p.locator('[data-testid="employee-configure-rights"]').count()) === 1,
  );

  const inlineMoney = p.locator(
    '[data-testid="role-access-inline"] [data-testid="module-access-toggle-money"]',
  );
  await inlineMoney.scrollIntoViewIfNeeded();
  check('A3 inline Деньги toggle is ON', (await inlineMoney.getAttribute('data-state')) === 'checked');
  await inlineMoney.click();
  check('A4 inline Деньги switched OFF', (await inlineMoney.getAttribute('data-state')) === 'unchecked');
  await p.screenshot({ path: resolve(OUT, 'verify-inline-a-tree.png'), fullPage: false });
  await p.click('[data-testid="role-access-inline-save"]');
  await p.waitForTimeout(2500);

  const afterInline = await j('GET', `/roles/${demoRole.data.id}`, null, T);
  const ents1 = new Set((afterInline.data?.permissions ?? []).map((c) => c.entity));
  check('A5 inline save: money entities removed', !ents1.has('paymentin') && !ents1.has('cashout'));
  check('A6 inline save: demand kept so far', ents1.has('demand'));

  // ── B. the modal stays independent: uncheck Отгрузки Просматривать there ──
  await p.click('[data-testid="employee-configure-rights"]');
  await p.waitForSelector('[data-testid="access-settings-modal"]', { timeout: 30000 });
  check('B0 modal still opens (untouched)', true);
  await p.click('[data-testid="access-section-sales"]');
  const demandView = p.locator('[data-testid="access-demand-view"]');
  await demandView.waitFor({ state: 'visible' });
  await demandView.click();
  await p.click('[data-testid="access-settings-save"]');
  await p.waitForSelector('[data-testid="access-settings-modal"]', {
    state: 'detached',
    timeout: 30000,
  });

  const afterModal = await j('GET', `/roles/${demoRole.data.id}`, null, T);
  const cells2 = afterModal.data?.permissions ?? [];
  const has2 = (e, a) => cells2.some((c) => c.entity === e && c.action === a);
  check('B1 modal save: demand.view removed', !has2('demand', 'view'));
  check('B2 both effects together: money still gone', !has2('paymentin', 'view') && !has2('cashin', 'create'));

  // shared data: the inline tree must now show Отгрузки OFF too
  await p.waitForTimeout(2000);
  await p
    .locator('[data-testid="role-access-inline"] [data-testid="module-access-expand-sales"]')
    .click();
  const inlineDemands = p.locator(
    '[data-testid="role-access-inline"] [data-testid="module-access-toggle-sales-demands"]',
  );
  await inlineDemands.waitFor({ state: 'visible' });
  check(
    'B3 inline tree reflects the modal change (Отгрузки OFF)',
    (await inlineDemands.getAttribute('data-state')) === 'unchecked',
  );
  await p.screenshot({ path: resolve(OUT, 'verify-inline-b-synced.png'), fullPage: false });

  // ── C. the employee sees the combined result ──
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  check('C0 employee login', await uiLogin(`inline_${stamp}`, 'inline1234'));
  await p.waitForTimeout(5000);
  const moduleBar = (await p.locator('nav').first().innerText()).replace(/\s+/g, ' ');
  check('C1 Деньги GONE from the bar', !moduleBar.includes('Деньги'), moduleBar.slice(0, 200));
  check('C2 Продажи still visible', moduleBar.includes('Продажи'));
  await p.goto(`${WEB}/customer-orders`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const salesSubnav = (await p.locator('nav').last().innerText()).replace(/\s+/g, ' ');
  check('C3 Отгрузки tab GONE', !salesSubnav.includes('Отгрузки'), salesSubnav.slice(0, 250));
  await p.screenshot({ path: resolve(OUT, 'verify-inline-c-employee.png'), fullPage: false });

  const empLogin = await j('POST', '/auth/login', {
    identifier: `inline_${stamp}`,
    password: 'inline1234',
  });
  const demandsApi = await j('GET', '/demands?limit=1', null, empLogin.data?.accessToken);
  check('C4 /demands API 403', demandsApi.status === 403, `got ${demandsApi.status}`);
  const paymentsApi = await j('GET', '/payments-in?limit=1', null, empLogin.data?.accessToken);
  check('C5 /payments-in API 403 (inline effect)', paymentsApi.status === 403, `got ${paymentsApi.status}`);
} catch (e) {
  check('UNCAUGHT', false, e.message);
  await p.screenshot({ path: resolve(OUT, 'verify-inline-error.png'), fullPage: true }).catch(() => {});
} finally {
  await b.close();
  if (EMP) await j('POST', '/hr/employees/bulk-delete', { ids: [EMP] }, T);
  if (demoRole.data?.id) await j('DELETE', `/roles/${demoRole.data.id}`, null, T);
  writeFileSync(resolve(OUT, 'verify-inline-rights-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
