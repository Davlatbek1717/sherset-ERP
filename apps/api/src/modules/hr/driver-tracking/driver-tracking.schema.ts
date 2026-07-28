import { z } from 'zod';

/**
 * HR haydovchi jonli-tracking DTO'lari (TZ 2026-07-28).
 * Field-ping — mavjud geofence PingSchema'дан ALOHIDA (native klient yangi
 * endpoint'ga yuboradi; speed/heading qo'shimcha, geofence PWA'ga tegmaydi).
 */

export const FieldPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000),
  speed: z.number().min(0).max(200).nullish(), // m/s
  heading: z.number().min(0).max(360).nullish(), // daraja
  /** Klient ping vaqti (oflayn-bufer flush uchun). Yo'q → server vaqti. */
  ts: z.coerce.date().optional(),
});
export type FieldPingInput = z.infer<typeof FieldPingSchema>;

export const TripAssignSchema = z.object({
  driverId: z.string().uuid(),
  orderType: z.enum(['demand', 'retail_sale', 'manual']).default('manual'),
  orderId: z.string().uuid().nullish(),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
  destAddress: z.string().trim().max(500).nullish(),
  geocodeSource: z.enum(['auto', 'manual']).default('manual'),
});
export type TripAssignInput = z.infer<typeof TripAssignSchema>;

export const TripStatusSchema = z.object({
  status: z.enum(['assigned', 'enroute', 'arrived', 'completed', 'cancelled']),
});
export type TripStatusInput = z.infer<typeof TripStatusSchema>;
