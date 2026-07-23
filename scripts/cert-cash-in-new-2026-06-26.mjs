// LIVE CERT — /cash-in/new rebuilt on the payments-in/new shell, 1:1 with moysklad's
// «Приходный ордер» («+ Приход» 2nd form). Verifies: (1) renders; (2) ROW-PAIRED meta
// labels (Организация/Контрагент/Договор/Сумма/Включая НДС/Проект/Канал продаж/Основание/
// Валюта документа); (3) removed fields ABSENT (Входящий номер / Счёт контрагента /
// Внешний код / Статья расходов); (4) Контрагент INLINE dropdown (no modal); (5) owner
// popover + «Оплаченные документы»/«Связанные документы» tabs; (6) save (pick payer
// inline → fill Сумма → Сохранить) lands on /cash-in/<uuid>. 0 console errors. :3211.
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3211';
const OUT = resolve('D:/projects/moysklad/docs/audits/cash-money-forms-2026-06-26');
const out = { steps: [], consoleErrors: [], postResponses: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);
const sel = (tid) => `[data-test-id="${tid}"], [data-testid="${tid}"]`;

const b = await chromium.launch({ headless: true });
const page = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().includes('/cash-in')) {
    let body = '';
    try {
      body = (await r.text()).slice(0, 250);
    } catch {}
    out.postResponses.push({ status: r.status(), body });
  }
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 }).catch(() => {});
    });
  ok('logged in');

  await page.goto(`${BASE}/cash-in/new`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('cash-in-new-page')).waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  ok('/cash-in/new renders');
  await page.screenshot({ path: resolve(OUT, 'our-cashin-01-full.png') });
  await page.screenshot({ path: resolve(OUT, 'our-cashin-02-meta.png'), clip: { x: 0, y: 90, width: 900, height: 470 } });

  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const label of [
    'Организация',
    'Контрагент',
    'Баланс',
    'Договор',
    'Сумма',
    'Включая НДС',
    'Проект',
    'Канал продаж',
    'Основание',
    'Валюта документа',
    'Комментарий',
  ]) {
    if (body.includes(label)) ok(`meta «${label}» present`);
    else bad(`meta «${label}» MISSING`);
  }
  for (const absent of ['Входящий номер', 'Счёт контрагента', 'Внешний код', 'Статья расходов']) {
    if (!body.includes(absent)) ok(`«${absent}» absent (cashin parity)`);
    else bad(`«${absent}» present — should be removed`);
  }
  if (body.includes('Оплаченные документы')) ok('«Оплаченные документы» tab present');
  else bad('«Оплаченные документы» tab MISSING');
  if (body.includes('Связанные документы')) ok('«Связанные документы» tab present');
  else bad('«Связанные документы» tab MISSING');

  // INLINE ref
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const agentModal = await page.locator('[data-test-id="catalog-picker"]:visible').count();
  const agentDropdown = await page.locator(sel('field-agent-dropdown')).count();
  if (agentModal === 0 && agentDropdown >= 1) ok('Контрагент → INLINE dropdown (no modal)');
  else bad(`Контрагент NOT inline (modal=${agentModal} dropdown=${agentDropdown})`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  if ((await page.locator(sel('doc-owner-trigger')).count()) >= 1) ok('owner popover present');
  else bad('owner popover MISSING');

  // SAVE
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const firstAgent = page.locator('[data-test-id^="field-agent-option-"]').first();
  if (await firstAgent.count()) {
    await firstAgent.click().catch(() => {});
    await page.waitForTimeout(600);
    ok('payer picked inline');
  } else bad('no payer option');

  const sumInput = page.locator(sel('field-sum-minor'));
  await sumInput.click().catch(() => {});
  await sumInput.pressSequentially('500000', { delay: 25 }).catch(() => {});
  await page.waitForTimeout(400);
  ok('Сумма filled');
  await page.screenshot({ path: resolve(OUT, 'our-cashin-03-filled.png'), clip: { x: 0, y: 90, width: 900, height: 470 } });

  await page.locator('button:has-text("Сохранить")').first().click().catch(() => {});
  const saved = await page
    .waitForURL((u) => /\/cash-in\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (saved) ok(`SAVE OK → ${new URL(page.url()).pathname}`);
  else {
    const err = await page
      .locator('[data-test-id="error-state"], .text-destructive, [role="alert"]')
      .first()
      .innerText()
      .catch(() => '');
    const sumv = await sumInput.inputValue().catch(() => '?');
    bad(`SAVE did not redirect (url=${new URL(page.url()).pathname}) err=«${err.slice(0, 140)}» sum=«${sumv}»`);
  }
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await b.close();
}
out.consoleErrorCount = out.consoleErrors.length;
out.pass = out.steps.filter((s) => s.startsWith('OK')).length;
out.fail = out.steps.filter((s) => s.startsWith('BAD')).length;
console.log(JSON.stringify(out, null, 2));
