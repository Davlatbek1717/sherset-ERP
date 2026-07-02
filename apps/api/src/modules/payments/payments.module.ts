import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/**
 * Unified «Платежи» list module (Деньги → Платежи). PrismaModule is global,
 * so only AuthModule (guard + permission decorator) is imported.
 */
@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
