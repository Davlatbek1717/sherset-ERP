// Live verify — /internal-orders 3-band bug-report (owner screenshots 2026-07-14):
//  Band 1: list filter 🔖 (Закладки modal) + ⚙ (14-field visibility checklist)
//  Band 2: /new toolbar 4 dropdowns (Изменить/Создать документ/Печать/Отправить)
//          + Печать→Внутренний заказ = save → NEW TAB /print/internal-order/[id]
//          + Создать документ→Заказ поставщику = save → /purchase-orders/new prefill
//  Band 3: position bar — «Добавить из справочника» (Выбор товара modal, qty append),
//          rich inline typeahead, «Проверить комплектацию» («Сохранение изменений»
//          confirm → check window → Принять и завершить проверку → detail)
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3172';
const SHOT = (n) => `D:/projects/moysklad/tasdiq-io-${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

async function login() {
  await page.goto(`${BASE}/internal-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}/internal-orders`, { waitUntil: 'domcontentloaded' });
  }
}

try {
  await login();
  await page.waitForSelector('[data-test-id="internal-orders-page"]', { timeout: 30000 });
  await page.waitForTimeout(1200);

  // ── BAND 1: 🔖 bookmark → «Закладки» modal ─────────────────────────────
  const bm = page.locator('[data-test-id="inline-filter-bookmark"]');
  ok('band1: 🔖 bookmark button present', (await bm.count()) === 1);
  const bmDisabled = await bm.isDisabled().catch(() => true);
  ok('band1: 🔖 is CLICKABLE (was dead)', !bmDisabled);
  await bm.click();
  const saveModal = page.locator('[data-testid="saved-filter-save-modal"]');
  await saveModal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  ok('band1: 🔖 opens «Закладки» modal', await saveModal.isVisible().catch(() => false));
  await page.screenshot({ path: SHOT('1-zakladki-modal') });
  await page.fill('[data-test-id="saved-filter-name-input"]', 'cert-io');
  await page.click('[data-test-id="saved-filter-save-submit"]');
  await page.waitForTimeout(1200);
  const pill = page.locator('[data-test-id^="saved-filter-pill-"]', { hasText: 'cert-io' });
  ok('band1: bookmark saved → pill appears', (await pill.count()) > 0);

  // ── BAND 1: ⚙ gear → 14-field visibility checklist ────────────────────
  const gear = page.locator('[data-test-id="inline-filter-settings"]');
  ok('band1: ⚙ gear button present', (await gear.count()) === 1);
  await gear.click();
  await page.waitForTimeout(800);
  const toggles = page.locator('[data-test-id^="inline-filter-field-toggle-"]');
  const toggleCount = await toggles.count();
  ok('band1: ⚙ opens field checklist with 14 fields', toggleCount === 14, `count=${toggleCount}`);
  const labels = [];
  for (let i = 0; i < toggleCount; i++) labels.push((await toggles.nth(i).innerText()).trim());
  console.log('gear fields:', JSON.stringify(labels));
  await page.screenshot({ path: SHOT('2-gear-checklist') });
  // toggle «Проект» off → field hides; back on → shows
  const projToggle = page.locator('[data-test-id="inline-filter-field-toggle-project"]');
  await projToggle.click();
  await page.waitForTimeout(500);
  const projField = page.locator('[data-test-id="filter-project"]');
  ok('band1: ⚙ toggle hides the field', (await projField.count()) === 0);
  await projToggle.click();
  await page.waitForTimeout(500);
  ok('band1: ⚙ toggle shows it back', (await projField.count()) === 1);
  await page.keyboard.press('Escape');

  // ── BAND 2: /new toolbar dropdowns ─────────────────────────────────────
  await page.goto(`${BASE}/internal-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="internal-order-new-page"]', { timeout: 30000 });
  await page.waitForTimeout(2000); // defaults autofill

  // «Изменить» = Удалить(disabled) · Копировать
  await page.click('[data-test-id="doc-toolbar-modify"]');
  await page.waitForTimeout(600);
  let items = page.locator('[role="menuitem"]');
  let texts = (await items.allInnerTexts()).map((t) => t.trim());
  ok(
    'band2: «Изменить» = Удалить·Копировать',
    texts.length === 2 && texts[0] === 'Удалить' && texts[1] === 'Копировать',
    JSON.stringify(texts),
  );
  const delDisabled = await items.first().getAttribute('data-disabled');
  ok('band2: «Удалить» greyed on /new', delDisabled !== null);
  await page.screenshot({ path: SHOT('3-izmenit-menyu') });
  await page.keyboard.press('Escape');

  // «Создать документ» = Перемещение · Заказ поставщику · …(с учетом «доступно») · Снабжение
  await page.click('[data-test-id="doc-toolbar-create-doc"]');
  await page.waitForTimeout(600);
  items = page.locator('[role="menuitem"]');
  texts = (await items.allInnerTexts()).map((t) => t.trim());
  ok(
    'band2: «Создать документ» 4 items 1:1',
    texts.length === 4 &&
      texts[0] === 'Перемещение' &&
      texts[1] === 'Заказ поставщику' &&
      texts[2] === 'Заказ поставщику (с учетом «доступно»)' &&
      texts[3] === 'Снабжение',
    JSON.stringify(texts),
  );
  await page.screenshot({ path: SHOT('4-createdoc-menyu') });
  await page.keyboard.press('Escape');

  // «Печать» = Внутренний заказ · Комплект… · Настроить… + «Запросить форму» promo
  await page.click('[data-test-id="doc-toolbar-print"]');
  await page.waitForTimeout(600);
  items = page.locator('[role="menuitem"]');
  texts = (await items.allInnerTexts()).map((t) => t.trim());
  const promo = page.locator('[data-test-id="print-request-form"]');
  ok(
    'band2: «Печать» = Внутренний заказ·Комплект…·Настроить… + promo',
    texts[0] === 'Внутренний заказ' &&
      texts.includes('Комплект…') &&
      texts.includes('Настроить...') &&
      (await promo.count()) === 1,
    JSON.stringify(texts),
  );
  ok(
    'band2: promo has «Как запросить» button',
    (await page.locator('[data-test-id="print-request-form-btn"]').count()) === 1,
  );
  await page.screenshot({ path: SHOT('5-pechat-menyu') });
  await page.keyboard.press('Escape');

  // «Отправить» = Внутренний заказ · Комплект…
  await page.click('[data-test-id="doc-toolbar-send"]');
  await page.waitForTimeout(600);
  items = page.locator('[role="menuitem"]');
  texts = (await items.allInnerTexts()).map((t) => t.trim());
  ok(
    'band2: «Отправить» = Внутренний заказ·Комплект…',
    texts.length === 2 && texts[0] === 'Внутренний заказ' && texts[1] === 'Комплект…',
    JSON.stringify(texts),
  );
  await page.screenshot({ path: SHOT('6-otpravit-menyu') });
  await page.keyboard.press('Escape');

  // ── BAND 3: «Добавить из справочника» → «Выбор товара» modal ──────────
  const catalogBtn = page.locator('[data-test-id="io-position-add-catalog"]');
  ok('band3: «Добавить из справочника» button present', (await catalogBtn.count()) === 1);
  await catalogBtn.click();
  const psModal = page.locator('[data-test-id="product-select-modal"]');
  await psModal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  ok('band3: opens «Выбор товара» modal', await psModal.isVisible().catch(() => false));
  await page.waitForTimeout(2500); // products load
  ok(
    'band3: modal has «Фильтр» toggle + folder tree',
    (await page.locator('[data-test-id="product-select-filter-toggle"]').count()) === 1,
  );
  // search narrows: type a prefix, rows filter to matches
  await page.fill('[data-test-id="product-select-search"]', 'Air');
  await page.waitForTimeout(1500);
  const rowCount = await page.locator('[data-test-id^="product-select-row-"]').count();
  ok('band3: modal search «Air» returns rows', rowCount > 0, `rows=${rowCount}`);
  // type qty=2 on the first row and confirm
  const firstQty = page.locator('[data-test-id^="product-select-qty-"]').first();
  await firstQty.fill('2');
  await page.screenshot({ path: SHOT('7-vybor-tovara-modal') });
  await page.click('[data-test-id="product-select-confirm"]');
  await page.waitForTimeout(800);
  let posRows = await page.locator('[data-test-id^="pos-"][data-test-id$="-name"]').count();
  ok('band3: «Выбрать» appends the position', posRows === 1, `rows=${posRows}`);

  // rich inline typeahead: prefix search + ↓/Enter adds a row
  const inline = page.locator('[data-test-id="io-position-add-input"]');
  await inline.click();
  await inline.pressSequentially('Air', { delay: 40 });
  await page.waitForTimeout(1500);
  const suggestions = page.locator('[data-test-id="position-inline-add-suggestions"]');
  ok('band3: inline typeahead dropdown opens', await suggestions.isVisible().catch(() => false));
  await page.screenshot({ path: SHOT('8-inline-typeahead') });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  posRows = await page.locator('[data-test-id^="pos-"][data-test-id$="-name"]').count();
  ok('band3: typeahead pick appends 2nd position', posRows === 2, `rows=${posRows}`);

  // «Проверить комплектацию» → «Сохранение изменений» confirm → check window
  await page.click('[data-test-id="io-position-add-completeness"]');
  const confirmDlg = page.locator('[data-testid="confirm-dialog"]');
  await confirmDlg.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const dlgText = ((await confirmDlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  ok(
    'band3: «Проверить комплектацию» → «Сохранение изменений» confirm',
    dlgText.includes('Сохранение изменений') && dlgText.includes('Данные были изменены'),
    dlgText.slice(0, 90),
  );
  await page.screenshot({ path: SHOT('9-sohranenie-izmeneniy') });
  await page.click('[data-testid="confirm-confirm"]'); // OK → saves → check window
  const checkModal = page.locator('[data-testid="completeness-check-modal"]');
  await checkModal.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  ok('band3: check window opens after save', await checkModal.isVisible().catch(() => false));
  // both lines read «Не хватает» until counted; count line 1 to its plan (2) → «Сошлось»
  const statuses = page.locator('[data-test-id^="completeness-status-"]');
  const stTexts = (await statuses.allInnerTexts()).map((t) => t.trim());
  ok(
    'band3: fresh check reads «Не хватает»',
    stTexts.length === 2 && stTexts.every((s) => s === 'Не хватает'),
    JSON.stringify(stTexts),
  );
  const firstFact = page.locator('[data-test-id^="completeness-fact-"]').first();
  await firstFact.fill('2');
  await page.waitForTimeout(400);
  const st0 = (await statuses.first().innerText()).trim();
  ok('band3: fact=plan → «Сошлось»', st0 === 'Сошлось', st0);
  await firstFact.fill('5');
  await page.waitForTimeout(400);
  const st1 = (await statuses.first().innerText()).trim();
  ok('band3: fact>plan → «Лишнее»', st1 === 'Лишнее', st1);
  await page.screenshot({ path: SHOT('10-komplekt-check-window') });
  await page.click('[data-test-id="completeness-accept"]'); // Принять и завершить проверку
  await page.waitForURL((u) => /\/internal-orders\/[0-9a-f-]{36}/.test(String(u)), {
    timeout: 20000,
  });
  ok('band3: «Принять и завершить» lands on saved detail', true, page.url());
  const savedId = page.url().match(/internal-orders\/([0-9a-f-]{36})/)?.[1];

  // ── BAND 2 (functional): Печать→Внутренний заказ opens print tab ───────
  await page.goto(`${BASE}/internal-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="internal-order-new-page"]');
  await page.waitForTimeout(2000);
  const inline2 = page.locator('[data-test-id="io-position-add-input"]');
  await inline2.click();
  await inline2.pressSequentially('Air', { delay: 40 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const newTabPromise = ctx.waitForEvent('page', { timeout: 30000 });
  await page.click('[data-test-id="doc-toolbar-print"]');
  await page.waitForTimeout(500);
  await page.locator('[role="menuitem"]', { hasText: 'Внутренний заказ' }).first().click();
  const printTab = await newTabPromise.catch(() => null);
  if (printTab) {
    await printTab.waitForLoadState('domcontentloaded').catch(() => {});
    await printTab.waitForTimeout(2500);
    ok(
      'band2: Печать→Внутренний заказ opens NEW TAB /print/internal-order/[id]',
      /\/print\/internal-order\/[0-9a-f-]{36}/.test(printTab.url()),
      printTab.url(),
    );
    await printTab.screenshot({ path: SHOT('11-print-forma') });
    await printTab.close();
  } else {
    ok('band2: Печать→Внутренний заказ opens NEW TAB', false, 'no new tab');
  }
  await page.waitForURL((u) => /\/internal-orders\/[0-9a-f-]{36}/.test(String(u)), {
    timeout: 20000,
  });
  ok('band2: editor lands on saved detail after print', true, page.url());

  // ── BAND 2 (functional): Создать документ→Заказ поставщику prefill ─────
  await page.goto(`${BASE}/internal-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="internal-order-new-page"]');
  await page.waitForTimeout(2000);
  const inline3 = page.locator('[data-test-id="io-position-add-input"]');
  await inline3.click();
  await inline3.pressSequentially('Air', { delay: 40 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.click('[data-test-id="doc-toolbar-create-doc"]');
  await page.waitForTimeout(500);
  await page.locator('[role="menuitem"]', { hasText: 'Заказ поставщику' }).first().click();
  await page.waitForURL((u) => String(u).includes('/purchase-orders/new?fromInternalOrder='), {
    timeout: 20000,
  });
  ok('band2: Создать документ→Заказ поставщику saves → PO /new pre-linked', true, page.url());
  await page.waitForTimeout(3000); // prefill query + apply
  const poPosRows = await page.locator('[data-test-id^="pos-"][data-test-id$="-name"]').count();
  ok('band2: PO /new pre-filled with the order position', poPosRows >= 1, `rows=${poPosRows}`);
  await page.screenshot({ path: SHOT('12-po-prefill') });

  // ── BE smoke: new list filters + supply-shortfall ───────────────────────
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  const apiGet = async (path) => {
    const r = await page.request.get(`${BASE}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.status();
  };
  ok('BE: ?shared=false filter 200', (await apiGet('/internal-orders?shared=false')) === 200);
  ok(
    'BE: ?productIds= filter 200',
    (await apiGet('/internal-orders?productIds=00000000-0000-0000-0000-000000000001')) === 200,
  );
  ok(
    'BE: ?modifiedByIds= filter 200',
    (await apiGet('/internal-orders?modifiedByIds=00000000-0000-0000-0000-000000000001')) === 200,
  );
  if (savedId) {
    ok(
      'BE: /supply-shortfall 200',
      (await apiGet(`/internal-orders/${savedId}/supply-shortfall`)) === 200,
    );
  }
} catch (e) {
  ok('script error', false, String(e).slice(0, 300));
}

console.log('\n===== SUMMARY =====');
for (const r of results) console.log(r);
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} PASS`);
await browser.close();
process.exit(fails ? 1 : 0);
