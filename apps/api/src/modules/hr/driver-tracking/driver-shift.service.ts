import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { type StopPing, detectMovement } from './stop-detection.util.js';

/**
 * Haydovchi smena — grafiksiz ish o'lchovi (TZ 2026-07-28 §4.4). «Smenani
 * boshlash/tugatish». Yakunда smena ping'laridan harakat/to'xtash soniyalari +
 * yetkazmalar soni qayta-hisoblanadi (yagona manba = ping-oqim).
 */
@Injectable()
export class DriverShiftService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Smenani boshlash. Ochiq smena bo'lsa — o'shani qaytaradi (idempotent). */
  async start(accountId: string, driverId: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: driverId, accountId },
      select: { trackingMode: true },
    });
    if (!emp || emp.trackingMode !== 'field') {
      throw new BadRequestException('Xodim haydovchi (field) rejimida emas');
    }
    const open = await this.prisma.client.driverShift.findFirst({
      where: { accountId, driverId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (open) return open;
    try {
      return await this.prisma.client.driverShift.create({
        data: { accountId, driverId, startedAt: new Date() },
      });
    } catch (e) {
      // Parallel/qayta-bosilган start (partial-unique `one_open_per_driver` bo'yicha
      // P2002) → poygani yutgan mavjud smenani qaytar (idempotent shartnoma real bo'ladi).
      if ((e as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.client.driverShift.findFirst({
          where: { accountId, driverId, endedAt: null },
          orderBy: { startedAt: 'desc' },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  /** Ochiq smena — yoki null. */
  async current(accountId: string, driverId: string) {
    return this.prisma.client.driverShift.findFirst({
      where: { accountId, driverId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Smenani tugatish. Ping-oqimidan active/stop soniyalari + smena davomida
   * bajarilган yetkazmalar sonini qayta-hisoblab yozadi. `autoClosed`=false.
   */
  async end(accountId: string, driverId: string) {
    const open = await this.prisma.client.driverShift.findFirst({
      where: { accountId, driverId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) throw new BadRequestException('Ochiq smena topilmadi');
    return this.close(accountId, open.id, driverId, open.startedAt, new Date(), false);
  }

  /** Smena yakuniy yozuvi (end + auto-close cron shu yerni chaqiradi). */
  async close(
    accountId: string,
    shiftId: string,
    driverId: string,
    startedAt: Date,
    endedAt: Date,
    autoClosed: boolean,
  ) {
    const pings = await this.prisma.client.hrLocationPing.findMany({
      where: { accountId, employeeId: driverId, createdAt: { gte: startedAt, lte: endedAt } },
      orderBy: { createdAt: 'asc' },
      select: { lat: true, lng: true, speed: true, createdAt: true },
    });
    const samples: StopPing[] = pings.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      speed: p.speed,
      at: p.createdAt,
    }));
    const move = detectMovement(samples, endedAt);

    const deliveriesCount = await this.prisma.client.driverTrip.count({
      where: {
        accountId,
        driverId,
        status: 'completed',
        completedAt: { gte: startedAt, lte: endedAt },
      },
    });

    return this.prisma.client.driverShift.update({
      where: { id: shiftId },
      data: {
        endedAt,
        activeSeconds: Math.round(move.movingSec),
        stopSeconds: Math.round(move.stoppedSec),
        deliveriesCount,
        autoClosed,
      },
    });
  }
}
