import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { StockPieceModule } from '../stock-piece/stock-piece.module.js';
import { RestockTaskController } from './restock-task.controller.js';
import { RestockTaskService } from './restock-task.service.js';

// K4 — `StockPieceModule` kesim servisi uchun (`stock_pieces` ga yozadigan
// yagona yo'l). Aylanma bog'lanish YO'Q: `StockPieceModule` o'z navbatida
// faqat `AuthModule` ni import qiladi.
@Module({
  imports: [AuthModule, NotificationModule, StockPieceModule],
  controllers: [RestockTaskController],
  providers: [RestockTaskService],
  exports: [RestockTaskService],
})
export class RestockTaskModule {}
