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
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BranchService } from './branch.service.js';

/**
 * Filial (branch) admin API — faza F001.
 *
 * Prefiks `admin/branches` — `cash-desk`/`store` bilan bir xil naqsh.
 * Har mutatsiya `@RequirePermission` bilan yopiq (`mutation-guard-coverage`
 * klass-qulfi buni majburlaydi); `branch` entity'si ruxsat lug'atining
 * «Master data» bo'limiga qo'shilgan.
 */
@Controller('admin/branches')
@UseGuards(JwtAuthGuard)
export class BranchController {
  constructor(@Inject(BranchService) private readonly svc: BranchService) {}

  @Get()
  @RequirePermission({ entity: 'branch', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'branch', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'branch', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'branch', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  /** Standart filialni ko'chirish — bitta tranzaksiyada (servis izohiga qara). */
  @Post(':id/set-default')
  @RequirePermission({ entity: 'branch', action: 'update' })
  async setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.setDefault(user.accountId, id);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'branch', action: 'update' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'branch', action: 'update' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'branch', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
