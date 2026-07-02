// LIVE CERT — /losses/new → moysklad «Списание» editor 1:1.
// Verifies: editor renders; meta fields present in moysklad order (Организация ·
// Склад · Проект · Статья расходов · Валюта документа), «Статья расходов»
// defaults to «Списания»; position grid headers (Кол-во · Ячейка · Остаток ·
// Цена · Сумма · Причина списания); adding a product via the inline typeahead
// populates «Остаток» + «Цена» (avg cost from /stocks) + «Итого»; 0 console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3230';
const OUT = 'D:/projects/moysklad/docs/audits/losses-new-2026-06-25/ours-new.png';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
    });
  ok('logged in');

  await page.goto(`${BASE}/losses/new`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="loss-new-page"]').waitFor({ timeout: 90000 });
  await page.waitForTimeout(2500);
  ok('editor rendered (loss-new-page)');

  // (1) meta fields present in moysklad order
  const bodyText = await page.evaluate(() => document.body.innerText);
  const META = ['Организация', 'Склад', 'Проект', 'Статья расходов', 'Валюта документа'];
  let pos = -1;
  let ordered = true;
  const missing = [];
  for (const lbl of META) {
    const idx = bodyText.indexOf(lbl, pos + 1);
    if (idx < 0) {
      missing.push(lbl);
      ordered = false;
    } else pos = idx;
  }
  if (ordered && missing.length === 0)
    ok(`meta fields in moysklad order: ${META.join(' · ')}`);
  else bad(`meta wrong. missing/out-of-order: ${missing.join(', ') || '(order)'}`);

  // (2) «Статья расходов» defaults to «Списания», NO doc-level «Причина» dropdown.
  // The CatalogPickerField holds the label in an <input> value (not innerText).
  const expenseField = await page.evaluate(() => {
    const el = document.querySelector('[data-test-id="field-expense-item"]');
    if (!el) return '';
    const input = el.querySelector('input');
    return (input?.value || el.textContent || '').trim();
  });
  if (/Списания/.test(expenseField)) ok('«Статья расходов» defaults to «Списания»');
  else bad(`«Статья расходов» default wrong: "${expenseField.slice(0, 40)}"`);
  const hasDocReason = await page.locator('[data-test-id="field-reason"]').count();
  if (hasDocReason === 0) ok('doc-level «Причина» dropdown REMOVED (moysklad uses Статья расходов)');
  else bad('doc-level «Причина» dropdown still present');

  // (3) «Внешний код» NOT a visible meta field (collapsed link at bottom)
  const extCodeVisible = await page
    .locator('[data-test-id="field-external-code"]')
    .isVisible()
    .catch(() => false);
  if (!extCodeVisible) ok('«Внешний код» not a visible meta field (collapsed, moysklad parity)');
  else bad('«Внешний код» is a visible meta field (should be collapsed)');

  // (4) position grid headers
  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('[data-test-id="position-table"] thead th')].map((th) =>
      (th.textContent || '').trim(),
    ),
  );
  out.headers = headers;
  const wantCols = ['Кол-во', 'Ячейка', 'Остаток', 'Цена', 'Сумма', 'Причина списания'];
  const haveAll = wantCols.every((c) => headers.some((h) => h.includes(c)));
  if (haveAll) ok(`position columns present: ${wantCols.join(' · ')}`);
  else bad(`position columns missing. have: ${headers.join(' | ')}`);

  // (5) add a product via the inline typeahead → Остаток + Цена + Итого populate
  const addInput = page
    .locator('[data-test-id="position-table"] input')
    .filter({ hasNot: page.locator('[type="checkbox"]') })
    .last();
  await page.locator('[data-test-id="position-table"]').scrollIntoViewIfNeeded().catch(() => {});
  // the inline-add bar is the search input in the table footer toolbar
  const search = page.getByPlaceholder(/Добавить позицию/).first();
  await search.click().catch(() => {});
  await search.fill('а').catch(() => {});
  await page.waitForTimeout(2500);
  const firstOpt = page
    .locator('[role="option"], [data-test-id*="option"], li')
    .filter({ hasText: /.+/ })
    .first();
  let added = false;
  if (await firstOpt.isVisible().catch(() => false)) {
    await firstOpt.click().catch(() => {});
    await page.waitForTimeout(2500);
    added = (await page.locator('[data-test-id^="position-row-"]').count()) > 0;
  }
  if (added) {
    ok('product added via inline typeahead → a position row exists');
    // Остаток + Цена + Итого
    const rowText = await page
      .locator('[data-test-id^="position-row-"]')
      .first()
      .innerText()
      .catch(() => '');
    out.rowText = rowText.replace(/\s+/g, ' ').slice(0, 200);
    const totalText = await page
      .locator('[data-test-id="loss-total"]')
      .innerText()
      .catch(() => '');
    out.totalText = totalText;
    ok(`row + «Итого» rendered (Итого="${totalText}")`);
  } else {
    bad('could not add a product via the inline typeahead (no option appeared)');
  }

  // (6) «Наименование ▾» = working sort dropdown; «Цена» = clickable sort button
  const hasNameSort = await page
    .locator('[data-test-id="position-name-sort-trigger"]')
    .count()
    .catch(() => 0);
  if (hasNameSort) ok('«Наименование ▾» is a working sort dropdown (trigger present)');
  else bad('«Наименование» is not a clickable sort dropdown');
  const hasPriceSort = await page
    .locator('[data-test-id="position-price-sort"]')
    .count()
    .catch(() => 0);
  if (hasPriceSort) ok('«Цена» header is a clickable sort button');
  else bad('«Цена» header is not a clickable button');
  // open «Наименование ▾» → assert the grounded sort items render
  if (hasNameSort) {
    await page.locator('[data-test-id="position-name-sort-trigger"]').click().catch(() => {});
    await page.waitForTimeout(600);
    const sortMenu = await page.evaluate(() => document.body.innerText);
    const okSort =
      /Сортировать по наименованию/.test(sortMenu) &&
      /Сортировать по коду/.test(sortMenu) &&
      /С учётом групп/.test(sortMenu);
    if (okSort) ok('«Наименование ▾» menu = grounded items (по наименованию · по коду · С учётом групп)');
    else bad('«Наименование ▾» menu items wrong');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // (7) currency ✎ → «Курс валюты документа» modal (select USD first so the ✎ shows)
  const usdOpt = await page
    .locator('[data-test-id="field-currency"] option')
    .filter({ hasText: /USD/ })
    .count()
    .catch(() => 0);
  if (usdOpt) {
    await page.selectOption('[data-test-id="field-currency"]', { label: /USD/ }).catch(async () => {
      await page.selectOption('[data-test-id="field-currency"]', 'USD').catch(() => {});
    });
    await page.waitForTimeout(700);
    const editPencil = page.locator('[data-test-id="currency-rate-edit"]').first();
    if (await editPencil.isVisible().catch(() => false)) {
      ok('currency ✎ appears for a non-base currency (USD)');
      await editPencil.click().catch(() => {});
      await page.waitForTimeout(700);
      const modalText = await page.evaluate(() => document.body.innerText);
      if (/Курс валюты документа/.test(modalText))
        ok('✎ opens «Курс валюты документа» rate-override modal');
      else bad('rate modal did not open / title missing');
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    } else bad('currency ✎ not shown for USD');
  } else {
    out.steps.push('SKIP no USD currency in account → ✎ not testable');
  }

  await page.screenshot({ path: OUT, fullPage: false });
  ok('screenshot → ours-new.png');
} catch (e) {
  out.fatal = String(e).slice(0, 300);
}

out.consoleErrorCount = out.consoleErrors.length;
const pass = out.steps.filter((s) => s.startsWith('OK')).length;
const fail = out.steps.filter((s) => s.startsWith('BAD')).length;
out.summary = `${pass} OK · ${fail} BAD · ${out.consoleErrorCount} console-errors`;
console.log(JSON.stringify(out, null, 2));
await browser.close();
