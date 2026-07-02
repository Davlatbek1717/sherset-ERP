import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HelpController } from './help.controller.js';
import { HelpService } from './help.service.js';

@Module({
  imports: [AuthModule],
  controllers: [HelpController],
  providers: [HelpService],
  exports: [HelpService],
})
export class HelpModule {}
