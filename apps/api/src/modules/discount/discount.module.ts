import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DiscountController } from './discount.controller.js';
import { DiscountService } from './discount.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DiscountController],
  providers: [DiscountService],
  exports: [DiscountService],
})
export class DiscountModule {}
