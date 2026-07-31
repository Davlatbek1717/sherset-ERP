// CERT #35/#51 — «Организация» sub-row (org account) must render a NON-EMPTY
// caption once an organization is chosen. Default accounts carry
// accountNumber=null, which used to label the sub-row with '' and made the
// combobox look empty (the parity-audit finding).
//
// READ-ONLY on the app: fills the /new form's organization picker, never saves.
// Usage: node scripts/cert-co-org-account-2026-07-31.mjs
import { chromium } from 'playwright';

const WEB = process.env.WEB_URL || 'http://localhost:3100';
const EMAIL = process.env.APP_EMAIL || 'admin@demo.local';
const PASSWORD = process.env.APP_PASSWORD || 'admin123';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(45000);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-test-id="login-email"]', EMAIL);
  await page.fill('[data-test-id="login-password"]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  await page.goto(`${WEB}/customer-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="doc-meta-panel"]', { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Read the two inputs of the «Организация» field group: the org itself and the
  // account sub-row directly beneath it.
  const read = () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-test-id="doc-meta-panel"]');
      if (!panel) return null;
      const inputs = [...panel.querySelectorAll('input')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return inputs.slice(0, 3).map((el) => ({
        value: el.value,
        placeholder: el.getAttribute('placeholder') || '',
      }));
    });

  let state = await read();
  console.log('initial visible inputs:', JSON.stringify(state));

  // The org may already be preselected. If not, pick the first suggestion.
  const orgInput = page.locator('[data-test-id="doc-meta-panel"] input').first();
  if (!(await orgInput.inputValue().catch(() => ''))) {
    await orgInput.click();
    await page.waitForTimeout(1500);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
  }
  // Give the default-account effect time to resolve.
  await page.waitForTimeout(3000);
  state = await read();
  console.log('after org pick:', JSON.stringify(state));

  const org = state?.[0];
  const account = state?.[1];
  check('organization is selected', !!org?.value, `value="${org?.value ?? ''}"`);
  check(
    'org account sub-row caption is NOT empty',
    !!account?.value,
    `value="${account?.value ?? ''}" placeholder="${account?.placeholder ?? ''}"`,
  );

  await page.screenshot({ path: 'cert-co-org-account.png', fullPage: false });
} catch (e) {
  console.log('FATAL', e.message);
  failures++;
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
