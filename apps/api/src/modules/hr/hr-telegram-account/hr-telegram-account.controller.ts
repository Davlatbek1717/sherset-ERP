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
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  ConnectHrTelegramSchema,
  CreateHrTelegramAccountSchema,
  SetActiveHrTelegramAccountSchema,
} from './hr-telegram-account.schema.js';
import { HrTelegramAccountService } from './hr-telegram-account.service.js';

@Controller('hr/telegram-accounts')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrTelegramAccountController {
  constructor(@Inject(HrTelegramAccountService) private readonly svc: HrTelegramAccountService) {}

  @Get()
  @RequireHrPermission('settings', 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Get(':id')
  @RequireHrPermission('settings', 'read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequireHrPermission('settings', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateHrTelegramAccountSchema.parse(body);
    return this.svc.create(user.accountId, input);
  }

  /**
   * Soddalashtirilgan ulash — foydalanuvchi FAQAT telefonini beradi (apiId/
   * apiHash serverning env'idan). Slot 1 yaratiladi/yangilanadi; keyin odatiy
   * `:id/login/start` → `login/code` oqimi.
   */
  @Post('connect')
  @RequireHrPermission('settings', 'full')
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = ConnectHrTelegramSchema.parse(body);
    return this.svc.connectSingle(user.accountId, input.phoneNumber);
  }

  @Patch(':id/active')
  @RequireHrPermission('settings', 'full')
  async setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = SetActiveHrTelegramAccountSchema.parse(body);
    return this.svc.setActive(user.accountId, id, input.isActive);
  }

  @Delete(':id')
  @RequireHrPermission('settings', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
