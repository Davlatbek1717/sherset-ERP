import { describe, expect, it } from 'vitest';
import { KECHKI_SMENA_CAPTION, buildCaption } from './broadcast-caption.util.js';

describe('broadcast caption builder', () => {
  it('bold oraliqlar matndagi TO`G`RI substringga mos keladi (offset/length ok)', () => {
    // Har bir bold entity aynan mo'ljallangan matnni qoplashi shart — offset
    // hisobida (emoji surrogat juftlari) xato bo'lsa shu test tutadi.
    const { text, bold } = KECHKI_SMENA_CAPTION;
    const covered = bold.map((b) => text.slice(b.offset, b.offset + b.length));
    expect(covered).toEqual([
      'SHERSETDA KATTA YANGILIK!',
      'Har kuni 19:00 – 23:00',
      'Bizda barchasi bir joyda:',
      'SHERSET KABEL, Uzkabel, AAK',
      'VIKO, Panasonic',
      'Schneider, CHINT, Delixi',
      'Akfa, Lucem',
      'Kechqurun ham sizni Shersetda kutib qolamiz!',
    ]);
  });

  it('matn foydalanuvchi tasdiqlagan holicha (asl «narxlarlarda»)', () => {
    expect(KECHKI_SMENA_CAPTION.text).toContain('Optom narxlarlarda');
    expect(KECHKI_SMENA_CAPTION.text).toContain('+998 91 925 87 00');
    expect(KECHKI_SMENA_CAPTION.text).toContain("G'ijduvon eski pivo zavod");
  });

  it('emoji offset — 🌙 (surrogat juft) dan keyingi bold to`g`ri boshlanadi', () => {
    // '🌙 ' = 2 (surrogat) + 1 (space) = 3 UTF-16 birlik → birinchi bold offset 3.
    expect(KECHKI_SMENA_CAPTION.bold[0]?.offset).toBe(3);
  });

  it('buildCaption bo`sh/oddiy holatlar', () => {
    expect(buildCaption([]).text).toBe('');
    expect(buildCaption([{ t: 'a' }, { t: 'b', b: true }])).toEqual({
      text: 'ab',
      bold: [{ offset: 1, length: 1 }],
    });
  });
});
