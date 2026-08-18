/**
 * 🔴 XODIM ROLSIZ YARATILMASIN (egasi, 2026-08-18: «rol tanlagan bo'lsam ham
 * tanlanmadi deyapti»).
 *
 * O'LCHANGAN HODISA (prod nginx logi, 18/Aug): bir kunda **4 ta**
 * `POST /hr/employees → 201`, va `PUT /roles/employee/:id` **BIRORTA HAM**
 * yo'q. Bazada o'sha to'rt xodim ROLSIZ qoldi (Bahodir, Muxriddin, Sardor,
 * Otabek) va kartada «Rollar tanlanmagan» chiqdi.
 *
 * Sabab: `roleChoice` sukut bo'yicha `'user'` (radio tanlangan KO'RINADI),
 * `selectedRoleId` esa `null` edi — foydalanuvchi radio'ni qayta bosmasa
 * `onChange` ishlamaydi va rol ID topilmaydi. Saqlash bloki esa
 * `if (targetRoleId && changed)` bilan JIMGINA o'tib ketardi.
 *
 * Rolsiz kassir smena ocholmaydi (403) — ya'ni xato kassa ekranida, bir necha
 * qadam va bir necha soat keyin ko'rinardi.
 *
 * QULFLANADIGAN SHARTNOMA (manba matni bo'yicha — komponent butun sahifa
 * kontekstini talab qiladi, bu esa qo'riqchining o'zi emas):
 *   1. rolsiz holat VALIDATSIYADA tutiladi (`errs.role`);
 *   2. saqlash yo'lida jim `if (targetRoleId && ...)` shoxi YO'Q — rol
 *      topilmasa OSHKORA xato otiladi;
 *   3. xato foydalanuvchiga KO'RSATILADI (`employee-role-error`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CARD = readFileSync(join(__dirname, 'employee-card.tsx'), 'utf8');

describe('Xodim kartasi — rolsiz yaratish YOPILDI', () => {
  it('validatsiya rolsiz holatni tutadi', () => {
    expect(CARD).toContain("errs.role = t('err_role_required')");
    expect(CARD).toMatch(/roleChoice === 'user' && !selectedRoleId/);
  });

  it('🔴 saqlashda JIM o`tkazib yuborish shoxi YO`Q', () => {
    // Eski kod: `if (targetRoleId && changed) { …put… }` — rol topilmasa
    // hech narsa yubormasdan «muvaffaqiyat» qaytarardi.
    // Ochilish qavsi BILAN — izohda o'sha shart matn sifatida tilga
    // olinadi (tarixni tushuntirish uchun), lekin KOD shoxi bo'lmasligi kerak.
    expect(CARD).not.toContain('if (targetRoleId && changed) {');
    expect(CARD).toContain("if (!targetRoleId) throw new Error(t('err_role_required'))");
  });

  it('xato foydalanuvchiga ko`rsatiladi', () => {
    expect(CARD).toContain('data-testid="employee-role-error"');
    expect(CARD).toContain('fieldErrors.role');
  });

  it('yangi xodimda birinchi rol oldindan tanlanadi (odatiy holat bir bosishsiz)', () => {
    expect(CARD).toMatch(/setSelectedRoleId\(customRoles\[0\]\.id\)/);
  });
});
