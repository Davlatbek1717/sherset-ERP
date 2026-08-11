import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/app/kassa-kirish/page.tsx'), 'utf8');

/**
 * Sahifa simlari qo'riqchisi. Komponent testlari PinKeypad'ni tekshiradi,
 * lekin sahifa uni HAQIQATAN posLogin'ga ulaganini ko'rmaydi — xotira:
 * «DocumentEditor prop-drop: typecheck'dan jim o'tadi, render'ga yetmaydi».
 */
describe('/kassa-kirish simlari', () => {
  it('PinKeypad ishlatiladi', () => {
    expect(page).toContain('<PinKeypad');
  });

  it('posLogin chaqiriladi (login emas)', () => {
    expect(page).toContain('posLogin(');
  });

  it('qurilma ma`lumoti readPosDevice orqali o`qiladi (eski o`rnatmalar uchun)', () => {
    expect(page).toContain('readPosDevice(');
  });

  /**
   * 🔴 2026-08-11 — SHARTNOMA TESKARISIGA O'ZGARDI.
   *
   * Ilgari bu yerda «juftlanmagan» shoxi TALAB qilinardi. Egasi qurilma
   * juftlashni butunlay olib tashlashni buyurdi («faqat pinkod chiqadi,
   * tamom»), shuning uchun endi teskarisi qulflanadi: PIN klaviaturasi
   * HAR DOIM ko'rinadi, hech qanday shartli shox yo'q.
   *
   * Nega test o'chirilmadi: shox jimgina qaytib kelsa (masalan eski kodni
   * nusxalashda) kassir yana «juftlanmagan» devoriga urilardi.
   */
  it('juftlanmagan shoxi YO`Q — PIN har doim ko`rinadi', () => {
    expect(page).not.toContain('not_paired_title');
    expect(page).not.toContain('pair_link');
    expect(page).not.toContain('admin_login');
    // PinKeypad shartli render ichida turmasin.
    expect(page).not.toMatch(/device\s*\?[\s\S]{0,200}<PinKeypad/);
  });

  it('juftlash sahifasi umuman mavjud EMAS', () => {
    expect(existsSync(join(process.cwd(), 'src/app/kassa-kirish/juftlash/page.tsx'))).toBe(false);
  });

  it('muvaffaqiyatdan keyin /sotuv ga yo`naltiriladi', () => {
    expect(page).toContain("'/sotuv'");
  });

  it('PIN qiymati brauzer saqlagichiga YOZILMAYDI', () => {
    // PIN hech qachon localStorage/sessionStorage'ga tushmasin.
    expect(page).not.toMatch(/(local|session)Storage\.setItem\([^)]*pin/i);
  });

  it('xatodan keyin PIN maydoni tozalanadi', () => {
    // Kassir noto'g'ri raqamni qidirib o'tirmasin — qabul mezoni 4-qadam.
    expect(page).toMatch(/setPin\(''\)/);
  });
});

/**
 * Qurilmasiz kirish shartnomasi (`auth-store.posLogin`).
 *
 * Kalit bo'lsa YUBORILADI (eski juftlangan kassalar buzilmasin), bo'lmasa
 * faqat PIN ketadi. Ikkinchisi tushib qolsa yangi o'rnatmalar 400 olardi.
 */
describe('posLogin — qurilma ixtiyoriy', () => {
  const store = readFileSync(join(process.cwd(), 'src/lib/auth-store.ts'), 'utf8');

  it('creds null bo`lishi mumkin', () => {
    expect(store).toMatch(/creds:\s*\{[^}]*\}\s*\|\s*null/);
  });

  it('kalitsiz holatda faqat pin yuboriladi', () => {
    expect(store).toMatch(/creds\s*\?[\s\S]{0,160}:\s*\{\s*pin\s*\}/);
  });
});
