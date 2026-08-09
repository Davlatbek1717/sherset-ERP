import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import {
  QueueActionBodySchema,
  QueueListQuerySchema,
  QueueSyncBodySchema,
  RuleConfigBodySchema,
} from './manager-queue.schema.js';
import { ManagerQueueService } from './manager-queue.service.js';
import type { WorkItemActor } from './work-item-fsm.js';

/**
 * MK06 / 4M TZ §5 — menejer ish navbatining HTTP sirti.
 *
 * Ruxsat: `employees:read` (ko'rish) va `employees:full` (harakat va qoida
 * sozlamasi) — `manager/kpi` bilan AYNAN bir xil darvoza. Yangi
 * `PermissionEntity` kiritilmadi: u seed matritsasini ham talab qilardi va
 * MK06 qamrovidan tashqarida (MK26–MK30 ruxsat modeli to'lqini).
 *
 * 🔴 Bu yerda hech bir endpoint hujjat yaratmaydi va hech qanday amalni
 * to'xtatmaydi (§5.1).
 */
@Controller('manager/queue')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerQueueController {
  constructor(@Inject(ManagerQueueService) private readonly service: ManagerQueueService) {}

  /**
   * Aktyor roli — `manager-kpi.controller.ts` dagi AYNI konvensiya (yangi rol
   * tizimi o'ylab topilmaydi): `hrRoles` da `admin` = EGA, qolgani menejer.
   * Bu endpoint allaqachon `employees:full` talab qiladi, ya'ni oddiy xodim
   * bu yergacha yetib kelmaydi.
   *
   * Nega ajratish kerak: eskalatsiya faqat menejerga ochiq — egaga eskalatsiya
   * qilishning ma'nosi yo'q, u allaqachon eng yuqorida (FSM shuni rad etadi).
   */
  private actorOf(user: AuthenticatedUser): { actor: WorkItemActor; actorId: string | null } {
    const isOwner = (user.hrRoles ?? []).includes('admin');
    return { actor: isOwner ? 'owner' : 'manager', actorId: user.sub };
  }

  /** Navbat — eskirgani tepada, keyin jiddiyligi, keyin eng yangisi. */
  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.list(user.accountId, QueueListQuerySchema.parse(query ?? {}));
  }

  /** Qoida registri + akkаunt sozlamasi. */
  @Get('rules')
  @RequireHrPermission('employees', 'read')
  async rules(@CurrentUser() user: AuthenticatedUser) {
    return this.service.rules(user.accountId);
  }

  /** Element kartochkasi tarixi (append-only jurnal). */
  @Get(':id/history')
  @RequireHrPermission('employees', 'read')
  async history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.history(user.accountId, id);
  }

  /** Dvigatelni yugurtirish — idempotent. */
  @Post('sync')
  @RequireHrPermission('employees', 'full')
  async sync(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.sync(user.accountId, QueueSyncBodySchema.parse(body ?? {}));
  }

  /** §5.4 harakatlari. Yopuvchi amalda sabab kodi MAJBURIY (§5.3). */
  @Post(':id/action')
  @RequireHrPermission('employees', 'full')
  async act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.act(
      user.accountId,
      this.actorOf(user),
      id,
      QueueActionBodySchema.parse(body ?? {}),
    );
  }

  /** Chegara/rejim sozlamasi — MK11 ning «chegara doimiy emas» qarzi shu yerda yopiladi. */
  @Put('rules/:ruleType')
  @RequireHrPermission('employees', 'full')
  async updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ruleType') ruleType: string,
    @Body() body: unknown,
  ) {
    return this.service.updateRule(
      user.accountId,
      user.sub,
      ruleType,
      RuleConfigBodySchema.parse(body ?? {}),
    );
  }
}
