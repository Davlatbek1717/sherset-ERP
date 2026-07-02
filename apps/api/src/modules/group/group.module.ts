import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupController } from './group.controller.js';
import { GroupService } from './group.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}
