import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { KorzinaController } from './korzina.controller.js';
import { KorzinaService } from './korzina.service.js';

@Module({
  imports: [AuthModule],
  controllers: [KorzinaController],
  providers: [KorzinaService],
  exports: [KorzinaService],
})
export class KorzinaModule {}
