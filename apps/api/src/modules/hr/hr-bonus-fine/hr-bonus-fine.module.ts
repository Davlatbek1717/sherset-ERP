import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrBonusFineRuleController } from './hr-bonus-fine-rule.controller.js';
import { HrBonusFineRuleService } from './hr-bonus-fine-rule.service.js';
import { HrBonusFineController } from './hr-bonus-fine.controller.js';
import { HrBonusFineService } from './hr-bonus-fine.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrBonusFineController, HrBonusFineRuleController],
  providers: [HrBonusFineService, HrBonusFineRuleService],
  exports: [HrBonusFineService, HrBonusFineRuleService],
})
export class HrBonusFineModule {}
