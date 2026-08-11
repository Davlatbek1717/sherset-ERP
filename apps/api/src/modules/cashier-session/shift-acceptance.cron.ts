import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HR_TZ } from '../hr/hr-shared/tz.util.js';
import { SHIFT_ESCALATE_AFTER_DAYS } from './shift-acceptance.js';
import { ShiftAcceptanceService } from './shift-acceptance.service.js';

/**
 * SMENA QABULI — kechalik eskalatsiya (F13).
 *
 * NEGA BU FAYL BOR: `ShiftAcceptanceService.escalateOverdue` MK08 da yozildi,
 * testlandi va modulga ulandi — lekin uni HECH KIM chaqirmasdi. Ya'ni
 * `SHIFT_ESCALATE_AFTER_DAYS` hech qachon ishlamagan: menejer javobsiz
 * qoldirgan smena navbatda ABADIY qolardi va egasi (`force_accept`) unga
 * faqat menejer QO'LDA eskalatsiya qilsagina yeta olardi. Bu «yetim modul =
 * o'lik funksiya» klassi — kod kompilyatsiya bo'ladi, testlari yashil, faqat
 * hech qachon YURMAYDI.
 *
 * Naqsh `employee-daily-kpi.cron.ts` dan: **yupqa o'ram** — faqat jadval,
 * hisoblarni aylanish va ustma-ust tushish qo'riqchisi. Qoida va I/O servisda
 * qoladi, ya'ni cron'siz ham testlanadi.
 *
 * 🔴 Bu yerda `markStale` ATAYLAB chaqirilmaydi. U vaqt bo'yicha emas,
 * HODISA bo'yicha ishlaydi: «qabul qilingan smenaning hujjati keyin o'zgardi».
 * Uni cron'dan davriy chaqirish har kecha yopilgan smenalarni sababsiz
 * «eskirdi» deb belgilab, menejer navbatini yolg'on signal bilan to'ldirardi.
 * Chaqiruvchisi — chek tahriri/qaytarish oqimi (hali yo'q, MK08 hisobotida
 * ochiq qarz sifatida yozilgan).
 */
@Injectable()
export class ShiftAcceptanceCron {
  private readonly logger = new Logger(ShiftAcceptanceCron.name);
  private running = false;

  constructor(
    @Inject(ShiftAcceptanceService) private readonly acceptance: ShiftAcceptanceService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * 01:20 Asia/Tashkent — kunlik KPI cron'idan (00:40) KEYIN.
   *
   * Vaqt ataylab ajratilgan: ikkalasi ham barcha hisoblarni aylanadi va bir
   * daqiqada yurса bazani ikki barobar yuklardi. Eskalatsiya kun aniqligida
   * ishlaydi (`SHIFT_ESCALATE_AFTER_DAYS` kun), shu sababli aniq daqiqa
   * ahamiyatsiz — muhimi HAR KUNI bir marta yurishi.
   */
  @Cron('20 1 * * *', { timeZone: HR_TZ })
  async nightlyEscalate(): Promise<void> {
    if (this.running) {
      this.logger.warn('Smena eskalatsiyasi o`tkazib yuborildi: oldingi yurish tugamagan');
      return;
    }
    this.running = true;
    try {
      await this.escalateAllAccounts();
    } catch (e) {
      this.logger.error(`Smena eskalatsiyasi yiqildi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Bitta hisobning xatosi qolganlarini TO'XTATMAYDI — `employee-daily-kpi.cron`
   * bilan bir xil qoida. Bitta buzuq hisob butun tarmoqning navbatini
   * muzlatib qo'ymasin.
   */
  private async escalateAllAccounts(): Promise<void> {
    const accounts = await this.prisma.client.account.findMany({ select: { id: true } });
    for (const acc of accounts) {
      try {
        const { escalated } = await this.acceptance.escalateOverdue(acc.id);
        if (escalated > 0) {
          this.logger.log(
            `Smena qabuli[${acc.id}]: ${escalated} smena egasiga chiqdi ` +
              `(${SHIFT_ESCALATE_AFTER_DAYS} kun javobsiz)`,
          );
        }
      } catch (e) {
        this.logger.error(
          `Smena eskalatsiyasi[${acc.id}] yiqildi: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }
}
