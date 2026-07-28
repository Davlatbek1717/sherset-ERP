import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { TripAssignInput, TripStatusInput } from './driver-tracking.schema.js';

// Ruxsat etilган holat-o'tishlari (TZ §4.3). Orqaga/noqonuniy sakrash rad etiladi.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  assigned: ['enroute', 'arrived', 'cancelled'],
  enroute: ['arrived', 'cancelled'],
  arrived: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Yetkazma (DriverTrip) CRUD + holat-mashina (TZ 2026-07-28 §4.3).
 * assigned → enroute → arrived → completed | cancelled.
 */
@Injectable()
export class DriverTripService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async assign(accountId: string, input: TripAssignInput) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: input.driverId, accountId },
      select: { trackingMode: true },
    });
    if (!emp || emp.trackingMode !== 'field') {
      throw new BadRequestException('Xodim haydovchi (field) rejimida emas');
    }
    return this.prisma.client.driverTrip.create({
      data: {
        accountId,
        driverId: input.driverId,
        orderType: input.orderType,
        orderId: input.orderId ?? null,
        destLat: input.destLat,
        destLng: input.destLng,
        destAddress: input.destAddress ?? null,
        geocodeSource: input.geocodeSource,
        status: 'assigned',
      },
    });
  }

  async updateStatus(accountId: string, tripId: string, input: TripStatusInput) {
    const trip = await this.prisma.client.driverTrip.findFirst({
      where: { id: tripId, accountId },
      select: { id: true, status: true }, // holatni ham o'qiymiz (transition + CAS)
    });
    if (!trip) throw new NotFoundException('Yetkazma topilmadi');

    if (!ALLOWED_TRANSITIONS[trip.status]?.includes(input.status)) {
      throw new BadRequestException(`Holat o'tishi mumkin emas: ${trip.status} → ${input.status}`);
    }

    const now = new Date();
    const stamp: Record<string, Date> = {};
    if (input.status === 'enroute') stamp.startedAt = now;
    if (input.status === 'arrived') stamp.arrivedAt = now;
    if (input.status === 'completed') stamp.completedAt = now;

    // Guarded CAS: faqat holat hali o'qigan qiymatда bo'lsa yoz. Ping auto-arrival
    // (markArrivalIfInside) oraда 'arrived' qilib qo'ygan bo'lsa → count=0 → rad,
    // tasdiqlangan kelishni HECH QACHON bosib ketmaydi (review #10).
    const res = await this.prisma.client.driverTrip.updateMany({
      where: { id: tripId, status: trip.status },
      data: { status: input.status, ...stamp },
    });
    if (res.count === 0) {
      throw new ConflictException("Holat parallel o'zgardi — qayta yuklab, qayta urining");
    }
    return this.prisma.client.driverTrip.findFirstOrThrow({ where: { id: tripId } });
  }

  /** Haydovchining yetkazmalari (faol birinchi, keyin oxirgilari). */
  async listForDriver(accountId: string, driverId: string, limit = 20) {
    return this.prisma.client.driverTrip.findMany({
      where: { accountId, driverId },
      orderBy: { assignedAt: 'desc' },
      take: limit,
    });
  }

  /** Barcha faol (assigned/enroute/arrived) yetkazmalar — dispecher board. */
  async listActive(accountId: string) {
    return this.prisma.client.driverTrip.findMany({
      where: { accountId, status: { in: ['assigned', 'enroute', 'arrived'] } },
      orderBy: { assignedAt: 'desc' },
    });
  }
}
