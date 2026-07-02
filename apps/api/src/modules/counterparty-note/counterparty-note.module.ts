import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyNoteController } from './counterparty-note.controller.js';
import { CounterpartyNoteService } from './counterparty-note.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CounterpartyNoteController],
  providers: [CounterpartyNoteService],
  exports: [CounterpartyNoteService],
})
export class CounterpartyNoteModule {}
