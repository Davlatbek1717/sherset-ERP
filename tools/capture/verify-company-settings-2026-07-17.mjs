// LIVE VERIFY: «Настройки компании» page + the LIVE «Запретить отгрузку
// товаров, которых нет на складе» behaviour (dev :3100/:4000).
// API: defaults → save → audit; behaviour: store allows negative stock, but
// the account checkbox FORCES the demand sufficiency check (post 4xx), and
// unchecking restores per-store behaviour (post succeeds into negative).
// Creates 1 product + 1 demand; cleans up (unpost+delete) at the end.
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

// ── A. defaults + save + audit ──
const g0 = await j('GET', '/company-settings', null, T);
check('A1 GET returns page shape', g0.status === 200 && 'checkShippingStock' in (g0.data ?? {}));
const basePayload = {
  globalOperationNumbering: g0.data.globalOperationNumbering ?? false,
  emailReplyMode: g0.data.emailReplyMode ?? 'EMPLOYEE',
  checkShippingStock: false,
  checkMinPrice: g0.data.checkMinPrice ?? false,
  useRecycleBin: g0.data.useRecycleBin ?? true,
  useConsignments: g0.data.useConsignments ?? false,
  showPositionAttributes: g0.data.showPositionAttributes ?? true,
  accountCountry: g0.data.accountCountry ?? 'UZ',
};
const put1 = await j('PUT', '/company-settings', { ...basePayload, checkShippingStock: true }, T);
check('A2 PUT saves (exists:true)', put1.status === 200 && put1.data?.exists === true);
check('A3 saved value round-trips', put1.data?.checkShippingStock === true);
const acctAudit = await j('GET', '/admin/audit-logs?entity=companysettings&limit=10', null, T);
check(
  'A4 audit row written with diff',
  (acctAudit.data?.items ?? []).some(
    (i) => i.fieldChanges && 'checkShippingStock' in i.fieldChanges,
  ),
);

// ── B. behaviour: checkbox forces sufficiency check on a negative-friendly store ──
// stores WRITE surface lives at /admin/stores (plain /stores is a slim
// read-only projection without version).
const stores = await j('GET', '/stores?limit=5', null, T);
const storeSlim = (stores.data?.items ?? stores.data?.rows ?? [])[0];
check('B0 store found', !!storeSlim?.id, JSON.stringify(stores.data)?.slice(0, 120));
const storeFull = await j('GET', `/admin/stores/${storeSlim.id}`, null, T);
const store = storeFull.data ?? storeSlim;
const storePatch = await j(
  'PATCH',
  `/admin/stores/${store.id}`,
  { allowNegativeStock: true, version: store.version },
  T,
);
check('B1 store set to allowNegativeStock', storePatch.status === 200, `got ${storePatch.status}`);

const prod = await j('POST', '/products', { name: `CS-verify ${stamp}` }, T);
check('B2 zero-stock product created', !!prod.data?.id, JSON.stringify(prod.data)?.slice(0, 120));
const cps = await j('GET', '/counterparties?limit=1', null, T);
const agent = (cps.data?.items ?? cps.data?.rows ?? [])[0];
const orgs = await j('GET', '/organizations?limit=1', null, T);
const org = (orgs.data?.items ?? orgs.data?.rows ?? [])[0];

const demand = await j(
  'POST',
  '/demands',
  {
    agentId: agent.id,
    organizationId: org.id,
    storeId: store.id,
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: prod.data.id,
        quantity: '3',
        priceMinor: '1000',
      },
    ],
  },
  T,
);
check('B3 draft demand created', !!demand.data?.id, JSON.stringify(demand.data)?.slice(0, 160));
const DEM = demand.data?.id;

// checkbox ON → post must be REFUSED despite the store allowing negative
const post1 = await j('POST', `/demands/${DEM}/transitions/post`, {}, T);
check(
  'B4 checkbox ON forces block (post 4xx, insufficient stock)',
  post1.status >= 400 && post1.status < 500,
  `got ${post1.status} ${JSON.stringify(post1.data)?.slice(0, 140)}`,
);

// checkbox OFF → per-store behaviour returns (negative allowed → posts)
await j('PUT', '/company-settings', { ...basePayload, checkShippingStock: false }, T);
const post2 = await j('POST', `/demands/${DEM}/transitions/post`, {}, T);
check(
  'B5 checkbox OFF: store rule applies, post succeeds',
  post2.status < 300,
  `got ${post2.status}`,
);

// ── C. browser: page 1:1 + persist through save+reload ──
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
  await p.goto(`${WEB}/settings/company`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="company-settings-page"]');
  await p.waitForTimeout(2500);
  const body = (await p.innerText('body')).replace(/\s+/g, ' ');
  for (const label of [
    'Настройки компании',
    'Правила нумерации документов',
    'Внутри календарного года',
    'По порядку за всю историю',
    'Обратный адрес в письмах',
    'Адрес сотрудника, который отправляет документ',
    'Общий адрес',
    'Об отправке документов по почте',
    'Другие политики',
    'Запретить отгрузку товаров, которых нет на складе',
    'Автоматически устанавливать минимальную цену',
    'Перемещать удаленные документы на 7 дней в корзину',
    'Использовать партии товаров',
    'Включить отображение дополнительных полей товаров и услуг в позициях документов',
    'Страна для базовых настроек',
    'Сохранить',
  ]) {
    check(`C1 page has «${label.slice(0, 40)}…»`, body.includes(label));
  }
  // toggle «Использовать партии товаров» → save → reload → persisted
  const consign = p.locator('[data-testid="company-settings-useConsignments"]');
  const before = await consign.getAttribute('data-state');
  await consign.click();
  await p.click('[data-testid="company-settings-save"]');
  await p.waitForTimeout(2500);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="company-settings-useConsignments"]');
  await p.waitForTimeout(2000);
  const after = await p
    .locator('[data-testid="company-settings-useConsignments"]')
    .getAttribute('data-state');
  check('C2 checkbox change survives save+reload', before !== after, `${before}→${after}`);
  check(
    'C3 «Изменения:» audit label appears after save',
    await p
      .locator('[data-testid="company-settings-history-link"]')
      .isVisible()
      .catch(() => false),
  );
  await p.screenshot({ path: resolve(OUT, 'verify-company-settings.png'), fullPage: true });
} catch (e) {
  check('UNCAUGHT browser', false, e.message);
} finally {
  await b.close();
  // cleanup: unpost+delete demand, delete product, restore store + settings
  if (DEM) {
    await j('POST', `/demands/${DEM}/transitions/unpost`, {}, T);
    await j('DELETE', `/demands/${DEM}`, null, T);
  }
  if (prod.data?.id) await j('DELETE', `/products/${prod.data.id}`, null, T);
  const s2 = await j('GET', `/admin/stores/${store.id}`, null, T);
  await j(
    'PATCH',
    `/admin/stores/${store.id}`,
    { allowNegativeStock: false, version: s2.data?.version },
    T,
  );
  await j('PUT', '/company-settings', basePayload, T);
  writeFileSync(resolve(OUT, 'verify-company-settings-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
