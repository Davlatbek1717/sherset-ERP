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
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ProcessingProcessService } from './processing-process.service.js';

@Controller('processing-processes')
@UseGuards(JwtAuthGuard)
export class ProcessingProcessController {
  constructor(@Inject(ProcessingProcessService) private readonly svc: ProcessingProcessService) {}

  @Get()
  @RequirePermission({ entity: 'processingprocess', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'processingprocess', action: 'view' })
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'processingprocess', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'processingprocess', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Delete(':id/archive')
  @RequirePermission({ entity: 'processingprocess', action: 'delete' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, user.sub, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'processingprocess', action: 'create' })
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, user.sub, id);
  }

  @Put(':id/stages')
  @RequirePermission({ entity: 'processingprocess', action: 'update' })
  setStages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.setStages(user.accountId, user.sub, id, body);
  }
}
