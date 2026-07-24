import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { MonthlyReportFilter } from './attendance-geo.schema.js';
import { HrDavomatReportService } from './davomat-report.service.js';
import type { MonthlyRow } from './monthly-report.util.js';

const STATUS_LABEL: Record<MonthlyRow['status'], string> = {
  present: 'Keldi',
  late: 'Kechikdi',
  absent: 'Kelmadi',
  dayoff: 'Dam olish',
};

/** Monthly davomat XLSX (Xulosa summary + per-day detail). Mirrors analitika export. */
@Injectable()
export class HrDavomatExportService {
  constructor(@Inject(HrDavomatReportService) private readonly report: HrDavomatReportService) {}

  async monthlyXlsx(accountId: string, filter: MonthlyReportFilter): Promise<Buffer> {
    const data = await this.report.monthly(accountId, filter);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sherset Davomat';

    // 1) Xulosa (per-employee summary)
    const sum = wb.addWorksheet('Xulosa');
    sum.columns = [
      { header: 'Xodim', key: 'name', width: 28 },
      { header: 'Kelgan', key: 'present', width: 10 },
      { header: 'Kechikkan', key: 'late', width: 12 },
      { header: 'Kelmagan', key: 'absent', width: 10 },
      { header: 'Dam', key: 'dayoff', width: 8 },
      { header: 'Jami kechikish (daq)', key: 'lateTotal', width: 20, style: { numFmt: '#,##0' } },
    ];
    for (const emp of data.employees) {
      sum.addRow({
        name: emp.name,
        present: emp.presentDays,
        late: emp.lateDays,
        absent: emp.absentDays,
        dayoff: emp.dayOffDays,
        lateTotal: emp.lateMinutesTotal,
      });
    }
    sum.getRow(1).font = { bold: true };
    sum.views = [{ state: 'frozen', ySplit: 1 }];

    // 2) Kunlik (per-day detail)
    const detail = wb.addWorksheet('Kunlik');
    detail.columns = [
      { header: 'Xodim', key: 'name', width: 28 },
      { header: 'Sana', key: 'date', width: 12 },
      { header: 'Keldi', key: 'checkIn', width: 10 },
      { header: 'Ketdi', key: 'checkOut', width: 10 },
      { header: 'Kechikish (daq)', key: 'late', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Holat', key: 'status', width: 12 },
    ];
    for (const emp of data.employees) {
      for (const row of emp.rows) {
        detail.addRow({
          name: emp.name,
          date: row.date,
          checkIn: row.checkIn ?? '',
          checkOut: row.checkOut ?? '',
          late: row.lateMinutes,
          status: STATUS_LABEL[row.status],
        });
      }
    }
    detail.getRow(1).font = { bold: true };
    detail.views = [{ state: 'frozen', ySplit: 1 }];

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
