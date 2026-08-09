/**
 * MK10 — SLA panelidagi qatordan HUJJATGA havola.
 *
 * ⚠️ `refId` ning ma'nosi bosqichga qarab FARQ QILADI: yig'ish bosqichida u
 * `MsPickList` qatorining id'si (buyurtmaning o'zi EMAS), smenada esa
 * `CashierSession` id'si. Shuning uchun xaritalash `docType` bo'yicha
 * qilinadi va noma'lum tur uchun `null` qaytadi — noto'g'ri havola menejerni
 * begona hujjatga olib borardi, bu esa 404 dan battar.
 */

const DOC_HREF: Record<string, (id: string) => string> = {
  // MoySklad buyurtmasining yig'ish varaqasi (buyurtma id'si emas).
  customerorder: (id) => `/pick-lists/${id}`,
  supply: (id) => `/supplies/${id}`,
  cashiersession: (id) => `/retail/sessions/${id}`,
  demand: (id) => `/demands/${id}`,
  paymentin: (id) => `/payments-in/${id}`,
  paymentout: (id) => `/payments-out/${id}`,
  cashin: (id) => `/cash-in/${id}`,
  cashout: (id) => `/cash-out/${id}`,
  // `servicerequest` ATAYLAB yo'q: murojaatning detal sahifasi hali qurilmagan
  // (`/service-requests` faqat ro'yxat), ya'ni havola hech qayerga olib
  // bormasdi.
};

export function stuckDocHref(docType: string, refId: string): string | null {
  const build = DOC_HREF[docType];
  return build ? build(refId) : null;
}

/**
 * Davomiylik matni. 48 soatdan oshsa kunga o'tadi — menejer «73 soat» ni
 * o'qib bo'lmaydi, «3 kun» esa darhol tushunarli.
 *
 * Tarjima FE'da: BE tayyor matn qaytarmaydi (MK03 sabog'i — server yopgan
 * o'zbekcha matn ru interfeysda turib qolardi).
 */
export function stuckDuration(hours: number): { unit: 'hours' | 'days'; value: number } {
  if (hours >= 48) return { unit: 'days', value: Math.floor(hours / 24) };
  return { unit: 'hours', value: Math.max(1, Math.round(hours)) };
}
