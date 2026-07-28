import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { type StopPing, detectMovement } from './stop-detection.util.js';

// Movement-oyna. currentStopSec (jonli «X daqiqa to'xtagan» ko'rsatkichi) shu
// oynadagi eng eski statsionar ping'dan hisoblanadi — shuning uchun oyna to'xtash
// boshlanishини qamrab olishi kerak. 90 daqiqa + 180 ping ko'p realistik to'xtashni
// qoplaydi (turgan haydovchi siyrаk ping qiladi). Undan uzun to'xtash oyna bilan
// cheklanadi (jonli ko'rsatkich uchun maqbul); ANIQ unbounded qiymat — boundary-
// query (oxirgi MOVE_RADIUS'dan uzoq ping) Faza 3 yaxshilanishi (review #3).
const RECENT_PINGS = 180;
const RECENT_WINDOW_MS = 90 * 60 * 1000; // 90 daqiqa
const STALE_MS = 5 * 60 * 1000; // oxirgi ping shundan eski → «oflayn/stale»

export interface DriverLiveRow {
  driverId: string;
  name: string;
  online: boolean; // ochiq smena bormi
  status: 'moving' | 'stopped' | 'unknown' | 'offline';
  lastPing: { lat: number; lng: number; heading: number | null; at: Date; ageSec: number } | null;
  currentStopSec: number;
  shift: { id: string; startedAt: Date; distanceMeters: number } | null;
  activeTrip: {
    id: string;
    destLat: number;
    destLng: number;
    destAddress: string | null;
    status: string;
    distanceMeters: number | null;
    etaSeconds: number | null;
  } | null;
}

/**
 * Dispecher jonli-board (TZ 2026-07-28 §9). Har FIELD-haydovchi bo'yicha: oxirgi
 * joy + harakat holati (detectMovement) + ochiq smena + faol yetkazma. Real-time
 * frontend shu snapshot'ни poll/SSE bilan yangilaydi.
 */
@Injectable()
export class DriverLiveService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async board(accountId: string): Promise<DriverLiveRow[]> {
    const drivers = await this.prisma.client.employee.findMany({
      where: { accountId, trackingMode: 'field', archived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const now = new Date();
    const since = new Date(now.getTime() - RECENT_WINDOW_MS);

    return Promise.all(drivers.map((d) => this.rowFor(accountId, d.id, d.name, now, since)));
  }

  private async rowFor(
    accountId: string,
    driverId: string,
    name: string,
    now: Date,
    since: Date,
  ): Promise<DriverLiveRow> {
    const [recentDesc, shift, activeTrip] = await Promise.all([
      this.prisma.client.hrLocationPing.findMany({
        where: { accountId, employeeId: driverId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_PINGS,
        select: { lat: true, lng: true, speed: true, heading: true, createdAt: true },
      }),
      this.prisma.client.driverShift.findFirst({
        where: { accountId, driverId, endedAt: null },
        orderBy: { startedAt: 'desc' },
        select: { id: true, startedAt: true, distanceMeters: true },
      }),
      this.prisma.client.driverTrip.findFirst({
        where: { accountId, driverId, status: { in: ['assigned', 'enroute', 'arrived'] } },
        orderBy: { assignedAt: 'desc' },
        select: {
          id: true,
          destLat: true,
          destLng: true,
          destAddress: true,
          status: true,
          distanceMeters: true,
          etaSeconds: true,
        },
      }),
    ]);

    const latest = recentDesc[0] ?? null;
    const ageSec = latest ? Math.round((now.getTime() - latest.createdAt.getTime()) / 1000) : 0;
    const online = !!shift;

    let status: DriverLiveRow['status'];
    let currentStopSec = 0;
    if (!online) {
      status = 'offline';
    } else if (!latest || now.getTime() - latest.createdAt.getTime() > STALE_MS) {
      status = 'unknown'; // smena ochiq, lekin yangi ping yo'q
    } else {
      const samples: StopPing[] = recentDesc
        .slice()
        .reverse()
        .map((p) => ({ lat: p.lat, lng: p.lng, speed: p.speed, at: p.createdAt }));
      const move = detectMovement(samples, now);
      status = move.status === 'unknown' ? 'moving' : move.status;
      currentStopSec = move.currentStopSec;
    }

    return {
      driverId,
      name,
      online,
      status,
      lastPing: latest
        ? {
            lat: latest.lat,
            lng: latest.lng,
            heading: latest.heading,
            at: latest.createdAt,
            ageSec,
          }
        : null,
      currentStopSec,
      shift: shift
        ? { id: shift.id, startedAt: shift.startedAt, distanceMeters: shift.distanceMeters }
        : null,
      activeTrip,
    };
  }

  /** Bitta haydovchi kun-izi (ping-polyline) — route replay uchun. */
  async routeForDay(accountId: string, driverId: string, dayStart: Date, dayEnd: Date) {
    const pings = await this.prisma.client.hrLocationPing.findMany({
      where: { accountId, employeeId: driverId, createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: 'asc' },
      select: { lat: true, lng: true, speed: true, createdAt: true },
    });
    const samples: StopPing[] = pings.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      speed: p.speed,
      at: p.createdAt,
    }));
    const move = detectMovement(samples, dayEnd);
    return {
      points: pings.map((p) => ({ lat: p.lat, lng: p.lng, at: p.createdAt })),
      stops: move.stops,
    };
  }
}
