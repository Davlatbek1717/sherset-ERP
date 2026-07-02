import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomEntityController } from './custom-entity.controller.js';
import { CustomEntityService } from './custom-entity.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomEntityController],
  providers: [CustomEntityService],
  exports: [CustomEntityService],
})
export class CustomEntityModule {}
