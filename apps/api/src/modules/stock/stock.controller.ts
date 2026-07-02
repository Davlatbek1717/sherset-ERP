import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StockService } from './stock.service.js';

/**
 * Read-only stock balance endpoint for UI (Demand form stock badges, etc.).
 */
@Controller('stocks')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  /** Forward-pick replenishment list — products below their forwardMax target. */
  @Get('replenishment')
  async replenishment(@CurrentUser() user: AuthenticatedUser) {
    return this.stock.replenishmentList(user.accountId);
  }

  @Get()
  async balances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId: string,
    @Query('assortmentIds') assortmentIds: string,
    @Query('assortmentKind') assortmentKind?: string,
  ): Promise<{
    items: Array<{
      assortmentId: string;
      qty: string;
      reservedQty: string;
      costBalanceMinor: string;
    }>;
  }> {
    if (!storeId) throw new BadRequestException('storeId is required');
    if (!assortmentIds) return { items: [] };

    const kind = assortmentKind ?? 'product';
    const ids = assortmentIds.split(',').filter(Boolean);
    const balances = await this.stock.getBalances(
      user.accountId,
      storeId,
      ids.map((id) => ({ kind, id })),
    );

    return {
      items: ids.map((id) => {
        const b = balances.get(id);
        return {
          assortmentId: id,
          qty: b?.qty ?? '0',
          reservedQty: b?.reservedQty ?? '0',
          // moysklad «Себестоимость списания» preview — the store's
          // weighted-average cost BALANCE (tiyin) for this assortment. The
          // #loss editor divides it by `qty` to show the per-unit «Цена» the
          // write-off will book at post. Read-only; the authoritative cost is
          // recomputed in LossService.post (066d55fb — valuation parity).
          costBalanceMinor: b?.costBalanceMinor ?? '0',
        };
      }),
    };
  }
}
