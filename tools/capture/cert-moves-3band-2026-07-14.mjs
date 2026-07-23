// Live verify — moves list filter (band 1) + moves/new toolbar & positions (bands 2-3).
// Own chrome profile (MCP profile is busy in a parallel session).
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3161';
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
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  }
  ok('login', true);

  // ---------- BAND 1: /moves filter bookmark + gear ----------
  await page.goto(`${BASE}/moves`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="moves-inline-filter"]', { timeout: 30000 });

  // gear ⚙ → checklist popover with the 16 fields
  await page.click('[data-test-id="inline-filter-settings"]');
  await page.waitForTimeout(400);
  const toggles = await page.locator('[data-test-id^="inline-filter-field-toggle-"]').count();
  ok('gear opens checklist', toggles >= 14, `${toggles} fields listed`);
  await page.screenshot({ path: SHOT('01-gear-checklist') });
  // toggle «Проект» off → field hidden
  await page.click('[data-test-id="inline-filter-field-toggle-project"]');
  await page.waitForTimeout(300);
  const projectGone = !(await page
    .locator('[data-test-id="filter-project"]')
    .isVisible()
    .catch(() => false));
  ok('gear hides toggled-off field (project)', projectGone);
  await page.screenshot({ path: SHOT('02-gear-project-hidden') });
  // toggle back on
  await page.click('[data-test-id="inline-filter-field-toggle-project"]');
  await page.waitForTimeout(300);
  const projectBack = await page.locator('[data-test-id="filter-project"]').isVisible();
  ok('gear re-shows field', projectBack);
  await page.keyboard.press('Escape');

  // bookmark 🔖 → «Закладки» modal, save a filter, pill appears
  const pillExists = await page.getByText('verify-zakladka', { exact: true }).first().isVisible().catch(() => false);
  await page.click('[data-test-id="inline-filter-bookmark"]');
  await page.waitForSelector('[data-testid="saved-filter-save-modal"], [data-test-id="saved-filter-save-modal"]', {
    timeout: 5000,
  });
  ok('bookmark opens save modal', true);
  await page.screenshot({ path: SHOT('03-bookmark-modal') });
  if (!pillExists) {
    await page.fill('[data-test-id="saved-filter-name-input"]', 'verify-zakladka');
    await page.click('[data-test-id="saved-filter-save-submit"]');
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(800);
  const pill = await page.getByText('verify-zakladka', { exact: true }).first().isVisible();
  ok('saved filter pill appears', pill);
  await page.screenshot({ path: SHOT('04-bookmark-pill') });

  // ---------- BAND 2: /moves/new toolbar ----------
  await page.goto(`${BASE}/moves/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="move-new-page"]', { timeout: 30000 });
  const bodyText = await page.locator('body').innerText();
  ok('«Создать документ» removed', !bodyText.includes('Создать документ'));

  // Изменить
  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.waitForTimeout(400);
  const delItem = page.getByText('Удалить', { exact: true }).first();
  const copyItem = page.getByText('Копировать', { exact: true }).first();
  ok('Изменить menu: Удалить + Копировать', (await delItem.isVisible()) && (await copyItem.isVisible()));
  await page.screenshot({ path: SHOT('05-izmenit-menu') });
  await page.keyboard.press('Escape');

  // Печать
  await page.getByRole('button', { name: 'Печать' }).click();
  await page.waitForTimeout(400);
  const printItems = ['Перемещение', 'Комплект', 'Настроить', 'Запросить форму'];
  let printOk = true;
  for (const it of printItems) {
    const vis = await page.getByText(it).first().isVisible().catch(() => false);
    if (!vis) printOk = false;
  }
  ok('Печать menu: Перемещение·Комплект·Настроить·Запросить форму', printOk);
  await page.screenshot({ path: SHOT('06-pechat-menu') });
  await page.keyboard.press('Escape');

  // Отправить
  await page.getByRole('button', { name: 'Отправить' }).click();
  await page.waitForTimeout(400);
  const sendOk =
    (await page.getByText('Перемещение', { exact: true }).first().isVisible().catch(() => false)) &&
    (await page.getByText('Комплект…', { exact: false }).first().isVisible().catch(() => false));
  ok('Отправить menu: Перемещение·Комплект', sendOk);
  await page.screenshot({ path: SHOT('07-otpravit-menu') });
  await page.keyboard.press('Escape');

  // ---------- BAND 3: position add area ----------
  const inline = page.locator('[data-test-id="move-position-add-input"]');
  ok('inline add-position input present', await inline.isVisible());
  const btnCatalog = page.getByRole('button', { name: 'Добавить из справочника' });
  const btnCheck = page.getByRole('button', { name: 'Проверить комплектацию' });
  ok('two buttons present', (await btnCatalog.isVisible()) && (await btnCheck.isVisible()));
  await page.screenshot({ path: SHOT('08-position-bar') });

  // typeahead search — type a prefix, dropdown shows matches
  await inline.click();
  await inline.pressSequentially('Air', { delay: 40 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT('09-typeahead') });
  const suggestionText = await page.locator('body').innerText();
  ok('typeahead dropdown has matches', /AirPods/.test(suggestionText), 'query «Air» (prefix)');
  await page.keyboard.press('Escape');

  // «Добавить из справочника» → catalog modal opens; pick appends a row
  await btnCatalog.click();
  await page.waitForTimeout(1000);
  const modalVisible = await page
    .locator('[data-testid="catalog-picker"], [role="dialog"]')
    .first()
    .isVisible()
    .catch(() => false);
  ok('catalog modal opens', modalVisible);
  await page.screenshot({ path: SHOT('10-catalog-modal') });
  // pick the first row in the modal list
  const firstRow = page.locator('[role="dialog"] li, [role="dialog"] [data-test-id^="picker-item"], [role="dialog"] button').filter({ hasText: /.{3,}/ }).first();
  // safer: search then click first result
  const modalSearch = page.locator('[role="dialog"] input').first();
  await modalSearch.fill('Air');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT('11-catalog-search') });
  const pickTarget = page.locator('[role="dialog"]').getByText(/AirPods/i).first();
  if (await pickTarget.isVisible().catch(() => false)) {
    await pickTarget.click();
    await page.waitForTimeout(600);
  }
  const rowAdded = (await page.locator('[data-test-id^="pos-"]').count()) > 0;
  ok('catalog pick appends position row', rowAdded);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT('12-row-added') });

  // grid headers: Остаток (со склада) / Остаток (на склад) / Цена / Сумма
  const gridText = await page.locator('body').innerText();
  ok(
    'grid headers 1:1',
    gridText.includes('Остаток (со склада)') &&
      gridText.includes('Остаток (на склад)') &&
      gridText.includes('Цена') &&
      gridText.includes('Сумма'),
  );
  // Итого bottom-right
  ok('Итого block present', await page.locator('[data-test-id="move-total"]').isVisible());

  // «Проверить комплектацию» → «Сохранение изменений» dialog
  await btnCheck.click();
  await page.waitForTimeout(500);
  const dlgText = await page.locator('body').innerText();
  ok(
    '«Проверить комплектацию» opens save dialog',
    dlgText.includes('Сохранение изменений') && dlgText.includes('Данные были изменены'),
  );
  await page.screenshot({ path: SHOT('13-check-save-dialog') });
  // cancel
  await page.getByRole('button', { name: 'Отмена' }).first().click().catch(() => {});
  await page.waitForTimeout(300);

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
