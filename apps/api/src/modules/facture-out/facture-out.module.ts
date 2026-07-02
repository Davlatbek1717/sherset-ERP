import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FactureOutController } from './facture-out.controller.js';
import { FactureOutService } from './facture-out.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FactureOutController],
  providers: [FactureOutService],
  exports: [FactureOutService],
})
export class FactureOutModule {}
