import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CountryController } from './country.controller.js';
import { CountryService } from './country.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CountryController],
  providers: [CountryService],
  exports: [CountryService],
})
export class CountryModule {}
