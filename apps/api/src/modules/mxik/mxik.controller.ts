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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { MxikService } from './mxik.service.js';

@Controller('mxik')
@UseGuards(JwtAuthGuard)
export class MxikController {
  constructor(@Inject(MxikService) private readonly svc: MxikService) {}

  @Get()
  @RequirePermission({ entity: 'mxik', action: 'view' })
  list(@Query() query: Record<string, unknown>) {
    return this.svc.list(query);
  }

  /**
   * GET /mxik/:code — single-code lookup. Returns 404 for archived codes
   * unless `?includeArchived=true` is set; useful when re-rendering an old
   * invoice whose MXIK has since been retired.
   */
  @Get(':code')
  @RequirePermission({ entity: 'mxik', action: 'view' })
  findByCode(@Param('code') code: string, @Query('includeArchived') includeArchived?: string) {
    return this.svc.findByCode(code, includeArchived === 'true');
  }

  @Post()
  @RequirePermission({ entity: 'mxik', action: 'create' })
  create(@Body() body: unknown) {
    return this.svc.create(body);
  }

  @Patch(':code')
  @RequirePermission({ entity: 'mxik', action: 'update' })
  update(@Param('code') code: string, @Body() body: unknown) {
    return this.svc.update(code, body);
  }

  @Post(':code/archive')
  @RequirePermission({ entity: 'mxik', action: 'create' })
  archive(@Param('code') code: string) {
    return this.svc.archive(code);
  }

  @Post(':code/restore')
  @RequirePermission({ entity: 'mxik', action: 'create' })
  restore(@Param('code') code: string) {
    return this.svc.restore(code);
  }

  /**
   * POST /mxik/bulk-import
   * Body: { rows: CreateMxik[] } (max 2000 per request)
   * UI consumes this via the ImportWizard pattern at /settings/mxik/import.
   */
  @Post('bulk-import')
  @RequirePermission({ entity: 'mxik', action: 'create' })
  bulkImport(@Body() body: unknown) {
    return this.svc.bulkImport(body);
  }

  /**
   * Hard delete is intentionally NOT exposed. Historical invoices store
   * the code as a string (no FK) and would silently render with a broken
   * label. Use POST /mxik/:code/archive instead.
   */
  @Delete(':code')
  @RequirePermission({ entity: 'mxik', action: 'delete' })
  // biome-ignore lint/suspicious/noExplicitAny: 405 marker, body never executed
  delete(@Param('code') _code: string): any {
    throw new Error(
      'MXIK rows must not be hard-deleted; archive instead via POST /mxik/:code/archive',
    );
  }
}
