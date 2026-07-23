// LIVE VERIFY (owner 2026-07-17): the employee «История изменений» drawer is
// an INFINITE SCROLL — 30 entries load, scrolling to the bottom auto-loads
// the next chunk (twice proven), and there are NO pager buttons. Uses the
// admin's own card (their audit history is long: every session's writes).
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
const list = await j('GET', '/hr/employees?limit=50', null, T);
const adminRow = list.data?.rows?.find((r) => r.email === 'admin@demo.local');
const feedProbe = await j('GET', `/admin/audit-logs?aboutEmployee=${adminRow.id}&limit=1`, null, T);
check(
  'setup: admin history is long enough (>60 rows)',
  (feedProbe.data?.total ?? 0) > 60,
  `total ${feedProbe.data?.total}`,
);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 900 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
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
  await p.goto(`${WEB}/settings/employees/${adminRow.id}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-history-link"]', { timeout: 60000 });
  await p.click('[data-testid="employee-history-link"]');
  await p.waitForSelector('[data-test-id^="history-entry-"]', { timeout: 30000 });
  await p.waitForTimeout(1000);

  const count = () => p.locator('[data-test-id^="history-entry-"]').count();
  const c1 = await count();
  check('1 first chunk rendered (30)', c1 === 30, `got ${c1}`);
  check(
    '2 NO pager buttons in the drawer',
    (await p.locator('[data-testid="employee-history-pager"]').count()) === 0,
  );

  // scroll to the sentinel → next chunk auto-loads
  await p.locator('[data-testid="employee-history-sentinel"]').scrollIntoViewIfNeeded();
  await p.waitForFunction(
    () => document.querySelectorAll('[data-test-id^="history-entry-"]').length > 30,
    undefined,
    { timeout: 20000 },
  );
  const c2 = await count();
  check('3 scroll bottom → auto-loaded more (60)', c2 > c1, `${c1}→${c2}`);

  await p.locator('[data-testid="employee-history-sentinel"]').scrollIntoViewIfNeeded();
  await p.waitForFunction(
    (prev) => document.querySelectorAll('[data-test-id^="history-entry-"]').length > prev,
    c2,
    { timeout: 20000 },
  );
  const c3 = await count();
  check('4 scroll again → keeps loading continuously', c3 > c2, `${c2}→${c3}`);
  await p.screenshot({ path: resolve(OUT, 'verify-history-infinite.png'), fullPage: false });
} catch (e) {
  check('UNCAUGHT', false, e.message);
  await p
    .screenshot({ path: resolve(OUT, 'verify-history-infinite-error.png'), fullPage: true })
    .catch(() => {});
} finally {
  await b.close();
  writeFileSync(resolve(OUT, 'verify-history-infinite-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
