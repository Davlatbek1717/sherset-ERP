import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SmenaService } from './smena.service.js';

/**
 * Smena (`/settings/smena`) — kim, qaysi jadval bo'yicha, qaysi kassada.
 *
 * Faza Q10 (AUTH-07): CRUD `settings`, `open-session` esa `cashiersession.create`
 * (aynan `CashierSessionController#open` talab qiladigan ruxsat — POS sessiyasi
 * shu yo'l bilan ham ochiladi, ya'ni ruxsatni chetlab o'tuvchi ikkinchi eshik
 * bo'lib turgan edi). Ilgari ikkalasi ham faqat `JwtAuthGuard` ostida edi.
 * GET'lar ochiq: `mine` self-scope, ro'yxat esa POS ekraniga kerak.
 */
@Controller('admin/smenas')
@UseGuards(JwtAuthGuard)
export class SmenaController {
  constructor(@Inject(SmenaService) private readonly svc: SmenaService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.mine(user.accountId, user.sub);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Post('open-session')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  openSession(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.openSessionFromSmena(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
