/**
 * MIJOZGA KETADIGAN TELEGRAM XABARLARI (2026-07-13).
 *
 * Bu matnlarni MIJOZ o'qiydi — xodim emas. Shuning uchun:
 *   • hurmat bilan, ayblovsiz ohangda (mijoz — hamkor, qarzdor emas)
 *   • summalar bo'sh joy bilan ajratilgan: 1 250 000 so'm (o'qish oson)
 *   • ODDIY MATN (HTML tegsiz) — xabar shaxsiy raqamdan (MTProto userbot) ketadi,
 *     u parse_mode'ni QO'LLAMAYDI (aks holда <b> teglar literal ko'rinardi)
 *   • bir xil tuzilish: «hurmatli {nom}» → mazmun → aloqa/karta → «Sherset jamoasi»
 *
 * Sof funksiyalar: DB/tarmoqqa tegmaydi ⇒ testda o'lchash oson.
 */

// Sherset aloqa/to'lov ma'lumotlari — qarz-eslatma xabarida mijozga ko'rsatiladi.
// O'zgartirish kerak bo'lsa FAQAT shu 3 qatorni tahrirlang.
const SHERSET_CONTACT_PHONE = '+998915748800';
const SHERSET_CARD = '9860 1201 2532 1642';
const SHERSET_CARD_OWNER = 'Ilhom Ziyaviddinov';

/** 125000000 (tiyin) → «1 250 000». */
export function fmtSom(minor: bigint): string {
  return (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** ISO sana → «20.07.2026, 09:00» (Toshkent vaqti). */
export function fmtWhen(d: Date): string {
  return d.toLocaleString('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Barcha matnlar ODDIY MATN (HTML tegsiz) va bir xil professional tuzilishда:
// salomlashuv + «hurmatli {nom}» → mazmun → 📞💳👨‍💻 aloqa/karta bloki →
// «SHERSET jamoasi!» imzosi. HTML yo'q — xabar shaxsiy raqamdan (MTProto
// userbot) ketadi, u parse_mode'ni QO'LLAMAYDI (aks holда teglar literal
// ko'rinardi).

/**
 * Aloqa/karta bloki (2026-07-20) — barcha xabarlarda BIR XIL ko'rinish.
 * Ilgari har funksiya o'zicha bitta qatorli "Karta raqam: X" / "Savollar
 * bo'lsa: Y" yozardi — vizual notekis edi (masalan reminderMessage'da emoji
 * bilan, boshqalarida yo'q). Endi hammasi shu 3 qatorni ishlatadi.
 */
function contactBlock(): string[] {
  return [
    `📞 Savollar uchun: ${SHERSET_CONTACT_PHONE}`,
    `💳 Karta raqam: ${SHERSET_CARD}`,
    `👨‍💻 Karta egasi: ${SHERSET_CARD_OWNER}`,
  ];
}

/** Yangi qarz berildi (2026-07-20: reminderMessage bilan bir xil vizual uslub). */
export function debtIssuedMessage(args: {
  name: string;
  totalMinor: bigint;
  nextContactAt: Date | null;
}): string {
  const lines = [
    `Assalomu alaykum, hurmatli ${args.name}!`,
    '',
    `🧾 Sizga ${fmtSom(args.totalMinor)} so'm miqdorida qarz rasmiylashtirildi.`,
  ];
  if (args.nextContactAt) {
    lines.push(`To'lov muddati: ${fmtWhen(args.nextContactAt)}`);
  }
  lines.push('', ...contactBlock(), '');
  lines.push(
    "To'lovni amalga oshirgach, chekni shu yerga yuborishingiz mumkin.",
    'Hamkorligingiz uchun rahmat!',
    'SHERSET jamoasi!',
  );
  return lines.join('\n');
}

/** To'lov qabul qilindi, qoldiq bor (2026-07-20: bir xil vizual uslub). */
export function paymentMessage(args: {
  name: string;
  amountMinor: bigint;
  remainingMinor: bigint;
}): string {
  return [
    `Assalomu alaykum, hurmatli ${args.name}!`,
    '',
    `💵 ${fmtSom(args.amountMinor)} so'm to'lovingiz qabul qilindi, rahmat!`,
    `Qolgan qarzingiz: ${fmtSom(args.remainingMinor)} so'm.`,
    '',
    ...contactBlock(),
    '',
    'SHERSET jamoasi!',
  ].join('\n');
}

/** Qarz to'liq yopildi (2026-07-20: bir xil vizual uslub). */
export function debtClosedMessage(args: { name: string; amountMinor: bigint }): string {
  return [
    `Assalomu alaykum, hurmatli ${args.name}!`,
    '',
    `✅ ${fmtSom(args.amountMinor)} so'm to'lovingiz qabul qilindi. Qarzingiz to'liq yopildi!`,
    '',
    "Hamkorligingiz uchun katta rahmat! Savollar bo'lsa, biz bilan bog'laning:",
    `📞 ${SHERSET_CONTACT_PHONE}`,
    '',
    'SHERSET jamoasi!',
  ].join('\n');
}

/**
 * To'lov yozuvi QAYTARILDI (storno, 2026-07-16). Mijoz avval «qabul qilindi»
 * xabarini olgan — tuzatishni ham bilishi kerak, aks holda uning hisob-kitobi
 * biznikidan ajralib qoladi. Ohang: ayblovsiz, «xatolik tuzatildi».
 * (2026-07-20: bir xil vizual uslub.)
 */
export function paymentReversedMessage(args: {
  name: string;
  amountMinor: bigint;
  remainingMinor: bigint;
}): string {
  return [
    `Assalomu alaykum, hurmatli ${args.name}!`,
    '',
    `⚠️ ${fmtSom(args.amountMinor)} so'm to'lov yozuvi texnik xatolik tufayli bekor qilindi.`,
    `Joriy qarzingiz: ${fmtSom(args.remainingMinor)} so'm.`,
    '',
    ...contactBlock(),
    '',
    'SHERSET jamoasi!',
  ].join('\n');
}

/**
 * To'lov muddati keldi — eslatma (2026-07-19 talab: yangi tartibli format).
 *
 * ODDIY MATN (HTML tegsiz) — chunki xabar shaxsiy raqamdan (MTProto userbot)
 * ketadi, u parse_mode='HTML' ni QO'LLAMAYDI (aks holда <b> literal ko'rinardi).
 * Summa bo'sh joy bilan guruhlangan, musbat (mijozga «qarzdorlik mavjud» aniq).
 */
export function reminderMessage(args: { name: string; remainingMinor: bigint }): string {
  return [
    `Assalomu alaykum, hurmatli ${args.name}!`,
    '',
    `✅ Eslatib o'tamiz, Sizning ${fmtSom(args.remainingMinor)} so'm miqdorida to'lanmagan qarzingiz mavjud. Iltimos, kelishilgan muddatda qarzdorlikni yopishingizni so'raymiz.`,
    '',
    ...contactBlock(),
    '',
    "Qarz - bu omonat, omonatga xiyonat bo'lmasin!",
    'SHERSET jamoasi!',
  ].join('\n');
}
