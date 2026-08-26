/**
 * K6 (bo'linadigan tovar) — BAYROQ SIYOSATI ning SOF yadrosi.
 * Prisma yo'q, SQL yo'q, Nest yo'q: faqat qoidalar va hisob.
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K6 fazasi.
 *
 * Uch masalani yechadi:
 *
 *   1. **«m» birligini tanish** — birligi metr bo'lgan tovarda bayroq YOQILGAN
 *      holda keladi (K-Q9). Egasining sababi: «jim ishlamaslikdan ko'ra
 *      shovqinli ishlamaslik yaxshi — bayroq yoqilgan bo'lsa ortiqchaligi
 *      birinchi kunda bilinadi; o'chiq bo'lsa kerakligi mijoz ketib qolganda
 *      bilinadi».
 *   2. **«Hal qilinmagan» ro'yxati** (K6/3) — birligi «m», lekin bayroq
 *      bo'yicha hech kim qaror qilmagan tovarlar.
 *   3. **Kunlik sverka signali** (K6/5) — farq chiqsa katta omborchiga
 *      bildirishnoma matni va uni KIM oladi.
 *
 * 🔷 Bu modul HECH NARSA yozmaydi va hech nimani to'xtatmaydi. Bayroqning
 * o'zi sotuvga ta'sir qiladi (K3 ning 7.1 istisnosi: bo'linadigan tovarda
 * avto-taqsimot 3-holati o'chadi), shuning uchun uni YOQADIGAN qoidalar
 * testlar bilan qulflangan sof funksiyalarda turishi shart.
 */

// ---------------------------------------------------------------------------
// 1. «m» birligi
// ---------------------------------------------------------------------------

/**
 * Metr birligining tanilishi kerak bo'lgan yozuvlari.
 *
 * `Product.uom` — ERKIN MATN (`uoms` ma'lumotnomasidagi NOM shundoq
 * yoziladi, `use-product-form.ts`), ya'ni bazada `м`, `m`, `метр`, `Metr` —
 * hammasi uchraydi. Ro'yxat ATAYLAB TOR va YOPIQ: `мм` (millimetr), `м2`,
 * `м3`, `мл` metr EMAS va ular ham «m» bilan boshlanadi ⇒ prefiks bo'yicha
 * tekshirish jimgina noto'g'ri tovarlarni bo'lak hisobiga tortardi.
 *
 * Kirill «м» va lotin «m» ikkalasi ham bor — bir xil ko'rinadi, kod nuqtasi
 * boshqa; foydalanuvchi qaysi klaviaturada yozganini bilib bo'lmaydi.
 */
export const METER_UOM_NAMES: readonly string[] = [
  'м',
  'м.',
  'метр',
  'метр.',
  'метры',
  'm',
  'm.',
  'metr',
  'metr.',
  'meter',
  'metre',
];

/** Solishtirish uchun normallash: trim + kichik harf + ichki bo'shliqlar olib tashlanadi. */
function normalizeUom(uom: string | null | undefined): string {
  return (uom ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Tovarning birligi metrmi (bo'lak hisobi shu birlikka qaraydi). */
export function isMeterUom(uom: string | null | undefined): boolean {
  const n = normalizeUom(uom);
  if (!n) return false;
  return METER_UOM_NAMES.includes(n);
}

/**
 * YANGI tovar uchun bayroqning boshlang'ich qiymati (K-Q9).
 *
 * ⚠️ Bu QAROR EMAS: `piece_tracked_decided_at` NULL bo'lib qoladi va tovar
 * «Hal qilinmagan» ro'yxatida ko'rinadi (K6/3 — «shu bilan yangi
 * nomenklatura unutilib qolmaydi»). Ya'ni sukut shovqinli, lekin ko'rinadigan.
 */
export function defaultPieceTrackedForUom(uom: string | null | undefined): boolean {
  return isMeterUom(uom);
}

// ---------------------------------------------------------------------------
// 2. «Hal qilinmagan» ro'yxati (K6/3)
// ---------------------------------------------------------------------------

export interface FlagCandidate {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  pieceTracked: boolean;
  /** `products.piece_tracked_decided_at` — NULL = qaror yo'q. */
  decidedAt: Date | string | null;
  /** Reyestrda shu tovarning FAOL bo'laklari (bo'lsa — «kerak» degan dalil). */
  activePieces?: number;
}

export type FlagDecisionState =
  /** Qaror qilingan — ro'yxatda ko'rinmaydi. */
  | 'decided'
  /** Qaror yo'q, bayroq YOQILGAN (yangi «m» tovar sukuti) — tasdiq kutmoqda. */
  | 'pending-on'
  /** Qaror yo'q, bayroq o'chiq — ko'rib chiqish kutmoqda. */
  | 'pending-off';

export function classifyFlagDecision(row: FlagCandidate): FlagDecisionState {
  if (row.decidedAt) return 'decided';
  return row.pieceTracked ? 'pending-on' : 'pending-off';
}

export interface PendingDecisionRow extends FlagCandidate {
  state: FlagDecisionState;
}

export interface PendingDecisionList {
  rows: PendingDecisionRow[];
  totals: {
    /** Ro'yxatga tushgan (qaror kutayotgan) tovarlar soni. */
    pending: number;
    /** Shulardan bayrog'i YOQILGANI (kassa xulqi allaqachon o'zgargan). */
    pendingOn: number;
    /** Qaror qilingani (ro'yxatdan chiqqani) — kirishdagilar orasidan. */
    decided: number;
  };
  /** Chegara tufayli KO'RSATILMAGAN qatorlar (jim kesish YO'Q — IS-5 intizomi). */
  truncated: number;
}

/**
 * Qaror kutayotgan tovarlar ro'yxati.
 *
 * Kirish ATAYLAB tayyor (filtrlangan) emas: chaqiruvchi «birligi m YOKI
 * reyestrda bo'lagi bor» tovarlarni beradi, saralash va tasnif esa shu yerda
 * bo'ladi — ya'ni tartib testlar bilan qulflanadi.
 *
 * Tartib: avval **bayrog'i YOQILGAN** lar (ular jonli xulqni ALLAQACHON
 * o'zgartirgan — kassada `no-single-source` 400 chiqishi mumkin, K3 ning
 * ochiq xavfi), so'ng reyestrda bo'lagi ko'plari, so'ng nom bo'yicha.
 */
export function buildPendingDecisionList(
  candidates: readonly FlagCandidate[],
  limit = 200,
): PendingDecisionList {
  let decided = 0;
  const pending: PendingDecisionRow[] = [];

  for (const row of candidates) {
    const state = classifyFlagDecision(row);
    if (state === 'decided') {
      decided += 1;
      continue;
    }
    pending.push({ ...row, state });
  }

  pending.sort((a, b) => {
    const aOn = a.state === 'pending-on' ? 0 : 1;
    const bOn = b.state === 'pending-on' ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    const aPieces = a.activePieces ?? 0;
    const bPieces = b.activePieces ?? 0;
    if (aPieces !== bPieces) return bPieces - aPieces;
    return a.name.localeCompare(b.name);
  });

  const capped = limit > 0 ? pending.slice(0, limit) : pending;
  return {
    rows: capped,
    totals: {
      pending: pending.length,
      pendingOn: pending.filter((r) => r.state === 'pending-on').length,
      decided,
    },
    truncated: pending.length - capped.length,
  };
}

// ---------------------------------------------------------------------------
// 3. Qaror muhri
// ---------------------------------------------------------------------------

export interface FlagDecisionPatch {
  pieceTracked: boolean;
  pieceTrackedDecidedAt: Date;
  pieceTrackedDecidedById: string | null;
}

/**
 * Bayroqni QO'LDA o'zgartirish — bu har doim QAROR (ha ham, yo'q ham).
 *
 * Muhr bitta joydan chiqadi, chunki bayroqni o'zgartiradigan sirtlar bir
 * nechta (K2 reyestr ekrani, K6 tovar kartochkasi, K6 «hal qilinmagan»
 * ro'yxati) va biri muhrni unutsa tovar ro'yxatdan CHIQMASDAN qolardi —
 * foydalanuvchi «men aytdim-ku» deb ikkinchi marta bosardi (IS-5 klassi:
 * ish bajariladi, signal esa yolg'on gapiradi).
 */
export function buildFlagDecisionPatch(
  pieceTracked: boolean,
  actorEmployeeId: string | null,
  now: Date,
): FlagDecisionPatch {
  return {
    pieceTracked,
    pieceTrackedDecidedAt: now,
    pieceTrackedDecidedById: actorEmployeeId,
  };
}

// ---------------------------------------------------------------------------
// 4. Kunlik sverka signali (K6/5)
// ---------------------------------------------------------------------------

/** Signal uchun kerak bo'lgan sverka natijasining KESIMI (K1 `ReconReport`). */
export interface DigestReportLike {
  totals: {
    trackedProducts: number;
    diffBuckets: number;
    diffQty: string;
    activePieces: number;
  };
  rows: ReadonlyArray<{
    storeName: string;
    cellName: string | null;
    productName: string | null;
    diffQty: string;
    status: 'ok' | 'excess' | 'missing';
  }>;
  warnings: ReadonlyArray<{ code: string; productName: string | null; count: number }>;
}

export interface DigestSummary {
  /** Bildirishnoma yuborilsinmi. */
  shouldNotify: boolean;
  title: string;
  body: string;
  diffBuckets: number;
  warnings: number;
}

/** Bildirishnomada ko'rsatiladigan eng katta farqlar soni. */
export const DIGEST_PREVIEW_ROWS = 3;

/**
 * Kunlik sverka natijasidan signal quradi.
 *
 * 🔴 **Farq yo'q bo'lsa BILDIRISHNOMA HAM YO'Q.** Har kuni «farq yo'q» degan
 * xabar yuborish signalni «bo'ri keldi» ga aylantirardi (G3 hisobotidagi
 * H2/H3 ogohlantirishi bilan AYNI xato-klass) va ikkinchi haftada hech kim
 * qaramay qo'yardi. Jimlik — «hammasi joyida» degani; hisobotning O'ZI
 * (`/reports/piece-reconciliation`) istalgan payt ochiladi.
 *
 * Ogohlantirishlar (`pieces-without-flag`, `invalid-piece`) ham signal
 * beradi: ular «farq» ustunida ko'rinmaydi, lekin reyestr haqiqatdan
 * uzilganini bildiradi.
 */
export function summarizePieceDigest(report: DigestReportLike): DigestSummary {
  const diffBuckets = report.totals.diffBuckets;
  const warnings = report.warnings.reduce((acc, w) => acc + w.count, 0);
  const shouldNotify = diffBuckets > 0 || warnings > 0;

  const preview = report.rows
    .filter((r) => r.status !== 'ok')
    .slice(0, DIGEST_PREVIEW_ROWS)
    .map((r) => {
      const where = r.cellName ? `${r.storeName} · ${r.cellName}` : r.storeName;
      return `${r.productName ?? '—'} (${where}): ${r.diffQty}`;
    });

  const parts: string[] = [];
  if (preview.length > 0) parts.push(preview.join(' · '));
  if (diffBuckets > preview.length) parts.push(`+${diffBuckets - preview.length}`);
  if (warnings > 0) parts.push(`ogohlantirish: ${warnings}`);

  return {
    shouldNotify,
    title: `📏 Bo'lak sverkasi: ${diffBuckets} ta farq`,
    body: parts.join(' · '),
    diffBuckets,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 5. Signalni KIM oladi
// ---------------------------------------------------------------------------

/** `role_permissions` qatori (rol → xodim bog'lanishi bilan birga o'qiladi). */
export interface DigestRoleGrant {
  employeeId: string;
  scope: string;
}

/** `employee_permissions` qatori — xodim darajasidagi OVERRIDE (u G'OLIB). */
export interface DigestOverride {
  employeeId: string;
  scope: string;
}

/**
 * Kunlik signalning qabul qiluvchilari — `piecetracking` ni KO'RA oladigan
 * xodimlar (amalda katta omborchi + egasi/menejer, K-Q9).
 *
 * Ruxsat modeli (MK26): rol qatlami → xodim OVERRIDE qatlami G'OLIB, va
 * `scope = 'NO'` override'i «yozuv yo'q» EMAS, «ataylab taqiqlangan». Ya'ni
 * roli bergan, lekin shaxsan taqiqlangan xodim signalni OLMASLIGI kerak —
 * aks holda tizim unga ko'rsatmaydigan ekrandagi farq haqida xabar berardi.
 *
 * Natija BARQAROR (saralangan): testlar tartibga tayanadi.
 */
export function resolveDigestRecipients(input: {
  roleGrants: readonly DigestRoleGrant[];
  overrides: readonly DigestOverride[];
}): string[] {
  const allowed = new Set<string>();
  for (const g of input.roleGrants) {
    if (g.scope && g.scope !== 'NO') allowed.add(g.employeeId);
  }
  for (const o of input.overrides) {
    if (o.scope && o.scope !== 'NO') allowed.add(o.employeeId);
    else allowed.delete(o.employeeId);
  }
  return [...allowed].sort();
}
