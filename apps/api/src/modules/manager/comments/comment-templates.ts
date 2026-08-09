/**
 * MK20 / 4M TZ §8.1/6 — SHABLON IZOHLAR (tez javob matnlari), SOF QOIDALAR.
 *
 * Menejer kuniga o'nlab elementni yopadi va har safar bir xil gapni qayta
 * yozadi («dublikat», «chegirma tasdiqlangan», «kechikish sababi uzrli»).
 * Shablon — shu takrorni olib tashlaydi.
 *
 * ## 🔴 JURNALGA MATN KO'CHIRILADI, HAVOLA EMAS
 * Jurnal (`ManagerWorkItemEvent.comment`, `EmployeeDailyKpiEvent.comment`)
 * shablonning **nusxasini** oladi. Havola (`templateId`) saqlansa: menejer
 * ertaga shablon matnini tahrirlaydi → kechagi qaror bugun BOSHQACHA o'qiladi,
 * hech kim bexabar. Bu — «summa qoidadan NUSXA» (MK01 bonus yozuvi) va «tan
 * narx muzlatiladi» (retail) bilan bir xil klass: **to'langan/yozilgan fakt
 * keyingi sozlamadan mustaqil bo'lishi kerak.**
 *
 * ## Shablon MAJBURLAMAYDI
 * TZ: «shablon tanlansa ham matn tahrirlanadi». Shuning uchun:
 * tahrirlangan matn > shablon tanasi > izohsiz (`null`). Shablon tanlash
 * hech qanday amalni bloklamaydi va izohni majburiy qilmaydi (majburiylik
 * faqat FSM `reasonCode` qoidasidan keladi — u bu modulga tegishli emas).
 *
 * I/O yo'q: Prisma o'qish/yozish `manager-comment-template.service.ts` da.
 */

/** TZ §8.1/6 dagi uch tur. Yopiq ro'yxat — DB'da CHECK bilan takrorlanadi. */
export const COMMENT_TEMPLATE_KIND = {
  /** Rad etish: element o'rinsiz / kun qabul qilinmadi. */
  rejection: 'rejection',
  /** Tuzatma: tushuntirish so'rash, ko'rsatkichni tuzatish. */
  correction: 'correction',
  /** Ogohlantirish: jarima, yozma ogohlantirish. */
  warning: 'warning',
} as const;

export type CommentTemplateKind =
  (typeof COMMENT_TEMPLATE_KIND)[keyof typeof COMMENT_TEMPLATE_KIND];

export const COMMENT_TEMPLATE_KINDS = Object.values(
  COMMENT_TEMPLATE_KIND,
) as readonly CommentTemplateKind[];

/**
 * Jurnal izohining eng katta uzunligi.
 *
 * Ikki HTTP sxemasi (`QueueActionBodySchema`, `TransitionSchema`) izohni 2000
 * belgida kesadi. Shablon tanasi ham AYNAN shu chegarada bo'lishi shart: aks
 * holda 5000 belgilik shablon serverda materiallashib, foydalanuvchi hech
 * qachon yubora olmaydigan uzunlikdagi izohni jurnalga tushirardi.
 */
export const MAX_COMMENT_LENGTH = 2000;

/** Shablon qatori — DB shakli emas, SOF shakl (servis moslaydi). */
export interface CommentTemplate {
  id: string;
  kind: CommentTemplateKind;
  /** `ru` | `uz` — menejer ikki tilda saqlaydi. Filtr EMAS, tartib omili. */
  locale: string;
  title: string;
  /** Jurnalga ko'chiriladigan MATN. */
  body: string;
  /** Bo'sh = hamma qoidaga. To'ldirilgan = faqat shu qoida turlariga. */
  ruleTypes: string[];
  /** Bo'sh = `kind` xaritasi bo'yicha. To'ldirilgan = OSHKORA biriktirish. */
  actions: string[];
  sortOrder: number;
  usageCount: number;
  archivedAt: Date | null;
}

/**
 * Amal → shablon turi.
 *
 * ⚠️ Ro'yxatda YO'Q amal uchun tur **to'qilmaydi** (`null` qaytadi). `escalate`
 * — egaga uzatish, xodimga ogohlantirish EMAS; `acknowledge`/`accept` — «hammasi
 * o'rinli», unga «rad etish» shablonlari taklif qilinishi menejerni chalg'itardi.
 * Bunday amalga shablon kerak bo'lsa — menejer uni `actions` orqali OSHKORA
 * biriktiradi (pastdagi `suggestTemplates` shuni ustun qo'yadi).
 */
const ACTION_KIND: Readonly<Record<string, CommentTemplateKind>> = {
  // MK06/MK07 — navbat elementi (`work-item-fsm.ts`).
  dismiss: COMMENT_TEMPLATE_KIND.rejection,
  request_explanation: COMMENT_TEMPLATE_KIND.correction,
  record_fine: COMMENT_TEMPLATE_KIND.warning,
  write_warning: COMMENT_TEMPLATE_KIND.warning,
  // MK01 — kun qabuli (`daily-kpi-fsm.ts`).
  reject: COMMENT_TEMPLATE_KIND.rejection,
  explain: COMMENT_TEMPLATE_KIND.correction,
  adjust: COMMENT_TEMPLATE_KIND.correction,
};

export function templateKindForAction(action: string): CommentTemplateKind | null {
  return ACTION_KIND[action] ?? null;
}

export interface SuggestContext {
  /** FSM amali (`dismiss`, `reject`, `adjust`…). Bo'sh = filtrsiz ro'yxat. */
  action?: string | null;
  /** Navbat elementining qoidasi (`BIG_DEBT`…). */
  ruleType?: string | null;
  /** Joriy interfeys tili — faqat TARTIBGA ta'sir qiladi. */
  locale?: string | null;
}

/** Ichki: shablon shu kontekstga tegishlimi + qanchalik ANIQ. */
function matchScore(t: CommentTemplate, ctx: SuggestContext): number | null {
  if (t.archivedAt != null) return null;

  let score = 0;

  if (ctx.action) {
    const explicit = t.actions.length > 0;
    if (explicit) {
      if (!t.actions.includes(ctx.action)) return null;
      // OSHKORA biriktirish — eng aniq moslik.
      score += 4;
    } else {
      const kind = templateKindForAction(ctx.action);
      // Turi yo'q amalda faqat oshkora biriktirilgan shablon chiqadi.
      if (kind == null || t.kind !== kind) return null;
    }
  }

  if (ctx.ruleType) {
    if (t.ruleTypes.length > 0) {
      if (!t.ruleTypes.includes(ctx.ruleType)) return null;
      score += 2;
    }
  } else if (t.ruleTypes.length > 0) {
    // Qoidaga biriktirilgan shablon qoidasiz kontekstda ham ko'rinadi
    // (sozlamalar ekrani), lekin tepaga chiqmaydi.
    score += 0;
  }

  // Til — FILTR EMAS: qattiq filtr menejerning ru shablonini uz interfeysda
  // ko'rinmas qilardi va ro'yxat bo'sh chiqardi.
  if (ctx.locale && t.locale === ctx.locale) score += 1;

  return score;
}

/**
 * Kontekstga mos shablonlar — eng aniqi tepada.
 *
 * Tartib: moslik aniqligi ↓ · `sortOrder` ↑ · ishlatilish soni ↓ · sarlavha ↑.
 * Oxirgi ikki mezon barqarorlik uchun: aks holda ro'yxat har yuklashda
 * boshqacha chiqib, menejer «mushak xotirasi» bilan noto'g'ri shablon tanlardi.
 */
export function suggestTemplates(
  templates: readonly CommentTemplate[],
  ctx: SuggestContext,
): CommentTemplate[] {
  const scored: Array<{ t: CommentTemplate; score: number }> = [];
  for (const t of templates) {
    const score = matchScore(t, ctx);
    if (score != null) scored.push({ t, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.t.sortOrder !== b.t.sortOrder) return a.t.sortOrder - b.t.sortOrder;
    if (a.t.usageCount !== b.t.usageCount) return b.t.usageCount - a.t.usageCount;
    return a.t.title.localeCompare(b.t.title);
  });

  return scored.map((s) => s.t);
}

export interface MaterializeInput {
  /** Foydalanuvchi yozgan/tahrirlagan matn. */
  comment?: string | null;
  /** Tanlangan shablon (faqat TANASI ishlatiladi). */
  template?: { body: string } | null;
}

/**
 * Jurnalga tushadigan matnni qaytaradi — **doim satr yoki `null`**.
 *
 * Shablon identifikatori natijaga HECH QACHON qo'shilmaydi: chaqiruvchi bu
 * qiymatni to'g'ridan-to'g'ri jurnal ustuniga yozadi va shu bilan yozuv
 * shablondan uziladi.
 */
export function materializeComment(input: MaterializeInput): string | null {
  const typed = (input.comment ?? '').trim();
  const source = typed.length > 0 ? typed : (input.template?.body ?? '').trim();
  if (source.length === 0) return null;
  // Kesish OSHKORA: uzun matn jimgina yo'qolmasin deb chegara eksport qilingan
  // va HTTP sxemasi ham AYNAN shu raqamni ishlatadi.
  return source.length > MAX_COMMENT_LENGTH ? source.slice(0, MAX_COMMENT_LENGTH) : source;
}
