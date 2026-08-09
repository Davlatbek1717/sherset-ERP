import { Controller, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { INBOUND_SIGNATURE_HEADER } from './online-order.inbound.js';
import { OnlineOrderService } from './online-order.service.js';

/** Fastify so'rovi + Nest'ning `rawBody: true` opsiyasi qo'shadigan xom tana. */
interface RawBodyRequest {
  rawBody?: Buffer;
}

/**
 * Onlayn buyurtma webhook qabul qiluvchisi (F042 · 2-bo'lim TZ §4.4).
 *
 * `JwtAuthGuard` YO'Q — tashqi do'kon/marketpleys bizning tokenimizni ko'tarmaydi
 * (Payme/Click/Telegram qabul qiluvchilari bilan bir xil naqsh). Uning o'rnini
 * kanal siri bilan **HMAC imzo** egallaydi va u servis ichida constant-time
 * tekshiriladi. Ijarachi (`accountId`) tanadan EMAS, kanal yozuvidan olinadi.
 *
 * Xom tana `main.ts` dagi `rawBody: true` orqali keladi: imzo aynan kelgan
 * baytlar ustidan tekshirilishi kerak, qayta-serializatsiya qilingan JSON
 * ustidan emas.
 */
@Controller('webhooks/online-orders')
export class OnlineOrderWebhookController {
  constructor(@Inject(OnlineOrderService) private readonly svc: OnlineOrderService) {}

  @Post(':channelId')
  async receive(
    @Param('channelId') channelId: string,
    @Headers(INBOUND_SIGNATURE_HEADER) signature: string | undefined,
    @Req() req: RawBodyRequest,
  ) {
    return this.svc.ingestWebhook(channelId, req.rawBody, signature);
  }
}
