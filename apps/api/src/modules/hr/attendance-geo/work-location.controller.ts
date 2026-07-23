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
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { HrWorkLocationService } from './work-location.service.js';

@Controller('hr/work-locations')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrWorkLocationController {
  constructor(@Inject(HrWorkLocationService) private readonly svc: HrWorkLocationService) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query('archived') archived?: string) {
    return this.svc.list(user.accountId, archived === 'true');
  }

  @Post()
  @RequireHrPermission('employees', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Put(':id')
  @RequireHrPermission('employees', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
