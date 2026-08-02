/**
 * Yetkazma holat-mashinasi — FE ko'zgusi.
 *
 * Manba haqiqat serverda: `apps/api/src/modules/hr/driver-tracking/
 * driver-trip.service.ts` → `ALLOWED_TRANSITIONS`. Bu yerda nusxa turishining
 * sababi: dispecher paneli qaysi tugmalarni ko'rsatishini RENDER paytida
 * bilishi kerak. Ikki jadval farq qilib ketsa dispecher bosgan tugma 400
 * qaytaradi (yoki mumkin bo'lgan o'tish yashirin qoladi) — shuning uchun
 * `driver-trip-fsm.test.ts` ikkalasini o'qib solishtiradi (drift-qulf).
 */

export type TripStatus = 'assigned' | 'enroute' | 'arrived' | 'completed' | 'cancelled';

export const NEXT_STATUS: Record<TripStatus, readonly TripStatus[]> = {
  assigned: ['enroute', 'arrived', 'cancelled'],
  enroute: ['arrived', 'cancelled'],
  arrived: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Manzil koordinatasi — server `TripAssignSchema` bilan BIR XIL chegaralar
 * (lat −90..90, lng −180..180). FE'da tekshirilmasa dispecher xatoni faqat
 * so'rov ketgandan keyin ko'radi; chegaralar farq qilsa esa FE ruxsat berib,
 * server rad etardi.
 */
export function coordsValid(lat: string, lng: string): boolean {
  if (lat.trim() === '' || lng.trim() === '') return false;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
}
