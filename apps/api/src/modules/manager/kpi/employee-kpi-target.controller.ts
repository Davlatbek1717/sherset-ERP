import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import {
  CreateEmployeeKpiTargetSchema,
  ListAllKpiTargetsQuerySchema,
  MarkKpiTargetDoneSchema,
  UpdateEmployeeKpiTargetSchema,
} from './employee-kpi-target.schema.js';
import { EmployeeKpiTargetService } from './employee-kpi-target.service.js';

/**
 * Biriktirilgan KPI CRUD (KPI-02) — «todo kabi» qatlam.
 *
 * ## Ruxsat: HAMMA handler `employees:full`
 * O'QISH ham yopiq — `KpiConfigController.getConfig` dan farqli. Sabab: bu
 * ro'yxat xodimning maqsadi va **oxirgi fakti**ni birga ko'rsatadi, ya'ni
 * boshqa xodimning natijasini ochib qo'yardi. Talab class guard'da VA har
 * handlerda tekshiriladi — ikkisidan biri yechilsa ruxsat jimgina ochilardi
 * ([[mk26-permission-override-contracts]], `kpi-permission-gate.test.ts`).
 *
 * ## Marshrutlar `manager/kpi` prefiksida
 * Bu prefiksda yana ikki controller bor (`KpiConfigController`,
 * `ManagerKpiController`) — takroriy marshrut butun API'ni ko'tarmaydi
 * ([[duplicate-route-prod-502]]). `app-boot.test.ts` skaneri qo'riqlaydi.
 */
@Controller('manager/kpi')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class EmployeeKpiTargetController {
  constructor(
    @Inject(EmployeeKpiTargetService) private readonly targets: EmployeeKpiTargetService,
  ) {}

  /** Xodim kartasi tabi — shu xodimning biriktirilgan KPI'lari. */
  @Get('employee/:employeeId/targets')
  @RequireHrPermission('employees', 'full')
  list(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    return this.targets.list(user.accountId, employeeId);
  }

  /** Menejer ekrani — barcha xodimlar KPI'lari (filtr bilan). */
  @Get('targets')
  @RequireHrPermission('employees', 'full')
  listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.targets.listAll(user.accountId, ListAllKpiTargetsQuerySchema.parse(query ?? {}));
  }

  @Post('employee/:employeeId/targets')
  @RequireHrPermission('employees', 'full')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ) {
    return this.targets.create(
      user.accountId,
      user.sub,
      employeeId,
      CreateEmployeeKpiTargetSchema.parse(body),
    );
  }

  @Patch('targets/:id')
  @RequireHrPermission('employees', 'full')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.targets.update(
      user.accountId,
      user.sub,
      id,
      UpdateEmployeeKpiTargetSchema.parse(body),
    );
  }

  @Delete('targets/:id')
  @RequireHrPermission('employees', 'full')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.targets.remove(user.accountId, user.sub, id);
  }

  /** Qo'lda o'lchanadigan KPI uchun «bajarildi» (o'lchanadiganda 400). */
  @Post('targets/:id/done')
  @RequireHrPermission('employees', 'full')
  markDone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const { done } = MarkKpiTargetDoneSchema.parse(body ?? {});
    return this.targets.setDone(user.accountId, user.sub, id, done);
  }
}
