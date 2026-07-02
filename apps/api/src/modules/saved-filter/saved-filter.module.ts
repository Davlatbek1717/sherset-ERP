import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SavedFilterController } from './saved-filter.controller.js';
import { SavedFilterService } from './saved-filter.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SavedFilterController],
  providers: [SavedFilterService],
  exports: [SavedFilterService],
})
export class SavedFilterModule {}
