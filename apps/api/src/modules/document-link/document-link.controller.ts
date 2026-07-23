import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { DocumentLinkService } from './document-link.service.js';

/**
 * `/document-links` — moysklad «Привязать документ». Reuses the `attachment`
 * permission entity (both are polymorphic per-document associations, already
 * seeded on every account) so no new permission row / seed top-up is needed.
 */
@Controller('document-links')
@UseGuards(JwtAuthGuard)
export class DocumentLinkController {
  constructor(@Inject(DocumentLinkService) private readonly svc: DocumentLinkService) {}

  /** GET /document-links?entityType=Supply&entityId=… — manual links for a doc. */
  @Get()
  @RequirePermission({ entity: 'attachment', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return { items: await this.svc.listFor(user.accountId, query) };
  }

  /** GET /document-links/search — «Привязка документа» unified doc search. */
  @Get('search')
  @RequirePermission({ entity: 'attachment', action: 'view' })
  async search(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.search(user.accountId, query);
  }

  @Post()
  @RequirePermission({ entity: 'attachment', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'attachment', action: 'delete' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
