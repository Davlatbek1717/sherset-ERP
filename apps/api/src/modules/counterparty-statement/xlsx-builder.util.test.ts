import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { computeStatement } from './statement-compute.util.js';
import { buildStatementXlsx } from './xlsx-builder.util.js';

async function load(buf: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0]!;
}

describe('buildStatementXlsx', () => {
  it('renders title, doc rows, indented items, totals and final balance', async () => {
    const data = computeStatement([
      {
        moment: new Date('2026-07-01T08:00:00Z'),
        docType: 'invoiceOut',
        docNumber: '03404',
        sumMinor: 15_000_000n, // 150 000 so'm
        items: [
          { name: 'Sement', quantity: '10', priceMinor: 1_000_000n, sumMinor: 10_000_000n },
          { name: "G'isht", quantity: '100', priceMinor: 50_000n, sumMinor: 5_000_000n },
        ],
      },
      {
        moment: new Date('2026-07-05T08:00:00Z'),
        docType: 'cashIn',
        docNumber: '00112',
        sumMinor: 5_000_000n, // 50 000 so'm
        items: [],
      },
    ]);

    const buf = await buildStatementXlsx({
      companyName: 'Elektro sentr',
      counterpartyName: 'Davlatbek Azamov',
      periodLabel: 'Butun tarix',
      generatedAtLabel: '26.07.2026',
      data,
      currency: 'UZS',
    });
    expect(buf.byteLength).toBeGreaterThan(0);

    const ws = await load(buf);
    // Title + parties
    expect(String(ws.getCell('A1').value)).toContain('AKT-SVERKASI');
    expect(String(ws.getCell('A2').value)).toContain('Davlatbek Azamov');
    // Header row (row 5)
    expect(ws.getCell('A5').value).toBe('№');
    expect(ws.getCell('F5').value).toBe('Debet');
    // First doc row (row 6): sale, debit 150000 som, balance 150000
    expect(String(ws.getCell('C6').value)).toContain('Sotuv №03404');
    expect(ws.getCell('F6').value).toBe(150_000);
    expect(ws.getCell('H6').value).toBe(150_000);
    // Indented item rows (7,8)
    expect(String(ws.getCell('C7').value)).toContain('Sement');
    expect(ws.getCell('F7').value).toBe(100_000); // item sum in debit column
    // A final-balance banner somewhere contains the verdict text
    const allText = (ws as unknown as { _rows: unknown[] })._rows
      ? ws.getSheetValues().flat().map(String).join('\n')
      : '';
    expect(allText).toContain('bizga');
    expect(allText).toContain('qarzdor');
  });

  it('we-owe-them final balance renders the reverse verdict', async () => {
    const data = computeStatement([
      {
        moment: new Date('2026-07-01T08:00:00Z'),
        docType: 'invoiceIn',
        docNumber: 'СФ-1',
        sumMinor: 20_000_000n,
        items: [],
      },
    ]);
    const buf = await buildStatementXlsx({
      companyName: 'Elektro sentr',
      counterpartyName: 'Beta',
      periodLabel: 'Butun tarix',
      generatedAtLabel: '26.07.2026',
      data,
      currency: 'UZS',
    });
    const ws = await load(buf);
    const allText = ws.getSheetValues().flat().map(String).join('\n');
    expect(allText).toContain('Biz «Beta»ga');
    expect(allText).toContain('qarzdormiz');
  });
});
