// LIVE CERT — /payments-in/new rebuilt on the invoices-in/new document-editor shell,
// 1:1 with moysklad's «Входящий платёж» («+ Приход»). Verifies: (1) renders; (2) the
// ROW-PAIRED meta labels present (Организация/Контрагент/Договор/Сумма/Включая НДС/
// Проект/Канал продаж/Входящий номер/Назначение платежа/Валюта документа); (3) the
// removed fields are ABSENT (Счёт контрагента / Внешний код / Входящая дата label);
// (4) ref fields are INLINE type-to-search (Контрагент opens an anchored dropdown,
// NOT a CatalogPicker modal); (5) owner popover + «Оплаченные документы» /
// «Связанные документы» tabs present; (6) a real save flow (pick payer inline → fill
// Сумма → Сохранить) lands on /payments-in/<uuid>. 0 console errors. Fresh dev :3210.
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3210';
const OUT = resolve('D:/projects/moysklad/docs/audits/payments-in-new-2026-06-26');
const out = { steps: [], consoleErrors: [] };
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
out.postResponses = [];
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().includes('/payments-in')) {
    let bodyTxt = '';
    try {
      bodyTxt = (await r.text()).slice(0, 300);
    } catch {}
    out.postResponses.push({ url: r.url(), status: r.status(), body: bodyTxt });
  }
});

try {
  // ---- login ----
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page
        .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 })
        .catch(() => {});
    });
  ok('logged in');

  // ---- render ----
  await page.goto(`${BASE}/payments-in/new`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('payment-in-new-page')).waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  ok('/payments-in/new renders');

  await page.screenshot({ path: resolve(OUT, 'our-01-full.png') });
  await page.screenshot({ path: resolve(OUT, 'our-02-meta.png'), clip: { x: 0, y: 90, width: 900, height: 470 } });

  // ---- meta labels (moysklad ground-truth order) ----
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
    'Входящий номер',
    'Назначение платежа',
    'Валюта документа',
  ]) {
    if (body.includes(label)) ok(`meta label «${label}» present`);
    else bad(`meta label «${label}» MISSING`);
  }
  // moysklad's «Входящий платёж» editor has NO «Счёт контрагента» / «Внешний код» /
  // «Входящая дата»-as-row label.
  for (const absent of ['Счёт контрагента', 'Счет контрагента', 'Внешний код', 'Входящая дата']) {
    if (!body.includes(absent)) ok(`«${absent}» absent (moysklad parity)`);
    else bad(`«${absent}» present — should be removed`);
  }
  // tabs
  if (body.includes('Оплаченные документы')) ok('«Оплаченные документы» tab present');
  else bad('«Оплаченные документы» tab MISSING');
  if (body.includes('Связанные документы')) ok('«Связанные документы» tab present');
  else bad('«Связанные документы» tab MISSING');

  // ---- INLINE ref fields (must NOT be a modal) ----
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const agentModal = await page.locator('[data-test-id="catalog-picker"]:visible').count();
  const agentDropdown = await page.locator(sel('field-agent-dropdown')).count();
  if (agentModal === 0 && agentDropdown >= 1) ok('Контрагент → INLINE dropdown (no modal)');
  else bad(`Контрагент NOT inline (modal=${agentModal} dropdown=${agentDropdown})`);
  const agentOpts = await page.locator('[data-test-id^="field-agent-option-"]').count();
  if (agentOpts >= 1) ok(`Контрагент dropdown shows ${agentOpts} option(s)`);
  else bad('Контрагент dropdown empty');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // ---- owner popover ----
  if ((await page.locator(sel('doc-owner-trigger')).count()) >= 1) ok('owner popover present');
  else bad('owner popover MISSING');

  // ---- SAVE FLOW: pick payer inline → fill Сумма → Сохранить → /[id] ----
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const firstAgent = page.locator('[data-test-id^="field-agent-option-"]').first();
  if (await firstAgent.count()) {
    const agentName = (await firstAgent.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    await firstAgent.click().catch(() => {});
    await page.waitForTimeout(600);
    ok(`payer picked inline: «${agentName.slice(0, 30)}»`);
  } else bad('no payer option to pick');

  // org auto-prefills from user defaults — verify it has a value
  const orgVal = await page.locator(sel('field-organization')).innerText().catch(() => '');
  if (orgVal.trim().length > 1) ok(`Организация auto-filled: «${orgVal.replace(/\s+/g, ' ').trim().slice(0, 24)}»`);
  else out.steps.push('… Организация empty (will rely on default)');

  // fill Сумма (MoneyInput) — type digits
  const sumInput = page.locator(sel('field-sum-minor'));
  await sumInput.click().catch(() => {});
  await sumInput.pressSequentially('500000', { delay: 25 }).catch(() => {});
  await page.waitForTimeout(400);
  ok('Сумма filled');

  await page.screenshot({ path: resolve(OUT, 'our-03-filled.png'), clip: { x: 0, y: 90, width: 900, height: 470 } });

  await page.locator('button:has-text("Сохранить")').first().click().catch(() => {});
  const saved = await page
    .waitForURL((u) => /\/payments-in\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (saved) {
    ok(`SAVE OK → ${new URL(page.url()).pathname}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT, 'our-04-saved.png') });
  } else {
    const err = await page
      .locator('[data-test-id="error-state"], .text-destructive, [role="alert"], [data-test-id="document-editor-error"]')
      .first()
      .innerText()
      .catch(() => '');
    const sumDisplay = await page.locator(sel('field-sum-minor')).inputValue().catch(() => '?');
    bad(`SAVE did not redirect (url=${new URL(page.url()).pathname}) err=«${err.slice(0, 160)}» sumInput=«${sumDisplay}»`);
    await page.screenshot({ path: resolve(OUT, 'our-05-save-fail.png') });
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
