// CERT (RU): the «Полученный отчёт комиссионера» editor on /commission-reports/new-in
// vs moysklad in-direct-top.png. Verifies the IN-specific structure: header, meta labels
// (Организация-продавец·Контрагент-комиссионер·Входящий номер·Прочие услуги·Проект·Канал
// продаж), 3 tabs, «Остаток у комиссионера» grid column, the bespoke «Выручка от
// реализации» + «Комиссия» totals, compact layout, «❓», «Проведено». Screenshot. 0 console.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3283';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-in-2026-07-05/cert');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 140));
});
const out = {};
const has = (re, body) => re.test(body);
try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4500);
  await p.goto(`http://localhost:${PORT}/commission-reports/new-in`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: resolve(OUT, '00-full.png'), fullPage: true });

  const body = await p.evaluate(() => document.body.innerText);
  out.header = has(/Полученный отчет комиссионера/, body);
  out.metaLabels = {
    orgSeller: has(/Организация-продавец/, body),
    agentCommissioner: has(/Контрагент-комиссионер/, body),
    incomingNumber: has(/Входящий номер/, body),
    otherServices: has(/Прочие услуги/, body),
    project: has(/Проект/, body),
    salesChannel: has(/Канал продаж/, body),
  };
  out.tabs = {
    realized: has(/Реализовано комиссионером/, body),
    returned: has(/Возврат на склад комиссионера/, body),
    related: has(/Связанные документы/, body),
  };
  out.grid = {
    stockCol: await p.evaluate(() =>
      [...document.querySelectorAll('thead th')].some((e) => /Остаток у комиссионера/.test(e.textContent || '')),
    ),
    noHash: !(await p.evaluate(() =>
      [...document.querySelectorAll('thead th')].some((e) => (e.textContent || '').trim() === '#'),
    )),
  };
  out.totals = {
    revenueSection: has(/Выручка от реализации/, body),
    realizedRow: has(/Реализовано комиссионером:/, body),
    commissionSection: has(/Комиссия/, body),
    forRealization: has(/За реализацию товаров:/, body),
    toWarehouse: has(/На склад комиссионера:/, body),
  };
  // compact meta panel (~745px)
  out.metaWidth = await p.evaluate(() => {
    const el = document.querySelector('[data-test-id="doc-meta-panel"]');
    return el ? Math.round(el.getBoundingClientRect().width) : null;
  });
  out.provedeno = await p.evaluate(() => {
    const el = document.querySelector('[data-test-id="doc-header-applicable"]');
    return el ? el.checked : null;
  });
  out.statusPill = (
    await p.locator('[data-test-id="doc-header-status"]').first().textContent().catch(() => '')
  )?.trim();

  // add a position via the inline «Добавить из справочника», then watch live totals.
  await p.locator('button', { hasText: /Добавить из справочника/ }).first().click().catch(() => {});
  await p.waitForTimeout(1000);
  const setNum = async (sel, val) => {
    const el = p.locator(sel).first();
    if (await el.count()) {
      await el.fill('').catch(() => {});
      await el.type(val, { delay: 25 }).catch(() => {});
      await el.blur().catch(() => {});
      await p.waitForTimeout(400);
    }
  };
  await setNum('[data-test-id$="-price"]', '5000');
  await setNum('[data-test-id$="-quantity"]', '2');
  await setNum('[data-test-id$="-commission"]', '1500');
  await p.waitForTimeout(600);
  out.liveTotals = await p.evaluate(() => {
    const read = (id) => {
      const el = document.querySelector(`[data-test-id="${id}"]`);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    };
    return {
      revRealized: read('rev-realized'),
      revTotal: read('rev-total'),
      commRealization: read('comm-realization'),
      commTotal: read('comm-total'),
    };
  });
  await p.screenshot({ path: resolve(OUT, '01-with-position.png'), fullPage: true });
} catch (e) {
  out.error = String(e).slice(0, 250);
}
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
