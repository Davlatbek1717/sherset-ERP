import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { AttachmentService } from './attachment.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(@Inject(AttachmentService) private readonly svc: AttachmentService) {}

  /** GET /attachments?entity=Demand&entityId=... (per-document panel). */
  @Get('attachments')
  @RequirePermission({ entity: 'attachment', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  /**
   * GET /attachments/all?entity=&search=&limit=&cursor= — account-wide
   * file repository for the moysklad «Файлы» homepage tab. Static path
   * declared before the `:attachmentId` routes so it never collides.
   */
  @Get('attachments/all')
  @RequirePermission({ entity: 'attachment', action: 'view' })
  async listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listAccountWide(user.accountId, query);
  }

  /** POST /attachments — JSON body { entity, entityId, filename, mime, dataBase64, description? } */
  @Post('attachments')
  @RequirePermission({ entity: 'attachment', action: 'create' })
  async upload(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upload(user.accountId, user.sub, body);
  }

  /**
   * GET /attachments/:attachmentId/raw — streams the binary with the right
   * Content-Type and a Content-Disposition that hints inline display where
   * the browser supports it (PDF, images), download otherwise.
   */
  @Get('attachments/:attachmentId/raw')
  @RequirePermission({ entity: 'attachment', action: 'view' })
  @Header('Cache-Control', 'private, max-age=300')
  async raw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StreamableFile> {
    const { buffer, mime, filename } = await this.svc.getRaw(user.accountId, attachmentId);
    res.header('Content-Type', mime);
    res.header('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    return new StreamableFile(buffer);
  }

  @Delete('attachments/:attachmentId')
  @RequirePermission({ entity: 'attachment', action: 'delete' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.svc.delete(user.accountId, attachmentId);
  }
}
