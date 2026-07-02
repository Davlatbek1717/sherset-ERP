import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { PermissionsService } from './permissions.service.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PermissionsController, RolesController],
  providers: [
    PermissionsService,
    RolesService,
    PermissionsGuard,
    // Register PermissionsGuard at the app level so every controller method
    // honours `@RequirePermission(...)` metadata. The guard is opt-in by
    // metadata: handlers without the decorator pass through with no check
    // (see permissions.guard.ts:25). This means we can roll permission
    // enforcement out controller-by-controller without breaking the
    // unprotected endpoints we haven't decorated yet.
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
