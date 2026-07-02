import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PublicViewController, PublicationController } from './publication.controller.js';
import { PublicationService } from './publication.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PublicationController, PublicViewController],
  providers: [PublicationService],
  exports: [PublicationService],
})
export class PublicationModule {}
