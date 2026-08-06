import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DAILY_KPI_ACTION, DAILY_KPI_STATE } from './daily-kpi-fsm.js';
import {
  type ManagerActivity,
  buildWeeklySummary,
  formatWeeklySummary,
  weekBounds,
} from './owner-weekly-summary.js';

/**
 * Egaga haftalik xulosa (menejer KPI TZ M-Q7, §7) — «menejerni kim nazorat qiladi».
 *
 * Menejerga katta erkinlik berilgan: har kunni qo'lda ko'radi, raqamni tuzatadi,
 * kunni majburan yopadi. Erkinlikning juftligi — **o'lchov**: har amal hodisa
 * jurnaliga tushadi va egasi haftada bir marta xulosani oladi.
 *
 * ⚠️ Hech narsani BLOKLAMAYDI (§7) — faqat ko'rinadi.
 *
 * Qoidalar sof modulda (`owner-weekly-summary.ts`, 18 test); bu yerda faqat
 * Prisma-I/O va navbatga qo'yish.
 */
@Injectable()
export class OwnerWeeklySummaryService {
  private readonly logger = new Logger(OwnerWeeklySummaryService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Bir hafta uchun xulosa.
   *
   * `anyDayInWeek` berilmasa — **o'tgan** hafta: dushanba ertalab kelgan
   * xabar shu haftaning bir yarim kunini emas, TUGAGAN haftani ko'rsatishi
   * kerak.
   */
  async summary(accountId: string, anyDayInWeek?: Date) {
    const ref = anyDayInWeek ?? new Date(Date.now() - 7 * 86_400_000);
    const { start, endExclusive } = weekBounds(ref);

    const [events, pendingDays, staleDays] = await Promise.all([
      this.prisma.client.employeeDailyKpiEvent.findMany({
        where: { accountId, createdAt: { gte: start, lt: endExclusive } },
        // `actor` relation'i bu modelda YO'Q (jurnal hodisadan omon qolishi
        // kerak) — ismlar keyin bitta so'rovda olinadi.
        select: { action: true, toState: true, actorId: true, detail: true },
      }),
      // Hafta OXIRIDAGI holat, hafta ichidagi hodisa emas: egasining savoli
      // «hozir nechta kun javobsiz turibdi».
      this.prisma.client.employeeDailyKpi.count({
        where: { accountId, state: DAILY_KPI_STATE.pending },
      }),
      this.prisma.client.employeeDailyKpi.count({
        where: { accountId, state: DAILY_KPI_STATE.stale },
      }),
    ]);

    // Ism → id xaritasi: jurnalda faqat id bor.
    const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
    const names = actorIds.length
      ? await this.prisma.client.employee.findMany({
          where: { accountId, id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));

    const byManager = new Map<string, ManagerActivity>();
    const pick = (id: string | null, name: string | null): ManagerActivity => {
      const key = id ?? '__system__';
      const found = byManager.get(key);
      if (found) return found;
      const fresh: ManagerActivity = {
        managerId: id,
        managerName: name,
        acceptedCount: 0,
        rejectedCount: 0,
        adjustCount: 0,
        adjustedAbsMinor: 0n,
        noBaselineCount: 0,
        forceAcceptedCount: 0,
      };
      byManager.set(key, fresh);
      return fresh;
    };

    for (const e of events) {
      const a = pick(e.actorId, e.actorId ? (nameById.get(e.actorId) ?? null) : null);
      if (e.action === DAILY_KPI_ACTION.accept) a.acceptedCount += 1;
      else if (e.action === DAILY_KPI_ACTION.reject) a.rejectedCount += 1;
      else if (e.action === DAILY_KPI_ACTION.adjust) {
        a.adjustCount += 1;
        a.adjustedAbsMinor += adjustAbsMinor(e.detail);
        if (!hasBaseline(e.detail)) a.noBaselineCount += 1;
      }
      if (e.toState === DAILY_KPI_STATE.forceAccepted) a.forceAcceptedCount += 1;
    }

    return buildWeeklySummary({
      weekStart: start,
      weekEndExclusive: endExclusive,
      activity: [...byManager.values()],
      pendingDays,
      staleDays,
    });
  }

  /**
   * Dushanba ertalab — o'tgan haftaning xulosasi egaga navbatga qo'yiladi.
   *
   * Navbat (`HrTelegramOutbox`) to'g'ridan-to'g'ri yuborishdan afzal: Telegram
   * uzilib qolsa xabar yo'qolmaydi, qayta urinish bo'ladi va iz qoladi.
   */
  @Cron('0 9 * * 1')
  async weeklyTick(): Promise<void> {
    const accounts = await this.prisma.client.account.findMany({ select: { id: true } });
    for (const acc of accounts) {
      try {
        const s = await this.summary(acc.id);
        await this.prisma.client.hrTelegramOutbox.create({
          data: {
            accountId: acc.id,
            toPhone: '',
            toSelf: true,
            messageText: formatWeeklySummary(s),
            sourceEventType: 'menejer.haftalik_xulosa',
            status: 'pending',
          },
        });
      } catch (err) {
        // Bir akkauntning nosozligi qolganlarini to'xtatmaydi.
        this.logger.warn(
          `Haftalik xulosa (account=${acc.id}) navbatga qo'yilmadi: ${(err as Error).message}`,
        );
      }
    }
  }
}

/**
 * Tuzatma hodisasidan pul farqini oladi: `{ metricKey, was, now, autoValue }`.
 *
 * ⚠️ **`was` BIRINCHI tuzatmada `null`** — u oldingi QO'LDA tuzatma qiymati,
 * birinchi marta esa u yo'q. Bu eng KO'P uchraydigan holat: menejer avtomatik
 * hisoblangan raqamni birinchi marta tuzatadi. `null` ni «summa noma'lum» deb
 * olsak, jami DOIM 0 chiqardi va M-Q7 ning asosiy raqami («jami qancha
 * summaga tuzatilgan») ma'nosiz bo'lardi.
 *
 * Shuning uchun asos: `was ?? autoValue` — «nimadan» degan savolning haqiqiy
 * javobi avtomatik qiymat.
 *
 * ABSOLYUT qiymat: «+100 000 va −100 000» bir-birini yo'q qilmaydi —
 * egasining savoli «qancha aralashuv bo'ldi», «sof ta'sir qancha» emas.
 *
 * Ikkalasi ham o'qib bo'lmasa `0n`: jurnal qatori baribir sanaladi
 * (`adjustCount`), faqat summasi noma'lum qoladi.
 */
function adjustAbsMinor(detail: unknown): bigint {
  if (detail === null || typeof detail !== 'object') return 0n;
  const d = detail as { was?: unknown; now?: unknown; autoValue?: unknown };
  const toBig = (v: unknown): bigint | null => {
    if (v === null || v === undefined) return null;
    try {
      return BigInt(v as string | number);
    } catch {
      return null;
    }
  };
  const now = toBig(d.now);
  if (now === null) return 0n;
  // Baza umuman yo'q bo'lsa (`was` va `autoValue` ikkalasi ham null) menejer
  // raqamni TUZATMAGAN — KIRITGAN. Bunda aralashuv miqdori raqamning o'zi:
  // 0 ko'rsatish 500 mln lik kiritmani ham ko'rinmas qilardi.
  // Bunday qatorlar `noBaselineCount` da ALOHIDA sanaladi — egasi
  // «tuzatildi» bilan «yo'qdan kiritildi» ni ajrata olishi kerak.
  const base = toBig(d.was) ?? toBig(d.autoValue) ?? 0n;
  const diff = now - base;
  return diff < 0n ? -diff : diff;
}

/** Tuzatmaning bazasi bo'lganmi — «tuzatildi» va «yo'qdan kiritildi» farqi. */
export function hasBaseline(detail: unknown): boolean {
  if (detail === null || typeof detail !== 'object') return false;
  const d = detail as { was?: unknown; autoValue?: unknown };
  return (d.was ?? d.autoValue) != null;
}

/** Test uchun ochiq: birinchi-tuzatma holati qulflanishi kerak. */
export const __testing = { adjustAbsMinor };
