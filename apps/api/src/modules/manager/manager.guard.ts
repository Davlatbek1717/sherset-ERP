import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import type { DailyKpiActor } from './kpi/daily-kpi.fsm.js';

/**
 * Menejer endpoint'lari uchun yengil rol-gate.
 *
 * Naqsh `hr/driver-tracking/dispatcher.guard.ts` dan: JWT'dagi `hrRoles`
 * da'vosini o'qiydi, permissions DB/service'ga BOG'LANMAYDI. Sabab o'sha —
 * ERP `RolePermission` matritsasi hali menejer entity'larini bilmaydi
 * (4-bo'lim asl TZ B1–B3 bosqichlari), va yarim ulangan ruxsat tizimi
 * ochiq eshikdan yomonroq: u himoyalangan degan tuyg'u beradi.
 *
 * TODO(4-B3): `EmployeePermission` qatlami qurilgach —
 * `@RequirePermission('manager_kpi', 'approve')` ga o'tkaziladi.
 */
const MANAGER_ROLES: readonly string[] = ['admin', 'menejer', 'manager', 'director'];

/** Egasi darajasidagi rollar — majburiy yopish (`force_accept`) faqat ularga. */
const OWNER_ROLES: readonly string[] = ['admin', 'director'];

@Injectable()
export class ManagerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const roles = req.user?.hrRoles ?? [];
    if (roles.some((r) => MANAGER_ROLES.includes(r))) return true;
    throw new ForbiddenException('Menejer huquqi kerak');
  }
}

/**
 * Foydalanuvchi rolini FSM aktyoriga o'giradi.
 *
 * `owner` > `manager` — egasi menejer qila oladigan hamma narsani qila oladi,
 * ustiga eskalatsiyani majburiy yopadi (§1.2). Rol yo'q bo'lsa `employee`:
 * u faqat o'z kuniga tushuntirish yoza oladi.
 */
export function resolveKpiActor(user: { hrRoles?: string[] | null }): DailyKpiActor {
  const roles = user.hrRoles ?? [];
  if (roles.some((r) => OWNER_ROLES.includes(r))) return 'owner';
  if (roles.some((r) => MANAGER_ROLES.includes(r))) return 'manager';
  return 'employee';
}
