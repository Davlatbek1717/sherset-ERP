import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CashDeskController } from './cash-desk.controller.js';
import { CashDeskService } from './cash-desk.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CashDeskController],
  providers: [CashDeskService],
  exports: [CashDeskService],
})
export class CashDeskModule {}
