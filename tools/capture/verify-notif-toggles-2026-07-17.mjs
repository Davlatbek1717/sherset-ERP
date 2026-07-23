// LIVE VERIFY (owner report 2026-07-17): employee-card «Уведомления» toggles
// are interactive + persisted, AND the web channel actually filters delivery:
// muting «Задачи» stops task_assigned bell notifications, unmuting resumes.
// Dev :3100/:4000. Creates one throwaway employee + a few tasks (cleaned up).
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

// ── 1. employee + own token ──
const emp = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Уведом Тест',
    lastName: 'Уведом',
    firstName: 'Тест',
    email: `notif-${stamp}@test.local`,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
const EMP = emp.data?.id;
check('setup: employee created', !!EMP, JSON.stringify(emp.data)?.slice(0, 120));
await j(
  'POST',
  `/hr/employees/${EMP}/set-password`,
  { username: `notif_${stamp}`, password: 'notif1234' },
  T,
);
const empLogin = await j('POST', '/auth/login', {
  identifier: `notif-${stamp}@test.local`,
  password: 'notif1234',
});
const ET = empLogin.data?.accessToken;
check('setup: employee token', !!ET, `status ${empLogin.status}`);

const unread = async () => {
  const r = await j('GET', '/notifications?limit=100', null, ET);
  return (r.data?.items ?? []).filter((i) => i.kind === 'task_assigned').length;
};
const createdTasks = [];
const makeTask = async (title) => {
  const r = await j('POST', '/tasks', { title, assigneeId: EMP }, T);
  if (r.data?.id) createdTasks.push(r.data.id);
  // task.service emits fire-and-forget (.catch(()=>{}), not awaited) — give
  // the notification row time to land before counting.
  await new Promise((res) => setTimeout(res, 1500));
  return r;
};

// ── 2. default (no matrix saved) → task notification DELIVERED ──
const before = await unread();
await makeTask(`notif-verify A ${stamp}`);
const afterA = await unread();
check('default settings: task_assigned delivered', afterA === before + 1, `${before}→${afterA}`);

// ── 3. mute «Задачи» row → NOT delivered ──
const d1 = await j('GET', `/hr/employees/${EMP}`, null, T);
await j(
  'PUT',
  `/hr/employees/${EMP}`,
  {
    version: d1.data.version,
    notifications: { tasks: { enabled: false, web: true, email: false, phone: true } },
  },
  T,
);
await makeTask(`notif-verify B ${stamp}`);
const afterB = await unread();
check('tasks toggle OFF: task_assigned muted', afterB === afterA, `${afterA}→${afterB}`);

// ── 4. row on, web checkbox off → still NOT delivered on web ──
const d2 = await j('GET', `/hr/employees/${EMP}`, null, T);
await j(
  'PUT',
  `/hr/employees/${EMP}`,
  {
    version: d2.data.version,
    notifications: { tasks: { enabled: true, web: false, email: false, phone: true } },
  },
  T,
);
await makeTask(`notif-verify C ${stamp}`);
const afterC = await unread();
check('web checkbox OFF: web channel muted', afterC === afterB, `${afterB}→${afterC}`);

// ── 5. fully back on → delivered again ──
const d3 = await j('GET', `/hr/employees/${EMP}`, null, T);
await j(
  'PUT',
  `/hr/employees/${EMP}`,
  {
    version: d3.data.version,
    notifications: { tasks: { enabled: true, web: true, email: false, phone: true } },
  },
  T,
);
await makeTask(`notif-verify D ${stamp}`);
const afterD = await unread();
check('re-enabled: task_assigned delivered again', afterD === afterC + 1, `${afterC}→${afterD}`);

// ── 6. browser: toggles clickable + persisted through Сохранить ──
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
  await p.goto(`${WEB}/settings/employees/${EMP}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-card"]');
  await p.waitForTimeout(2000);

  const ordersToggle = p.locator('[data-testid="employee-notif-toggle-customer_orders"]');
  const ordersWeb = p.locator('[data-testid="employee-notif-customer_orders-web"]');
  check(
    'UI: orders toggle starts ON',
    (await ordersToggle.getAttribute('data-state')) === 'checked',
  );
  await ordersToggle.click();
  check(
    'UI: orders toggle clickable → OFF',
    (await ordersToggle.getAttribute('data-state')) === 'unchecked',
  );
  check('UI: OFF row greys its checkboxes', (await ordersWeb.isDisabled()) === true);
  await ordersToggle.click();
  check('UI: toggle back ON re-enables checkboxes', (await ordersWeb.isDisabled()) === false);

  // persist an OFF through Сохранить + reload
  const tasksToggle = p.locator('[data-testid="employee-notif-toggle-tasks"]');
  await tasksToggle.click(); // was ON after step 5 → now OFF
  await p.click('[data-testid="employee-save"]');
  await p.waitForTimeout(2500);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-notif-toggle-tasks"]');
  await p.waitForTimeout(1500);
  check(
    'UI: tasks OFF survives save+reload',
    (await p.locator('[data-testid="employee-notif-toggle-tasks"]').getAttribute('data-state')) ===
      'unchecked',
  );
  await p.screenshot({ path: resolve(OUT, 'verify-notif-toggles.png'), fullPage: true });
} catch (e) {
  check('UNCAUGHT browser', false, e.message);
} finally {
  await b.close();
  // cleanup: tasks + employee (archive keeps audit)
  for (const id of createdTasks) await j('POST', '/tasks/bulk-delete', { ids: [id] }, T);
  if (EMP) await j('POST', '/hr/employees/bulk-archive', { ids: [EMP] }, T);
  writeFileSync(resolve(OUT, 'verify-notif-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
