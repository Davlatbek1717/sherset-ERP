import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SerialNumberController } from './serial-number.controller.js';
import { SerialNumberService } from './serial-number.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SerialNumberController],
  providers: [SerialNumberService],
  exports: [SerialNumberService],
})
export class SerialNumberModule {}
