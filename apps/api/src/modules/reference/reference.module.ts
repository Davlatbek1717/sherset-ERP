import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReferenceController } from './reference.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [ReferenceController],
})
export class ReferenceModule {}
