import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { DebtController } from './debt.controller.js';

/**
 * POS «Qarz to'lovi» oynasining O'QISH endpointlari ham RBAC bilan yopilgan
 * bo'lishi SHART (AUTH-07 klassining davomi).
 *
 * MUAMMO (tuzatishdan oldin): `GET /debts/pos/summary/:counterpartyId` va
 * `GET /debts/pos/receipt/:batchId` da `@RequirePermission` YO'Q edi.
 * `PermissionsGuard` opt-in bo'lgani uchun bu «faqat JwtAuthGuard» degani —
 * ISTALGAN autentifikatsiyalangan xodim (masalan, oddiy sotuvchi) istalgan
 * mijozning to'liq qarz ro'yxatini va PKO cheklarini o'qiy olardi, ya'ni
 * `debt.view` RBAC'i POS oynasi orqali chetlab o'tilardi.
 *
 * KUTILGAN ruxsat — `debtpayment.create`: bu endpointlar FAQAT POS to'lov
 * oynasi uchun mavjud va o'sha oynaning yozuv yo'li (`POST /debts/pos/pay`,
 * Q10/AUTH-07) aynan shu ruxsat bilan yopilgan. Oynaning o'qish va yozish
 * tomoni bir xil ruxsatda bo'lmasa, RBAC yana chetlanadi.
 */

const POS_PERMISSION: RequiredPermission = { entity: 'debtpayment', action: 'create' };

function permissionOf(handler: unknown): RequiredPermission | undefined {
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

describe('POS qarz oynasi — o`qish endpointlari RBAC bilan yopilgan', () => {
  it('GET /debts/pos/summary/:counterpartyId → debtpayment.create', () => {
    expect(permissionOf(DebtController.prototype.posSummary)).toEqual(POS_PERMISSION);
  });

  it('GET /debts/pos/receipt/:batchId → debtpayment.create', () => {
    expect(permissionOf(DebtController.prototype.posReceipt)).toEqual(POS_PERMISSION);
  });

  it('POST /debts/pos/pay bilan BIR XIL ruxsat (oyna yaxlitligi)', () => {
    // Yozuv yo'li ruxsatini o'zgartirgan kishi o'qish yo'lini ham ongli
    // ravishda ko'rib chiqsin — uchchala endpoint bitta oynaning qismlari.
    expect(permissionOf(DebtController.prototype.posPay)).toEqual(POS_PERMISSION);
  });
});
