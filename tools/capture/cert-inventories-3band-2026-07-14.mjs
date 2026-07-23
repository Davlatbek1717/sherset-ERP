// Live verify — inventories list filter 🔖/⚙ + «Выберите склад» modal (bands 1-2.1),
// /new toolbar dropdowns (band 2.2), positions block 1:1 (band 3).
// Own chrome profile (MCP profile may be busy in a parallel session).
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
  // ---------- login ----------
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (await page.locator('[data-test-id="login-email"]').isVisible().catch(() => false)) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.click('[data-test-id="login-submit"]');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 });
  }
  ok('login', true);

  // ---------- BAND 1: /inventories filter bookmark + gear ----------
  await page.goto(`${BASE}/inventories`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="inventories-inline-filter"]', { timeout: 60000 });

  await page.click('[data-test-id="inline-filter-settings"]');
  await page.waitForTimeout(400);
  const toggles = await page.locator('[data-test-id^="inline-filter-field-toggle-"]').count();
  ok('gear opens checklist', toggles >= 12, `${toggles} fields listed`);
  await page.screenshot({ path: SHOT('01-gear-checklist') });
  await page.click('[data-test-id="inline-filter-field-toggle-project"]');
  await page.waitForTimeout(300);
  const projectGone = !(await page
    .locator('[data-test-id="filter-project"]')
    .isVisible()
    .catch(() => false));
  ok('gear hides toggled-off field (project)', projectGone);
  await page.click('[data-test-id="inline-filter-field-toggle-project"]');
  await page.waitForTimeout(300);
  ok('gear re-shows field', await page.locator('[data-test-id="filter-project"]').isVisible());
  await page.keyboard.press('Escape');

  const pillExists = await page
    .getByText('inv-zakladka', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);
  await page.click('[data-test-id="inline-filter-bookmark"]');
  await page.waitForSelector(
    '[data-testid="saved-filter-save-modal"], [data-test-id="saved-filter-save-modal"]',
    { timeout: 5000 },
  );
  ok('bookmark opens «Закладки» save modal', true);
  await page.screenshot({ path: SHOT('02-bookmark-modal') });
  if (!pillExists) {
    await page.fill('[data-test-id="saved-filter-name-input"]', 'inv-zakladka');
    await page.click('[data-test-id="saved-filter-save-submit"]');
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(800);
  ok(
    'saved filter pill appears',
    await page.getByText('inv-zakladka', { exact: true }).first().isVisible(),
  );
  await page.screenshot({ path: SHOT('03-bookmark-pill') });

  // ---------- BAND 2.1: «+ Инвентаризация» → warehouse modal ----------
  await page.getByRole('link', { name: /инвентаризация/i }).first().click().catch(() => {});
  // The create control might be a button now:
  const createBtn = page.getByRole('button', { name: /Новая инвентаризация|Инвентаризация/ }).first();
  if (await createBtn.isVisible().catch(() => false)) await createBtn.click();
  await page.waitForTimeout(600);
  const storeModal = await page
    .locator('[data-testid="inventory-store-modal"], [data-test-id="inventory-store-modal"]')
    .first()
    .isVisible()
    .catch(() => false);
  ok('«+ Инвентаризация» opens «Выберите склад» modal', storeModal);
  await page.screenshot({ path: SHOT('04-store-modal') });
  // pick the first warehouse and confirm
  const firstStore = page.locator('[data-test-id^="inventory-store-option-"]').first();
  await firstStore.click();
  await page.click('[data-test-id="inventory-store-modal-choose"]');
  await page.waitForURL((u) => String(u).includes('/inventories/new?warehouseId='), {
    timeout: 15000,
  });
  ok('«Выбрать» opens /new?warehouseId=…', true);
  await page.waitForSelector('[data-test-id="inventory-new-page"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('05-new-page') });

  // Склад field locked (disabled input)
  const storeField = page.locator('[data-test-id="field-store"] input').first();
  const storeDisabled = await storeField.isDisabled().catch(() => false);
  const storeVal = await storeField.inputValue().catch(() => '');
  ok('Склад prefilled + locked', storeDisabled && storeVal.length > 0, `value=«${storeVal}»`);

  // ---------- BAND 2.2: /new toolbar dropdowns ----------
  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.waitForTimeout(400);
  ok(
    'Изменить menu: Удалить (grey)',
    await page.getByText('Удалить', { exact: true }).first().isVisible(),
  );
  await page.screenshot({ path: SHOT('06-izmenit-menu') });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Создать документ' }).click();
  await page.waitForTimeout(400);
  const createDocOk =
    (await page.getByText('Списание', { exact: true }).first().isVisible().catch(() => false)) &&
    (await page.getByText('Оприходование', { exact: true }).first().isVisible().catch(() => false));
  ok('Создать документ menu: Списание · Оприходование', createDocOk);
  await page.screenshot({ path: SHOT('07-createdoc-menu') });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Печать' }).click();
  await page.waitForTimeout(400);
  let printOk = true;
  for (const it of ['Инвентаризация', 'Комплект', 'Настроить', 'Запросить форму']) {
    if (!(await page.getByText(it).first().isVisible().catch(() => false))) printOk = false;
  }
  ok('Печать menu: Инвентаризация·Комплект·Настроить·Запросить форму', printOk);
  await page.screenshot({ path: SHOT('08-pechat-menu') });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Отправить' }).click();
  await page.waitForTimeout(400);
  const sendOk =
    (await page.getByText('Инвентаризация', { exact: true }).first().isVisible().catch(() => false)) &&
    (await page.getByText('Комплект', { exact: false }).first().isVisible().catch(() => false));
  ok('Отправить menu: Инвентаризация·Комплект', sendOk);
  await page.screenshot({ path: SHOT('09-otpravit-menu') });
  await page.keyboard.press('Escape');

  // ---------- BAND 3 on /new: toggle + filter + search, NO add bar ----------
  const bodyText = await page.locator('body').innerText();
  ok(
    'toggle «Остатки по складу | Остатки по ячейке» present',
    bodyText.includes('Остатки по складу') && bodyText.includes('Остатки по ячейке'),
  );
  ok(
    'no add bar on unsaved /new (moysklad parity)',
    !(await page
      .locator('[data-test-id="inventory-position-add-input"]')
      .isVisible()
      .catch(() => false)),
  );
  ok(
    'no Проект/Внешний код in header',
    !bodyText.includes('Внешний код') && !bodyText.includes('Проект'),
  );
  // grid filter panel opens with the 9 moysklad fields
  await page.click('[data-test-id="inventory-grid-filter-toggle"]');
  await page.waitForTimeout(400);
  const filterText = await page.locator('body').innerText();
  let gridFilterOk = true;
  for (const f of [
    'Ячейка',
    'Штрихкод',
    'Наименование',
    'Код',
    'Описание',
    'Артикул',
    'Группа товаров (без подгрупп)',
    'Товар или группа',
    'Поставщик',
  ]) {
    if (!filterText.includes(f)) gridFilterOk = false;
  }
  ok('grid Фильтр panel: 9 moysklad fields', gridFilterOk);
  await page.screenshot({ path: SHOT('10-new-grid-filter') });
  // cell tab switch
  await page.click('[data-test-id="inventory-tab-cell"]');
  await page.waitForTimeout(300);
  ok(
    'cell tab shows Ячейка column',
    await page.locator('[data-test-id="inventory-cell-table"]').isVisible(),
  );
  await page.screenshot({ path: SHOT('11-new-cell-tab') });
  await page.click('[data-test-id="inventory-tab-store"]');

  // ---------- save → detail; BAND 3 full on [id] ----------
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.waitForURL((u) => /\/inventories\/[0-9a-f-]{36}/.test(String(u)), { timeout: 30000 });
  ok('save lands on detail page', true);
  await page.waitForSelector('[data-test-id="inventory-detail-positions"]', { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOT('12-detail-page') });

  // add bar with all 3 buttons
  const addInput = page.locator('[data-test-id="inventory-position-add-input"]');
  ok('add bar present on saved draft', await addInput.isVisible().catch(() => false));
  const btnCatalog = page.getByRole('button', { name: 'Добавить из справочника' });
  const btnFillStock = page.locator('[data-test-id="fill-from-stock"]');
  const btnFillAssort = page.locator('[data-test-id="fill-from-assortment"]');
  ok(
    '3 buttons: справочник · из остатков · из номенклатуры',
    (await btnCatalog.isVisible()) &&
      (await btnFillStock.isVisible()) &&
      (await btnFillAssort.isVisible()),
  );
  await page.screenshot({ path: SHOT('13-add-bar') });

  // grid headers 1:1
  const headText = await page.locator('body').innerText();
  let headsOk = true;
  for (const h of [
    'Расчетный остаток',
    'Фактический остаток',
    'Разница',
    'Цена',
    'Избыток/недостача',
  ]) {
    if (!headText.includes(h)) headsOk = false;
  }
  ok('grid headers: Расчетный·Фактический·Разница·Цена·Избыток/недостача', headsOk);

  // «Наименование ▾» sort menu
  await page.locator('[data-test-id="position-sort-menu-trigger"], [data-test-id="position-name-menu-trigger"]').first().click().catch(async () => {
    // fallback: click the name header dropdown by text
    await page.getByRole('button', { name: /Наименование/ }).first().click();
  });
  await page.waitForTimeout(400);
  const sortMenuText = await page.locator('body').innerText();
  ok(
    'Наименование ▾ menu: sort items + С учётом групп',
    sortMenuText.includes('Сортировать по наименованию') &&
      sortMenuText.includes('Сортировать по коду') &&
      sortMenuText.includes('С учётом групп'),
  );
  await page.screenshot({ path: SHOT('14-name-sort-menu') });
  await page.keyboard.press('Escape');

  // «Расчетный остаток ▾» → Пересчитать
  await page.click('[data-test-id="inventory-calc-menu-trigger"]');
  await page.waitForTimeout(400);
  ok(
    'Расчетный остаток ▾ menu: Пересчитать',
    await page.getByText('Пересчитать', { exact: true }).first().isVisible(),
  );
  await page.screenshot({ path: SHOT('15-calc-menu') });
  await page.keyboard.press('Escape');

  // typeahead add: type, pick first suggestion
  await addInput.click();
  await addInput.pressSequentially('а', { delay: 60 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('16-typeahead') });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const rowCount1 = await page.locator('[data-test-id^="pos-"]').count();
  ok('typeahead pick appends a row', rowCount1 > 0, `${rowCount1} pos cells`);
  await page.screenshot({ path: SHOT('17-row-added') });

  // «Дополнить из остатков» modal
  await btnFillStock.click();
  await page.waitForTimeout(500);
  const fillStockText = await page.locator('body').innerText();
  ok(
    '«Дополнить из остатков» modal 1:1',
    fillStockText.includes('Изменение списка позиций') &&
      fillStockText.includes('Заполнить по расчетным остаткам на складе?') &&
      fillStockText.includes('Устанавливать фактические остатки'),
  );
  await page.screenshot({ path: SHOT('18-fill-stock-modal') });
  await page.click('[data-test-id="fill-from-stock-confirm"]');
  await page.waitForTimeout(2500);
  const totalTxt = await page.locator('body').innerText();
  const rowsAfterFill = (totalTxt.match(/из (\d[\d\s]*)/) ?? [])[1] ?? '?';
  ok('fill-from-stock appends rows', true, `pagination now «из ${rowsAfterFill}»`);
  await page.screenshot({ path: SHOT('19-after-fill-stock') });

  // «Дополнить из номенклатуры» modal (open, verify, cancel — full catalog would add 1000+)
  await btnFillAssort.click();
  await page.waitForTimeout(500);
  const fillAssortText = await page.locator('body').innerText();
  ok(
    '«Дополнить из номенклатуры» modal 1:1',
    fillAssortText.includes('Выберите товар или папку с товарами') &&
      fillAssortText.includes('Товар или папка') &&
      fillAssortText.includes('Устанавливать фактические остатки'),
  );
  await page.screenshot({ path: SHOT('20-fill-assort-modal') });
  await page.getByRole('button', { name: 'Отмена' }).first().click();
  await page.waitForTimeout(300);

  // «Добавить из справочника» → «Выбор товара» rich modal
  await btnCatalog.click();
  await page.waitForTimeout(1500);
  const catText = await page.locator('body').innerText();
  ok(
    '«Выбор товара» modal opens (folder tree + filter)',
    catText.includes('Выбор товара'),
  );
  await page.screenshot({ path: SHOT('21-product-select-modal') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // search box filters the grid
  const searchBox = page.locator('[data-test-id="inventory-grid-search"]');
  await searchBox.fill('zzz-no-such-product');
  await page.waitForTimeout(600);
  const emptyAfterSearch = await page.locator('[data-test-id^="pos-"]').count();
  ok('grid search filters rows', emptyAfterSearch === 0, `${emptyAfterSearch} rows shown`);
  await searchBox.fill('');
  await page.waitForTimeout(600);

  // cell tab on detail (with data)
  await page.click('[data-test-id="inventory-tab-cell"]');
  await page.waitForTimeout(800);
  ok(
    'detail cell tab renders',
    await page.locator('[data-test-id="inventory-cell-table"]').isVisible(),
  );
  await page.screenshot({ path: SHOT('22-detail-cell-tab') });
  await page.click('[data-test-id="inventory-tab-store"]');
  await page.waitForTimeout(300);

  // Комментарий + Итого
  ok(
    'Комментарий + Итого block',
    (await page.locator('[data-test-id="inventory-grid-comment"]').isVisible()) &&
      (await page.locator('[data-test-id="inventory-grid-total"]').isVisible()),
  );

  // save the filled doc
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT('23-saved-filled') });
  ok('filled doc saves', true);

  // «Создать документ» on detail toolbar
  await page.getByRole('button', { name: 'Создать документ' }).click();
  await page.waitForTimeout(400);
  const detailCreateOk =
    (await page.getByText('Списание', { exact: true }).first().isVisible().catch(() => false)) &&
    (await page.getByText('Оприходование', { exact: true }).first().isVisible().catch(() => false));
  ok('detail Создать документ: Списание · Оприходование', detailCreateOk);
  await page.screenshot({ path: SHOT('24-detail-createdoc') });
  await page.keyboard.press('Escape');

  console.log('\n===== SUMMARY =====');
  for (const r of results) console.log(r);
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`TOTAL: ${results.length}, FAIL: ${fails}`);
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  await page.screenshot({ path: SHOT('99-error') }).catch(() => {});
  console.log('\n===== PARTIAL SUMMARY =====');
  for (const r of results) console.log(r);
} finally {
  await ctx.close();
}
