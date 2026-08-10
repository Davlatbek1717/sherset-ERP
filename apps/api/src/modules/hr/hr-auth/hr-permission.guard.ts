import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
// Value import + @Inject(Reflector) below — Reflector is constructor-injected
// by Nest DI. A type-only import is erased by tsx/esbuild, leaving `reflector`
// undefined at runtime → every HR endpoint 500s ("Cannot read properties of
// undefined (reading 'get')"); tsc un-elides it so `typecheck` stays green,
// which is why only a live request surfaces it. @Inject keeps biome's
// useImportType happy (Reflector used as a value). Matches permissions.guard.ts.
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import {
  HR_PERMISSION_METADATA_KEY,
  type HrAccessLevel,
  type HrPermissionRequirement,
} from './hr-permission.types.js';

const ACCESS_RANK: Record<HrAccessLevel, number> = {
  own_only: 1,
  read: 2,
  full: 3,
};

function hasAccess(have: HrAccessLevel, need: HrAccessLevel): boolean {
  return ACCESS_RANK[have] >= ACCESS_RANK[need];
}

@Injectable()
export class HrPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<HrPermissionRequirement | undefined>(
      HR_PERMISSION_METADATA_KEY,
      ctx.getHandler(),
    );
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('HR resurs uchun avtorizatsiya kerak');
    }

    if (user.hrRoles.includes('admin')) return true;

    const perm = user.hrPermissions.find(
      (p) =>
        p.pageKey === required.page &&
        (required.section ? p.section === required.section : p.section === null),
    );
    if (!perm) {
      // Settings «Сотрудники» (moysklad 1:1, 2026-07-16): the employee catalog
      // is ALSO the access-admin surface, so a core-RBAC administrator/owner
      // (Role/RolePermission `employee` entity) must reach /hr/employees even
      // with no HR page-keys — the two RBAC systems meet on this one page.
      // Scoped to page 'employees' only: every other HR page stays HR-gated.
      //
      // 🔴 `ALL` ONLY — `!== 'NO'` EMAS (KPI-06 brauzer-QA, 2026-08-10).
      // Fallback'ning maqsadi «administrator/egasi», ular esa doim `ALL`.
      // Oraliq qamrov (`OWN`, `OWN_GROUP`, `OWN_AND_GROUP`) aynan TESKARISINI
      // bildiradi — «faqat o'zim / guruhim». `!== 'NO'` ularni ham to'liq HR
      // huquqiga ko'tarardi: o'lchangan hodisa — `employee.update = OWN_GROUP`
      // bo'lgan menejer BARCHA xodimlarning KPI maqsadi va FAKTINI o'qidi va
      // guruhidan tashqaridagi xodimga KPI yaratdi (`employees:full` qulfi
      // aylanib o'tildi). HR sahifalari qamrovni o'zi filtrlamaydi — shuning
      // uchun qaror shu yerda, kirishda qabul qilinadi.
      if (required.page === 'employees') {
        const scope = await this.permissions.resolveScope(
          user.sub,
          'employee',
          required.access === 'full' ? 'update' : 'view',
        );
        if (scope === 'ALL') return true;
      }
      throw new ForbiddenException(
        `HR permission required: ${required.page}${required.section ? `:${required.section}` : ''}`,
      );
    }
    if (!hasAccess(perm.accessLevel, required.access)) {
      throw new ForbiddenException(
        `HR access level insufficient: required ${required.access}, have ${perm.accessLevel}`,
      );
    }
    return true;
  }
}
