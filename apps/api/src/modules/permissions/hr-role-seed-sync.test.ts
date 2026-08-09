/**
 * MK29 / QAROR-B4.2 — HR rol slug'lari SYNC qulfi.
 *
 * Tutadigan bug-klassi (real, 2026-08-10 da topilgan): kod `hrRoles` ichidan
 * bir slug'ni HOKIMIYAT sifatida tekshiradi, lekin o'sha slug hech qachon
 * seed qilinmaydi. Natijada shox **jimgina o'lik** bo'ladi — hech narsa
 * yiqilmaydi, log ham chiqmaydi, shunchaki `resolveShiftActor` hech qachon
 * `manager` qaytarmaydi va har bir menejer kassir sifatida qaraladi.
 *
 * `manager` aynan shu holatda edi: `cashier-session.controller.ts:219` va
 * `manager-kpi.controller.ts:267` uni tekshirardi, `seed-hr.ts` esa faqat
 * `admin`/`cashier`/`warehouse`/`staff` ni yaratardi.
 *
 * Manba-skan ataylab (import emas): `seed-hr.ts` boshqa paketda va uni
 * import qilish Prisma client'ni ko'tarardi. `permissions-seed-sync.test.ts`
 * bilan bir xil intizom.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(API_ROOT, '..', '..');

const seedHrSrc = readFileSync(join(REPO_ROOT, 'packages/db/prisma/seed-hr.ts'), 'utf8');

const seededBlock = seedHrSrc.match(
  /const DEFAULT_ROLES: Array<\{ value: string; label: string \}> = \[([\s\S]*?)\];/,
)?.[1];
if (!seededBlock) throw new Error('seed-hr.ts DEFAULT_ROLES bloki topilmadi');

const SEEDED = [...seededBlock.matchAll(/value: '([a-z_]+)'/g)].map((m) => m[1] as string);

/**
 * `hrRoles` ni hokimiyat sifatida o'qiydigan fayllar (2026-08-10 da grep
 * bilan aniqlangan). Yangi joy qo'shilsa shu ro'yxatga ham qo'shilsin —
 * quyidagi «ro'yxat eskirmagan» testi buni eslatadi.
 */
const AUTHORITY_FILES = [
  'src/modules/cashier-session/cashier-session.controller.ts',
  'src/modules/manager/kpi/manager-kpi.controller.ts',
  'src/modules/manager/queue/manager-queue.controller.ts',
  'src/modules/hr/hr-auth/hr-permission.guard.ts',
  'src/modules/hr/driver-tracking/dispatcher.guard.ts',
];

/** `roles.includes('x')` · `(user.hrRoles ?? []).includes('x')` · `DISPATCHER_ROLES = ['x']`. */
function slugsUsedIn(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?:hrRoles|roles|\))\s*\.includes\('([a-z_]+)'\)/g)) {
    out.add(m[1] as string);
  }
  const dispatcher = src.match(/DISPATCHER_ROLES: readonly string\[\] = \[([\s\S]*?)\]/)?.[1];
  if (dispatcher) {
    for (const m of dispatcher.matchAll(/'([a-z_]+)'/g)) out.add(m[1] as string);
  }
  return [...out];
}

describe('HR rol slug‘lari: kod tekshirgan har slug seed qilinadi', () => {
  it('seed ro‘yxati o‘qildi va bo‘sh emas', () => {
    expect(SEEDED.length).toBeGreaterThanOrEqual(5);
    expect(SEEDED).toContain('admin');
  });

  it('`manager` seed qilinadi — MK29/QAROR-B4.2 (aks holda menejer shoxi o‘lik)', () => {
    expect(SEEDED).toContain('manager');
  });

  for (const rel of AUTHORITY_FILES) {
    it(`${rel} tekshirgan slug‘lar seed’da bor`, () => {
      const src = readFileSync(join(API_ROOT, rel), 'utf8');
      const used = slugsUsedIn(src);
      const missing = used.filter((s) => !SEEDED.includes(s));
      expect(missing, `seed-hr.ts DEFAULT_ROLES da yo'q: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('ro‘yxat eskirmagan: har fayl hali ham hrRoles‘ni o‘qiydi', () => {
    // Fayl refactor qilinib `hrRoles` dan uzilsa, yuqoridagi testlar bo'sh
    // ro'yxat ustidan yashil qolardi — «o'tdi, chunki hech nima tekshirmadi».
    for (const rel of AUTHORITY_FILES) {
      const src = readFileSync(join(API_ROOT, rel), 'utf8');
      expect(src.includes('hrRoles'), `${rel} endi hrRoles o'qimaydi — ro'yxatni yangilang`).toBe(
        true,
      );
    }
  });
});
