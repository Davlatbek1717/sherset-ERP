import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CharacteristicController } from './characteristic.controller.js';
import { CharacteristicService } from './characteristic.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CharacteristicController],
  providers: [CharacteristicService],
  exports: [CharacteristicService],
})
export class CharacteristicModule {}
