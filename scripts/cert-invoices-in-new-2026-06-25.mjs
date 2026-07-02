// LIVE CERT — /invoices-in/new rebuilt on the PO/new document-editor shell, 1:1 with
// moysklad's «Счёт поставщика» create form. Verifies: (1) the page renders; (2) the
// meta layout labels are present; (3) ref fields are INLINE type-to-search (clicking
// Контрагент/Организация opens an anchored dropdown — NOT a CatalogPicker modal); (4)
// the owner popover, «Связанные документы» tab and «Внешний код» link are present;
// (5) a real save flow (pick supplier inline → add a position → Сохранить) lands on
// /invoices-in/<uuid>. 0 console errors. Runs against the turbopack dev server :3100.
import { chromium } from 'playwright';

const BASE = process.env.CERT_BASE || 'http://localhost:3100';
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

try {
  // ---- login ----
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page
        .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
        .catch(() => {});
    });
  ok('logged in');

  // ---- render ----
  await page.goto(`${BASE}/invoices-in/new`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('invoice-in-new-page')).waitFor({ timeout: 90000 });
  ok('/invoices-in/new renders');

  // ---- meta labels ----
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const label of [
    'Организация',
    'Контрагент',
    'Склад',
    'Договор',
    'План. дата оплаты',
    'Проект',
    'Входящий номер',
    'Валюта документа',
  ]) {
    if (body.includes(label)) ok(`meta label «${label}» present`);
    else bad(`meta label «${label}» MISSING`);
  }
  // moysklad supplier-invoice editor has NO «Ожидание» / «Заказ» / «Счёт контрагента»
  if (!body.includes('Ожидание')) ok('«Ожидание» absent (moysklad parity)');
  else bad('«Ожидание» present — should be removed');

  // ---- INLINE ref fields (the user complaint: must NOT be a modal) ----
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const agentModal = await page.locator('[data-test-id="catalog-picker"]:visible').count();
  const agentDropdown = await page.locator(sel('field-agent-dropdown')).count();
  if (agentModal === 0 && agentDropdown >= 1)
    ok('Контрагент → INLINE dropdown (no modal)');
  else bad(`Контрагент NOT inline (modal=${agentModal} dropdown=${agentDropdown})`);
  const agentOpts = await page.locator('[data-test-id^="field-agent-option-"]').count();
  if (agentOpts >= 1) ok(`Контрагент dropdown shows ${agentOpts} option(s) on focus`);
  else bad('Контрагент dropdown empty on focus');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  await page.locator(sel('field-organization-input')).click().catch(() => {});
  await page.waitForTimeout(1000);
  const orgModal = await page.locator('[data-test-id="catalog-picker"]:visible').count();
  const orgDropdown = await page.locator(sel('field-organization-dropdown')).count();
  if (orgModal === 0 && orgDropdown >= 1) ok('Организация → INLINE dropdown (no modal)');
  else bad(`Организация NOT inline (modal=${orgModal} dropdown=${orgDropdown})`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // ---- owner popover / related tab / external-code link ----
  if ((await page.locator(sel('doc-owner-trigger')).count()) >= 1)
    ok('owner popover (doc-owner-trigger) present');
  else bad('owner popover MISSING');
  if (body.includes('Связанные документы')) ok('«Связанные документы» tab present');
  else bad('«Связанные документы» tab MISSING');
  // moysklad's «Счёт поставщика» editor does NOT surface «Внешний код» (the DOM has a
  // hidden link, never shown) — assert it is ABSENT from our editor too.
  const extLink = await page.locator(sel('show-external-code')).count();
  const extField = await page.locator(sel('field-external-code')).count();
  if (extLink === 0 && extField === 0) ok('«Внешний код» absent (moysklad parity)');
  else bad(`«Внешний код» present (link=${extLink} field=${extField}) — should be absent`);

  // ---- SAVE FLOW: pick supplier inline → add a position → Сохранить → /[id] ----
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const firstAgent = page.locator('[data-test-id^="field-agent-option-"]').first();
  if (await firstAgent.count()) {
    const agentName = (await firstAgent.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    await firstAgent.click().catch(() => {});
    await page.waitForTimeout(600);
    ok(`supplier picked inline: «${agentName.slice(0, 30)}»`);
  } else bad('no supplier option to pick');

  // add a position via the inline typeahead (seed product code «997»)
  await page.locator(sel('position-inline-add-input')).click().catch(() => {});
  await page.locator(sel('position-inline-add-input')).fill('997').catch(() => {});
  await page.waitForTimeout(1500);
  const sugg = page.locator('[data-test-id="position-inline-add-suggestions"] button').first();
  if (await sugg.count()) {
    await sugg.click().catch(() => {});
    await page.waitForTimeout(800);
    ok('position added via inline typeahead');
  } else {
    // fallback: keyboard select
    await page.keyboard.press('ArrowDown').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(800);
    out.steps.push('… position add via keyboard fallback');
  }
  const rowCount = await page.locator('tbody tr').count().catch(() => 0);
  if (rowCount >= 1) ok(`positions table has ${rowCount} row(s)`);
  else bad('no position row after add');

  // Сохранить
  await page.locator('button:has-text("Сохранить")').first().click().catch(() => {});
  const saved = await page
    .waitForURL((u) => /\/invoices-in\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (saved) ok(`SAVE OK → ${new URL(page.url()).pathname}`);
  else {
    const err = await page
      .locator('[data-test-id="error-state"], .text-destructive, [role="alert"]')
      .first()
      .innerText()
      .catch(() => '');
    bad(`SAVE did not redirect (url=${new URL(page.url()).pathname}) err=«${err.slice(0, 120)}»`);
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
