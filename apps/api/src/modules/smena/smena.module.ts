import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SmenaController } from './smena.controller.js';
import { SmenaService } from './smena.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SmenaController],
  providers: [SmenaService],
  exports: [SmenaService],
})
export class SmenaModule {}
