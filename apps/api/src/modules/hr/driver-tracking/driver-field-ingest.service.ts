import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { haversineMeters } from '../attendance-geo/haversine.util.js';
import { jumpFilter } from '../attendance-geo/jump-filter.util.js';
import type { FieldPingInput } from './driver-tracking.schema.js';

export interface FieldPingResult {
  accepted: boolean;
  reason: 'not_field' | 'no_shift' | 'accuracy' | 'jump' | null;
  /** Faol yetkazma manzil-radiusiga kirib «yetdi» belgilangan bo'lsa. */
  arrivedTripId: string | null;
}

const ACCURACY_LIMIT_M = 100;
const ARRIVE_RADIUS_M = 80; // dest-geofence (TZ §6)
// Ketma-ket ikki ping juda uzoq (oflayn-bufer bo'shligi) → masofaga qo'shmaymiz.
const MAX_GAP_FOR_DISTANCE_SEC = 15 * 60;

const benign = (reason: FieldPingResult['reason']): FieldPingResult => ({
  accepted: false,
  reason,
  arrivedTripId: null,
});

/**
 * FIELD-rejim (haydovchi) ping ingest — geofence keldi/ketdi'дан BUTUNLAY
 * ajratilган (mavjud attendance oqimiga tegmaydi, 0 regressiya). Faqat OCHIQ
 * smena vaqtida qabul qilinadi (maxfiylik: 24/7 emas). Ping'ni yozadi, smena
 * masofasini yig'adi, faol yetkazma manziliga yetganда «arrived» belgilaydi.
 *
 * MA'LUM CHEKLOV (review #7): bitta haydovchining IKKI ping'i bir vaqtda kelsa,
 * ikkalasi ham bir xil `prevForDistance`ни o'qib, masofani ikki marta sanashi
 * mumkin. Native klient buferni KETMA-KET (bittalab) flush qiladi → amaliy xavf
 * past. To'liq yechim (per-driver `pg_advisory_xact_lock` + tranzaksiya) —
 * keyingi bosqich refactori.
 */
@Injectable()
export class DriverFieldIngestService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ingestField(
    accountId: string,
    employeeId: string,
    dto: FieldPingInput,
  ): Promise<FieldPingResult> {
    // 1. Faqat FIELD-rejim xodim (benign — hech qachon 500).
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { trackingMode: true },
    });
    if (!emp || emp.trackingMode !== 'field') return benign('not_field');

    // 2. Ochiq smena shart (maxfiylik: smena tashqarisida kuzatilmaydi).
    const shift = await this.prisma.client.driverShift.findFirst({
      where: { accountId, driverId: employeeId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!shift) return benign('no_shift');

    // 3. Accuracy gate — ishonchsiz ping holat/masofaga ta'sir qilmaydi.
    if (dto.accuracy > ACCURACY_LIMIT_M) return benign('accuracy');

    const effectiveAt = dto.ts ?? new Date();

    // 4. Jump filter vs globally-oxirgi ping (anti-teleport — konservativ).
    const lastPing = await this.prisma.client.hrLocationPing.findFirst({
      where: { accountId, employeeId },
      orderBy: { createdAt: 'desc' },
      select: { lat: true, lng: true, createdAt: true },
    });
    const prevPoint = lastPing
      ? { lat: lastPing.lat, lng: lastPing.lng, at: lastPing.createdAt }
      : null;
    if (!jumpFilter(prevPoint, { lat: dto.lat, lng: dto.lng, at: effectiveAt })) {
      return benign('jump');
    }

    // 5. Masofa uchun XRONOLOGIK oldingi ping (createdAt < effectiveAt). Oflayn-bufer
    //    flush'да yangi ping'ning ts'i eski bo'lishi mumkin → globally-newest EMAS,
    //    aks holda buferdagi ketma-ket ping'lar 0 masofa qo'shardi (review #4). Yozишdan
    //    OLDIN so'raladi — yangi qator (createdAt=effectiveAt) o'z-o'zidan chiqib qoladi.
    const prevForDistance = await this.prisma.client.hrLocationPing.findFirst({
      where: { accountId, employeeId, createdAt: { lt: effectiveAt } },
      orderBy: { createdAt: 'desc' },
      select: { lat: true, lng: true, createdAt: true },
    });

    // 6. Ping'ni yoz (audit + jonli-manba + stop-detection oqimi).
    await this.prisma.client.hrLocationPing.create({
      data: {
        accountId,
        employeeId,
        lat: dto.lat,
        lng: dto.lng,
        accuracy: Math.round(dto.accuracy),
        inside: false, // geofence FIELD uchun ma'nosiz
        speed: dto.speed ?? null,
        heading: dto.heading ?? null,
        createdAt: effectiveAt,
      },
    });

    // 7. Smena masofasini yig' (jump-filter'дан o'tган → spike yo'q). Juda katta
    //    vaqt-bo'shligi (oflayn flush chekkasi) masofaga qo'shilmaydi (soxta uzun chiziq).
    if (prevForDistance) {
      const gapSec = (effectiveAt.getTime() - prevForDistance.createdAt.getTime()) / 1000;
      if (gapSec > 0 && gapSec <= MAX_GAP_FOR_DISTANCE_SEC) {
        const stepM = Math.round(
          haversineMeters(
            { lat: prevForDistance.lat, lng: prevForDistance.lng },
            { lat: dto.lat, lng: dto.lng },
          ),
        );
        if (stepM > 0) {
          await this.prisma.client.driverShift.update({
            where: { id: shift.id },
            data: { distanceMeters: { increment: stepM } },
          });
        }
      }
    }

    // 7. Dest-arrival: faol yetkazma (assigned/enroute) manzil-radiusiga kirsa.
    const arrivedTripId = await this.markArrivalIfInside(accountId, employeeId, {
      lat: dto.lat,
      lng: dto.lng,
    });

    return { accepted: true, reason: null, arrivedTripId };
  }

  /** Faol trip manzil-radiusiga kirilса `arrived` (atomik — bir marta). */
  private async markArrivalIfInside(
    accountId: string,
    driverId: string,
    pt: { lat: number; lng: number },
  ): Promise<string | null> {
    const trip = await this.prisma.client.driverTrip.findFirst({
      where: { accountId, driverId, status: { in: ['assigned', 'enroute'] } },
      orderBy: { assignedAt: 'desc' },
      select: { id: true, destLat: true, destLng: true },
    });
    if (!trip) return null;
    const dist = haversineMeters(pt, { lat: trip.destLat, lng: trip.destLng });
    if (dist > ARRIVE_RADIUS_M) return null;
    const res = await this.prisma.client.driverTrip.updateMany({
      where: { id: trip.id, status: { in: ['assigned', 'enroute'] } },
      data: { status: 'arrived', arrivedAt: new Date() },
    });
    return res.count > 0 ? trip.id : null;
  }
}
