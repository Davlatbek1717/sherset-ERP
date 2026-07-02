import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConsignmentController } from './consignment.controller.js';
import { ConsignmentService } from './consignment.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ConsignmentController],
  providers: [ConsignmentService],
  exports: [ConsignmentService],
})
export class ConsignmentModule {}
