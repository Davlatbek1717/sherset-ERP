import { createReadStream } from 'node:fs';
import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CounterpartyStatementService } from './counterparty-statement.service.js';

@Controller()
export class CounterpartyStatementController {
  constructor(
    @Inject(CounterpartyStatementService)
    private readonly svc: CounterpartyStatementService,
  ) {}

  /** Generate + persist + deliver an akt-sverka for a counterparty. */
  @Post('counterparty-statements/:counterpartyId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartyId', new ParseUUIDPipe()) counterpartyId: string,
    @Query('productId') productId?: string,
    // Only send the file to the counterparty when explicitly requested
    // («Kontragentga yuborish»). Default (generate/download) never messages them.
    @Query('deliver') deliver?: string,
  ) {
    const { row, cp, data } = await this.svc.generate(
      user.accountId,
      counterpartyId,
      user.sub ?? null,
      productId || undefined,
    );
    const delivery = await this.svc.deliver(
      user.accountId,
      { row, cp, finalBalanceMinor: data.finalBalanceMinor },
      deliver === 'true',
    );
    return {
      id: row.id,
      token: row.fileToken,
      fileName: row.fileName,
      finalBalanceMinor: data.finalBalanceMinor.toString(),
      downloadUrl: delivery.link,
      counterpartySent: delivery.counterpartySent,
    };
  }

  /** Past statements for a counterparty. */
  @Get('counterparty-statements/:counterpartyId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartyId', new ParseUUIDPipe()) counterpartyId: string,
  ) {
    const items = await this.svc.listForCounterparty(user.accountId, counterpartyId);
    return {
      items: items.map((r) => ({
        id: r.id,
        token: r.fileToken,
        fileName: r.fileName,
        finalBalanceMinor: r.finalBalanceMinor.toString(),
        currency: r.currency,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Report B — generate a «buyum bo'yicha» report (product → counterparties). */
  @Post('product-statements/:productId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'product', action: 'view' })
  async generateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    const res = await this.svc.generateProductReport(user.accountId, productId, user.sub ?? null);
    return {
      id: res.row.id,
      token: res.row.fileToken,
      fileName: res.row.fileName,
      productName: res.productName,
      totalSumMinor: res.totalSumMinor.toString(),
      downloadUrl: res.downloadUrl,
    };
  }

  @Get('product-statements/:productId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'product', action: 'view' })
  async listProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    const items = await this.svc.listForProduct(user.accountId, productId);
    return {
      items: items.map((r) => ({
        id: r.id,
        token: r.fileToken,
        fileName: r.fileName,
        finalBalanceMinor: r.finalBalanceMinor.toString(),
        currency: r.currency,
        createdAt: r.createdAt,
      })),
    };
  }

  /** «Qabul tovarlari» Excel for ONE supply (only this doc's goods). */
  @Post('supply-goods/:supplyId')
  @UseGuards(JwtAuthGuard)
  @RequirePermission({ entity: 'supply', action: 'view' })
  async supplyGoods(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplyId', new ParseUUIDPipe()) supplyId: string,
    @Query('deliver') deliver?: string,
  ) {
    const res = await this.svc.generateSupplyGoods(
      user.accountId,
      supplyId,
      user.sub ?? null,
      deliver === 'true',
    );
    return {
      id: res.row.id,
      token: res.row.fileToken,
      fileName: res.row.fileName,
      agentName: res.agentName,
      counterpartySent: res.counterpartySent,
      downloadUrl: res.link,
    };
  }

  /**
   * Download by capability token — NO auth (unguessable token = capability).
   * The bot link points here; the counterparty gets the file via MTProto, not this.
   */
  @Get('akt/:token')
  async download(@Param('token') token: string): Promise<StreamableFile> {
    const cleaned = token.replace(/\.xlsx$/i, '');
    const { filePath, fileName } = await this.svc.getByToken(cleaned);
    return new StreamableFile(createReadStream(filePath), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
  }
}
