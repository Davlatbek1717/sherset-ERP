import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
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
import {
  CreateHrTaskTemplateSchema,
  HrTaskTemplateFilterSchema,
  UpdateHrTaskTemplateSchema,
} from './hr-task-template.schema.js';
import { HrTaskTemplateService } from './hr-task-template.service.js';

@Controller('hr/task-templates')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrTaskTemplateController {
  constructor(@Inject(HrTaskTemplateService) private readonly svc: HrTaskTemplateService) {}

  @Get()
  @RequireHrPermission('tasks', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = HrTaskTemplateFilterSchema.parse(query);
    return this.svc.list(user.accountId, filter);
  }

  @Get(':id')
  @RequireHrPermission('tasks', 'read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequireHrPermission('tasks', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateHrTaskTemplateSchema.parse(body);
    return this.svc.create(user.accountId, input);
  }

  @Put(':id')
  @RequireHrPermission('tasks', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateHrTaskTemplateSchema.parse(body);
    return this.svc.update(user.accountId, id, input);
  }

  @Patch(':id/active')
  @RequireHrPermission('tasks', 'full')
  async setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.svc.setActive(user.accountId, id, !!body.isActive);
  }

  @Delete(':id')
  @RequireHrPermission('tasks', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
