import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HR_TZ } from '../../hr/hr-shared/tz.util.js';
import { EmployeeDailyKpiService } from './employee-daily-kpi.service.js';

/**
 * Kunlik xodim KPI snapshot — 00:40 Asia/Tashkent, KECHAGI kun uchun.
 *
 * Nega kechagi kun va nega 00:40: analitika TZ §5.2 qoidasi — «bugungi kun
 * rollup'ga tushmaydi, u hali tugamagan». Yarim tundan keyin hisoblash kunning
 * oxirgi cheklarini ham qamrab oladi. Mavjud `HrKpiCron` (23:30, o'sha kunning
 * o'zi) bilan to'qnashmaydi: ular boshqa jadvallarga yozadi va bu bosqichda
 * parallel ishlaydi (eski ombor HR oylik dvigateli uchun saqlanadi).
 *
 * Naqsh `hr-kpi-cron.service.ts` dan: yupqa o'ram — faqat jadval va ustma-ust
 * tushish qo'riqchisi; hisoblash servisi cron'siz va testlanadigan qoladi.
 */
@Injectable()
export class EmployeeDailyKpiCron {
  private readonly logger = new Logger(EmployeeDailyKpiCron.name);
  private running = false;

  constructor(@Inject(EmployeeDailyKpiService) private readonly kpi: EmployeeDailyKpiService) {}

  @Cron('40 0 * * *', { timeZone: HR_TZ })
  async nightlyCompute(): Promise<void> {
    if (this.running) {
      this.logger.warn('KPI hisobi o`tkazib yuborildi: oldingi yurish tugamagan');
      return;
    }
    this.running = true;
    try {
      await this.kpi.computeYesterdayAllAccounts();
    } catch (e) {
      this.logger.error(`Kunlik KPI hisobi yiqildi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }
}
