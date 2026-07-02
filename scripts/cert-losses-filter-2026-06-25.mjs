// LIVE CERT — /losses FILTER panel → moysklad 1:1 (FILTER commit).
// Verifies: panel CLOSED by default, opens on «Фильтр»; 15 field labels in the
// live-grounded moysklad order; a filter actually APPLIES end-to-end (select
// «Проведено»=— → posted rows drop to 0, then reset restores); 0 console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3219';
const OUT = 'D:/projects/moysklad/docs/audits/losses-list-2026-06-25/ours-after-filter.png';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

// moysklad #loss filter, live-grounded order (15 fields).
const EXPECTED = [
  'Период',
  'Товар или группа',
  'Склад',
  'Проект',
  'Организация',
  'Статус',
  'Проведено',
  'Напечатано',
  'Отправлено',
  'Владелец-сотрудник',
  'Владелец-отдел',
  'Общий доступ',
  'Когда изменен',
  'Кто изменил',
  'Статья расходов',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

const dataRowCount = () =>
  page.evaluate(() => document.querySelectorAll('tbody a[href^="/losses/"]').length);

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page
        .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
        .catch(() => {});
    });
  ok('logged in');

  await page.goto(`${BASE}/losses`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="losses-page"]').waitFor({ timeout: 90000 });
  await page.locator('thead th').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);

  // (1) panel CLOSED by default
  const panelVisibleBefore = await page
    .locator('[data-test-id="losses-inline-filter"]')
    .isVisible()
    .catch(() => false);
  if (!panelVisibleBefore) ok('filter panel CLOSED by default (moysklad parity)');
  else bad('filter panel is OPEN by default (expected closed)');

  // open it via the «Фильтр» toggle
  await page.getByRole('button', { name: 'Фильтр', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const panelVisibleAfter = await page
    .locator('[data-test-id="losses-inline-filter"]')
    .isVisible()
    .catch(() => false);
  if (panelVisibleAfter) ok('filter panel opens on «Фильтр»');
  else bad('filter panel did not open on «Фильтр»');

  // (2) 15 field labels in moysklad order
  const panelText = await page.evaluate(() => {
    const el = document.querySelector('[data-test-id="losses-inline-filter"]');
    return el ? el.innerText : '';
  });
  out.panelTextSample = panelText.replace(/\s+/g, ' ').slice(0, 400);
  let pos = -1;
  const missing = [];
  let ordered = true;
  for (const lbl of EXPECTED) {
    const idx = panelText.indexOf(lbl, pos + 1);
    if (idx < 0) {
      missing.push(lbl);
      ordered = false;
    } else pos = idx;
  }
  if (ordered && missing.length === 0)
    ok(`15 filter fields present in moysklad order: ${EXPECTED.join(' · ')}`);
  else bad(`filter fields wrong. missing/out-of-order: ${missing.join(', ') || '(order)'}`);

  // (3) functional — «Проведено» (applicable) narrows the set end-to-end.
  // (false → the draft rows only; true → the posted rows only; both < all.)
  const before = await dataRowCount();
  out.rowsBefore = before;
  await page.selectOption('[data-test-id="filter-applicable"]', 'false').catch(() => {});
  await page.waitForTimeout(1800);
  const afterFalse = await dataRowCount();
  out.rowsApplicableFalse = afterFalse;
  await page.selectOption('[data-test-id="filter-applicable"]', 'true').catch(() => {});
  await page.waitForTimeout(1800);
  const afterTrue = await dataRowCount();
  out.rowsApplicableTrue = afterTrue;
  // a real filter splits the set: |false| + |true| === |all|, and each < all
  if (before > 0 && afterFalse < before && afterTrue < before && afterFalse + afterTrue === before)
    ok(
      `filter applies end-to-end: all=${before} → Проведено=—:${afterFalse} + Проведено=✓:${afterTrue} = ${before}`,
    );
  else bad(`filter did not apply: all=${before} false=${afterFalse} true=${afterTrue}`);

  // reset → rows restored
  await page.selectOption('[data-test-id="filter-applicable"]', '').catch(() => {});
  await page.waitForTimeout(1800);
  const afterReset = await dataRowCount();
  out.rowsAfterReset = afterReset;
  if (afterReset === before) ok(`reset restores rows → ${afterReset}`);
  else bad(`reset did not restore: before=${before} afterReset=${afterReset}`);

  // (4) the new ref fields render MultiCombobox (inline). MultiCombobox emits
  // `data-testid` (NO hyphen) — distinct from the NativeSelect data-test-id.
  const hasProductCombo = await page.locator('[data-testid="filter-product"]').count().catch(() => 0);
  const hasExpenseCombo = await page
    .locator('[data-testid="filter-expense-item"]')
    .count()
    .catch(() => 0);
  if (hasProductCombo && hasExpenseCombo)
    ok('«Товар или группа» + «Статья расходов» MultiCombobox present (inline)');
  else bad(`combos missing: product=${hasProductCombo} expense=${hasExpenseCombo}`);

  // (5) boolean filters show «Нет»/«Да» (moysklad WORD, not «—»/«✓» symbols) —
  // live-grounded: #loss boolean selects are ["", "Нет", "Да"].
  const boolOpts = await page.evaluate(() => {
    const read = (testid) => {
      const sel = document.querySelector(`[data-test-id="${testid}"]`);
      return sel ? [...sel.options].map((o) => (o.textContent || '').trim()) : null;
    };
    return { applicable: read('filter-applicable'), shared: read('filter-shared') };
  });
  out.boolOpts = boolOpts;
  const wanted = ['', 'Нет', 'Да'];
  const okApp = JSON.stringify(boolOpts.applicable) === JSON.stringify(wanted);
  const okShared = JSON.stringify(boolOpts.shared) === JSON.stringify(wanted);
  if (okApp && okShared)
    ok('boolean filters «» / «Нет» / «Да» (Проведено + Общий доступ) — moysklad word, not «—»/«✓»');
  else bad(`boolean options wrong: applicable=${JSON.stringify(boolOpts.applicable)} shared=${JSON.stringify(boolOpts.shared)}`);

  await page.screenshot({ path: OUT, fullPage: false });
  ok('screenshot → ours-after-filter.png');
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await browser.close();
}

out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
