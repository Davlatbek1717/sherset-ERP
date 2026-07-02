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
import { EmailService } from './email.service.js';

@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(@Inject(EmailService) private readonly svc: EmailService) {}

  /** GET /email/config — returns public-safe view (no password). */
  @Get('config')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getConfig(user.accountId);
  }

  /** PUT /email/config — create or update; password optional on update. */
  @Put('config')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async saveConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.saveConfig(user.accountId, body);
  }

  @Delete('config')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async deleteConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.deleteConfig(user.accountId);
  }

  /** POST /email/config/test — opens SMTP session, persists verdict. */
  @Post('config/test')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async testConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.testConnection(user.accountId);
  }

  /** POST /email/send */
  @Post('send')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async send(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.send(user.accountId, user.sub, body);
  }

  /** GET /email/logs?entity=Demand&entityId=... */
  @Get('logs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async logs(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listLogs(user.accountId, query);
  }

  /** POST /email/logs/:id/retry — re-enqueue a failed/dead email row. */
  @Post('logs/:id/retry')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async retryLog(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.retryLog(user.accountId, id);
  }
}
