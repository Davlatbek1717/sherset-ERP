import type { HrEmployeeCreateInput } from '@/lib/hr-api';
import ru from '@/messages/ru.json';
import uz from '@/messages/uz.json';
import { describe, expect, it } from 'vitest';

/**
 * HR «Yangi xodim» oynasining SAQLASH ZANJIRI (2026-08-21).
 *
 * 🔴 O'lchangan nosozlik: oyna «Login» va «Parol» ni majburiy deb so'rardi va
 * ularni `POST /hr/employees` payloadiga qo'shardi:
 *
 *     ...(mode === 'create' && form.username.trim() && { username: ... })
 *
 * Lekin `CreateHrEmployeeSchema` da bunday maydon YO'Q va Zod noma'lum
 * kalitlarni sukut bo'yicha TASHLAB yuboradi. TypeScript ham tutmagan:
 * spread natijasiga ortiqcha-maydon tekshiruvi QO'LLANMAYDI. Natija —
 * xodim LOGINSIZ yaratilardi, oyna esa «saqlandi» derdi. Prodda o'lchandi:
 * 13 xodimdan 8 tasida `username` NULL.
 *
 * Bu test ikkita shartnomani qulflaydi:
 *   1. Yaratish payloadining TIPIDA login/parol yo'q — ya'ni ularni u yerga
 *      qo'shish yo'li kompilyatsiya darajasida yopiq bo'lib qolsin.
 *   2. Zanjirning qolgan qadamlari uchun matnlar IKKALA tilda mavjud
 *      (ular bilan xato oshkora ko'rsatiladi, jimgina yutilmaydi).
 */
describe('HR xodim oynasi — login zanjiri shartnomasi', () => {
  it('yaratish payloadi tipida username/password YO\u2018Q (alohida endpoint bilan qo\u2018yiladi)', () => {
    // Tip darajasidagi qulf: agar kimdir `HrEmployeeCreateInput` ga
    // `username` qo'shsa, quyidagi tekshiruv kompilyatsiyada yiqiladi.
    type HasUsername = 'username' extends keyof HrEmployeeCreateInput ? true : false;
    type HasPassword = 'password' extends keyof HrEmployeeCreateInput ? true : false;
    const usernameAbsent: HasUsername = false;
    const passwordAbsent: HasPassword = false;
    expect(usernameAbsent).toBe(false);
    expect(passwordAbsent).toBe(false);
  });

  it('zanjir xabarlari uz va ru da mavjud (jim yutilish o\u2018rniga oshkora matn)', () => {
    const keys = [
      'warn_partial_title',
      'warn_login_failed',
      'warn_erp_role_failed',
      'warn_schedule_failed',
      'form_erp_role',
      'form_erp_role_hint',
      'form_erp_role_none',
      'form_username',
      'form_password',
      'err_name_required',
      'err_phone_required',
      'err_role_required',
      'err_username_required',
      'err_password_required',
      'err_password_too_short',
    ] as const;
    for (const k of keys) {
      expect((uz.pages.hrEmployees as Record<string, string>)[k], `uz.${k}`).toBeTruthy();
      expect((ru.pages.hrEmployees as Record<string, string>)[k], `ru.${k}`).toBeTruthy();
    }
  });
});
