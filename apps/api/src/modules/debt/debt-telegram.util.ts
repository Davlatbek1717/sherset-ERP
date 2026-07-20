/**
 * MIJOZGA KETADIGAN TELEGRAM XABARLARI (2026-07-13).
 *
 * 2026-07-20e: qarz yaratilganda/to'lov qabul qilinganda/storno bo'lganda
 * AVTOMATIK yuboriladigan xabarlar (debtIssuedMessage/paymentMessage/
 * debtClosedMessage/paymentReversedMessage) olib tashlandi — foydalanuvchi
 * buni so'ramagan edi, faqat QO'LDA bosiladigan «Xabar yuborish» tugmasi
 * (reminderMessage, debt.service.ts#sendTelegramReminder) xabar yuborishi
 * kerak edi. Endi shu faylda faqat reminderMessage qoladi.
 *
 * Bu matnlarni MIJOZ o'qiydi — xodim emas. Shuning uchun:
 *   • hurmat bilan, ayblovsiz ohangda (mijoz — hamkor, qarzdor emas)
 *   • summalar bo'sh joy bilan ajratilgan: 1 250 000 so'm (o'qish oson)
 *   • HTML TEGSIZ, lekin GramJS Markdown bilan ishlaydi (2026-07-20) — xabar
 *     shaxsiy raqamdan (MTProto userbot) ketadi, u Bot API'ning
 *     parse_mode='HTML' ni QO'LLAMAYDI (aks holда <b> teglar literal ko'rinardi
 *     — aynan shu bug bor edi).
 *   • **MUHIM: bu fayl GramJS'ning MarkdownV2Parser dialektida yoziladi**,
 *     DEFOLT parser (`**bold**`) EMAS — `mtproto-worker.service.ts`
 *     `sourceEventType`'i `debt.` bilan boshlansa `format: 'markdown-v2'`ni
 *     tanlaydi (faqat shu xabar oilasi uchun, boshqa HR/supply bildirishnoma
 *     matnlariga tegmaydi). MarkdownV2 belgilagichlari DEFOLTdan FARQLI:
 *     bitta `*qalin*` (ikkita EMAS), `__tagliq__` (underline) — ikkalasi
 *     birga: `*__x__*`. 2026-07-20b talab (foydalanuvchi aniq spetsifikatsiya
 *     berdi): summa RAQAMINING o'zi HAM *qalin*, HAM __tagliq__ ("so'm"
 *     so'zisiz), aloqa-blok label'lari ("Savollar uchun:", "Karta raqam:",
 *     "Karta egasi:") *qalin*, LEKIN karta raqami va boshqa qiymatlar oddiy
 *     (qalin EMAS).
 *   • bir xil tuzilish: «hurmatli {nom}» → mazmun → aloqa/karta → «Sherset jamoasi»
 *
 * Sof funksiyalar: DB/tarmoqqa tegmaydi ⇒ testda o'lchash oson.
 */

// Sherset aloqa/to'lov ma'lumotlari — qarz-eslatma xabarida mijozga ko'rsatiladi.
// O'zgartirish kerak bo'lsa FAQAT shu 3 qatorni tahrirlang.
const SHERSET_CONTACT_PHONE = '+998915748800';
const SHERSET_CARD = '9860 1201 2532 1642';
const SHERSET_CARD_OWNER = 'Ilhom Ziyaviddinov';

/**
 * Erkin matn (mijoz nomi) GramJS Markdown belgilovchilarini tasodifan hosil
 * qilib, undan keyingi butun xabarni noto'g'ri qalin/kursiv qilib qo'ymasin
 * (masalan nomda `*` yoki `_` bo'lsa). Har bir maxsus belgidan keyin
 * ko'zga ko'rinmaydigan bo'sh-kenglik belgisi (U+200B) qo'yamiz — GramJS
 * parseri endi ularni bir-biriga qo'shni delimiter deb o'qiy olmaydi,
 * odam esa hech qanday farqni sezmaydi. MarkdownV2Parser belgilagichlari
 * DEFOLTdan ko'p (`*_~\`|-`) — `-` (kursiv) va `|` (spoyler, `||`) ham shu
 * ro'yxatga kiradi, aks holda ismdagi chiziqcha/vertikal chiziq tasodifiy
 * formatlash hosil qilishi mumkin.
 */
const ZERO_WIDTH_SPACE = '​';
export function mdSafe(s: string): string {
  return s.replace(/[*_~`|-]/g, (c) => c + ZERO_WIDTH_SPACE);
}

/** 125000000 (tiyin) → «1 250 000». */
export function fmtSom(minor: bigint): string {
  return (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Barcha matnlar HTML TEGSIZ, lekin GramJS MarkdownV2 bilan bir xil
// professional tuzilishда: salomlashuv + «hurmatli {nom}» → mazmun (summa
// raqami *qalin* HAM __tagliq__) → 📞💳👨‍💻 aloqa/karta bloki (label'lar
// *qalin*, qiymatlar oddiy) → «SHERSET jamoasi!» imzosi. HTML yo'q — xabar
// shaxsiy raqamdan (MTProto userbot) ketadi, u Bot API'ning parse_mode'ni
// QO'LLAMAYDI (aks holда <b> teglar literal ko'rinardi — aynan shu bug bor
// edi, 2026-07-20 tuzatildi).

/**
 * Aloqa/karta bloki (2026-07-20) — barcha xabarlarda BIR XIL ko'rinish.
 * Ilgari har funksiya o'zicha bitta qatorli "Karta raqam: X" / "Savollar
 * bo'lsa: Y" yozardi — vizual notekis edi (masalan reminderMessage'da emoji
 * bilan, boshqalarida yo'q). Endi hammasi shu 3 qatorni ishlatadi.
 * (2026-07-20b: label'lar *qalin*, qiymatlar — jumladan karta raqami ham —
 * oddiy qoldiriladi, foydalanuvchi aniq spetsifikatsiyasi bo'yicha.)
 */
function contactBlock(): string[] {
  return [
    `📞 *Savollar uchun:* ${SHERSET_CONTACT_PHONE}`,
    `💳 *Karta raqam:* ${SHERSET_CARD}`,
    `👨‍💻 *Karta egasi:* ${SHERSET_CARD_OWNER}`,
  ];
}

/**
 * To'lov muddati keldi — eslatma (2026-07-19 talab: yangi tartibli format).
 *
 * HTML TEGSIZ — chunki xabar shaxsiy raqamdan (MTProto userbot) ketadi, u
 * Bot API'ning parse_mode='HTML' ni QO'LLAMAYDI (aks holда <b> literal
 * ko'rinardi). Summa raqami *qalin* HAM __tagliq__ (bold+underline) qilinadi
 * — GramJS'ning MarkdownV2Parser dialekti orqali (fayl boshidagi izohga
 * qarang). Summa bo'sh joy bilan guruhlangan, musbat (mijozga «qarzdorlik
 * mavjud» aniq).
 */
export function reminderMessage(args: { name: string; remainingMinor: bigint }): string {
  return [
    `Assalomu alaykum, hurmatli ${mdSafe(args.name)}!`,
    '',
    `✅ Eslatib o'tamiz, Sizning *__${fmtSom(args.remainingMinor)}__* so'm miqdorida to'lanmagan qarzingiz mavjud. Iltimos, kelishilgan muddatda qarzdorlikni yopishingizni so'raymiz.`,
    '',
    ...contactBlock(),
    '',
    "Qarz - bu omonat, omonatga xiyonat bo'lmasin!",
    'SHERSET jamoasi!',
  ].join('\n');
}
