import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { computeStatement } from './statement-compute.util.js';
import { buildStatementXlsx } from './xlsx-builder.util.js';

async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

const sampleData = () =>
  computeStatement([
    {
      moment: new Date('2026-07-01T08:00:00Z'),
      docType: 'invoiceOut',
      docNumber: '03404',
      deltaMinor: 15_000_000n, // +150 000 so'm (debet)
      items: [
        { name: 'Sement', quantity: '10', priceMinor: 1_000_000n, sumMinor: 10_000_000n },
        { name: "G'isht", quantity: '100', priceMinor: 50_000n, sumMinor: 5_000_000n },
      ],
    },
    {
      moment: new Date('2026-07-05T08:00:00Z'),
      docType: 'cashIn',
      docNumber: '00112',
      deltaMinor: -5_000_000n, // −50 000 so'm (kredit)
      items: [],
    },
  ]);

const base = {
  companyName: 'Elektro sentr',
  counterpartyName: 'Davlatbek Azamov',
  periodLabel: 'Butun tarix',
  generatedAtLabel: '26.07.2026',
  currency: 'UZS',
};

describe('buildStatementXlsx — two sheets (Sodda + Batafsil)', () => {
  it('has both worksheets', async () => {
    const wb = await load(await buildStatementXlsx({ ...base, data: sampleData() }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Sodda', 'Batafsil']);
  });

  it('«Sodda»: one row per doc, goods in one cell, signed Summa, running Qoldiq', async () => {
    const wb = await load(await buildStatementXlsx({ ...base, data: sampleData() }));
    const ws = wb.getWorksheet('Sodda')!;
    expect(ws.getCell('A5').value).toBe('№');
    expect(ws.getCell('E5').value).toBe('Summa');
    // Doc row 6: sale, +150000, goods in one cell, balance 150000
    expect(String(ws.getCell('C6').value)).toContain('Sotuv №03404');
    expect(String(ws.getCell('D6').value)).toContain('Sement');
    expect(String(ws.getCell('D6').value)).toContain("G'isht");
    expect(ws.getCell('E6').value).toBe(150_000); // positive (debit)
    expect(ws.getCell('F6').value).toBe(150_000);
    // Doc row 7: payment, negative summa, running balance 100000
    expect(String(ws.getCell('C7').value)).toContain('00112');
    expect(ws.getCell('E7').value).toBe(-50_000); // negative (credit)
    expect(ws.getCell('F7').value).toBe(100_000);
  });

  it('«Batafsil»: keeps Debet/Kredit columns + indented goods', async () => {
    const wb = await load(await buildStatementXlsx({ ...base, data: sampleData() }));
    const ws = wb.getWorksheet('Batafsil')!;
    // 2026-07-28: «Chegirma» ustuni F ga qo'shildi ⇒ Debet/Kredit/Qoldiq G/H/I.
    expect(ws.getCell('F5').value).toBe('Chegirma');
    expect(ws.getCell('G5').value).toBe('Debet');
    expect(ws.getCell('H5').value).toBe('Kredit');
    expect(ws.getCell('G6').value).toBe(150_000); // doc debit
    expect(String(ws.getCell('C7').value)).toContain('Sement'); // indented item
    expect(ws.getCell('G7').value).toBe(100_000); // item sum in debit column
  });

  it('«Batafsil»: chegirma ustuni tovar qatorida chiqadi', async () => {
    const data = sampleData();
    data.lines[0].items[0].discountPercent = '10';
    const wb = await load(await buildStatementXlsx({ ...base, data }));
    const ws = wb.getWorksheet('Batafsil')!;
    expect(ws.getCell('F7').value).toBe('10%');
    // Chegirmasiz pozitsiyada «—» — ustun ko'z bilan tez o'qilsin.
    expect(ws.getCell('F8').value).toBe('—');
  });

  it('final balance banner (both sheets) states who owes whom', async () => {
    const wb = await load(await buildStatementXlsx({ ...base, data: sampleData() }));
    for (const name of ['Sodda', 'Batafsil']) {
      const txt = wb.getWorksheet(name)!.getSheetValues().flat().map(String).join('\n');
      expect(txt).toContain('bizga'.replace('bizga', 'sizga')); // "«...» sizga ... qarzdor"
      expect(txt).toContain('qarzdor');
    }
  });

  it('we-owe-them → reverse verdict', async () => {
    const data = computeStatement([
      {
        moment: new Date('2026-07-01T08:00:00Z'),
        docType: 'invoiceIn',
        docNumber: 'SF-1',
        deltaMinor: -20_000_000n,
        items: [],
      },
    ]);
    const wb = await load(await buildStatementXlsx({ ...base, counterpartyName: 'Beta', data }));
    const txt = wb.getWorksheet('Sodda')!.getSheetValues().flat().map(String).join('\n');
    expect(txt).toContain('Siz «Beta»ga');
    expect(txt).toContain('qarzdorsiz');
  });
});
