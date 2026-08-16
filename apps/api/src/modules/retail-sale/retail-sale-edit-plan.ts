/**
 * TO'LANGAN CHEKNI TAHRIRLASH — QAROR MODULI (sof, I/O yo'q).
 *
 * NEGA ALOHIDA FAYL: tahrir yetti quyi-tizimga tegadi (ombor · to'lovlar ·
 * pul daftari · kontragent balansi · smena · mijoz buyurtmasi · sodiqlik).
 * Qaror servis ichida qolsa hech qachon testda qulflanmaydi — bu loyihada
 * aynan shu klass bir necha marta jim ma'lumot buzilishiga olib kelgan.
 * Endi I/O servisda, QAROR shu yerda.
 *
 * 🔴 ASOSIY G'OYA — «YECHIB QAYTA YOZISH» EMAS, «SOF FARQ».
 *
 * Barcha daftarlar delta bilan ishlaydi (`stock.applyDeltas`,
 * `money.applyDeltas`, `counterpartyBalance.applyDelta`). Shuning uchun
 * to'liq `unpost` + qayta `post` qilish SHART EMAS va xavfli ham: u har
 * daftarga ikki marta tegadi va oradagi har xato yarim-yechilgan chek
 * qoldiradi. Buning o'rniga faqat FARQ yoziladi:
 *
 *     ombor  delta = eski_soni − yangi_soni     (musbat ⇒ javonga qaytadi)
 *     qarz   delta = yangi_qarz − eski_qarz
 *     kassa  delta = yangi_to'langan − eski_to'langan
 *
 * Chek raqami (`name`) O'ZGARMAYDI — u `@@unique([accountId, name])` va
 * aynan shu sabab «qaytarish + yangi chek» yo'li raqamni saqlay olmaydi.
 */

/** Miqdorlar `Decimal` bo'lgani uchun satr sifatida yuriladi (aniqlik yo'qolmasin). */
export interface EditPositionInput {
  productId: string;
  /** Musbat o'nlik satr, masalan «2» yoki «2.5». */
  quantity: string;
  /** Qator jami (chegirma hisobga olingan), tiyin. */
  sumMinor: bigint;
}

export interface PostedSaleSnapshot {
  positions: EditPositionInput[];
  /** Chekdan naqd/karta bilan to'langan qism (tiyin). */
  paidMinor: bigint;
  /** Chekdan qarzga yozilgan qism (tiyin). */
  debtMinor: bigint;
  /** Kontragent — qarz qismi bo'lsa MAJBURIY. */
  agentId: string | null;
  /**
   * Shu chekdan ALLAQACHON qaytarilgan miqdorlar (mahsulot → soni).
   * Tahrir bulardan pastga tusha OLMAYDI: aks holda qaytarish asl chekdan
   * oshib ketardi va ombor/kassa manfiyga ketardi.
   */
  refundedQty: Record<string, string>;
}

export interface EditRequest {
  positions: EditPositionInput[];
  paidMinor: bigint;
  debtMinor: bigint;
  agentId: string | null;
}

export interface StockDelta {
  productId: string;
  /** Musbat ⇒ omborga QAYTADI, manfiy ⇒ ombordan CHIQADI. */
  qtyDelta: string;
}

export interface EditPlan {
  /** Bo'sh bo'lsa tahrir QABUL QILINMAYDI va sabablari shu yerda. */
  refusals: string[];
  stockDeltas: StockDelta[];
  /** Kassaga sof ta'sir: musbat ⇒ kassaga qo'shiladi, manfiy ⇒ chiqadi. */
  cashDeltaMinor: bigint;
  /** Kontragent balansiga sof ta'sir (musbat ⇒ qarzi oshadi). */
  balanceDeltaMinor: bigint;
  /** Chekning yangi jami summasi. */
  newSumMinor: bigint;
  /** Hech narsa o'zgarmagan bo'lsa `true` — servis yozuvsiz qaytadi. */
  noop: boolean;
  /**
   * Mijoz almashtirildi. `true` bo'lsa servis `balanceDeltaMinor` bilan
   * KIFOYALANMASLIGI kerak: eski mijozdan `−eski_qarz`, yangisiga
   * `+yangi_qarz` yozilishi shart (aks holda qarz noto'g'ri odamda qoladi).
   */
  agentChanged: boolean;
}

const SCALE = 6;
const POW = 10n ** BigInt(SCALE);

/** «2.5» → 2500000n (6 xona). Noto'g'ri satr `null` qaytaradi. */
export function parseQty(v: string): bigint | null {
  if (!/^\d+(\.\d{1,6})?$/.test(v.trim())) return null;
  const [i = '0', f = ''] = v.trim().split('.');
  return BigInt(i) * POW + BigInt(f.padEnd(SCALE, '0'));
}

/** 2500000n → «2.5» (ortiqcha nollar olib tashlanadi). */
export function formatQty(scaled: bigint): string {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const i = abs / POW;
  const f = (abs % POW).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${i}${f ? `.${f}` : ''}`;
}

function sumQty(rows: EditPositionInput[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const r of rows) {
    const q = parseQty(r.quantity);
    if (q === null) continue;
    m.set(r.productId, (m.get(r.productId) ?? 0n) + q);
  }
  return m;
}

/**
 * Tahrir rejasini hisoblaydi. HECH QACHON throw qilmaydi — rad etish sabablari
 * `refusals` da qaytadi, chunki ular foydalanuvchiga ko'rsatiladigan xabar.
 */
export function planReceiptEdit(before: PostedSaleSnapshot, after: EditRequest): EditPlan {
  const refusals: string[] = [];

  // ── Kirish tekshiruvi ──────────────────────────────────────────────────
  if (after.positions.length === 0) {
    refusals.push(
      "Chekda kamida bitta tovar qolishi kerak — bo'sh chek uchun bekor qilish/qaytarish bor",
    );
  }
  for (const p of after.positions) {
    const q = parseQty(p.quantity);
    if (q === null) refusals.push(`Noto'g'ri miqdor: «${p.quantity}»`);
    else if (q === 0n) refusals.push(`Miqdor 0 bo'lishi mumkin emas: ${p.productId}`);
    if (p.sumMinor < 0n) refusals.push(`Qator summasi manfiy bo'lishi mumkin emas: ${p.productId}`);
  }
  if (after.paidMinor < 0n) refusals.push("To'langan summa manfiy bo'lishi mumkin emas");
  if (after.debtMinor < 0n) refusals.push("Qarz summasi manfiy bo'lishi mumkin emas");

  const newSumMinor = after.positions.reduce((s, p) => s + p.sumMinor, 0n);
  if (after.paidMinor + after.debtMinor !== newSumMinor) {
    refusals.push(
      `To'lov taqsimoti jamiga teng emas: ${after.paidMinor + after.debtMinor} ≠ ${newSumMinor}`,
    );
  }
  if (after.debtMinor > 0n && !after.agentId) {
    refusals.push('Qarzga yozish uchun mijoz tanlanishi shart');
  }

  // ── Qaytarilgan miqdordan pastga tushmaslik ────────────────────────────
  // 🔴 Bu qulf bo'lmasa: 5 dona sotilgan, 3 tasi qaytarilgan chekni 2 donaga
  // tushirish qaytarishni asl chekdan oshirib yuborardi (ombor + kassa
  // manfiyga ketardi va uni hech bir keyingi amal tuzatmasdi).
  const newQty = sumQty(after.positions);
  for (const [productId, refundedRaw] of Object.entries(before.refundedQty)) {
    const refunded = parseQty(refundedRaw);
    if (refunded === null || refunded === 0n) continue;
    const now = newQty.get(productId) ?? 0n;
    if (now < refunded) {
      refusals.push(
        `«${productId}» bo'yicha ${formatQty(refunded)} dona allaqachon qaytarilgan — ` +
          `undan kam qilib bo'lmaydi (hozir ${formatQty(now)})`,
      );
    }
  }

  // ── Sof farqlar ────────────────────────────────────────────────────────
  const oldQty = sumQty(before.positions);
  const productIds = new Set([...oldQty.keys(), ...newQty.keys()]);
  const stockDeltas: StockDelta[] = [];
  for (const productId of productIds) {
    // Musbat ⇒ omborga qaytadi (kam sotildi), manfiy ⇒ ombordan chiqadi.
    const delta = (oldQty.get(productId) ?? 0n) - (newQty.get(productId) ?? 0n);
    if (delta !== 0n) stockDeltas.push({ productId, qtyDelta: formatQty(delta) });
  }

  const cashDeltaMinor = after.paidMinor - before.paidMinor;
  const balanceDeltaMinor = after.debtMinor - before.debtMinor;

  // 🔴 MIJOZ ALMASHTIRILSA `balanceDeltaMinor` YETARLI EMAS: bitta sof farq
  // ikki xil mijozga to'g'ri kelmaydi — eskisidan to'liq yechilib, yangisiga
  // to'liq yozilishi shart. Shuning uchun bu belgi rejada OSHKORA qaytariladi
  // va servis o'sha holatda ikki `applyDelta` qiladi. `noop` ham shuni
  // hisobga oladi: summa o'zgarmasa ham mijoz almashgani — o'zgarish.
  const agentChanged = (before.agentId ?? null) !== (after.agentId ?? null);

  const noop =
    refusals.length === 0 &&
    stockDeltas.length === 0 &&
    cashDeltaMinor === 0n &&
    balanceDeltaMinor === 0n &&
    !agentChanged;

  return {
    refusals,
    stockDeltas: refusals.length > 0 ? [] : stockDeltas,
    cashDeltaMinor: refusals.length > 0 ? 0n : cashDeltaMinor,
    balanceDeltaMinor: refusals.length > 0 ? 0n : balanceDeltaMinor,
    newSumMinor,
    noop,
    agentChanged,
  };
}
