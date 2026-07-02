import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SmenaService } from './smena.service.js';

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
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Post('open-session')
  openSession(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.openSessionFromSmena(user.accountId, user.sub, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }
}
