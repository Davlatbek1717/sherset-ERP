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
import { ShiftScheduleService } from './shift-schedule.service.js';

/**
 * Ish jadvali (`/settings/shift-schedules`) — smena boshlanish/tugash vaqti.
 *
 * Faza Q10 (AUTH-07): CRUD `settings` entity'si bilan yopildi. Jadval kechikish
 * daqiqalarini (`late-minutes.util`) va shundan kelib chiquvchi JARIMANI
 * belgilaydi ⇒ jadvalni siljitish = davomat tarixini qayta yozish. Ilgari har
 * autentifikatsiyalangan xodim buni qila olardi. GET ochiq qoladi (picker'lar).
 */
@Controller('admin/shift-schedules')
@UseGuards(JwtAuthGuard)
export class ShiftScheduleController {
  constructor(@Inject(ShiftScheduleService) private readonly svc: ShiftScheduleService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
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
