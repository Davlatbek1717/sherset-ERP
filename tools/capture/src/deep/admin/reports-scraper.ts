import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchAuthenticated } from '../../auth/session.ts';
import { OUTPUT, TIMING, URLS } from '../../config.ts';
import { child } from '../../utils/logger.ts';
import { ensureParent } from '../../utils/paths.ts';
import { sleep } from '../../utils/wait.ts';

const log = child('reports-scraper');

/**
 * Scrape reports detail for each of ~30 report types.
 *
 * For each report, capture:
 *  - Filter panel fields (dimensions, measures available)
 *  - Default rendering (what columns, what aggregations)
 *  - Drill-down capabilities (clickable cells)
 *  - Export options
 *  - Chart types available
 *
 * Output: docs/moysklad-reference/reports/<report-id>/
 *   - default.html  (full DOM)
 *   - screenshot-default.png
 *   - filter-panel.html (filter drawer)
 *   - meta.json  (config inferred)
 *   - variations/ (different filters/periods)
 */

const REPORTS = [
  // Sales
  { id: 'profit', hash: 'report/profit', title: 'Прибыль' },
  { id: 'sales', hash: 'report/sales', title: 'Продажи' },
  { id: 'orders', hash: 'report/orders', title: 'Заказы' },
  { id: 'sales-funnel', hash: 'report/salesfunnel', title: 'Воронка продаж' },
  { id: 'employee-effectiveness', hash: 'report/employees', title: 'Эффективность сотрудников' },

  // Stock
  { id: 'stock-balance', hash: 'report/stock', title: 'Остатки' },
  { id: 'stock-movements', hash: 'report/stockmovement', title: 'Движение товаров' },
  { id: 'stock-turnover', hash: 'report/turnover', title: 'Оборачиваемость' },
  { id: 'reserves', hash: 'report/reserves', title: 'Резервы' },

  // Money
  { id: 'money', hash: 'report/money', title: 'Деньги' },
  { id: 'counterparty-balance', hash: 'report/counterpartybalance', title: 'Взаиморасчёты' },
  { id: 'profit-loss', hash: 'report/profitloss', title: 'Доходы и расходы' },
  { id: 'payments-schedule', hash: 'report/payments', title: 'Платежи' },

  // CRM
  { id: 'customers', hash: 'report/customers', title: 'Клиенты' },
  { id: 'tasks', hash: 'report/tasks', title: 'Задачи' },

  // Special
  { id: 'abc', hash: 'report/abc', title: 'ABC-анализ' },
  { id: 'xyz', hash: 'report/xyz', title: 'XYZ-анализ' },
];

export async function runReportsScraper(): Promise<void> {
  log.info('Starting reports scraping');

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  const outBase = path.join(OUTPUT.root, 'reports');

  try {
    for (const report of REPORTS) {
      log.info({ report: report.id }, 'scraping');
      try {
        const outDir = path.join(outBase, report.id);
        await ensureParent(path.join(outDir, 'default.html'));

        // 1. Load report at default settings
        const url = `${URLS.app}#${report.hash}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(4000); // reports take longer to render

        // Capture DOM + screenshot
        const html = await page.content();
        await writeFile(path.join(outDir, 'default.html'), html, 'utf8');
        await page.screenshot({
          path: path.join(outDir, 'screenshot-default.png'),
          fullPage: true,
        });

        // 2. Extract meta info
        const meta = await page.evaluate((reportInfo) => {
          const filters: string[] = [];
          document.querySelectorAll('[data-test-id^="filter-"]').forEach((el) => {
            filters.push(el.getAttribute('data-test-id') ?? '');
          });

          const columns: string[] = [];
          document.querySelectorAll('th, [data-test-id="column-header"]').forEach((el) => {
            const text = (el.textContent ?? '').trim();
            if (text && text.length < 50) columns.push(text);
          });

          const charts: string[] = [];
          document
            .querySelectorAll('svg.chart, canvas.chart, [data-test-id^="chart-"]')
            .forEach((el) => {
              charts.push(el.getAttribute('data-test-id') ?? el.tagName);
            });

          const exports: string[] = [];
          document.querySelectorAll('[data-test-id*="export"]').forEach((el) => {
            exports.push((el.textContent ?? '').trim());
          });

          return {
            reportId: reportInfo.id,
            title: reportInfo.title,
            url: location.href,
            filters,
            columns: [...new Set(columns)],
            charts,
            exports,
            pageTitle: document.querySelector('h1, h2')?.textContent?.trim() ?? '',
          };
        }, report);

        await writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

        // 3. Try to open filter panel
        try {
          await page.click('[data-test-id="filter-toggle"], button:has-text("Фильтр")', {
            timeout: 5000,
          });
          await sleep(1500);
          const filterHtml = await page.content();
          await writeFile(path.join(outDir, 'filter-panel.html'), filterHtml, 'utf8');
          await page.screenshot({
            path: path.join(outDir, 'screenshot-filters.png'),
          });
        } catch {
          log.info({ report: report.id }, 'no filter panel accessible');
        }

        // 4. Capture variations (different periods if period selector exists)
        const variations = ['week', 'month', 'quarter', 'year'];
        for (const period of variations) {
          try {
            await page.click(
              `[data-period="${period}"], button:has-text("За ${period === 'week' ? 'неделю' : period === 'month' ? 'месяц' : period === 'quarter' ? 'квартал' : 'год'}")`,
              { timeout: 3000 },
            );
            await sleep(3000);
            await page.screenshot({
              path: path.join(outDir, `variations/screenshot-${period}.png`),
            });
          } catch {
            // variation not available
          }
        }

        log.info({ report: report.id }, 'captured');
      } catch (err) {
        log.error({ report: report.id, err: (err as Error).message }, 'report failed');
      }
    }

    log.info({ outBase }, 'reports scraping complete');
  } finally {
    try {
      await auth.context.close();
    } catch {
      /* ignore */
    }
    try {
      await auth.browser.close();
    } catch {
      /* ignore */
    }
  }
}
