import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { SupplyApprovalService } from './supply-approval.service.js';

/**
 * Faza E: taminotchi PAROLSIZ magic-link endpointlari — `@UseGuards` YO'Q (public).
 * Auth = token o'zi (capability-token). Token supply+role+agentга bog'langan va
 * MUDDATLI; accountId token-qatordан olinadi (URL'дан EMAS) ⇒ cross-tenant yo'q.
 * FAQAT ko'rish + tasdiq/rad (CRUD/boshqa hech narsa yo'q).
 */
@Controller('p/qabul')
export class SupplyApprovalPublicController {
  constructor(@Inject(SupplyApprovalService) private readonly svc: SupplyApprovalService) {}

  /** Taminotchi ko'radigan qabul ko'rinishi (tovar ro'yxati, jami, bosqich). */
  @Get(':token')
  view(@Param('token') token: string) {
    return this.svc.getPublicSupplyView(token);
  }

  /** «Tasdiqlash» — taminotchi tasdiqladi. */
  @Post(':token/confirm')
  confirm(@Param('token') token: string) {
    return this.svc.decideViaLink(token, true);
  }

  /** «Rad etish» — sabab majburiy. */
  @Post(':token/reject')
  reject(@Param('token') token: string, @Body() body: { reason?: string }) {
    return this.svc.decideViaLink(token, false, body?.reason);
  }
}
