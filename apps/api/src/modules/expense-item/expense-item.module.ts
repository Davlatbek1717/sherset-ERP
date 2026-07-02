import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExpenseItemController } from './expense-item.controller.js';
import { ExpenseItemService } from './expense-item.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ExpenseItemController],
  providers: [ExpenseItemService],
  exports: [ExpenseItemService],
})
export class ExpenseItemModule {}
