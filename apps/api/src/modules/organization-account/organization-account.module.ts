import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationAccountController } from './organization-account.controller.js';
import { OrganizationAccountService } from './organization-account.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationAccountController],
  providers: [OrganizationAccountService],
  exports: [OrganizationAccountService],
})
export class OrganizationAccountModule {}
