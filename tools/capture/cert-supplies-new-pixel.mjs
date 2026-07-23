// CERT — /supplies/new pixel-parity fixes (2026-07-03 audit, 43 confirmed deltas).
// Drives the isolated stack (web :3121 → api :4021). /products list 500s on this
// machine (parallel-session Prisma-client drift: client expects products.cell_id
// the DB lacks) so the products search is ROUTE-MOCKED — that exercises OUR page
// logic (rich dropdown, stock/salePrices mapping, duplicate notice) while the
// real POST /supplies still hits the live BE.
import { chromium } from 'playwright';
const SHOT =
  'C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/e088fdf2-f7bb-4b7e-b180-f0e99c37d81b/scratchpad';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
const consoleErrors = [];
p.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[${p.url().slice(21, 60)}] ${m.text().slice(0, 160)}`);
});
// Mock ONLY the products list (env-broken endpoint); everything else = real BE.
const MOCK_PRODUCTS = {
  items: [
    {
      id: '7c49df60-d9bd-41bf-ac30-bb89b9723906',
      name: 'iPhone 15 Pro Max 256GB',
      code: 'IPH15',
      uom: 'шт',
      buyPrice: '1200000000',
      vat: 12,
      stock: { onHand: '42', available: '40' },
      salePrices: [{ priceTypeId: 'pt-1', value: '1500000000' }],
    },
    {
      id: '00000000-aaaa-bbbb-cccc-000000000002',
      name: 'Samsung S25 Ultra',
      code: 'SAM25',
      uom: 'шт',
      buyPrice: '900000000',
      vat: 12,
      stock: { onHand: '15', available: '12' },
      salePrices: [],
    },
  ],
  total: 2,
};
await p.route(/\/api\/v1\/products\?/, (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PRODUCTS) }),
);
const out = {};
try {
  await p.goto('http://localhost:3121/login', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-test-id="login-password"]');
  for (let attempt = 0; attempt < 4 && /\/login/.test(p.url()); attempt++) {
    await p.waitForTimeout(1500);
    if (!/\/login/.test(p.url())) break;
    const emailField = p.locator('[data-test-id="login-email"]');
    if ((await emailField.count()) === 0) break;
    await emailField.fill('admin@demo.local');
    await p.locator('[data-test-id="login-password"]').fill('admin123');
    const respP = p
      .waitForResponse((r) => /auth\/login/.test(r.url()), { timeout: 8000 })
      .catch(() => null);
    await p.locator('button:has-text("Войти"), button:has-text("Kirish")').first().click().catch(() => {});
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    const resp = await respP;
    out['loginAttempt' + attempt] = resp ? resp.status() : 'no-response';
    await p.waitForTimeout(2500);
  }
  await p.goto('http://localhost:3121/supplies/new', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-test-id="supply-new-page"]', { timeout: 90000 });
  await p.waitForTimeout(2500);

  // 1 — title spelling + Проведено default + status pill data-origin
  out.title = await p.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(
      (x) => x.childElementCount === 0 && /^Прием|^Приём/.test((x.textContent || '').trim()),
    );
    return el ? el.textContent.trim() : null;
  });
  out.applicableChecked = await p.evaluate(() => {
    const cb = document.querySelector(
      '[data-testid="doc-applicable"], [data-test-id="doc-applicable"], input[type="checkbox"][aria-label*="Проведено"], label:has(> input[type="checkbox"])',
    );
    const all = [...document.querySelectorAll('[role="checkbox"], input[type="checkbox"]')];
    return all.map((x) => ({
      state: x.getAttribute('aria-checked') ?? x.checked,
      label: (x.closest('label')?.textContent || x.getAttribute('aria-label') || '').slice(0, 24),
    }));
  });
  out.statusPill = await p.evaluate(() => {
    const el = document.querySelector('[data-test-id="doc-status"], [data-testid="doc-status"]');
    if (!el) {
      const cand = [...document.querySelectorAll('button, div')].find(
        (x) => x.textContent.trim() === 'Статус' && x.childElementCount <= 2,
      );
      return cand ? { text: cand.textContent.trim(), found: 'by-text' } : { found: false };
    }
    return { text: el.textContent.trim(), found: true };
  });

  // 2 — meta labels incl. «Входящий номер»
  out.metaLabels = await p.evaluate(() =>
    [...document.querySelectorAll('[data-test-id="supply-new-page"] label, [data-test-id="supply-new-page"] [class*="label"]')]
      .map((x) => x.textContent.trim())
      .filter((t) => /^(Организация|Склад|Контрагент|Договор|Проект|Входящий|Валюта)/.test(t))
      .slice(0, 12),
  );

  // 3 — grid headers order + ⚙ options
  out.gridHeaders = await p.evaluate(() =>
    [...document.querySelectorAll('table thead th, [role="columnheader"]')]
      .map((x) => x.textContent.trim())
      .filter(Boolean),
  );
  const gear = p.locator('[data-test-id="position-column-customizer"], [aria-label*="Настроить"], [aria-label*="Sozlash"]').first();
  out.gearFound = (await gear.count()) > 0;
  if (out.gearFound) {
    await gear.click();
    await p.waitForTimeout(600);
    out.gearOptions = await p.evaluate(() =>
      [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menuitemcheckbox"], [data-radix-popper-content-wrapper] label')]
        .map((x) => x.textContent.trim())
        .filter(Boolean),
    );
    await p.keyboard.press('Escape');
  }

  // 4 — bottom band: НДС checks, no Кол-во at 0, overhead inline, no Внешний код
  out.bottom = await p.evaluate(() => {
    const txt = document.querySelector('[data-test-id="supply-new-page"]').textContent;
    return {
      hasKolvoZero: /Кол-во:\s*0/.test(txt),
      hasOverheadLabel: txt.includes('Накладные расходы'),
      hasRaspredelit: txt.includes('Распределить'),
      hasVneshniyKod: txt.includes('Внешний код'),
      overheadInsideRightCol: !!document.querySelector('[data-test-id="overhead-panel"]'),
    };
  });
  out.vatChecks = await p.evaluate(() => {
    const boxes = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')];
    return boxes
      .map((x) => ({
        label: (x.closest('label')?.textContent || x.getAttribute('aria-label') || '').slice(0, 30),
        on: x.getAttribute('aria-checked') === 'true' || x.checked === true,
      }))
      .filter((x) => /НДС|включает/.test(x.label));
  });

  // 5 — tabs boxed + disclosures outside tabpanel + open
  out.tabs = await p.evaluate(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    const cs = active ? getComputedStyle(active) : null;
    return {
      activeText: active?.textContent.trim(),
      activeBorder: cs?.borderTopWidth + ' ' + cs?.borderTopColor,
      activeBg: cs?.backgroundColor,
    };
  });
  await p.locator('[data-test-id="doc-tab-related"]').click();
  await p.waitForTimeout(900);
  out.disclosuresOnRelatedTab = await p.evaluate(() => {
    const txt = document.querySelector('[data-test-id="supply-new-page"]').textContent;
    return { tasks: txt.includes('Задачи'), files: txt.includes('Файлы') };
  });
  out.disclosuresOpen = await p.evaluate(() =>
    [...document.querySelectorAll('[aria-expanded]')]
      .filter((x) => /Задачи|Файлы/.test(x.textContent))
      .map((x) => x.getAttribute('aria-expanded')),
  );
  await p.locator('[data-test-id="doc-tab-main"]').click();
  await p.waitForTimeout(600);

  // 6 — rich add dropdown + duplicate notice via TWO identical picks
  const addInput = p.locator('[data-test-id="position-inline-add-input"], input[placeholder*="Добавить позицию"]').first();
  await addInput.fill('iph');
  await p.waitForTimeout(1200);
  out.richDropdown = await p.evaluate(() => {
    const sort = document.querySelector('[data-test-id="position-inline-add-sort-available"]');
    return { sortToggle: !!sort };
  });
  await p.screenshot({ path: SHOT + '/certnew-3-richadd.png' });
  const pickFirst = () =>
    p.evaluate(() => {
      const btn = document.querySelector(
        '[data-test-id="position-inline-add-suggestions"] ul li button',
      );
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return true;
    });
  out.pick1 = await pickFirst();
  await p.waitForTimeout(800);
  // Duplicate the picked row via its kebab menu -> «Дублировать» (same
  // assortmentId twice => the duplicate-positions notice must appear).
  await p.locator('[data-test-id$="-menu"][data-test-id^="pos-"]').first().click();
  await p.waitForTimeout(500);
  await p.locator('[data-test-id$="-duplicate"]').first().click();
  await p.waitForTimeout(900);
  out.duplicateNotice = await p.evaluate(
    () => !!document.querySelector('[data-test-id="duplicate-positions-notice"]'),
  );
  out.rowCount = await p.evaluate(
    () => document.querySelectorAll('[data-test-id^="pos-"][data-test-id$="-name"]').length,
  );
  out.kolvoAfterRows = await p.evaluate(() =>
    /Кол-во:\s*2/.test(document.querySelector('[data-test-id="supply-new-page"]').textContent),
  );
  out.unitInline = await p.evaluate(() =>
    /шт/.test(document.querySelector('table tbody')?.textContent || ''),
  );
  out.stockCell = await p.evaluate(() => {
    const tds = [...document.querySelectorAll('table tbody td')].map((x) => x.textContent.trim());
    return tds.includes('42');
  });
  await p.screenshot({ path: SHOT + '/certnew-1-main.png', fullPage: true });

  // 7 — dirty-close guard
  await p.locator('button:has-text("Закрыть")').first().click();
  await p.waitForTimeout(900);
  out.saveDialog = await p.evaluate(() => {
    const m = document.querySelector('[data-testid="save-changes-dialog"]');
    if (!m) return { visible: false };
    return {
      visible: true,
      title: m.querySelector('h2')?.textContent.trim(),
      body: [...m.querySelectorAll('p')].map((x) => x.textContent.trim()),
      buttons: [...m.querySelectorAll('button')].map((x) => x.textContent.trim()).filter(Boolean),
    };
  });
  await p.screenshot({ path: SHOT + '/certnew-2-savedialog.png' });
  // Отмена → stays on page
  await p.locator('[data-test-id="save-changes-cancel"]').click();
  await p.waitForTimeout(600);
  out.stayedAfterCancel = p.url().includes('/supplies/new');

  out.consoleErrors = consoleErrors.filter(
    (e) => !/products.*(500|Internal)/i.test(e) && !/Failed to load resource.*500/.test(e),
  );
  out.consoleErrorCountRaw = consoleErrors.length;
} catch (e) {
  out.error = String(e).slice(0, 400);
  await p.screenshot({ path: SHOT + '/certnew-error.png' }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
