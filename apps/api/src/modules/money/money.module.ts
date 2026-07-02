import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MoneyOperationController } from './money-operation.controller.js';
import { MoneyOperationService } from './money-operation.service.js';
import { MoneyService } from './money.service.js';

@Module({
  // AuthModule provides TokenService + JwtAuthGuard, which
  // MoneyOperationController's @UseGuards(JwtAuthGuard) needs to resolve.
  // Without it the whole app fails to boot (every other doc module imports it).
  imports: [PrismaModule, AuthModule],
  controllers: [MoneyOperationController],
  providers: [MoneyService, MoneyOperationService],
  exports: [MoneyService],
})
export class MoneyModule {}
