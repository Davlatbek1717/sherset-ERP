import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentController } from './attachment.controller.js';
import { AttachmentService } from './attachment.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
