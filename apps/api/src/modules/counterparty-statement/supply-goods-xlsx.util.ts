import ExcelJS from 'exceljs';

/**
 * «Qabul — tovarlar ro'yxati» XLSX for ONE supply document (not the full akt).
 * Only the goods received in this specific supply: name, qty, price, sum — with
 * a total. Sent to the supplier so they see exactly what THIS receipt contains.
 */

export interface SupplyGoodsRow {
  name: string;
  quantity: string;
  priceMinor: bigint;
  sumMinor: bigint;
}

export interface SupplyGoodsInput {
  companyName: string;
  counterpartyName: string;
  docNumber: string;
  dateLabel: string; // pre-formatted date+time
  rows: SupplyGoodsRow[];
  totalSumMinor: bigint;
  currency: string;
}

const MONEY = '# ##0';
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

export async function buildSupplyGoodsXlsx(input: SupplyGoodsInput): Promise<Buffer> {
  const unit = input.currency === 'UZS' ? "so'm" : input.currency;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;
  const ws = wb.addWorksheet('Tovarlar', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });
  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'name', width: 46 },
    { key: 'qty', width: 12 },
    { key: 'price', width: 16, style: { numFmt: MONEY } },
    { key: 'sum', width: 18, style: { numFmt: MONEY } },
  ];
  const merge = (r: number) => ws.mergeCells(`A${r}:E${r}`);

  ws.getCell('A1').value = "QABUL — TOVARLAR RO'YXATI";
  merge(1);
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E79' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getCell('A2').value = `${input.companyName}  ←  ${input.counterpartyName}`;
  merge(2);
  ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.getCell('A3').value = `Qabul №${input.docNumber}  ·  ${input.dateLabel}`;
  merge(3);
  ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };

  const HEAD = 5;
  ['№', 'Tovar', 'Miqdor', 'Narx', 'Summa'].forEach((h, i) => {
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
    tr.getCell(2).value = row.name;
    tr.getCell(3).value = Number(row.quantity);
    tr.getCell(4).value = som(row.priceMinor);
    tr.getCell(5).value = som(row.sumMinor);
    for (let i = 1; i <= 5; i++) tr.getCell(i).border = thin;
    r++;
  });

  // Autofilter on the header + data rows.
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: r - 1, column: 5 } };

  const tot = ws.getRow(r);
  tot.getCell(2).value = 'JAMI:';
  tot.getCell(5).value = som(input.totalSumMinor);
  for (let i = 1; i <= 5; i++) {
    tot.getCell(i).fill = TOTAL_FILL;
    tot.getCell(i).font = { bold: true };
    tot.getCell(i).border = thin;
  }
  r += 2;
  ws.getCell(`A${r}`).value =
    `Jami: ${input.rows.length} xil tovar · ${new Intl.NumberFormat('ru-RU').format(som(input.totalSumMinor))} ${unit}`;
  merge(r);
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
  ws.getCell(`A${r}`).fill = TOTAL_FILL;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
