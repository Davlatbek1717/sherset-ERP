import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DriverCashService } from '../../hr/driver-tracking/driver-cash.service.js';
import { MoneyService } from '../../money/money.service.js';
import { CounterpartyBalanceService } from '../../report/counterparty-balance.service.js';
import { loadRateContext } from '../../report/report-rate-ctx.util.js';
import { StockInTransitService } from '../../stock/stock-in-transit.service.js';
import {
  MONEY_MAP_BLOCK_KEYS,
  type MoneyMapBlock,
  type MoneyMapBlockKey,
  type MoneyMapSourceReading,
  type MoneyMapSummary,
  buildMoneyMapBlock,
  sourceCompleteness,
  summarizeMoneyMap,
} from './money-map.js';

/**
 * MK15 — «Korxona puli qayerda» I/O qatlami (4M TZ §8.1/1).
 *
 * **QOIDALAR BU YERDA EMAS** — ular sof `money-map.ts` da. Bu yerda faqat
 * mavjud servislardan o'qish va ularni bloklarga bog'lash.
 *
 * 🔴 **YANGI PUL FORMULASI OCHILMADI.** Har blok o'z manbasining EGASIDAN
 * o'qiladi, ya'ni «bu raqam nima degani» savoliga javob bitta joyda qoladi:
 *
 *   kassa / bank      `MoneyService.sourceBalances` — u ikkala manbaning
 *                     materiallashgan qoldig'ini YOZADI, demak o'qish ham
 *                     o'sha yerdan.
 *   mijoz/ta'minotchi `CounterpartyBalanceService.counterpartyBalanceReport` —
 *                     jurnalga asoslangan yagona kontragent-saldo hisoboti.
 *   haydovchi naqdi   `DriverCashService.outstandingByCurrency`.
 *   yo'ldagi tovar    `StockInTransitService.getInTransitValueByCurrency`.
 *
 * Ikkinchi haqiqat ochilmasligi `money-map-single-source.test.ts` bilan
 * qulflangan (bu fayl Prisma modellariga TO'G'RIDAN-TO'G'RI tegmaydi).
 *
 * **Har manba alohida himoyalangan.** Bittasi yiqilsa panel butunlay
 * qulamaydi — o'sha blok «hisoblanmadi» bo'ladi, qolganlari ko'rinadi. Xato
 * jurnalga yoziladi: jim yutilgan xato «hamma joyda nol» degan panelni
 * berardi va uni hech kim sezmasdi.
 */
@Injectable()
export class MoneyMapService {
  private readonly logger = new Logger(MoneyMapService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CounterpartyBalanceService)
    private readonly counterpartyBalances: CounterpartyBalanceService,
    @Inject(DriverCashService) private readonly driverCash: DriverCashService,
    @Inject(StockInTransitService) private readonly inTransit: StockInTransitService,
  ) {}

  /** Panel holati: oltita blok + yakun. */
  async snapshot(
    accountId: string,
  ): Promise<{ blocks: MoneyMapBlock[]; summary: MoneyMapSummary }> {
    const ctx = await loadRateContext(this.prisma.client, accountId);

    const [cash, bank, debts, driverCash, goodsInTransit] = await Promise.all([
      this.readMoneySource(accountId, 'cash_desk', 'cash'),
      this.readMoneySource(accountId, 'organization_account', 'bank'),
      this.readCounterpartyDebts(accountId),
      this.readDriverCash(accountId),
      this.readGoodsInTransit(accountId),
    ]);

    const byKey = new Map<MoneyMapBlockKey, MoneyMapSourceReading>(
      [cash, bank, ...debts, driverCash, goodsInTransit].map((r) => [r.key, r]),
    );
    // Tartib `MONEY_MAP_BLOCK_KEYS` dan — javob determinist va ekran tartibi
    // Promise tugash tartibiga bog'liq emas.
    const blocks = MONEY_MAP_BLOCK_KEYS.map((key) => {
      const reading = byKey.get(key);
      if (!reading) throw new Error(`MK15: '${key}' bloki uchun manba yo'q`);
      return buildMoneyMapBlock(reading, ctx);
    });

    return { blocks, summary: summarizeMoneyMap(blocks, ctx.baseCode) };
  }

  /**
   * Kassa yoki bank — ikkalasi ham `MoneyService` dan.
   *
   * Provenance shu yerda blok bayrog'iga aylanadi: `balanceMinor === null`
   * qatorlar «hech qachon o'lchanmagan» (bank tomonida real holat, `money.
   * service.ts#sourceBalances` ga qara). Hech biri o'lchanmagan bo'lsa blok
   * `null` bo'ladi — «bankda 0 so'm» degan yolg'on chiqmaydi.
   */
  private async readMoneySource(
    accountId: string,
    kind: 'cash_desk' | 'organization_account',
    key: MoneyMapBlockKey,
  ): Promise<MoneyMapSourceReading> {
    const source = `MoneyService.sourceBalances(${kind})`;
    return this.guard(key, source, async () => {
      const rows = await this.money.sourceBalances(accountId, kind);
      const { complete, anyMeasured } = sourceCompleteness(
        rows.map((r) => ({ value: r.balanceMinor })),
      );
      // Manba umuman o'lchanmagan (yoki bitta ham qator yo'q) ⇒ «hisoblanmadi».
      if (!anyMeasured) return { amounts: null, sourceComplete: false };

      const byCurrency = new Map<string, bigint>();
      for (const r of rows) {
        if (r.balanceMinor === null) continue;
        byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0n) + r.balanceMinor);
      }
      return {
        amounts: Array.from(byCurrency, ([currency, amountMinor]) => ({ currency, amountMinor })),
        sourceComplete: complete,
      };
    });
  }

  /**
   * Mijoz qarzi + ta'minotchi qarzi — BITTA hisobot chaqiruvidan.
   *
   * Ikki marta chaqirish ikki xil paytdagi holatni bir ekranda ko'rsatardi
   * (orasida to'lov o'tsa saldo o'zaro mos kelmasdi).
   *
   * Ajratish kontragent TURI bo'yicha emas, PUL YO'NALISHI bo'yicha:
   * `totalDebtMinor` = bizga qarzdorlar, `totalCreditMinor` = biz qarzdormiz.
   * Bitta kontragent ham xaridor, ham ta'minotchi bo'lishi mumkin, shuning
   * uchun tur bo'yicha ajratish noto'g'ri bo'lardi. Bu — hisobotning O'Z
   * ta'rifi, bu yerda qayta hisoblanmaydi.
   *
   * Filtr `signFilter: 'all'` — hech narsa chiqarib tashlanmaydi; `limit: 1`
   * chunki bizga faqat `summaries` kerak (u `PERF-04` bo'yicha butun filtr
   * bo'yicha hisoblanadi, sahifadan qat'i nazar). Arxivlangan kontragentlar
   * hisobotning o'z sukut qoidasi bo'yicha kirmaydi.
   */
  private async readCounterpartyDebts(
    accountId: string,
  ): Promise<[MoneyMapSourceReading, MoneyMapSourceReading]> {
    const source = 'CounterpartyBalanceService.counterpartyBalanceReport';
    try {
      const report = await this.counterpartyBalances.counterpartyBalanceReport(accountId, {
        signFilter: 'all',
        limit: 1,
      });
      const s = report.summaries;
      const unconverted = s.unconvertedByCurrency;
      return [
        {
          key: 'customer_debt',
          source,
          amounts: [{ currency: s.currency, amountMinor: BigInt(s.totalDebtMinor) }],
          sourceComplete: true,
          // Hisobot BITTA scope-daraja «konvertatsiya qilinmagan» raqamini
          // beradi — u tomonlar bo'yicha ajratilmagan. Uni faqat SHU blokka
          // ilamiz: ikkalasiga ilinsa yakunda ikki marta sanalardi.
          unconverted,
        },
        {
          key: 'supplier_debt',
          source,
          amounts: [{ currency: s.currency, amountMinor: BigInt(s.totalCreditMinor) }],
          // Pul yuqoridagi blokda ko'rsatiladi, lekin BAYROQ bu yerda ham
          // tushishi kerak — aks holda bu blok «to'liq» bo'lib ko'rinardi.
          sourceComplete: unconverted.length === 0,
        },
      ];
    } catch (err) {
      this.logger.error(`MK15 manbasi javob bermadi: ${source}`, err as Error);
      return [
        { key: 'customer_debt', source, amounts: null, sourceComplete: false },
        { key: 'supplier_debt', source, amounts: null, sourceComplete: false },
      ];
    }
  }

  /** Haydovchilar qo'lidagi topshirilmagan naqd. */
  private async readDriverCash(accountId: string): Promise<MoneyMapSourceReading> {
    const source = 'DriverCashService.outstandingByCurrency';
    return this.guard('driver_cash', source, async () => ({
      amounts: await this.driverCash.outstandingByCurrency(accountId),
      sourceComplete: true,
    }));
  }

  /** Yo'lda ketayotgan tovarga bog'langan pul (xarid narxida, QQSsiz). */
  private async readGoodsInTransit(accountId: string): Promise<MoneyMapSourceReading> {
    const source = 'StockInTransitService.getInTransitValueByCurrency';
    return this.guard('goods_in_transit', source, async () => ({
      amounts: await this.inTransit.getInTransitValueByCurrency(accountId),
      sourceComplete: true,
    }));
  }

  /**
   * Bitta manbani o'qishni himoyalaydi: yiqilsa `amounts: null` («hisoblanmadi»)
   * qaytadi va xato JURNALGA yoziladi. Jim yutish taqiqlanadi — «hamma joyda
   * nol» degan panel hech kimning e'tiborini tortmasdi.
   */
  private async guard(
    key: MoneyMapBlockKey,
    source: string,
    read: () => Promise<{ amounts: MoneyMapSourceReading['amounts']; sourceComplete: boolean }>,
  ): Promise<MoneyMapSourceReading> {
    try {
      const { amounts, sourceComplete } = await read();
      return { key, source, amounts, sourceComplete };
    } catch (err) {
      this.logger.error(`MK15 manbasi javob bermadi: ${source}`, err as Error);
      return { key, source, amounts: null, sourceComplete: false };
    }
  }
}
