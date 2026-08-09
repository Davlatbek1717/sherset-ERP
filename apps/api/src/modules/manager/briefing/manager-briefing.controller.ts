import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { DayBriefingService } from './day-briefing.service.js';
import { BriefingKindSchema, BriefingSendSchema } from './manager-briefing.schema.js';

/**
 * MK19 — ertalabki brifing / kechki yakun HTTP sirti (4M TZ §8.1/5).
 *
 * So'rov parametri (davr/filtr) ATAYLAB yo'q: brifing «BUGUN» degan bitta
 * savolga javob beradi. Davr qo'shish uni hisobotga aylantirardi — hisobot
 * bo'limi allaqachon bor va bu ekran aynan o'sha hisobotlardan o'qiydi.
 *
 * ⚠️ **BLOKLAMAYDI va o'zgartirmaydi** — brifing faqat ko'rsatadi. Yagona
 * yozuv — Telegram navbatiga qo'yilgan xabar.
 *
 * Ruxsat: `report:view` (ko'rish) va `report:update` (Telegramga yuborish).
 * Yangi `PermissionEntity` ATAYLAB kiritilmadi (MK15/MK16 dagi bir xil qaror)
 * — ekran mavjud hisobot ma'lumotini ko'rsatadi, ya'ni hisobot huquqi to'g'ri
 * daraja; yangi entity seed matritsasini ham talab qilardi.
 */
@Controller('manager/briefing')
@UseGuards(JwtAuthGuard)
export class ManagerBriefingController {
  constructor(@Inject(DayBriefingService) private readonly service: DayBriefingService) {}

  /**
   * `kind` = `morning` | `evening`. O'lchanmagan blok `count: null` bilan
   * qaytadi va kun «tinch» deb ATALMAYDI.
   */
  @Get(':kind')
  @RequirePermission({ entity: 'report', action: 'view' })
  async snapshot(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string) {
    return this.service.snapshot(user.accountId, BriefingKindSchema.parse(kind));
  }

  /**
   * Digestni Telegram navbatiga qo'yadi. Shu kunning o'sha turdagi xabari
   * allaqachon navbatda/yuborilgan bo'lsa — `{ sent: false, skipped:
   * 'duplicate' }` (xato EMAS: takror bosish jazolanmaydi, lekin ikkinchi
   * xabar ham ketmaydi).
   */
  @Post(':kind/telegram')
  @RequirePermission({ entity: 'report', action: 'update' })
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ) {
    const parsed = BriefingSendSchema.parse(body ?? {});
    return this.service.sendDigest(user.accountId, BriefingKindSchema.parse(kind), {
      chatId: parsed.chatId,
    });
  }
}
