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
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BulkIdsSchema, runBulk, runBulkImport } from '../shared/bulk.js';
import {
  BulkCreateTasksSchema,
  BulkSetStateSchema,
  CreateCounterpartySchema,
} from './counterparty.schema.js';
import { CounterpartyService } from './counterparty.service.js';

const BulkImportSchema = z.object({
  rows: z.array(CreateCounterpartySchema).min(1).max(500),
});

@Controller('counterparties')
@UseGuards(JwtAuthGuard)
export class CounterpartyController {
  constructor(@Inject(CounterpartyService) private readonly service: CounterpartyService) {}

  @Get()
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.list(user.accountId, q);
  }

  @Get(':id')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  // «N из ВСЕГО ‹ ›» record-nav — position in the default «Только обычные» list.
  @Get(':id/position')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findPosition(user.accountId, id);
  }

  // «Показатели» tab — sales / returns / per-organization balance analytics panel.
  @Get(':id/metrics')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  metrics(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.metrics(user.accountId, id);
  }

  // moysklad «...» → «Копировать» — clone the counterparty, return the new id.
  @Post(':id/clone')
  @RequirePermission({ entity: 'counterparty', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.clone(user.accountId, user.sub, id);
  }

  @Post()
  @RequirePermission({ entity: 'counterparty', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  /**
   * F9 — POS mijoz kartasidan telefon/izohni tuzatish.
   *
   * 🔴 NEGA ALOHIDA YO'L: kiosk chegarasi YO'L darajasida ishlaydi
   * (`KIOSK_ALLOWED`, TZ §3.1 — «bevosita URL bilan kirish bloklanishi
   * shart»). Yuqoridagi umumiy `PATCH :id` ni kioskga ochish kassirga
   * nom/narx turi/egasi/teglar/rekvizitlarni ham ochib yuborardi. Shu tor
   * yo'l esa `PosContactSchema` (`.strict()`) bilan ikki maydonga qulflangan.
   *
   * Ruxsat — o'sha `counterparty.update`: bu ikkinchi qatlam, birinchisi
   * (kiosk allowlist) yo'lni cheklaydi.
   */
  @Patch(':id/pos-contact')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  updatePosContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updatePosContact(user.accountId, user.sub, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, user.sub, id, true);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, user.sub, id, false);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'counterparty', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.delete(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'counterparty', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archive(user.accountId, user.sub, id, true));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archive(user.accountId, user.sub, id, false));
  }

  /**
   * POST /counterparties/bulk-set-state — «Статус ▾» quick-set.
   * Body: { ids: uuid[], stateId: uuid | null }. The state is validated ONCE
   * (counterparty-scoped, this account) before the per-id loop.
   */
  @Post('bulk-set-state')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async bulkSetState(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, stateId } = BulkSetStateSchema.parse(body);
    if (stateId) await this.service.assertCounterpartyState(user.accountId, stateId);
    return runBulk(ids, (id) => this.service.setState(user.accountId, user.sub, id, stateId));
  }

  /**
   * POST /counterparties/bulk-update — «Массовое редактирование».
   * Body: { ids, patch }. Only the fields present in `patch` are applied (per-field
   * opt-in); `null` clears a field. FK refs validated once against the account.
   */
  @Post('bulk-update')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  bulkUpdate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.bulkUpdate(user.accountId, user.sub, body);
  }

  /**
   * POST /counterparties/bulk-create-tasks — «Создать задачи» drawer.
   * Body: { ids, description, dueAt?, typeId? }. Creates ONE task per selected
   * counterparty (linked + assigned to the counterparty owner).
   */
  @Post('bulk-create-tasks')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async bulkCreateTasks(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = BulkCreateTasksSchema.parse(body);
    return this.service.bulkCreateTasks(user.accountId, user.sub, input);
  }

  /**
   * POST /counterparties/bulk-import
   * Body: { rows: CreateCounterparty[] } (max 500 per request)
   * Returns: per-row inserted/failed report — UI renders this in the
   * ImportWizard "Result" step so the operator can see exactly which
   * spreadsheet rows landed and which need manual fixing.
   */
  @Post('bulk-import')
  @RequirePermission({ entity: 'counterparty', action: 'create' })
  async bulkImport(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { rows } = BulkImportSchema.parse(body);
    return runBulkImport(rows, (row) => this.service.create(user.accountId, user.sub, row));
  }

  // === Bank accounts (nested under /counterparties/:id/bank-accounts) ===

  @Get(':id/bank-accounts')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  listBankAccounts(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.listBankAccounts(user.accountId, id);
  }

  @Post(':id/bank-accounts')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  createBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.createBankAccount(user.accountId, user.sub, id, body);
  }

  @Patch(':id/bank-accounts/:bankAccountId')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  updateBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('bankAccountId') bankAccountId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateBankAccount(user.accountId, user.sub, id, bankAccountId, body);
  }

  @Delete(':id/bank-accounts/:bankAccountId')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  removeBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    return this.service.deleteBankAccount(user.accountId, user.sub, id, bankAccountId);
  }
}
