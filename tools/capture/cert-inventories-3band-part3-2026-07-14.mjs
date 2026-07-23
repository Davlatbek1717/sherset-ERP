// Live verify part 3 — the remaining unverified steps (parts 1-2 covered the rest):
// Склад lock (button[disabled]) · print form render · detail: typeahead pick ·
// qty edit → Разница · fill-from-assortment (весь справочник) · grid search ·
// grid Фильтр name · no-🔖 on grid filter · cell tab · Итого · save ·
// «Создать документ» → Списание end-to-end.
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

  // ---------- Склад lock on /new (CatalogPickerField disabled = button[disabled]) ----------
  await page.getByRole('button', { name: /Новая инвентаризация/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-test-id^="inventory-store-option-"]').first().click();
  await page.click('[data-test-id="inventory-store-modal-choose"]');
  await page.waitForSelector('[data-test-id="inventory-new-page"]', { timeout: 90000 });
  await page.waitForTimeout(2000);
  const storeBox = page.locator('[data-test-id="field-store"]');
  const storeTxt = ((await storeBox.innerText().catch(() => '')) || '').trim();
  const lockedBtns = await storeBox.locator('button[disabled]').count();
  ok('Склад prefilled + locked', storeTxt.length > 0 && lockedBtns > 0, `«${storeTxt}», locked buttons=${lockedBtns}`);
  await page.screenshot({ path: SHOT('50-new-locked') });

  // ---------- Печать → Инвентаризация: print tab renders ----------
  await page.getByRole('button', { name: 'Печать' }).click();
  await page.waitForTimeout(400);
  const tabPromise = ctx.waitForEvent('page', { timeout: 30000 }).catch(() => null);
  await page.getByText('Инвентаризация', { exact: true }).first().click();
  const newTab = await tabPromise;
  ok('Печать→Инвентаризация opens a NEW TAB', !!newTab);
  if (newTab) {
    await newTab.waitForLoadState('domcontentloaded');
    await newTab.waitForTimeout(6000);
    const printText = await newTab.locator('body').innerText();
    ok(
      'print form renders (Инвентаризация + Склад parties)',
      printText.includes('Инвентаризация') && printText.includes('Склад'),
    );
    await newTab.screenshot({ path: SHOT('51-print-form') });
    await newTab.close();
  }
  await page.waitForURL((u) => /\/inventories\/[0-9a-f-]{36}/.test(String(u)), { timeout: 30000 });
  await page.waitForSelector('[data-test-id="inventory-detail-positions"]', { timeout: 90000 });
  await page.waitForTimeout(1500);

  // ---------- typeahead pick ----------
  const addInput = page.locator('[data-test-id="inventory-position-add-input"]');
  await addInput.click();
  await addInput.pressSequentially('iPhone', { delay: 50 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('52-typeahead') });
  const suggestion = page.getByText(/iPhone 15 Pro Max/i).first();
  const hadSuggestion = await suggestion.isVisible().catch(() => false);
  ok('typeahead shows real product suggestion', hadSuggestion);
  if (hadSuggestion) await suggestion.click();
  await page.waitForTimeout(800);
  const qtyCells = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  ok('typeahead pick appends a row', qtyCells >= 1, `${qtyCells} rows`);

  // qty edit → Разница reacts (+2 over the 18 on hand → hmm expected 18, set 20 → +2)
  const qtyInput = page
    .locator('[data-test-id^="pos-"][data-test-id$="-qty"] input, input[data-test-id^="pos-"][data-test-id$="-qty"]')
    .first();
  await qtyInput.fill('20');
  await qtyInput.blur().catch(() => {});
  await page.waitForTimeout(800);
  const bodyAfterQty = await page.locator('body').innerText();
  ok('actual qty edit recomputes Разница (+2)', /\+2\b/.test(bodyAfterQty));
  await page.screenshot({ path: SHOT('53-qty-edited') });

  // ---------- fill-from-assortment (весь справочник) ----------
  await page.locator('[data-test-id="fill-from-assortment"]').click();
  await page.waitForTimeout(500);
  await page.click('[data-test-id="fill-from-assortment-confirm"]');
  await page.waitForTimeout(3500);
  const rowsAfterCatalog = await page
    .locator('[data-test-id^="pos-"][data-test-id$="-qty"]')
    .count();
  ok('fill-from-assortment appends the catalog', rowsAfterCatalog > 1, `${rowsAfterCatalog} rows`);
  await page.screenshot({ path: SHOT('54-after-catalog-fill') });

  // ---------- grid search ----------
  const searchBox = page.locator('[data-test-id="inventory-grid-search"]');
  await searchBox.fill('iPhone');
  await page.waitForTimeout(800);
  const rowsIphone = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  await searchBox.fill('zzz-yoq-tovar');
  await page.waitForTimeout(800);
  const rowsZzz = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  ok('grid search filters rows', rowsIphone >= 1 && rowsZzz === 0, `iPhone=${rowsIphone}, zzz=${rowsZzz}`);
  await page.screenshot({ path: SHOT('55-search') });
  await searchBox.fill('');
  await page.waitForTimeout(500);

  // ---------- grid Фильтр name + no 🔖 ----------
  await page.click('[data-test-id="inventory-grid-filter-toggle"]');
  await page.waitForTimeout(500);
  await page.locator('[data-test-id="grid-filter-name"]').fill('iPhone');
  await page.waitForTimeout(800);
  const rowsByName = await page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').count();
  ok('grid Фильтр «Наименование» filters', rowsByName >= 1 && rowsByName < rowsAfterCatalog, `${rowsByName} rows`);
  await page.screenshot({ path: SHOT('56-grid-filter') });
  const gridBookmarkHidden = !(await page
    .locator('[data-test-id="inventory-grid-filter"] [data-test-id="inline-filter-bookmark"]')
    .isVisible()
    .catch(() => false));
  ok('grid filter has NO 🔖 (only ⚙) — moysklad parity', gridBookmarkHidden);
  await page.locator('[data-test-id="inventory-grid-filter"] [data-test-id="inline-filter-clear"]').click();
  await page.waitForTimeout(500);

  // ---------- cell tab ----------
  await page.click('[data-test-id="inventory-tab-cell"]');
  await page.waitForTimeout(1200);
  const cellRows = await page.locator('[data-test-id="inventory-cell-table"] tbody tr').count();
  ok('cell tab renders with rows', cellRows > 0, `${cellRows} rows`);
  await page.screenshot({ path: SHOT('57-cell-tab') });
  await page.click('[data-test-id="inventory-tab-store"]');
  await page.waitForTimeout(400);

  // ---------- Итого + save ----------
  await page.locator('[data-test-id="inventory-grid-comment"]').fill('cert izoh');
  const totalTxt = (await page.locator('[data-test-id="inventory-grid-total"]').innerText()).trim();
  ok('Итого computed', totalTxt.length > 0, `Итого=${totalTxt}`);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOT('58-saved') });

  // ---------- «Создать документ» → Списание end-to-end ----------
  await page.getByRole('button', { name: 'Создать документ' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('59-createdoc-menu') });
  await page.getByText('Списание', { exact: true }).first().click();
  await page.waitForURL((u) => String(u).includes('/losses/'), { timeout: 45000 }).catch(() => {});
  const onLoss = page.url().includes('/losses/');
  ok('Создать документ → Списание opens the created Списание', onLoss, page.url());
  if (onLoss) {
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SHOT('60-created-loss') });
  }

  console.log('\n===== SUMMARY =====');
  for (const r of results) console.log(r);
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`TOTAL: ${results.length}, FAIL: ${fails}`);
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  await page.screenshot({ path: SHOT('69-error') }).catch(() => {});
  console.log('\n===== PARTIAL SUMMARY =====');
  for (const r of results) console.log(r);
} finally {
  await ctx.close();
}
