// Mobile-responsive FOUNDATION cert (2026-07-17) — burger nav sheet, touch
// targets, overlay fit, no page-level horizontal overflow.
//   widths: 360 / 390 / 430 (phones, max-md active) + 768 (md boundary=desktop)
//   pages:  dashboard · PO list · PO new · products · CO new · moves ·
//           reports/pnl · settings/employees
// Checks per page: document scrollWidth ≤ innerWidth+1 (page itself must not
// pan; wide tables scroll INSIDE their own container), burger visible+works on
// phones (desktop tabs hidden), control height ≥36px & text-input font ≥16px
// on phones, bookmark modal fits the viewport, settings rail collapses.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3100';
const SHOT = (n) => `D:/projects/moysklad/tasdiq-mobile-${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

const PAGES = [
  ['home', '/'],
  ['po-list', '/purchase-orders'],
  ['po-new', '/purchase-orders/new'],
  ['products', '/products'],
  ['co-new', '/customer-orders/new'],
  ['moves', '/moves'],
  ['pnl', '/reports/pnl'],
  ['settings-emp', '/settings/employees'],
];
const WIDTHS = [
  [360, 740],
  [390, 844],
  [430, 932],
  [768, 1024],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// Refresh-token rotation kills a shared storageState after ~2 contexts —
// every context logs in itself instead.
async function login(p) {
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // Hydration guard: clicking before React attaches onSubmit fires a NATIVE
  // GET form submit that lands right back on /login. Wait, then retry.
  await p.waitForTimeout(2500);
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.click('button[type="submit"]');
    const left = await p
      .waitForURL((u) => !String(u).includes('/login'), { waitUntil: 'commit', timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (left) return;
    await p.waitForTimeout(2000);
  }
  throw new Error('login never left /login after 3 attempts');
}

for (const [W, H] of WIDTHS) {
  const phone = W < 768;
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    isMobile: phone,
    hasTouch: phone,
    locale: 'ru-RU',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await login(page);

  for (const [slug, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200); // hydration + data
    if (page.url().includes('/login')) {
      ok(`${W} ${slug}: auth kept`, false, 'bounced to /login');
      continue;
    }
    // Compare against the DEVICE width constant, NOT window.innerWidth: with
    // isMobile emulation an overflowing layout inflates the layout viewport
    // (zoom-out), so innerWidth grows WITH the overflow and masks it — the
    // first cert run passed 502=502 while the phone visibly panned.
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth }));
    ok(`${W} ${slug}: no page h-overflow`, m.sw <= W + 1, `scrollWidth=${m.sw} device=${W}`);

    const burger = page.locator('[data-testid="mobile-nav-trigger"]');
    const burgerVisible = await burger.isVisible().catch(() => false);
    if (phone) ok(`${W} ${slug}: burger visible`, burgerVisible);
    else ok(`${W} ${slug}: burger hidden (desktop nav)`, !burgerVisible);

    // Screenshots: every page at 390; the shell pages at every width.
    if (W === 390 || slug === 'home' || slug === 'po-list') {
      await page.screenshot({ path: SHOT(`${W}-${slug}`) });
    }
  }

  // ── Phone-only interaction band (one width is enough for each) ──────────
  if (W === 390) {
    // Burger sheet: open → accordion → navigate → closes.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.click('[data-testid="mobile-nav-trigger"]');
    const sheet = page.locator('[data-testid="mobile-nav-sheet"]');
    await sheet.waitFor({ state: 'visible', timeout: 8000 });
    ok('390 sheet: opens', await sheet.isVisible());
    const sectionCount = await sheet.locator('[data-testid^="mobile-nav-"][href]').count();
    ok('390 sheet: has module rows', sectionCount >= 10, `rows=${sectionCount}`);
    await page.screenshot({ path: SHOT('390-sheet-open') });
    await page.click('[data-testid="mobile-nav-purchases-toggle"]');
    await page.waitForTimeout(400);
    const supplies = sheet.locator('a[href="/supplies"]');
    ok('390 sheet: purchases accordion shows sub-items', await supplies.isVisible());
    await page.screenshot({ path: SHOT('390-sheet-purchases') });
    await supplies.click();
    await page.waitForURL((u) => String(u).includes('/supplies'), { timeout: 20000 });
    await page.waitForTimeout(1200);
    ok('390 sheet: sub-item navigates (SPA)', page.url().includes('/supplies'));
    ok('390 sheet: closes after navigation', !(await sheet.isVisible().catch(() => false)));

    // Touch metrics on a real form page.
    await page.goto(`${BASE}/purchase-orders/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const metrics = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden])'),
      ).filter((e) => e.offsetParent !== null);
      const inp = els[0];
      if (!inp) return null;
      // Composite fields (CatalogPicker/DatePicker…) put a borderless inner
      // <input> inside the bordered 40px container — the CONTAINER is the tap
      // target, so measure the nearest bordered ancestor.
      let tap = inp;
      let node = inp;
      while (node && node !== document.body) {
        const c = getComputedStyle(node);
        if (Number.parseFloat(c.borderTopWidth) > 0 || c.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          tap = node;
          break;
        }
        node = node.parentElement;
      }
      const cs = getComputedStyle(inp);
      const controlH = getComputedStyle(document.documentElement).getPropertyValue('--ms-control-h');
      const posAdd = document.querySelector('[data-test-id$="position-inline-add-input"], [data-test-id="position-inline-add-input"]');
      const dateBox = document.querySelector('[data-test-id="doc-header-date"]');
      return {
        h: tap.getBoundingClientRect().height,
        who: `${tap.tagName}#${tap.getAttribute('data-test-id') || inp.getAttribute('data-test-id') || String(tap.className).slice(0, 60)}`,
        font: Number.parseFloat(cs.fontSize),
        controlH: controlH.trim(),
        rootFont: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        posAddH: posAdd ? posAdd.getBoundingClientRect().height : null,
        dateBoxH: dateBox ? dateBox.getBoundingClientRect().height : null,
      };
    });
    ok(
      '390 form: field tap-target ≥36px tall',
      metrics && metrics.h >= 36,
      `h=${metrics?.h} who=${metrics?.who}`,
    );
    ok(
      '390 form: doc-header date box ≥36px',
      metrics?.dateBoxH === null || (metrics && metrics.dateBoxH >= 36),
      `h=${metrics?.dateBoxH}`,
    );
    ok('390 form: input font ≥16px (iOS no-zoom)', metrics && metrics.font >= 16, `font=${metrics?.font}`);
    ok(
      '390 form: position-add input ≥36px',
      metrics?.posAddH === null || (metrics && metrics.posAddH >= 36),
      `h=${metrics?.posAddH}`,
    );
    ok('390 form: --ms-control-h=36px', metrics?.controlH === '36px', `=${metrics?.controlH}`);
    ok('390 form: root font 14px', metrics?.rootFont === 14, `=${metrics?.rootFont}`);
    const btn = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(
        (e) => e.offsetParent !== null && /Сохранить/.test(e.textContent || ''),
      );
      return b ? b.getBoundingClientRect().height : null;
    });
    ok('390 form: «Сохранить» ≥40px tall', btn !== null && btn >= 39.5, `h=${btn}`);
    await page.screenshot({ path: SHOT('390-po-new-form'), fullPage: false });

    // Modal fit: PO list bookmark modal must sit inside the viewport.
    await page.goto(`${BASE}/purchase-orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const bm = page.locator('[data-test-id="inline-filter-bookmark"]');
    if (await bm.isVisible().catch(() => false)) {
      await bm.click();
      const modal = page.locator('[data-testid="saved-filter-save-modal"]');
      const opened = await modal
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      ok('390 modal: opens', opened);
      if (opened) {
        const box = await modal.boundingBox();
        ok(
          '390 modal: fits viewport',
          box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845,
          box ? `x=${box.x} y=${box.y} w=${box.width} h=${box.height}` : 'no box',
        );
        await page.screenshot({ path: SHOT('390-modal') });
        await page.keyboard.press('Escape');
      }
    } else {
      ok('390 modal: bookmark trigger present', false, 'inline-filter-bookmark not visible');
    }

    // Settings rail: collapsed toggle on phones, expands, link works.
    await page.goto(`${BASE}/settings/employees`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const tog = page.locator('[data-testid="settings-sidebar-mobile-toggle"]');
    ok('390 settings: mobile toggle visible', await tog.isVisible().catch(() => false));
    const empLink = page.locator('[data-testid="settings-link-employees"]');
    ok('390 settings: rail collapsed by default', !(await empLink.isVisible().catch(() => false)));
    await tog.click();
    await page.waitForTimeout(400);
    ok('390 settings: rail expands on tap', await empLink.isVisible().catch(() => false));
    await page.screenshot({ path: SHOT('390-settings-rail') });

    // User (Admin) dropdown: 44px rows + divider under each row on mobile.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.click('[data-test-id="user-menu-trigger"]');
    const menu = page.locator('[data-test-id="user-menu"]');
    const menuOpen = await menu
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    ok('390 user-menu: opens', menuOpen);
    if (menuOpen) {
      const im = await page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('[data-test-id="user-menu"] [role="menuitem"]'),
        );
        const first = items[0];
        if (!first) return null;
        const cs = getComputedStyle(first);
        return {
          n: items.length,
          h: first.getBoundingClientRect().height,
          font: Number.parseFloat(cs.fontSize),
          divider: Number.parseFloat(cs.borderBottomWidth) > 0,
        };
      });
      ok('390 user-menu: rows ≥44px', im !== null && im.h >= 43.5, `h=${im?.h}`);
      ok('390 user-menu: text ≥15px', im !== null && im.font >= 15, `font=${im?.font}`);
      ok('390 user-menu: divider under rows', im !== null && im.divider === true, `n=${im?.n}`);
      await page.screenshot({ path: SHOT('390-user-menu') });
      await page.keyboard.press('Escape');
    }
  }

  // Desktop boundary sanity: subnav + module tabs render at 768.
  if (W === 768) {
    await page.goto(`${BASE}/purchase-orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const tabs = await page.locator('header.ms-navbar nav a').count();
    ok('768: desktop module tabs visible', tabs >= 10, `tabs=${tabs}`);
    await page.screenshot({ path: SHOT('768-po-list') });
  }

  await ctx.close();
}

await browser.close();
const fails = results.filter((r) => !r.pass);
console.log(`\n===== ${results.length - fails.length}/${results.length} PASS =====`);
if (fails.length) {
  console.log('FAILED:');
  for (const f of fails) console.log(` - ${f.name} ${f.extra}`);
  process.exit(1);
}
