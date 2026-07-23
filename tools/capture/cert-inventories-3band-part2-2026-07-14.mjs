// Live verify part 2 — the steps part 1 flagged or didn't reach:
// Склад lock re-assert · typeahead pick (real product) · fill-from-assortment
// (whole catalog) · grid search · cell tab with data · save · detail
// «Создать документ» → Списание end-to-end · /new «Печать» → print tab.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3172';
const SHOT = (n) => `${process.env.SHOTDIR}/${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

const ctx = await chromium.launchPersistentContext(process.env.PROFILE, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1600, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

try {
  await page.goto(`${BASE}/inventories`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // Login gotcha (repo cert notes): submit with ENTER in the password field —
  // the button click is flaky; login lands on '/' first.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await page.locator('[data-test-id="login-email"]').isVisible().catch(() => false)))
      break;
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.locator('[data-test-id="login-password"]').press('Enter');
    await page
      .waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/inventories`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
  await page.waitForSelector('[data-test-id="inventories-inline-filter"]', { timeout: 90000 });

  // ---------- fresh doc via the warehouse modal ----------
  await page.getByRole('button', { name: /Новая инвентаризация/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-test-id^="inventory-store-option-"]').first().click();
  await page.click('[data-test-id="inventory-store-modal-choose"]');
  await page.waitForSelector('[data-test-id="inventory-new-page"]', { timeout: 60000 });
  await page.waitForTimeout(1500);

  // Склад prefilled + locked (re-assert against the container, not a bare input)
  const storeBox = page.locator('[data-test-id="field-store"]');
  const storeTxt = ((await storeBox.innerText().catch(() => '')) || '').trim();
  const storeVal = await storeBox
    .locator('input')
    .first()
    .inputValue()
    .catch(() => '');
  const lockCount = await storeBox.locator('input[disabled], [aria-disabled="true"]').count();
  const shown = storeTxt || storeVal;
  ok('Склад prefilled + locked', shown.length > 0 && lockCount > 0, `«${shown}», disabled=${lockCount}`);
  // comment placeholder now «Комментарий» (was the raw common.comment key)
  const ph = await page
    .locator('[data-test-id="inventory-grid-comment"]')
    .getAttribute('placeholder');
  ok('comment placeholder = «Комментарий»', ph === 'Комментарий', `«${ph}»`);
  await page.screenshot({ path: SHOT('30-new-locked-store') });

  // ---------- «Печать» → Инвентаризация: saves + opens the print tab ----------
  const pagesBefore = ctx.pages().length;
  await page.getByRole('button', { name: 'Печать' }).click();
  await page.waitForTimeout(400);
  await page.getByText('Инвентаризация', { exact: true }).first().click();
  const newTab = await ctx.waitForEvent('page', { timeout: 30000 }).catch(() => null);
  ok('Печать→Инвентаризация opens a NEW TAB', !!newTab && ctx.pages().length > pagesBefore);
  if (newTab) {
    await newTab.waitForLoadState('domcontentloaded');
    await newTab.waitForTimeout(3000);
    const printText = await newTab.locator('body').innerText();
    ok(
      'print form renders (Инвентаризация № + Организация/Склад)',
      printText.includes('Инвентаризация') && printText.includes('Склад'),
    );
    await newTab.screenshot({ path: SHOT('31-print-form') });
    await newTab.close();
  }
  // the /new save also redirected the main tab to the saved doc
  await page.waitForURL((u) => /\/inventories\/[0-9a-f-]{36}/.test(String(u)), { timeout: 30000 });
  await page.waitForSelector('[data-test-id="inventory-detail-positions"]', { timeout: 60000 });
  await page.waitForTimeout(1000);

  // ---------- typeahead pick (real product) ----------
  const addInput = page.locator('[data-test-id="inventory-position-add-input"]');
  await addInput.click();
  await addInput.pressSequentially('iPhone', { delay: 50 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('32-typeahead-iphone') });
  const suggestion = page.getByText(/iPhone 15 Pro Max/i).first();
  const hadSuggestion = await suggestion.isVisible().catch(() => false);
  ok('typeahead shows real product suggestion', hadSuggestion);
  if (hadSuggestion) await suggestion.click();
  await page.waitForTimeout(800);
  const qtyCells = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  ok('typeahead pick appends a row', qtyCells >= 1, `${qtyCells} rows`);
  await page.screenshot({ path: SHOT('33-row-added') });

  // enter a Фактический остаток → Разница/Избыток react
  const qtyInput = page.locator('[data-test-id^="pos-"][data-test-id$="-qty"] input').first();
  const qtyTarget = qtyInput;
  if (await qtyTarget.isVisible().catch(() => false)) {
    await qtyTarget.fill('20');
  } else {
    await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').first().fill('20').catch(() => {});
  }
  await page.waitForTimeout(600);
  const bodyAfterQty = await page.locator('body').innerText();
  ok('actual qty edit recomputes Разница (+2)', /\+2\b/.test(bodyAfterQty));
  await page.screenshot({ path: SHOT('34-qty-edited') });

  // ---------- «Дополнить из номенклатуры» (empty pick = whole catalog) ----------
  await page.locator('[data-test-id="fill-from-assortment"]').click();
  await page.waitForTimeout(500);
  await page.click('[data-test-id="fill-from-assortment-confirm"]');
  await page.waitForTimeout(3000);
  const rowsAfterCatalog = await page
    .locator('[data-test-id^="pos-"][data-test-id$="-qty"]')
    .count();
  ok('fill-from-assortment (весь справочник) appends rows', rowsAfterCatalog > 1, `${rowsAfterCatalog} rows`);
  await page.screenshot({ path: SHOT('35-after-catalog-fill') });

  // ---------- grid search filters ----------
  const searchBox = page.locator('[data-test-id="inventory-grid-search"]');
  await searchBox.fill('iPhone');
  await page.waitForTimeout(700);
  const rowsIphone = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  await page.screenshot({ path: SHOT('36-search-iphone') });
  await searchBox.fill('zzz-yoq-tovar');
  await page.waitForTimeout(700);
  const rowsZzz = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  ok('grid search filters rows', rowsIphone >= 1 && rowsZzz === 0, `iPhone=${rowsIphone}, zzz=${rowsZzz}`);
  await searchBox.fill('');
  await page.waitForTimeout(500);

  // ---------- grid Фильтр: Наименование field filters ----------
  await page.click('[data-test-id="inventory-grid-filter-toggle"]');
  await page.waitForTimeout(400);
  await page.locator('[data-test-id="grid-filter-name"]').fill('iPhone');
  await page.waitForTimeout(600);
  const rowsByNameFilter = await page
    .locator('[data-test-id^="pos-"][data-test-id$="-qty"]')
    .count();
  ok('grid Фильтр «Наименование» filters', rowsByNameFilter >= 1 && rowsByNameFilter < rowsAfterCatalog, `${rowsByNameFilter} rows`);
  await page.screenshot({ path: SHOT('37-grid-filter-name') });
  await page.click('[data-test-id="inline-filter-clear"]');
  await page.waitForTimeout(500);
  // gear on grid filter (no bookmark — moysklad parity)
  const gridBookmarkHidden = !(await page
    .locator('[data-test-id="inventory-grid-filter"] [data-test-id="inline-filter-bookmark"]')
    .isVisible()
    .catch(() => false));
  ok('grid filter has NO 🔖 (only ⚙) — moysklad parity', gridBookmarkHidden);

  // ---------- cell tab with data ----------
  await page.click('[data-test-id="inventory-tab-cell"]');
  await page.waitForTimeout(1000);
  const cellVisible = await page.locator('[data-test-id="inventory-cell-table"]').isVisible();
  const cellRows = await page.locator('[data-test-id="inventory-cell-table"] tbody tr').count();
  ok('cell tab renders with rows', cellVisible && cellRows > 0, `${cellRows} rows`);
  await page.screenshot({ path: SHOT('38-cell-tab') });
  await page.click('[data-test-id="inventory-tab-store"]');
  await page.waitForTimeout(400);

  // ---------- Комментарий + Итого ----------
  await page.locator('[data-test-id="inventory-grid-comment"]').fill('cert izoh');
  const totalTxt = await page.locator('[data-test-id="inventory-grid-total"]').innerText();
  ok('Итого computed (non-empty)', totalTxt.trim().length > 0, `Итого=${totalTxt.trim()}`);

  // ---------- save the filled doc ----------
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.waitForTimeout(3000);
  const saveErr = await page.locator('[role="alert"]').first().innerText().catch(() => '');
  ok('filled doc saves without error', !/ошибк|xato|error/i.test(saveErr), saveErr.slice(0, 80));
  await page.screenshot({ path: SHOT('39-saved') });

  // ---------- detail «Создать документ» → Списание end-to-end ----------
  const invUrl = page.url();
  await page.getByRole('button', { name: 'Создать документ' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('40-detail-createdoc-menu') });
  await page.getByText('Списание', { exact: true }).first().click();
  await page.waitForURL((u) => String(u).includes('/losses/'), { timeout: 30000 }).catch(() => {});
  const onLoss = page.url().includes('/losses/');
  ok('Создать документ → Списание opens the created Списание', onLoss, page.url());
  if (onLoss) {
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOT('41-created-loss') });
  }

  console.log('\n===== SUMMARY =====');
  for (const r of results) console.log(r);
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`TOTAL: ${results.length}, FAIL: ${fails}`);
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  await page.screenshot({ path: SHOT('49-error') }).catch(() => {});
  console.log('\n===== PARTIAL SUMMARY =====');
  for (const r of results) console.log(r);
} finally {
  await ctx.close();
}
