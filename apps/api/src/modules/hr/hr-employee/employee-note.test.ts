import { describe, expect, it } from 'vitest';
import {
  NOTE_KIND,
  type NoteRow,
  WARNING_PATTERN_COUNT,
  WARNING_WINDOW_DAYS,
  isNoteKind,
  isValidNoteText,
  summarizeNotes,
} from './employee-note.js';

const NOW = new Date(2026, 7, 6);
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * 86_400_000);

const note = (kind: string, days: number, voided = false): NoteRow => ({
  kind,
  createdAt: daysAgo(days),
  voidedAt: voided ? daysAgo(days - 1) : null,
});

describe('isNoteKind', () => {
  it('uch tur qabul qilinadi', () => {
    expect(isNoteKind(NOTE_KIND.talk)).toBe(true);
    expect(isNoteKind(NOTE_KIND.warning)).toBe(true);
    expect(isNoteKind(NOTE_KIND.praise)).toBe(true);
  });

  it('noma`lum tur rad etiladi', () => {
    expect(isNoteKind('jarima')).toBe(false);
    expect(isNoteKind('')).toBe(false);
  });
});

describe('isValidNoteText', () => {
  it('matn bo`lsa qabul', () => {
    expect(isValidNoteText('Kechikish haqida gaplashildi')).toBe(true);
  });

  it('bo`sh yoki probelli matn RAD', () => {
    // «Ogohlantirildi» degan sababsiz yozuvni uch oydan keyin na menejer,
    // na xodim tushuntira oladi.
    expect(isValidNoteText('')).toBe(false);
    expect(isValidNoteText('   ')).toBe(false);
    expect(isValidNoteText(null)).toBe(false);
    expect(isValidNoteText(42)).toBe(false);
  });
});

describe('summarizeNotes — turlar bo`yicha', () => {
  it('har tur alohida sanaladi', () => {
    const s = summarizeNotes(
      [
        note(NOTE_KIND.talk, 1),
        note(NOTE_KIND.warning, 2),
        note(NOTE_KIND.warning, 3),
        note(NOTE_KIND.praise, 4),
      ],
      NOW,
    );
    expect(s.talkCount).toBe(1);
    expect(s.warningCount).toBe(2);
    expect(s.praiseCount).toBe(1);
    expect(s.total).toBe(4);
  });

  it('oxirgi yozuv sanasi', () => {
    const s = summarizeNotes([note(NOTE_KIND.talk, 10), note(NOTE_KIND.talk, 2)], NOW);
    expect(s.lastAt).toEqual(daysAgo(2));
  });

  it('bo`sh jurnalda hammasi nol', () => {
    const s = summarizeNotes([], NOW);
    expect(s.total).toBe(0);
    expect(s.lastAt).toBeNull();
    expect(s.hasWarningPattern).toBe(false);
  });
});

describe('summarizeNotes — bekor qilingan yozuv', () => {
  it('bekor qilingan yozuv JAMIGA ham kirmaydi', () => {
    // Tarixda ko'rinadi, lekin «nechta ogohlantirish bor» savoliga javob
    // bermaydi — aks holda xato yozuv abadiy xodimga qarshi turardi.
    const s = summarizeNotes([note(NOTE_KIND.warning, 2), note(NOTE_KIND.warning, 3, true)], NOW);
    expect(s.warningCount).toBe(1);
    expect(s.total).toBe(1);
  });

  it('hammasi bekor qilingan bo`lsa jurnal bo`sh hisoblanadi', () => {
    const s = summarizeNotes([note(NOTE_KIND.warning, 1, true)], NOW);
    expect(s.total).toBe(0);
    expect(s.activeWarnings).toBe(0);
  });
});

describe('summarizeNotes — 90 kunlik oyna va naqsh', () => {
  it('oyna ICHIDAGI ogohlantirishlar kuchda', () => {
    const s = summarizeNotes([note(NOTE_KIND.warning, 30), note(NOTE_KIND.warning, 60)], NOW);
    expect(s.activeWarnings).toBe(2);
  });

  it('oynadan TASHQARIDAGI ogohlantirish kuchdan chiqadi', () => {
    // Bir yil oldingi ogohlantirish bugungi qarorga asos bo'la olmaydi,
    // lekin tarixda qoladi (`warningCount`).
    const s = summarizeNotes([note(NOTE_KIND.warning, 200)], NOW);
    expect(s.warningCount).toBe(1);
    expect(s.activeWarnings).toBe(0);
  });

  it('aynan 90 kunlik yozuv HALI kuchda (chegara ichkarida)', () => {
    const s = summarizeNotes([note(NOTE_KIND.warning, 90)], NOW);
    expect(s.activeWarnings).toBe(1);
  });

  it('3 ta kuchdagi ogohlantirish — NAQSH', () => {
    // Bittasi hodisa, ikkitasi tasodif bo'lishi mumkin, uchtasi — uch oy
    // ichida takrorlanish.
    const s = summarizeNotes(
      [note(NOTE_KIND.warning, 5), note(NOTE_KIND.warning, 20), note(NOTE_KIND.warning, 50)],
      NOW,
    );
    expect(s.activeWarnings).toBe(WARNING_PATTERN_COUNT);
    expect(s.hasWarningPattern).toBe(true);
  });

  it('2 ta ogohlantirish hali naqsh EMAS', () => {
    const s = summarizeNotes([note(NOTE_KIND.warning, 5), note(NOTE_KIND.warning, 20)], NOW);
    expect(s.hasWarningPattern).toBe(false);
  });

  it('eski ogohlantirishlar naqsh HOSIL QILMAYDI', () => {
    const s = summarizeNotes(
      [note(NOTE_KIND.warning, 200), note(NOTE_KIND.warning, 300), note(NOTE_KIND.warning, 400)],
      NOW,
    );
    expect(s.warningCount).toBe(3);
    expect(s.hasWarningPattern).toBe(false);
  });

  it('bekor qilingan ogohlantirish naqshga hissa QO`SHMAYDI', () => {
    const s = summarizeNotes(
      [note(NOTE_KIND.warning, 5), note(NOTE_KIND.warning, 20), note(NOTE_KIND.warning, 30, true)],
      NOW,
    );
    expect(s.activeWarnings).toBe(2);
    expect(s.hasWarningPattern).toBe(false);
  });

  it('suhbat va maqtov naqshga ta`sir qilmaydi', () => {
    const s = summarizeNotes(
      [note(NOTE_KIND.talk, 1), note(NOTE_KIND.talk, 2), note(NOTE_KIND.praise, 3)],
      NOW,
    );
    expect(s.activeWarnings).toBe(0);
    expect(s.hasWarningPattern).toBe(false);
  });
});

/**
 * MK04 — ekran matni («so'nggi 90 kunda 3 ta») qoida bilan BIR manbadan.
 *
 * FE o'z konstantasidan yozsa, chegara shu yerda o'zgarganda ekran jimgina
 * eski raqamni ko'rsatib turardi — foydalanuvchi uchun bu jim yolg'on.
 */
describe('summarizeNotes — oyna/chegara javobda ochiq', () => {
  it('windowDays va patternCount qoida bilan bir xil', () => {
    const s = summarizeNotes([], new Date('2026-08-09T00:00:00Z'));
    expect(s.windowDays).toBe(WARNING_WINDOW_DAYS);
    expect(s.patternCount).toBe(WARNING_PATTERN_COUNT);
  });
});
