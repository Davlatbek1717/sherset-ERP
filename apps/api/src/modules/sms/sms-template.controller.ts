import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CHANNELS, type TemplateChannel } from './sms-template.schema.js';
import { MessageTemplateService } from './sms-template.service.js';

@Controller('message-templates')
@UseGuards(JwtAuthGuard)
export class MessageTemplateController {
  constructor(@Inject(MessageTemplateService) private readonly svc: MessageTemplateService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('channel') channel?: string) {
    const ch = CHANNELS.includes(channel as TemplateChannel)
      ? (channel as TemplateChannel)
      : undefined;
    return this.svc.list(user.accountId, ch);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'update' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  // `:id/default` statik segment — `:id` dan OLDIN.
  @Put(':id/default')
  @RequirePermission({ entity: 'settings', action: 'update' })
  setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.setDefault(user.accountId, id);
  }

  @Put(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
