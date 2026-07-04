import { describe, expect, it } from 'vitest';
import {
  extractMsId,
  mapBarcodes,
  mapCounterparty,
  priceToMinor,
} from './moysklad-sync.service.js';

describe('moysklad-sync mappers', () => {
  it('extractMsId pulls the uuid out of a remap href', () => {
    expect(
      extractMsId(
        'https://api.moysklad.ru/api/remap/1.2/entity/productfolder/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ),
    ).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(extractMsId(undefined)).toBeNull();
    expect(extractMsId('no-uuid-here')).toBeNull();
  });

  it('priceToMinor keeps remap minor units 1:1 (no ×100 — the seed-real bug class)', () => {
    expect(priceToMinor(3528000)).toBe(3528000n);
    expect(priceToMinor(3528000.4)).toBe(3528000n);
    expect(priceToMinor(0)).toBe(0n);
    expect(priceToMinor(null)).toBeNull();
    expect(priceToMinor(undefined)).toBeNull();
  });

  it('mapCounterparty truncates to column widths and defaults companyType', () => {
    const long = 'x'.repeat(300);
    const m = mapCounterparty({
      id: 'id',
      name: long,
      phone: '+998 94 006 44 34, +998 91 419 94 99',
      email: null,
      legalTitle: null,
      actualAddress: null,
      companyType: null,
      description: null,
      code: null,
      archived: undefined,
    });
    expect(m.name).toHaveLength(255);
    expect(m.phone).toHaveLength(20); // VarChar(20) — seed-real overflow class
    expect(m.companyType).toBe('legalUZ');
    expect(m.archived).toBe(false);
  });

  it('mapBarcodes keeps values/types index-aligned and skips malformed entries', () => {
    expect(
      mapBarcodes([
        { ean13: '4600000000017' },
        { code128: 'ABC-128' },
        {}, // malformed — no entries
        { ean8: '' }, // malformed — empty value
      ]),
    ).toEqual({
      barcodes: ['4600000000017', 'ABC-128'],
      barcodeTypes: ['ean13', 'code128'],
    });
    expect(mapBarcodes(undefined)).toEqual({ barcodes: [], barcodeTypes: [] });
  });

  it('mapCounterparty passes real fields through', () => {
    const m = mapCounterparty({
      id: '005bd4f8',
      name: 'Feruz izolchi',
      phone: '+998940064434',
      email: 'a@b.uz',
      legalTitle: 'OOO Feruz',
      actualAddress: 'Toshkent',
      companyType: 'legalUZ',
      description: 'desc',
      code: 'C-1',
      archived: false,
    });
    expect(m).toEqual({
      name: 'Feruz izolchi',
      legalTitle: 'OOO Feruz',
      actualAddress: 'Toshkent',
      companyType: 'legalUZ',
      email: 'a@b.uz',
      phone: '+998940064434',
      description: 'desc',
      code: 'C-1',
      archived: false,
    });
  });
});
