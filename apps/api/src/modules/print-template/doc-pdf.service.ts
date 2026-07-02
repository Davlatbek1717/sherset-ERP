import { Inject, Injectable, Logger } from '@nestjs/common';
import { defaultTemplateBody, wrapDocuments } from './default-templates.js';
import { DocxRenderService } from './docx-render.service.js';
import { HtmlPdfService } from './html-pdf.service.js';
import { PdfRenderService } from './pdf-render.service.js';
import { type RawDocInput, buildDocContext, renderDocTemplate } from './print-render.util.js';
import { PrintTemplateService } from './print-template.service.js';

interface ResolvedTemplate {
  body: string;
  /** Uploaded Word/Excel template bytes (moysklad-parity file template); when
   *  set, render goes through docxtemplater + LibreOffice instead of HTML. */
  bodyDocx: Buffer | null;
  format: string;
  source: 'custom' | 'default';
  geom: {
    pageSize: string;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
  };
}

/**
 * Orchestrates bulk document → PDF rendering for the bulk-print endpoints.
 *
 * Pipeline: resolve the account's custom PrintTemplate for (entity, 'pdf'),
 * or fall back to the built-in default → render each document fragment with
 * eta → wrap into one HTML document → rasterise to PDF via headless Chrome.
 *
 * Two degradation layers keep bulk-print working under failure:
 *   1. A broken custom template (eta syntax/runtime error) falls back to the
 *      built-in default template for the whole batch.
 *   2. An unavailable/failed Chrome falls back to the pdf-lib stub renderer
 *      (one summary page per document, merged). Output is uglier but valid.
 * Both fallbacks log a warning — never a silent swallow.
 *
 * Kept separate from {@link PdfRenderService} (the pure pdf-lib primitive,
 * still used as the fallback and unit-tested standalone) so neither service
 * grows DI dependencies the other does not need.
 */
@Injectable()
export class DocPdfService {
  private readonly logger = new Logger(DocPdfService.name);

  constructor(
    @Inject(PrintTemplateService) private readonly templates: PrintTemplateService,
    @Inject(HtmlPdfService) private readonly htmlPdf: HtmlPdfService,
    @Inject(PdfRenderService) private readonly stub: PdfRenderService,
    @Inject(DocxRenderService) private readonly docx: DocxRenderService,
  ) {}

  /**
   * Render N documents of one entity type into a single PDF Buffer.
   * `entity` is the moysklad slug (e.g. 'customerorder') used to resolve the
   * template; `docs` carry the per-document context the template renders.
   */
  async renderBulk(
    accountId: string,
    entity: string,
    docs: RawDocInput[],
    templateId?: string,
  ): Promise<Buffer> {
    // moysklad-parity Word/Excel template: an uploaded .docx/.xlsx is filled
    // with docxtemplater + converted to PDF by LibreOffice, then merged. A
    // failure degrades to the pdf-lib stub (logged, never silently swallowed).
    const resolved = await this.resolveTemplate(accountId, entity, templateId);
    if (resolved.bodyDocx) {
      const file = resolved.bodyDocx;
      const fill =
        resolved.format === 'xlsx'
          ? (raw: RawDocInput) => this.docx.renderXlsxToPdf(file, raw)
          : (raw: RawDocInput) => this.docx.renderDocxToPdf(file, raw);
      try {
        // LibreOffice (soffice) is effectively single-instance — concurrent
        // conversions race on its shared user profile and intermittently fail
        // (a multi-doc bulk-print 500'd in browser smoke). Render sequentially.
        const parts: Buffer[] = [];
        for (const raw of docs) parts.push(await fill(raw));
        return parts.length === 1 && parts[0]
          ? parts[0]
          : Buffer.from(await this.stub.mergePdfs(parts));
      } catch (e) {
        this.logger.warn(
          `Docx/LibreOffice render failed for entity=${entity} (${docs.length} docs); falling back to pdf-lib stub: ${(e as Error).message}`,
        );
        return this.stubFallback(docs);
      }
    }

    const fragments = this.renderHtmlFragments(resolved, entity, docs);
    const html = wrapDocuments(fragments);
    try {
      return await this.htmlPdf.renderHtmlToPdf(html, resolved.geom);
    } catch (e) {
      this.logger.warn(
        `Chrome render failed for entity=${entity} (${docs.length} docs); falling back to pdf-lib stub: ${(e as Error).message}`,
      );
      return this.stubFallback(docs);
    }
  }

  /**
   * «Комплект…» — render the selected docs through MULTIPLE print forms and
   * concatenate everything into ONE PDF (moysklad's "document set" print).
   *
   * Each `templateIds` entry is a custom-template id, or null/undefined for the
   * account default / built-in form. Output order is preserved: all docs of
   * template 1, then all docs of template 2, … The page geometry of the FIRST
   * resolved template drives the combined PDF — a kit may mix geometries, but
   * one HTML → one PDF needs a single page setup, and first-wins matches the
   * user's lead pick. Per-template render failures degrade to the built-in
   * default (via {@link renderFragments}); a failed Chrome degrades the whole
   * kit to the pdf-lib stub. Never a silent swallow.
   */
  async renderKit(
    accountId: string,
    entity: string,
    docs: RawDocInput[],
    templateIds: ReadonlyArray<string | null | undefined>,
  ): Promise<Buffer> {
    const ids = templateIds.length > 0 ? templateIds : [undefined];
    const allFragments: string[] = [];
    let geom: ResolvedTemplate['geom'] | undefined;
    for (const tid of ids) {
      const part = await this.renderFragments(accountId, entity, docs, tid ?? undefined);
      if (!geom) geom = part.geom;
      allFragments.push(...part.fragments);
    }
    const html = wrapDocuments(allFragments);
    const pageGeom = geom ?? {
      pageSize: 'A4',
      marginTop: 20,
      marginRight: 15,
      marginBottom: 20,
      marginLeft: 15,
    };

    try {
      return await this.htmlPdf.renderHtmlToPdf(html, pageGeom);
    } catch (e) {
      this.logger.warn(
        `Chrome render failed for kit entity=${entity} (${docs.length} docs × ${ids.length} forms); falling back to pdf-lib stub: ${(e as Error).message}`,
      );
      return this.stubFallback(docs);
    }
  }

  /**
   * Resolve a template for (entity, templateId) and render every doc into an
   * HTML fragment. A broken custom template (eta syntax/runtime error) degrades
   * the whole batch to the built-in default — logged, never silently swallowed.
   * Shared by {@link renderBulk} (one template) and {@link renderKit} (many).
   */
  private async renderFragments(
    accountId: string,
    entity: string,
    docs: RawDocInput[],
    templateId?: string,
  ): Promise<{ fragments: string[]; geom: ResolvedTemplate['geom'] }> {
    const tmpl = await this.resolveTemplate(accountId, entity, templateId);
    return { fragments: this.renderHtmlFragments(tmpl, entity, docs), geom: tmpl.geom };
  }

  /** Render each doc to an HTML fragment from an already-resolved template. A
   *  broken custom template degrades the whole batch to the built-in default —
   *  logged, never silently swallowed. */
  private renderHtmlFragments(
    tmpl: ResolvedTemplate,
    entity: string,
    docs: RawDocInput[],
  ): string[] {
    try {
      return docs.map((raw) => renderDocTemplate(tmpl.body, buildDocContext(raw)));
    } catch (e) {
      this.logger.warn(
        `Template render failed (source=${tmpl.source}, entity=${entity}); using built-in default: ${(e as Error).message}`,
      );
      const fallbackBody = defaultTemplateBody(entity);
      return docs.map((raw) => renderDocTemplate(fallbackBody, buildDocContext(raw)));
    }
  }

  private async resolveTemplate(
    accountId: string,
    entity: string,
    templateId?: string,
  ): Promise<ResolvedTemplate> {
    // A specific picked template (from the doc «Печать» menu) wins; if it
    // doesn't resolve (deleted/disabled/wrong entity) fall back to the
    // account default, then the built-in default.
    // Resolve across BOTH pdf (HTML) and docx/xlsx (uploaded file) formats —
    // the picked/default template may be a Word/Excel upload, not an HTML form.
    const row =
      (templateId
        ? ((await this.templates.resolveById(accountId, templateId, entity, 'pdf')) ??
          (await this.templates.resolveById(accountId, templateId, entity, 'docx')) ??
          (await this.templates.resolveById(accountId, templateId, entity, 'xlsx')))
        : null) ??
      (await this.templates.resolveDefault(accountId, entity, 'pdf')) ??
      (await this.templates.resolveDefault(accountId, entity, 'docx')) ??
      (await this.templates.resolveDefault(accountId, entity, 'xlsx'));
    const geomOf = (r: NonNullable<typeof row>) => ({
      pageSize: r.pageSize,
      marginTop: r.marginTop,
      marginRight: r.marginRight,
      marginBottom: r.marginBottom,
      marginLeft: r.marginLeft,
    });
    if (row?.bodyDocx) {
      return {
        body: '',
        bodyDocx: Buffer.from(row.bodyDocx),
        format: row.format,
        source: 'custom',
        geom: geomOf(row),
      };
    }
    if (row?.bodyHtml) {
      return {
        body: row.bodyHtml,
        bodyDocx: null,
        format: row.format,
        source: 'custom',
        geom: geomOf(row),
      };
    }
    return {
      body: defaultTemplateBody(entity),
      bodyDocx: null,
      format: 'html',
      source: 'default',
      geom: { pageSize: 'A4', marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15 },
    };
  }

  /** Last-resort renderer: one pdf-lib summary page per document, merged. */
  private async stubFallback(docs: RawDocInput[]): Promise<Buffer> {
    const parts = await Promise.all(
      docs.map((d) =>
        this.stub.renderStubDoc({
          title: d.title,
          name: d.number,
          moment: d.date ? new Date(d.date) : null,
          sumMinor: d.sumMinor != null ? String(d.sumMinor) : null,
          currency: d.currency ?? 'UZS',
          description: d.description ?? null,
        }),
      ),
    );
    const merged = await this.stub.mergePdfs(parts);
    return Buffer.from(merged);
  }
}
