// LIVE VERIFY (owner report 2026-07-17 #2): «Настроить права» now hides
// individual SUB-NAV tabs too. Demo user gets a custom role = Administrator's
// matrix MINUS customerorder + report → after login: Продажи module visible
// but «Заказы покупателей» tab GONE; Склад visible but «Остатки» tab GONE;
// direct API access to customer-orders 403s. Cleanup at the end.
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

// role = Administrator matrix minus customerorder + report
const roles = await j('GET', '/roles', null, T);
const adminRole = roles.data?.items?.find((r) => r.name === 'Administrator');
const adminDetail = await j('GET', `/roles/${adminRole.id}`, null, T);
const trimmed = adminDetail.data.permissions.filter(
  (c) => c.entity !== 'customerorder' && c.entity !== 'report',
);
const demoRole = await j(
  'POST',
  '/roles',
  { name: `DemoLimited-${stamp}`, description: 'subnav-rights demo', permissions: trimmed },
  T,
);
check(
  'setup: demo role created',
  !!demoRole.data?.id,
  JSON.stringify(demoRole.data)?.slice(0, 120),
);

const emp = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Демо Права',
    lastName: 'Демо',
    firstName: 'Права',
    email: `subnav-${stamp}@test.local`,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
const EMP = emp.data?.id;
await j(
  'POST',
  `/hr/employees/${EMP}/set-password`,
  { username: `subnav_${stamp}`, password: 'demo1234' },
  T,
);
await j('PUT', `/roles/employee/${EMP}`, { roleIds: [demoRole.data.id] }, T);

// API-level: direct customer-orders access must 403 for the demo user
const empLogin = await j('POST', '/auth/login', {
  identifier: `subnav-${stamp}@test.local`,
  password: 'demo1234',
});
const ET = empLogin.data?.accessToken;
const coList = await j('GET', '/customer-orders?limit=1', null, ET);
check(
  'API: customer-orders 403 for restricted user',
  coList.status === 403,
  `got ${coList.status}`,
);
const demandsList = await j('GET', '/demands?limit=1', null, ET);
check('API: demands still allowed', demandsList.status === 200, `got ${demandsList.status}`);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
try {
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input');
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  for (let a = 0; a < 3; a++) {
    await p.locator('input').nth(0).fill(`subnav-${stamp}@test.local`);
    await p.locator('input').nth(1).fill('demo1234');
    await p.click('button[type=submit]');
    const ok = await p
      .waitForURL((u) => !String(u).includes('/login'), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    await p.waitForTimeout(2000);
  }
  await p.waitForTimeout(5000); // permissions/me + nav render

  // Продажи module: visible (demand/invoiceout allowed) → open it
  await p.goto(`${WEB}/demands`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const salesNav = (await p.locator('nav').last().innerText()).replace(/\s+/g, ' ');
  check('UI: Продажи subnav shows Отгрузки', salesNav.includes('Отгрузки'), salesNav.slice(0, 200));
  check(
    'UI: «Заказы покупателей» tab HIDDEN',
    !salesNav.includes('Заказы покупателей'),
    salesNav.slice(0, 250),
  );
  await p.screenshot({ path: resolve(OUT, 'subnav-a-sales-no-orders.png'), fullPage: false });

  // Склад module: «Остатки» (report entity) hidden, Оприходования visible
  await p.goto(`${WEB}/moves`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const stockNav = (await p.locator('nav').last().innerText()).replace(/\s+/g, ' ');
  check(
    'UI: Склад subnav shows Перемещения',
    stockNav.includes('Перемещения'),
    stockNav.slice(0, 200),
  );
  check('UI: «Остатки» tab HIDDEN', !stockNav.includes('Остатки'), stockNav.slice(0, 250));
  await p.screenshot({ path: resolve(OUT, 'subnav-b-stock-no-remains.png'), fullPage: false });

  // direct URL: page renders an error/empty state, NOT the orders data
  await p.goto(`${WEB}/customer-orders`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const coBody = (await p.innerText('body')).replace(/\s+/g, ' ');
  check(
    'UI: direct /customer-orders URL shows NO order rows (backend 403)',
    !coBody.includes('02849') && !coBody.includes('XYZ YaTTT'),
    coBody.slice(0, 200),
  );
  await p.screenshot({ path: resolve(OUT, 'subnav-c-direct-url-blocked.png'), fullPage: false });
} catch (e) {
  check('UNCAUGHT browser', false, e.message);
} finally {
  await b.close();
  // cleanup: delete demo employee + role
  if (EMP) await j('POST', '/hr/employees/bulk-delete', { ids: [EMP] }, T);
  if (demoRole.data?.id) await j('DELETE', `/roles/${demoRole.data.id}`, null, T);
  writeFileSync(resolve(OUT, 'verify-subnav-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
