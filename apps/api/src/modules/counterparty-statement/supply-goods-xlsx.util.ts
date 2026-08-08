import ExcelJS from 'exceljs';
import { discountLabel } from './statement-compute.util.js';

/**
 * «Qabul — tovarlar ro'yxati» XLSX for ONE supply document (not the full akt).
 * Only the goods received in this specific supply: name, qty, price, discount,
 * sum — with a total. Sent to the supplier so they see exactly what THIS
 * receipt contains.
 *
 * 2026-07-28 (egasi talabi «skidkani yubormadi»): CHEGIRMA ustunlari qo'shildi
 * va qator summasi endi `computePositionTotal` (chegirma + QQS, aniq BigInt)
 * bilan hisoblanadi. Ilgari qator `qty × narx` edi — chegirmasiz, QQSsiz va
 * float arifmetikasida, shuning uchun jadvaldagi «JAMI» hujjatning o'z
 * summasiga TO'G'RI KELMASDI: yetkazib beruvchi haqiqiy summadan katta raqam
 * ko'rardi.
 *
 * Shuningdek pastga YAKUNIY HISOB-KITOB bloki qo'shildi — kontragentning
 * barcha qarzlari bo'yicha «kim kimdan qancha qarzdor» (valyuta kesimida).
 */

export interface SupplyGoodsRow {
  name: string;
  quantity: string;
  priceMinor: bigint;
  /** Chegirma foizi ("10", "12.5") — 0 bo'lsa katakda «—» chiqadi. */
  discountPercent: string;
  /** Chegirmadan OLDINGI qator summasi (qty × narx), tiyin. */
  grossSumMinor: bigint;
  /** Chegirma summasi (gross − net), tiyin. */
  discountSumMinor: bigint;
  /** Yakuniy qator summasi — chegirma va QQS qo'llangandan keyin, tiyin. */
  sumMinor: bigint;
}

/** Yakuniy hisob-kitob bloki uchun bitta valyuta qatori. */
export interface SupplyGoodsSettlementLine {
  currency: string;
  /** Ishorali: musbat = ular bizga qarzdor, manfiy = biz ularga qarzdormiz. */
  ledgerBalanceMinor: bigint;
  /** QRZ- reyestridagi yopilmagan qoldiq (≥ 0). */
  debtRegistryOutstandingMinor: bigint;
  /** Inson o'qiydigan xulosa — «Sizda X qarz bor» / «Sizga X qarzimiz bor». */
  verdict: string;
}

export interface SupplyGoodsInput {
  companyName: string;
  counterpartyName: string;
  docNumber: string;
  dateLabel: string; // pre-formatted date+time
  rows: SupplyGoodsRow[];
  /** Chegirmasiz jami (qatorlarning gross yig'indisi). */
  grossTotalMinor: bigint;
  /** Berilgan umumiy chegirma. */
  discountTotalMinor: bigint;
  /** Hujjatning haqiqiy jami summasi (chegirma+QQS qo'llangan). */
  totalSumMinor: bigint;
  currency: string;
  /** Yakuniy hisob-kitob — bo'sh massiv bo'lsa blok chizilmaydi. */
  settlement?: SupplyGoodsSettlementLine[];
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
const SETTLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};
const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

/** Tiyin → so'm. Excel raqamlari uchun Number kerak; BigInt qo'llanmaydi. */
function som(minor: bigint): number {
  return Number(minor) / 100;
}

const COLS = 7;

export async function buildSupplyGoodsXlsx(input: SupplyGoodsInput): Promise<Buffer> {
  const unit = input.currency === 'UZS' ? "so'm" : input.currency;
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;
  const ws = wb.addWorksheet('Tovarlar', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });
  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'name', width: 42 },
    { key: 'qty', width: 11 },
    { key: 'price', width: 15, style: { numFmt: MONEY } },
    { key: 'gross', width: 16, style: { numFmt: MONEY } },
    { key: 'disc', width: 12 },
    { key: 'sum', width: 17, style: { numFmt: MONEY } },
  ];
  const merge = (r: number) => ws.mergeCells(r, 1, r, COLS);

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
  ['№', 'Tovar', 'Miqdor', 'Narx', 'Summa (chegirmasiz)', 'Chegirma', 'Summa'].forEach((h, i) => {
    const c = ws.getRow(HEAD).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
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
    tr.getCell(5).value = som(row.grossSumMinor);
    tr.getCell(6).value = discountLabel(row.discountPercent);
    tr.getCell(6).alignment = { horizontal: 'center' };
    tr.getCell(7).value = som(row.sumMinor);
    for (let i = 1; i <= COLS; i++) tr.getCell(i).border = thin;
    r++;
  });

  // Autofilter on the header + data rows.
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: r - 1, column: COLS } };

  const tot = ws.getRow(r);
  tot.getCell(2).value = 'JAMI:';
  tot.getCell(5).value = som(input.grossTotalMinor);
  tot.getCell(7).value = som(input.totalSumMinor);
  for (let i = 1; i <= COLS; i++) {
    tot.getCell(i).fill = TOTAL_FILL;
    tot.getCell(i).font = { bold: true };
    tot.getCell(i).border = thin;
  }
  r++;

  // Chegirma bo'lsa — alohida, ko'zga tashlanadigan qator. Nol bo'lsa chizilmaydi
  // (bo'sh «Chegirma: 0» qatori faylni shovqinlaydi).
  if (input.discountTotalMinor !== 0n) {
    const dr = ws.getRow(r);
    dr.getCell(2).value = 'Shundan chegirma:';
    dr.getCell(7).value = som(input.discountTotalMinor);
    for (let i = 1; i <= COLS; i++) {
      dr.getCell(i).fill = TOTAL_FILL;
      dr.getCell(i).font = { bold: true, color: { argb: 'FFC00000' } };
      dr.getCell(i).border = thin;
    }
    r++;
  }

  r += 1;
  const totalLabel = new Intl.NumberFormat('ru-RU').format(som(input.totalSumMinor));
  ws.getCell(`A${r}`).value =
    input.discountTotalMinor !== 0n
      ? `Jami: ${input.rows.length} xil tovar · ${new Intl.NumberFormat('ru-RU').format(som(input.grossTotalMinor))} − ${new Intl.NumberFormat('ru-RU').format(som(input.discountTotalMinor))} (chegirma) = ${totalLabel} ${unit}`
      : `Jami: ${input.rows.length} xil tovar · ${totalLabel} ${unit}`;
  merge(r);
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
  ws.getCell(`A${r}`).fill = TOTAL_FILL;
  r += 2;

  // ── YAKUNIY HISOB-KITOB — barcha qarzlar bo'yicha kim kimdan qancha qarzdor ──
  const settlement = input.settlement ?? [];
  if (settlement.length > 0) {
    ws.getCell(`A${r}`).value = "YAKUNIY HISOB-KITOB (barcha qarzlar bo'yicha)";
    merge(r);
    ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: 'FF7F6000' } };
    ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
    ws.getCell(`A${r}`).fill = SETTLE_FILL;
    r++;

    for (const line of settlement) {
      ws.getCell(`A${r}`).value = line.verdict;
      merge(r);
      ws.getCell(`A${r}`).font = { bold: true, size: 11 };
      ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
      ws.getCell(`A${r}`).border = thin;
      r++;
      if (line.debtRegistryOutstandingMinor !== 0n) {
        // Reyestr qarzi — saldoning TARKIBI («shundan …»), qo'shiluvchi EMAS:
        // QRZ- qarz bosh daftarga allaqachon tushgan (izohi:
        // counterparty-settlement.util.ts).
        ws.getCell(`A${r}`).value =
          `shundan qarz kartochkalari bo'yicha: ${new Intl.NumberFormat('ru-RU').format(som(line.debtRegistryOutstandingMinor))} ${line.currency === 'UZS' ? "so'm" : line.currency}`;
        merge(r);
        ws.getCell(`A${r}`).font = { size: 10, italic: true, color: { argb: 'FF666666' } };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r++;
      }
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
