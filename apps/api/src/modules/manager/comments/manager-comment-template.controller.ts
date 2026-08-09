import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { COMMENT_TEMPLATE_KINDS } from './comment-templates.js';
import {
  CommentTemplateCreateSchema,
  CommentTemplateListQuerySchema,
  CommentTemplateSuggestQuerySchema,
  CommentTemplateUpdateSchema,
  TEMPLATE_ACTIONS,
} from './manager-comment-template.schema.js';
import { ManagerCommentTemplateService } from './manager-comment-template.service.js';

/**
 * MK20 / 4M TZ §8.1/6 — shablon izohlarning HTTP sirti.
 *
 * Ruxsat: `employees:read` (ko'rish/taklif) va `employees:full` (sozlash) —
 * `manager/queue` bilan AYNI darvoza. Yangi `PermissionEntity` kiritilmaydi
 * (u seed matritsasini talab qiladi va MK26–MK30 to'lqiniga tegishli).
 *
 * 🔴 Bu yerda hech bir endpoint jurnal yozmaydi. Jurnalga matn faqat
 * navbat/kun qabuli amallari orqali tushadi va u yerda ham MATN ko'chiriladi.
 */
@Controller('manager/comment-templates')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerCommentTemplateController {
  constructor(
    @Inject(ManagerCommentTemplateService)
    private readonly service: ManagerCommentTemplateService,
  ) {}

  /** Sozlamalar ekrani ro'yxati. */
  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.list(user.accountId, CommentTemplateListQuerySchema.parse(query ?? {}));
  }

  /**
   * Kontekst bo'yicha taklif (amal + qoida + til).
   *
   * Turlar va amallar ro'yxati javobda QAYTADI: ekran o'z nusxasini saqlasa,
   * ikkalasi bir kunda ajralib qolardi (MK07 da aynan shu sabab sabab-kodlari
   * ro'yxati BE'ga ko'chirilgan edi).
   */
  @Get('suggest')
  @RequireHrPermission('employees', 'read')
  async suggest(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const result = await this.service.suggest(
      user.accountId,
      CommentTemplateSuggestQuerySchema.parse(query ?? {}),
    );
    return { ...result, kinds: COMMENT_TEMPLATE_KINDS, actions: TEMPLATE_ACTIONS };
  }

  @Post()
  @RequireHrPermission('employees', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(
      user.accountId,
      user.sub,
      CommentTemplateCreateSchema.parse(body ?? {}),
    );
  }

  @Patch(':id')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, id, CommentTemplateUpdateSchema.parse(body ?? {}));
  }

  /** ARXIVLASH — qator o'chirilmaydi (`usageCount` statistikasi saqlanadi). */
  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequireHrPermission('employees', 'full')
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.restore(user.accountId, id);
  }
}
