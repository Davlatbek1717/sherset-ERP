import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchAuthenticated } from '../../auth/session.ts';
import { OUTPUT, TIMING, URLS } from '../../config.ts';
import { child } from '../../utils/logger.ts';
import { ensureParent } from '../../utils/paths.ts';
import { sleep } from '../../utils/wait.ts';

const log = child('print-template-scraper');

/**
 * Scrape print template editor HTML for each document type.
 *
 * For each of 36 document types, navigate to the template editor page
 * and capture:
 *  - Default template HTML body
 *  - Template CSS
 *  - Variable list (which fields can be inserted)
 *  - Available templates list (there can be multiple per entity)
 *
 * Output: docs/moysklad-reference/print-templates/<slug>/
 *   - default.html
 *   - default.css
 *   - variables.json
 *   - templates-list.json
 */

const DOCUMENT_TYPES = [
  'customerorder',
  'purchaseorder',
  'internal',
  'productionorder',
  'demand',
  'supply',
  'move',
  'enter',
  'loss',
  'inventory',
  'invoiceout',
  'invoicein',
  'factureout',
  'facturein',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'prepayment',
  'prepaymentreturn',
  'salesreturn',
  'purchasereturn',
  'commissionreportin',
  'commissionreportout',
  'processing',
  'productiontask',
  'processingstagecompletion',
  'processingorder',
  'retailshift',
  'retaildemand',
  'retailsalesreturn',
  'retaildrawercashin',
  'retaildrawercashout',
  'markingcodeorder',
  'retireorder',
  'pricelist',
];

export async function runPrintTemplateScraper(): Promise<void> {
  log.info('Starting print template scraping');

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  const outBase = path.join(OUTPUT.root, 'print-templates');

  try {
    for (const docType of DOCUMENT_TYPES) {
      log.info({ docType }, 'scraping');
      try {
        // Navigate to template list (settings → templates → <docType>)
        const listUrl = `${URLS.app}#templates/${docType}`;
        await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3000);

        // Capture template list
        const templates = await page.evaluate(() => {
          const out: { id: string; name: string; isDefault: boolean }[] = [];
          const rows = document.querySelectorAll('[data-test-id="template-row"], tr.template-row');
          rows.forEach((row) => {
            out.push({
              id: row.getAttribute('data-id') ?? '',
              name: (row.querySelector('.template-name')?.textContent ?? '').trim(),
              isDefault: !!row.querySelector('.template-default'),
            });
          });
          return out;
        });

        const outDir = path.join(outBase, docType);
        await ensureParent(path.join(outDir, 'templates-list.json'));
        await writeFile(
          path.join(outDir, 'templates-list.json'),
          JSON.stringify(templates, null, 2),
          'utf8',
        );

        // For each template (or at least default), open editor and grab HTML
        for (const tpl of templates.slice(0, 3)) {
          // limit 3 per doc type (default + 2 custom)
          if (!tpl.id) continue;
          const editUrl = `${URLS.app}#template/edit/${tpl.id}`;
          await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
          await sleep(2500);

          const tplData = await page.evaluate(() => {
            // Find editor textarea/pre with HTML
            const editorEl =
              document.querySelector('[data-test-id="template-html-editor"]') ??
              document.querySelector('textarea.template-html') ??
              document.querySelector('pre.template-body');
            const cssEl =
              document.querySelector('[data-test-id="template-css-editor"]') ??
              document.querySelector('textarea.template-css');

            // Find variable list sidebar
            const vars: { name: string; label: string }[] = [];
            document
              .querySelectorAll('[data-test-id="template-variable"], .variable-item')
              .forEach((el) => {
                vars.push({
                  name: el.getAttribute('data-name') ?? '',
                  label: (el.textContent ?? '').trim(),
                });
              });

            return {
              html: (editorEl as HTMLTextAreaElement)?.value ?? editorEl?.textContent ?? '',
              css: (cssEl as HTMLTextAreaElement)?.value ?? '',
              variables: vars,
            };
          });

          const safeName = tpl.name.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50);
          const prefix = tpl.isDefault ? 'default' : `custom-${safeName}`;
          await writeFile(path.join(outDir, `${prefix}.html`), tplData.html, 'utf8');
          if (tplData.css) {
            await writeFile(path.join(outDir, `${prefix}.css`), tplData.css, 'utf8');
          }
          await writeFile(
            path.join(outDir, `${prefix}-variables.json`),
            JSON.stringify(tplData.variables, null, 2),
            'utf8',
          );

          log.info({ docType, template: tpl.name, vars: tplData.variables.length }, 'captured');
          await sleep(1000);
        }
      } catch (err) {
        log.error({ docType, err: (err as Error).message }, 'docType failed');
      }
    }

    log.info({ outBase }, 'scraping complete');
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
