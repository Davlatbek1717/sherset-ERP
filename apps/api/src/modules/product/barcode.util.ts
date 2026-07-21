/**
 * Mahsulot shtrix-kodi generatori — EAN-13 (do'kon standarti, to'g'ri nazorat
 * raqami bilan). Barcode'i yo'q mahsulotlarga avtomatik beriladi, shunda ular
 * skaner (kamera/USB) orqali topiladi.
 *
 * Prefiks «21» — GS1 «restricted circulation / internal use» (20–29) diapazoni:
 * ichki, korxona ichida ishlatiladigan kodlar uchun ajratilgan, global GTIN
 * bilan to'qnashmaydi. Seed'dagi test barcode'lari «20…» bilan boshlanadi —
 * «21» ulardan farqli, dublikat bo'lmaydi. Format: «21» + 10 xonali ketma-ket
 * raqam (jami 12 «ma'lumot» xonasi) + 1 nazorat raqami = 13 xona.
 */

/**
 * EAN-13 nazorat raqami: dastlabki 12 xonaga (chapdan, 1-pozitsiya toq)
 * navbatma-navbat ×1 / ×3 og'irlik, yig'indini 10 ga to'ldiruvchi raqam.
 */
export function ean13CheckDigit(twelve: string): string {
  if (!/^\d{12}$/.test(twelve)) {
    throw new Error(`ean13CheckDigit: 12 raqam kutiladi, keldi «${twelve}»`);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = twelve.charCodeAt(i) - 48;
    // Pozitsiya 1 (index 0) — ×1, pozitsiya 2 (index 1) — ×3, ...
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** To'liq EAN-13 to'g'ri (13 xona + nazorat raqami) ekanini tekshiradi. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code[12];
}

/**
 * Ketma-ket raqamdan kanonik EAN-13 quradi: «21» + 10 xonali padded seq +
 * nazorat raqami. seq 0…9_999_999_999 oralig'ida (10 xona) — amalda yetarli.
 */
export function makeEan13(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0 || seq > 9_999_999_999) {
    throw new Error(`makeEan13: seq 0…9999999999 oralig'ida bo'lsin, keldi ${seq}`);
  }
  const body = `21${String(seq).padStart(10, '0')}`; // 12 xona
  return body + ean13CheckDigit(body);
}
