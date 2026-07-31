// Customer-orders parity audit — OUR side capture (localhost:3100).
// READ-ONLY: never clicks Сохранить/Удалить. Captures list + detail + new.
// Usage: node scripts/co-capture-ours.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || path.join(process.cwd(), '.audit-co/ours');
fs.mkdirSync(OUT, { recursive: true });

const WEB = process.env.WEB_URL || 'http://localhost:3100';
const API = process.env.API_URL || 'http://localhost:4000';
const EMAIL = process.env.APP_EMAIL || 'admin@demo.local';
const PASSWORD = process.env.APP_PASSWORD || 'admin123';

const log = (...a) => console.log(...a);
const write = (name, data) =>
  fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');

/** Structured harvest of everything a parity diff cares about. */
const HARVEST = () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const uniq = (a) => [...new Set(a.filter(Boolean))];

  const buttons = uniq(
    [...document.querySelectorAll('button, [role="button"], a[href]')]
      .filter(vis)
      .map((el) => {
        const t = txt(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '';
        return t.length > 0 && t.length < 60 ? t : null;
      }),
  );

  const columns = uniq(
    [...document.querySelectorAll('th, [role="columnheader"]')].filter(vis).map(txt),
  );

  // Field labels: <label>, and label-ish divs immediately preceding an input/select
  const labels = uniq([
    ...[...document.querySelectorAll('label')].filter(vis).map(txt),
    ...[...document.querySelectorAll('[data-label], [data-field-label]')].filter(vis).map(txt),
  ]).filter((t) => t && t.length < 60);

  const inputs = [...document.querySelectorAll('input, textarea, select')].filter(vis).map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    name: el.getAttribute('name') || '',
    id: el.id || '',
    placeholder: el.getAttribute('placeholder') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    testId: el.getAttribute('data-test-id') || '',
    disabled: el.disabled === true,
    readOnly: el.readOnly === true,
    value: el.type === 'password' ? '***' : (el.value || '').slice(0, 40),
  }));

  const tabs = uniq([...document.querySelectorAll('[role="tab"], [data-tab]')].filter(vis).map(txt));

  const testIds = uniq([...document.querySelectorAll('[data-test-id]')].map((el) => el.getAttribute('data-test-id')));

  // Latin-uz leak detector: visible text with Latin letters that is not a known-ok token
  const bodyText = (document.body.innerText || '').replace(/\r/g, '');

  return { buttons, columns, labels, inputs, tabs, testIds, bodyText, url: location.href, title: document.title };
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
const failedRequests = [];
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

const capture = async (name, url, waitFor) => {
  log(`\n== ${name} -> ${url}`);
  consoleErrors.length = 0;
  failedRequests.length = 0;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => log('   waitFor miss:', waitFor));
  await page.waitForTimeout(3500);
  const data = await page.evaluate(HARVEST);
  data.consoleErrors = [...consoleErrors];
  data.failedRequests = [...failedRequests];
  write(`${name}.json`, data);
  write(`${name}.txt`, data.bodyText);
  const html = await page.content();
  write(`${name}.html`, html);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  log(`   buttons=${data.buttons.length} columns=${data.columns.length} labels=${data.labels.length} inputs=${data.inputs.length} tabs=${data.tabs.length} err=${data.consoleErrors.length} 4xx=${data.failedRequests.length}`);
  return data;
};

try {
  // ---- login ----
  log('1. login', EMAIL);
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 30000 });
  await page.fill('[data-test-id="login-email"]', EMAIL);
  await page.fill('[data-test-id="login-password"]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  log('   url after login:', page.url());
  if (page.url().includes('/login')) {
    const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
    log('   LOGIN FAILED. page says:\n', t);
    process.exitCode = 3;
  }

  // ---- list ----
  await capture('list', `${WEB}/customer-orders`, 'table, [role="table"]');

  // ---- pick a real order id from the API (via the app session cookie/token) ----
  const firstId = process.env.ORDER_ID || (await page.evaluate(async (apiBase) => {
    try {
      const raw = localStorage.getItem('auth-storage') || '';
      let token = '';
      try {
        token = JSON.parse(raw)?.state?.token || '';
      } catch {}
      const res = await fetch(`${apiBase}/api/v1/customer-orders?limit=5`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const j = await res.json();
      const rows = j?.rows || j?.data || j?.items || (Array.isArray(j) ? j : []);
      return rows?.[0]?.id || null;
    } catch (e) {
      return 'ERR:' + e.message;
    }
  }, API));
  log('\n   first order id:', firstId);
  write('first-id.txt', String(firstId));

  // ---- new ----
  await capture('new', `${WEB}/customer-orders/new`, 'input, textarea');

  // ---- detail ----
  if (firstId && !String(firstId).startsWith('ERR')) {
    await capture('detail', `${WEB}/customer-orders/${firstId}`, 'input, textarea');
  } else {
    log('   SKIP detail — no order id available (seed data missing?)');
  }

  log('\nDONE ->', OUT);
} catch (e) {
  log('FATAL', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
