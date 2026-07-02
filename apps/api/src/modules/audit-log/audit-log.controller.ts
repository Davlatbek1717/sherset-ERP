import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { AuditLogService } from './audit-log.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly svc: AuditLogService) {}

  /** GET /audit-logs?entity=Demand&entityId=... — used by detail-page History tab. */
  @Get('audit-logs')
  @RequirePermission({ entity: 'auditlog', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  /**
   * GET /admin/audit-logs?entity=&userId=&action=&search=&dateFrom=&dateTo= —
   * used by the /settings/audit-log admin browse page. All fields optional.
   */
  @Get('admin/audit-logs')
  @RequirePermission({ entity: 'auditlog', action: 'view' })
  async adminList(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.adminList(user.accountId, query);
  }
}
