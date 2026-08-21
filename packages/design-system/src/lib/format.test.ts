/**
 * format.ts moysklad-parity tests — verify the date and money output
 * matches the exact strings moysklad.uz emits across detail-page
 * headers, list-page rows, and audit timeline entries.
 */
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateOnly,
  formatMoney,
  groupMajorDraft,
  majorToMinorInput,
  minorToMajorInput,
} from './format';

const NB = ' ';

describe('formatDate', () => {
  it('renders DD.MM.YYYY HH:MM with a SPACE separator (moysklad parity, no comma)', () => {
    // moysklad shows "04.06.2025 09:39" — the ru-RU `toLocaleString`
    // would emit "04.06.2025, 09:39" with a comma. Our implementation
    // strips the comma so every header / row / timeline entry matches.
    // We assert the SHAPE here (not the literal hours) because the
    // formatter renders in the host's local timezone — the test env
    // could be UTC, Asia/Tashkent, etc.
    const out = formatDate('2025-06-04T09:39:00.000Z');
    expect(out).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(out).not.toContain(', ');
  });

  it('returns "—" for null/undefined/empty input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('returns "—" for invalid date strings', () => {
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate('2025-13-99')).toBe('—');
  });

  it('accepts a Date object as input', () => {
    const d = new Date('2026-04-20T16:49:00.000Z');
    const out = formatDate(d);
    expect(out).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(out).not.toContain(', ');
  });

  it('omits the comma even when locale would emit one (regression guard)', () => {
    // ru-RU locale's `toLocaleString` with day+month+year+hour+minute
    // emits "DD.MM.YYYY, HH:MM". Verify our SPACE-replace keeps the
    // moysklad parity. If a future change loses the .replace(', ', ' ')
    // call this test will catch it.
    const out = formatDate('2025-06-04T09:39:00.000Z');
    const commaCount = (out.match(/,/g) ?? []).length;
    expect(commaCount).toBe(0);
  });
});

describe('formatDateOnly', () => {
  it('renders DD.MM.YYYY without time', () => {
    expect(formatDateOnly('2025-06-04T09:39:00.000Z')).toBe('04.06.2025');
  });

  it('returns "—" for null', () => {
    expect(formatDateOnly(null)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('renders thin-space thousand separators + comma decimal (ru-RU)', () => {
    // moysklad parity — "64 000,00 сум" with non-breaking thin space.
    const out = formatMoney('6400000');
    expect(out).toContain(',00');
    expect(out).toContain('сум');
  });

  it('omits the currency suffix when displayAs="none"', () => {
    expect(formatMoney('6400000', 'UZS', { displayAs: 'none' })).not.toContain('сум');
    expect(formatMoney('6400000', 'UZS', { displayAs: 'none' })).toContain(',00');
  });

  it('uses ISO code when displayAs="iso"', () => {
    expect(formatMoney('1000', 'USD', { displayAs: 'iso' })).toContain('USD');
  });

  it('renders negative values with a minus sign', () => {
    expect(formatMoney('-100')).toMatch(/^-/);
  });

  it('returns "—" for null/undefined', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });
});

describe('minorToMajorInput (tiyin → editable som)', () => {
  it('whole amounts drop the decimals', () => {
    expect(minorToMajorInput('30000000')).toBe('300000');
    expect(minorToMajorInput('100')).toBe('1');
    expect(minorToMajorInput('500000000')).toBe('5000000');
  });
  it('fractional amounts keep significant decimals only', () => {
    expect(minorToMajorInput('30000050')).toBe('300000.5');
    expect(minorToMajorInput('15050')).toBe('150.5');
    expect(minorToMajorInput('50')).toBe('0.5');
    expect(minorToMajorInput('10')).toBe('0.1');
    expect(minorToMajorInput('1')).toBe('0.01');
    expect(minorToMajorInput('305')).toBe('3.05');
  });
  it('empty / null / undefined stays empty (not "0")', () => {
    expect(minorToMajorInput('')).toBe('');
    expect(minorToMajorInput(null)).toBe('');
    expect(minorToMajorInput(undefined)).toBe('');
  });
  it('zero renders as 0', () => {
    expect(minorToMajorInput('0')).toBe('0');
  });
  it('negative is preserved', () => {
    expect(minorToMajorInput('-30000000')).toBe('-300000');
    expect(minorToMajorInput('-50')).toBe('-0.5');
  });
});

describe('majorToMinorInput (typed som → tiyin)', () => {
  it('whole and decimal som', () => {
    expect(majorToMinorInput('300000')).toBe('30000000');
    expect(majorToMinorInput('300000.5')).toBe('30000050');
    expect(majorToMinorInput('1')).toBe('100');
    expect(majorToMinorInput('0.01')).toBe('1');
  });
  it('accepts comma decimal and space grouping (UZ/RU formats)', () => {
    expect(majorToMinorInput('300000,50')).toBe('30000050');
    expect(majorToMinorInput('300 000,50')).toBe('30000050');
    expect(majorToMinorInput('300 000.5')).toBe('30000050');
  });
  it('invalid / empty / negative → "0" (save-time validation rejects)', () => {
    expect(majorToMinorInput('')).toBe('0');
    expect(majorToMinorInput('   ')).toBe('0');
    expect(majorToMinorInput('-5')).toBe('0');
    expect(majorToMinorInput('abc')).toBe('0');
    expect(majorToMinorInput('.')).toBe('0');
    expect(majorToMinorInput(null)).toBe('0');
    expect(majorToMinorInput(undefined)).toBe('0');
  });
  it('round-trips with minorToMajorInput', () => {
    for (const minor of ['30000000', '15050', '100', '1', '999999', '0']) {
      expect(majorToMinorInput(minorToMajorInput(minor))).toBe(minor === '0' ? '0' : minor);
    }
  });
});

describe('groupMajorDraft (live money-input formatting)', () => {
  it('groups the integer part with thin spaces', () => {
    expect(groupMajorDraft('9990')).toBe(`9${NB}990`);
    expect(groupMajorDraft('1234567')).toBe(`1${NB}234${NB}567`);
    expect(groupMajorDraft('100')).toBe('100');
    expect(groupMajorDraft('12')).toBe('12');
  });
  it('keeps the comma decimal as typed (max 2 places)', () => {
    expect(groupMajorDraft('9990,5')).toBe(`9${NB}990,5`);
    expect(groupMajorDraft('9990,50')).toBe(`9${NB}990,50`);
    expect(groupMajorDraft('9990,567')).toBe(`9${NB}990,56`); // trims to 2 dp
    expect(groupMajorDraft('9990,')).toBe(`9${NB}990,`); // in-progress comma
  });
  it('normalises a dot to a comma + strips existing grouping spaces', () => {
    expect(groupMajorDraft('9990.5')).toBe(`9${NB}990,5`);
    expect(groupMajorDraft(`9${NB}990,00`)).toBe(`9${NB}990,00`);
    expect(groupMajorDraft('9 990')).toBe(`9${NB}990`);
  });
  it('trims leading zeros + handles empty / bare comma', () => {
    expect(groupMajorDraft('007')).toBe('7');
    expect(groupMajorDraft('')).toBe('');
    expect(groupMajorDraft(',5')).toBe('0,5');
    expect(groupMajorDraft(null)).toBe('');
  });
  it('survives a round-trip through majorToMinorInput', () => {
    expect(majorToMinorInput(groupMajorDraft('1234567,89'))).toBe('123456789');
  });
});

describe('pul kiritish — ekran va QIYMAT bir manbadan (2026-08-21)', () => {
  /**
   * 🔴 Egasi: «(. va ,) dan keyin nechi tiyin bo'lishini yozish umuman
   * ishlamayapti». O'lchanganda ikki alohida nuqson chiqdi:
   *
   * 1. `MoneyInput` ekranga `groupMajorDraft(raw)` ni, qiymatga esa
   *    `majorToMinorInput(raw)` ni berardi — IKKI XIL manba. Ular ajralib
   *    ketardi va ekran YOLG'ON gapirardi.
   * 2. `majorToMinorInput` da `.replace(',', '.')` faqat BIRINCHI vergulni
   *    almashtirardi; ikkinchisi qolib `Number(...)` NaN berardi ⇒ jimgina '0'.
   *
   * Maydon dam olish holatida «1 000,00» ko'rsatadi — ya'ni ikkita tiyin
   * raqami ALLAQACHON bor. Foydalanuvchi oxiriga bosib yozganda:
   *   «1 000,00,»  → ekran «1 000,00», qiymat 0        (pul YO'QOLARDI)
   *   «1 000,005»  → ekran «1 000,00», qiymat 100001   (ekran boshqa, hujjat boshqa)
   *
   * Shartnoma: ekrandagi matn va yuboriladigan tiyin BIR XIL tozalashdan
   * o'tadi — qanday yozilmasin, ko'rinayotgan raqam saqlanadigan raqam.
   */
  const holatlar: Array<[string, string]> = [
    ['1 000,00,', '100000'],
    ['1 000,005', '100000'],
    ['1 000,00.', '100000'],
    // Ikkinchi vergulda tahlil TO'XTAYDI — ekran ham «1 000,0» ko'rsatadi,
    // ya'ni qiymat ekranga MOS (asosiy shartnoma shu).
    ['1 000,0,5', '100000'],
    ['0,00.5', '0'],
  ];

  it('ortiqcha ajratgich/raqam qiymatni BUZMAYDI', () => {
    for (const [yozilgan, kutilgan] of holatlar) {
      expect(majorToMinorInput(yozilgan), yozilgan).toBe(kutilgan);
    }
  });

  it('ekrandagi matn aynan o‘sha tiyinni beradi (ajralish yo‘q)', () => {
    for (const [yozilgan] of holatlar) {
      const ekran = groupMajorDraft(yozilgan);
      expect(majorToMinorInput(ekran), `${yozilgan} -> ${ekran}`).toBe(majorToMinorInput(yozilgan));
    }
  });

  it('katta summada suzuvchi nuqta xatosi yo‘q', () => {
    // Math.round(n * 100) 2^53 dan katta summalarda adashadi; satr bilan hisob aniq.
    expect(majorToMinorInput('99999999999999,99')).toBe('9999999999999999');
  });
});
