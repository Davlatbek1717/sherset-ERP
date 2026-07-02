import { Body, Controller, Delete, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  ApplyBonusFineRuleSchema,
  CreateBonusFineRuleSchema,
  UpdateBonusFineRuleSchema,
} from './hr-bonus-fine-rule.schema.js';
import { HrBonusFineRuleService } from './hr-bonus-fine-rule.service.js';

@Controller('hr/bonus-fine-rules')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrBonusFineRuleController {
  constructor(@Inject(HrBonusFineRuleService) private readonly svc: HrBonusFineRuleService) {}

  @Get()
  @RequireHrPermission('oylik', 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Post()
  @RequireHrPermission('oylik', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateBonusFineRuleSchema.parse(body);
    return this.svc.create(user.accountId, input);
  }

  @Put(':id')
  @RequireHrPermission('oylik', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateBonusFineRuleSchema.parse(body);
    return this.svc.update(user.accountId, id, input);
  }

  @Delete(':id')
  @RequireHrPermission('oylik', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }

  /** Apply a rule to an employee → source='rule' ledger entry. */
  @Post('apply')
  @RequireHrPermission('oylik', 'full')
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = ApplyBonusFineRuleSchema.parse(body);
    return this.svc.applyRule(user.accountId, user.sub, input);
  }
}
