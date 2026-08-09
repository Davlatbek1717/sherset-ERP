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
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BudgetPlanBodySchema, BudgetReportQuerySchema } from './expense-budget.schema.js';
import { ExpenseBudgetService } from './expense-budget.service.js';

/**
 * MK12 / 4M TZ §8 — xarajat byudjeti HTTP sirti.
 *
 * Ruxsat: mavjud `expenseitem` entity'si (`view` — ko'rish, `update` — reja
 * yozish). Yangi `PermissionEntity` KIRITILMADI — u seed matritsasini ham
 * talab qilardi va MK26–MK30 (ruxsat modeli to'lqini) qamroviga tegishli.
 * MK06 da ham aynan shu qaror qabul qilingan.
 *
 * 🔴 Bu yerda hech bir endpoint xarajat hujjatini yaratmaydi/o'zgartirmaydi
 * va hech qanday to'lovni bloklamaydi (TZ §8).
 */
@Controller('expense-budget')
@UseGuards(JwtAuthGuard)
export class ExpenseBudgetController {
  constructor(@Inject(ExpenseBudgetService) private readonly svc: ExpenseBudgetService) {}

  /** Oy kesimidagi reja/fakt/og'ish. */
  @Get()
  @RequirePermission({ entity: 'expenseitem', action: 'view' })
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.report(user.accountId, BudgetReportQuerySchema.parse(query ?? {}));
  }

  /** Reja kiritish/yangilash (modda × oy = bitta qator). */
  @Post()
  @RequirePermission({ entity: 'expenseitem', action: 'update' })
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upsertPlan(user.accountId, user.sub, BudgetPlanBodySchema.parse(body));
  }

  /** Rejani olib tashlash — «reja qo'yilmagan» holatiga qaytadi. */
  @Delete(':id')
  @RequirePermission({ entity: 'expenseitem', action: 'update' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.deletePlan(user.accountId, id);
  }
}
