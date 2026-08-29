/**
 * Matnli kalitni Postgres MASLAHAT-QULFI (`pg_advisory_xact_lock`) qabul
 * qiladigan SIGNED 64-bit songa aylantiradi. Sof funksiya — DB yo'q, holat yo'q.
 *
 * NEGA KERAK: «avval tekshir, keyin yoz» naqshi READ COMMITTED da ATOMIK
 * EMAS — ikki parallel chaqiruvchi ikkalasi ham «yo'q ekan» deb ko'rib,
 * ikkalasi ham yozadi. Unique indeks buni yopardi, lekin u migratsiya talab
 * qiladi va mavjud dublikatlarda deploy'ni yiqitadi; tranzaksiya-qulfi esa
 * SXEMAGA TEGMAYDI va shu tranzaksiya tugashi bilan o'zi bo'shaydi.
 *
 * NEGA JS'da hisoblanadi, `hashtext()` bilan emas: `hashtext` /
 * `hashtextextended` — Postgres'ning ICHKI, hujjatlashtirilmagan
 * funksiyalari. Qulf kaliti ilova semantikasining bir qismi va DB versiyasiga
 * bog'liq bo'lmasligi kerak; sof funksiya esa testlanadi.
 *
 * FNV-1a 64-bit. Kriptografik EMAS va bo'lishi shart ham emas: to'qnashuv
 * ikki BEGONA kalitni qisqa vaqt navbatga qo'yadi, xolos — to'g'rilikka ta'sir
 * qilmaydi, chunki qulf olingandan KEYIN yana aniq tekshiruv bor.
 */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

export function advisoryLockKey(key: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  // UTF-8 BAYTLARI bo'yicha (kod nuqtalari bo'yicha EMAS): kirill/lotin
  // aralash kalitlar ham platformadan qat'i nazar bir xil son beradi.
  for (const byte of new TextEncoder().encode(key)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  }
  // Postgres `bigint` — SIGNED. Ishorasiz qiymat 2^63 dan oshsa
  // «value out of range» bo'lardi.
  return BigInt.asIntN(64, hash);
}
