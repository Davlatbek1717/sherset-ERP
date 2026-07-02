import {
  Body,
  Controller,
  Delete,
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
import { ReasonCodeService } from './reason-code.service.js';

@Controller('analitika/reason-codes')
@UseGuards(JwtAuthGuard)
export class ReasonCodeController {
  constructor(@Inject(ReasonCodeService) private readonly svc: ReasonCodeService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    await this.svc.seedDefaultsIfEmpty(user.accountId);
    return this.svc.list(user.accountId, query);
  }

  @Post()
  @RequirePermission({ entity: 'analitika', action: 'update' })
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

  @Delete(':id')
  @RequirePermission({ entity: 'analitika', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
