/**
 * QAMROV REYESTRI — `CounterpartyBalanceService.applyDelta` ni chaqiradigan HAR
 * yozuvchi shu yerda e'lon qilinishi va `recompute-counterparty-balances.ts`
 * dagi mos rekonstruksiya-manbasiga bog'lanishi SHART.
 *
 * NEGA (DUP-02, CRITICAL — audit 2026-08-08): rekonstruksiya skripti
 * «hujjatlardan hisoblangan qiymat» ni materialized `CounterpartyBalance` ga
 * YOZADI, va manbalarda YO'Q kontragent uchun nishon 0 bo'ladi. Ya'ni skript
 * qamramagan har bir yozuvchining saldosi `APPLY=1` da JIMGINA 0 ga tushadi.
 * Skript o'z izohida bu shartni yozgan edi, lekin uni hech narsa majburlamasdi:
 * 2026-08-05 da `Debt.create` va POS qarz-sotuvi yangi yozuvchi bo'lib qo'shildi
 * va ro'yxatga tushmadi — qo'lda ochilgan QRZ- qarzlar va POS qarzlari birinchi
 * `APPLY=1` da yo'q bo'lardi.
 *
 * Endi shart KOD bilan majburlanadi, ikki joyda bir manbadan:
 *   1. `recompute-counterparty-balances.ts` `main()` boshida `assert…Coverage()`
 *      chaqiradi — qamrovsiz yozuvchi bo'lsa skript BIRINCHI YOZUVDAN OLDIN
 *      `throw` qiladi (DRY-RUN da ham);
 *   2. `counterparty-balance-sources.test.ts` xuddi shu funksiyani gate'da
 *      yugurtiradi — yangi yozuvchi qo'shgan dasturchi CI'da darhol ko'radi.
 *
 * Skanner manba-daraxtdan o'qiydi (ro'yxat qo'lda emas, kod bilan topiladi) —
 * shuning uchun «reyestrga qo'shishni unutish» ni ham tutadi.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `apps/api/src` — bu fayl `src/scripts/` ichida turadi. */
export const API_SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Skriptdagi rekonstruksiya-manbalari. Har biri skript faylida
 * `SOURCE: <nom>` marker-izohi bilan belgilangan — test markerni talab qiladi,
 * shuning uchun «reyestrga yozdim, skriptni yangilashni unutdim» holati ham
 * yiqiladi (reyestr yashil, skript chala bo'lolmaydi).
 */
export const SCRIPT_SOURCES = [
  'fixed-docs',
  'adjustments',
  'debt-payments',
  'debt-issue',
  'retail-credit',
  'retail-credit-refund',
  'return-payouts',
] as const;

export type ScriptSource = (typeof SCRIPT_SOURCES)[number];

export interface BalanceWriter {
  /** `apps/api/src` ga nisbatan POSIX yo'l. */
  file: string;
  /** Skriptdagi qaysi manba(lar) shu yozuvchini qayta quradi. */
  sources: readonly ScriptSource[];
  /** Yozuvchi nima yozadi — reyestrni o'qigan odam skriptga solishtira olsin. */
  note: string;
}

export const DECLARED_BALANCE_WRITERS: readonly BalanceWriter[] = [
  {
    file: 'modules/invoice-out/invoice-out.service.ts',
    sources: ['fixed-docs'],
    note: "post +sumMinor / unpost·cancel teskari (applicable bayrog'i bilan gate'langan)",
  },
  // ⚠️ `modules/invoice-in/invoice-in.service.ts` bu ro'yxatda ATAYLAB YO'Q.
  // Faza 13 (2026-08-08, QAROR-B «Supply-only», `PP-03`) uni balansdan uzdi:
  // xarid qarzini faqat Qabul (`Supply`) yozadi, aks holda PO → hisob-faktura +
  // qabul oqimida bitta xarid ikki marta qarz bo'lardi. Skanner faylda
  // `applyDelta` chaqiruvini topmaydi ⇒ ESKIRGAN yozuv qo'riqchisi shu qatorni
  // qaytarib qo'yishga ham yo'l bermaydi.
  {
    file: 'modules/supply/supply.service.ts',
    sources: ['fixed-docs'],
    note: 'post −sumMinor (qabul qilingan tovar yetkazib beruvchiga qarzni oshiradi)',
  },
  {
    file: 'modules/purchase-return/purchase-return.service.ts',
    sources: ['fixed-docs'],
    note: 'post +sumMinor (tovar taminotchiga qaytdi ⇒ qarzimiz kamayadi), unpost·cancel teskari',
  },
  {
    file: 'modules/sales-return/sales-return.service.ts',
    sources: ['fixed-docs'],
    note:
      'post −sumMinor (tovar mijozdan qaytdi ⇒ uning qarzi kamayadi), unpost·cancel teskari. ' +
      'P14/H1, 2026-08-12. ⚠️ `Demand` balansga yozmagani uchun hisob-fakturasiz sotuvning ' +
      'qaytarilishi balansni manfiy tomonga suradi — hisobotda ochiq xavf.',
  },
  {
    file: 'modules/payment-in/payment-in.service.ts',
    sources: ['fixed-docs'],
    note: 'post −sumMinor',
  },
  {
    file: 'modules/payment-out/payment-out.service.ts',
    sources: ['fixed-docs'],
    note: 'post +sumMinor',
  },
  {
    file: 'modules/cash-in/cash-in.service.ts',
    sources: ['fixed-docs'],
    note: 'post −sumMinor',
  },
  {
    file: 'modules/cash-out/cash-out.service.ts',
    sources: ['fixed-docs'],
    note: 'post +sumMinor',
  },
  {
    file: 'modules/prepayment/prepayment.service.ts',
    sources: ['fixed-docs'],
    note: 'post −sumMinor',
  },
  {
    file: 'modules/prepayment-return/prepayment-return.service.ts',
    sources: ['fixed-docs'],
    note: 'post +sumMinor',
  },
  {
    file: 'modules/counterparty-adjustment/counterparty-adjustment.service.ts',
    sources: ['adjustments'],
    note: 'post ±sumMinor — ishora `direction` ustunidan (INCREASE | DECREASE)',
  },
  {
    file: 'modules/debt/debt-recalc.ts',
    sources: ['debt-payments'],
    note: "har to'lovda −paidDelta (storno qilinganlari — `reversedAt` — hisobga kirmaydi)",
  },
  {
    file: 'modules/debt/debt.service.ts',
    sources: ['debt-issue'],
    note:
      'create() +totalMinor (QRZ- reyestri, 2026-08-05 balans-simmetriyasi). ' +
      'remove() −totalMinor reversal YOZADI (Faza 12/DUP-03) — shuning uchun skript ' +
      "o'chirilganlarni (deletedAt != null) SANAMAYDI. " +
      '🔴 Q1 (2026-08-25): ADOPSIYA qatorlari (balanceAdopted=true) balansga UMUMAN ' +
      'yozmaydi (ochilishi ham, remove() ham) — skript ularni ham SANAMAYDI, aks holda ' +
      "cross-check «hujjatlar ≠ jurnal» deb yolg'on farq ko'rsatardi.",
  },
  {
    file: 'modules/retail-sale/retail-sale.service.ts',
    sources: ['retail-credit', 'retail-credit-refund'],
    note:
      'post() +debtAmount (DEBT tender qatori), refund() −debtReturnMinor (SALES-04). ' +
      'Kontragent SOLD_ON_CREDIT audit hodisasidan aniqlanadi.',
  },
  {
    file: 'modules/cashier-session/cashier-session.service.ts',
    sources: ['return-payouts'],
    note:
      'customerPayout() +sumMinor (G1, 2026-08-24): vozvrat puli kassadan naqd qaytarildi — ' +
      '`SalesReturn.post()` yozgan −sumMinor kreditning yopilishi. Hujjat: `RetailDrawerCashOut` ' +
      "(kind='return_payout', agentId bilan), holati doim posted.",
  },
];

const SKIP_FILES = new Set([
  // applyDelta ning O'ZI shu yerda e'lon qilingan — chaqiruvchi emas.
  'modules/counterparty-balance/counterparty-balance.service.ts',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'generated']);

/**
 * `X.applyDelta(` — metod CHAQIRUVI. Oldidagi belgi (`\w`, `)`, `]`) talab
 * qilinadi, shuning uchun e'lonning o'zi (`async applyDelta(`) mos kelmaydi.
 * Izohlar oldindan olib tashlanadi (izohlarda applyDelta ko'p tilga olinadi —
 * masalan `counterparty-settlement.util.ts` premise-hujjatida).
 */
const APPLY_DELTA_CALL = /[\w)\]]\s*\.\s*applyDelta\s*\(/;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const toPosix = (p: string) => p.split(sep).join('/');

function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkTsFiles(full);
      continue;
    }
    // Testlar chaqiruvchi emas: ular `applyDelta` ni mock/spy bilan chaqiradi.
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) yield full;
  }
}

/**
 * Manba-daraxtni skanerlab `applyDelta` ni chaqiradigan fayllarni topadi
 * (`apps/api/src` ga nisbatan POSIX yo'llar, alifbo tartibida).
 */
export function scanBalanceWriters(srcRoot: string = API_SRC_ROOT): string[] {
  const found: string[] = [];
  for (const full of walkTsFiles(srcRoot)) {
    const rel = toPosix(relative(srcRoot, full));
    if (SKIP_FILES.has(rel)) continue;
    if (APPLY_DELTA_CALL.test(stripComments(readFileSync(full, 'utf8')))) found.push(rel);
  }
  return found.sort();
}

/**
 * Qamrov to'liqligini tekshiradi. Ikki tomonlama:
 *   - skanerda bor, reyestrda yo'q → QAMROVSIZ yozuvchi (DUP-02 klassi:
 *     `APPLY=1` uning saldosini jimgina 0 qilardi);
 *   - reyestrda bor, skanerda yo'q → ESKIRGAN yozuv (yozuvchi olib tashlangan;
 *     skriptda uning manbasi qolgan bo'lsa endi ortiqcha qo'shadi).
 *
 * @throws Error — nima qilish kerakligini aytadigan xabar bilan.
 */
export function assertCounterpartyBalanceCoverage(
  found: readonly string[] = scanBalanceWriters(),
): void {
  const declared = new Set(DECLARED_BALANCE_WRITERS.map((w) => w.file));
  const foundSet = new Set(found);
  const uncovered = found.filter((f) => !declared.has(f));
  const stale = [...declared].filter((f) => !foundSet.has(f)).sort();
  if (uncovered.length === 0 && stale.length === 0) return;

  const lines = ["Kontragent-balans QAMROVI buzilgan (DUP-02 qo'riqchisi):"];
  if (uncovered.length > 0) {
    lines.push(
      '',
      "  QAMROVSIZ yozuvchi(lar) — `applyDelta` chaqiradi, lekin reyestrda yo'q:",
      ...uncovered.map((f) => `    · ${f}`),
      '',
      '  Bu holda `recompute-counterparty-balances.ts` APPLY=1 bilan yugursa shu',
      "  yozuvchidan kelgan saldo JIMGINA 0 ga tushadi (pul-ma'lumot yo'qolishi).",
      '  Qilinadigan ish: (1) skriptga shu yozuvchining rekonstruksiya-manbasini',
      "  qo'sh va blokni `SOURCE: <nom>` izohi bilan belgila; (2) manbani",
      '  `SCRIPT_SOURCES` ga, faylni `DECLARED_BALANCE_WRITERS` ga yoz.',
    );
  }
  if (stale.length > 0) {
    lines.push(
      '',
      "  ESKIRGAN reyestr yozuvi — reyestrda bor, kodda `applyDelta` yo'q:",
      ...stale.map((f) => `    · ${f}`),
      '',
      "  Yozuvchi olib tashlangan bo'lsa, skriptdagi mos manbani ham olib tashla",
      "  (aks holda rekonstruksiya endi mavjud bo'lmagan deltani qo'shadi).",
    );
  }
  throw new Error(lines.join('\n'));
}
