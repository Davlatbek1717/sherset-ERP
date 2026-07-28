import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  type SupplyGoodsInput,
  type SupplyGoodsRow,
  buildSupplyGoodsXlsx,
} from './supply-goods-xlsx.util.js';

/**
 * «Qabul — tovarlar ro'yxati» Excel'i — egasi 2026-07-28 da «skidkani yubormadi»
 * deb shikoyat qilgan fayl. Bu testlar chegirma ustuni va yakuniy hisob-kitob
 * blokini pin qiladi: ular yo'qolsa test yiqiladi.
 */

async function sheetOf(input: SupplyGoodsInput) {
  const buf = await buildSupplyGoodsXlsx(input);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Tovarlar');
  if (!ws) throw new Error("«Tovarlar» varag'i yo'q");
  return ws;
}

/** Varaqdagi hamma katak matnini bitta satrga yig'adi (qidiruv uchun). */
function allText(ws: ExcelJS.Worksheet): string {
  const out: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value;
      if (v !== null && v !== undefined) out.push(String(v));
    });
  });
  return out.join(' | ');
}

const ROW_WITH_DISCOUNT: SupplyGoodsRow = {
  name: 'Kabel VVG 3x2.5',
  quantity: '10',
  priceMinor: 10_000_00n, // 10 000 so'm
  discountPercent: '10',
  grossSumMinor: 100_000_00n, // 100 000 so'm
  discountSumMinor: 10_000_00n, // 10 000 so'm chegirma
  sumMinor: 90_000_00n, // 90 000 so'm
};

const ROW_NO_DISCOUNT: SupplyGoodsRow = {
  name: 'Rozetka',
  quantity: '5',
  priceMinor: 2_000_00n,
  discountPercent: '0',
  grossSumMinor: 10_000_00n,
  discountSumMinor: 0n,
  sumMinor: 10_000_00n,
};

const BASE: SupplyGoodsInput = {
  companyName: 'Sherset',
  counterpartyName: 'Uz kabel',
  docNumber: 'QBL-2026-00042',
  dateLabel: '28.07.2026 14:30',
  rows: [ROW_WITH_DISCOUNT, ROW_NO_DISCOUNT],
  grossTotalMinor: 110_000_00n,
  discountTotalMinor: 10_000_00n,
  totalSumMinor: 100_000_00n,
  currency: 'UZS',
};

describe('buildSupplyGoodsXlsx — chegirma', () => {
  it('sarlavhada «Chegirma» va «Summa (chegirmasiz)» ustunlari bor', async () => {
    const ws = await sheetOf(BASE);
    const head = ws.getRow(5);
    const headers = [1, 2, 3, 4, 5, 6, 7].map((i) => String(head.getCell(i).value ?? ''));
    expect(headers).toEqual([
      '№',
      'Tovar',
      'Miqdor',
      'Narx',
      'Summa (chegirmasiz)',
      'Chegirma',
      'Summa',
    ]);
  });

  it("chegirmali qatorda foiz ko'rinadi va summa chegirmadan KEYINGI", async () => {
    const ws = await sheetOf(BASE);
    const r = ws.getRow(6);
    expect(r.getCell(2).value).toBe('Kabel VVG 3x2.5');
    // Kataklar SO'Mda (tiyin ÷ 100): 10 dona × 10 000 = 100 000, −10% ⇒ 90 000.
    expect(r.getCell(5).value).toBe(100_000);
    expect(r.getCell(6).value).toBe('10%');
    expect(r.getCell(7).value).toBe(90_000);
  });

  it('chegirmasiz qatorda «—» chiqadi (nol foiz shovqin qilmasin)', async () => {
    const ws = await sheetOf(BASE);
    expect(ws.getRow(7).getCell(6).value).toBe('—');
  });

  it('«Shundan chegirma» qatori jamidan keyin turadi', async () => {
    const text = allText(await sheetOf(BASE));
    expect(text).toContain('Shundan chegirma:');
  });

  it("chegirma NOL bo'lsa — «Shundan chegirma» qatori umuman chizilmaydi", async () => {
    const text = allText(
      await sheetOf({
        ...BASE,
        rows: [ROW_NO_DISCOUNT],
        grossTotalMinor: 10_000_00n,
        discountTotalMinor: 0n,
        totalSumMinor: 10_000_00n,
      }),
    );
    expect(text).not.toContain('Shundan chegirma');
  });

  it('pastki xulosa qatori chegirma hisobini ochib beradi', async () => {
    const text = allText(await sheetOf(BASE));
    // «1 100 − 100 (chegirma) = 1 000 so'm» — ru-RU guruhlash NBSP ishlatadi,
    // shuning uchun raqamga emas, tuzilishga bog'lanamiz.
    expect(text).toContain('(chegirma)');
    expect(text).toContain("so'm");
  });

  it('kasrli chegirma foizi ortiqcha nolsiz chiqadi', async () => {
    const ws = await sheetOf({
      ...BASE,
      rows: [{ ...ROW_WITH_DISCOUNT, discountPercent: '12.50' }],
    });
    expect(ws.getRow(6).getCell(6).value).toBe('12.5%');
  });
});

describe('buildSupplyGoodsXlsx — yakuniy hisob-kitob bloki', () => {
  it('«biz qarzdormiz» xulosasi faylga tushadi', async () => {
    const text = allText(
      await sheetOf({
        ...BASE,
        settlement: [
          {
            currency: 'UZS',
            ledgerBalanceMinor: -12_000_000n,
            debtRegistryOutstandingMinor: 0n,
            verdict: "Sizga 120 000 so'm qarzimiz bor — tez orada to'lanadi.",
          },
        ],
      }),
    );
    expect(text).toContain('YAKUNIY HISOB-KITOB');
    expect(text).toContain("Sizga 120 000 so'm qarzimiz bor");
  });

  it("QRZ- reyestr qoldig'i ALOHIDA qator bo'lib chiqadi (saldoga qo'shilmaydi)", async () => {
    const text = allText(
      await sheetOf({
        ...BASE,
        settlement: [
          {
            currency: 'UZS',
            ledgerBalanceMinor: 500_000n,
            debtRegistryOutstandingMinor: 300_000n,
            verdict: "Sizda 5 000 so'm qarz bor.",
          },
        ],
      }),
    );
    expect(text).toContain("Sizda 5 000 so'm qarz bor.");
    expect(text).toContain('shundan qarz kartochkalari');
  });

  it("reyestr qoldig'i nol bo'lsa — izoh qatori chizilmaydi", async () => {
    const text = allText(
      await sheetOf({
        ...BASE,
        settlement: [
          {
            currency: 'UZS',
            ledgerBalanceMinor: 500_000n,
            debtRegistryOutstandingMinor: 0n,
            verdict: "Sizda 5 000 so'm qarz bor.",
          },
        ],
      }),
    );
    expect(text).not.toContain('shundan qarz kartochkalari');
  });

  it("bir nechta valyuta — har biri o'z qatorida", async () => {
    const text = allText(
      await sheetOf({
        ...BASE,
        settlement: [
          {
            currency: 'UZS',
            ledgerBalanceMinor: -100n,
            debtRegistryOutstandingMinor: 0n,
            verdict: "Sizga 1 so'm qarzimiz bor — tez orada to'lanadi.",
          },
          {
            currency: 'USD',
            ledgerBalanceMinor: 5_000n,
            debtRegistryOutstandingMinor: 0n,
            verdict: 'Sizda 50 USD qarz bor.',
          },
        ],
      }),
    );
    expect(text).toContain("Sizga 1 so'm qarzimiz bor");
    expect(text).toContain('Sizda 50 USD qarz bor.');
  });

  it("settlement berilmasa — blok umuman yo'q (eski xulq buzilmaydi)", async () => {
    const text = allText(await sheetOf(BASE));
    expect(text).not.toContain('YAKUNIY HISOB-KITOB');
  });
});
