import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  BonusFineAggregateSchema,
  BonusFineFilterSchema,
  CreateManualBonusFineSchema,
} from './hr-bonus-fine.schema.js';
import { HrBonusFineService } from './hr-bonus-fine.service.js';

@Controller('hr/bonus-fine')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrBonusFineController {
  constructor(@Inject(HrBonusFineService) private readonly svc: HrBonusFineService) {}

  @Get()
  @RequireHrPermission('oylik', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = BonusFineFilterSchema.parse(query);
    return this.svc.list(user.accountId, filter);
  }

  @Get('aggregate')
  @RequireHrPermission('oylik', 'read')
  async aggregate(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const input = BonusFineAggregateSchema.parse(query);
    return this.svc.aggregate(user.accountId, input);
  }

  @Post()
  @RequireHrPermission('oylik', 'full')
  async createManual(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateManualBonusFineSchema.parse(body);
    return this.svc.createManual(user.accountId, user.sub, input);
  }

  @Delete(':id')
  @RequireHrPermission('oylik', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
