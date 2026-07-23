import { Module } from '@nestjs/common';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { HrPermissionGuard } from './hr-permission.guard.js';

@Module({
  // PermissionsModule: the guard's core-RBAC fallback for the settings
  // «Сотрудники» surface (employee entity) — see hr-permission.guard.ts.
  imports: [PermissionsModule],
  providers: [HrPermissionGuard],
  exports: [HrPermissionGuard],
})
export class HrAuthModule {}
