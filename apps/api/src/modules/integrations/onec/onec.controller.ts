import { Body, Controller, Delete, Get, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { OneCSyncService } from './onec.service.js';

@Controller('onec')
@UseGuards(JwtAuthGuard)
export class OneCSyncController {
  constructor(@Inject(OneCSyncService) private readonly svc: OneCSyncService) {}

  @Get('config')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getConfig(user.accountId);
  }

  @Put('config')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async saveConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.saveConfig(user.accountId, body);
  }

  @Delete('config')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async deleteConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.deleteConfig(user.accountId);
  }

  @Get('sync-logs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async logs(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listLogs(user.accountId, query);
  }

  @Post('sync-logs')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async recordCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      direction?: 'pull' | 'push';
      status?: 'success' | 'partial' | 'failed';
      counts?: Record<string, number>;
      errorMsg?: string;
    },
  ) {
    if (!body.direction || !body.status) {
      throw new Error("'direction' va 'status' majburiy");
    }
    return this.svc.recordCycle(
      user.accountId,
      body.direction,
      body.status,
      body.counts ?? {},
      body.errorMsg,
    );
  }
}
