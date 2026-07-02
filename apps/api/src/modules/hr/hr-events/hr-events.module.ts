import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

// P0 — re-exports EventEmitter wiring so consumers (HrTelegramBridgeModule etc.)
// can inject EventEmitter2 without importing @nestjs/event-emitter directly.
@Module({
  imports: [EventEmitterModule],
  exports: [EventEmitterModule],
})
export class HrEventsModule {}
