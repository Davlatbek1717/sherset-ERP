import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ACCOUNTABLE_STATES } from '../../cashier-session/shift-acceptance.js';
import { buildAccountability, employeeDuties } from './accountability.js';
import {
  LATE_ALERT_MINUTES,
  type LiveRow,
  PICKING_STUCK_MINUTES,
  SHIFT_LONG_HOURS,
  attendanceRow,
  buildLiveBoard,
  pickingRow,
  shiftRow,
  tripRow,
} from './live-status.js';

/**
 * Menejerning jonli holat ekrani (4M.4, M-Q10) — «hozir kim nima qilyapti».
 *
 * To'rt manba: ochiq kassa smenalari · bugungi davomat · faol haydovchi
 * reyslari · yig'ilayotgan buyurtmalar.
 *
 * Qoidalar (nima «diqqat talab qiladi», qanday tartiblanadi) sof modulda
 * (`live-status.ts`, 26 test) — bu yerda faqat Prisma-I/O.
 */
@Injectable()
export class LiveStatusService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Javobgarlik — «kimda nima qolgan» (4M.4).
   *
   * **Jihoz MK05 dan boshlab shu yerda**: reyestr (`Equipment` +
   * `EquipmentAssignment`) paydo bo'ldi, ya'ni son endi O'LCHANGAN —
   * ochiq (qaytarilmagan) biriktirishlar. MK03'da bu blok ataylab yo'q edi:
   * manbasiz «0 ta jihoz» menejerni yo'q ma'lumotga ishontirardi.
   */
  async accountability(accountId: string) {
    const [shifts, unacceptedShifts, handovers, picking, kpiPending, equipment] = await Promise.all(
      [
        this.prisma.client.cashierSession.findMany({
          where: { accountId, state: 'open' },
          select: {
            cashierId: true,
            openingCashMinor: true,
            cashier: { select: { id: true, name: true } },
          },
        }),
        // MK08 — yopilgan-u menejer QABUL QILMAGAN smenalar. Holatlar ro'yxati
        // FSM'dan (`ACCOUNTABLE_STATES`), bu yerda takrorlanmaydi: aks holda
        // yangi holat qo'shilganda javobgarlik taxtasi jimgina eskirardi.
        this.prisma.client.cashierSession.groupBy({
          by: ['cashierId'],
          where: { accountId, acceptanceState: { in: [...ACCOUNTABLE_STATES] } },
          _count: { _all: true },
        }),
        this.prisma.client.driverCashHandover.groupBy({
          by: ['driverId'],
          where: { accountId, status: 'pending' },
          _sum: { amountMinor: true },
          _count: { _all: true },
        }),
        this.prisma.client.msPickList.groupBy({
          by: ['pickedById'],
          where: { accountId, pickState: 'picking', pickedById: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.client.employeeDailyKpi.groupBy({
          by: ['employeeId'],
          where: { accountId, state: { in: ['pending', 'stale', 'computed'] } },
          _count: { _all: true },
        }),
        // MK05 — qaytarilmagan jihoz: OCHIQ biriktirish qatorlari (jihozdagi
        // `status` ustuni emas — u qo'lda tahrirdan buzilgan bo'lishi mumkin).
        this.prisma.client.equipmentAssignment.groupBy({
          by: ['employeeId'],
          where: { accountId, returnedAt: null },
          _count: { _all: true },
        }),
      ],
    );

    // Xodim → yig'ilgan faktlar.
    type Acc = {
      name: string | null;
      openShiftCount: number;
      openShiftCashMinor: bigint;
      pendingHandoverCount: number;
      pendingHandoverMinor: bigint;
      pickingCount: number;
      pendingKpiDays: number;
      openEquipmentCount: number;
      unacceptedShiftCount: number;
    };
    const byEmp = new Map<string, Acc>();
    const at = (id: string, name?: string | null): Acc => {
      const found = byEmp.get(id);
      if (found) {
        if (name && !found.name) found.name = name;
        return found;
      }
      const fresh: Acc = {
        name: name ?? null,
        openShiftCount: 0,
        openShiftCashMinor: 0n,
        pendingHandoverCount: 0,
        pendingHandoverMinor: 0n,
        pickingCount: 0,
        pendingKpiDays: 0,
        openEquipmentCount: 0,
        unacceptedShiftCount: 0,
      };
      byEmp.set(id, fresh);
      return fresh;
    };

    for (const s of shifts) {
      const a = at(s.cashierId, s.cashier?.name ?? null);
      a.openShiftCount += 1;
      // Ochilish naqdi — smena boshidagi javobgarlik. Joriy kutilgan naqd
      // har smena uchun alohida hisob talab qiladi (§8.4) va bu ekran
      // uchun ortiqcha; ochilish summasi «kamida shuncha» ni beradi.
      a.openShiftCashMinor += s.openingCashMinor;
    }
    for (const h of handovers) {
      const a = at(h.driverId);
      a.pendingHandoverCount += h._count._all;
      a.pendingHandoverMinor += h._sum.amountMinor ?? 0n;
    }
    for (const p of picking) {
      if (!p.pickedById) continue;
      at(p.pickedById).pickingCount += p._count._all;
    }
    for (const k of kpiPending) {
      at(k.employeeId).pendingKpiDays += k._count._all;
    }
    for (const e of equipment) {
      at(e.employeeId).openEquipmentCount += e._count._all;
    }
    for (const u of unacceptedShifts) {
      at(u.cashierId).unacceptedShiftCount += u._count._all;
    }

    // Ismlari yo'q xodimlarni bitta so'rovda to'ldiramiz.
    const missing = [...byEmp.entries()].filter(([, v]) => !v.name).map(([id]) => id);
    if (missing.length > 0) {
      const names = await this.prisma.client.employee.findMany({
        where: { accountId, id: { in: missing } },
        select: { id: true, name: true },
      });
      for (const n of names) {
        const a = byEmp.get(n.id);
        if (a) a.name = n.name;
      }
    }

    const board = buildAccountability(
      [...byEmp.entries()].map(([employeeId, v]) =>
        employeeDuties({ employeeId, employeeName: v.name, ...v }),
      ),
    );

    return {
      totalCashMinor: board.totalCashMinor.toString(),
      employeeCount: board.employeeCount,
      employees: board.employees.map((e) => ({
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        totalCashMinor: e.totalCashMinor.toString(),
        totalCount: e.totalCount,
        duties: e.duties.map((d) => ({
          kind: d.kind,
          label: d.label,
          count: d.count,
          amountMinor: d.amountMinor?.toString() ?? null,
        })),
      })),
    };
  }

  async board(accountId: string) {
    const now = new Date();
    // Bugun — mahalliy yarim tundan. Davomat «bugun kim keldi» savoli,
    // ya'ni oxirgi 24 soat emas: kechagi kechki smena bugungi ro'yxatni
    // ifloslantirmasligi kerak.
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [shifts, attendance, trips, msPicking, salePicking] = await Promise.all([
      this.prisma.client.cashierSession.findMany({
        where: { accountId, state: 'open' },
        select: {
          openedAt: true,
          cashier: { select: { id: true, name: true } },
          cashDesk: { select: { name: true } },
        },
      }),
      this.prisma.client.hrAttendance.findMany({
        where: { accountId, deletedAt: null, checkInTime: { gte: dayStart } },
        select: {
          checkInTime: true,
          lateMinutes: true,
          employee: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.driverTrip.findMany({
        where: { accountId, status: { in: ['assigned', 'enroute', 'arrived'] } },
        select: {
          status: true,
          destAddress: true,
          assignedAt: true,
          startedAt: true,
          driver: { select: { id: true, name: true } },
        },
      }),
      // MoySklad buyurtmalari — omborchi zanjiri (pick-list).
      this.prisma.client.msPickList.findMany({
        where: { accountId, pickState: 'picking' },
        select: {
          name: true,
          pickStartedAt: true,
          moment: true,
          pickedBy: { select: { id: true, name: true } },
        },
      }),
      // O'z chek oqimi — omborchi yig'ayotgan chakana savdolar.
      this.prisma.client.retailSale.findMany({
        where: { accountId, state: 'picking' },
        select: { name: true, updatedAt: true, moment: true },
      }),
    ]);

    const rows: LiveRow[] = [
      ...shifts.map((s) =>
        shiftRow(
          {
            employeeId: s.cashier?.id ?? '',
            employeeName: s.cashier?.name ?? null,
            cashDeskName: s.cashDesk?.name ?? null,
            openedAt: s.openedAt,
          },
          now,
        ),
      ),
      ...attendance.map((a) =>
        attendanceRow({
          employeeId: a.employee?.id ?? '',
          employeeName: a.employee?.name ?? null,
          checkInTime: a.checkInTime,
          lateMinutes: a.lateMinutes,
        }),
      ),
      ...trips.map((t) =>
        tripRow(
          {
            driverId: t.driver?.id ?? '',
            driverName: t.driver?.name ?? null,
            status: t.status,
            destAddress: t.destAddress,
            assignedAt: t.assignedAt,
            startedAt: t.startedAt,
          },
          now,
        ),
      ),
      ...msPicking.map((p) =>
        pickingRow(
          {
            employeeId: p.pickedBy?.id ?? null,
            employeeName: p.pickedBy?.name ?? null,
            docName: p.name,
            // `pickStartedAt` — omborchi boshlagan payt. Yo'q bo'lsa
            // hujjat sanasi: eski yozuvda boshlash vaqti qayd etilmagan.
            startedAt: p.pickStartedAt ?? p.moment,
          },
          now,
        ),
      ),
      ...salePicking.map((s) =>
        pickingRow(
          {
            employeeId: null,
            employeeName: null,
            docName: s.name,
            // Chakana chekda «yig'ish boshlandi» ustuni yo'q; `updatedAt`
            // — holat `picking` ga o'tgan payt (eng yaqin taxmin).
            startedAt: s.updatedAt ?? s.moment,
          },
          now,
        ),
      ),
    ];

    const board = buildLiveBoard(rows);
    return {
      now,
      alertCount: board.alertCount,
      counts: board.counts,
      /**
       * Chegaralar ekranda IZOHLANADI (4M.4): menejer «nega bu qator qizil»
       * degan savolga javob topmasa signalga ishonmaydi. Javobda qaytadi,
       * FE'da takrorlanmaydi — aks holda chegara ikki joyda yashab, jimgina
       * bir-biridan uzoqlashardi.
       */
      thresholds: {
        shiftLongHours: SHIFT_LONG_HOURS,
        lateAlertMinutes: LATE_ALERT_MINUTES,
        pickingStuckMinutes: PICKING_STUCK_MINUTES,
      },
      rows: board.rows.map((r) => ({
        kind: r.kind,
        employeeId: r.employeeId || null,
        employeeName: r.employeeName,
        title: r.title,
        titleKey: r.titleKey,
        titleParams: r.titleParams,
        detail: r.detail,
        place: r.place,
        showDuration: r.showDuration,
        attention: r.attention,
        since: r.since,
      })),
    };
  }
}
