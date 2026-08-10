import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import {
  HR_PERMISSION_METADATA_KEY,
  type HrPermissionRequirement,
} from '../../hr/hr-auth/hr-permission.types.js';
import { EmployeeKpiTargetController } from './employee-kpi-target.controller.js';
import { KpiConfigController } from './kpi-config.controller.js';
import { ManagerKpiController } from './manager-kpi.controller.js';

/**
 * AUTH-07 (faza 23) — oylikka ta'sir qiluvchi KPI yozuvlari rol-tekshiruvsiz edi:
 *  · `PUT manager/kpi/employee/:id/config` — xodim KPI og'irligi/maqsadi (oylik formulasi),
 *    controller faqat `JwtAuthGuard` ostida, kodda `TODO(rol-gate)` turardi;
 *  · `POST manager/kpi/metrics*` — ko'rsatkich katalogi (barcha xodim ballining manbai),
 *    class'da `HrPermissionGuard` bor-u, bu handler'larda `@RequireHrPermission` yo'q edi
 *    (guard talab yo'qligini ko'rsa `true` qaytaradi).
 *
 * Metadata testi: guard class'da ro'yxatdan o'tganini VA handler talabini birga
 * tekshiradi — ikkisidan biri yechilsa ruxsat jim ochiladi.
 */
function hrPermissionOf(handler: unknown): HrPermissionRequirement | undefined {
  return Reflect.getMetadata(HR_PERMISSION_METADATA_KEY, handler as object) as
    | HrPermissionRequirement
    | undefined;
}

function guardsOf(target: unknown): unknown[] {
  return (Reflect.getMetadata('__guards__', target as object) as unknown[]) ?? [];
}

describe('KpiConfigController — KPI konfiguratsiyasi ruxsat ostida (AUTH-07)', () => {
  it('class HrPermissionGuard bilan o`ralgan (aks holda talab metadatasi o`lik)', () => {
    expect(guardsOf(KpiConfigController)).toContain(HrPermissionGuard);
  });

  it('PUT employee/:employeeId/config → employees:full talab qiladi', () => {
    expect(hrPermissionOf(KpiConfigController.prototype.saveConfig)).toEqual({
      page: 'employees',
      access: 'full',
    });
  });
});

describe('ManagerKpiController — ko`rsatkich katalogi ruxsat ostida (AUTH-07)', () => {
  it.each(['createMetric', 'updateMetric', 'archiveMetric'] as const)(
    '%s → employees:full talab qiladi',
    (method) => {
      expect(hrPermissionOf(ManagerKpiController.prototype[method])).toEqual({
        page: 'employees',
        access: 'full',
      });
    },
  );

  it('explain ATAYLAB ochiq qoladi — xodim o`z kunini tushuntiradi', () => {
    expect(hrPermissionOf(ManagerKpiController.prototype.explain)).toBeUndefined();
  });
});

/**
 * KPI-02 — biriktirilgan KPI CRUD'i ham oylik ballga (og'irlik qo'yilsa) va
 * xodim baholashiga ta'sir qiladi, ya'ni AUTH-07 bilan bir xil darajada
 * himoyalanishi shart. Guard class'da VA har handlerda tekshiriladi:
 * ikkisidan biri yechilsa ruxsat JIMGINA ochiladi
 * ([[mk26-permission-override-contracts]]).
 */
describe('EmployeeKpiTargetController — biriktirilgan KPI ruxsat ostida (KPI-02)', () => {
  it('class HrPermissionGuard bilan o`ralgan (aks holda talab metadatasi o`lik)', () => {
    expect(guardsOf(EmployeeKpiTargetController)).toContain(HrPermissionGuard);
  });

  it.each(['list', 'listAll', 'create', 'update', 'remove', 'markDone'] as const)(
    '%s → employees:full talab qiladi',
    (method) => {
      expect(hrPermissionOf(EmployeeKpiTargetController.prototype[method])).toEqual({
        page: 'employees',
        access: 'full',
      });
    },
  );

  it('handlerlar ro`yxati VAKUUM emas — controllerda boshqa route qolmagan', () => {
    // Yangi handler qo'shilib, `@RequireHrPermission` unutilsa yuqoridagi
    // `it.each` uni KO'RMAYDI (ro'yxat qo'lda yozilgan). Shu sabab: prototipdagi
    // HAR metod ro'yxatda borligi alohida qulflanadi.
    const methods = Object.getOwnPropertyNames(EmployeeKpiTargetController.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.sort()).toEqual(
      ['create', 'list', 'listAll', 'markDone', 'remove', 'update'].sort(),
    );
  });
});
