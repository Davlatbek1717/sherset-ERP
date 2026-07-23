// Settings-section mobile sweep — EVERY /settings route (static + first-record
// [id] + /new) measured at the given width (env W, default 390); reports
// overflow drivers. SHOTS=1 saves a screenshot per page.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3100';
const W = Number(process.env.W || 390);
const SHOTS = process.env.SHOTS === '1';

const STATIC_ROUTES = [
  '/settings',
  '/settings/all',
  '/settings/attributes',
  '/settings/audit-log',
  '/settings/bank-accounts',
  '/settings/bank-accounts/new',
  '/settings/business-processes',
  '/settings/cash-desks',
  '/settings/cash-desks/new',
  '/settings/commission-report-statuses',
  '/settings/company',
  '/settings/counterparty-statuses',
  '/settings/countries',
  '/settings/currencies',
  '/settings/custom-entities',
  '/settings/custom-entities/new',
  '/settings/customer-order-statuses',
  '/settings/delete-account',
  '/settings/demand-statuses',
  '/settings/departments',
  '/settings/email',
  '/settings/email/log',
  '/settings/employees',
  '/settings/employees/new',
  '/settings/exchange-rates',
  '/settings/expense-items',
  '/settings/expense-items/new',
  '/settings/export',
  '/settings/import',
  '/settings/invoice-out-statuses',
  '/settings/label-templates',
  '/settings/label-templates/new',
  '/settings/mxik',
  '/settings/mxik/import',
  '/settings/organizations',
  '/settings/organizations/new',
  '/settings/price-types',
  '/settings/price-types/new',
  '/settings/profile',
  '/settings/projects',
  '/settings/projects/new',
  '/settings/publications',
  '/settings/publications/new',
  '/settings/purchase-order-statuses',
  '/settings/purchase-return-statuses',
  '/settings/regions',
  '/settings/regions/new',
  '/settings/sales-channels',
  '/settings/sales-return-statuses',
  '/settings/scenarios',
  '/settings/stores',
  '/settings/stores/new',
  '/settings/supply-statuses',
  '/settings/task-statuses',
  '/settings/task-types',
  '/settings/tax-rates',
  '/settings/tax-rates/new',
  '/settings/tokens',
  '/settings/uoms',
  '/settings/uoms/new',
  '/settings/users',
  '/settings/webhooks',
];

// list route -> detail href prefix, for first-record [id] resolution
const DETAIL_FROM = [
  ['/settings/employees', '/settings/employees/'],
  ['/settings/organizations', '/settings/organizations/'],
  ['/settings/bank-accounts', '/settings/bank-accounts/'],
  ['/settings/cash-desks', '/settings/cash-desks/'],
  ['/settings/expense-items', '/settings/expense-items/'],
  ['/settings/price-types', '/settings/price-types/'],
  ['/settings/projects', '/settings/projects/'],
  ['/settings/regions', '/settings/regions/'],
  ['/settings/stores', '/settings/stores/'],
  ['/settings/tax-rates', '/settings/tax-rates/'],
  ['/settings/uoms', '/settings/uoms/'],
  ['/settings/label-templates', '/settings/label-templates/'],
  ['/settings/custom-entities', '/settings/custom-entities/'],
  ['/settings/users', '/settings/users/'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (let a = 0; a < 3; a++) {
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type="submit"]');
  const left = await page
    .waitForURL((u) => !String(u).includes('/login'), { waitUntil: 'commit', timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  if (left) break;
}

const measure = async () =>
  page.evaluate((W) => {
    const inHScroll = (el) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };
    const sw = document.documentElement.scrollWidth;
    if (sw <= W + 1) return { sw, list: [] };
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if ((rect.right > W + 1 || rect.left < -1) && !inHScroll(el)) {
        const ownOx = getComputedStyle(el).overflowX;
        let childToo = false;
        if (ownOx === 'visible') {
          for (const c of el.children) {
            if (c.getBoundingClientRect().right > W + 1) {
              childToo = true;
              break;
            }
          }
        }
        if (childToo) continue;
        const chain = [];
        let p = el;
        for (let i = 0; i < 7 && p && p !== document.body; i++) {
          const cls = String(
            p.className && p.className.baseVal !== undefined ? p.className.baseVal : p.className,
          );
          chain.push(
            '<' +
              p.tagName.toLowerCase() +
              '>' +
              (p.getAttribute('data-test-id') || p.getAttribute('data-testid') || '') +
              '.' +
              cls.slice(0, 60),
          );
          p = p.parentElement;
        }
        out.push({ w: Math.round(rect.width), right: Math.round(rect.right), chain });
      }
    }
    return { sw, list: out.slice(0, 3) };
  }, W);

const bad = [];
const visit = async (path, tag = '') => {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    if (page.url().includes('/login')) {
      console.log(`ERR ${path} auth-bounce`);
      return;
    }
    const r = await measure();
    const okk = r.sw <= W + 1;
    console.log(`${okk ? 'OK ' : 'BAD'} ${path}${tag} sw=${r.sw}`);
    if (!okk) {
      bad.push(path);
      for (const o of r.list) {
        console.log(`   w=${o.w} right=${o.right}`);
        for (const c of o.chain) console.log(`     ${c}`);
      }
    }
    if (SHOTS) {
      const slug = (path.replace(/^\/settings\/?/, '') || 'root').replace(/[^a-z0-9-]/gi, '_');
      await page.screenshot({ path: `D:/projects/moysklad/tasdiq-settings-${W}-${slug}.png` });
    }
  } catch (e) {
    console.log(`ERR ${path} ${String(e).slice(0, 70)}`);
  }
};

for (const p of STATIC_ROUTES) await visit(p);

for (const [list, prefix] of DETAIL_FROM) {
  try {
    await page.goto(`${BASE}${list}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const href = await page.evaluate((pfx) => {
      const a = Array.from(document.querySelectorAll(`a[href^="${pfx}"]`)).find(
        (x) => !(x.getAttribute('href') || '').endsWith('/new'),
      );
      if (a) return a.getAttribute('href');
      const row = document.querySelector('[data-test-id^="settings-row-"], tbody tr[data-href]');
      return row ? row.getAttribute('data-href') : null;
    }, prefix);
    if (href) await visit(href, ' [id]');
    else console.log(`SKIP ${prefix}[id] (royxatda yozuv-link topilmadi)`);
  } catch (e) {
    console.log(`ERR resolving ${prefix}[id] ${String(e).slice(0, 60)}`);
  }
}

console.log(`\n===== BAD: ${bad.length}`);
for (const b of bad) console.log(` - ${b}`);
await browser.close();
