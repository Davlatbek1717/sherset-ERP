import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EdoController } from './edo.controller.js';
import { EdoService } from './edo.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EdoController],
  providers: [EdoService],
  exports: [EdoService],
})
export class EdoModule {}
