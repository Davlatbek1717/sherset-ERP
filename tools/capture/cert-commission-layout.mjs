// CERT (RU): the 4 layout fixes on /commission-reports/new vs moysklad —
//   #1 form WIDTH: meta panel is COMPACT (~745px, not full-viewport); comment ~515px.
//   #2 «#» column GONE from the grid header.
//   #3 «Задачи»/«Файлы» EXPANDED — «Нет задач» + the files table («Размер, МБ» header).
//   #4 «❓» help icon present next to «Проведено».
// Full-page screenshot for the side-by-side. 0 console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3282';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-layout-2026-06-29/cert');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 140));
});
const out = {};
try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4500);
  await p.goto(`http://localhost:${PORT}/commission-reports/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: resolve(OUT, '00-full.png'), fullPage: true });

  out.measure = await p.evaluate(() => {
    const w = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    };
    return {
      metaPanel: w('[data-test-id="doc-meta-panel"]'),
      comment: w('[data-test-id="field-description"]'),
      gridHeaders: [...document.querySelectorAll('thead th')].map((e) =>
        (e.textContent || '').replace(/\s+/g, ' ').trim(),
      ),
    };
  });
  // #1 width: meta panel compact (< ~820px), comment ~515px (not full-width).
  out.fix1_compact = {
    metaWidth: out.measure.metaPanel?.width,
    metaIsCompact: (out.measure.metaPanel?.width ?? 9999) < 820,
    commentWidth: out.measure.comment?.width,
    commentIsCompact: (out.measure.comment?.width ?? 9999) < 600,
  };
  // #2 «#» gone.
  out.fix2_noHash = !out.measure.gridHeaders.includes('#');
  // #4 «❓» help icon near «Проведено» (HelpIcon renders an icon when applicableHelp set).
  out.fix4_help = await p.evaluate(() => {
    const prov = [...document.querySelectorAll('*')].find(
      (e) => !e.children.length && /Проведено/.test(e.textContent || ''),
    );
    if (!prov) return { provedeno: false };
    const span = prov.closest('span');
    // the HelpIcon sits in the same «❓ ☑ Проведено» span, BEFORE the checkbox.
    const hasIcon =
      !!span &&
      (/[?？]/.test(span.textContent || '') ||
        span.querySelector('svg, [aria-label], [title], button') != null);
    return { provedeno: true, hasHelpIcon: hasIcon };
  });
  // #3 Задачи/Файлы expanded.
  const body = await p.evaluate(() => document.body.innerText);
  out.fix3_sections = {
    netZadach: /Нет задач/.test(body),
    filesTable: /Размер, МБ/.test(body),
    dobavleniya: /Дата добавления/.test(body),
  };
} catch (e) {
  out.error = String(e).slice(0, 250);
}
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
