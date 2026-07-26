import ExcelJS from 'exceljs';
import { DOC_TYPE_LABEL, type StatementData } from './statement-compute.util.js';

/**
 * Reconciliation-statement (акт-сверка) XLSX with TWO worksheets, so both views
 * ship in one file (owner 2026-07-26 — keep the detailed one, add a simple one):
 *   • «Sodda»    — human-readable: one row per document, goods in a single cell,
 *                  signed Summa (+ sale/we-paid · − payment/purchase), running Qoldiq.
 *   • «Batafsil» — accounting view: Debet/Kredit columns + indented goods lines.
 * Both end with the plain-language final balance.
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
const SUM_FMT = '+# ##0;-# ##0';
const BAL_FMT = '# ##0;-# ##0';
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
const GREEN = { argb: 'FF107C41' };
const RED = { argb: 'FFC0392B' };
const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function somSigned(minor: bigint): number {
  return Number(minor) / 100;
}
function somAbs(minor: bigint): number {
  const abs = minor < 0n ? -minor : minor;
  return Number(abs) / 100;
}
function fmtDate(m: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(m);
}
function finalBalanceText(name: string, balanceMinor: bigint, unit: string): string {
  const amt = new Intl.NumberFormat('ru-RU').format(somAbs(balanceMinor));
  if (balanceMinor > 0n) return `«${name}» sizga ${amt} ${unit} qarzdor`;
  if (balanceMinor < 0n) return `Siz «${name}»ga ${amt} ${unit} qarzdorsiz`;
  return 'Hisob teng — qarz yo‘q';
}

function titleBlock(ws: ExcelJS.Worksheet, lastCol: string, input: StatementXlsxInput): void {
  const merge = (r: number) => ws.mergeCells(`A${r}:${lastCol}${r}`);
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
}

function finalBanner(
  ws: ExcelJS.Worksheet,
  r: number,
  lastCol: string,
  input: StatementXlsxInput,
  unit: string,
): void {
  ws.getCell(`A${r}`).value = finalBalanceText(
    input.counterpartyName,
    input.data.finalBalanceMinor,
    unit,
  );
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  ws.getCell(`A${r}`).font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
  ws.getCell(`A${r}`).fill = TOTAL_FILL;
}

// ---- Sheet 1: «Sodda» (simple, human-readable) ----
function addSimpleSheet(wb: ExcelJS.Workbook, input: StatementXlsxInput, unit: string): void {
  const ws = wb.addWorksheet('Sodda', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });
  const COLS = 6;
  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'date', width: 13 },
    { key: 'op', width: 24 },
    { key: 'goods', width: 40 },
    { key: 'sum', width: 16, style: { numFmt: SUM_FMT } },
    { key: 'balance', width: 18, style: { numFmt: BAL_FMT } },
  ];
  titleBlock(ws, 'F', input);

  const HEAD = 5;
  ['№', 'Sana', 'Amal', 'Tovar', 'Summa', 'Qoldiq'].forEach((h, i) => {
    const c = ws.getRow(HEAD).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thin;
  });
  ws.views = [{ state: 'frozen', ySplit: HEAD }];

  let r = HEAD + 1;
  input.data.lines.forEach((line, idx) => {
    const row = ws.getRow(r);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = fmtDate(line.moment);
    row.getCell(3).value = `${DOC_TYPE_LABEL[line.docType]} №${line.docNumber}`;
    row.getCell(3).font = { bold: true };
    row.getCell(4).value = line.items.length
      ? line.items.map((it) => `${it.name} ×${it.quantity}`).join('\n')
      : '—';
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    const signed = line.side === 'debit' ? somSigned(line.debitMinor) : -somAbs(line.creditMinor);
    const sumCell = row.getCell(5);
    sumCell.value = signed;
    sumCell.font = { bold: true, color: signed >= 0 ? GREEN : RED };
    row.getCell(6).value = somSigned(line.runningBalanceMinor);
    for (let i = 1; i <= COLS; i++) row.getCell(i).border = thin;
    r++;
  });

  r++;
  ws.getCell(`C${r}`).value = 'Umumiy aylanma:';
  ws.getCell(`C${r}`).font = { italic: true };
  ws.getCell(`E${r}`).value = somAbs(input.data.turnoverMinor);
  ws.getCell(`E${r}`).numFmt = BAL_FMT;
  ws.getCell(`E${r}`).font = { italic: true };
  r += 2;
  finalBanner(ws, r, 'F', input, unit);
  r += 3;
  ws.getCell(`B${r}`).value = 'Yetkazib beruvchi: ______________';
  ws.getCell(`E${r}`).value = 'Xaridor: ______________';
}

// ---- Sheet 2: «Batafsil» (detailed accounting view) ----
function addDetailedSheet(wb: ExcelJS.Workbook, input: StatementXlsxInput, unit: string): void {
  const ws = wb.addWorksheet('Batafsil', {
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
    { key: 'balance', width: 18, style: { numFmt: BAL_FMT } },
  ];
  titleBlock(ws, 'H', input);

  const HEAD = 5;
  ['№', 'Sana', 'Hujjat / Tovar', 'Miqdor', 'Narx', 'Debet', 'Kredit', 'Qoldiq'].forEach((h, i) => {
    const c = ws.getRow(HEAD).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thin;
  });
  ws.views = [{ state: 'frozen', ySplit: HEAD }];

  let r = HEAD + 1;
  input.data.lines.forEach((line, idx) => {
    const dr = ws.getRow(r);
    dr.getCell(1).value = idx + 1;
    dr.getCell(2).value = fmtDate(line.moment);
    dr.getCell(3).value = `${DOC_TYPE_LABEL[line.docType]} №${line.docNumber}`;
    dr.getCell(3).font = { bold: true };
    if (line.debitMinor > 0n) dr.getCell(6).value = somAbs(line.debitMinor);
    if (line.creditMinor > 0n) dr.getCell(7).value = somAbs(line.creditMinor);
    dr.getCell(8).value = somSigned(line.runningBalanceMinor);
    for (let i = 1; i <= COLS; i++) dr.getCell(i).border = thin;
    r++;
    for (const it of line.items) {
      const ir = ws.getRow(r);
      ir.getCell(3).value = `    ${it.name}`;
      ir.getCell(3).font = { color: { argb: 'FF555555' } };
      ir.getCell(4).value = it.quantity;
      ir.getCell(5).value = somAbs(it.priceMinor);
      ir.getCell(line.side === 'debit' ? 6 : 7).value = somAbs(it.sumMinor);
      for (let i = 1; i <= COLS; i++) ir.getCell(i).border = thin;
      r++;
    }
  });

  const totalRow = ws.getRow(r);
  totalRow.getCell(3).value = 'JAMI:';
  totalRow.getCell(6).value = somAbs(input.data.totalDebitMinor);
  totalRow.getCell(7).value = somAbs(input.data.totalCreditMinor);
  totalRow.getCell(8).value = somSigned(input.data.finalBalanceMinor);
  for (let i = 1; i <= COLS; i++) {
    totalRow.getCell(i).fill = TOTAL_FILL;
    totalRow.getCell(i).font = { bold: true };
    totalRow.getCell(i).border = thin;
  }
  r += 2;
  finalBanner(ws, r, 'H', input, unit);
  r += 3;
  ws.getCell(`B${r}`).value = 'Yetkazib beruvchi: ______________';
  ws.getCell(`F${r}`).value = 'Xaridor: ______________';
}

export async function buildStatementXlsx(input: StatementXlsxInput): Promise<Buffer> {
  const unit = input.currency === 'UZS' ? "so'm" : input.currency;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;
  addSimpleSheet(wb, input, unit); // «Sodda» first (default open tab)
  addDetailedSheet(wb, input, unit); // «Batafsil»
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
