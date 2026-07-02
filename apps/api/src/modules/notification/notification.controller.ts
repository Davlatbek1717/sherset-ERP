import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { type NotificationEvent, NotificationGateway } from './notification.gateway.js';
import { NotificationService } from './notification.service.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    @Inject(NotificationService) private readonly svc: NotificationService,
    @Inject(NotificationGateway) private readonly gateway: NotificationGateway,
  ) {}

  /**
   * Server-Sent Events stream. The browser opens a long-lived connection
   * via `new EventSource('/api/v1/notifications/stream')` and we push
   * each fresh notification down so the bell can update without
   * polling. Closes automatically when the client disconnects (RxJS
   * unsubscribe + Fastify request close).
   */
  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<{ data: NotificationEvent }> {
    return this.gateway.subscribe(user.accountId, user.sub);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, user.sub, query);
  }

  @Post('mark-read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.markRead(user.accountId, user.sub, body);
  }

  @Post('mark-all-read')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.markAllRead(user.accountId, user.sub);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }
}
