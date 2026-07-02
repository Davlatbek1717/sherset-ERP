import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { CountService, type SnapshotRow } from './count.service.js';

/**
 * Builds the Inventerizatsiya hisobot Excel workbook from a CountReport.
 * 5 sheets to mirror the reference: Xulosa / Mahsulot / Sanovchi / Guruh /
 * Sabab. Each sheet is laid out with frozen header row + auto-width hint.
 */
@Injectable()
export class ReportExportService {
  constructor(@Inject(CountService) private readonly counts: CountService) {}

  async generateReportXlsx(accountId: string, query: Record<string, unknown>): Promise<Buffer> {
    const report = await this.counts.report(accountId, query);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Moysklad Analitika';
    wb.created = new Date();

    const fmtMoney = (minor: string | number): number => {
      const n = typeof minor === 'string' ? Number(minor) : minor;
      return n / 100;
    };

    // 1) Xulosa
    {
      const ws = wb.addWorksheet('Xulosa');
      ws.columns = [
        { header: 'Koʼrsatkich', key: 'k', width: 30 },
        { header: 'Qiymat (soʼm)', key: 'v', width: 18, style: { numFmt: '#,##0' } },
      ];
      ws.addRows([
        { k: 'Yoʼqotish', v: fmtMoney(report.lossMinor) },
        { k: 'Ortiqcha topilgan', v: fmtMoney(report.surplusMinor) },
        { k: 'Sof natija', v: fmtMoney(report.netMinor) },
        { k: 'Jami sanash', v: report.byProduct.length },
      ]);
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // 2) Mahsulot boʼyicha
    {
      const ws = wb.addWorksheet('Mahsulot');
      ws.columns = [
        { header: 'Mahsulot', key: 'name', width: 36 },
        { header: 'Kod', key: 'code', width: 14 },
        { header: 'Guruh', key: 'groupName', width: 22 },
        { header: 'REGOS qoldigʼi', key: 'expectedQty', width: 14 },
        { header: 'Sanalgan', key: 'netQty', width: 12 },
        { header: 'Farq %', key: 'pct', width: 10 },
        { header: 'Narx', key: 'price', width: 14, style: { numFmt: '#,##0' } },
        { header: 'Summa', key: 'money', width: 16, style: { numFmt: '#,##0' } },
        { header: 'Holat', key: 'status', width: 10 },
        { header: 'Sanovchi', key: 'counter', width: 22 },
        { header: 'Sana', key: 'countedAt', width: 18 },
      ];
      for (const r of report.byProduct) {
        ws.addRow({
          name: r.name,
          code: r.code ?? '',
          groupName: r.groupName ?? '',
          expectedQty: r.expectedQty,
          netQty: r.netQty,
          pct: r.pct,
          price: fmtMoney(r.salePriceMinor),
          money: fmtMoney(r.moneyMinor),
          status: r.status,
          counter: r.counterName,
          countedAt: new Date(r.countedAt),
        });
      }
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: 'A1', to: 'K1' };
    }

    // 3) Sanovchi
    this.addBucketSheet(wb, 'Sanovchi', 'Sanovchi', report.byCounter, fmtMoney);
    // 4) Guruh
    this.addBucketSheet(wb, 'Guruh', 'Guruh', report.byGroup, fmtMoney);
    // 5) Sabab
    this.addBucketSheet(wb, 'Sabab', 'Sabab kodi', report.byReason, fmtMoney);

    // 6) Top-10 farq
    {
      const ws = wb.addWorksheet('Top-10');
      ws.columns = [
        { header: 'Mahsulot', key: 'name', width: 36 },
        { header: 'Kod', key: 'code', width: 14 },
        { header: 'Farq qiymati', key: 'money', width: 18, style: { numFmt: '#,##0' } },
      ];
      for (const r of report.top10) {
        ws.addRow({ name: r.name, code: r.code ?? '', money: fmtMoney(r.moneyMinor) });
      }
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Single-sheet "Sanash holati" workbook — the current-state snapshot,
   * one row per product+store, sorted by absolute variance value. Used as
   * the printable inventory state for accounting / audit purposes.
   */
  async generateSnapshotXlsx(
    accountId: string,
    opts: { groupName?: string; storeId?: string } = {},
  ): Promise<Buffer> {
    const rows = await this.counts.snapshot(accountId, opts);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Moysklad Analitika';
    wb.created = new Date();

    const fmtMoney = (minor: string | number): number =>
      (typeof minor === 'string' ? Number(minor) : minor) / 100;

    const ws = wb.addWorksheet('Sanash holati');
    ws.columns = [
      { header: 'Mahsulot', key: 'name', width: 36 },
      { header: 'Kod', key: 'code', width: 14 },
      { header: 'Guruh', key: 'groupName', width: 22 },
      { header: 'REGOS qoldigʼi', key: 'expectedQty', width: 14 },
      { header: 'Sanalgan farq', key: 'netQty', width: 14 },
      { header: 'Farq %', key: 'pct', width: 10 },
      { header: 'Narx (soʼm)', key: 'price', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Summa (soʼm)', key: 'money', width: 18, style: { numFmt: '#,##0' } },
      { header: 'Holat', key: 'status', width: 10 },
      { header: 'Qaror', key: 'decision', width: 14 },
      { header: 'Sanovchi', key: 'counter', width: 22 },
      { header: 'Sana', key: 'countedAt', width: 18 },
    ];

    for (const r of this.fillSnapshotRows(rows, fmtMoney)) ws.addRow(r);

    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'L1' };

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private fillSnapshotRows(rows: SnapshotRow[], fmtMoney: (minor: string | number) => number) {
    return rows.map((r) => ({
      name: r.productName,
      code: r.productCode ?? '',
      groupName: r.groupName ?? '',
      expectedQty: r.expectedQty,
      netQty: r.netQty,
      pct: r.variancePct,
      price: fmtMoney(r.salePriceMinor),
      money: fmtMoney(r.moneyMinor),
      status: r.status,
      decision: r.decision ?? 'pending',
      counter: r.counterName,
      countedAt: new Date(r.countedAt),
    }));
  }

  private addBucketSheet(
    wb: ExcelJS.Workbook,
    sheet: string,
    labelHeader: string,
    rows: Array<{ key: string; label: string; count: number; moneyMinor: string }>,
    fmtMoney: (minor: string | number) => number,
  ) {
    const ws = wb.addWorksheet(sheet);
    ws.columns = [
      { header: labelHeader, key: 'label', width: 30 },
      { header: 'Sanash soni', key: 'count', width: 14 },
      { header: 'Summa (soʼm)', key: 'money', width: 18, style: { numFmt: '#,##0' } },
    ];
    for (const r of rows) {
      ws.addRow({ label: r.label, count: r.count, money: fmtMoney(r.moneyMinor) });
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}
