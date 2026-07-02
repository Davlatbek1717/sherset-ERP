import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceIntegrationModule {}
