import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  type LiveRow,
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
        where: { accountId, checkInTime: { gte: dayStart } },
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
      rows: board.rows.map((r) => ({
        kind: r.kind,
        employeeId: r.employeeId || null,
        employeeName: r.employeeName,
        title: r.title,
        detail: r.detail,
        attention: r.attention,
        since: r.since,
      })),
    };
  }
}
