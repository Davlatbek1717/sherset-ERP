import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContactPersonController } from './contact-person.controller.js';
import { ContactPersonService } from './contact-person.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ContactPersonController],
  providers: [ContactPersonService],
  exports: [ContactPersonService],
})
export class ContactPersonModule {}
