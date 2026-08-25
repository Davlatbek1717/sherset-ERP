import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';
import { StockPieceController } from './stock-piece.controller.js';

/**
 * Bo'lak reyestri (K-reja). `PrismaModule` global, shuning uchun import
 * qilinmaydi — repo konventsiyasi (`tsd.module.ts` naqshi).
 *
 * Servis EXPORT qilinadi: K2 boshqaruv ekrani har o'zgarishdan keyin sverkani
 * shu yerdan chaqiradi (reja K2/4-vazifa: «har o'zgarish sverkani buzsa —
 * ekranda darhol ko'rinadi»).
 */
@Module({
  imports: [AuthModule],
  controllers: [StockPieceController],
  providers: [StockPieceReconcileService],
  exports: [StockPieceReconcileService],
})
export class StockPieceModule {}
