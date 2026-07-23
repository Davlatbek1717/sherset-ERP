// Live verify — /moves/new «Печать → Перемещение» flagship arc:
// fill required fields → add a position → Печать→Перемещение → doc SAVES,
// print form opens in a NEW TAB (/print/move/[id]), editor lands on detail.
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
  await page.goto(`${BASE}/moves/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.click('[data-test-id="login-submit"]');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}/moves/new`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('[data-test-id="move-new-page"]', { timeout: 30000 });
  await page.waitForTimeout(1500); // let user-defaults auto-fill org

  // Со склада / На склад — inline-type into the two store combobox fields.
  // CatalogPickerField renders an input; type & pick from inline dropdown.
  const storeInputs = page.locator('[data-test-id="move-new-page"] input');
  // find by placeholder-less approach: use the meta labels
  const srcField = page
    .locator('div', { hasText: /^Со склада/ })
    .locator('input')
    .first();
  // Fallback robust approach: all CatalogPickerField inputs in meta panel order:
  // org(0) · source(1) · dest(2) · project(3)
  const metaInputs = page.locator('[data-test-id="move-new-page"] .grid input, [data-test-id="move-new-page"] input');
  const n = await metaInputs.count();
  console.log('meta inputs count:', n);

  // Type into source-store field
  // probe (2026-07-14): inputs 5 = Со склада, 6 = На склад (org auto-filled at 4).
  const src = metaInputs.nth(5);
  await src.click();
  await src.pressSequentially('Asosiy', { delay: 40 });
  await page.waitForTimeout(1200);
  await page.getByText('Asosiy ombor', { exact: false }).first().click();
  await page.waitForTimeout(400);

  const dst = metaInputs.nth(6);
  await dst.click();
  await dst.pressSequentially('Ombor B', { delay: 40 });
  await page.waitForTimeout(1200);
  await page.getByText('Ombor B (test)', { exact: false }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('20-stores-filled') });

  // Add a position via inline typeahead
  const inline = page.locator('[data-test-id="move-position-add-input"]');
  await inline.click();
  await inline.pressSequentially('Air', { delay: 40 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const rowAdded = (await page.locator('[data-test-id^="pos-"]').count()) > 0;
  ok('position added via inline typeahead ↓/Enter', rowAdded);
  await page.screenshot({ path: SHOT('21-position-added') });

  // «Печать → Перемещение» — save + open print form in NEW TAB
  const newTabPromise = ctx.waitForEvent('page', { timeout: 30000 });
  await page.getByRole('button', { name: 'Печать' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('22-print-menu-open') });
  await page.getByText('Перемещение', { exact: true }).first().click();

  const printTab = await newTabPromise;
  await printTab.waitForLoadState('domcontentloaded');
  await printTab.waitForTimeout(2500);
  const printUrl = printTab.url();
  ok('print form opened in NEW TAB', /\/print\/move\//.test(printUrl), printUrl);
  const printText = await printTab.locator('body').innerText();
  // NOTE: party labels render text-transform:uppercase — match case-insensitively.
  ok(
    'print form content (Перемещение № · Со склада · На склад · positions)',
    /Перемещение\s*№/.test(printText) &&
      /со склада/i.test(printText) &&
      /на склад/i.test(printText) &&
      printText.includes('AirPods'),
  );
  await printTab.screenshot({ path: SHOT('23-print-form'), fullPage: true });

  // editor tab landed on the saved move's detail page
  await page.waitForURL((u) => /\/moves\/[0-9a-f-]{20,}/.test(String(u)), { timeout: 20000 });
  ok('editor landed on saved move detail', true, page.url());
  await page.screenshot({ path: SHOT('24-detail-after-save') });

  console.log('\n===== SUMMARY =====');
  for (const r of results) console.log(r);
  console.log(`TOTAL: ${results.length}, FAIL: ${results.filter((r) => r.startsWith('FAIL')).length}`);
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  await page.screenshot({ path: SHOT('98-error') }).catch(() => {});
  console.log('\n===== PARTIAL SUMMARY =====');
  for (const r of results) console.log(r);
} finally {
  await ctx.close();
}
