import { describe, expect, it, vi } from 'vitest';
import { DocPdfService } from './doc-pdf.service.js';
import type { HtmlPdfService } from './html-pdf.service.js';
import { PdfRenderService } from './pdf-render.service.js';
import type { RawDocInput } from './print-render.util.js';
import type { PrintTemplateService } from './print-template.service.js';

const sampleDocs: RawDocInput[] = [
  { title: 'Mijoz buyurtmasi', number: 'CO-1', sumMinor: 5_000_000n, currency: 'UZS' },
  {
    title: 'Mijoz buyurtmasi',
    number: 'CO-2',
    sumMinor: 466_597_800n,
    currency: 'UZS',
    counterpartyName: 'ACME',
    positions: [
      { name: 'Tovar', unit: 'dona', qty: '3', priceMinor: 155_532_600n, sumMinor: 466_597_800n },
    ],
  },
];

function makeService(opts: {
  templateRow?: unknown;
  htmlPdf: Pick<HtmlPdfService, 'renderHtmlToPdf'>;
}) {
  const templates = {
    resolveDefault: vi.fn().mockResolvedValue(opts.templateRow ?? null),
  } as unknown as PrintTemplateService;
  // Real PdfRenderService — it is dependency-free and exercised as the stub fallback.
  const stub = new PdfRenderService();
  return {
    svc: new DocPdfService(templates, opts.htmlPdf as HtmlPdfService, stub),
    resolveDefault: templates.resolveDefault as ReturnType<typeof vi.fn>,
  };
}

describe('DocPdfService.renderBulk', () => {
  it('renders via Chrome using the built-in default template when no custom row exists', async () => {
    let capturedHtml = '';
    const { svc, resolveDefault } = makeService({
      templateRow: null,
      htmlPdf: {
        renderHtmlToPdf: vi.fn(async (html: string) => {
          capturedHtml = html;
          return Buffer.from('%PDF-1.4 chrome');
        }),
      },
    });

    const out = await svc.renderBulk('acc-1', 'customerorder', sampleDocs);

    expect(resolveDefault).toHaveBeenCalledWith('acc-1', 'customerorder', 'pdf');
    expect(out.toString()).toContain('%PDF');
    // Both documents rendered into one HTML payload.
    expect(capturedHtml).toContain('CO-1');
    expect(capturedHtml).toContain('CO-2');
    expect(capturedHtml).toContain('<table class="pos">'); // CO-2 has positions
    expect(capturedHtml).toContain('Summa:'); // CO-1 summary branch
  });

  it('uses a custom template body + its page geometry when a row exists', async () => {
    const geom = { renderHtmlToPdf: vi.fn(async () => Buffer.from('%PDF custom')) };
    const { svc } = makeService({
      templateRow: {
        bodyHtml: '<section>CUSTOM {{= doc.number }}</section>',
        pageSize: 'A5',
        marginTop: 5,
        marginRight: 5,
        marginBottom: 5,
        marginLeft: 5,
      },
      htmlPdf: geom,
    });

    await svc.renderBulk('acc-1', 'customerorder', sampleDocs);

    const [html, opts] = geom.renderHtmlToPdf.mock.calls[0];
    expect(html).toContain('CUSTOM CO-1');
    expect(opts).toMatchObject({ pageSize: 'A5', marginTop: 5 });
  });

  it('renders a code-injection custom template as inert data (no JS execution)', async () => {
    let captured = '';
    const html = {
      renderHtmlToPdf: vi.fn(async (h: string) => {
        captured = h;
        return Buffer.from(h);
      }),
    };
    const { svc } = makeService({
      // A malicious account admin tries to run code. The eval-free engine
      // must render this as literal data, never execute it — if it executed,
      // process.exit would kill this test runner.
      templateRow: {
        bodyHtml:
          '<section>{{ process.exit(1) }}{{= doc.number }}|{{= process.env.SECRET }}</section>',
        pageSize: 'A4',
        marginTop: 20,
        marginRight: 15,
        marginBottom: 20,
        marginLeft: 15,
      },
      htmlPdf: html,
    });

    const out = await svc.renderBulk('acc-1', 'customerorder', sampleDocs);
    // We reached here → process.exit did not run. Output uses the custom
    // template, the doc number interpolated, and process.env unreachable.
    expect(out.length).toBeGreaterThan(0);
    expect(captured).toContain('<section>');
    expect(captured).toContain('CO-1');
    expect(captured).not.toContain('process.exit');
  });

  it('falls back to the pdf-lib stub renderer when Chrome fails', async () => {
    const { svc } = makeService({
      templateRow: null,
      htmlPdf: {
        renderHtmlToPdf: vi.fn(async () => {
          throw new Error('Chrome not found');
        }),
      },
    });

    const out = await svc.renderBulk('acc-1', 'customerorder', sampleDocs);
    // Stub path produces a valid pdf-lib document (one page per doc).
    expect(out.subarray(0, 4).toString()).toBe('%PDF');
    expect(out.length).toBeGreaterThan(500);
  });
});

const FORM_A = '11111111-1111-1111-1111-111111111111';
const FORM_B = '22222222-2222-2222-2222-222222222222';

describe('DocPdfService.renderKit (Комплект…)', () => {
  it('concatenates every doc across every selected form into one PDF', async () => {
    let capturedHtml = '';
    const templates = {
      resolveById: vi.fn().mockResolvedValue({
        bodyHtml: '<section>FORM-A {{= doc.number }}</section>',
        pageSize: 'A4',
        marginTop: 10,
        marginRight: 10,
        marginBottom: 10,
        marginLeft: 10,
      }),
      // null templateId → built-in default form
      resolveDefault: vi.fn().mockResolvedValue(null),
    } as unknown as PrintTemplateService;
    const htmlPdf = {
      renderHtmlToPdf: vi.fn(async (html: string) => {
        capturedHtml = html;
        return Buffer.from('%PDF kit');
      }),
    };
    const svc = new DocPdfService(templates, htmlPdf as HtmlPdfService, new PdfRenderService());

    const out = await svc.renderKit('acc-1', 'customerorder', sampleDocs, [FORM_A, null]);

    expect(out.toString()).toContain('%PDF');
    // Custom form A rendered for BOTH docs…
    expect(capturedHtml).toContain('FORM-A CO-1');
    expect(capturedHtml).toContain('FORM-A CO-2');
    // …and the built-in default form ALSO rendered for both docs (null id).
    expect(templates.resolveDefault).toHaveBeenCalled();
    expect(capturedHtml).toContain('<table class="pos">'); // default form, CO-2 positions
    // CO-1 appears in both the custom form and the default summary.
    expect(capturedHtml.split('CO-1').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('drives the combined PDF with the FIRST form geometry', async () => {
    const templates = {
      resolveById: vi
        .fn()
        .mockResolvedValueOnce({
          bodyHtml: '<i>{{= doc.number }}</i>',
          pageSize: 'A5',
          marginTop: 7,
          marginRight: 7,
          marginBottom: 7,
          marginLeft: 7,
        })
        .mockResolvedValueOnce({
          bodyHtml: '<b>{{= doc.number }}</b>',
          pageSize: 'A3',
          marginTop: 3,
          marginRight: 3,
          marginBottom: 3,
          marginLeft: 3,
        }),
      resolveDefault: vi.fn().mockResolvedValue(null),
    } as unknown as PrintTemplateService;
    const htmlPdf = { renderHtmlToPdf: vi.fn(async () => Buffer.from('%PDF')) };
    const svc = new DocPdfService(templates, htmlPdf as HtmlPdfService, new PdfRenderService());

    await svc.renderKit('acc-1', 'customerorder', sampleDocs, [FORM_A, FORM_B]);

    const [, opts] = htmlPdf.renderHtmlToPdf.mock.calls[0];
    expect(opts).toMatchObject({ pageSize: 'A5', marginTop: 7 }); // first form wins
  });

  it('falls back to the pdf-lib stub when Chrome fails for a kit', async () => {
    const templates = {
      resolveById: vi.fn().mockResolvedValue(null),
      resolveDefault: vi.fn().mockResolvedValue(null),
    } as unknown as PrintTemplateService;
    const htmlPdf = {
      renderHtmlToPdf: vi.fn(async () => {
        throw new Error('Chrome not found');
      }),
    };
    const svc = new DocPdfService(templates, htmlPdf as HtmlPdfService, new PdfRenderService());

    const out = await svc.renderKit('acc-1', 'customerorder', sampleDocs, [null]);
    expect(out.subarray(0, 4).toString()).toBe('%PDF');
    expect(out.length).toBeGreaterThan(500);
  });
});
