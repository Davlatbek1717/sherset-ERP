import { describe, expect, it } from 'vitest';
import {
  PIECE_CODE_PREFIX,
  TSD_PRODUCT_SELECT,
  classifyScanCode,
  normalizeScanCode,
  pickExactHits,
} from './tsd-scan.js';

/**
 * TSD skan yadrosi (G-reja G5) — sof qoidalar.
 *
 * Qulflanadigan shartnomalar:
 *   1. **NARX chiqmaydi** — javob ustunlari oq ro'yxatda va narx-nomli kalit yo'q;
 *   2. **multi-hit** — shtrixlar unikal emas, aniq moslik ustun, aks holda TANLOV;
 *   3. **bo'lak kodi ajratiladi** (K-reja 7.3) — `BLK-` tovar qidiruviga tushmaydi.
 */

describe('NARX oq ro`yxati', () => {
  it('javob ustunlarida narx-nomli maydon YO`Q', () => {
    // Egasi: «Ombor xodimlari narx ko'rmaydi; kirim narxi faqat katta omborchiga».
    const keys = Object.keys(TSD_PRODUCT_SELECT);
    expect(keys.filter((k) => /price|cost|margin/i.test(k))).toEqual([]);
  });

  it('oq ro`yxat — QORA ro`yxat emas (yangi narx ustuni o`z-o`zidan kirmaydi)', () => {
    // Har qiymat `true`, ya'ni `select` sanab chiqilgan; `omit`/`exclude` emas.
    expect(Object.values(TSD_PRODUCT_SELECT).every((v) => v === true)).toBe(true);
  });

  it('omborchiga kerak bo`lgan minimum bor', () => {
    expect(TSD_PRODUCT_SELECT).toMatchObject({ id: true, name: true, barcodes: true, uom: true });
  });
});

describe('classifyScanCode', () => {
  it('`BLK-` bo`lak kodi — TOVAR qidiruviga tushmaydi (K-reja 7.3)', () => {
    // Aks holda omborchi bo'lakni skanerlaganda multi-hit tovar tanlovi
    // ochilardi va kesim oqimi buzilardi.
    expect(classifyScanCode(`${PIECE_CODE_PREFIX}000123`)).toBe('piece');
    expect(classifyScanCode('blk-000123')).toBe('piece');
  });

  it('yacheyka kodi — tireli ham, 8 raqamli ham', () => {
    expect(classifyScanCode('01-02-03-04')).toBe('cell');
    expect(classifyScanCode('01020304')).toBe('cell');
    expect(classifyScanCode('2-17-2-15')).toBe('cell');
  });

  it('qolgan hammasi — tovar kodi', () => {
    expect(classifyScanCode('4780123456789')).toBe('product');
    expect(classifyScanCode('ART-77')).toBe('product');
  });
});

describe('normalizeScanCode', () => {
  it('eski QR yorliqdagi `/scan?c=` dan kodni ajratadi', () => {
    expect(normalizeScanCode('https://erp.sherset.uz/scan?c=4780123')).toBe('4780123');
    expect(normalizeScanCode('scan?c=4780123')).toBe('4780123');
  });

  it('oddiy kodga tegmaydi', () => {
    expect(normalizeScanCode('  4780123  ')).toBe('4780123');
  });
});

describe('pickExactHits — multi-hit qoidasi', () => {
  const items = [
    { id: 'a', code: 'A-1', barcodes: ['111'] },
    { id: 'b', code: 'B-2', barcodes: ['111', '222'] },
    { id: 'c', code: 'C-3', barcodes: ['333'] },
  ];

  it('aniq shtrix mosligi bo`lsa faqat o`shalar qoladi', () => {
    expect(pickExactHits(items, '111').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('kod bo`yicha aniq moslik ham ishlaydi', () => {
    expect(pickExactHits(items, 'C-3').map((i) => i.id)).toEqual(['c']);
  });

  it('aniq moslik yo`q — HAMMASI qaytadi, tanlovni ODAM qiladi', () => {
    // Shtrixlar ataylab unikal EMAS (G-reja) — jimgina birinchisini olish
    // noto'g'ri tovarni ko'chirishga olib kelardi.
    expect(pickExactHits(items, 'nomalum').map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('shtrixi yo`q qator yiqilmaydi', () => {
    expect(pickExactHits([{ id: 'x', code: null, barcodes: null }], '111')).toHaveLength(1);
  });
});
