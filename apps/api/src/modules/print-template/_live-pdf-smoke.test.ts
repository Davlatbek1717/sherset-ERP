import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { defaultTemplateBody, wrapDocuments } from './default-templates.js';
import { HtmlPdfService } from './html-pdf.service.js';
import { buildDocContext, renderDocTemplate } from './print-render.util.js';

// Live smoke: exercises the REAL headless-Chrome render path that unit
// tests mock out. Skipped unless LIVE_PDF=1 so CI without Chrome stays green.
const run = process.env.LIVE_PDF === '1' ? describe : describe.skip;

run('LIVE bulk-print PDF render (real Chrome)', () => {
  it('renders a 2-doc batch with Cyrillic + positions into a valid multi-page PDF', async () => {
    const svc = new HtmlPdfService();
    const body = defaultTemplateBody('customerorder');

    const docs = [
      buildDocContext({
        title: 'Mijoz buyurtmasi',
        number: 'CO-2026-00001',
        date: new Date('2026-05-29T00:00:00Z'),
        sumMinor: 466_597_800n,
        currency: 'UZS',
        description: 'Срочная доставка — Кирилл текст ✓',
        counterpartyName: 'ООО «Климат Сервис» — Toshkent filiali',
        organizationName: 'CLIMART GROUP MCHJ',
        positions: [
          {
            name: 'Konditsioner Samsung AR12 (Кириллица)',
            unit: 'dona',
            qty: '3',
            priceMinor: 155_532_600n,
            sumMinor: 466_597_800n,
          },
          {
            name: 'Montaj xizmati',
            unit: 'soat',
            qty: '1.5',
            priceMinor: 20_000_000n,
            sumMinor: 30_000_000n,
          },
        ],
      }),
      buildDocContext({
        title: 'Mijoz buyurtmasi',
        number: 'CO-2026-00002',
        date: new Date('2026-05-30T00:00:00Z'),
        sumMinor: 5_000_000n,
        currency: 'UZS',
        counterpartyName: 'Oʻzbek Lotin Mijoz',
      }),
    ];

    const fragments = docs.map((ctx) => renderDocTemplate(body, ctx));
    const html = wrapDocuments(fragments);
    const pdf = await svc.renderHtmlToPdf(html, { pageSize: 'A4' });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(2000);

    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(2); // page-break-after between docs

    await svc.onModuleDestroy();
  }, 90_000);

  it('drains the concurrency semaphore: 8 concurrent renders all complete (MAX_CONCURRENT=4)', async () => {
    const svc = new HtmlPdfService();
    const body = defaultTemplateBody('customerorder');
    const html = wrapDocuments([
      renderDocTemplate(
        body,
        buildDocContext({ title: 'T', number: 'N', sumMinor: 100n, currency: 'UZS' }),
      ),
    ]);
    // More than MAX_CONCURRENT (4) — the extras queue and must still resolve.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => svc.renderHtmlToPdf(html, { pageSize: 'A4' })),
    );
    expect(results).toHaveLength(8);
    for (const pdf of results) expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    await svc.onModuleDestroy();
  }, 90_000);
});
