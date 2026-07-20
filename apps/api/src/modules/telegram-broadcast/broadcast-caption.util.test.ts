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

  it('blockquote oraliqlar TO`G`RI bloklarni qoplaydi (sarlavha + ro`yxat)', () => {
    const { text, quote } = KECHKI_SMENA_CAPTION;
    expect(quote).toHaveLength(2);
    const q1 = text.slice(quote[0]!.offset, quote[0]!.offset + quote[0]!.length);
    const q2 = text.slice(quote[1]!.offset, quote[1]!.offset + quote[1]!.length);
    // Quti 1 — sarlavha (emoji bilan). Quti 2 — 5 qatorli checkmark ro'yxati.
    expect(q1).toBe('🌙 SHERSETDA KATTA YANGILIK!');
    expect(q2.startsWith('☑️ Kabel va simlar — SHERSET KABEL, Uzkabel, AAK')).toBe(true);
    expect(q2.endsWith('☑️ Metiz va elektromontaj mollari')).toBe(true);
    // Ro'yxat qutisi barcha 5 qatorni o'z ichiga oladi.
    for (const line of ['Rozetka', 'Avtomatlar', 'Lyustra', 'Metiz']) {
      expect(q2).toContain(line);
    }
    // Quti «💡 Barcha turdagi»gacha CHO'ZILMAYDI (ro'yxatdan keyingi matn tashqarida).
    expect(q2).not.toContain('Barcha turdagi');
  });

  it('buildCaption bo`sh/oddiy holatlar', () => {
    expect(buildCaption([]).text).toBe('');
    expect(buildCaption([{ t: 'a' }, { t: 'b', b: true }])).toEqual({
      text: 'ab',
      bold: [{ offset: 1, length: 1 }],
      quote: [],
    });
  });

  it('buildCaption — qo`shni q-guruh segmentlari bitta blockquote`ga birlashadi', () => {
    const r = buildCaption([{ t: 'x' }, { t: 'A', q: 1 }, { t: 'B', b: true, q: 1 }, { t: 'y' }]);
    expect(r.text).toBe('xABy');
    expect(r.quote).toEqual([{ offset: 1, length: 2 }]); // "AB"
    expect(r.bold).toEqual([{ offset: 2, length: 1 }]); // "B"
  });
});
