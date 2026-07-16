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
 *   account          — HISOB RAQAMDAN o'tkazma (2026-07-17): mijoz bank
 *                      hisob raqamiga to'ladi, OPERATOR qo'ng'iroqda kiritadi.
 *                      Chek rasmi IXTIYORIY (bank o'tkazmasida hamisha chek
 *                      bo'lavermaydi). Kassir hisobotiga KIRMAYDI.
 *   manual_close     — «To'ladi» deb belgilangan (2026-07-13): qo'ng'iroqda
 *                      to'liq to'lov tasdiqlandi, qoldiq to'lov sifatida
 *                      yoziladi. To'lovlar lentasi va davr-hisobotida
 *                      ko'rinadi, lekin KASSIR kunlik hisobotiga KIRMAYDI
 *                      (bu kassa operatsiyasi emas — §3.9 buzilmaydi).
 * §3.9: kassir kunlik hisobotiga faqat cash+terminal kiradi.
 */
export const DebtPaymentMethodSchema = z.enum([
  'cash',
  'terminal',
  'card_screenshot',
  'account',
  'manual_close',
]);
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

/**
 * Qo'ng'iroqda qabul qilingan to'lov kanali (2026-07-13):
 *   cash    — NAQD (so'm yoki dollar; dollarda kurs majburiy)
 *   click   — CLICK/karta o'tkazmasi (chek rasmi majburiy)
 *   account — HISOB RAQAM o'tkazmasi (2026-07-17): so'mda; chek rasmi
 *             IXTIYORIY (fayl, kamera yoki screenshot orqali qo'shiladi)
 * DB'da click → method='card_screenshot', account → method='account'.
 */
export const CallPaymentKindSchema = z.enum(['cash', 'click', 'account']);
export type CallPaymentKind = z.infer<typeof CallPaymentKindSchema>;

/** To'lov valyutasi — naqd so'mda ham, dollarda ham bo'lishi mumkin. */
export const PaymentCurrencySchema = z.enum(['UZS', 'USD']);
export type PaymentCurrency = z.infer<typeof PaymentCurrencySchema>;

export const MarkCallSchema = z
  .object({
    outcome: CallOutcomeSchema,
    /** To'lov kanali — paid_full/paid_partial da MAJBURIY (§ 2026-07-13). */
    paymentKind: CallPaymentKindSchema.optional(),
    /** Naqd valyutasi (default UZS). USD bo'lsa `exchangeRate` majburiy. */
    currency: PaymentCurrencySchema.default('UZS'),
    /**
     * ASL valyutadagi summa (USD → sent). Qisman to'lovda MAJBURIY.
     * To'liq to'lovda (paid_full) bo'sh qoldirilsa — server qoldiqni oladi.
     */
    amountOriginalMinor: z.string().regex(/^\d+$/, 'Summa — butun minor birlik').optional(),
    /** Kurs ×10000 (12 800,50 so'm → 128005000). USD to'lovda MAJBURIY. */
    exchangeRate: z.string().regex(/^\d+$/, 'Kurs — butun son').optional(),
    /** Click to'lovida chek rasmi MAJBURIY (data-URI yoki toza base64). */
    screenshotBase64: z.string().optional(),
    filename: z.string().max(255).default('chek.png'),
    mime: z.string().max(100).default('image/png'),
    /** Suhbat izohi — ixtiyoriy (natija tugmasining o'zi ham yozuv qoldiradi). */
    text: z.string().trim().max(4000).optional(),
    /** Keyingi qo'ng'iroq vaqti — callback va paid_partial uchun MAJBURIY. */
    nextContactAt: z.coerce.date().nullish(),
    /**
     * MUAMMOLI MIJOZ (2026-07-14). `true` — mijoz «Muammoli qarzdorlar»
     * bo'limiga tushadi; `false` — muammodan chiqariladi; berilmasa — tegilmaydi
     * (oddiy qo'ng'iroq muammo belgisini tasodifan o'chirib yubormasin).
     */
    problem: z.boolean().optional(),
    /** Muammo SABABI — `problem: true` da MAJBURIY (sababsiz belgi foydasiz). */
    problemReason: z.string().trim().max(2000).optional(),
    /**
     * ESKI maydon (2026-07-12) — SO'MDAGI summa (tiyin). Yangi FE endi
     * `amountOriginalMinor` + `currency` yuboradi; bu esa so'm to'lovlar uchun
     * moslik sifatida qoladi (eski klient/testlar buzilmasin).
     */
    amountMinor: z
      .string()
      .regex(/^\d+$/, 'Summa — butun tiyin')
      .refine((v) => BigInt(v) > 0n, "Summa 0 dan katta bo'lishi kerak")
      .optional(),
  })
  .refine((v) => v.outcome !== 'callback' || v.nextContactAt != null, {
    message: "«Qayta qo'ng'iroq» uchun keyingi sana majburiy",
    path: ['nextContactAt'],
  })
  // 2026-07-13: to'lov bo'lgan natijalarda KANAL majburiy (naqd yoki Click).
  .refine((v) => !['paid_full', 'paid_partial'].includes(v.outcome) || v.paymentKind != null, {
    message: "To'lov turini tanlang (Naqd yoki Click)",
    path: ['paymentKind'],
  })
  // Click to'lovida chek RASMI majburiy.
  .refine((v) => v.paymentKind !== 'click' || (v.screenshotBase64?.length ?? 0) > 0, {
    message: 'Click to‘lovida chek rasmi majburiy',
    path: ['screenshotBase64'],
  })
  // Dollarda to'lansa — KURS majburiy (so'mga o'girish uchun).
  .refine((v) => v.currency !== 'USD' || (v.exchangeRate != null && BigInt(v.exchangeRate) > 0n), {
    message: 'Dollar to‘lovida kurs majburiy',
    path: ['exchangeRate'],
  })
  // Click — bank/karta o'tkazmasi, u DOIM so'mda keladi (dollar Click yo'q).
  .refine((v) => v.paymentKind !== 'click' || v.currency === 'UZS', {
    message: 'Click to‘lovi faqat so‘mda bo‘ladi',
    path: ['currency'],
  })
  // Hisob raqam o'tkazmasi ham faqat so'mda (2026-07-17) — bank hisobi so'mda.
  .refine((v) => v.paymentKind !== 'account' || v.currency === 'UZS', {
    message: 'Hisob raqam to‘lovi faqat so‘mda bo‘ladi',
    path: ['currency'],
  })
  // Qisman to'lovda summa majburiy — yangi (amountOriginalMinor) yoki eski
  // (amountMinor) maydon orqali; ikkalasi ham bo'sh bo'lsa — xato.
  .refine(
    (v) =>
      v.outcome !== 'paid_partial' ||
      (v.amountOriginalMinor != null && BigInt(v.amountOriginalMinor) > 0n) ||
      v.amountMinor != null,
    { message: "«Qisman to'ladi» uchun summa majburiy", path: ['amountOriginalMinor'] },
  )
  .refine((v) => v.outcome !== 'paid_partial' || v.nextContactAt != null, {
    message: "«Qisman to'ladi» uchun keyingi sana majburiy (qoldiq bor)",
    path: ['nextContactAt'],
  })
  // Muammoli deb belgilashda SABAB majburiy — «muammoli» degan quruq belgi
  // keyingi operatorga hech narsa aytmaydi.
  .refine((v) => v.problem !== true || (v.problemReason?.length ?? 0) > 0, {
    message: 'Muammo sababini yozing',
    path: ['problemReason'],
  })
  // Muammoli mijozga QACHON qayta qo'ng'iroq qilish ham majburiy — aks holda u
  // ro'yxatda «osilib» qoladi va hech kim qaytib ko'rmaydi.
  .refine((v) => v.problem !== true || v.nextContactAt != null, {
    message: "Muammoli mijozga qayta qo'ng'iroq sanasini belgilang",
    path: ['nextContactAt'],
  });
export type MarkCallInput = z.infer<typeof MarkCallSchema>;

/**
 * TO'LOVNI QAYTARISH — storno (2026-07-16 talab).
 *
 * Kassir/operator xato summa kiritgan bo'lsa, to'lov O'CHIRILMAYDI —
 * «qaytarilgan» deb belgilanadi (tarix dalil bo'lib qoladi). SABAB majburiy:
 * sababsiz storno keyin «bu pul qayoqqa ketdi?» degan savolga javobsiz
 * qoldiradi. Qarz qayta ochilsa (paid → partial/unpaid) keyingi qo'ng'iroq
 * sanasi ixtiyoriy beriladi — mijoz ro'yxatda «osilib» qolmasin.
 */
export const ReversePaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Qaytarish sababi majburiy').max(2000),
  /** Qarz qayta ochilganda keyingi aloqa sanasi (ixtiyoriy, tavsiya etiladi). */
  nextContactAt: z.coerce.date().nullish(),
});
export type ReversePaymentInput = z.infer<typeof ReversePaymentSchema>;

/**
 * QO'NG'IROQ NATIJASINI BEKOR QILISH (2026-07-16 talab).
 *
 * Operator xato natija qo'ygan bo'lsa («to'ladi / qisman / to'lamadi / qayta
 * qo'ng'iroq»), o'sha amal QAYTARILADI: yozuv o'chmaydi — «bekor qilingan»
 * belgilanadi, bog'liq to'lov bo'lsa u ham storno bo'ladi, lastCallOutcome
 * qolgan jonli yozuvlardan qayta hisoblanadi. SABAB majburiy — to'lov
 * stornosidagi bilan bir intizom: sababsiz bekor keyin javobsiz savol qoldiradi.
 */
export const CancelCallNoteSchema = z.object({
  reason: z.string().trim().min(1, 'Bekor qilish sababi majburiy').max(2000),
  /** Qarz qayta ochilganda / jadval buzilganda keyingi aloqa sanasi (ixtiyoriy). */
  nextContactAt: z.coerce.date().nullish(),
});
export type CancelCallNoteInput = z.infer<typeof CancelCallNoteSchema>;

/**
 * MUAMMOLI MIJOZ belgisini qo'yish/yechish (2026-07-14) — «Muammoli qarzdorlar»
 * sahifasidan, qo'ng'iroq modalidan tashqari.
 *
 * Belgilashda SABAB va QAYTA QO'NG'IROQ SANASI majburiy: sababsiz belgi keyingi
 * operatorga hech narsa aytmaydi, sanasiz esa mijoz ro'yxatda «osilib» qoladi.
 */
export const SetProblemSchema = z
  .object({
    problem: z.boolean(),
    problemReason: z.string().trim().max(2000).optional(),
    nextContactAt: z.coerce.date().nullish(),
  })
  .refine((v) => !v.problem || (v.problemReason?.length ?? 0) > 0, {
    message: 'Muammo sababini yozing',
    path: ['problemReason'],
  })
  .refine((v) => !v.problem || v.nextContactAt != null, {
    message: "Qayta qo'ng'iroq sanasini belgilang",
    path: ['nextContactAt'],
  });
export type SetProblemInput = z.infer<typeof SetProblemSchema>;

/**
 * TZ §3.1 — QARZDORLAR RO'YXATI filtri.
 *
 * `scope`:
 *   active   — qoldiq > 0 (odatiy: «faqat qarzi to'liq yopilmaganlar»)
 *   today    — keyingi qo'ng'iroq BUGUN (§3.5 «Bugungi qo'ng'iroqlar»)
 *   overdue  — keyingi aloqa sanasi O'TIB KETGAN
 *   all      — yopilganlar ham (tarix)
 */
/**
 * Ro'yxat ko'rinishlari.
 *   active   — joriy qarzdorlar (odatiy)
 *   today    — bugun qo'ng'iroq qilinishi kerak
 *   overdue  — muddati o'tgan
 *   called   — tanlangan kunda qo'ng'iroq qilinganlar
 *   problem  — MUAMMOLI mijozlar (2026-07-14): telefonni ko'tarmaydi, va'da
 *              berib bermaydi va h.k. Operator qo'ng'iroqda belgilaydi.
 *   all      — hammasi
 */
export const DebtScopeSchema = z.enum(['active', 'today', 'overdue', 'all', 'called', 'problem']);
export type DebtScope = z.infer<typeof DebtScopeSchema>;

export const DebtFilterSchema = z.object({
  scope: DebtScopeSchema.default('active'),
  status: DebtStatusSchema.optional(),
  counterpartyId: z.string().uuid().optional(),
  /**
   * ANIQ TANLANGAN qarzlar (2026-07-12: «belgilab chiqarib olish»).
   * Berilsa — scope/status e'tiborga olinmaydi: foydalanuvchi checkbox bilan
   * aynan shu yozuvlarni so'ragan, filtr ularni yashirmasligi kerak.
   * POST print/pdf body orqali keladi (GET query'da ishlatilmaydi).
   */
  ids: z.array(z.string().uuid()).max(2000).optional(),
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
