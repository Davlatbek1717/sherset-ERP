/**
 * P3 — smenani yopishga to'sqinlik qilayotgan YAKUNLANMAGAN cheklar xabari.
 *
 * NEGA ALOHIDA, SOF MODUL: xabarning O'ZI mahsulot xulqi — kassir uni real
 * ish paytida, mijozlar navbatida o'qiydi va undan KEYINGI QADAMNI bilishi
 * kerak. Servis ichida qolsa faqat Prisma dublyori bilan test qilinardi;
 * bu yerda esa har shakl (bitta chek · ko'p chek · uzun ro'yxat · notanish
 * holat) mocksiz qulflanadi (`compute-positions` / `retail-tenders` naqshi).
 *
 * NEGA UMUMAN TO'SIQ (egasi qarori, 2026-08-12): yakunlanmagan chek yopilgan
 * smenada abadiy osilib qolardi — uni endi na to'lash mumkin (`post()` OCHIQ
 * smena talab qiladi), na kassirga bekor qilish taklif qilinadi. Avto-bekor
 * esa ATAYLAB rad etildi: haqiqiy mijoz kutayotgan chek jimgina yo'qolib
 * ketishi to'lovni bloklashdan battar.
 */

/** Kassir tilidagi bosqich nomlari — POS ekranidagi yorliqlar bilan bir xil. */
const STAGE_LABEL: Record<string, string> = {
  draft: 'savatda',
  picking: "yig'ilmoqda",
  ready: "yig'ilgan",
};

/**
 * Ro'yxatda ko'rsatiladigan maksimal chek. Qolganlari «va yana N ta» bo'ladi.
 *
 * Chegara bor, chunki xabar 400-javob matni: uzun ro'yxat POS'dagi toast'ga
 * sig'maydi va kassir MUHIM birinchi qatorni ham ko'rmasdi.
 */
const MAX_LISTED = 8;

export interface UnresolvedSale {
  name: string;
  state: string;
  sumMinor: bigint;
}

/**
 * Tiyin → «84 300» ko'rinishi (uch xonali guruhlar).
 *
 * `toLocaleString` ATAYLAB ishlatilmadi: server locale'iga bog'liq bo'lardi
 * va test mashinada boshqa, prodda boshqa natija berardi (jim divergensiya).
 */
export function formatSom(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / 100n).toString();
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '−' : ''}${grouped}`;
}

/**
 * Smena yopilishini bloklovchi xabar: nima bo'ldi · nima qilish kerak · qaysi
 * cheklar. Shu tartibda — kassir birinchi jumlada javobni oladi.
 */
export function describeUnresolvedSales(sales: readonly UnresolvedSale[]): string {
  const listed = sales.slice(0, MAX_LISTED);
  const rest = sales.length - listed.length;
  const items = listed
    .map((s) => `${s.name} (${STAGE_LABEL[s.state] ?? s.state}, ${formatSom(s.sumMinor)} so'm)`)
    .join(' · ');
  const tail = rest > 0 ? ` · va yana ${rest} ta` : '';
  return (
    `Smenani yopib bo'lmaydi: ${sales.length} ta chek yakunlanmagan. ` +
    `Har birini TO'LANG yoki BEKOR QILING, keyin smenani yoping. ` +
    `Cheklar: ${items}${tail}`
  );
}
