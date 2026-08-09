import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SHIFT_ACCEPTANCE_STATES } from '../../cashier-session/shift-acceptance.js';
import { ShiftAcceptanceService } from '../../cashier-session/shift-acceptance.service.js';
import { HR_TZ, startOfLocalDay } from '../../hr/hr-shared/tz.util.js';
import { loadRateContext } from '../../report/report-rate-ctx.util.js';
import { ReportService } from '../../report/report.service.js';
import { TelegramService } from '../../telegram/telegram.service.js';
import { ManagerInventoryService } from '../inventory/manager-inventory.service.js';
import { DailyKpiAcceptanceService } from '../kpi/daily-kpi-acceptance.service.js';
import { ManagerQueueService } from '../queue/manager-queue.service.js';
import { ManagerSlaService } from '../sla/manager-sla.service.js';
import {
  BRIEFING_KIND,
  type BriefingBlock,
  type BriefingBlockKey,
  type BriefingKind,
  type BriefingReading,
  type BriefingSummary,
  EVENING_BLOCK_KEYS,
  MORNING_BLOCK_KEYS,
  buildBriefingBlock,
  digestTag,
  isDigestAlreadyQueued,
  renderDigest,
  summarizeBriefing,
} from './day-briefing.js';

/**
 * MK19 — ertalabki brifing / kechki yakun, I/O qatlami (4M TZ §8.1/5).
 *
 * **QOIDALAR BU YERDA EMAS** — ular sof `day-briefing.ts` da (25 test). Bu
 * yerda faqat mavjud servislardan o'qish va ularni bloklarga bog'lash.
 *
 * 🔴 **YANGI HISOB OCHILMADI.** Har blok o'z manbasining EGASIDAN o'qiladi,
 * ya'ni «bu raqam nima degani» savoliga javob bitta joyda qoladi:
 *
 *   qotib qolgan / SLA   `ManagerSlaService.board` (MK10)
 *   qabul kutayotgan kun `DailyKpiAcceptanceService.queue` (4M.2)
 *   zaxira signali       `ManagerInventoryService.stockSignals` (MK07)
 *   tushum               `ReportService.salesReport` (analitika §4)
 *   smena qabuli / farq  `ShiftAcceptanceService.queue` (MK08)
 *   ochiq qolganlar      `ManagerQueueService.list` (MK06)
 *
 * Ikkinchi haqiqat ochilmasligi `briefing-single-source.test.ts` bilan
 * qulflangan: bu fayl hujjat/qoldiq Prisma modellariga TEGMAYDI. Yagona
 * Prisma o'qishi — Telegram dedup (`telegramOutbox`) va valyuta konteksti,
 * ikkalasi ham raqam MANBASI emas.
 *
 * **Har manba alohida himoyalangan.** Bittasi yiqilsa brifing butunlay
 * qulamaydi — o'sha blok «o'lchanmadi» bo'ladi, qolganlari ko'rinadi va kun
 * `quiet` deb ATALMAYDI (sof qatlamdagi 1-shartnoma). Xato jurnalga yoziladi:
 * jim yutilgan xato «hamma joyda nol» degan tinch kunni berardi.
 */
@Injectable()
export class DayBriefingService {
  private readonly logger = new Logger(DayBriefingService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ManagerSlaService) private readonly sla: ManagerSlaService,
    @Inject(DailyKpiAcceptanceService) private readonly acceptance: DailyKpiAcceptanceService,
    @Inject(ManagerInventoryService) private readonly inventory: ManagerInventoryService,
    @Inject(ReportService) private readonly reports: ReportService,
    @Inject(ShiftAcceptanceService) private readonly shifts: ShiftAcceptanceService,
    @Inject(ManagerQueueService) private readonly queue: ManagerQueueService,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {}

  /**
   * Ertalabki brifing — «bugun nima muhim».
   *
   * `now` argument sifatida kiradi (test muzlatilgan vaqt bilan ishlaydi);
   * HTTP qatlami uni bermaydi ⇒ `new Date()` (MK16 dagi bir xil naqsh).
   */
  async morning(accountId: string, now: Date = new Date()) {
    return this.snapshot(accountId, BRIEFING_KIND.morning, now);
  }

  /** Kechki yakun — «bugun nima bo'ldi». */
  async evening(accountId: string, now: Date = new Date()) {
    return this.snapshot(accountId, BRIEFING_KIND.evening, now);
  }

  async snapshot(
    accountId: string,
    kind: BriefingKind,
    now: Date = new Date(),
  ): Promise<{
    kind: BriefingKind;
    businessDate: string;
    generatedAt: string;
    currency: string;
    blocks: BriefingBlock[];
    summary: BriefingSummary;
  }> {
    const keys = kind === BRIEFING_KIND.morning ? MORNING_BLOCK_KEYS : EVENING_BLOCK_KEYS;
    const day = dayWindow(now);

    // Valyuta kodi FAQAT yorliq uchun: bu yerda hech narsa konvertatsiya
    // qilinmaydi (tushum `ReportService` da allaqachon bazaga keltirilgan).
    const ctx = await loadRateContext(this.prisma.client, accountId);

    const readings =
      kind === BRIEFING_KIND.morning
        ? await Promise.all([
            this.readStuckAndSla(accountId),
            this.readAcceptancePending(accountId),
            this.readStockSignal(accountId),
          ]).then(([stuckPair, acceptance, stock]) => [...stuckPair, acceptance, stock])
        : await Promise.all([
            this.readRevenue(accountId, day),
            this.readShiftAcceptance(accountId, day),
            this.readCashVariance(accountId, day),
            this.readOpenItems(accountId),
          ]);

    const byKey = new Map<BriefingBlockKey, BriefingReading>(readings.map((r) => [r.key, r]));
    // Tartib registrdan — javob determinist va ekran tartibi Promise tugash
    // tartibiga bog'liq emas.
    const blocks = keys.map((key) => {
      const reading = byKey.get(key);
      if (!reading) throw new Error(`MK19: '${key}' bloki uchun manba yo'q`);
      return buildBriefingBlock(reading);
    });

    return {
      kind,
      businessDate: day.label,
      generatedAt: now.toISOString(),
      currency: ctx.baseCode,
      blocks,
      summary: summarizeBriefing(kind, blocks),
    };
  }

  // ── Manbalar ──────────────────────────────────────────────────────────────

  /**
   * Ikki blok BITTA so'rovdan: `stuck` — bosqichlarda turgan BARCHA ochiq
   * ob'ekt (kontekst), `sla_breach` — chegaradan oshganlar (signal). Ikki
   * marta `board()` chaqirish ikki xil `now` bilan ikki xil son berardi.
   *
   * `limit: 1` — bizga qatorlar KERAK EMAS, faqat sanoqlar. Sanoqlar
   * (`overdueCount`, `stages[].total`) kesishdan OLDIN hisoblanadi, ya'ni
   * shift ularni buzmaydi.
   */
  private async readStuckAndSla(accountId: string): Promise<BriefingReading[]> {
    const source = 'ManagerSlaService.board';
    const board = await this.safe(source, () => this.sla.board(accountId, { limit: 1 }));

    if (!board) {
      return [unmeasured('stuck', source), unmeasured('sla_breach', source)];
    }

    // 🔴 `sourceTruncated` — manbadan hammasi o'qilmagan, ya'ni sonlar
    // «kamida shuncha». Uni yutib yuborish «hammasi ko'rildi» degan yolg'on
    // ishonch berardi (MK10 dagi bir xil qaror).
    const complete = !board.sourceTruncated;
    const open = board.stages.reduce((sum, s) => sum + s.total, 0);
    const worst = board.stages.reduce<number | null>(
      (max, s) => (s.worstOverdueHours == null ? max : Math.max(max ?? 0, s.worstOverdueHours)),
      null,
    );

    return [
      {
        key: 'stuck',
        count: open,
        amountMinor: null,
        sourceComplete: complete,
        source,
        context: { stages: board.stages.length },
      },
      {
        key: 'sla_breach',
        count: board.overdueCount,
        amountMinor: null,
        sourceComplete: complete,
        source,
        /** `null` = oshgani YO'Q (0 EMAS — MK09 shartnomasi manbadan keladi). */
        context: { worstOverdueHours: worst },
      },
    ];
  }

  /** Menejer qaroriga navbatda turgan xodim-kunlari (`QUEUE_STATES`). */
  private async readAcceptancePending(accountId: string): Promise<BriefingReading> {
    const source = 'DailyKpiAcceptanceService.queue';
    const res = await this.safe(source, () =>
      this.acceptance.queue(accountId, { limit: SOURCE_LIMIT }),
    );
    if (!res) return unmeasured('acceptance_pending', source);
    return {
      key: 'acceptance_pending',
      count: res.total,
      amountMinor: null,
      // Navbat shiftga urilgan bo'lsa haqiqiy son KATTAROQ.
      sourceComplete: res.total < SOURCE_LIMIT,
      source,
    };
  }

  /**
   * Uch xil zaxira signali (o'lik pul · qolmaslik xavfi · ortiqcha zaxira).
   *
   * O'lchov PUL: `totalMinor` FAQAT o'lchangan qatorlardan yig'ilgan, ya'ni
   * `unmeasuredCount > 0` bo'lsa ko'rsatilgan pul KAM. Shu sababdan bunday
   * holat «qisman» bo'ladi.
   */
  private async readStockSignal(accountId: string): Promise<BriefingReading> {
    const source = 'ManagerInventoryService.stockSignals';
    const res = await this.safe(source, () => this.inventory.stockSignals(accountId, { limit: 1 }));
    if (!res) return unmeasured('stock_signal', source);

    const groups = Object.values(res.signals);
    const rowCount = groups.reduce((sum, g) => sum + g.rowCount, 0);
    const totalMinor = groups.reduce((sum, g) => sum + BigInt(g.totalMinor), 0n);
    const unmeasuredRows = groups.reduce((sum, g) => sum + g.unmeasuredCount, 0);

    return {
      key: 'stock_signal',
      count: rowCount,
      amountMinor: totalMinor,
      sourceComplete: !res.truncated && unmeasuredRows === 0,
      source,
      context: { unmeasuredRows },
    };
  }

  /**
   * Bugungi tushum — dashboard «Продажи/bugun» katagi bilan AYNI so'rov
   * (`ReportService.salesReport`). Ikkinchi hisob yozilmadi: ikki ekran bir
   * kunga ikki xil tushum ko'rsatishi menejerni ikkalasiga ham ishonmaydigan
   * qilardi.
   *
   * Kursi topilmagan valyuta jamiga QO'SHILMAYDI (Faza 17) ⇒ bunday kun
   * «qisman»: ko'rsatilgan tushum to'liq emas.
   */
  private async readRevenue(accountId: string, day: DayWindow): Promise<BriefingReading> {
    const source = 'ReportService.salesReport';
    const res = await this.safe(source, () =>
      this.reports.salesReport(accountId, {
        dateFrom: day.start.toISOString(),
        dateTo: day.end.toISOString(),
        groupBy: 'none',
      }),
    );
    if (!res) return unmeasured('revenue', source);
    return {
      key: 'revenue',
      count: res.totals.salesCount,
      amountMinor: BigInt(res.totals.sumMinor),
      sourceComplete: res.unconvertedByCurrency.length === 0,
      source,
      context: { returnsCount: res.totals.returnsCount },
    };
  }

  /** Bugun yopilgan, hali qabul qilinmagan smenalar. */
  private async readShiftAcceptance(accountId: string, day: DayWindow): Promise<BriefingReading> {
    const source = 'ShiftAcceptanceService.queue';
    const res = await this.safe(source, () =>
      this.shifts.queue(accountId, { from: day.start, to: day.end, limit: SOURCE_LIMIT }),
    );
    if (!res) return unmeasured('shift_acceptance', source);
    return {
      key: 'shift_acceptance',
      count: res.count,
      amountMinor: null,
      sourceComplete: res.count < SOURCE_LIMIT,
      source,
      // Kassir javobini kutayotgani menejer stolida EMAS — ekran ajratadi.
      context: { awaitsCashier: res.rows.filter((r) => r.awaitsCashier).length },
    };
  }

  /**
   * Bugun yopilgan smenalardagi NOLDAN FARQLI kassa farqlari.
   *
   * 🔴 **Farq summasi QO'SHILMAYDI** (`amountMinor: null`). Kassa TZ §8.4:
   * «USD farqi UZS'ga o'girilmaydi — kurs bilan o'girish yo'qolgan dollarni
   * taxminiy so'mga aylantirib, dalilni yo'qotardi». Har smenaning farqi o'z
   * valyutasida, o'z aktida ko'riladi; bu yerda faqat NECHTA ekani.
   *
   * `discrepancyMinor === null` — smena sanalmagan, ya'ni farq O'LCHANMAGAN.
   * Bunday qator bo'lsa blok «qisman»: nol farq deb ko'rsatib bo'lmaydi.
   */
  private async readCashVariance(accountId: string, day: DayWindow): Promise<BriefingReading> {
    const source = 'ShiftAcceptanceService.queue(all states)';
    const res = await this.safe(source, () =>
      this.shifts.queue(accountId, {
        states: SHIFT_ACCEPTANCE_STATES,
        from: day.start,
        to: day.end,
        limit: SOURCE_LIMIT,
      }),
    );
    if (!res) return unmeasured('cash_variance', source);

    const uncounted = res.rows.filter((r) => r.discrepancyMinor == null).length;
    const withVariance = res.rows.filter(
      (r) => r.discrepancyMinor != null && BigInt(r.discrepancyMinor) !== 0n,
    ).length;

    return {
      key: 'cash_variance',
      count: withVariance,
      amountMinor: null,
      sourceComplete: uncounted === 0 && res.count < SOURCE_LIMIT,
      source,
      context: { uncountedShifts: uncounted, closedShifts: res.count },
    };
  }

  /** MK06 navbatidagi ochiq elementlar — «ochiq qolganlar». */
  private async readOpenItems(accountId: string): Promise<BriefingReading> {
    const source = 'ManagerQueueService.list';
    const res = await this.safe(source, () => this.queue.list(accountId, { limit: SOURCE_LIMIT }));
    if (!res) return unmeasured('open_items', source);
    return {
      key: 'open_items',
      count: res.count,
      amountMinor: null,
      sourceComplete: res.count < SOURCE_LIMIT,
      source,
      /** Eskirgan element navbatdan CHIQMAYDI — u ko'proq diqqat talab qiladi. */
      context: { stale: res.staleCount },
    };
  }

  // ── Telegram ──────────────────────────────────────────────────────────────

  /**
   * Digestni Telegram navbatiga qo'yadi (ixtiyoriy funksiya).
   *
   * **Yangi jo'natgich qurilmadi** — `TelegramService.send` mavjud outbox
   * navbatiga yozadi, yetkazish/qayta urinish/claim o'sha yerda (Faza 28).
   *
   * **Dublikatsizlik** — `day-briefing.ts::digestTag` yorlig'i bo'yicha:
   * xabar matnining ichida turgan `#brifing_YYYY-MM-DD` / `#yakun_YYYY-MM-DD`
   * shu kunning yagona kaliti. `TelegramOutbox` da dedup ustuni yo'q va u
   * umumiy resurs (migratsiya — CLAUDE.md §6.4), shuning uchun kalit
   * xabarning o'ziga yozildi.
   *
   * ⚠️ **QOLGAN XAVF (halol yorliq):** tekshiruv atomik EMAS — bir vaqtda
   * ikki so'rov kelsa ikkalasi ham dedupdan o'tishi mumkin. Buni to'liq yopish
   * uchun unique indeks kerak (migratsiya). Oyna juda tor (ikkala so'rov ham
   * bir necha millisekund ichida), va bu yerda takrorlanuvchi cron YO'Q —
   * yuborishni odam bosadi.
   */
  async sendDigest(
    accountId: string,
    kind: BriefingKind,
    opts: { chatId?: string; now?: Date } = {},
  ): Promise<{
    sent: boolean;
    skipped: 'duplicate' | null;
    outboxId: string | null;
    chatId: string;
    tag: string;
    businessDate: string;
    status: BriefingSummary['status'];
  }> {
    const now = opts.now ?? new Date();
    const snapshot = await this.snapshot(accountId, kind, now);

    const chatId = opts.chatId ?? (await this.defaultChatId(accountId));
    if (!chatId) {
      // Soxta muvaffaqiyat YO'Q: sozlanmagan kanal «yuborildi» deb qaytmaydi.
      throw new BadRequestException(
        "Telegram chat ko'rsatilmagan: `defaultChatId` sozlanmagan va so'rovda `chatId` yo'q",
      );
    }

    const tag = digestTag(kind, snapshot.businessDate);
    const text = renderDigest({
      kind,
      businessDate: snapshot.businessDate,
      blocks: snapshot.blocks,
      summary: snapshot.summary,
      currency: snapshot.currency,
    });

    const existing = await this.prisma.client.telegramOutbox.findMany({
      where: {
        accountId,
        chatId,
        text: { contains: tag },
        // Yorliqning sanasi = SHU ish kuni (yuqorida `now` dan chiqarildi),
        // ya'ni bu yorliqli qator faqat bugun yaratilgan bo'lishi mumkin.
        // Filtr `[accountId, createdAt]` indeksini ishlatadi.
        createdAt: { gte: dayWindow(now).start },
      },
      select: { status: true },
    });

    if (isDigestAlreadyQueued(existing)) {
      return {
        sent: false,
        skipped: 'duplicate',
        outboxId: null,
        chatId,
        tag,
        businessDate: snapshot.businessDate,
        status: snapshot.summary.status,
      };
    }

    const queued = await this.telegram.send(accountId, { chatId, text, parseMode: 'HTML' });
    return {
      sent: true,
      skipped: null,
      outboxId: queued.id,
      chatId,
      tag,
      businessDate: snapshot.businessDate,
      status: snapshot.summary.status,
    };
  }

  private async defaultChatId(accountId: string): Promise<string | null> {
    const cfg = await this.prisma.client.telegramConfig.findUnique({
      where: { accountId },
      select: { defaultChatId: true },
    });
    return cfg?.defaultChatId ?? null;
  }

  /**
   * Manba yiqilsa `null` — brifing qulamaydi, blok «o'lchanmadi» bo'ladi.
   * Xato JURNALGA chiqadi: jim yutilsa u «tinch kun» bo'lib ko'rinardi.
   */
  private async safe<T>(source: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(`MK19: '${source}' manbasi o'qilmadi — blok o'lchanmagan qoladi`, err);
      return null;
    }
  }
}

/** Bitta manbadan o'qiladigan qator shifti — shiftga urilsa blok «qisman». */
const SOURCE_LIMIT = 500;

interface DayWindow {
  /** Mahalliy yarim tun (Toshkent) — so'rov CHEGARASI. */
  start: Date;
  /** Keyingi mahalliy yarim tun. */
  end: Date;
  /** `YYYY-MM-DD` — kunning YORLIG'I. */
  label: string;
}

/**
 * Ish kunining chegarasi va yorlig'i.
 *
 * `startOfLocalDay` — CHEGARA, `label` — YORLIQ: ikkisini aralashtirish
 * yorliqni bir kunga siljitadi (`tz.util.ts` dagi hujjatlangan hodisa).
 * Yorliq shu sababdan `formatInTimeZone` natijasidan emas, chegaraning UTC
 * kalendaridan EMAS — to'g'ridan-to'g'ri mahalliy sana satridan olinadi.
 *
 * Kun uzunligi qat'iy 24 soat: Toshkentda DST yo'q (UTC+5, doimiy).
 */
function dayWindow(now: Date): DayWindow {
  const start = startOfLocalDay(now);
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    label: new Intl.DateTimeFormat('en-CA', {
      timeZone: HR_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  };
}

/** Manba javob bermadi — `count: null` (0 EMAS). */
function unmeasured(key: BriefingBlockKey, source: string): BriefingReading {
  return { key, count: null, amountMinor: null, sourceComplete: false, source };
}
