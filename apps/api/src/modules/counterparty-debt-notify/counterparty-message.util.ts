import type { CounterpartyBalanceChangeSource } from '../hr/hr-shared/hr-events.types.js';
import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';
// O'lchov birligi tarjimasi — «hisob-kitob cheki» bilan YAGONA manba: mijoz
// avtomatik xabarda «3 dona», hisobotda «3 шт» ko'rmasin.
import { mdSafeText, uomLabel } from './debt-receipt-message.util.js';

/**
 * Pure, Telegram-free message builder for the COUNTERPARTY-facing debt/payment
 * notices. Unlike {@link ./debt-notify.util.ts} (owner, Markdown), these are
 * addressed to the counterparty themselves and delivered over the MTProto
 * outbox (admin account → the counterparty's chat).
 *
 * 🔴 BU XABARLAR MarkdownV2 BILAN YUBORILADI (2026-08-31 da aniqlangan):
 * `sourceEventType` = `debt.counterparty_notify` bo'lgani uchun
 * `mtproto-worker.service.ts` ularni `format: 'markdown-v2'` bilan jo'natadi
 * (GramJS `MarkdownV2Parser`). Ilgari bu fayl «plain text» deb yozilgan va
 * hech narsa ekranlanmasdi — natijada jonlida `№ТРН-2026-…` dagi defislar
 * KURSIV belgisi (`-…-`) deb yutilib, raqam buzuq ko'rinardi. Endi:
 *   · barcha erkin matn (nom, hujjat raqami, tovar nomi…) `mdSafeText` dan
 *     o'tadi — defis ko'rinishi bir xil U+2011 ga almashadi, qolgan
 *     belgilagichlar ZWSP bilan uziladi;
 *   · kontragent NOMI va yakuniy QARZ qatori ataylab *qalin* (egasi, 2026-08-31);
 *   · havola (receiptUrl) ekranlanMAYDI — ichiga belgi qo'shilsa link sinadi
 *     (token alfaviti endi markdown-xavfsiz, `receipt-link.util.ts`).
 *
 * Format redesign (2026-07-25, owner request «aniqroq hisobot»): a compact
 * receipt/report — document title + date + number, how much THIS operation
 * moved (added to the debt / paid), and the resulting total. Date + number come
 * from the source document; when unavailable those header parts are omitted.
 */

// Qayta-eksport: bu modul iste'molchilari (test, notifier) uchun bitta manba.
export { mdSafeText } from './debt-receipt-message.util.js';

/** Render a signed tiyin amount as an absolute so'm/currency string. */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  const unit = currency === 'UZS' ? "so'm" : currency;
  return `${formatMinor(abs)} ${unit}`;
}

/** Document `moment` → "25.07.2026" (Asia/Tashkent), or '' when absent/invalid. */
function fmtDate(m?: Date | string | null): string {
  if (!m) return '';
  const d = typeof m === 'string' ? new Date(m) : m;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export interface CounterpartyMessageContext {
  /** Counterparty display name (xabar ichida mdSafeText bilan ekranlanadi, *qalin* chiqadi). */
  name: string;
  /** ISO-3 currency of the moved balance row. */
  currency: string;
  /** Pre-signed delta applied (sign per applyDelta convention). */
  deltaMinor: bigint;
  /** Balance after applying the delta (positive = they owe us). */
  newBalanceMinor: bigint;
  /** Which document moved the balance. */
  source: CounterpartyBalanceChangeSource;
  /** Source document number/name; omitted from header if absent. */
  docNumber?: string | null;
  /** Source document date; omitted from header if absent. */
  docMoment?: Date | string | null;

  // ── Chek mazmuni (2026-08-16, egasi namunasi) ─────────────────────────────
  // Hammasi OPTIONAL: yo'q bo'lsa tegishli qator umuman chizilmaydi, ya'ni
  // ma'lumot yetmagan manba (invoiceOut, cashIn…) eski qisqa matnda qoladi.
  /** Do'kon nomi — xabarning eng tepasidagi sarlavha. */
  orgName?: string | null;
  /** Chek tarkibi. Uchtasi chiqadi, qolgani «va yana N tur» bo'lib yig'iladi. */
  items?: Array<{ name: string; quantity: string; uom?: string | null }>;
  /** Chekdan naqd/karta bilan to'langan qism (tiyin). */
  paidMinor?: bigint | null;
  /** Ochiq chek havolasi (`/p/<token>`). */
  receiptUrl?: string | null;
}

/**
 * Tovar qatorlarining QATTIQ chegarasi — 4096 belgilik Telegram limitidan
 * oshib xabar yiqilmasligi uchun.
 *
 * 🔴 Bu «ko'rinish chegarasi» EMAS (2026-08-16, egasi). Ilgari bu yerda
 * `ITEM_PREVIEW_LIMIT = 3` turardi va chek DOIM uchtadan keyin «va yana N tur»
 * bo'lib kesilardi — egasi jonli xabarda ko'rib rad etdi: mijoz nima
 * olganini TO'LIQ ko'rishi kerak, bu chek, bildirishnoma emas. Endi kesish
 * faqat texnik chegara sifatida qoladi va real chekda deyarli ishlamaydi.
 */
export const ITEM_HARD_CAP = 40;

/** Per-source report title + the "this operation" amount line (counterparty framing). */
function cpHead(
  source: CounterpartyBalanceChangeSource,
  amt: string,
  /** `true` ⇒ delta manfiy: mijozning qarzi KAMAYDI. */
  isDecrease: boolean,
): { title: string; amountLine: string } | null {
  switch (source) {
    case 'invoiceOut': // we sold to them → their debt to us grew
      return { title: 'Sotuv', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    case 'invoiceIn': // we bought from them → we owe them more
      return { title: 'Qabul (mahsulot)', amountLine: `📦 Mahsulot summasi: ${amt}` };
    case 'paymentIn':
    case 'cashIn': // they paid us
      return { title: "To'lov", amountLine: `✅ To'lovingiz qabul qilindi: ${amt}` };
    case 'paymentOut':
    case 'cashOut': // we paid them
      return { title: "To'lov (bizdan)", amountLine: `💸 Bizning to'lovimiz: ${amt}` };
    // ── Kassa oqimi (2026-08-16) — bitta manba, ikki yo'nalish ─────────────
    // Qaytarish/bekor uchun ALOHIDA manba turi ATAYLAB kiritilmadi: yo'nalish
    // `deltaMinor` ishorasida allaqachon bor, ikkinchi tur esa har yozuvchida
    // «qaysi turni tanlayman?» degan yangi xato manbaini ochardi.
    case 'retailsale':
      return isDecrease
        ? { title: 'Qaytarish', amountLine: `↩️ Qarzingizdan ayirildi: ${amt}` }
        : { title: 'Kassa savdosi', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    case 'debtpayment':
      return { title: "Qarz to'lovi", amountLine: `✅ To'lovingiz qabul qilindi: ${amt}` };
    case 'debt':
      return isDecrease
        ? { title: 'Qarz tuzatildi', amountLine: `↩️ Qarzingizdan ayirildi: ${amt}` }
        : { title: 'Qarz', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    default:
      return null;
  }
}

/**
 * Resulting-total line from the counterparty's own perspective.
 * Qarz/qoldiq qatori *qalin* (egasi, 2026-08-31) — MarkdownV2 worker'da
 * `Api.MessageEntityBold` ga aylanadi; summa raqamlarida belgilagich yo'q.
 */
function cpTotal(newBalanceMinor: bigint, currency: string, isPayment: boolean): string {
  const amt = fmtAmount(newBalanceMinor, currency);
  if (newBalanceMinor > 0n) {
    return `💰 *${isPayment ? 'Qolgan qarzingiz' : 'Jami qarzingiz'}: ${amt}*`;
  }
  if (newBalanceMinor < 0n) return `💰 *Sizga qarzimiz: ${amt}* — tez orada to'lanadi`;
  return "💰 *Hisob teng — qarzingiz yo'q*";
}

/**
 * Pick + build the right counterparty-facing report, or return null when there
 * is nothing meaningful to tell them (a non-payment change that lands on a zero
 * balance). A payment is always acknowledged, even if it clears the balance.
 */
export function buildCounterpartyMessage(ctx: CounterpartyMessageContext): string | null {
  const isDecrease = ctx.deltaMinor < 0n;
  // To'lov = mijozning puli keldi. Kassa qarz to'lovi ham shu toifada.
  const isPayment =
    ctx.source === 'paymentIn' || ctx.source === 'cashIn' || ctx.source === 'debtpayment';
  // TUZATISH (qaytarish / qarz o'chirilishi): mijozga aytilishi SHART. Aks holda
  // u olgan oxirgi xabar «qarzga qo'shildi» bo'lib qoladi va uning qo'lidagi
  // raqam haqiqatdan uziladi (dizayn §4.3).
  const isCorrection = isDecrease && (ctx.source === 'retailsale' || ctx.source === 'debt');
  const head = cpHead(ctx.source, fmtAmount(ctx.deltaMinor, ctx.currency), isDecrease);
  if (!head) return null;
  // Non-payment change landing exactly on zero ⇒ nothing meaningful to say.
  if (!isPayment && !isCorrection && ctx.newBalanceMinor === 0n) return null;

  const date = fmtDate(ctx.docMoment);
  // Hujjat raqami (№ТРН-2026-…) defisli — mdSafeText kursiv-yutilishdan saqlaydi.
  const num = mdSafeText((ctx.docNumber || '').trim());

  const lines: string[] = [];
  // Do'kon nomi — brend sarlavhasi (egasining namunasidagi kabi).
  const org = mdSafeText((ctx.orgName || '').trim());
  if (org) lines.push(org);
  // Kontragent ismi *qalin* (egasi, 2026-08-31).
  lines.push(`Hurmatli *${mdSafeText(ctx.name)}*,`);
  let hdr = `📄 ${head.title}`;
  if (date) hdr += ` — ${date}`;
  if (num) hdr += `, №${num}`;
  lines.push(hdr);
  lines.push(head.amountLine);

  // Tovar ro'yxati — mijoz nima olganini havolani ochmasdan ko'rsin.
  // O'lchov birligi o'zbekchaga o'giriladi: katalog MoySklad'dan kelgan va
  // «шт»/«м» bilan to'la, xabar esa o'zbekcha (egasi ko'rsatgan nuqson).
  const items = ctx.items ?? [];
  for (const it of items.slice(0, ITEM_HARD_CAP)) {
    const uom = uomLabel(it.uom);
    // Tovar nomi erkin matn (defis/yulduzcha bo'lishi mumkin) — ekranlanadi.
    lines.push(`   • ${mdSafeText(it.name)} — ${it.quantity}${uom ? ` ${mdSafeText(uom)}` : ''}`);
  }
  if (items.length > ITEM_HARD_CAP) {
    lines.push(`   • va yana ${items.length - ITEM_HARD_CAP} tur`);
  }

  // ── To'lov taqsimoti ──────────────────────────────────────────────────────
  // 🔴 «Qarzga yozildi» qatori OLIB TASHLANDI (2026-08-16, egasi jonli xabarda
  // ko'rsatdi): chaqiruvchi unga `deltaMinor` ning O'ZINI uzatardi, ya'ni
  // «Qarzga qo'shildi: +465 000» va «Qarzga yozildi: 465 000» har doim BIR XIL
  // raqam edi — ikki qator, bitta ma'lumot.
  //
  // Qisman to'langan chekda esa uch raqam BIR-BIRIGA YIG'ILADI va shunda
  // qo'shimcha qatorlar haqiqiy ma'lumot beradi:
  //     Jami summa (170) = To'landi (70) + Qarzga qo'shildi (100).
  const paid = ctx.paidMinor ?? 0n;
  if (paid > 0n) {
    const gross = paid + (ctx.deltaMinor > 0n ? ctx.deltaMinor : 0n);
    lines.push(`   Jami summa: ${fmtAmount(gross, ctx.currency)}`);
    lines.push(`   💵 To'landi: ${fmtAmount(paid, ctx.currency)}`);
  }

  lines.push('━━━━━━━━━━━━');
  // 🔴 Balans HECH QACHON minus bilan chiqmaydi — `cpTotal` uni so'z bilan
  // beradi («Jami qarzingiz» / «Sizga qarzimiz»). Xom manfiy son mijozga
  // hech nima anglatmaydi va eng ko'p savol tug'diradigan qator edi.
  lines.push(cpTotal(ctx.newBalanceMinor, ctx.currency, isPayment || isCorrection));

  const url = (ctx.receiptUrl || '').trim();
  if (url) lines.push(`🧾 Chek: ${url}`);
  return lines.join('\n');
}
