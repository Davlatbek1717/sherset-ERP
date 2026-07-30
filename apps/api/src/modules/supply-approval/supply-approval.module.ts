import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupplyModule } from '../supply/supply.module.js';
import { SupplyApprovalPublicController } from './supply-approval-public.controller.js';
import { SupplyApprovalController } from './supply-approval.controller.js';
import { SupplyApprovalService } from './supply-approval.service.js';

@Module({
  // AuthModule → JwtAuthGuard; SupplyModule → SupplyService (transition 'post').
  // PrismaService global.
  imports: [AuthModule, SupplyModule],
  // SupplyApprovalPublicController — Faza E magic-link (guardsiz, token-auth).
  controllers: [SupplyApprovalController, SupplyApprovalPublicController],
  providers: [SupplyApprovalService],
  exports: [SupplyApprovalService], // Faza B (Telegram) applySupplierDecision'ni chaqiradi
})
export class SupplyApprovalModule {}
