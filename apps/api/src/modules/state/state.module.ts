import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StateController } from './state.controller.js';
import { StateService } from './state.service.js';

@Module({
  imports: [AuthModule],
  controllers: [StateController],
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {}
