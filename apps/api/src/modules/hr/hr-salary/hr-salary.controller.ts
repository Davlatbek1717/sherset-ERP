import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { HrPayrollService } from './hr-payroll.service.js';
import { UpsertSalaryConfigSchema } from './hr-salary.schema.js';
import { HrSalaryService } from './hr-salary.service.js';

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;

function parseYearMonth(raw: unknown): string {
  const v = typeof raw === 'string' ? raw : '';
  if (!YEAR_MONTH_RE.test(v)) {
    throw new Error("yearMonth 'YYYY-MM' formatida bo'lishi kerak");
  }
  return v;
}

@Controller('hr')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrSalaryController {
  constructor(
    @Inject(HrSalaryService) private readonly svc: HrSalaryService,
    @Inject(HrPayrollService) private readonly payroll: HrPayrollService,
  ) {}

  @Get('salary-config')
  @RequireHrPermission('oylik', 'read')
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.get(user.accountId);
  }

  @Put('salary-config')
  @RequireHrPermission('oylik', 'full')
  async upsertConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = UpsertSalaryConfigSchema.parse(body);
    return this.svc.upsert(user.accountId, input);
  }

  /** Stored monthly scores for the Oylik roster table. */
  @Get('payroll/:yearMonth')
  @RequireHrPermission('oylik', 'read')
  async listMonthly(@CurrentUser() user: AuthenticatedUser, @Param('yearMonth') yearMonth: string) {
    return this.payroll.listMonthly(user.accountId, parseYearMonth(yearMonth));
  }

  /** Recompute one employee's monthly salary (admin re-run after edits). */
  @Post('payroll/compute')
  @RequireHrPermission('oylik', 'full')
  async computeOne(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { employeeId?: string; yearMonth?: string },
  ) {
    const yearMonth = parseYearMonth(body.yearMonth);
    if (!body.employeeId) throw new Error('employeeId kerak');
    return this.payroll.computeMonthly(user.accountId, body.employeeId, yearMonth);
  }

  /** Recompute the whole roster for a month. */
  @Post('payroll/compute-all')
  @RequireHrPermission('oylik', 'full')
  async computeAll(@CurrentUser() user: AuthenticatedUser, @Query('yearMonth') yearMonth: string) {
    return this.payroll.computeMonthlyAll(user.accountId, parseYearMonth(yearMonth));
  }
}
