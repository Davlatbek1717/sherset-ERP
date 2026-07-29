import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupplyModule } from '../supply/supply.module.js';
import { SupplyApprovalController } from './supply-approval.controller.js';
import { SupplyApprovalService } from './supply-approval.service.js';

@Module({
  // AuthModule → JwtAuthGuard; SupplyModule → SupplyService (transition 'post').
  // PrismaService global.
  imports: [AuthModule, SupplyModule],
  controllers: [SupplyApprovalController],
  providers: [SupplyApprovalService],
  exports: [SupplyApprovalService], // Faza B (Telegram) applySupplierDecision'ni chaqiradi
})
export class SupplyApprovalModule {}
