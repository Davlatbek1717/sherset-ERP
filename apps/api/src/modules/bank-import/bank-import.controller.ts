import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BankImportService } from './bank-import.service.js';

@Controller('bank-import')
@UseGuards(JwtAuthGuard)
export class BankImportController {
  constructor(@Inject(BankImportService) private readonly svc: BankImportService) {}

  @Get()
  @RequirePermission({ entity: 'bankimport', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Get(':id')
  @RequirePermission({ entity: 'bankimport', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  /**
   * POST /bank-import — parse the CSV content, persist a BankStatement +
   * BankStatementRow entries, auto-match counterparties by INN/account.
   */
  @Post()
  @RequirePermission({ entity: 'bankimport', action: 'create' })
  async upload(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upload(user.accountId, user.sub, body);
  }

  /**
   * POST /bank-import/:id/commit — create PaymentIn/Out drafts from the
   * matched rows (or `rowIds` subset). Per-row isolation: a failing row
   * doesn't abort the batch.
   */
  @Post(':id/commit')
  @RequirePermission({ entity: 'bankimport', action: 'create' })
  async commit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.commit(user.accountId, user.sub, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'bankimport', action: 'delete' })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.cancel(user.accountId, id);
  }
}
