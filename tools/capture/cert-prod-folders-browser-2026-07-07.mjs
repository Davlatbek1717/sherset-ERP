import { chromium } from 'playwright';
const OUT = process.env.OUTDIR;
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'climartgroup.uz', path: '/' }]);
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
const out = {};
try {
  await p.goto('https://climartgroup.uz/login', { waitUntil: 'domcontentloaded' });
  await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await p.fill('[data-test-id="login-password"]', 'admin123');
  await p.locator('[data-test-id="login-password"]').press('Enter');
  await p.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {});
  await p.goto('https://climartgroup.uz/products', { waitUntil: 'domcontentloaded' });
  await p.locator('[data-test-id="product-folder-tree"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  // BEFORE: all products
  out.allRows = await p.locator('table tbody tr').count();
  await p.screenshot({ path: `${OUT}/01-all-products.png` });
  // Click «Ватерпро» folder
  const vp = 'button[data-test-id="folder-select-69ee3d1a-bf58-4509-8948-aad69ea78ecf"]';
  await p.locator(vp).click();
  await p.waitForTimeout(2500);
  out.vaterproRows = await p.locator('table tbody tr').count();
  out.subtitle = await p
    .locator('text=/Записей|записей|товаров|Товары и услуги/')
    .first()
    .innerText()
    .catch(() => '');
  await p.screenshot({ path: `${OUT}/02-vaterpro-selected.png` });
  // Click «Акфа» to show another brand
  const akfa = 'button[data-test-id^="folder-select-"]:has-text("Акфа")';
  await p
    .locator('button[data-test-id^="folder-select-"]', { hasText: 'Акфа' })
    .first()
    .click()
    .catch(() => {});
  await p.waitForTimeout(2000);
  out.akfaRows = await p.locator('table tbody tr').count();
  await p.screenshot({ path: `${OUT}/03-akfa-selected.png` });
} catch (e) {
  out.error = String(e).slice(0, 300);
  await p.screenshot({ path: `${OUT}/99-error.png` }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
