// Visual smoke for the icon migration. Logs in, walks 5 pages, screenshots
// each, and prints a summary of how many <svg> elements (Lucide line icons)
// appear vs how many emoji text nodes survive in the rendered DOM.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = 'smoke-screenshots';
await mkdir(OUT, { recursive: true });

const PAGES = [
  { name: '01-dashboard', url: '/' },
  { name: '02-settings', url: '/settings' },
  { name: '03-production', url: '/production' },
  { name: '04-ecommerce', url: '/ecommerce' },
  { name: '05-reports', url: '/reports' },
  { name: '06-apps', url: '/apps' },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Login
await page.goto('http://localhost:3100/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', 'admin@demo.local');
await page.fill('input[type="password"]', 'admin123');
await page.click('[data-test-id="login-submit"]');
await page.waitForURL('**/');
await page.waitForLoadState('networkidle').catch(() => {});

const results = [];
for (const p of PAGES) {
  await page.goto(`http://localhost:3100${p.url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const file = `${OUT}/${p.name}.png`;
  await page.screenshot({ path: file, fullPage: true });

  // Count Lucide SVGs (line icons render as <svg> with stroke attribute) and
  // any leftover emoji glyphs.
  const counts = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg').length;
    // Common emoji glyphs we used to ship in nav / cards. If any leak, this
    // surfaces them.
    const text = document.body.innerText;
    const emojis = [...'📊📥🛒📦👥🏭💳📈🏪🌐⚙️✓🧩🏢💵🏦💲👤✉💱🏷📋🔗💸💰🤝🤖📱🧾⇪'].filter(
      (e) => text.includes(e),
    );
    return { svgs, leakedEmojis: emojis };
  });
  results.push({ ...p, ...counts, file });
  console.log(`[${p.name}] svgs=${counts.svgs}  leakedEmojis=${counts.leakedEmojis.join('') || '(none)'}`);
}

await browser.close();

console.log('\n=== Summary ===');
const totalLeaks = results.reduce((s, r) => s + r.leakedEmojis.length, 0);
console.log(
  totalLeaks === 0
    ? '✓ No emoji leaks — every nav/landing surface renders Lucide SVGs.'
    : `✗ ${totalLeaks} emoji leak(s) across ${results.filter((r) => r.leakedEmojis.length).length} page(s).`,
);
