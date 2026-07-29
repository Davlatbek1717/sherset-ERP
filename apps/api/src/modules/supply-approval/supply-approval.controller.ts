import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import type { SupplyApprovalService } from './supply-approval.service.js';

/**
 * Qabul-tasdiqlash workflow endpointlari (2026-07-29 spec). `/supplies` base'i
 * SupplyController bilan bir xil — to'liq yo'llar (`/approval/*`) kesishmaydi.
 * Taminotchi tasdiq/rad = Telegram callback (Faza B), bu yerda emas.
 */
@Controller('supplies')
@UseGuards(JwtAuthGuard)
export class SupplyApprovalController {
  constructor(private readonly svc: SupplyApprovalService) {}

  @Get(':id/approval')
  @RequirePermission({ entity: 'supply', action: 'view' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getApproval(user.accountId, id);
  }

  @Post(':id/approval/send')
  @RequirePermission({ entity: 'supply', action: 'update' })
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.send(user.accountId, user.sub, id);
  }

  @Post(':id/approval/omborchi-confirm')
  @RequirePermission({ entity: 'supply', action: 'update' })
  omborchiConfirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.omborchiConfirm(user.accountId, user.sub, id, body);
  }

  @Post(':id/approval/admin-confirm')
  @RequirePermission({ entity: 'supply', action: 'approve' })
  adminConfirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.adminConfirm(user.accountId, user.sub, id);
  }

  @Post(':id/approval/reject')
  @RequirePermission({ entity: 'supply', action: 'update' })
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.reject(user.accountId, user.sub, id, body);
  }
}
