/**
 * Electron qobiq versiyasi bo'yicha imkoniyat darvozasi.
 *
 * Qobiq va web MUSTAQIL yetkaziladi: web VPS deploy bilan darhol keladi, exe esa
 * yuklab olinib kassir «Chiqish» bosganda o'rnatiladi. Ya'ni bir muddat ESKI exe
 * YANGI web bilan ishlaydi. Darvozasiz bu holat chekni butunlay yiqitardi (eski
 * qobiq bo'sh printer nomini xato deb qaytaradi), shuning uchun web imkoniyatni
 * versiyadan o'qib qaror qiladi.
 */

/** `printSheet('')` ni «Windows sukut printeri» deb tushunadigan eng past versiya. */
export const SHELL_DEFAULT_PRINTER_MIN = '1.4.0';

/**
 * `version >= min` (major.minor.patch).
 *
 * Qismlar SON sifatida taqqoslanadi — satr taqqoslashda `1.10.0 < 1.9.0` bo'lib
 * chiqardi. Noto'g'ri/bo'sh qiymat ESKI deb hisoblanadi: noaniqlikda darvoza
 * YOPIQ qoladi (xavfsiz tomon — eski yo'l ishlaydi).
 */
export function shellAtLeast(version: string | undefined, min: string): boolean {
  const parts = (v: string): number[] =>
    v.split('.').map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isNaN(n) ? -1 : n;
    });
  const a = parts(version ?? '');
  const b = parts(min);
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? -1;
    const y = b[i] ?? 0;
    if (x < 0) return false; // parse bo'lmadi ⇒ eski
    if (x !== y) return x > y;
  }
  return true;
}
