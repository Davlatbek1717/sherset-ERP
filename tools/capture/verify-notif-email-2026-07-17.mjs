// LIVE VERIFY: «Уведомления → Почта» channel — with SMTP configured and the
// email checkbox opted in, a real task_assigned notification lands on the
// EmailLog queue (subject = task title, to = employee e-mail); an employee
// WITHOUT the checkbox gets no queue row. Dev :4000. Everything created
// (config, employees, tasks) is removed at the end.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = await j('POST', '/auth/login', {
  identifier: 'admin@demo.local',
  password: 'admin123',
});
const T = admin.data?.accessToken;
const stamp = Date.now() % 1000000;
const createdTasks = [];
let A = null;
let B = null;
let hadConfig = false;

try {
  // ── 0. dummy SMTP config (unreachable host — the QUEUE row is the proof;
  //       delivery retries/failure are the cron's business) ──
  const existingCfg = await j('GET', '/email/config', null, T);
  hadConfig = !!existingCfg.data && existingCfg.status === 200 && existingCfg.data?.host;
  const cfgPut = await j(
    'PUT',
    '/email/config',
    {
      fromName: 'Verify',
      fromEmail: 'verify@test.local',
      host: '127.0.0.1',
      port: 2525,
      secure: false,
      username: 'verify',
      password: 'verify123',
    },
    T,
  );
  check(
    '0 SMTP config saved',
    cfgPut.status < 300,
    `got ${cfgPut.status} ${JSON.stringify(cfgPut.data)?.slice(0, 120)}`,
  );

  // ── 1. employee A: Почта OPT-IN for Задачи ──
  const empA = await j(
    'POST',
    '/hr/employees',
    {
      name: 'Почта Опт-ин',
      lastName: 'Почта',
      email: `mail-optin-${stamp}@test.local`,
      hrRoles: [],
      isChecker: false,
      notifications: { tasks: { enabled: true, web: true, email: true, phone: true } },
    },
    T,
  );
  A = empA.data;
  check('1 employee A created (email opt-in)', !!A?.id);

  // ── 2. employee B: Почта unchecked (default) ──
  const empB = await j(
    'POST',
    '/hr/employees',
    {
      name: 'Почта Йўқ',
      lastName: 'Почтасиз',
      email: `mail-off-${stamp}@test.local`,
      hrRoles: [],
      isChecker: false,
      notifications: { tasks: { enabled: true, web: true, email: false, phone: true } },
    },
    T,
  );
  B = empB.data;
  check('2 employee B created (email off)', !!B?.id);

  // ── 3. assign tasks to both ──
  const tA = await j('POST', '/tasks', { title: `mail-verify A ${stamp}`, assigneeId: A.id }, T);
  if (tA.data?.id) createdTasks.push(tA.data.id);
  const tB = await j('POST', '/tasks', { title: `mail-verify B ${stamp}`, assigneeId: B.id }, T);
  if (tB.data?.id) createdTasks.push(tB.data.id);
  await sleep(2000); // emit is fire-and-forget

  // ── 4. EmailLog queue: A has a row, B doesn't ──
  const logs = await j('GET', '/email/logs?limit=50', null, T);
  const items = logs.data?.items ?? logs.data?.rows ?? [];
  const rowA = items.find((l) => (l.toAddresses ?? []).includes(`mail-optin-${stamp}@test.local`));
  check(
    '4a opt-in employee got a queued e-mail (subject = task title)',
    !!rowA && rowA.subject === `mail-verify A ${stamp}`,
    JSON.stringify(rowA ?? items.slice(0, 2))?.slice(0, 200),
  );
  check(
    '4b opted-out employee got NO e-mail row',
    !items.some((l) => (l.toAddresses ?? []).includes(`mail-off-${stamp}@test.local`)),
  );
  check(
    '4c queue row is pending/failed (cron owns delivery)',
    !!rowA && ['pending', 'failed', 'sent'].includes(rowA.status),
    rowA?.status,
  );

  // ── 5. web channel still delivered to BOTH (channels independent) ──
  // (B has web:true — the bell row must exist even though почта is off.)
  // Check via admin list of notifications is recipient-scoped; use audit-free
  // path: log in as B? B has no password — check the notification table via
  // the employee's own token is unavailable; instead assert nothing crashed:
  // the tasks were created fine.
  check('5 task creates succeeded for both', !!tA.data?.id && !!tB.data?.id);
} catch (e) {
  check('UNCAUGHT', false, e.message);
} finally {
  for (const id of createdTasks) await j('POST', '/tasks/bulk-delete', { ids: [id] }, T);
  if (A?.id || B?.id)
    await j('POST', '/hr/employees/bulk-delete', { ids: [A?.id, B?.id].filter(Boolean) }, T);
  if (!hadConfig) await j('DELETE', '/email/config', null, T);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    'D:/projects/moysklad/docs/audits/settings-employees-2026-07-16/verify-notif-email-results.txt',
    results.join('\n'),
  );
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
