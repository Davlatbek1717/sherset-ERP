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
import { EdoService } from './edo.service.js';

@Controller('edo')
@UseGuards(JwtAuthGuard)
export class EdoController {
  constructor(@Inject(EdoService) private readonly svc: EdoService) {}

  // --- config -----------------------------------------------------------

  @Get('config')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getConfig(user.accountId);
  }

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

  /** Body: { pfxBase64, pfxPass } — base64-encoded PFX file. */
  @Post('config/pfx')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async setPfx(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { pfxBase64?: string; pfxPass?: string },
  ) {
    if (!body.pfxBase64 || !body.pfxPass) {
      throw new Error('pfxBase64 va pfxPass majburiy');
    }
    const bytes = Buffer.from(body.pfxBase64, 'base64');
    return this.svc.setPfx(user.accountId, bytes, body.pfxPass);
  }

  // --- submissions ------------------------------------------------------

  @Get('submissions')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listSubmissions(user.accountId, query);
  }

  @Get('submissions/:id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post('submissions/draft')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async createDraft(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.createDraft(user.accountId, body);
  }

  @Post('submissions/:id/sign')
  @RequirePermission({ entity: 'settings', action: 'approve' })
  async sign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.sign(user.accountId, id);
  }

  @Post('submissions/:id/submit')
  @RequirePermission({ entity: 'settings', action: 'approve' })
  async submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.submit(user.accountId, id);
  }

  @Post('submissions/:id/cancel')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.cancel(user.accountId, id, body.reason ?? '');
  }
}
