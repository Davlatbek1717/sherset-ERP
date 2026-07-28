import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { estimateRoute } from './route-estimate.util.js';

const RECOMPUTE_AFTER_MS = 45_000; // har trip uchun ≥45s'да bir marta (xarajat nazorati)
const PING_FRESH_MS = 30 * 60 * 1000; // haydovchi ping'i shundan yangi bo'lsa
const BATCH = 50;

/**
 * ETA-worker (TZ 2026-07-28 §6). Har ~30s: faol (assigned/enroute) yetkazmalar
 * bo'yicha haydovchining oxirgi joyidan manzilgача masofa+ETA hisoblaydi va
 * `DriverTrip`ga yozadi (→ jonli-board ko'rsatadi). Hozir `estimateRoute`
 * (haversine-baho) — Yandex Router kalit+billing ulanганда shu joy almashadi
 * (interfeys bir xil). Har trip ≥45s throttle → API/xarajat nazorati.
 */
@Injectable()
export class DriverEtaWorkerCron {
  private readonly logger = new Logger(DriverEtaWorkerCron.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Cron('*/30 * * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`ETA worker failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Exposed for tests. `now` injectable for determinism. */
  async runOnce(now: Date = new Date()): Promise<{ updated: number }> {
    const staleBefore = new Date(now.getTime() - RECOMPUTE_AFTER_MS);
    const trips = await this.prisma.client.driverTrip.findMany({
      where: {
        status: { in: ['assigned', 'enroute'] },
        OR: [{ etaComputedAt: null }, { etaComputedAt: { lt: staleBefore } }],
      },
      orderBy: { assignedAt: 'asc' },
      take: BATCH,
      select: { id: true, accountId: true, driverId: true, destLat: true, destLng: true },
    });

    const pingFreshSince = new Date(now.getTime() - PING_FRESH_MS);
    let updated = 0;
    for (const trip of trips) {
      const ping = await this.prisma.client.hrLocationPing.findFirst({
        where: {
          accountId: trip.accountId,
          employeeId: trip.driverId,
          createdAt: { gte: pingFreshSince },
        },
        orderBy: { createdAt: 'desc' },
        select: { lat: true, lng: true },
      });
      if (!ping) continue; // yangi ping yo'q — ETA hisoblab bo'lmaydi
      const est = estimateRoute(ping, { lat: trip.destLat, lng: trip.destLng });
      await this.prisma.client.driverTrip.update({
        where: { id: trip.id },
        data: {
          distanceMeters: est.distanceMeters,
          etaSeconds: est.etaSeconds,
          etaComputedAt: now,
        },
      });
      updated += 1;
    }
    return { updated };
  }
}
