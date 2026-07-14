/**
 * MIJOZGA KETADIGAN TELEGRAM XABARLARI (2026-07-13).
 *
 * Bu matnlarni MIJOZ o'qiydi — xodim emas. Shuning uchun:
 *   • hurmat bilan, ayblovsiz ohangda (mijoz — hamkor, qarzdor emas)
 *   • summalar bo'sh joy bilan ajratilgan: 1 250 000 so'm (o'qish oson)
 *   • qisqa: Telegram bildirishnomasida birinchi qator ko'rinadi
 *   • HTML (<b>) — Telegram parse_mode='HTML'
 *
 * Sof funksiyalar: DB/tarmoqqa tegmaydi ⇒ testda o'lchash oson.
 */

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

/** HTML in'yeksiyasini oldini olish — mijoz nomi <b> ni buzmasin. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Yangi qarz yozildi. */
export function debtIssuedMessage(args: {
  name: string;
  totalMinor: bigint;
  nextContactAt: Date | null;
}): string {
  const lines = [
    `Assalomu alaykum, ${esc(args.name)}!`,
    '',
    `Sizga <b>${fmtSom(args.totalMinor)} so'm</b> qarz yozildi.`,
  ];
  if (args.nextContactAt) {
    lines.push(`To'lov muddati: <b>${fmtWhen(args.nextContactAt)}</b>`);
  }
  lines.push('', "To'lov qilganingizdan so'ng chekni shu yerga yuborsangiz bo'ladi.");
  return lines.join('\n');
}

/** To'lov qabul qilindi (qoldiq bor). */
export function paymentMessage(args: {
  name: string;
  amountMinor: bigint;
  remainingMinor: bigint;
}): string {
  return [
    `Rahmat, ${esc(args.name)}!`,
    '',
    `<b>${fmtSom(args.amountMinor)} so'm</b> to'lovingiz qabul qilindi.`,
    `Qolgan qarz: <b>${fmtSom(args.remainingMinor)} so'm</b>`,
  ].join('\n');
}

/** Qarz to'liq yopildi. */
export function debtClosedMessage(args: { name: string; amountMinor: bigint }): string {
  return [
    `Rahmat, ${esc(args.name)}!`,
    '',
    `<b>${fmtSom(args.amountMinor)} so'm</b> to'lovingiz qabul qilindi.`,
    '✅ Qarzingiz <b>to‘liq yopildi</b>.',
    '',
    'Hamkorligingiz uchun rahmat!',
  ].join('\n');
}

/** To'lov muddati keldi — eslatma. */
export function reminderMessage(args: { name: string; remainingMinor: bigint }): string {
  return [
    `Assalomu alaykum, ${esc(args.name)}!`,
    '',
    `Eslatma: <b>${fmtSom(args.remainingMinor)} so'm</b> qarzingiz to'lov muddati keldi.`,
    '',
    "Iltimos, imkoniyat bo'lganda to'lovni amalga oshiring. Savolingiz bo'lsa shu yerga yozing.",
  ].join('\n');
}
