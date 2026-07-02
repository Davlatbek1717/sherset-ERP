import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrRoleController } from './hr-role.controller.js';
import { HrRoleService } from './hr-role.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrRoleController],
  providers: [HrRoleService],
  exports: [HrRoleService],
})
export class HrRoleModule {}
