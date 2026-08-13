/**
 * Kassa ekranining KO'RSATISH siyosati (hisob-kitob emas).
 *
 * Bu yerda faqat «nima ekranga chiqadi» turadi. Formulalar `lib/pos/cart-math.ts`
 * da qoladi va bu bayroqlar ularга TEGMAYDI — ya'ni raqam yashirilganda ham
 * hisoblanadi va sinaladi.
 */

/**
 * 🔴 Marja (tan narx + foyda) kassa ekranida KO'RSATILMAYDI — egasining qarori
 * (2026-08-11, jonli monoblok sinovidan keyin): mijoz kassir yoniga kelganda
 * «Tan: 14 375» va «Foyda: +5 525 (27,8%)» yozuvlari ochiq ko'rinib qolardi.
 *
 * Yagona manba: savat qatori, savat footeri va qator tahrir oynasi — uchalasi
 * ham shu bayroqni o'qiydi. Ilgari bu uch joy mustaqil yozilgan edi va biri
 * o'zgarsa qolgani jimgina eskirardi (repo'ning ma'lum bug-klassi).
 *
 * 🔴 Hisob-kitob ATAYLAB o'chirilmadi (faqat render to'sildi). Sabablari:
 *   1. ZARAR / «optomdan past» ogohlantirishlari — kassirning yagona nazorati —
 *      o'sha tan narxga tayanadi va KO'RINISHDA QOLADI (raqamsiz, faqat bayroq);
 *   2. `__tests__/pos-cart-profit.test.ts` shu formulalarni «100% marja yolg'oni»
 *      bug-klassidan qo'riqlaydi (`costMinor ?? 0n` — NULL ≠ 0). Kod o'chirilsa
 *      qo'riqchi ham o'lardi va keyingi «yana ko'rsatamiz» qarori raqamni noldan
 *      yozishga majbur qilardi — aynan o'sha yolg'on qaytib kelardi.
 *
 * Qaytarish = shu qiymatni `true` qilish (boshqa hech narsa).
 */
export const SHOW_MARGIN_ON_SCREEN = false;

/**
 * Qidiruv kartasida tan narx («Kelgan», `buyPrice`) ko'rinadimi.
 * 2026-08-13 egasining qarori (P02): YO'Q — «tovarni qidirganda qoldiq
 * ko'rinishi kerak, lekin kelgan narxi va optom narxi ko'rinmasligi kerak» —
 * mijoz ko'zi oldidagi ekranda tan narx ochiq turmasin. Bu SHOW_MARGIN_ON_SCREEN
 * (savat, 2026-08-11) qarorining setkadagi davomi. Hisob-mantiq (foyda,
 * narx-pol) bunga BOG'LIQ EMAS. Qaytarish = `true`.
 */
export const SHOW_COST_IN_SEARCH = false;

/**
 * Savat qatorida «Optom» chegara ko'rinadimi. 2026-08-13 (P02): YO'Q — optom
 * narx faqat qator-tahrir modalida qoladi (egasining aniq talabi, F3).
 * P12'dagi «sotuv narxi — maxfiy emas» asosi shu kuni bekor qilindi.
 * «Optomdan past» sariq tasma va hisob-mantiq bunga BOG'LIQ EMAS. Qaytarish = `true`.
 */
export const SHOW_WHOLESALE_IN_CART = false;
