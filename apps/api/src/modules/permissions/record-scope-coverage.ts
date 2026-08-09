import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PermissionEntity } from './permissions.types.js';

/**
 * MK39 — record-scope QAMROV REGISTRI va YOQISH DARVOZASI.
 *
 * ## Nega bu fayl bor
 *
 * `Account.recordScopeEnforced` — per-akkaunt bayroq (H4 RFC, W4). U YOQILGANDA
 * `PermissionsService.recordScopeWhere` / `assertRecordAccess` chaqirilgan
 * joylardagina yozuv-darajali ko'rinish cheklanadi. Chaqirilmagan modul esa
 * **hech narsa sezmaydi** — ro'yxat to'liq ochiq qoladi.
 *
 * Aynan shu «YARIM YOQILGAN» holat rejaning (MK39) asosiy xavfi: *«ruxsat
 * berildi deb o'ylanadi, aslida ishlamaydi»*. Bayroqni ko'z bilan yoqib
 * qo'yish — bir odamning xotirasiga tayanish. Shuning uchun MK39 ning birinchi
 * buyrug'i: **yoqishdan oldin qamrov hisobotini chiqar; qoplanmagan endpoint
 * bo'lsa YOQMA.**
 *
 * Bu modul o'sha hisobotni DETERMINISTIK qiladi:
 *   - registr `schema.prisma` dagi har `{ownerId, groupId, shared}` modeliga
 *     bir qatordan (test butunlikni qulflaydi — yangi model jimgina tushib
 *     qolmaydi);
 *   - `analyzeReadPath` servis manbasida o'qish-yo'li ULANGANini o'z entity
 *     literali bo'yicha tekshiradi (izoh yoki qo'shni entity SANALMAYDI);
 *   - `canEnableRecordScope` — yoqish darvozasi. Uni ikki iste'molchi o'qiydi:
 *     `record-scope-coverage.test.ts` (sxema default'i darvoza bilan mos
 *     bo'lsin) va `scripts/ops-record-scope-flag.ts` (prodda yoqish qadami).
 *
 * ## `not-applicable` qarori qanday asoslangan
 *
 * `{ownerId, groupId, shared}` uchligi sxemada BIR XIL shtamplanadi — shu
 * sababli global klassifikator (`Country`, `Uom`, `TaxRate`) va tashkiliy
 * ma'lumotnoma (`Employee`, `Organization`, `Store`) ham «scoped model»
 * ko'rinadi. Ularni yozuv-darajasida filtrlash maxfiylik BERMAYDI, lekin butun
 * ilovadagi dropdown'larni bo'shatadi; ko'rinish chegarasi u yerda BOSHQA o'q —
 * filial filtri (MK35) va HR ruxsatlari (MK27) — orqali qo'yiladi.
 *
 * Bu qo'lda qo'yilgan yagona qaror, ya'ni «qulay» xato qilish mumkin bo'lgan
 * yagona joy. Shuning uchun test uni MUSTAQIL manba bilan refute qiladi: rol
 * shablonlaridan (MK29) birortasi entity'ga `view` uchun ALL'dan past scope
 * bergan bo'lsa, o'sha entity `not-applicable` bo'la OLMAYDI.
 */

export type Applicability = 'scoped' | 'not-applicable';

export type CoverageStatus =
  /** list + detail ikkalasi ham o'z entity'si bilan ulangan */
  | 'enforced'
  /** faqat bittasi ulangan — detail teshigi mavjudlikni sizdiradi */
  | 'partial'
  /** servis bor, ulanish yo'q */
  | 'missing'
  /** servisda `PermissionEntity` slug'i yo'q — majburlab bo'lmaydi */
  | 'no-entity'
  /** modelning o'qish-yo'li (list) servisi umuman yo'q */
  | 'no-read-path'
  /** record-scope bu modelga qo'llanmaydi (sabab majburiy) */
  | 'not-applicable';

export interface RegistryEntry {
  /** Prisma model nomi (`schema.prisma`). */
  model: string;
  /** Ruxsat matritsasidagi entity slug'i; yo'q bo'lsa `null`. */
  entity: PermissionEntity | null;
  /** O'qish-yo'lini (list) egallagan servis, repo-nisbiy yo'l; yo'q bo'lsa `null`. */
  service: string | null;
  applicability: Applicability;
  /** `not-applicable` va servissiz qatorlar uchun MAJBURIY (test qulflaydi). */
  reason?: string;
}

export interface CoverageRow extends RegistryEntry {
  listEnforced: boolean;
  detailEnforced: boolean;
  status: CoverageStatus;
}

/** Bu faylning joylashuvidan repo ildizini hisoblaydi (apps/api/src/modules/permissions). */
export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
}

/** `schema.prisma` matnidan `{ownerId, groupId, shared}` uchligiga ega modellar. */
export function scopedModelsFromSchema(schemaText: string): string[] {
  const out: string[] = [];
  for (const m of schemaText.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const name = m[1];
    const body = m[2];
    if (!name || !body) continue;
    if (
      /^\s*ownerId\s/m.test(body) &&
      /^\s*groupId\s/m.test(body) &&
      /^\s*shared\s+Boolean/m.test(body)
    ) {
      out.push(name);
    }
  }
  return out;
}

/**
 * Servis manbasida record-scope o'qish-yo'li ULANGANmi.
 *
 * Talab: chaqiruvning O'ZI (`recordScopeWhere(` / `assertRecordAccess(`) va
 * o'sha chaqiruv argumentlari ichida AYNAN shu entity literali. Shu sababli
 *   - izohdagi «recordScopeWhere returns {}» — sanalmaydi (chaqiruv qavsi yo'q);
 *   - qo'shni modulning `'demand'` literali `invoiceout` uchun sanalmaydi.
 * Bu — yolg'on-yashil qamrovning bug-klassi (grep-count ≠ grounding).
 */
export function analyzeReadPath(
  source: string,
  entity: string | null,
): { list: boolean; detail: boolean } {
  if (!entity) return { list: false, detail: false };
  const called = (fn: string) =>
    new RegExp(`${fn}\\s*\\(([^()]*)'${entity}'`).test(source.replace(/\r/g, ''));
  return { list: called('recordScopeWhere'), detail: called('assertRecordAccess') };
}

/** Registr + manba o'quvchi → qamrov qatorlari. Manba o'qilmasa `null` qaytarilsin. */
export function buildCoverage(
  entries: readonly RegistryEntry[],
  readSource: (service: string) => string | null,
): CoverageRow[] {
  return entries.map((e) => {
    const source = e.service ? readSource(e.service) : null;
    const { list, detail } = source
      ? analyzeReadPath(source, e.entity)
      : { list: false, detail: false };
    const status: CoverageStatus =
      e.applicability === 'not-applicable'
        ? 'not-applicable'
        : !e.service
          ? 'no-read-path'
          : !e.entity
            ? 'no-entity'
            : list && detail
              ? 'enforced'
              : list || detail
                ? 'partial'
                : 'missing';
    return { ...e, listEnforced: list, detailEnforced: detail, status };
  });
}

export interface CoverageSummary {
  total: number;
  enforced: number;
  partial: number;
  missing: number;
  noEntity: number;
  noReadPath: number;
  notApplicable: number;
}

export function summarize(rows: readonly CoverageRow[]): CoverageSummary {
  const count = (s: CoverageStatus) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    enforced: count('enforced'),
    partial: count('partial'),
    missing: count('missing'),
    noEntity: count('no-entity'),
    noReadPath: count('no-read-path'),
    notApplicable: count('not-applicable'),
  };
}

const BLOCKER_REASON: Partial<Record<CoverageStatus, string>> = {
  partial: 'faqat yarim ulangan (detail 404 himoyasi yo`q → mavjudlik sizadi)',
  missing: 'record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)',
  'no-entity': 'PermissionEntity slug`i yo`q — hech qanday scope qo`llab bo`lmaydi',
  'no-read-path': 'o`qish-yo`li servisi yo`q — keyin qo`shilsa jimgina ochiq qoladi',
};

/**
 * YOQISH DARVOZASI. `ok: true` faqat har `scoped` qator `enforced` bo'lganda.
 * Blokerlar ro'yxati — hisobot va OPS skriptida ko'rsatiladi.
 */
export function canEnableRecordScope(rows: readonly CoverageRow[]): {
  ok: boolean;
  blockers: string[];
} {
  const blockers = rows
    .filter((r) => r.status !== 'enforced' && r.status !== 'not-applicable')
    .map((r) => `${r.model} [${r.status}] — ${BLOCKER_REASON[r.status] ?? r.status}`);
  return { ok: blockers.length === 0, blockers };
}

/**
 * OPS qarori: `recordScopeEnforced` bayrog'ini yoqish/o'chirish.
 *
 * ATAYLAB ASIMMETRIK:
 *   - **yoqish** darvozadan o'tadi — qamrovda teshik bo'lsa RAD etiladi. Aks
 *     holda «yarim yoqilgan» holat paydo bo'ladi: ruxsat berildi deb o'ylanadi,
 *     ulanmagan modullarda esa ro'yxat to'liq ochiq qoladi (MK39 asosiy xavfi).
 *   - **o'chirish** har doim ishlaydi — bayroq QAYTARILADIGAN bo'lishi kerak
 *     (MK39 DoD). Orqaga qaytishni hech qanday tekshiruv to'smasin.
 */
export function planFlagChange(input: { target: 'on' | 'off'; gateOk: boolean }): {
  action: 'enable' | 'disable' | 'refuse';
  message: string;
} {
  if (input.target === 'off') {
    return { action: 'disable', message: 'Bayroq o`chiriladi (eski xulq qaytadi).' };
  }
  if (!input.gateOk) {
    return {
      action: 'refuse',
      message:
        'RAD ETILDI: qamrov to`liq emas. Qoplanmagan o`qish-yo`li borligicha bayroqni yoqish «yarim yoqilgan» xavfli holat yaratadi (MK39). Avval blokerlarni yoping: pnpm record-scope:coverage',
    };
  }
  return { action: 'enable', message: 'Qamrov to`liq — bayroq yoqiladi.' };
}

const svc = (dir: string, file = `${dir}.service.ts`) => `apps/api/src/modules/${dir}/${file}`;

/**
 * 55 scoped model (2026-08-10 holati). Tartib `schema.prisma` bilan bir xil —
 * diff o'qiladigan bo'lib qolsin. Test butunlikni ikki tomonlama qulflaydi
 * (sxemada bor-u registrda yo'q · registrda bor-u sxemada yo'q).
 */
export const RECORD_SCOPE_REGISTRY: readonly RegistryEntry[] = [
  {
    model: 'Employee',
    entity: 'employee',
    service: null,
    applicability: 'not-applicable',
    reason:
      'Tashkiliy struktura. Xodimlar ro`yxati butun ilovada dropdown (mas`ul, ijrochi, egasi) — yozuv-darajasida filtrlash maxfiylik bermaydi, ekranlarni bo`shatadi. Ko`rinish HR ruxsatlari (MK27) va filial o`qi (MK35) bilan boshqariladi.',
  },
  {
    model: 'Organization',
    entity: 'organization',
    service: svc('organization'),
    applicability: 'not-applicable',
    reason:
      'O`z-kompaniya ma`lumotnomasi (hujjat sarlavhasidagi «Организация» dropdown). Chegara — filial o`qi (MK35), record-scope emas.',
  },
  {
    model: 'Store',
    entity: 'store',
    service: svc('store'),
    applicability: 'not-applicable',
    reason:
      'Ombor ma`lumotnomasi — har hujjat formasida dropdown. Chegara filial o`qi (MK35) bilan qo`yiladi.',
  },
  { model: 'CashIn', entity: 'cashin', service: svc('cash-in'), applicability: 'scoped' },
  { model: 'CashOut', entity: 'cashout', service: svc('cash-out'), applicability: 'scoped' },
  {
    model: 'ProductFolder',
    entity: 'productfolder',
    service: svc('product-folder'),
    applicability: 'scoped',
  },
  {
    model: 'Counterparty',
    entity: 'counterparty',
    service: svc('counterparty'),
    applicability: 'scoped',
  },
  {
    model: 'Country',
    entity: 'country',
    service: svc('country'),
    applicability: 'not-applicable',
    reason:
      'Global klassifikator (CATALOG — barcha rol shablonlarida `view: ALL`). Egasi bo`yicha filtrlash mantiqsiz.',
  },
  {
    model: 'Uom',
    entity: 'uom',
    service: svc('uom'),
    applicability: 'not-applicable',
    reason: 'Global klassifikator (o`lchov birligi) — CATALOG, barcha shablonda `view: ALL`.',
  },
  {
    model: 'TaxRate',
    entity: 'taxrate',
    service: svc('tax-rate'),
    applicability: 'not-applicable',
    reason: 'Global klassifikator (soliq stavkasi) — CATALOG, barcha shablonda `view: ALL`.',
  },
  { model: 'Project', entity: 'project', service: svc('project'), applicability: 'scoped' },
  { model: 'Contract', entity: 'contract', service: svc('contract'), applicability: 'scoped' },
  {
    model: 'BonusOperation',
    entity: null,
    service: svc('loyalty'),
    applicability: 'scoped',
    reason: 'Sodiqlik ballari operatsiyasi; `PermissionEntity` slug`i hali yo`q (MK39 blokeri).',
  },
  {
    model: 'Prepayment',
    entity: 'prepayment',
    service: svc('prepayment'),
    applicability: 'scoped',
  },
  {
    model: 'PrepaymentReturn',
    entity: 'prepaymentreturn',
    service: svc('prepayment-return'),
    applicability: 'scoped',
  },
  {
    model: 'InternalOrder',
    entity: 'internalorder',
    service: svc('internal-order'),
    applicability: 'scoped',
  },
  {
    model: 'CounterpartyAdjustment',
    entity: 'counterpartyadjustment',
    service: svc('counterparty-adjustment'),
    applicability: 'scoped',
  },
  { model: 'PriceList', entity: 'pricelist', service: svc('price-list'), applicability: 'scoped' },
  {
    model: 'RetailDrawerCashIn',
    entity: null,
    service: svc('cashier-session'),
    applicability: 'scoped',
    reason: 'Kassa yashigi kirimi — `cashier-session` o`qiydi; alohida entity slug`i yo`q.',
  },
  {
    model: 'RetailDrawerCashOut',
    entity: null,
    service: svc('cashier-session'),
    applicability: 'scoped',
    reason: 'Kassa yashigi chiqimi — `cashier-session` o`qiydi; alohida entity slug`i yo`q.',
  },
  {
    model: 'RetailSalesReturn',
    entity: null,
    service: null,
    applicability: 'scoped',
    reason:
      'Chakana qaytarish; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep). Qo`shilganda darvoza uni talab qiladi.',
  },
  {
    model: 'RetailStore',
    entity: null,
    service: null,
    applicability: 'not-applicable',
    reason:
      'Chakana do`kon ma`lumotnomasi (dropdown), `Store` bilan bir xil sabab; o`qish-yo`li ham yo`q.',
  },
  {
    model: 'ProcessingProcess',
    entity: 'processingprocess',
    service: svc('processing-process'),
    applicability: 'scoped',
  },
  {
    model: 'ProcessingStage',
    entity: 'processingstage',
    service: svc('processing-stage'),
    applicability: 'scoped',
  },
  {
    model: 'ProcessingPlanFolder',
    entity: null,
    service: null,
    applicability: 'scoped',
    reason: 'Texkarta papkasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep).',
  },
  {
    model: 'Production',
    entity: null,
    service: svc('production'),
    applicability: 'scoped',
    reason: 'Ishlab chiqarish hujjati; `PermissionEntity` slug`i yo`q (MK39 blokeri).',
  },
  {
    model: 'ProcessingOrder',
    entity: 'processingorder',
    service: svc('processing-order'),
    applicability: 'scoped',
  },
  {
    model: 'Processing',
    entity: 'processing',
    service: svc('processing'),
    applicability: 'scoped',
  },
  { model: 'Payroll', entity: 'payroll', service: svc('payroll'), applicability: 'scoped' },
  {
    model: 'FactureOut',
    entity: 'factureout',
    service: svc('facture-out'),
    applicability: 'scoped',
  },
  { model: 'FactureIn', entity: 'facturein', service: svc('facture-in'), applicability: 'scoped' },
  {
    model: 'CommissionReportOut',
    entity: 'commissionreport',
    service: svc('commission-report'),
    applicability: 'scoped',
  },
  {
    model: 'CommissionReportIn',
    entity: 'commissionreport',
    service: svc('commission-report'),
    applicability: 'scoped',
  },
  {
    model: 'EmissionOrder',
    entity: null,
    service: null,
    applicability: 'scoped',
    reason: 'Markirovka emissiya buyurtmasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep).',
  },
  {
    model: 'MarkingCodeOrder',
    entity: null,
    service: null,
    applicability: 'scoped',
    reason: 'Markirovka kod buyurtmasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep).',
  },
  {
    model: 'RetireOrder',
    entity: null,
    service: null,
    applicability: 'scoped',
    reason: 'Markirovka chiqarish buyurtmasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep).',
  },
  { model: 'Product', entity: 'product', service: svc('product'), applicability: 'scoped' },
  {
    model: 'CustomerOrder',
    entity: 'customerorder',
    service: svc('customer-order'),
    applicability: 'scoped',
  },
  {
    model: 'InvoiceOut',
    entity: 'invoiceout',
    service: svc('invoice-out'),
    applicability: 'scoped',
  },
  { model: 'Supply', entity: 'supply', service: svc('supply'), applicability: 'scoped' },
  {
    model: 'PurchaseOrder',
    entity: 'purchaseorder',
    service: svc('purchase-order'),
    applicability: 'scoped',
  },
  { model: 'PaymentIn', entity: 'paymentin', service: svc('payment-in'), applicability: 'scoped' },
  {
    model: 'PaymentOut',
    entity: 'paymentout',
    service: svc('payment-out'),
    applicability: 'scoped',
  },
  { model: 'Demand', entity: 'demand', service: svc('demand'), applicability: 'scoped' },
  {
    model: 'SalesReturn',
    entity: 'salesreturn',
    service: svc('sales-return'),
    applicability: 'scoped',
  },
  {
    model: 'PurchaseReturn',
    entity: 'purchasereturn',
    service: svc('purchase-return'),
    applicability: 'scoped',
  },
  { model: 'Move', entity: 'move', service: svc('move'), applicability: 'scoped' },
  { model: 'Loss', entity: 'loss', service: svc('loss'), applicability: 'scoped' },
  { model: 'Enter', entity: 'enter', service: svc('enter'), applicability: 'scoped' },
  { model: 'Inventory', entity: 'inventory', service: svc('inventory'), applicability: 'scoped' },
  { model: 'InvoiceIn', entity: 'invoicein', service: svc('invoice-in'), applicability: 'scoped' },
  {
    model: 'CashierSession',
    entity: 'cashiersession',
    service: svc('cashier-session'),
    applicability: 'scoped',
  },
  {
    model: 'RetailSale',
    entity: 'retailsale',
    service: svc('retail-sale'),
    applicability: 'scoped',
  },
  {
    model: 'SalesChannel',
    entity: 'saleschannel',
    service: svc('sales-channel'),
    applicability: 'not-applicable',
    reason:
      'Savdo kanali ma`lumotnomasi — hujjat formasidagi dropdown, egasi bo`yicha filtrlash ekranni bo`shatadi.',
  },
  {
    model: 'ServiceRequest',
    entity: null,
    service: svc('service-desk', 'service-request.service.ts'),
    applicability: 'scoped',
    reason: 'Servis arizasi; `PermissionEntity` slug`i yo`q (MK39 blokeri).',
  },
];
