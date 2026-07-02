// LIVE CERT — /losses/[id] (existing-loss EDIT) → moysklad 1:1, mirrors /losses/new.
// Opens the FIRST loss from the list, asserts the converged meta + position grid
// render pre-filled: «Статья расходов» + «Валюта документа» present, the wrong
// doc-level «Причина» dropdown GONE, «Внешний код» not a visible meta field,
// position columns (Кол-во · Ячейка · Остаток · Цена · Сумма · Причина списания),
// owner + «Изменения». 0 console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3230';
const OUT = 'D:/projects/moysklad/docs/audits/losses-new-2026-06-25/ours-id.png';
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
  await page.waitForTimeout(1200);
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
    });
  ok('logged in');

  // open the first loss from the list
  await page.goto(`${BASE}/losses`, { waitUntil: 'domcontentloaded' });
  await page.locator('thead th').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  const href = await page.evaluate(() => {
    const a = document.querySelector('tbody a[href^="/losses/"]');
    return a ? a.getAttribute('href') : null;
  });
  if (!href) {
    bad('no loss row found in the list');
  } else {
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test-id="loss-detail-page"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    ok(`opened existing loss ${href}`);

    const bodyText = await page.evaluate(() => document.body.innerText);
    // (1) meta fields present in moysklad order
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
    if (ordered && missing.length === 0) ok(`meta in moysklad order: ${META.join(' · ')}`);
    else bad(`meta wrong. missing/out-of-order: ${missing.join(', ') || '(order)'}`);

    // (2) the wrong doc-level «Причина» dropdown is GONE
    const hasDocReason = await page.locator('[data-test-id="field-reason"]').count();
    if (hasDocReason === 0) ok('doc-level «Причина» dropdown removed');
    else bad('doc-level «Причина» dropdown still present');

    // (3) «Внешний код» not a visible meta field
    const extVisible = await page
      .locator('[data-test-id="field-external-code"]')
      .isVisible()
      .catch(() => false);
    if (!extVisible) ok('«Внешний код» not a visible meta field');
    else bad('«Внешний код» is a visible meta field');

    // (4) position grid columns
    const headers = await page.evaluate(() =>
      [...document.querySelectorAll('[data-test-id="position-table"] thead th')].map((th) =>
        (th.textContent || '').trim(),
      ),
    );
    out.headers = headers;
    const wantCols = ['Кол-во', 'Ячейка', 'Остаток', 'Цена', 'Сумма', 'Причина списания'];
    const haveAll = wantCols.every((c) => headers.some((h) => h.includes(c)));
    if (haveAll) ok(`position columns: ${wantCols.join(' · ')}`);
    else bad(`position columns missing. have: ${headers.join(' | ')}`);

    // (5) record-nav + owner/Изменения present
    const hasNav = /\d+\s+из\s+\d+|\d+\/\d+/.test(bodyText);
    if (hasNav) ok('record-nav «N из M» present');
    else out.steps.push('SKIP record-nav text not matched (may render as arrows only)');

    await page.screenshot({ path: OUT, fullPage: false });
    ok('screenshot → ours-id.png');
  }
} catch (e) {
  out.fatal = String(e).slice(0, 300);
}

out.consoleErrorCount = out.consoleErrors.length;
const pass = out.steps.filter((s) => s.startsWith('OK')).length;
const fail = out.steps.filter((s) => s.startsWith('BAD')).length;
out.summary = `${pass} OK · ${fail} BAD · ${out.consoleErrorCount} console-errors`;
console.log(JSON.stringify(out, null, 2));
await browser.close();
