import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SkladKeeperController } from './sklad-keeper.controller.js';
import { SkladKeeperService } from './sklad-keeper.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SkladKeeperController],
  providers: [SkladKeeperService],
  exports: [SkladKeeperService],
})
export class SkladKeeperModule {}
