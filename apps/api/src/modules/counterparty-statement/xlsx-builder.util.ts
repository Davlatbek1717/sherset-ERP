import ExcelJS from 'exceljs';
import { DOC_TYPE_LABEL, type StatementData } from './statement-compute.util.js';

/**
 * Professional reconciliation-statement (акт-сверка) XLSX builder. Pure-ish:
 * takes computed StatementData + header context, returns an .xlsx Buffer. Layout:
 * title block → per-document ledger rows with indented goods lines → totals →
 * highlighted final-balance line → signature footer.
 */

export interface StatementXlsxInput {
  companyName: string;
  counterpartyName: string;
  /** e.g. "Butun tarix" or "01.01.2026 – 31.07.2026". */
  periodLabel: string;
  generatedAtLabel: string; // pre-formatted (no Date.now in pure builder)
  data: StatementData;
  currency: string; // 'UZS'
}

const MONEY_FMT = '# ##0';
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

/** Absolute tiyin → so'm number for numeric cells (values well within 2^53). */
function som(minor: bigint): number {
  const abs = minor < 0n ? -minor : minor;
  return Number(abs) / 100;
}

function finalBalanceText(name: string, balanceMinor: bigint, unit: string): string {
  const amt = new Intl.NumberFormat('ru-RU').format(som(balanceMinor));
  if (balanceMinor > 0n) return `«${name}» bizga ${amt} ${unit} qarzdor`;
  if (balanceMinor < 0n) return `Biz «${name}»ga ${amt} ${unit} qarzdormiz`;
  return 'Hisob teng — qarz yo‘q';
}

export async function buildStatementXlsx(input: StatementXlsxInput): Promise<Buffer> {
  const unit = input.currency === 'UZS' ? "so'm" : input.currency;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;
  const ws = wb.addWorksheet('Akt-sverka', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  const COLS = 8;
  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'date', width: 13 },
    { key: 'desc', width: 42 },
    { key: 'qty', width: 10 },
    { key: 'price', width: 14, style: { numFmt: MONEY_FMT } },
    { key: 'debit', width: 16, style: { numFmt: MONEY_FMT } },
    { key: 'credit', width: 16, style: { numFmt: MONEY_FMT } },
    { key: 'balance', width: 18, style: { numFmt: MONEY_FMT } },
  ];
  const last = (r: number) => `H${r}`;
  const merge = (r: number) => ws.mergeCells(`A${r}:${last(r)}`);

  // ---- Title block ----
  ws.getCell('A1').value = 'HISOB-KITOB AKT-SVERKASI';
  merge(1);
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E79' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.getCell('A2').value = `${input.companyName}  ↔  ${input.counterpartyName}`;
  merge(2);
  ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.getCell('A3').value =
    `Davr: ${input.periodLabel}     ·     Yaratildi: ${input.generatedAtLabel}`;
  merge(3);
  ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };

  // ---- Table header (row 5) ----
  const HEAD = 5;
  const headers = ['№', 'Sana', 'Hujjat / Tovar', 'Miqdor', 'Narx', 'Debet', 'Kredit', 'Qoldiq'];
  const hr = ws.getRow(HEAD);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thin;
  });
  ws.views = [{ state: 'frozen', ySplit: HEAD }];

  // ---- Ledger rows ----
  let r = HEAD + 1;
  input.data.lines.forEach((line, idx) => {
    const dr = ws.getRow(r);
    dr.getCell(1).value = idx + 1;
    dr.getCell(2).value = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(line.moment);
    dr.getCell(3).value = `${DOC_TYPE_LABEL[line.docType]} №${line.docNumber}`;
    dr.getCell(3).font = { bold: true };
    if (line.debitMinor > 0n) dr.getCell(6).value = som(line.debitMinor);
    if (line.creditMinor > 0n) dr.getCell(7).value = som(line.creditMinor);
    dr.getCell(8).value = som(line.runningBalanceMinor);
    for (let i = 1; i <= COLS; i++) dr.getCell(i).border = thin;
    r++;

    // Indented goods lines — item sums drop into the doc's own side column.
    for (const it of line.items) {
      const ir = ws.getRow(r);
      ir.getCell(3).value = `    ${it.name}`;
      ir.getCell(3).font = { color: { argb: 'FF555555' } };
      ir.getCell(4).value = it.quantity;
      ir.getCell(5).value = som(it.priceMinor);
      ir.getCell(line.side === 'debit' ? 6 : 7).value = som(it.sumMinor);
      for (let i = 1; i <= COLS; i++) ir.getCell(i).border = thin;
      r++;
    }
  });

  // ---- Totals ----
  const totalRow = ws.getRow(r);
  totalRow.getCell(3).value = 'JAMI:';
  totalRow.getCell(6).value = som(input.data.totalDebitMinor);
  totalRow.getCell(7).value = som(input.data.totalCreditMinor);
  totalRow.getCell(8).value = som(input.data.finalBalanceMinor);
  for (let i = 1; i <= COLS; i++) {
    totalRow.getCell(i).fill = TOTAL_FILL;
    totalRow.getCell(i).font = { bold: true };
    totalRow.getCell(i).border = thin;
  }
  r++;

  const turnRow = ws.getRow(r);
  turnRow.getCell(3).value = 'Umumiy aylanma:';
  turnRow.getCell(6).value = som(input.data.turnoverMinor);
  turnRow.getCell(3).font = { italic: true };
  r += 2;

  // ---- Final balance banner ----
  ws.getCell(`A${r}`).value = finalBalanceText(
    input.counterpartyName,
    input.data.finalBalanceMinor,
    unit,
  );
  merge(r);
  ws.getCell(`A${r}`).font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
  ws.getCell(`A${r}`).fill = TOTAL_FILL;
  r += 3;

  // ---- Signature footer ----
  ws.getCell(`B${r}`).value = 'Yetkazib beruvchi: ______________';
  ws.getCell(`F${r}`).value = 'Xaridor: ______________';

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
