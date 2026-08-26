import { describe, expect, it, vi } from 'vitest';
import { StockPieceCutService } from '../stock-piece/stock-piece-cut.service.js';
import { RestockTaskService } from './restock-task.service.js';

/**
 * Yig'ish varag'i — BITTA PRINTER = BITTA QOG'OZ (egasi, 2026-08-16).
 *
 * 🔴 JONLI SIMPTOM: chek chiqa boshlagach egasi ko'rdi — yacheykali va
 * yacheykasiz tovarlar **ikki alohida chek** bo'lib chiqdi. Sabab: varaqlar
 * ombor raqami bo'yicha guruhlanardi va HAR GURUH alohida varaq edi — bu
 * ombor→printer marshruti sozlanganda mantiqiy (har ombor o'z printeriga),
 * lekin prodda `sklad_keepers` **0 qator**: hamma varaq AYNI sukut printerdan
 * ketma-ket chiqadi, ya'ni bo'linishning foydasi yo'q, faqat qog'oz va
 * chalkashlik. Ustiga tartib TESKARI edi: `NULL_SKLAD = -1` sonli saralashda
 * birinchi turadi ⇒ yacheykasizlar BIRINCHI chiqardi.
 *
 * YANGI SHARTNOMA:
 *   · printeri BOR ombor — o'z varag'i (boshqa jismoniy printer, boshqa qog'oz);
 *   · qolgani (printersiz omborlar + yacheykasizlar) — **BITTA** varaqqa
 *     qo'shiladi: avval yacheykalilar (ombor → serpantin marshrut bo'yicha),
 *     oxirida yacheykasizlar;
 *   · aralash varaqda ombor sarlavhasi (`groupLabel`) **null** — «01» ham,
 *     «Yacheykasiz» ham yolg'on bo'lardi; manzil har qatorda turibdi.
 *
 * Qulf server tomonda: uchala renderer (Electron HTML · ESC/POS matn ·
 * `/print/picking` sahifasi) shu javobdan oziqlanadi — xotira
 * «ombor cheki uch renderer».
 */

const ACCOUNT = 'acc-1';
const SALE_ID = '11111111-1111-4111-8111-111111111111';

/** `attributes.__yacheyka` bo'yicha tovar. */
const prod = (id: string, name: string, cell: string | null) => ({
  id,
  name,
  uom: 'dona',
  attributes: cell ? { __yacheyka: cell } : {},
});

function makeService(opts: {
  products: ReturnType<typeof prod>[];
  keepers?: Array<{ skladNo: number; employeeName: string | null }>;
}) {
  const positions = opts.products.map((p) => ({ productId: p.id, quantity: 1 }));
  const prisma = {
    client: {
      retailSale: {
        findFirst: vi.fn(async () => ({
          id: SALE_ID,
          name: 'TPH-7',
          storeId: null,
          moment: new Date('2026-08-16T10:00:00.000Z'),
          description: null,
          positions,
          agent: null,
          owner: null,
          organization: { name: 'Org' },
        })),
      },
      product: { findMany: vi.fn(async () => opts.products) },
      skladKeeper: { findMany: vi.fn(async () => opts.keepers ?? []) },
      store: { findFirst: vi.fn(async () => null) },
    },
  };
  // K4 — uchinchi bog'liqlik (kesim servisi). Bu fayl `getPickingSheets` ni
  // sinaydi va u bo'lak reyestriga umuman kirmaydi.
  return new RestockTaskService(prisma as never, {} as never, new StockPieceCutService());
}

/** Varaqdagi tovar nomlari — tartib bilan. */
const namesOf = (sheet: { lines: Array<{ productName: string }> }) =>
  sheet.lines.map((l) => l.productName);

describe('getPickingSheets — bitta printer = bitta varaq', () => {
  it('🔴 yacheykali va yacheykasiz BITTA varaqda: avval yacheykalilar', async () => {
    const svc = makeService({
      products: [
        prod('p1', 'Yacheykasiz-A', null),
        prod('p2', 'Yacheykali-01', '01-02-03-05'),
        prod('p3', 'Yacheykasiz-B', null),
        prod('p4', 'Yacheykali-02', '02-01-01-01'),
      ],
    });

    const res = await svc.getPickingSheets(ACCOUNT, 'retailsale', SALE_ID);

    // Ilgari: 3 varaq (Yacheykasiz, 01, 02) — va yacheykasizi BIRINCHI.
    expect(res.sheets).toHaveLength(1);
    expect(namesOf(res.sheets[0])).toEqual([
      'Yacheykali-01',
      'Yacheykali-02',
      'Yacheykasiz-A',
      'Yacheykasiz-B',
    ]);
    // Aralash varaqda ombor sarlavhasi ko'rsatilmaydi.
    expect(res.sheets[0].groupLabel).toBeNull();
  });

  it('faqat yacheykalilar bo`lsa — ombor raqami o`sish tartibida, sarlavha bor', async () => {
    const svc = makeService({
      products: [prod('p1', 'Ikkinchi', '02-01-01-01'), prod('p2', 'Birinchi', '01-01-01-01')],
    });

    const res = await svc.getPickingSheets(ACCOUNT, 'retailsale', SALE_ID);

    expect(res.sheets).toHaveLength(1);
    expect(namesOf(res.sheets[0])).toEqual(['Birinchi', 'Ikkinchi']);
    // Bitta ombor emas (01 va 02) ⇒ yagona sarlavha yolg'on bo'lardi.
    expect(res.sheets[0].groupLabel).toBeNull();
  });

  it('bitta ombor — sarlavha o`sha omborniki', async () => {
    const svc = makeService({
      products: [prod('p1', 'A', '01-01-01-01'), prod('p2', 'B', '01-02-01-01')],
    });

    const res = await svc.getPickingSheets(ACCOUNT, 'retailsale', SALE_ID);

    expect(res.sheets).toHaveLength(1);
    expect(res.sheets[0].skladNo).toBe(1);
    expect(res.sheets[0].groupLabel).toBe('01');
  });

  it('faqat yacheykasizlar — «Yacheykasiz» sarlavhasi saqlanadi', async () => {
    const svc = makeService({ products: [prod('p1', 'A', null)] });

    const res = await svc.getPickingSheets(ACCOUNT, 'retailsale', SALE_ID);

    expect(res.sheets).toHaveLength(1);
    expect(res.sheets[0].skladNo).toBeNull();
    expect(res.sheets[0].groupLabel).toBe('Yacheykasiz');
  });

  /**
   * 🔴 Egasi, 2026-08-16 (ikkinchi talab): «saytdan hech biriga alohida printer
   * ulanmaydi — kompyuter/monoblokning O'ZIGA ulangan printerdan chiqsin».
   * Ombor→printer marshruti butunlay olib tashlandi, ya'ni bo'linishning
   * yagona sababi ham yo'qoldi: chek DOIM bitta ro'yxat.
   */
  it('omborchi biriktirilgan bo`lsa ham — baribir BITTA varaq', async () => {
    const svc = makeService({
      products: [
        prod('p1', 'Ombor-1-tovar', '01-01-01-01'),
        prod('p2', 'Ombor-2-tovar', '02-01-01-01'),
        prod('p3', 'Yacheykasiz', null),
      ],
      keepers: [{ skladNo: 1, employeeName: 'Omborchi Ali' }],
    });

    const res = await svc.getPickingSheets(ACCOUNT, 'retailsale', SALE_ID);

    expect(res.sheets).toHaveLength(1);
    expect(namesOf(res.sheets[0])).toEqual(['Ombor-1-tovar', 'Ombor-2-tovar', 'Yacheykasiz']);
  });

  it('javobda `printerName` maydoni UMUMAN yo`q (sayt printer tanlamaydi)', async () => {
    const svc = makeService({ products: [prod('p1', 'A', '01-01-01-01')] });

    const res = await svc.getPickingSheets(ACCOUNT, 'retailsale', SALE_ID);

    expect(res.sheets[0]).not.toHaveProperty('printerName');
  });
});
