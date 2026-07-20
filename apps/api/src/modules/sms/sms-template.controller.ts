import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SmsTemplateKeySchema } from './sms-template.schema.js';
import { SmsTemplateService } from './sms-template.service.js';

@Controller('sms/templates')
@UseGuards(JwtAuthGuard)
export class SmsTemplateController {
  constructor(@Inject(SmsTemplateService) private readonly svc: SmsTemplateService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Put(':key')
  @RequirePermission({ entity: 'settings', action: 'update' })
  upsert(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string, @Body() body: unknown) {
    const parsedKey = SmsTemplateKeySchema.parse(key);
    return this.svc.upsert(user.accountId, parsedKey, body);
  }
}
