import ExcelJS from 'exceljs';

/**
 * «Buyum bo'yicha hisobot» (Report B) XLSX — one row per counterparty showing
 * how much of a given product they bought (qty, sum) and their current total
 * debt. Pure: takes aggregated rows, returns an .xlsx Buffer.
 */

export interface ProductReportRow {
  cpName: string;
  qty: number;
  sumMinor: bigint;
  /** Counterparty's current total balance (>0 they owe us · <0 we owe them). */
  debtMinor: bigint;
}

export interface ProductReportInput {
  companyName: string;
  productName: string;
  periodLabel: string;
  generatedAtLabel: string;
  rows: ProductReportRow[];
  totalQty: number;
  totalSumMinor: bigint;
  currency: string;
}

const MONEY = '# ##0';
const DEBT = '# ##0;-# ##0';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDDEBF7' },
};
const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function som(minor: bigint): number {
  return Number(minor) / 100;
}

export async function buildProductReportXlsx(input: ProductReportInput): Promise<Buffer> {
  const unit = input.currency === 'UZS' ? "so'm" : input.currency;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;
  const ws = wb.addWorksheet('Buyum hisoboti', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });
  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'cp', width: 40 },
    { key: 'qty', width: 12 },
    { key: 'sum', width: 18, style: { numFmt: MONEY } },
    { key: 'debt', width: 18, style: { numFmt: DEBT } },
  ];
  const merge = (r: number) => ws.mergeCells(`A${r}:E${r}`);

  ws.getCell('A1').value = "BUYUM BO'YICHA HISOBOT";
  merge(1);
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E79' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getCell('A2').value = `${input.companyName}  ·  Buyum: ${input.productName}`;
  merge(2);
  ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.getCell('A3').value =
    `Davr: ${input.periodLabel}     ·     Yaratildi: ${input.generatedAtLabel}`;
  merge(3);
  ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };

  const HEAD = 5;
  ['№', 'Kontragent', 'Miqdor', 'Summa', 'Umumiy qarzi'].forEach((h, i) => {
    const c = ws.getRow(HEAD).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thin;
  });
  ws.views = [{ state: 'frozen', ySplit: HEAD }];

  let r = HEAD + 1;
  input.rows.forEach((row, idx) => {
    const tr = ws.getRow(r);
    tr.getCell(1).value = idx + 1;
    tr.getCell(2).value = row.cpName;
    tr.getCell(3).value = row.qty;
    tr.getCell(4).value = som(row.sumMinor);
    tr.getCell(5).value = som(row.debtMinor);
    for (let i = 1; i <= 5; i++) tr.getCell(i).border = thin;
    r++;
  });

  const tot = ws.getRow(r);
  tot.getCell(2).value = 'JAMI:';
  tot.getCell(3).value = input.totalQty;
  tot.getCell(4).value = som(input.totalSumMinor);
  for (let i = 1; i <= 5; i++) {
    tot.getCell(i).fill = TOTAL_FILL;
    tot.getCell(i).font = { bold: true };
    tot.getCell(i).border = thin;
  }
  r += 2;
  ws.getCell(`A${r}`).value =
    `«${input.productName}» — jami ${input.rows.length} ta kontragentga ${new Intl.NumberFormat('ru-RU').format(input.totalQty)} dona, ${new Intl.NumberFormat('ru-RU').format(som(input.totalSumMinor))} ${unit}`;
  merge(r);
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
  ws.getCell(`A${r}`).fill = TOTAL_FILL;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
