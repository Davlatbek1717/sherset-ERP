import { Inject, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CountService } from './count.service.js';

/**
 * Inventory report PDF generator.
 *
 * Single-page A4 summary using PDFKit's built-in Helvetica family (no
 * external font shipped). The PDF mirrors the XLSX content but is
 * print-friendly:
 *   - Header strip with title and period chip
 *   - 4-card KPI grid (loss / surplus / net / count)
 *   - 3 stacked breakdown tables (Sanovchi / Guruh / Sabab) top-5 each
 *   - Top-10 variance items table full-width
 *   - Footer with generation timestamp + signature line
 *
 * Cyrillic and Uzbek text rely on Helvetica's WinAnsi coverage. For the
 * extended Cyrillic letters (ў, ҳ, ғ, etc.) we transliterate via the
 * standard apostrophe variants ("oʼ", "gʼ") so PDFKit doesn't fall back to
 * empty glyphs.
 */
@Injectable()
export class ReportPdfService {
  constructor(@Inject(CountService) private readonly counts: CountService) {}

  async generateReportPdf(accountId: string, query: Record<string, unknown>): Promise<Buffer> {
    const report = await this.counts.report(accountId, query);
    const period = String(query.period ?? 'all');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: 'Inventerizatsiya' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, period);
      this.renderKpis(doc, report);
      this.renderBreakdownTables(doc, report);
      this.renderTopTen(doc, report);
      this.renderFooter(doc);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, period: string) {
    doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text('Inventerizatsiya hisoboti', {
      align: 'left',
    });
    doc.moveDown(0.2);
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text(`Davr: ${this.fmtPeriod(period)}`);
    doc.moveDown(0.5);
    doc.moveTo(36, doc.y).lineTo(559, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    doc.moveDown(0.6);
  }

  private renderKpis(
    doc: PDFKit.PDFDocument,
    report: { lossMinor: string; surplusMinor: string; netMinor: string; byProduct: unknown[] },
  ) {
    const cards = [
      { label: "Yo'qotish", value: this.fmtMoney(report.lossMinor), tone: '#dc2626' },
      { label: 'Ortiqcha', value: this.fmtMoney(report.surplusMinor), tone: '#059669' },
      { label: 'Sof natija', value: this.fmtMoney(report.netMinor), tone: '#0f172a' },
      { label: 'Sanash soni', value: String(report.byProduct.length), tone: '#0f172a' },
    ];
    const cardW = 124;
    const gap = 8;
    const startX = 36;
    const startY = doc.y;
    cards.forEach((c, i) => {
      const x = startX + i * (cardW + gap);
      doc
        .roundedRect(x, startY, cardW, 56, 4)
        .fillColor('#f8fafc')
        .fill()
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();
      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica')
        .text(c.label, x + 8, startY + 8);
      doc
        .fillColor(c.tone)
        .fontSize(13)
        .font('Helvetica-Bold')
        .text(c.value, x + 8, startY + 24);
    });
    doc.y = startY + 56 + 16;
  }

  private renderBreakdownTables(
    doc: PDFKit.PDFDocument,
    report: {
      byCounter: Array<{ label: string; count: number; moneyMinor: string }>;
      byGroup: Array<{ label: string; count: number; moneyMinor: string }>;
      byReason: Array<{ label: string; count: number; moneyMinor: string }>;
    },
  ) {
    this.renderBucketTable(doc, 'Sanovchi (top-5)', report.byCounter.slice(0, 5));
    this.renderBucketTable(doc, 'Guruh (top-5)', report.byGroup.slice(0, 5));
    this.renderBucketTable(doc, 'Sabab (top-5)', report.byReason.slice(0, 5));
  }

  private renderBucketTable(
    doc: PDFKit.PDFDocument,
    title: string,
    rows: Array<{ label: string; count: number; moneyMinor: string }>,
  ) {
    doc.moveDown(0.3);
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(title);
    doc.moveDown(0.15);
    const startY = doc.y;
    const colLabel = 36;
    const colCount = 380;
    const colMoney = 470;

    doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold');
    doc.text('Nom', colLabel, startY);
    doc.text('Soni', colCount, startY, { width: 60, align: 'right' });
    doc.text('Summa (soʼm)', colMoney, startY, { width: 90, align: 'right' });
    doc
      .moveTo(36, startY + 12)
      .lineTo(559, startY + 12)
      .strokeColor('#e2e8f0')
      .stroke();

    let y = startY + 14;
    doc.font('Helvetica').fillColor('#0f172a').fontSize(9);
    if (rows.length === 0) {
      doc.fillColor('#94a3b8').text('— maʼlumot yoʼq —', colLabel, y);
      y += 14;
    } else {
      for (const r of rows) {
        doc.fillColor('#0f172a').text(this.truncate(r.label, 60), colLabel, y, { width: 330 });
        doc.text(String(r.count), colCount, y, { width: 60, align: 'right' });
        doc.text(this.fmtMoney(r.moneyMinor), colMoney, y, { width: 90, align: 'right' });
        y += 13;
      }
    }
    doc.y = y + 4;
  }

  private renderTopTen(
    doc: PDFKit.PDFDocument,
    report: {
      top10: Array<{ name: string; code: string | null; moneyMinor: string }>;
    },
  ) {
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.4);
    doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Top-10 farq');
    doc.moveDown(0.15);

    const startY = doc.y;
    doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold');
    doc.text('Mahsulot', 36, startY, { width: 330 });
    doc.text('Kod', 370, startY, { width: 90 });
    doc.text('Summa', 470, startY, { width: 90, align: 'right' });
    doc
      .moveTo(36, startY + 12)
      .lineTo(559, startY + 12)
      .strokeColor('#e2e8f0')
      .stroke();

    let y = startY + 14;
    doc.font('Helvetica').fontSize(9);
    if (report.top10.length === 0) {
      doc.fillColor('#94a3b8').text('— maʼlumot yoʼq —', 36, y);
      y += 14;
    } else {
      for (const r of report.top10) {
        doc.fillColor('#0f172a').text(this.truncate(r.name, 70), 36, y, { width: 330 });
        doc.fillColor('#64748b').text(r.code ?? '—', 370, y, { width: 90 });
        doc
          .fillColor(Number(r.moneyMinor) < 0 ? '#dc2626' : '#059669')
          .text(this.fmtMoney(r.moneyMinor), 470, y, { width: 90, align: 'right' });
        y += 13;
      }
    }
    doc.y = y + 4;
  }

  private renderFooter(doc: PDFKit.PDFDocument) {
    const y = 800;
    doc.moveTo(36, y).lineTo(559, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    doc
      .fillColor('#64748b')
      .fontSize(8)
      .font('Helvetica')
      .text(`Yaratildi: ${new Date().toLocaleString('uz-UZ')}`, 36, y + 6);
    doc.text('Imzo: ___________________', 380, y + 6);
  }

  private fmtMoney(minor: string | number): string {
    const tiyin = typeof minor === 'string' ? Number(minor) : minor;
    const soum = tiyin / 100;
    return `${soum.toLocaleString('ru-RU')} soʼm`;
  }

  private truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return `${s.slice(0, n - 1)}…`;
  }

  private fmtPeriod(period: string): string {
    if (period === 'today') return 'Bugun';
    if (period === '7d') return 'Soʼnggi 7 kun';
    if (period === '30d') return 'Soʼnggi 30 kun';
    return 'Barchasi';
  }
}
