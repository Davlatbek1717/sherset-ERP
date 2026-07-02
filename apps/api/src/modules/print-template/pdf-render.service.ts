import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Replace characters the StandardFont (Helvetica / WinAnsi) cannot encode
 * with '?'. Without this, `drawText` THROWS on Cyrillic — and document
 * auto-numbers carry Cyrillic prefixes (ТЗ-, ОТ-, СЧ-), so the stub
 * fallback would 500 on exactly the real data it is supposed to rescue.
 * The stub is a degraded last resort (the Chrome path renders full
 * Unicode); replacing unencodable glyphs keeps it producing a valid PDF.
 */
function winAnsiSafe(text: string): string {
  // Keep printable ASCII + the Latin-1 supplement; replace everything else.
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/**
 * Minimal PDF render + merge service — scaffolding for the bulk-print
 * workflow.
 *
 * V1 renders a stub "summary card" per document (name, date, amount,
 * description) using pdf-lib primitives. Real template rendering
 * (HTML → PDF via Puppeteer, or react-pdf) is follow-up work and
 * lives behind a future `renderTemplate(templateId, data)` method.
 *
 * `mergePdfs` produces a single Buffer with one page per source PDF.
 * Used by bulk-print endpoints to serve one downloadable file.
 */
@Injectable()
export class PdfRenderService {
  /**
   * Render a single doc as a stub one-page PDF. Returns a Uint8Array
   * (pdf-lib's native output) so callers can pipe straight to a
   * Fastify response or feed into `mergePdfs`.
   */
  async renderStubDoc(input: {
    title: string;
    name: string;
    moment?: Date | null;
    sumMinor?: string | null;
    currency?: string | null;
    description?: string | null;
  }): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4 portrait in points
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const drawLine = (text: string, y: number, opts?: { bold?: boolean; size?: number }) => {
      page.drawText(winAnsiSafe(text), {
        x: 50,
        y,
        size: opts?.size ?? 11,
        font: opts?.bold ? bold : font,
        color: rgb(0.1, 0.1, 0.1),
      });
    };

    drawLine(input.title, 800, { bold: true, size: 16 });
    drawLine(input.name, 770, { bold: true, size: 12 });
    if (input.moment) {
      drawLine(`Sana: ${input.moment.toISOString().slice(0, 10)}`, 740);
    }
    if (input.sumMinor && input.currency) {
      const major = (BigInt(input.sumMinor) / 100n).toString();
      drawLine(`Summa: ${major} ${input.currency}`, 720);
    }
    if (input.description) {
      drawLine('Izoh:', 690, { bold: true });
      drawLine(input.description.slice(0, 200), 670);
    }

    return pdf.save();
  }

  /**
   * Merge N rendered PDFs into a single multi-page PDF. Inputs are the
   * raw bytes from `renderStubDoc` (or any other pdf-lib output);
   * page order matches input order.
   */
  async mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
    const merged = await PDFDocument.create();
    for (const bytes of parts) {
      const src = await PDFDocument.load(bytes);
      const copied = await merged.copyPages(src, src.getPageIndices());
      for (const page of copied) merged.addPage(page);
    }
    return merged.save();
  }
}
