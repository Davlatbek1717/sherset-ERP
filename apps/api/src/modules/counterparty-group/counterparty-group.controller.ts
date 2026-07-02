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
import { CounterpartyGroupService } from './counterparty-group.service.js';

// «Группы контрагентов» CRUD — scoped under the counterparty permission set (groups
// are a counterparty-domain reference, not a top-level entity in the matrix).
@Controller('counterparty-groups')
@UseGuards(JwtAuthGuard)
export class CounterpartyGroupController {
  constructor(@Inject(CounterpartyGroupService) private readonly svc: CounterpartyGroupService) {}

  @Get()
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Post()
  @RequirePermission({ entity: 'counterparty', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'counterparty', action: 'delete' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
