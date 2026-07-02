// READ-ONLY grounding of the moysklad «Списания» (loss / write-off) LIST page.
// Logs in, navigates to #loss, waits for the grid, screenshots and extracts:
//   - toolbar button labels (left action group)
//   - grid <th> column headers in order (+ which carry a sort arrow)
//   - footer/totals row text (does moysklad show a Сумма total band?)
//   - inline filter-panel field labels (open «Фильтр»)
//   - «Создать» dropdown menu items (if the create button is a split/menu)
//   - ⚙ column-config menu items (the FULL available column set, incl. hidden)
// NEVER clicks Сохранить/Удалить/Создать-confirm or saves/selects anything. If a
// "Сохранение изменений" modal appears, presses «Отмена». Creds from .env.local.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/losses-list-2026-06-25/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('NO creds');
  process.exit(2);
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

const dismissSaveModal = async () => {
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
};

try {
  // login
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p
    .locator(
      'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])',
    )
    .first();
  await login.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await login.fill(EMAIL).catch(() => {});
  await pass.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);

  // go to the loss list (clean)
  const base = p.url().split('#')[0];
  await p.goto(`${base}#loss`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  await dismissSaveModal();
  await p.waitForTimeout(2000);
  out.url = p.url();
  await shot('list-01-default.png');

  // extract toolbar + grid headers + footer
  out.grid = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const btns = [
      ...document.querySelectorAll('.toolbar button, [class*="toolbar"] button, button'),
    ]
      .map((b) => norm(b.textContent))
      .filter((t) => t && t.length < 40);
    const headerCells = [
      ...document.querySelectorAll(
        'table thead th, .gwt-grid-header td, [class*="headerCell"], [class*="HeaderCell"], th',
      ),
    ];
    const headers = headerCells
      .map((c) => ({
        text: norm(c.textContent || c.getAttribute('title') || ''),
        sort:
          !!c.querySelector('[class*="sort"], [class*="Sort"]') || /sort/i.test(c.className),
        title: c.getAttribute('title') || '',
      }))
      .filter((h) => h.text || h.title);
    const footer = [
      ...document.querySelectorAll(
        'tfoot, [class*="footer"], [class*="Footer"], [class*="total"], [class*="Total"]',
      ),
    ]
      .map((e) => norm(e.textContent))
      .filter((t) => t && t.length < 200)
      .slice(0, 10);
    // first data row cells (helps map columns to data)
    const firstRow = (() => {
      const tr = document.querySelector(
        'tr[class*="dataRow"], tr.cellTableEvenRow, tr.cellTableOddRow, tbody tr',
      );
      if (!tr) return [];
      return [...tr.querySelectorAll('td')].map((td) => norm(td.textContent)).slice(0, 20);
    })();
    return { btns: btns.slice(0, 40), headers, footer, firstRow };
  });

  // open «Фильтр» panel and read field labels
  const filterBtn = p.locator('button:has-text("Фильтр"), :text-is("Фильтр")').first();
  if ((await filterBtn.count()) && (await filterBtn.isVisible().catch(() => false))) {
    await filterBtn.click().catch(() => {});
    await p.waitForTimeout(2800);
    await shot('list-02-filter.png');
    out.filterFields = await p.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      // capture labels in DOM order, deduped, within the popup/filter region
      const labels = [
        ...document.querySelectorAll(
          '.gwt-Label, label, [class*="filterLabel"], [class*="FieldLabel"], [class*="filter"] [class*="label"]',
        ),
      ]
        .map((e) => norm(e.textContent))
        .filter((t) => t && t.length > 1 && t.length < 40);
      return [...new Set(labels)];
    });
    // close the filter so it doesn't overlay the create menu
    await filterBtn.click().catch(() => {});
    await p.waitForTimeout(1200);
  } else out.filterFields = '(Фильтр button not found)';

  // «Создать» — is it a plain button or a split dropdown? capture menu items.
  const createBtn = p
    .locator(
      'button:has-text("Списание"), button:has-text("Создать"), [class*="button"]:has-text("Списание")',
    )
    .first();
  if ((await createBtn.count()) && (await createBtn.isVisible().catch(() => false))) {
    // try clicking the dropdown caret next to it
    const caret = p.locator('[class*="caret"], [class*="arrow"], [class*="dropdown"]').first();
    if ((await caret.count()) && (await caret.isVisible().catch(() => false))) {
      await caret.click().catch(() => {});
      await p.waitForTimeout(1500);
      await shot('list-03-create-menu.png');
      out.createMenu = await p.evaluate(() => {
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
        return [
          ...document.querySelectorAll(
            '[class*="menuItem"], [class*="MenuItem"], [class*="popup"] [class*="item"], [role="menuitem"]',
          ),
        ]
          .map((e) => norm(e.textContent))
          .filter((t) => t && t.length < 60)
          .slice(0, 20);
      });
      // close menu
      await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(800);
    }
  }

  // ⚙ column config — the full available column set (incl. hidden columns).
  const gear = p
    .locator(
      '[class*="settings"], [class*="Settings"], [title*="Настрой"], [class*="gear"], [class*="cog"]',
    )
    .first();
  if ((await gear.count()) && (await gear.isVisible().catch(() => false))) {
    await gear.click().catch(() => {});
    await p.waitForTimeout(1800);
    await shot('list-04-columns.png');
    out.columnConfig = await p.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      // checkbox rows in the column-config popup
      const rows = [
        ...document.querySelectorAll(
          '[class*="popup"] label, [class*="Popup"] label, [class*="menu"] label, [class*="column"] label',
        ),
      ]
        .map((e) => ({
          text: norm(e.textContent),
          checked: !!e.querySelector('input:checked'),
        }))
        .filter((r) => r.text && r.text.length < 50);
      return rows.slice(0, 60);
    });
    await p.keyboard.press('Escape').catch(() => {});
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'list-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 5000));
await b.close();
