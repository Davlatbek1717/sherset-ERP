import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ConsignmentService } from './consignment.service.js';

@Controller('consignments')
@UseGuards(JwtAuthGuard)
export class ConsignmentController {
  constructor(@Inject(ConsignmentService) private readonly service: ConsignmentService) {}

  @Get()
  @RequirePermission({ entity: 'consignment', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'consignment', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }
}
