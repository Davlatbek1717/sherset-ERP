import { createReadStream } from 'node:fs';
import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
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
  ) {
    const { row, cp, data } = await this.svc.generate(
      user.accountId,
      counterpartyId,
      user.sub ?? null,
    );
    const delivery = await this.svc.deliver(user.accountId, {
      row,
      cp,
      finalBalanceMinor: data.finalBalanceMinor,
    });
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
