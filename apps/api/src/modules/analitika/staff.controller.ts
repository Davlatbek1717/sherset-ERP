import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { StaffService } from './staff.service.js';

@Controller('analitika/staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(@Inject(StaffService) private readonly svc: StaffService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  /**
   * Role catalogue for the wizard step. Lives on the staff endpoint so an
   * "analitika.view + analitika.create" admin can populate the picker
   * without needing a separate role.view grant.
   */
  @Get('roles')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async roles(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listRoles(user.accountId);
  }

  @Get(':id')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'analitika', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'analitika', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }
}
