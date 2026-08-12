import {
  type CurrencyTally,
  type RateContext,
  consolidateToBase,
} from '../report/report-rate-ctx.util.js';

/**
 * MK12 / 4M TZ §8 — xarajat **FAKTI** mavjud hujjatlardan yig'iladi.
 *
 * 🔴 YANGI YOZUVCHI OCHILMAYDI. Byudjet ekrani hech qanday hujjat yaratmaydi
 * va hech qanday xarajatni tasdiqlashga majbur qilmaydi (TZ §8: «xarajat
 * tasdiqlanmaydi — lekin ko'rinadi»). U faqat allaqachon yozilgan pul
 * chiqishini o'qiydi.
 *
 * ## Uch manba — va nega AYNAN shu uchtasi
 *
 * | Manba | Jadval | Modda kaliti |
 * |---|---|---|
 * | Kassa RKO | `cash_out` | `expense_item` (erkin matn) |
 * | Bank to'lovi | `payments_out` | `expense_item` (erkin matn) |
 * | Kassa yashigi (POS) | `retail_drawer_cash_out` | `expense_item_id` (FK) |
 *
 * **`kind='expense'` FILTRI MAJBURIY** (`drawerExpenseWhereKind`). Yashiq
 * jadvali uch xil pul chiqishini saqlaydi (`kind`: `expense` · `collection` ·
 * `other`). Inkassatsiya — bu xarajat EMAS, kassadan bankka **ko'chirish**:
 * o'sha pul keyin bankdan `PaymentOut` bilan chiqqanda ikkinchi marta
 * sanalardi. Ya'ni filtrsiz yig'indi «ikki manba qo'shildi» bug'i bo'lardi.
 *
 * **`Loss` (chiqim akti) QO'SHILMAYDI** — unda ham `expense_item` ustuni bor,
 * lekin u tovar hisobdan chiqishi, pul chiqishi emas; uning qiymati tan narx
 * orqali allaqachon COGS'da turibdi. Qo'shilsa bir xarajat ikki marta
 * hisoblanardi.
 *
 * ✅ **P&L bilan farq YOPILDI (P14/`H3`, 2026-08-12).** Ilgari
 * `report/pnl.service.ts` xarajat qatorini faqat `payments_out` + `cash_out`
 * dan yig'ardi — `retail_drawer_cash_out` u yerda YO'Q edi, ya'ni kassadan
 * to'langan ijara byudjetda ko'rinib, foyda-zarar hisobotida ko'rinmasdi
 * (sof foyda doimo yuqori chiqardi). Endi P&L ham AYNAN shu uchinchi manbani
 * o'qiydi va chegara shartini `drawerExpenseWhereKind()` dan — SHU fayldan —
 * oladi, ya'ni ikki ekran bitta qoidada. Qulf:
 * `report/pnl-pos-expense.test.ts`.
 *
 * ⚠️ **HAMON ochiq (P14 dan tashqarida):** P&L xarajat qatoriga `cash_out` /
 * `payments_out` ning HAMMASI kiradi — shu jumladan `Supply`/`InvoiceIn`/
 * `PurchaseOrder` yaratgan TAMINOTCHI to'lovlari, vaholanki o'sha tovar puli
 * COGS'da (`demands.cost_sum_minor`) allaqachon turibdi. Bu — P14'dan OLDIN
 * ham mavjud bo'lgan ikki-karra sanoq; yashiq manbasi uni yomonlashtirmaydi,
 * lekin «P&L xarajat to'g'riligi» fazasi buni alohida hal qilishi kerak.
 */

export const EXPENSE_FACT_SOURCE = {
  cashOut: 'cash_out',
  paymentOut: 'payment_out',
  drawerCashOut: 'retail_drawer_cash_out',
} as const;

export type ExpenseFactSource = (typeof EXPENSE_FACT_SOURCE)[keyof typeof EXPENSE_FACT_SOURCE];

/**
 * Moddasi aniqlanmagan pul chelagi. `null` ataylab — bu «modda» EMAS, uni
 * hech qachon `ExpenseItem.id` bilan adashtirib bo'lmaydi.
 */
export const UNTAGGED_KEY = null;

/** Bitta o'qilgan xarajat hujjati (agregatsiyaga tayyor, minimal shakl). */
export interface ExpenseFactDoc {
  source: ExpenseFactSource;
  /** FK — faqat yashiq hujjatida bor. */
  expenseItemId: string | null;
  /** Erkin matn tegi — `cash_out` / `payments_out` da. */
  expenseItemName: string | null;
  currency: string;
  /** Hujjatning O'Z kursi (×10^8). M-11: tarixiy davr qayta baholanmasin. */
  rateValue: bigint | null;
  sumMinor: bigint;
}

export interface ExpenseItemRef {
  id: string;
  name: string;
}

export interface ExpenseFactResult {
  /** `ExpenseItem.id` → baza valyutasidagi jami; `UNTAGGED_KEY` = moddasiz. */
  byItem: Map<string | null, bigint>;
  /**
   * Bir nechta moddaga mos kelgan teg matnlari (normallashtirilgan holda).
   * Ular `UNTAGGED_KEY` ga tushadi — ma'lumot sifati bayrog'i sifatida
   * qaytariladi, [[data-quality-flag-layer]] naqshi.
   */
  ambiguousNames: string[];
}

/**
 * Yashiq hujjatidan FAQAT xarajatni olish sharti. Alohida funksiya — chunki
 * uning yo'qolishi jimgina ikki-karra sanoqqa olib keladi, va testda aynan
 * shu qulflanadi (servis so'roviga qo'shilgani `expense-budget.service.test.ts`
 * da manba-skan bilan tekshiriladi).
 */
export function drawerExpenseWhereKind(): { kind: 'expense' } {
  return { kind: 'expense' };
}

/** Teg matnini solishtirishga tayyorlash — chetki bo'shliq + registr. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Hujjatlarni modda × baza-valyutasi kesimida yig'adi.
 *
 * Har hujjat **AYNAN BITTA** chelakka tushadi: avval FK, u bo'lmasa teg
 * matni, u ham topilmasa `UNTAGGED_KEY`. FK ham, matn ham to'lgan hujjat ikki
 * marta sanalmaydi (FK ustun turadi).
 */
export function aggregateExpenseFact(
  docs: readonly ExpenseFactDoc[],
  opts: { items: readonly ExpenseItemRef[]; ctx: RateContext; tally: CurrencyTally },
): ExpenseFactResult {
  const { items, ctx, tally } = opts;

  // Nom → modda xaritasi. Bir nom ikki moddada uchrasa TAXMIN QILINMAYDI:
  // xarita qiymati `null` bo'ladi va pul moddasizga tushadi. Tavakkal
  // biriktirish og'ishni jimgina yolg'on qilardi.
  const byName = new Map<string, string | null>();
  const ambiguous = new Set<string>();
  for (const it of items) {
    const key = normalizeName(it.name);
    if (!key) continue;
    if (byName.has(key)) {
      byName.set(key, null);
      ambiguous.add(key);
    } else {
      byName.set(key, it.id);
    }
  }
  const knownIds = new Set(items.map((i) => i.id));

  const byItem = new Map<string | null, bigint>();
  for (const d of docs) {
    const base = consolidateToBase(d.sumMinor, d.currency, ctx, tally, d.rateValue ?? undefined);
    // Konvertatsiya qilinmagan pul `tally` ga yozildi va 0 qaytdi — uni
    // moddaga qo'shish 0 qo'shish bilan bir xil, ya'ni jami buzilmaydi.

    const key = resolveKey(d, byName, knownIds);
    byItem.set(key, (byItem.get(key) ?? 0n) + base);
  }

  return { byItem, ambiguousNames: [...ambiguous] };
}

/** Hujjatning yagona chelak kaliti — tartib qat'iy: FK → teg matni → moddasiz. */
function resolveKey(
  d: ExpenseFactDoc,
  byName: Map<string, string | null>,
  knownIds: Set<string>,
): string | null {
  if (d.expenseItemId && knownIds.has(d.expenseItemId)) return d.expenseItemId;
  // Arxivlangan/o'chirilgan moddaga ishora qilgan FK — ro'yxatda yo'q, lekin
  // pul bor. Moddasizga tushadi (yo'qolmaydi).
  if (d.expenseItemId) return UNTAGGED_KEY;
  if (!d.expenseItemName) return UNTAGGED_KEY;
  const key = normalizeName(d.expenseItemName);
  if (!key) return UNTAGGED_KEY;
  return byName.get(key) ?? UNTAGGED_KEY;
}
