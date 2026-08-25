import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';
import { StockPieceRegistryService } from './stock-piece-registry.service.js';
import { StockPieceController } from './stock-piece.controller.js';

/**
 * Bo'lak reyestri (K-reja). `PrismaModule` global, shuning uchun import
 * qilinmaydi — repo konventsiyasi (`tsd.module.ts` naqshi).
 *
 * Ikki servis:
 *   - `StockPieceReconcileService` (K1) — sverka, FAQAT O'QIYDI;
 *   - `StockPieceRegistryService` (K2) — reyestr boshqaruvi. U ham qoldiqqa
 *     tegmaydi: yozadigan yagona jadvali `stock_pieces` (+ `Product`
 *     bayrog'i). Har mutatsiyadan keyin (ombor × tovar) kesimidagi sverkani
 *     qaytaradi — K2/4-vazifa.
 *
 * Ikkalasi ham EXPORT qilinadi: K3 (kassir ko'rinishi) va K4 (kesim oqimi)
 * shu yerdan foydalanadi.
 */
@Module({
  imports: [AuthModule],
  controllers: [StockPieceController],
  providers: [StockPieceReconcileService, StockPieceRegistryService],
  exports: [StockPieceReconcileService, StockPieceRegistryService],
})
export class StockPieceModule {}
