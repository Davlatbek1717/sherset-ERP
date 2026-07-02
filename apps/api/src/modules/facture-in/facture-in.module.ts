import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FactureInController } from './facture-in.controller.js';
import { FactureInService } from './facture-in.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FactureInController],
  providers: [FactureInService],
  exports: [FactureInService],
})
export class FactureInModule {}
