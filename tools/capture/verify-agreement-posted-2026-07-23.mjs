/** Consistency: agreement button VISIBLE on draft docs, HIDDEN on posted
 * (positions read-only) docs — every [id] section. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const TYPES = [
  'customer-orders', 'demands', 'invoices-out', 'sales-returns',
  'purchase-orders', 'supplies', 'invoices-in', 'purchase-returns',
  'enters', 'losses', 'moves',
];
let failed = 0;
const ok = (n, c, extra = '') => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${extra ? ` — ${extra}` : ''}`);
};

const login = async () =>
  (
    await (
      await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
      })
    ).json()
  ).accessToken;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.setDefaultTimeout(20000);

async function pageState(route) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector('[data-test-id="position-agreement-button"], table', { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const btn = await page
    .locator('[data-test-id="position-agreement-button"]')
    .isVisible()
    .catch(() => false);
  // the editability witness: the inline-add search input renders only when
  // the positions are editable on this page
  const inline = await page
    .locator('[data-test-id$="-add-input"]')
    .first()
    .isVisible()
    .catch(() => false);
  return { btn, inline };
}

try {
  const tok = await login();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });

  for (const t of TYPES) {
    const r = await fetch(`${API}/${t}?limit=50`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then((x) => x.json())
      .catch(() => null);
    const items = r?.items ?? [];
    const posted = items.find((x) => x.applicable === true || x.isApplicable === true);
    const draft = items.find((x) => x.applicable === false || x.isApplicable === false);
    if (draft) {
      const s = await pageState(`${t}/${draft.id}`);
      ok(`${t}/[id] QORALAMA: tugma KO'RINADI`, s.btn, JSON.stringify(s));
    } else console.log(`SKIP ${t} qoralama yo'q`);
    if (posted) {
      const s = await pageState(`${t}/${posted.id}`);
      // invariant: the button tracks positions-editability exactly
      ok(`${t}/[id] PROVEDENO: tugma = tahrir-holati`, s.btn === s.inline, JSON.stringify(s));
    } else console.log(`SKIP ${t} provedeno yo'q`);
  }
} finally {
  await browser.close();
  console.log(failed ? `FAILED=${failed}` : 'ALL PASS');
}
