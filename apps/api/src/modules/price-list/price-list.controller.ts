import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { DocPdfService } from '../print-template/doc-pdf.service.js';
import type { RawDocInput } from '../print-template/print-render.util.js';
import { BulkIdsSchema, BulkPrintSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { PriceListTransitionSchema } from './price-list.schema.js';
import { PriceListService } from './price-list.service.js';

@Controller('price-lists')
@UseGuards(JwtAuthGuard)
export class PriceListController {
  constructor(
    @Inject(PriceListService) private readonly service: PriceListService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'pricelist', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'pricelist', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'pricelist', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'pricelist', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'pricelist', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.softDelete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'pricelist', action: 'create' })
  async clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.clone(user.accountId, user.sub, id);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'pricelist', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    const validTarget = PriceListTransitionSchema.parse(target);
    return this.service.transition(user.accountId, user.sub, id, validTarget);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'pricelist', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.softDelete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'pricelist', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    const validTarget = PriceListTransitionSchema.parse(target);
    return runBulk(ids, (id) => this.service.transition(user.accountId, user.sub, id, validTarget));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'pricelist', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    // PriceList lacks projectId — restrict to ownerId + description.
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'description']);
    return runBulk(ids, (id) => this.service.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'pricelist', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.service.findById(user.accountId, id);
      docs.push({
        title: "Narx ro'yxati",
        number: doc.name,
        date: doc.moment,
        // PriceList has no sumMinor column.
        sumMinor: null,
        currency: doc.currency ?? 'UZS',
        description: doc.description ?? null,
        organizationName: doc.organization?.name ?? null,
      });
      await this.service.markPrinted(user.accountId, id, true);
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'pricelist', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="price-lists-${ids.length}.pdf"`)
      .send(merged);
  }
}
