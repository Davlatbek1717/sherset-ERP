import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrPositionController } from './hr-position.controller.js';
import { HrPositionService } from './hr-position.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrPositionController],
  providers: [HrPositionService],
  exports: [HrPositionService],
})
export class HrPositionModule {}
