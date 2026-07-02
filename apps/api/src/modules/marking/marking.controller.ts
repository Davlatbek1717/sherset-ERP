import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { MarkingService } from './marking.service.js';

@Controller('marking')
@UseGuards(JwtAuthGuard)
export class MarkingController {
  constructor(@Inject(MarkingService) private readonly svc: MarkingService) {}

  // config
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

  // codes
  @Get('codes')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listCodes(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listCodes(user.accountId, query);
  }

  @Post('codes/allocate')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async allocate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.allocate(user.accountId, body);
  }

  @Post('codes/apply')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.applyToProduct(user.accountId, body);
  }

  @Post('codes/sold')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async markSold(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.markSold(user.accountId, body);
  }

  @Post('codes/:code/return')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async markReturned(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string) {
    return this.svc.markReturned(user.accountId, code);
  }

  @Post('codes/:code/retire')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async retire(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.retire(user.accountId, code, body.reason ?? '');
  }
}
