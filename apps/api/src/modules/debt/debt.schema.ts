import { z } from 'zod';

/**
 * «Qarz undirish» (debt collection) — TZ v2.
 *
 * Call-markaz operatori + kassir uchun mustaqil qarz daftari. TZ §7:
 * mavjud savdo/ombor oqimiga tegmaydi (CounterpartyBalance siljimaydi).
 *
 * Pul — BigInt minor (tiyin), string sifatida uzatiladi (ADR-0004 + JSON
 * BigInt serializatsiyasi: main.ts BigInt.toJSON → string).
 */

/** TZ §4 — qarz statusi. `paid` ⇒ qarzdorlar ro'yxatidan avtomatik chiqadi. */
export const DebtStatusSchema = z.enum(['unpaid', 'partial', 'paid']);
export type DebtStatus = z.infer<typeof DebtStatusSchema>;

/**
 * TZ §3.6 + §3.7 — to'lov kanali.
 *   cash / terminal  — kassada, KASSIR kiritadi
 *   card_screenshot  — mijoz kartadan o'tkazdi, chek rasmi, OPERATOR kiritadi
 * §3.9: kassir kunlik hisobotiga faqat cash+terminal kiradi.
 */
export const DebtPaymentMethodSchema = z.enum(['cash', 'terminal', 'card_screenshot']);
export type DebtPaymentMethod = z.infer<typeof DebtPaymentMethodSchema>;

/** Kassada qabul qilinadigan kanallar (operator bularni kirita OLMAYDI). */
export const CASHIER_METHODS: readonly DebtPaymentMethod[] = ['cash', 'terminal'];

/** Muloqot yozuvi manbai (§3.4 — kim/qayerdan yozgani ko'rinadi). */
export const DebtNoteKindSchema = z.enum(['call', 'debt_issue', 'payment']);
export type DebtNoteKind = z.infer<typeof DebtNoteKindSchema>;

/** Pul — faqat musbat butun tiyin (BigInt minor). */
const moneyMinor = z
  .string()
  .regex(/^\d+$/, 'Summa — faqat butun tiyin (BigInt minor)')
  .refine((v) => BigInt(v) > 0n, "Summa 0 dan katta bo'lishi kerak");

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * TZ §3.3 — YANGI QARZ BERISH (kassir).
 *
 * `comment` va `nextContactAt` MAJBURIY — TZ aynan shuni talab qiladi:
 * «Bu ma'lumot ixtiyoriy emas — qarz yaratish formasida majburiy maydon
 * sifatida so'raladi, toki call-markaz keyinchalik qachon bog'lanishni bilsin.»
 */
export const CreateDebtSchema = z.object({
  counterpartyId: z.string().uuid(),
  totalMinor: moneyMinor,
  currency: z.string().length(3).default('UZS'),
  /** Majburiy (§3.3) — nima uchun qarz berilgani. */
  comment: z.string().trim().min(1, 'Izoh majburiy').max(4000),
  /** Majburiy (§3.3) — keyingi qo'ng'iroq/to'lov sanasi va aniq vaqti. */
  nextContactAt: z.coerce.date({ required_error: 'Keyingi aloqa sanasi majburiy' }),
  /** Mas'ul operator. Bo'sh bo'lsa — qarz bergan xodim biriktiriladi. */
  ownerId: z.string().uuid().nullish(),
});
export type CreateDebtInput = z.infer<typeof CreateDebtSchema>;

/**
 * TZ §3.6 — KASSADA TO'LOV (naqd/terminal) — faqat KASSIR.
 *
 * Qisman to'lovda `comment` + `nextContactAt` majburiy bo'ladi — buni
 * service qoldiq > 0 bo'lganda tekshiradi (summa oldindan noma'lum, shuning
 * uchun schema darajasida emas, xizmat darajasida — `assertPartialFollowUp`).
 */
export const CreateCashPaymentSchema = z.object({
  amountMinor: moneyMinor,
  method: z.enum(['cash', 'terminal']).default('cash'),
  /** Qaysi kassada qabul qilingani (§3.8 — «qayerdan qabul qilingani»). */
  cashDeskId: z.string().uuid().nullish(),
  /** Qisman to'lovda majburiy (§3.6). */
  comment: z.string().trim().max(4000).optional(),
  /** Qisman to'lovda majburiy (§3.6) — keyingi to'lov sanasi. */
  nextContactAt: z.coerce.date().nullish(),
});
export type CreateCashPaymentInput = z.infer<typeof CreateCashPaymentSchema>;

/**
 * TZ §3.7 — KARTA (screenshot) TO'LOVI — faqat OPERATOR.
 *
 * Operator summani screenshotdan QO'LDA o'qib kiritadi; TZ aniq aytadi:
 * «tizim buni avtomatik tekshirmaydi». Rasm base64 sifatida keladi va
 * mavjud `attachments` jadvaliga (entity='debtpayment') yoziladi —
 * yangi blob-store ochilmaydi.
 */
export const CreateCardPaymentSchema = z.object({
  amountMinor: moneyMinor,
  /** Chek rasmi — data-URI yoki toza base64. Majburiy (§3.7: rasm yuklanadi). */
  screenshotBase64: z.string().min(1, 'Chek rasmi majburiy'),
  filename: z.string().max(255).default('screenshot.png'),
  mime: z
    .string()
    .max(100)
    .regex(/^image\//, 'Faqat rasm fayli')
    .default('image/png'),
  comment: z.string().trim().max(4000).optional(),
  /** Qoldiq qolsa — keyingi aloqa sanasi. */
  nextContactAt: z.coerce.date().nullish(),
});
export type CreateCardPaymentInput = z.infer<typeof CreateCardPaymentSchema>;

/**
 * TZ §3.4 — MULOQOT YOZUVI (izoh + keyingi qo'ng'iroq).
 * Operator ham, kassir ham yozadi; rol avtomatik belgilanadi (service).
 */
export const CreateDebtNoteSchema = z.object({
  text: z.string().trim().min(1, 'Izoh matni majburiy').max(4000),
  /** Keyingi qo'ng'iroq/to'lov sanasi va aniq vaqti. */
  nextContactAt: z.coerce.date().nullish(),
});
export type CreateDebtNoteInput = z.infer<typeof CreateDebtNoteSchema>;

/**
 * «QO'NG'IROQ QILINDI» belgisi (2026-07-12 talab) — suhbat natijasi:
 *   paid_full    — to'ladi (yoki to'layman dedi, to'liq)
 *   paid_partial — bir qismini to'ladi/to'laydi
 *   not_paid     — to'lamadi
 *   callback     — yana qo'ng'iroq qilish kerak (sana MAJBURIY)
 */
export const CallOutcomeSchema = z.enum(['paid_full', 'paid_partial', 'not_paid', 'callback']);
export type CallOutcome = z.infer<typeof CallOutcomeSchema>;

export const MarkCallSchema = z
  .object({
    outcome: CallOutcomeSchema,
    /** Suhbat izohi — ixtiyoriy (natija tugmasining o'zi ham yozuv qoldiradi). */
    text: z.string().trim().max(4000).optional(),
    /** Keyingi qo'ng'iroq vaqti — callback uchun MAJBURIY. */
    nextContactAt: z.coerce.date().nullish(),
  })
  .refine((v) => v.outcome !== 'callback' || v.nextContactAt != null, {
    message: "«Qayta qo'ng'iroq» uchun keyingi sana majburiy",
    path: ['nextContactAt'],
  });
export type MarkCallInput = z.infer<typeof MarkCallSchema>;

/**
 * TZ §3.1 — QARZDORLAR RO'YXATI filtri.
 *
 * `scope`:
 *   active   — qoldiq > 0 (odatiy: «faqat qarzi to'liq yopilmaganlar»)
 *   today    — keyingi qo'ng'iroq BUGUN (§3.5 «Bugungi qo'ng'iroqlar»)
 *   overdue  — keyingi aloqa sanasi O'TIB KETGAN
 *   all      — yopilganlar ham (tarix)
 */
export const DebtScopeSchema = z.enum(['active', 'today', 'overdue', 'all', 'called']);
export type DebtScope = z.infer<typeof DebtScopeSchema>;

export const DebtFilterSchema = z.object({
  scope: DebtScopeSchema.default('active'),
  status: DebtStatusSchema.optional(),
  counterpartyId: z.string().uuid().optional(),
  /**
   * Mijoz-segment filtri (2026-07-11 talab: «Elektriklar / Boshqalar»).
   * counterpartyGroupId — qarzdor SHU guruhda bo'lsin (masalan Elektriklar);
   * counterpartyGroupExclude — shu guruhda BO'LMASIN (Boshqalar tabi).
   */
  counterpartyGroupId: z.string().uuid().optional(),
  counterpartyGroupExclude: z.string().uuid().optional(),
  /** scope='called' uchun: qaysi KUN qo'ng'iroq qilinganlar (default: bugun). */
  calledDate: z.string().optional(),
  /** scope='called' uchun: natija bo'yicha filtr. */
  callOutcome: CallOutcomeSchema.optional(),
  /** Mas'ul xodim bo'yicha (§3.1). */
  ownerId: z.string().uuid().optional(),
  /** F.I.Sh yoki telefon bo'yicha qidiruv. */
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  /** §3.1 — summa yoki qo'ng'iroq sanasi bo'yicha saralash. */
  sortBy: z
    .enum(['nextContactAt', 'remainingMinor', 'totalMinor', 'createdAt', 'counterparty'])
    .default('nextContactAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type DebtFilterInput = z.infer<typeof DebtFilterSchema>;

/**
 * TZ §3.9 — KASSIRLAR BO'YICHA KUNLIK HISOBOT.
 * `date` berilmasa — bugungi kun (Asia/Tashkent).
 */
export const CashierReportFilterSchema = z.object({
  date: z.string().optional(),
  sortBy: z.enum(['collectedMinor', 'issuedMinor', 'name']).default('collectedMinor'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type CashierReportFilterInput = z.infer<typeof CashierReportFilterSchema>;

/**
 * TZ §4 — davr bo'yicha tushgan to'lovlar hisoboti, to'lov turi kesimida.
 */
export const DebtPaymentsReportFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  method: DebtPaymentMethodSchema.optional(),
});
export type DebtPaymentsReportFilterInput = z.infer<typeof DebtPaymentsReportFilterSchema>;

/**
 * «To'lovlar lentasi» — AYNAN QAYSI MIJOZ to'laganini ko'rsatadigan
 * xronologik ro'yxat (§3.8 kengaytmasi, foydalanuvchi talabi 2026-07-11).
 * Default: bugungi Toshkent kuni; sana oralig'i va usul bo'yicha filtr.
 */
export const DebtPaymentsFeedFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  method: DebtPaymentMethodSchema.optional(),
  /** F.I.Sh / telefon bo'yicha qidiruv. */
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type DebtPaymentsFeedFilterInput = z.infer<typeof DebtPaymentsFeedFilterSchema>;
