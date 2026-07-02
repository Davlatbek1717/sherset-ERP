import { Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PresenceService } from './presence.service.js';

/**
 * Document presence («Смотрит») — the FE detail page POSTs a heartbeat while it
 * is open and renders the returned OTHER viewers as avatars next to the owner
 * block. Tenant-scoped via user.accountId; the viewer identity is the JWT's
 * employee (user.sub + user.name). See PresenceService for the in-memory model.
 */
@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(@Inject(PresenceService) private readonly svc: PresenceService) {}

  @Post(':entity/:entityId/heartbeat')
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
  ) {
    return {
      viewers: this.svc.heartbeat(user.accountId, entity, entityId, user.sub, user.name),
    };
  }

  @Post(':entity/:entityId/leave')
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
  ) {
    this.svc.leave(user.accountId, entity, entityId, user.sub);
    return { ok: true };
  }
}
