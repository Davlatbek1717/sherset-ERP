import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/app/kassa-kirish/page.tsx'), 'utf8');
const pair = readFileSync(join(process.cwd(), 'src/app/kassa-kirish/juftlash/page.tsx'), 'utf8');

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

  it('qurilma ma`lumoti readPosDevice orqali o`qiladi', () => {
    expect(page).toContain('readPosDevice(');
  });

  it('juftlanmagan holat uchun alohida shox bor', () => {
    expect(page).toContain('not_paired_title');
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
 * Juftlash ekrani — bir martalik admin amali. Kalit FAQAT javobda keladi,
 * shuning uchun darhol saqlanishi shart (aks holda qayta juftlash kerak).
 */
describe('/kassa-kirish/juftlash simlari', () => {
  it('pair endpointi chaqiriladi', () => {
    expect(pair).toContain("'/auth/pos-device/pair'");
  });

  it('javob writePosDevice bilan saqlanadi', () => {
    expect(pair).toContain('writePosDevice(');
  });

  it('do`kon/kassa/tashkilot ro`yxatlari o`qiladi', () => {
    expect(pair).toContain("'/stores'");
    expect(pair).toContain("'/cash-desks'");
    expect(pair).toContain("'/organizations'");
  });

  it('juftlashdan keyin /kassa-kirish ga qaytadi', () => {
    expect(pair).toContain("'/kassa-kirish'");
  });

  it('qurilma kaliti brauzer saqlagichiga QO`LDA yozilmaydi (writePosDevice orqali)', () => {
    expect(pair).not.toMatch(/localStorage\.setItem\(/);
  });
});
