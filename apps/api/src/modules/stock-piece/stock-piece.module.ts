import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { StockPieceAvailabilityService } from './stock-piece-availability.service.js';
import { StockPieceCutService } from './stock-piece-cut.service.js';
import { StockPieceDecisionService } from './stock-piece-decision.service.js';
import { StockPieceDigestCron } from './stock-piece-digest.cron.js';
import { StockPieceDigestService } from './stock-piece-digest.service.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';
import { StockPieceRegistryService } from './stock-piece-registry.service.js';
import { StockPieceController } from './stock-piece.controller.js';

/**
 * Bo'lak reyestri (K-reja). `PrismaModule` global, shuning uchun import
 * qilinmaydi — repo konventsiyasi (`tsd.module.ts` naqshi).
 *
 * To'rt servis:
 *   - `StockPieceReconcileService` (K1) — sverka, FAQAT O'QIYDI;
 *   - `StockPieceRegistryService` (K2) — reyestr boshqaruvi. U ham qoldiqqa
 *     tegmaydi: yozadigan yagona jadvali `stock_pieces` (+ `Product`
 *     bayrog'i). Har mutatsiyadan keyin (ombor × tovar) kesimidagi sverkani
 *     qaytaradi — K2/4-vazifa;
 *   - `StockPieceAvailabilityService` (K3) — kassir ko'rinishi: bo'lak
 *     tarkibi, «eng uzun uzluksiz» va so'ralgan miqdor uchun TAKLIF. U ham
 *     FAQAT O'QIYDI va BRAK omborini istisno qiladi (G4 E4 qoidasi);
 *   - `StockPieceCutService` (K4) — KESIM va uning chek bilan bog'lanishi.
 *     `stock_pieces` ga yozadigan ikkinchi (va oxirgi) yo'l. Tranzaksiyani
 *     CHAQIRUVCHI ochadi: kesim yig'ish qatorini yopish bilan, `post()` dagi
 *     iste'mol esa qoldiq ayirish bilan BITTA tranzaksiyada bo'lishi shart.
 *
 *   - `StockPieceDecisionService` (K6) — «hal qilinmagan» ro'yxati. FAQAT
 *     O'QIYDI: qarorni yozadigan yagona yo'l `StockPieceRegistryService.setFlag`;
 *   - `StockPieceDigestService` + `StockPieceDigestCron` (K6/5) — kunlik
 *     sverka signali. Cron yupqa o'ram (jadval + hisoblarni aylanish), qoida
 *     servisda ⇒ cron'siz ham testlanadi. `NotificationModule` shu ikkisi
 *     uchun import qilinadi.
 *
 * Hammasi EXPORT qilinadi: `RestockTaskModule` (yig'ish oqimi) va
 * `RetailSaleModule` (post/cancel) shu yerdan foydalanadi — ular
 * `stock_pieces` ga O'ZI tegmaydi.
 */
@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [StockPieceController],
  providers: [
    StockPieceReconcileService,
    StockPieceRegistryService,
    StockPieceAvailabilityService,
    StockPieceCutService,
    StockPieceDecisionService,
    StockPieceDigestService,
    StockPieceDigestCron,
  ],
  exports: [
    StockPieceReconcileService,
    StockPieceRegistryService,
    StockPieceAvailabilityService,
    StockPieceCutService,
    StockPieceDecisionService,
    StockPieceDigestService,
  ],
})
export class StockPieceModule {}
