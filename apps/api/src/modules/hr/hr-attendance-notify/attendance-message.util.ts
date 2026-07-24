import { formatMinor } from '../hr-telegram-bridge/template-render.util.js';

/**
 * Davomat → Telegram xabar-tuzuvchilari (sof funksiyalar, o'zbekcha,
 * emoji-Markdown uslub — `HrAdminNotifier` naqshi). Vaqt (`timeHHmm`) va pul
 * (`fineMinor`) chaqiruvchi tomonidan oldindan tayyorlanadi (bu yerда BigInt
 * faqat `formatMinor` orqali o'tadi). Spec §8 format.
 */

export interface CheckInView {
  name: string;
  /** "HH:mm" (Asia/Tashkent) — chaqiruvchi formatlaydi. */
  timeHHmm: string;
  lateMinutes: number;
  fineMinor: bigint;
  department?: string | null;
  position?: string | null;
}

export interface CheckOutView {
  name: string;
  timeHHmm: string;
  /** "Bugun ishlagan" yorlig'i (masalan "8s 50d") — bo'lmasa tushiriladi. */
  workedLabel?: string | null;
}

/** tiyin (BigInt) → "100 so'm" (HrAdminNotifier fmtAmount bilan bir xil). */
function fmtAmount(minor: bigint): string {
  return `${formatMinor(minor)} so'm`;
}

/**
 * "Keldi" xabari. Kechikish 0 bo'lsa ⏰ tushiriladi; jarima 0 bo'lsa 💰
 * tushiriladi; bo'lim/lavozim bo'lmasa 🏢 tushiriladi.
 */
export function buildCheckInText(v: CheckInView): string {
  let timeLine = `🕐 ${v.timeHHmm}`;
  if (v.lateMinutes > 0) {
    timeLine += `   ⏰ ${v.lateMinutes} daqiqa kechikdi`;
  }
  const lines = [`✅ *Keldi* — ${v.name}`, timeLine];
  if (v.fineMinor > 0n) {
    lines.push(`💰 Jarima: ${fmtAmount(v.fineMinor)}`);
  }
  const orgParts = [v.department, v.position].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  if (orgParts.length > 0) {
    lines.push(`🏢 ${orgParts.join(' · ')}`);
  }
  return lines.join('\n');
}

/** "Ketdi" xabari. `workedLabel` bo'lmasa ⏱ qismi tushiriladi. */
export function buildCheckOutText(v: CheckOutView): string {
  let timeLine = `🕐 ${v.timeHHmm}`;
  if (v.workedLabel && v.workedLabel.trim().length > 0) {
    timeLine += `   ⏱ Bugun ishlagan: ${v.workedLabel}`;
  }
  return [`🚪 *Ketdi* — ${v.name}`, timeLine].join('\n');
}

/** Test-send matni (Task 9 — sozlama to'g'riligini tasdiqlash). */
export function buildTestText(): string {
  return '✅ Test — davomat bildirishnoma ulandi';
}
