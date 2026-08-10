import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { ManagerThresholdsService } from './manager-thresholds.service.js';

/**
 * MK13 son-chegaralari registrining HTTP sirti (MK17 da qo'shildi —
 * «davr sozlanadi» talabi shu yerdan bajariladi).
 *
 * `value`/`enabled` — ikkalasi ham ixtiyoriy: faqat bittasini o'zgartirish
 * ATAYLAB mumkin («signalni o'chirish» va «davrni o'zgartirish» ikki boshqa
 * amal).
 */
const UpdateThresholdSchema = z
  .object({
    enabled: z.boolean().optional(),
    value: z.number().optional(),
  })
  .refine((v) => v.enabled !== undefined || v.value !== undefined, {
    message: 'Kamida bitta maydon kerak: `enabled` yoki `value`',
  });

@Controller('manager/thresholds')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerThresholdsController {
  constructor(@Inject(ManagerThresholdsService) private readonly svc: ManagerThresholdsService) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return { thresholds: await this.svc.list(user.accountId) };
  }

  @Put(':key')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    const patch = UpdateThresholdSchema.parse(body ?? {});
    return { thresholds: await this.svc.update(user.accountId, key, patch, user.sub) };
  }
}
