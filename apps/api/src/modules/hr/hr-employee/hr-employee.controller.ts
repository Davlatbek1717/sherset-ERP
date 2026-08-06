import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { BulkIdsSchema, runBulk } from '../../shared/bulk.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { EmployeeTelegramService } from './employee-telegram.service.js';
import {
  CreateHrEmployeeSchema,
  HrEmployeeFilterSchema,
  SetEmployeeImageSchema,
  SetPasswordSchema,
  UpdateHrEmployeeSchema,
} from './hr-employee.schema.js';
import { HrEmployeeService } from './hr-employee.service.js';
import { OffboardingService } from './offboarding.service.js';

@Controller('hr/employees')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEmployeeController {
  constructor(
    @Inject(HrEmployeeService) private readonly svc: HrEmployeeService,
    @Inject(EmployeeTelegramService) private readonly telegram: EmployeeTelegramService,
    @Inject(OffboardingService) private readonly offboarding: OffboardingService,
  ) {}

  // ── Bo'shatish ro'yxati (4M.4 «hayot sikli») ──────────────────────────────
  //
  // Arxivlashning O'ZI login va refresh'ni yopadi, lekin Telegram bog'lami,
  // ochiq kassa smenasi, qabul qilinmagan KPI kunlari va topshirilmagan
  // jihoz ochiq qolardi. Ro'yxat tugamaguncha xodim arxivlanmaydi.
  //
  // `:id` li yo'llardan OLDIN — statik segment birinchi (fayl konventsiyasi).

  /** Tugallanmagan bo'shatishlar — menejer ekrani. */
  @Get('offboarding')
  @RequireHrPermission('employees', 'read')
  async listOffboarding(@CurrentUser() user: AuthenticatedUser) {
    return this.offboarding.listOpen(user.accountId);
  }

  /** Bitta xodimning bo'shatish holati (ro'yxat + qolgan to'siqlar). */
  @Get(':id/offboarding')
  @RequireHrPermission('employees', 'read')
  async offboardingStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offboarding.status(user.accountId, id);
  }

  /** Jarayonni boshlash — idempotent (mavjudini qaytaradi, ro'yxatni tozalamaydi). */
  @Post(':id/offboarding')
  @RequireHrPermission('employees', 'full')
  async startOffboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offboarding.start(user.accountId, user.sub, id, body);
  }

  /** Qo'lda tasdiqlanadigan bandni belgilash (`auto` band rad etiladi). */
  @Post(':id/offboarding/item')
  @RequireHrPermission('employees', 'full')
  async markOffboardingItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offboarding.markItem(user.accountId, user.sub, id, body);
  }

  /** Yakunlash — ro'yxat to'liq bo'lsagina xodim arxivlanadi. */
  @Post(':id/offboarding/complete')
  @RequireHrPermission('employees', 'full')
  async completeOffboarding(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offboarding.complete(user.accountId, id);
  }

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = HrEmployeeFilterSchema.parse(query);
    return this.svc.list(user.accountId, filter);
  }

  @Get('moysklad-agents')
  @RequireHrPermission('employees', 'read')
  async agents(@CurrentUser() user: AuthenticatedUser, @Query('excludeId') excludeId?: string) {
    return this.svc.moyskladAgentsForDropdown(user.accountId, excludeId);
  }

  @Get(':id')
  @RequireHrPermission('employees', 'read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // includeArchived: the moysklad employee card opens archived rows too —
    // «Извлечь из архива» is only reachable from the card itself.
    return this.svc.findOne(user.accountId, id, { includeArchived: true });
  }

  @Post()
  @RequireHrPermission('employees', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateHrEmployeeSchema.parse(body);
    return this.svc.create(user.accountId, input, user.sub);
  }

  @Put(':id')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateHrEmployeeSchema.parse(body);
    return this.svc.update(user.accountId, id, input, user.sub);
  }

  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.softDelete(user.accountId, id, user.sub);
  }

  // ─── Bulk «Изменить» (moysklad #employee toolbar) ────────────────────────
  // moysklad's employee «Изменить» menu = {Удалить, Поместить в архив,
  // Извлечь из архива}. Each runs per-id via runBulk (Promise.allSettled) so
  // one failure (e.g. an FK-restricted hard delete) reports as a partial
  // result rather than aborting the batch. user.sub is forwarded so the
  // service can block self-archive/self-delete (login filters archived).
  // NOTE: these static POST routes MUST stay declared BEFORE @Post(':id/...')
  // so 'bulk-archive' is never matched as an :id param.

  @Post('bulk-archive')
  @RequireHrPermission('employees', 'full')
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.setArchived(user.accountId, id, true, user.sub));
  }

  @Post('bulk-restore')
  @RequireHrPermission('employees', 'full')
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.setArchived(user.accountId, id, false, user.sub));
  }

  @Post('bulk-delete')
  @RequireHrPermission('employees', 'full')
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.hardDelete(user.accountId, id, user.sub));
  }

  // ─── moysklad card «Изображение» ─────────────────────────────────────────

  /** Raw photo bytes for <img src> (auth via ?access_token=, like /images). */
  @Get(':id/image/raw')
  @RequireHrPermission('employees', 'read')
  @Header('Cache-Control', 'private, max-age=60')
  async imageRaw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StreamableFile> {
    const { buffer, mime, filename } = await this.svc.getImageRaw(user.accountId, id);
    res.header('Content-Type', mime);
    res.header('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    return new StreamableFile(buffer);
  }

  /** Upload/replace the photo — JSON { filename, mime, dataBase64 }. */
  @Put(':id/image')
  @RequireHrPermission('employees', 'full')
  async setImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = SetEmployeeImageSchema.parse(body);
    return this.svc.setImage(user.accountId, id, input, user.sub);
  }

  /** moysklad ⊗ — remove the photo. */
  @Delete(':id/image')
  @RequireHrPermission('employees', 'full')
  async removeImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.removeImage(user.accountId, id, user.sub);
  }

  @Post(':id/set-password')
  @RequireHrPermission('employees', 'full')
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = SetPasswordSchema.parse(body);
    return this.svc.setPassword(user.accountId, id, input, user.sub);
  }

  // ─── Telegram bog'lash (Faza D1) ─────────────────────────────────────────
  // «Telegram ulash» → bir-martalik token + deep-link (xodim botni START qiladi,
  // bot `/start bind_<token>`ни tanaydi). «Uzish» → chat_id tozalanadi.
  @Post(':id/telegram-bind-token')
  @RequireHrPermission('employees', 'full')
  async telegramBindToken(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.telegram.issueBindToken(user.accountId, id);
  }

  @Delete(':id/telegram')
  @RequireHrPermission('employees', 'full')
  async telegramUnbind(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.telegram.unbind(user.accountId, id);
    return { ok: true };
  }
}
