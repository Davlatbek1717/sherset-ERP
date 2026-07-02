import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CashierSessionController } from './cashier-session.controller.js';
import { CashierSessionService } from './cashier-session.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CashierSessionController],
  providers: [CashierSessionService],
  exports: [CashierSessionService],
})
export class CashierSessionModule {}
