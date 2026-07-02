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
import { LoyaltyService } from './loyalty.service.js';

@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(@Inject(LoyaltyService) private readonly svc: LoyaltyService) {}

  // --- programs --------------------------------------------------------

  @Get('programs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listPrograms(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.listPrograms(user.accountId, query);
  }

  @Get('programs/:id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findProgram(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findProgram(user.accountId, id);
  }

  @Post('programs')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async createProgram(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.createProgram(user.accountId, body);
  }

  @Patch('programs/:id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async updateProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.updateProgram(user.accountId, id, body);
  }

  @Post('programs/:id/archive')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async archiveProgram(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archiveProgram(user.accountId, id);
  }

  @Delete('programs/:id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async deleteProgram(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.deleteProgram(user.accountId, id);
  }

  // --- operations + balance + redeem ----------------------------------

  @Get('operations')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.listOperations(user.accountId, query);
  }

  @Post('operations')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async createOperation(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.createOperation(user.accountId, user.sub, body);
  }

  @Get('agents/:agentId/balance')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async getBalance(@CurrentUser() user: AuthenticatedUser, @Param('agentId') agentId: string) {
    return this.svc.getBalance(user.accountId, agentId);
  }

  /** POS redeem endpoint — race-safe, refuses negative balances. */
  @Post('redeem')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async redeem(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.redeem(user.accountId, user.sub, body);
  }
}
