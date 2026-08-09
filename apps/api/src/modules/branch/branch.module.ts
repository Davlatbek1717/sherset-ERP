import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BranchController } from './branch.controller.js';
import { BranchService } from './branch.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BranchController],
  providers: [BranchService],
  // F002/F003 (`Store`/`CashDesk` bog'lanishi, hujjatlarda `branchId` muhrlash)
  // shu servisdan foydalanadi — shuning uchun oshkora eksport.
  exports: [BranchService],
})
export class BranchModule {}
