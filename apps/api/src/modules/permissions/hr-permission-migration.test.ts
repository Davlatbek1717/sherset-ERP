/**
 * MK27 — bir martalik migratsiya rejasi (`scripts/migrate-hr-permissions.ts` yadrosi).
 *
 * Skript o'zi faqat I/O qiladi (DB o'qish, hisobot yozish); butun hukm shu sof
 * funksiyada — shuning uchun bazasiz tekshiriladi.
 */
import { describe, expect, it } from 'vitest';
import { planHrPermissionMigration } from './hr-permission-migration.js';
import type { PermissionScope } from './permissions.types.js';

/** Hech kimda rol qatlamida hech nima yo'q (odatiy holat: `hr…` slug'lari yangi). */
const noRoleScopes = () => 'NO' as PermissionScope;

const row = (
  employeeId: string,
  pageKey: string,
  accessLevel: string,
  section: string | null = null,
) => ({ employeeId, pageKey, section, accessLevel });

describe('migratsiya rejasi — xaritalash', () => {
  it('HR qatorlarini ERP uch-liklariga aylantiradi', () => {
    const plan = planHrPermissionMigration([row('e1', 'reports', 'read')], noRoleScopes);
    expect(plan.refused).toBe(false);
    expect(plan.entries).toEqual([
      {
        employeeId: 'e1',
        entity: 'hrreport',
        action: 'view',
        scope: 'ALL',
        before: 'NO',
        change: 'gained',
      },
    ]);
  });

  it('bir xodimning bir necha sahifasi — hammasi rejaga tushadi', () => {
    const plan = planHrPermissionMigration(
      [row('e1', 'reports', 'read'), row('e1', 'oylik', 'full')],
      noRoleScopes,
    );
    expect(plan.refused).toBe(false);
    expect(plan.entries).toHaveLength(1 + 6); // read → 1 amal, full → 6 amal
    expect(plan.summary.employees).toBe(1);
    expect(plan.summary.rows).toBe(2);
  });
});

describe('migratsiya rejasi — fail-closed', () => {
  it('xaritalanmagan qator JIMGINA TUSHIB QOLMAYDI — reja rad etiladi', () => {
    const plan = planHrPermissionMigration(
      [row('e1', 'reports', 'read'), row('e2', 'driver_tracking', 'full')],
      noRoleScopes,
    );
    expect(plan.refused).toBe(true);
    expect(plan.errors.join(' ')).toMatch(/driver_tracking/);
    // Yarim qo'llash yo'q: bitta qator tushunilmasa, HECH NIMA yozilmaydi.
    expect(plan.entries).toEqual([]);
  });

  it('bitta (xodim, entity, amal) uchun ikki xil scope — rad etiladi', () => {
    // `demand` va `messages:demand` — bir qatorning ikki imlosi; darajalari
    // har xil bo'lsa qaysi biri to'g'ri ekanini MASHINA hal qila olmaydi.
    const plan = planHrPermissionMigration(
      [
        row('e1', 'messages', 'read', 'demand'),
        row('e1', 'messages', 'own_only', 'messages:demand'),
      ],
      noRoleScopes,
    );
    expect(plan.refused).toBe(true);
    expect(plan.errors.join(' ')).toMatch(/hrmessagedemand/);
    expect(plan.entries).toEqual([]);
  });

  it('aynan bir xil qator ikki marta kelsa — ziddiyat EMAS', () => {
    const plan = planHrPermissionMigration(
      [row('e1', 'messages', 'read', 'demand'), row('e1', 'messages', 'read', 'messages:demand')],
      noRoleScopes,
    );
    expect(plan.refused).toBe(false);
    expect(plan.entries).toHaveLength(1);
  });
});

describe('migratsiya rejasi — kim nimani oldi/yo‘qotdi (hisobot)', () => {
  it('rol qatlami pastroq bo‘lsa — «gained»', () => {
    const plan = planHrPermissionMigration([row('e1', 'oylik', 'read')], () => 'NO');
    expect(plan.entries[0]?.change).toBe('gained');
    expect(plan.summary.gained).toBe(1);
    expect(plan.summary.lost).toBe(0);
  });

  it('rol qatlami balandroq bo‘lsa — «lost» (override rolni TUSHIRADI)', () => {
    // Administrator roli seed'da `hr…` slug'lariga ham ALL oladi; HR'da esa shu
    // xodimga `own_only` yozilgan bo'lsa, override uni OWN ga tushiradi.
    const plan = planHrPermissionMigration([row('e1', 'oylik', 'own_only')], () => 'ALL');
    expect(plan.entries[0]?.change).toBe('lost');
    expect(plan.summary.lost).toBe(1);
    expect(plan.summary.lostEmployees).toEqual(['e1']);
  });

  it('teng bo‘lsa — «unchanged»', () => {
    const plan = planHrPermissionMigration([row('e1', 'oylik', 'read')], () => 'ALL');
    expect(plan.entries[0]?.change).toBe('unchanged');
    expect(plan.summary.unchanged).toBe(1);
  });
});

describe('migratsiya rejasi — kengayish taqiqi', () => {
  it('reja FAQAT `hr…` entity’lariga tegadi — mavjud ERP imkoniyati berilmaydi', () => {
    const plan = planHrPermissionMigration(
      [
        row('e1', 'employees', 'full'),
        row('e1', 'messages', 'full', 'demand'),
        row('e2', 'settings', 'full'),
        row('e2', 'tasks', 'full'),
        row('e3', 'reports', 'full'),
      ],
      noRoleScopes,
    );
    expect(plan.refused).toBe(false);
    expect(plan.entries.length).toBeGreaterThan(0);
    for (const e of plan.entries) {
      expect(e.entity.startsWith('hr')).toBe(true);
    }
  });

  it('hech bir yozuv rol qatlamidan yuqori scope BERMAYDI, agar HR qatori talab qilmasa', () => {
    // `read` → faqat `view`. Yozuv amallari (create/update/…) rejaga TUSHMAYDI,
    // ya'ni rol qatlamidagi qiymat o'z holicha qoladi.
    const plan = planHrPermissionMigration([row('e1', 'employees', 'read')], noRoleScopes);
    expect(plan.entries.map((e) => e.action)).toEqual(['view']);
  });
});
