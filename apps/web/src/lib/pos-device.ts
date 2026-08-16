/**
 * Kassa qurilmasining kirish ma'lumoti (id + maxfiy kalit).
 *
 * IKKI SAQLASH JOYI:
 *  - Electron (prod kassa): `window.electronAPI.getDevice()` → Windows DPAPI
 *    bilan shifrlangan fayl. Kalit brauzer xotirasida qolmaydi.
 *  - Brauzer (dev/QA): `localStorage`. Ataylab zaifroq — bu yo'l ishlab
 *    chiqarish kassasi uchun emas, sinov uchun. Juftlash EKRANI esa bitta:
 *    ikki muhitda bir xil kod ishlaydi.
 */
export interface PosDeviceCreds {
  deviceId: string;
  deviceSecret: string;
  name: string;
}

const KEY = 'sherset.pos-device';

interface ShellBridge {
  isSherset?: boolean;
  getDevice?: () => PosDeviceCreds | null;
  setDevice?: (creds: PosDeviceCreds) => void;
  clearDevice?: () => void;
}

function shell(): ShellBridge | null {
  if (typeof window === 'undefined') return null;
  const el = (window as { electronAPI?: ShellBridge }).electronAPI;
  return el?.isSherset ? el : null;
}

/**
 * Sahifa Electron kassa-qobig'i (`.exe`) ichida ochilganmi?
 *
 * NEGA KERAK (2026-08-13): juftlash 2026-08-11 da olib tashlangan — yangi
 * o'rnatmalarda qurilma kaliti YO'Q, ya'ni `readPosDevice()` null va «bu kassa
 * ish o'rnimi?» savoliga faqat qurilma kaliti orqali javob berib bo'lmaydi.
 * Qobiq preload'i `window.electronAPI.isSherset` bayrog'ini HAR sahifada
 * o'rnatadi — bu deterministik belgi. Layout/PIN-qulf shunga qarab .exe ichida
 * doim kassa ko'rinishini va PIN ekranini tanlaydi (parol ekrani emas).
 *
 * ⚠️ Bu — QULAYLIK, xavfsizlik emas (bayroqni istagan sahifa soxtalashi
 * mumkin). Haqiqiy cheklovlar serverda (`KioskGuard`, ruxsat matritsasi).
 */
export function isShersetShell(): boolean {
  return shell() !== null;
}

/**
 * Bu sahifa kassa ISH O'RNImi? (F8 — kassir-tanlash ekrani mezoni.)
 *
 * lockout-yo'nalishi bilan BITTA mezon: yo `.exe` qobig'i
 * (`isShersetShell`), yo juftlangan qurilma kaliti (`readPosDevice`). Oddiy
 * brauzerda (admin ish stoli) kassir-almashtirish ekrani chizilmaydi —
 * u yerda to'liq login bor.
 *
 * ⚠️ QULAYLIK, xavfsizlik emas — haqiqiy to'siq serverda
 * (`POST /auth/pos-pin/switch` kiosk-juftlikni o'zi tekshiradi).
 */
export function isPosWorkstation(): boolean {
  return isShersetShell() || readPosDevice() !== null;
}

function isComplete(v: unknown): v is PosDeviceCreds {
  const o = v as Partial<PosDeviceCreds> | null;
  return (
    !!o &&
    typeof o.deviceId === 'string' &&
    typeof o.deviceSecret === 'string' &&
    typeof o.name === 'string'
  );
}

export function readPosDevice(): PosDeviceCreds | null {
  const el = shell();
  if (el?.getDevice) {
    const fromShell = el.getDevice();
    return isComplete(fromShell) ? fromShell : null;
  }
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Yarim yozuv — kirishga urinmaymiz: 401 bilan chalkash xato o'rniga
    // «juftlanmagan» ekrani ko'rsatiladi.
    return isComplete(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePosDevice(creds: PosDeviceCreds): void {
  const el = shell();
  if (el?.setDevice) {
    el.setDevice(creds);
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(creds));
}

export function clearPosDevice(): void {
  const el = shell();
  if (el?.clearDevice) {
    el.clearDevice();
    return;
  }
  localStorage.removeItem(KEY);
}
