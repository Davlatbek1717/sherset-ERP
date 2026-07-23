import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ, startOfLocalDay, tashkentWeekday } from '../hr-shared/tz.util.js';
import type { PingInput } from './attendance-geo.schema.js';
import {
  type AttendanceDecision,
  type InsideSample,
  decideAttendance,
} from './attendance-reducer.util.js';
import { isInsideGeofence } from './geofence.util.js';
import { jumpFilter } from './jump-filter.util.js';
import { computeLateMinutes } from './late-minutes.util.js';

/** Authoritative status the PWA renders from each accepted ping. */
export type DavomatLiveStatus = 'not_arrived' | 'at_work' | 'left';

export interface PingResult {
  accepted: boolean;
  reason: 'accuracy' | 'jump' | 'not_opted_in' | 'no_location' | null;
  inside: boolean;
  status: DavomatLiveStatus;
  decision: AttendanceDecision;
  attendance: { checkInTime: Date; checkOutTime: Date | null; lateMinutes: number } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCURACY_LIMIT_M = 100;

const benign = (reason: PingResult['reason']): PingResult => ({
  accepted: false,
  reason,
  inside: false,
  status: 'not_arrived',
  decision: 'NONE',
  attendance: null,
});

/**
 * Ingests one GPS ping, runs the geofence anti-cheat gates + per-day KELDI/KETDI
 * state machine, and applies the resulting attendance transition. Returns the
 * authoritative live status for the employee PWA.
 */
@Injectable()
export class HrPingIngestService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ingest(accountId: string, employeeId: string, dto: PingInput): Promise<PingResult> {
    // 1. Opt-in + assigned work-location gate (benign — never 500).
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { attendanceOptIn: true, workLocationId: true },
    });
    if (!emp || !emp.attendanceOptIn) return benign('not_opted_in');
    if (!emp.workLocationId) return benign('no_location');

    // 2. Accuracy gate — unreliable pings never touch the state machine (no persist).
    if (dto.accuracy > ACCURACY_LIMIT_M) return benign('accuracy');

    const loc = await this.prisma.client.hrWorkLocation.findFirst({
      where: { id: emp.workLocationId, accountId },
      select: { lat: true, lng: true, radiusMeters: true },
    });
    if (!loc) return benign('no_location');

    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    // 3. Jump filter vs the last stored ping today (anti-teleport).
    const lastPing = await this.prisma.client.hrLocationPing.findFirst({
      where: { accountId, employeeId, createdAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: 'desc' },
      select: { lat: true, lng: true, createdAt: true },
    });
    const prevPoint = lastPing
      ? { lat: lastPing.lat, lng: lastPing.lng, at: lastPing.createdAt }
      : null;
    if (!jumpFilter(prevPoint, { lat: dto.lat, lng: dto.lng, at: now })) return benign('jump');

    // 4. Geofence test + persist the ping (audit + state-machine source).
    const inside = isInsideGeofence({ lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy }, loc);
    await this.prisma.client.hrLocationPing.create({
      data: {
        accountId,
        employeeId,
        lat: dto.lat,
        lng: dto.lng,
        accuracy: Math.round(dto.accuracy),
        inside,
      },
    });

    // 5. Build the recent-sample window (last ~12 pings, ascending) + open record.
    const recentDesc = await this.prisma.client.hrLocationPing.findMany({
      where: { accountId, employeeId, createdAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { inside: true, createdAt: true },
    });
    const samples: InsideSample[] = recentDesc
      .slice()
      .reverse()
      .map((p) => ({ inside: p.inside, at: p.createdAt }));

    const openRecord = await this.prisma.client.hrAttendance.findFirst({
      where: {
        accountId,
        employeeId,
        checkInTime: { gte: dayStart, lt: dayEnd },
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
      select: { id: true, checkInTime: true, lateMinutes: true },
    });

    const decision = decideAttendance({ samples, hasOpenRecord: !!openRecord, now });

    // 6. Apply the transition.
    let attendance: PingResult['attendance'] = openRecord
      ? {
          checkInTime: openRecord.checkInTime,
          checkOutTime: null,
          lateMinutes: openRecord.lateMinutes,
        }
      : null;

    if (decision === 'KELDI') {
      const weekday = tashkentWeekday(now);
      const sched = await this.prisma.client.employeeWorkSchedule.findUnique({
        where: { employeeId_weekday: { employeeId, weekday } },
        select: { startTime: true, endTime: true, isDayOff: true },
      });
      const lateMinutes = computeLateMinutes(now, sched, HR_TZ);
      const created = await this.prisma.client.hrAttendance.create({
        data: {
          accountId,
          employeeId,
          checkInTime: now,
          checkInLat: dto.lat,
          checkInLng: dto.lng,
          checkInAccuracy: Math.round(dto.accuracy),
          source: 'auto_gps',
          workLocationId: emp.workLocationId,
          lateMinutes,
        },
        select: { checkInTime: true, checkOutTime: true, lateMinutes: true },
      });
      attendance = created;
    } else if (decision === 'KETDI' && openRecord) {
      // Atomic close — only one worker wins the race (mirror hr-deadline-expire).
      await this.prisma.client.hrAttendance.updateMany({
        where: { id: openRecord.id, checkOutTime: null },
        data: { checkOutTime: now, checkOutLat: dto.lat, checkOutLng: dto.lng },
      });
      attendance = {
        checkInTime: openRecord.checkInTime,
        checkOutTime: now,
        lateMinutes: openRecord.lateMinutes,
      };
    }

    const status: DavomatLiveStatus = attendance
      ? attendance.checkOutTime
        ? 'left'
        : 'at_work'
      : 'not_arrived';

    return { accepted: true, reason: null, inside, status, decision, attendance };
  }
}
