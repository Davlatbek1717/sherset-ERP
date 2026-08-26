import { describe, expect, it } from 'vitest';
import {
  buildEntryFromRegistry,
  entryMatchesQuantity,
  isPieceLabel,
  parsePieceEntry,
} from '../piece-entry';

/**
 * K5 — klient parseri SERVER yadrosi bilan bir xil o'qishi shart.
 *
 * 🔴 Bu fayl **sinxronlik qulfi**: pastdagi misollar
 * `apps/api/src/modules/stock-piece/piece-intake-core.test.ts` dagi AYNI
 * misollar (aynan o'sha matnlar, aynan o'sha kutilgan yig'indilar). Ikki
 * nusxa jimgina ajralib ketsa ekran «jami 1220» deb turib, server 400
 * qaytarardi — omborchi nima noto'g'ri ekanini bilmasdi.
 */

describe('K5 klient parseri — server bilan AYNI misollar', () => {
  it('butun rulon guruhi: «250x3» = 750', () => {
    const p = parsePieceEntry('250x3');
    expect(p.total).toBe('750');
    expect(p.pieceCount).toBe(3);
    expect(p.badGroup).toBeNull();
  });

  it('egasining misoli: «250x3+200+150+70+50» = 1220 (K1/K2 hisobotlaridagi son)', () => {
    expect(parsePieceEntry('250x3+200+150+70+50').total).toBe('1220');
  });

  it('aralash: «250x3+BLK-000041:200+?:150» = 1100', () => {
    const p = parsePieceEntry('250x3+BLK-000041:200+?:150');
    expect(p.total).toBe('1100');
    expect(p.pieceCount).toBe(5);
    expect(p.groups).toEqual([
      { kind: 'whole', length: '250', count: 3, label: null },
      { kind: 'piece', length: '200', count: 1, label: 'BLK-000041' },
      { kind: 'piece', length: '150', count: 1, label: null },
    ]);
  });

  it('🔴 vergul nuqtaga o`giriladi (uz/ru klaviaturasi)', () => {
    expect(parsePieceEntry('250,5').total).toBe('250.5');
    expect(parsePieceEntry('?:12,25').total).toBe('12.25');
  });

  it('`×` va `*` belgilari, bo`shliqlar', () => {
    expect(parsePieceEntry(' 250 × 3 + ?: 150 ').total).toBe('900');
    expect(parsePieceEntry('250*2').total).toBe('500');
  });

  it('yorliq katta-kichik harf farqsiz', () => {
    expect(parsePieceEntry('blk-000041:200').groups[0]?.label).toBe('BLK-000041');
  });

  it('yaroqsiz guruh RAQAMI bilan belgilanadi (jim tashlanmaydi)', () => {
    expect(parsePieceEntry('250+abc+70').badGroup).toBe(2);
    expect(parsePieceEntry('4780123456789:200').badGroup).toBe(1);
    expect(parsePieceEntry('250x2.5').badGroup).toBe(1);
  });

  it('kasrsiz yig`indi float xatosisiz', () => {
    // 0.1 + 0.2 → JS float da 0.30000000000000004 bo'lardi.
    expect(parsePieceEntry('?:0.1+?:0.2').total).toBe('0.3');
  });

  it('yorliq makoni serverdagi bilan AYNI regex', () => {
    expect(isPieceLabel('BLK-000041')).toBe(true);
    expect(isPieceLabel('blk-000041')).toBe(true);
    expect(isPieceLabel('BLK-41')).toBe(false);
    expect(isPieceLabel('4780123456789')).toBe(false);
  });
});

describe('K5 — miqdor bilan mosligi', () => {
  it('teng / teng emas', () => {
    expect(entryMatchesQuantity('1220', '1220')).toBe(true);
    expect(entryMatchesQuantity('1220', '1220.000000')).toBe(true);
    expect(entryMatchesQuantity('1220', '1250')).toBe(false);
  });

  it('yaroqsiz miqdor — mos EMAS (jimgina «to`g`ri» demaydi)', () => {
    expect(entryMatchesQuantity('100', '')).toBe(false);
    expect(entryMatchesQuantity('100', 'abc')).toBe(false);
  });
});

describe('K5 — reyestrdan kanonik matn', () => {
  it('butun rulonlar guruhlanadi, bo`laklar yorlig`i bilan chiqadi', () => {
    const entry = buildEntryFromRegistry([
      { length: '250', whole: true, label: null },
      { length: '250', whole: true, label: null },
      { length: '250', whole: true, label: null },
      { length: '200', whole: false, label: 'BLK-000041' },
      { length: '150', whole: false, label: 'BLK-000042' },
    ]);
    expect(entry).toBe('250x3+BLK-000041:200+BLK-000042:150');
    // Aylanish barqaror: chiqqan matn qayta o'qilganda AYNI yig'indi.
    expect(parsePieceEntry(entry).total).toBe('1100');
  });

  it('bitta rulon `x1` siz', () => {
    expect(buildEntryFromRegistry([{ length: '250', whole: true, label: null }])).toBe('250');
  });

  it('yorliqsiz bo`lak `?` bilan chiqadi (K1 dan qolgan buzuq qator)', () => {
    expect(buildEntryFromRegistry([{ length: '70', whole: false, label: null }])).toBe('?:70');
  });

  it('bo`sh reyestr — bo`sh matn', () => {
    expect(buildEntryFromRegistry([])).toBe('');
  });
});
