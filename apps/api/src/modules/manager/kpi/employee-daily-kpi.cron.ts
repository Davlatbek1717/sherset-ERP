import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ } from '../../hr/hr-shared/tz.util.js';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';
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

  constructor(
    @Inject(EmployeeDailyKpiService) private readonly kpi: EmployeeDailyKpiService,
    @Inject(DailyKpiAcceptanceService) private readonly acceptance: DailyKpiAcceptanceService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Uch qadam, AYNAN shu tartibda:
   *   1. hisobla — kechagi kun raqamlari;
   *   2. ko'rikka qo'y — tugagan kunlar `computed` → `pending`;
   *   3. eskalatsiya qil — N kundan beri javobsiz turganlar egaga.
   *
   * Tartib muhim: hisoblanmagan kunni ko'rikka qo'yib bo'lmaydi, va ko'rikka
   * qo'yilmagan kun hech qachon eskalatsiya bosqichiga yetmaydi.
   */
  @Cron('40 0 * * *', { timeZone: HR_TZ })
  async nightlyCompute(): Promise<void> {
    if (this.running) {
      this.logger.warn('KPI hisobi o`tkazib yuborildi: oldingi yurish tugamagan');
      return;
    }
    this.running = true;
    try {
      await this.kpi.computeYesterdayAllAccounts();
      await this.openAndEscalateAllAccounts();
    } catch (e) {
      this.logger.error(`Kunlik KPI hisobi yiqildi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Bitta hisobning xatosi qolganlarini to'xtatmaydi — `computeYesterdayAllAccounts`
   * bilan bir xil qoida. Menejer navbatini bitta buzuq hisob yo'q qilmasin.
   */
  private async openAndEscalateAllAccounts(): Promise<void> {
    const accounts = await this.prisma.client.account.findMany({ select: { id: true } });
    for (const acc of accounts) {
      try {
        const { opened } = await this.acceptance.openForReview(acc.id);
        const { escalated } = await this.acceptance.escalateOverdue(acc.id);
        if (opened > 0 || escalated > 0) {
          this.logger.log(
            `Qabul[${acc.id}]: ${opened} ko'rikka qo'yildi, ${escalated} eskalatsiya`,
          );
        }
      } catch (e) {
        this.logger.error(`Qabul[${acc.id}] yiqildi: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
