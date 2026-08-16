import { Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { DebtReceiptService } from './debt-receipt.service.js';

/**
 * «Hisob-kitob cheki» — mijoz kartasidan Telegramga (egasi, 2026-08-16).
 *
 * 🔴 O'Z PREFIKSI (`/counterparty-debt-receipts`), `/counterparties` EMAS:
 * o'sha prefiks boshqa modulda va bir xil yo'lni ikki controller e'lon qilsa
 * Fastify BOOT paytida yiqiladi — bu repoda o'lchangan 502 sinfi
 * («takroriy route → prod 502»). Alohida prefiks kolliziyani printsipial
 * imkonsiz qiladi.
 *
 * Ruxsatlar ATAYLAB asimmetrik: ko'rish — `counterparty.view` (hisobni ko'rish
 * kartani ko'rish bilan bir xil), YUBORISH — `counterparty.update` (mijozga
 * xabar ketadi, bu tashqi ta'sir; mavjud `telegram/counterparty/:id/send`
 * bilan bir xil daraja).
 */
@Controller('counterparty-debt-receipts')
@UseGuards(JwtAuthGuard)
export class DebtReceiptController {
  constructor(@Inject(DebtReceiptService) private readonly svc: DebtReceiptService) {}

  /** Ko'rib chiqish: matn + yuborish holati. Hech narsa yubormaydi/yaratmaydi. */
  @Get(':counterpartyId/preview')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartyId') counterpartyId: string,
  ) {
    return this.svc.preview(user.accountId, counterpartyId);
  }

  /** Yuborish — navbatga qo'yadi (egasining shaxsiy Telegram raqamidan). */
  @Post(':counterpartyId/send')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartyId') counterpartyId: string,
  ) {
    return this.svc.send(user.accountId, counterpartyId);
  }
}
