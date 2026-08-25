import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TsdController } from './tsd.controller.js';
import { TsdService } from './tsd.service.js';

/**
 * TSD sirti (G-reja G5). `PrismaModule` global, shuning uchun import
 * qilinmaydi — repo konventsiyasi (`product.module.ts` naqshi).
 */
@Module({
  imports: [AuthModule],
  controllers: [TsdController],
  providers: [TsdService],
  exports: [TsdService],
})
export class TsdModule {}
