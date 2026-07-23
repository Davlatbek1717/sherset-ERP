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
import { BulkIdsSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { ProjectService } from './project.service.js';

/**
 * Project (Проект) catalog API — moysklad Настройки → Справочники →
 * Проекты parity. The list/lookup read path also backs the document
 * "Проект" pickers. Write + bulk + mass-edit power the Settings catalog
 * page; bulk «Изменить» menu = {Удалить, Копировать, Массовое
 * редактирование, Поместить в архив, Извлечь из архива} (Копировать is a
 * disabled UI placeholder — no clone backend, see the web dropdown).
 */
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(@Inject(ProjectService) private readonly svc: ProjectService) {}

  @Get()
  @RequirePermission({ entity: 'project', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'project', action: 'view' })
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'project', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'project', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'project', action: 'update' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'project', action: 'update' })
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'project', action: 'delete' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  // ---- bulk «Изменить» surface --------------------------------------
  // Static routes are declared before the parametrised ones above only in
  // source order; Nest matches by exact path so `bulk-*` never collide
  // with `:id`.

  @Post('bulk-delete')
  @RequirePermission({ entity: 'project', action: 'delete' })
  bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'project', action: 'update' })
  bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.archive(user.accountId, id));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'project', action: 'update' })
  bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.restore(user.accountId, id));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'project', action: 'update' })
  massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    // Project has owner + description but no projectId — restrict the patch.
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'description', 'groupId', 'shared']);
    return runBulk(ids, (id) => this.svc.massEditApply(user.accountId, id, patch));
  }
}
