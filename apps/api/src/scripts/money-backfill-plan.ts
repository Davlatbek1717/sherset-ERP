/**
 * PUL DAFTARI BACKFILL REJASI — sof qaror qatlami (P14/`H4`, 2026-08-12).
 *
 * ## Muammo (o'lchangan, `money-ledger-writers-faza11` xotirasi)
 *
 * `MoneyOperation` daftariga olti yozuvchi bor: `cash_in` · `cash_out` ·
 * `retailsale` · `payment_in` · `payment_out` · `debtpayment`. Oxirgi uchtasi
 * **2026-08-08 (Faza 11)** da qo'shildi — undan oldingi PaymentIn/PaymentOut va
 * naqd qarz to'lovlari daftarga UMUMAN yozilmagan. Natijada `/money` lentasi
 * o'sha hujjatlarni ko'rsatmaydi: egasi «eski to'lov lentada yo'q» deb ko'radi.
 * (Yashiq amallari — `drawer_cash_in|out` — alohida skript bilan yopilgan:
 * `ops-backfill-drawer-money.ts`, shuning uchun bu yerda YO'Q.)
 *
 * ## Nega SOF modul
 *
 * P2 (`opening-backfill-plan.ts`) sabog'i: backfill qarorini skriptdan ajratib
 * olsang, uni testda mutant bilan o'lchash mumkin va «jimgina yarim qo'llanish»
 * imkonsiz bo'ladi. Skript faqat O'QIYDI va YOZADI; NIMA yozilishini shu yerda
 * hal qilinadi.
 *
 * ## Qat'iy qoidalar (har biri testda qulflangan)
 *
 * 1. 🔴 **FARQ, JAMI EMAS** (`cell-migration-delta-not-total` xotirasi). Reja
 *    faqat daftarda YO'Q hujjatlar uchun quriladi — mavjud qator hech qachon
 *    qayta yozilmaydi va tuzatilmaydi. Ikkinchi yugurtirish bo'sh reja beradi
 *    (idempotentlik).
 * 2. 🔴 **`at` = hujjatning O'Z oni**, backfill kuni EMAS
 *    (`opening-row-is-not-a-movement` xotirasi). Aks holda butun o'tmish
 *    bugungi kunga yig'ilib, lenta «bugun 300 mln harakat bo'ldi» degan
 *    yolg'onni ko'rsatardi.
 * 3. 🔴 **VALYUTA MOS KELMASA — REJAGA KIRMAYDI.** `CashDesk.balanceMinor` va
 *    `OrganizationAccount.balanceMinor` manba valyutasidagi ustunlar; boshqa
 *    valyutadagi summani ularga qo'shish «1 sent = 1 tiyin» degan jim yolg'on
 *    bo'lardi. Bunday qatorlar ALOHIDA ro'yxatga tushadi va odam qaroriga
 *    qoldiriladi (yashirilmaydi).
 * 4. 🔴 **Manbasiz hujjat — BUG EMAS.** `PaymentIn` da `organizationAccountId`
 *    bo'sh bo'lishi mumkin; jonli kod ham bunday holatda `[]` qaytaradi
 *    (`payment-in.service.ts:700`). Ya'ni «daftarda yo'q» = to'g'ri xulq,
 *    backfill uni O'YLAB TOPMAYDI.
 * 5. **Nol delta yozilmaydi** — `MoneyService.applyDeltas` ham nol deltani
 *    daftarga tushirmaydi; backfill undan farq qilmasligi kerak.
 *
 * ## Nima QILINMAYDI — qoldiq USTUNLARI
 *
 * Bu reja FAQAT jurnal qatorlarini (`MoneyOperation`) taklif qiladi va
 * `CashDesk.balanceMinor` / `OrganizationAccount.balanceMinor` ustunlariga
 * UMUMAN tegmaydi. Sabab P2 dagi bilan bir xil: eng yomon oqibat «tarix
 * ko'rinmaydi» bo'lsin, «qoldiq buzildi» EMAS. Ustunlar bo'yicha kutilayotgan
 * siljish `expectedShiftBySource` da SON bo'lib qaytariladi — bu egasining
 * alohida qarori uchun O'LCHOV, avtomatik qo'llanadigan tuzatish emas.
 * Diqqat: `cash_in`/`cash_out`/`retailsale` hujjatlari o'z vaqtida qoldiqni
 * ALLAQACHON siljitgan bo'lishi mumkin (ular Faza 11 dan oldin ham
 * `MoneyService` orqali yozardi), `payment_*`/`debtpayment` esa yo'q — shuning
 * uchun siljishni ko'r-ko'rona qo'llash ikki-karra hisobga olib kelardi.
 */

/**
 * Backfill qamrab oladigan hujjat turlari.
 *
 * ATAYLAB QAMROVDA YO'Q (ikkalasi ham «unutilgan» emas, QAROR):
 * - `drawer_cash_in|out` — alohida skript bilan yopilgan
 *   (`ops-backfill-drawer-money.ts`, 2026-08-12). Ikkinchi skript o'sha
 *   hujjatlarni qayta ko'rsa, ikki backfill bir pulni ikki marta yozardi.
 * - `retailsale` — chek deltasi tender qatorlaridan (naqd · karta · terminal ·
 *   qarz) YIG'ILADI va ulardan faqat NAQD ulushi yashiqqa tushadi
 *   (`retail-sale.service.ts`). Uni tashqaridan qayta qurish = pul mantiqining
 *   IKKINCHI nusxasini yozish; nusxa asl bilan jimgina ajralib ketardi
 *   (`copy-paste-loses-a-branch` klassi). Bundan tashqari chek yo'li Faza 11
 *   dan OLDIN ham daftarga yozardi, ya'ni bu yerda kutilgan qarz YO'Q.
 *   Agar prodda chek-qatorlari yetishmayotgani o'lchansa — u ALOHIDA ish.
 */
export const MONEY_BACKFILL_KINDS = [
  'cash_in',
  'cash_out',
  'payment_in',
  'payment_out',
  'debtpayment',
] as const;

export type MoneyBackfillKind = (typeof MONEY_BACKFILL_KINDS)[number];

export type MoneySourceKind = 'cash_desk' | 'organization_account';

/** Skriptdan kelgan bitta o'qilgan hujjat (minimal shakl). */
export interface MoneyBackfillDoc {
  documentKind: MoneyBackfillKind;
  documentId: string;
  accountId: string;
  /** Hujjat raqami — hisobotda odam o'qishi uchun. */
  name: string;
  sourceKind: MoneySourceKind;
  /** `null` ⇒ hujjat pul manbasiga bog'lanmagan (qoida 4). */
  sourceId: string | null;
  /** Manbaning O'Z valyutasi. `null` ⇒ manba topilmadi. */
  sourceCurrency: string | null;
  currency: string;
  /** Ishorali delta: kirim `+`, chiqim `−`. */
  deltaMinor: bigint;
  counterpartyId: string | null;
  /** Hujjatning O'Z oni (postedAt ?? moment) — qoida 2. */
  at: Date;
}

export interface MoneyBackfillRow {
  documentKind: MoneyBackfillKind;
  documentId: string;
  accountId: string;
  name: string;
  sourceKind: MoneySourceKind;
  sourceId: string;
  currency: string;
  deltaMinor: bigint;
  counterpartyId: string | null;
  at: Date;
}

export type SkipReason = 'already_journaled' | 'no_source' | 'currency_mismatch' | 'zero_delta';

export interface MoneyBackfillSkip {
  documentKind: MoneyBackfillKind;
  documentId: string;
  name: string;
  reason: SkipReason;
  /** Odam o'qiy oladigan izoh (valyuta nomlari va h.k.). */
  detail: string;
}

export interface MoneyBackfillPlan {
  rows: MoneyBackfillRow[];
  skipped: MoneyBackfillSkip[];
  /** `sourceKind|sourceId` → rejadagi deltalar yig'indisi (FAQAT o'lchov). */
  expectedShiftBySource: Map<string, bigint>;
  /** Tur bo'yicha rejalashtirilgan qatorlar soni — hisobot sarlavhasi uchun. */
  countByKind: Map<MoneyBackfillKind, number>;
}

/** Daftardagi mavjud qator kaliti — skript ham, reja ham SHU shaklni ishlatadi. */
export function journalKey(documentKind: string, documentId: string): string {
  return `${documentKind}|${documentId}`;
}

/** Manba kaliti — qoldiq siljishini guruhlash uchun. */
export function sourceKey(sourceKind: MoneySourceKind, sourceId: string): string {
  return `${sourceKind}|${sourceId}`;
}

/**
 * Rejani quradi. `existingKeys` — daftarda ALLAQACHON bor `journalKey` lar
 * to'plami; shu to'plam tufayli reja FARQ bo'ladi (qoida 1).
 */
export function planMoneyBackfill(
  docs: readonly MoneyBackfillDoc[],
  existingKeys: ReadonlySet<string>,
): MoneyBackfillPlan {
  const rows: MoneyBackfillRow[] = [];
  const skipped: MoneyBackfillSkip[] = [];
  const expectedShiftBySource = new Map<string, bigint>();
  const countByKind = new Map<MoneyBackfillKind, number>();

  const skip = (d: MoneyBackfillDoc, reason: SkipReason, detail: string) =>
    skipped.push({
      documentKind: d.documentKind,
      documentId: d.documentId,
      name: d.name,
      reason,
      detail,
    });

  for (const d of docs) {
    // Qoida 1 — FARQ. Bu tekshiruv birinchi turishi SHART: allaqachon
    // yozilgan hujjat boshqa hech qanday sababga ko'ra qayta ko'rilmaydi.
    if (existingKeys.has(journalKey(d.documentKind, d.documentId))) {
      skip(d, 'already_journaled', 'daftarda qator bor');
      continue;
    }
    if (!d.sourceId) {
      skip(d, 'no_source', `hujjatda ${d.sourceKind} ko'rsatilmagan — jonli kod ham yozmaydi`);
      continue;
    }
    if (d.sourceCurrency === null || d.currency !== d.sourceCurrency) {
      skip(
        d,
        'currency_mismatch',
        `hujjat ${d.currency} ≠ manba ${d.sourceCurrency ?? '(topilmadi)'}`,
      );
      continue;
    }
    if (d.deltaMinor === 0n) {
      skip(d, 'zero_delta', 'nol summa — jonli kod ham qator yozmaydi');
      continue;
    }

    rows.push({
      documentKind: d.documentKind,
      documentId: d.documentId,
      accountId: d.accountId,
      name: d.name,
      sourceKind: d.sourceKind,
      sourceId: d.sourceId,
      currency: d.currency,
      deltaMinor: d.deltaMinor,
      counterpartyId: d.counterpartyId,
      at: d.at,
    });
    const sk = sourceKey(d.sourceKind, d.sourceId);
    expectedShiftBySource.set(sk, (expectedShiftBySource.get(sk) ?? 0n) + d.deltaMinor);
    countByKind.set(d.documentKind, (countByKind.get(d.documentKind) ?? 0) + 1);
  }

  return { rows, skipped, expectedShiftBySource, countByKind };
}

/**
 * Rollback SQL.
 *
 * 🔴 `money_operations` da `created_at` ustuni YO'Q (sxemada faqat `at` bor, u
 * esa ATAYLAB hujjatning O'Z oni — qoida 2). Ya'ni «backfilldan keyin
 * yozilganlarni o'chir» degan vaqt-shartini yozib bo'lmaydi: `at` bo'yicha
 * o'chirish o'sha oraliqdagi JONLI qatorlarni ham yeb yuborardi. Shuning uchun
 * har yugurtirish o'z `runId` sini `description` ga muhrlaydi va rollback
 * AYNAN o'sha muhr bo'yicha ishlaydi — ikkinchi yugurtirish birinchisining
 * qatorlarini rollback qilib yubormaydi.
 */
export const BACKFILL_DESCRIPTION_PREFIX = 'Backfill P14/H4';

/** Daftar qatorining izohi — muhr + hujjat raqami. */
export function backfillDescription(runId: string, docName: string): string {
  return `${BACKFILL_DESCRIPTION_PREFIX} ${runId}: ${docName}`;
}

export function rollbackSql(runId: string): string {
  return `DELETE FROM money_operations\n WHERE description LIKE '${BACKFILL_DESCRIPTION_PREFIX} ${runId}:%';`;
}
