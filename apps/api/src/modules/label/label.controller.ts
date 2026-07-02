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
import { LabelService } from './label.service.js';

@Controller('label-templates')
@UseGuards(JwtAuthGuard)
export class LabelTemplateController {
  constructor(@Inject(LabelService) private readonly service: LabelService) {}

  @Get()
  @RequirePermission({ entity: 'label', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.listTemplates(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'label', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findTemplateById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'label', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.createTemplate(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'label', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateTemplate(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'label', action: 'update' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archiveTemplate(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'label', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.softDeleteTemplate(user.accountId, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'label', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.softDeleteTemplate(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'label', action: 'update' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archiveTemplate(user.accountId, id));
  }
}

/**
 * Print/render endpoint — separate controller so the URL shape stays
 * /labels/render and /labels/jobs instead of nested under templates.
 */
@Controller('labels')
@UseGuards(JwtAuthGuard)
export class LabelPrintController {
  constructor(@Inject(LabelService) private readonly service: LabelService) {}

  /** Render labels for a print job. Optionally records an audit row. */
  @Post('render')
  @RequirePermission({ entity: 'label', action: 'print' })
  async render(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.render(user.accountId, user.sub, body);
  }

  /** Print job history. */
  @Get('jobs')
  @RequirePermission({ entity: 'label', action: 'view' })
  async listJobs(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.service.listJobs(user.accountId, limit ? Number(limit) : undefined);
  }
}
