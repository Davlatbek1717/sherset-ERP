import { describe, expect, it } from 'vitest';
import {
  BARCODE_FLAG,
  BARCODE_OWNER,
  type BarcodeRow,
  DUP_SCOPE,
  buildBarcodeReport,
  gtinCheckDigit,
  normalizeBarcode,
  runBarcodeAudit,
} from './barcode-audit-core.js';

const ACC = '11111111-1111-1111-1111-111111111111';
const ACC2 = '22222222-2222-2222-2222-222222222222';

function row(p: Partial<BarcodeRow> & { raw: string; ownerId: string }): BarcodeRow {
  return {
    accountId: ACC,
    kind: BARCODE_OWNER.product,
    ownerId: p.ownerId,
    productId: p.productId === undefined ? p.ownerId : p.productId,
    name: p.name ?? p.ownerId,
    slot: p.slot ?? 0,
    raw: p.raw,
    ...p,
  };
}

describe('normalizeBarcode', () => {
  it('tashqi probelni kesadi va bayroq qo‘yadi', () => {
    const n = normalizeBarcode('  4780012345670 ');
    expect(n.normalized).toBe('4780012345670');
    expect(n.flags).toContain(BARCODE_FLAG.outerSpace);
    expect(n.blank).toBe(false);
  });

  it('ichki probel/NBSP/zero-width belgilarini olib tashlaydi', () => {
    const n = normalizeBarcode('4780 \u00a00123 45\u200b670');
    expect(n.normalized).toBe('4780012345670');
    expect(n.flags).toContain(BARCODE_FLAG.innerSpace);
    expect(n.flags).toContain(BARCODE_FLAG.control);
  });

  it('registrni yuqoriga keltiradi (harfli custom kodlar)', () => {
    const n = normalizeBarcode('ab-77x');
    expect(n.normalized).toBe('AB-77X');
    expect(n.flags).toContain(BARCODE_FLAG.lowercase);
    expect(n.flags).toContain(BARCODE_FLAG.nonDigit);
  });

  it('EAN-13 yetakchi nolni kanonik shaklda tushiradi (UPC-12 == EAN-13)', () => {
    const upc = normalizeBarcode('012345678905');
    const ean = normalizeBarcode('0012345678905');
    expect(upc.canonical).toBe(ean.canonical);
    expect(upc.canonical).toBe('12345678905');
    expect(ean.flags).toContain(BARCODE_FLAG.leadingZero);
  });

  it("bo'sh/faqat-probel qiymatni blank deb belgilaydi", () => {
    const n = normalizeBarcode('   ');
    expect(n.blank).toBe(true);
    expect(n.flags).toContain(BARCODE_FLAG.blank);
    expect(n.canonical).toBe('');
  });

  it('nazorat-raqamini tekshiradi (EAN-13)', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1);
    expect(normalizeBarcode('4006381333931').checksumOk).toBe(true);
    expect(normalizeBarcode('4006381333932').checksumOk).toBe(false);
    // 8/12/13/14 dan boshqa uzunlik ⇒ GTIN emas, checksum tekshirilmaydi
    expect(normalizeBarcode('12345').checksumOk).toBe(null);
    expect(normalizeBarcode('12345').flags).toContain(BARCODE_FLAG.oddLength);
  });
});

describe('buildBarcodeReport — dublikat tasnifi', () => {
  it("bitta tovar massivi ichidagi takrorni 'self' deb tasniflaydi", () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '4780012345670', slot: 0 }),
      row({ ownerId: 'p1', raw: '4780012345670', slot: 1 }),
    ]);
    expect(r.raw.groups).toBe(1);
    expect(r.raw.byScope[DUP_SCOPE.self]).toBe(1);
    expect(r.raw.byScope[DUP_SCOPE.crossProduct]).toBe(0);
    expect(r.uniqueIndexBlockers).toBe(0);
  });

  it("ikki xil tovarda bir xil kodni 'cross-product' + unique-bloker deb belgilaydi", () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '4780012345670' }),
      row({ ownerId: 'p2', raw: '4780012345670' }),
    ]);
    expect(r.raw.byScope[DUP_SCOPE.crossProduct]).toBe(1);
    expect(r.uniqueIndexBlockers).toBe(1);
    expect(r.samples.crossProduct[0]).toContain('4780012345670');
  });

  it("bir tovarning o'zi + variantini 'intra-product' deydi (POS bir tovarga olib boradi)", () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '4780012345670' }),
      row({
        ownerId: 'v1',
        productId: 'p1',
        kind: BARCODE_OWNER.variant,
        raw: '4780012345670',
      }),
    ]);
    expect(r.raw.byScope[DUP_SCOPE.intraProduct]).toBe(1);
    expect(r.raw.byScope[DUP_SCOPE.crossProduct]).toBe(0);
    expect(r.uniqueIndexBlockers).toBe(0);
  });

  it('boshqa akkauntdagi bir xil kod to‘qnashuv EMAS', () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '4780012345670' }),
      { ...row({ ownerId: 'p2', raw: '4780012345670' }), accountId: ACC2 },
    ]);
    expect(r.raw.groups).toBe(0);
    expect(r.uniqueIndexBlockers).toBe(0);
  });

  it("normalizatsiya YARATADIGAN yangi to'qnashuvni alohida ajratadi", () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '4780 012345670' }),
      row({ ownerId: 'p2', raw: '4780012345670' }),
    ]);
    // Xom qiymatlar boshqa ⇒ hozir to'qnashuv yo'q
    expect(r.raw.groups).toBe(0);
    // Normalizatsiyadan keyin bitta kross-mahsulot guruhi paydo bo'ladi
    expect(r.normalized.byScope[DUP_SCOPE.crossProduct]).toBe(1);
    expect(r.normalizedOnlyGroups).toBe(1);
  });

  it("yetakchi-nol kanonizatsiyasi qo'shimcha to'qnashuv ochadi", () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '012345678905' }),
      row({ ownerId: 'p2', raw: '0012345678905' }),
    ]);
    expect(r.normalized.groups).toBe(0);
    expect(r.canonical.byScope[DUP_SCOPE.crossProduct]).toBe(1);
    expect(r.canonicalOnlyGroups).toBe(1);
  });

  it("bo'sh qiymatlar dublikat sifatida sanalmaydi (alohida hisoblanadi)", () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: '  ' }),
      row({ ownerId: 'p2', raw: '' }),
    ]);
    expect(r.blank).toBe(2);
    expect(r.raw.groups).toBe(0);
    expect(r.canonical.groups).toBe(0);
  });

  it('bayroqlarni jamlaydi', () => {
    const r = buildBarcodeReport([
      row({ ownerId: 'p1', raw: ' 4780012345670' }),
      row({ ownerId: 'p2', raw: 'ab-1' }),
    ]);
    expect(r.scannedRows).toBe(2);
    expect(r.byFlag[BARCODE_FLAG.outerSpace]).toBe(1);
    expect(r.byFlag[BARCODE_FLAG.lowercase]).toBe(1);
  });
});

/**
 * FAQAT-O'QISH QULFI. Skript prod ma'lumotiga tegmasligi kerak — bu testda
 * prisma o'rniga Proxy qo'yiladi: `findMany` dan boshqa HAR QANDAY metodga
 * murojaat (create/update/delete/upsert/$executeRaw/$transaction…) darhol
 * xatoga olib keladi, ya'ni yozuv yo'li qo'shilsa test qizil bo'ladi.
 */
describe('runBarcodeAudit — faqat o‘qish', () => {
  function readOnlyPrisma(data: Record<string, unknown[]>) {
    const calls: string[] = [];
    const delegate = (model: string) =>
      new Proxy(
        {},
        {
          get(_t, method: string) {
            if (method === 'findMany') {
              return (_args?: unknown) => {
                calls.push(`${model}.findMany`);
                return Promise.resolve(data[model] ?? []);
              };
            }
            if (method === 'then') return undefined; // await-probe
            throw new Error(`YOZUV/NOMA'LUM METOD: ${model}.${String(method)}`);
          },
        },
      );
    const client = new Proxy(
      {},
      {
        get(_t, model: string) {
          if (model === 'then') return undefined;
          if (typeof model !== 'string') throw new Error('symbol access');
          if (model.startsWith('$')) throw new Error(`TAQIQ: prisma.${model}`);
          return delegate(model);
        },
      },
    );
    return { client, calls };
  }

  it('faqat findMany chaqiradi va hisobot qaytaradi', async () => {
    const { client, calls } = readOnlyPrisma({
      product: [{ id: 'p1', accountId: ACC, name: 'A', barcodes: ['4780012345670'] }],
      variant: [
        {
          id: 'v1',
          accountId: ACC,
          productId: 'p9',
          name: 'B',
          barcode: '4780012345670',
          barcodes: [],
        },
      ],
      productPack: [],
      consignment: [],
    });
    const report = await runBarcodeAudit(client as never);
    expect(calls.sort()).toEqual([
      'consignment.findMany',
      'product.findMany',
      'productPack.findMany',
      'variant.findMany',
    ]);
    expect(report.scannedRows).toBe(2);
    expect(report.uniqueIndexBlockers).toBe(1);
  });

  it('yozuv metodiga murojaat qilsa halok bo‘ladi (qulfning o‘zi ishlaydi)', () => {
    const { client } = readOnlyPrisma({});
    expect(() => (client as Record<string, Record<string, unknown>>).product.updateMany).toThrow(
      /YOZUV/,
    );
  });
});
