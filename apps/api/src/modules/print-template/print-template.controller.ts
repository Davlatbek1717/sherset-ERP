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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { PrintTemplateService } from './print-template.service.js';

const OOXML_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@Controller('print-templates')
@UseGuards(JwtAuthGuard)
export class PrintTemplateController {
  constructor(@Inject(PrintTemplateService) private readonly svc: PrintTemplateService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  /**
   * «Скачать» — download the original uploaded Word/Excel template file so the
   * user can edit it (right-click → «Save as» on the link). 404s for HTML-body
   * templates. The filename is sent as RFC-5987 `filename*` (UTF-8) so Cyrillic
   * names survive; the browser save dialog gets the real template name.
   */
  @Get(':id/download')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.svc.getFileForDownload(user.accountId, id);
    const encoded = encodeURIComponent(`${file.name}.${file.ext}`);
    reply
      .header('Content-Type', OOXML_MIME[file.ext] ?? 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`)
      .send(file.bytes);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
