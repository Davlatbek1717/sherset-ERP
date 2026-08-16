import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';

/**
 * «Hisob-kitob cheki» — mijozning BUTUN hisobi bitta Telegram xabarida
 * (egasi, 2026-08-16: «mijoz bilan bo'lgan barcha cheklar borishi kerak»).
 *
 * Sof modul: DB ham, Telegram ham yo'q — xizmat qatlami ma'lumot beradi, matn
 * shu yerda tug'iladi va `debt-receipt-message.util.test.ts` da qulflanadi.
 *
 * 🔴 NEGA AVTOMATIK XABAR SHABLONI QAYTA ISHLATILMADI: `buildCounterpartyMessage`
 * BITTA hodisani xabar qiladi («shu chek qarzga qo'shildi»). Bu yerdagisi —
 * HISOBOT: ochilish qoldig'i, ko'p hujjat, yig'iladigan yakun va bo'linish.
 * Ikkalasini bitta funksiyaga tiqish har ikkalasini ham buzardi; o'rniga
 * SO'Z BOYLIGI birlashtirildi (sarlavhalar, «Jami qarzingiz», emoji tili),
 * ya'ni mijoz ikki xil ovoz eshitmaydi.
 *
 * Dizayn qarorlari testda sabablari bilan yozilgan (yuqoridan pastga: eng katta
 * raqam yuqorida, yakun yig'iladi, ustunlar tekislanmaydi, manfiy son yo'q).
 */

/** Telegram matn chegarasi 4096; zaxira bilan — nom uzun bo'lsa ham sig'sin. */
export const DEBT_RECEIPT_CHUNK_LIMIT = 3800;

/**
 * Rus o'lchov birliklari → o'zbekcha. Tovar kartalari MoySklad'dan kelgan va
 * `шт`/`м` bilan to'la; xabar esa o'zbekcha — aralashmasin. Noma'lum birlik
 * ASL HOLIDA qoladi (ro'yxatni to'ldirish uchun xabarni buzish shart emas).
 */
const UOM_MAP: Record<string, string> = {
  шт: 'dona',
  м: 'm',
  м2: 'm²',
  м3: 'm³',
  кг: 'kg',
  г: 'g',
  л: 'l',
  компл: 'komplekt',
  уп: 'upakovka',
  пач: 'pachka',
  рул: 'rulon',
  пар: 'juft',
};

export function uomLabel(uom?: string | null): string {
  // Oxirgi nuqta tashlanadi: kataloglarda «шт» va «шт.» ikkalasi ham uchraydi.
  const raw = (uom ?? '').trim().replace(/\.+$/, '');
  if (!raw) return '';
  return UOM_MAP[raw] ?? UOM_MAP[raw.toLowerCase()] ?? raw;
}

/** Absolyut summa → «1 434 000 so'm». Manfiy ishora HECH QACHON chiqmaydi. */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  return `${formatMinor(abs)} ${currency === 'UZS' ? "so'm" : currency}`;
}

/** `Date` → «16.08.2026» (Toshkent). */
function fmtDate(m: Date | string): string {
  const d = typeof m === 'string' ? new Date(m) : m;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export interface DebtReceiptItem {
  name: string;
  quantity: string;
  uom?: string | null;
}

export interface DebtReceiptDoc {
  moment: Date | string;
  /** `CounterpartyBalanceEntry.docType` — erkin satr (yangi tur qatorni yo'qotmaydi). */
  docType: string;
  docNumber: string;
  /** BELGILI delta: > 0 qarz oshdi · < 0 kamaydi. */
  deltaMinor: bigint;
  items?: DebtReceiptItem[];
  /** Ochiq chek havolasi (`/p/<token>`) — bo'lmasa qator chizilmaydi. */
  receiptUrl?: string | null;
}

export interface DebtReceiptContext {
  orgName?: string | null;
  /** Mijoz nomi — xom holida (MTProto oddiy matn yuboradi, escape kerak emas). */
  name: string;
  currency: string;
  generatedAt: Date | string;
  /** Davr boshi qoldig'i (`StatementData.openingMinor`). */
  openingMinor: bigint;
  /** Xronologik tartibda, ochilish qatorisiz. */
  docs: DebtReceiptDoc[];
  /** Yakuniy saldo: > 0 mijoz qarzdor · < 0 biz qarzdormiz. */
  finalBalanceMinor: bigint;
}

const SEP = '━━━━━━━━━━━━━━━━━━';

/** Yakuniy saldo qatori — yo'nalish SO'Z bilan (manfiy son mijozga hech nima demaydi). */
function totalLine(balanceMinor: bigint, currency: string): string {
  if (balanceMinor > 0n) return `💰 Jami qarzingiz: ${fmtAmount(balanceMinor, currency)}`;
  if (balanceMinor < 0n) {
    return `💰 Sizga qarzimiz: ${fmtAmount(balanceMinor, currency)} — tez orada to'lanadi`;
  }
  return "💰 Hisob teng — qarzingiz yo'q";
}

/**
 * Hujjat sarlavhasi — avtomatik xabardagi `cpHead` bilan AYNI so'z boyligi.
 * Yo'nalish `deltaMinor` ishorasidan olinadi (tur ro'yxati emas) — yangi tur
 * qo'shilganda bu yer o'zgarmaydi va qator yo'qolmaydi.
 */
function docHead(doc: DebtReceiptDoc): { icon: string; title: string } {
  const isDecrease = doc.deltaMinor < 0n;
  switch (doc.docType) {
    case 'retailsale':
      return isDecrease ? { icon: '↩️', title: 'Qaytarish' } : { icon: '📄', title: 'Savdo cheki' };
    case 'invoiceOut':
      return isDecrease ? { icon: '↩️', title: 'Qaytarish' } : { icon: '📄', title: 'Sotuv' };
    case 'debtpayment':
    case 'cashIn':
    case 'paymentIn':
      return { icon: '✅', title: "To'lov qabul qilindi" };
    case 'cashOut':
    case 'paymentOut':
      return { icon: '💸', title: "To'lov (bizdan)" };
    case 'debt':
      return isDecrease
        ? { icon: '↩️', title: 'Qarz tuzatildi' }
        : { icon: '📝', title: 'Qarz yozildi' };
    default:
      // Noma'lum tur — turning O'ZI sarlavha bo'ladi, qator yo'qolmaydi.
      return { icon: '📄', title: doc.docType };
  }
}

/** Bitta hujjat bloki — qatorlar ro'yxati (bo'lish shu blok butunligini saqlaydi). */
function docBlock(doc: DebtReceiptDoc, currency: string): string[] {
  const { icon, title } = docHead(doc);
  const date = fmtDate(doc.moment);
  const num = (doc.docNumber || '').trim();
  const lines: string[] = [];
  lines.push(`${icon} ${title}${num ? ` №${num}` : ''}${date ? ` · ${date}` : ''}`);

  for (const it of doc.items ?? []) {
    const u = uomLabel(it.uom);
    lines.push(`   • ${it.name} — ${it.quantity}${u ? ` ${u}` : ''}`);
  }

  // Summa qatori: savdoda «Jami summa» (qog'oz chekdagi so'z), to'lovda «To'lov».
  const isPayment = doc.deltaMinor < 0n;
  lines.push(
    isPayment
      ? `   ${title === 'Qaytarish' ? 'Qaytarilgan summa' : "To'lov"}: ${fmtAmount(doc.deltaMinor, currency)}`
      : `   Jami summa: ${fmtAmount(doc.deltaMinor, currency)}`,
  );

  // Egasining namunasidagi shakl: «🧾 Chek: <havola>» — yorliqsiz yalang'och
  // URL mijozga nima ochilishini aytmaydi.
  const url = (doc.receiptUrl || '').trim();
  if (url) lines.push(`   🧾 Chek: ${url}`);
  return lines;
}

/**
 * Butun hisob → Telegram xabar(lar)i. Uzun bo'lsa HUJJAT CHEGARASIDA bo'linadi:
 * yarim kesilgan chek mijozda savol tug'diradi, xato raqam esa bahs.
 */
export function buildDebtReceiptMessages(ctx: DebtReceiptContext): string[] {
  const org = (ctx.orgName || '').trim();
  const head: string[] = [];
  if (org) head.push(org.toUpperCase());
  head.push(`🧾 HISOB-KITOB CHEKI · ${fmtDate(ctx.generatedAt)}`);
  head.push('');
  head.push(`Hurmatli ${ctx.name}!`);
  head.push('Bugungi holatga ko`ra hisobingiz:'.replace('`', "'"));
  head.push('');
  // Eng katta raqam YUQORIDA — telefon xabar oldindan ko'rinishida shu chiqadi.
  head.push(totalLine(ctx.finalBalanceMinor, ctx.currency));
  head.push(SEP);
  if (ctx.openingMinor !== 0n) {
    head.push(`📌 Oldingi qoldiq: ${fmtAmount(ctx.openingMinor, ctx.currency)}`);
    head.push('');
  }

  // Yakuniy blok — YIG'ILADIGAN hisob: mijoz o'zi tekshira oladi.
  let purchases = 0n;
  let payments = 0n;
  for (const d of ctx.docs) {
    if (d.deltaMinor > 0n) purchases += d.deltaMinor;
    else payments += -d.deltaMinor;
  }
  const tail: string[] = [SEP];
  if (ctx.openingMinor !== 0n) {
    tail.push(`Oldingi qoldiq: ${fmtAmount(ctx.openingMinor, ctx.currency)}`);
  }
  tail.push(`Yangi xaridlar: +${fmtAmount(purchases, ctx.currency)}`);
  tail.push(`To'lovlaringiz: ${fmtAmount(payments, ctx.currency)}`);
  tail.push(totalLine(ctx.finalBalanceMinor, ctx.currency));
  tail.push('');
  tail.push('Savol bo`lsa shu yerga yozing.'.replace('`', "'"));
  // Qog'oz chek bilan bitta ovoz (`RECEIPT_LABELS.footerThanks`).
  tail.push('Rahmat, bizni tanlaganingiz uchun!');

  const blocks = ctx.docs.map((d) => docBlock(d, ctx.currency).join('\n'));

  // ── Bo'lish: sarlavha har bo'lakda, yakun FAQAT oxirgisida ────────────────
  const headText = head.join('\n');
  const tailText = tail.join('\n');
  const pages: string[][] = [[]];
  let size = headText.length + tailText.length;
  for (const b of blocks) {
    const cost = b.length + 2;
    const current = pages[pages.length - 1] as string[];
    if (current.length > 0 && size + cost > DEBT_RECEIPT_CHUNK_LIMIT) {
      pages.push([]);
      size = headText.length + tailText.length;
    }
    (pages[pages.length - 1] as string[]).push(b);
    size += cost;
  }

  const total = pages.length;
  return pages.map((blocksOfPage, i) => {
    const marker = total > 1 ? ` (${i + 1}/${total})` : '';
    const parts = [`${headText}${marker}`];
    if (blocksOfPage.length > 0) parts.push(blocksOfPage.join('\n\n'));
    // Yakuniy hisob-kitob FAQAT oxirgi bo'lakda — ikki marta chiqsa mijoz
    // «qaysi biri rost?» deb so'raydi.
    if (i === total - 1) parts.push(tailText);
    return parts.join('\n\n');
  });
}
