import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HR_TZ } from '../hr/hr-shared/tz.util.js';
import { StockPieceDigestService } from './stock-piece-digest.service.js';

/**
 * K6/5 — KUNLIK BO'LAK SVERKASI (cron o'rami).
 *
 * Naqsh `shift-acceptance.cron.ts` dan: **yupqa o'ram** — faqat jadval,
 * hisoblarni aylanish va ustma-ust tushish qo'riqchisi. Qoida va I/O
 * `StockPieceDigestService` da qoladi, ya'ni cron'siz ham testlanadi.
 *
 * 🔴 **Vaqt — 20:00 Asia/Tashkent, ATAYLAB SAVDODAN KEYIN.** H5 hisobotidagi
 * «muntazam yuritish tartibi» bilan bir qoida: kunduzi omborchi sanaydi va
 * kesadi, ya'ni reyestr bilan qoldiq orasidagi farq kun bo'yi normal holat
 * bo'lib turadi. Savdo davomida signal yuborish har kuni yolg'on qizil
 * berardi va ikkinchi haftada hech kim qaramay qo'yardi.
 *
 * 🔴 Bu cron HECH NARSANI TUZATMAYDI va hech nimani to'xtatmaydi — faqat
 * ko'rsatadi (K1 sverkasining intizomi). Farqni tuzatish inventarizatsiya
 * ishi (K5), qaror esa odamniki.
 */
@Injectable()
export class StockPieceDigestCron {
  private readonly logger = new Logger(StockPieceDigestCron.name);
  private running = false;

  constructor(
    @Inject(StockPieceDigestService) private readonly digest: StockPieceDigestService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Cron('0 20 * * *', { timeZone: HR_TZ })
  async nightlyDigest(): Promise<void> {
    if (this.running) {
      this.logger.warn("Bo'lak sverkasi o`tkazib yuborildi: oldingi yurish tugamagan");
      return;
    }
    this.running = true;
    try {
      await this.runAllAccounts();
    } catch (e) {
      this.logger.error(`Bo'lak sverkasi yiqildi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Bitta hisobning xatosi qolganlarini TO'XTATMAYDI — `shift-acceptance.cron`
   * bilan bir xil qoida.
   */
  private async runAllAccounts(): Promise<void> {
    const accounts = await this.prisma.client.account.findMany({ select: { id: true } });
    for (const acc of accounts) {
      try {
        const result = await this.digest.runForAccount(acc.id);
        if (result.summary.shouldNotify) {
          this.logger.log(
            `Bo'lak sverkasi[${acc.id}]: ${result.summary.diffBuckets} farq, ` +
              `${result.summary.warnings} ogohlantirish → ${result.recipients} xodim`,
          );
        }
      } catch (e) {
        this.logger.error(
          `Bo'lak sverkasi[${acc.id}] yiqildi: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }
}
