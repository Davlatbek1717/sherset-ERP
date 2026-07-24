import { describe, expect, it, vi } from 'vitest';
import { HrDavomatExportService } from './davomat-export.service.js';

describe('HrDavomatExportService.monthlyXlsx', () => {
  it('produces a non-empty xlsx (zip) buffer', async () => {
    const report = {
      yearMonth: '2026-06',
      employees: [
        {
          employeeId: 'e1',
          name: 'Ali',
          rows: [
            {
              date: '2026-06-15',
              checkIn: '09:20',
              checkOut: '18:00',
              lateMinutes: 20,
              status: 'late' as const,
            },
          ],
          presentDays: 1,
          lateDays: 1,
          absentDays: 29,
          dayOffDays: 0,
          lateMinutesTotal: 20,
        },
      ],
    };
    const reportSvc = { monthly: vi.fn().mockResolvedValue(report) };
    const svc = new HrDavomatExportService(reportSvc as never);
    const buf = await svc.monthlyXlsx('acc', { yearMonth: '2026-06' });

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK'); // xlsx is a zip
    expect(reportSvc.monthly).toHaveBeenCalledWith('acc', { yearMonth: '2026-06' });
  });
});
