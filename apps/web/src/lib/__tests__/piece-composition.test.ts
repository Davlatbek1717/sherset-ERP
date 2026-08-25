import { formatPieceComposition } from '@/lib/piece-composition';
import { describe, expect, it } from 'vitest';

/**
 * K3 — tarkib matni IKKI ekranda bir xil o'qilishi shart: kassaning qator
 * oynasi va tovar kartochkasining «Qoldiqlar» tabi. Shuning uchun formatlash
 * bitta joyda va shu yerda qulflangan.
 *
 * Egasining misoli (K-reja 1-bo'lim): `250+250+250+200+150+70+50` →
 * `250 × 3 · 200 · 150 · 70 · 50` (ekranda `1220` degan yagona son EMAS).
 */

describe('formatPieceComposition', () => {
  it('egasining misoli: butun rulonlar guruhlanadi, bo`laklar alohida', () => {
    const parts = formatPieceComposition(
      {
        wholeGroups: [{ length: '250', count: 3 }],
        pieces: [{ length: '200' }, { length: '150' }, { length: '70' }, { length: '50' }],
      },
      '×',
    );
    expect(parts).toEqual(['250 × 3', '200', '150', '70', '50']);
    expect(parts.join(' · ')).toBe('250 × 3 · 200 · 150 · 70 · 50');
  });

  it('butun rulon yo`q — faqat bo`laklar', () => {
    expect(formatPieceComposition({ wholeGroups: [], pieces: [{ length: '12.5' }] }, '×')).toEqual([
      '12.5',
    ]);
  });

  it('bo`lak yo`q — faqat butun rulonlar', () => {
    expect(
      formatPieceComposition({ wholeGroups: [{ length: '100', count: 2 }], pieces: [] }, '×'),
    ).toEqual(['100 × 2']);
  });

  it('bo`sh tarkib — bo`sh ro`yxat (ekran hech narsa chizmaydi)', () => {
    expect(formatPieceComposition({ wholeGroups: [], pieces: [] }, '×')).toEqual([]);
  });

  it('ko`paytirish belgisi CHAQIRUVCHIDAN (i18n) — kodda qotib qolmaydi', () => {
    expect(
      formatPieceComposition({ wholeGroups: [{ length: '250', count: 3 }], pieces: [] }, 'x'),
    ).toEqual(['250 x 3']);
  });
});
