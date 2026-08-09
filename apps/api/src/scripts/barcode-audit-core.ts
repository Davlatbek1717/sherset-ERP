/**
 * `DB-04` — barcode dublikat/normalizatsiya O'LCHOVI (faqat o'qish).
 *
 * ══ NEGA BU FAYL BOR ══
 * Faza 25 `products_barcodes_gin_idx` (GIN `array_ops`) ni qo'ydi, lekin
 * hisobotning DEFER-1 bandi o'lchov bilan ko'rsatdi: POS-skanning `LIMIT 1`
 * yo'lida planner GIN'ni TANLAMAYDI — Postgres massiv `@>` uchun default
 * 0.005 selektivlik beradi, «erta chiqish» bilan seq scan arzonroq ko'rinadi.
 * Haqiqiy yechim — barcode UNIQUE/normalizatsiya (teng-qidiruvli btree yo'li).
 * Lekin unique indeksni mavjud dublikatlar ustiga qo'yish **prodda deploy'ni
 * yiqitadi**, shuning uchun avval o'lchov kerak: nechta dublikat bor, qaysi
 * turdagi, normalizatsiya YANGI to'qnashuv yaratadimi.
 *
 * Bu modul — o'sha o'lchovning **sof (DB'siz) yadrosi**, unit-test bilan
 * qulflangan. Yuguruvchi qobiq: `audit-barcode-duplicates.ts`.
 *
 * ⛔ Bu yerda YOZUV yo'li YO'Q va bo'lmasligi kerak (`barcode-audit-core.test.ts`
 *    dagi Proxy-qulf `findMany` dan boshqa har qanday metodda halok bo'ladi).
 */

/** Qiymat qaysi jadvaldan kelgani — POS lookup ikkalasiga ham qaraydi. */
export const BARCODE_OWNER = {
  /** `Product.barcodes String[]` — asosiy POS skan yo'li (`barcodes: { has: tok }`). */
  product: 'product',
  /** `Variant.barcode String?` + `Variant.barcodes String[]`. */
  variant: 'variant',
  /** `ProductPack.barcode String?` — quti/TASNIF shtrix-kodi (`packs: { some: { barcode } }`). */
  pack: 'pack',
  /** `Consignment.barcodes String[]` — partiya yorlig'i. */
  consignment: 'consignment',
} as const;
export type BarcodeOwnerKind = (typeof BARCODE_OWNER)[keyof typeof BARCODE_OWNER];

/** Bir shtrix-kod qiymati + uning egasi. */
export interface BarcodeRow {
  accountId: string;
  kind: BarcodeOwnerKind;
  /** Egasining o'z id'si (product/variant/pack/consignment). */
  ownerId: string;
  /**
   * POS skani PIROVARDIDA qaysi tovarga olib boradi. Dublikat zararli bo'ladimi
   * yoki yo'qmi — aynan shu hal qiladi (bir tovarning ikki yozuvida bir xil kod
   * turishi kassirga bir xil natija beradi; ikki XIL tovarda esa noaniqlik).
   * `ProductPack.productId` nullable ⇒ null bo'lsa egasining o'zi nishon.
   */
  productId: string | null;
  name: string;
  /** Massivdagi indeks (`Product.barcodes[i]`) yoki 0 — skalyar ustunlar uchun. */
  slot: number;
  raw: string;
}

export const BARCODE_FLAG = {
  blank: 'blank',
  outerSpace: 'outer-space',
  innerSpace: 'inner-space',
  control: 'control-char',
  lowercase: 'lowercase',
  nonDigit: 'non-digit',
  leadingZero: 'leading-zero',
  oddLength: 'odd-length',
  checksumBad: 'checksum-bad',
} as const;
export type BarcodeFlag = (typeof BARCODE_FLAG)[keyof typeof BARCODE_FLAG];

export const DUP_SCOPE = {
  /** Bitta yozuvning O'ZIDA takrorlangan (masalan `barcodes: ['X','X']`). */
  self: 'self',
  /** Turli yozuvlar, LEKIN bir tovar (tovar + varianti / ikki variant). */
  intraProduct: 'intra-product',
  /** Turli tovarlar — POS skani noaniq; unique indeksni AYNAN shu bloklaydi. */
  crossProduct: 'cross-product',
} as const;
export type DupScope = (typeof DUP_SCOPE)[keyof typeof DUP_SCOPE];

export interface NormalizedBarcode {
  raw: string;
  /** Probel/boshqaruv belgilaridan tozalangan + UPPERCASE. */
  normalized: string;
  /** `normalized` + faqat-raqamli qiymatda yetakchi nollar tushirilgan (GTIN-8/12/13/14 bir xil tovar). */
  canonical: string;
  blank: boolean;
  digitsOnly: boolean;
  /** GTIN uzunligi bo'lmasa `null` ⇒ nazorat raqami tekshirilmaydi. */
  checksumOk: boolean | null;
  flags: BarcodeFlag[];
}

/**
 * Ko'rinmas/boshqaruv belgilar: C0/C1 boshqaruv, NBSP, zero-width, BOM,
 * yo'nalish markerlari. Skaner-drayverlar va Excel-import aynan shularni
 * qiymat ichiga qo'shib yuboradi — ekranda ko'rinmaydi, lekin teng-solishtiruvni buzadi.
 */
const INVISIBLE_SRC = '[\u0000-\u001f\u007f-\u009f\u00a0\u200b-\u200f\u2028\u2029\ufeff]';
const INVISIBLE_G = new RegExp(INVISIBLE_SRC, 'g');
const INVISIBLE_TEST = new RegExp(INVISIBLE_SRC);
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** GTIN nazorat raqami (EAN-8/UPC-12/EAN-13/GTIN-14 — bitta qoida). */
export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = payload.length - 1; i >= 0; i--) {
    sum += Number(payload[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeBarcode(raw: string): NormalizedBarcode {
  const flags = new Set<BarcodeFlag>();
  if (INVISIBLE_TEST.test(raw)) flags.add(BARCODE_FLAG.control);

  const stripped = raw.replace(INVISIBLE_G, '');
  const trimmed = stripped.trim();
  if (trimmed !== stripped) flags.add(BARCODE_FLAG.outerSpace);

  const noSpace = trimmed.replace(/\s+/g, '');
  if (noSpace !== trimmed) flags.add(BARCODE_FLAG.innerSpace);

  const normalized = noSpace.toUpperCase();
  if (normalized !== noSpace) flags.add(BARCODE_FLAG.lowercase);

  const blank = normalized.length === 0;
  if (blank) flags.add(BARCODE_FLAG.blank);

  const digitsOnly = !blank && /^\d+$/.test(normalized);
  if (!blank && !digitsOnly) flags.add(BARCODE_FLAG.nonDigit);

  // Yetakchi nol: `012345678905` (UPC-12) va `0012345678905` (EAN-13) — BIR
  // GTIN. Skaner qaysi simvologiyani o'qiganiga qarab turlicha yuborishi
  // mumkin, ya'ni ular ayni tovarning ikki yozuvi bo'lishi normal.
  let canonical = normalized;
  if (digitsOnly) {
    canonical = normalized.replace(/^0+/, '');
    if (canonical === '') canonical = '0';
    if (canonical !== normalized) flags.add(BARCODE_FLAG.leadingZero);
  }

  let checksumOk: boolean | null = null;
  if (digitsOnly) {
    if (GTIN_LENGTHS.has(normalized.length)) {
      checksumOk = gtinCheckDigit(normalized.slice(0, -1)) === Number(normalized.at(-1));
      if (!checksumOk) flags.add(BARCODE_FLAG.checksumBad);
    } else {
      flags.add(BARCODE_FLAG.oddLength);
    }
  }

  return {
    raw,
    normalized,
    canonical: blank ? '' : canonical,
    blank,
    digitsOnly,
    checksumOk,
    flags: [...flags],
  };
}

export interface DupGroup {
  accountId: string;
  key: string;
  scope: DupScope;
  /** Nechta qator shu kalitga tushdi. */
  rows: number;
  /** Nechta HAR XIL tovarga olib boradi (>1 ⇒ unique-bloker). */
  targets: number;
  members: Array<{ kind: BarcodeOwnerKind; ownerId: string; name: string; raw: string }>;
}

export interface LevelStats {
  /** Dublikat guruhlari soni (bir kalit, ≥2 qator). */
  groups: number;
  /** Guruhlarga tushgan qatorlar soni. */
  rows: number;
  byScope: Record<DupScope, number>;
}

export interface BarcodeAuditReport {
  scannedRows: number;
  /** Umumiy bo'sh (faqat-probel/ko'rinmas) qiymatlar. */
  blank: number;
  distinctRawValues: number;
  distinctCanonicalValues: number;
  byFlag: Record<BarcodeFlag, number>;
  byOwner: Record<BarcodeOwnerKind, number>;
  /** Xom qiymat bo'yicha to'qnashuvlar — HOZIRGI holat. */
  raw: LevelStats;
  /** Probel/registr normalizatsiyasidan KEYIN. */
  normalized: LevelStats;
  /** + yetakchi-nol kanonizatsiyasidan keyin (eng agressiv variant). */
  canonical: LevelStats;
  /** Normalizatsiya YARATADIGAN yangi guruhlar (xom darajada yo'q edi). */
  normalizedOnlyGroups: number;
  /** Kanonizatsiya qo'shadigan yangi guruhlar (normalized darajada ham yo'q edi). */
  canonicalOnlyGroups: number;
  /**
   * Kanonik darajadagi KROSS-MAHSULOT guruhlari — `@@unique([accountId, barcode])`
   * ni qo'yishdan oldin qo'lda hal qilinishi SHART bo'lgan holatlar soni.
   */
  uniqueIndexBlockers: number;
  samples: {
    crossProduct: string[];
    intraProduct: string[];
    self: string[];
    normalizedOnly: string[];
    flagged: string[];
  };
}

const emptyScope = (): Record<DupScope, number> => ({
  [DUP_SCOPE.self]: 0,
  [DUP_SCOPE.intraProduct]: 0,
  [DUP_SCOPE.crossProduct]: 0,
});

/** Qator qaysi tovarga olib boradi (pack'da `productId` bo'lmasligi mumkin). */
const targetOf = (r: BarcodeRow): string => r.productId ?? `${r.kind}:${r.ownerId}`;

function groupsFor(
  rows: readonly BarcodeRow[],
  keyOf: (i: number) => string,
): Map<string, BarcodeRow[]> {
  const map = new Map<string, BarcodeRow[]>();
  rows.forEach((r, i) => {
    const k = keyOf(i);
    if (k === '') return; // blank — dublikat sifatida sanalmaydi
    const full = `${r.accountId}|${k}`;
    const cur = map.get(full);
    if (cur) cur.push(r);
    else map.set(full, [r]);
  });
  for (const [k, v] of map) if (v.length < 2) map.delete(k);
  return map;
}

function classify(members: readonly BarcodeRow[]): { scope: DupScope; targets: number } {
  const targets = new Set(members.map(targetOf));
  if (targets.size > 1) return { scope: DUP_SCOPE.crossProduct, targets: targets.size };
  const owners = new Set(members.map((m) => `${m.kind}:${m.ownerId}`));
  return {
    scope: owners.size > 1 ? DUP_SCOPE.intraProduct : DUP_SCOPE.self,
    targets: targets.size,
  };
}

function toGroups(map: Map<string, BarcodeRow[]>): DupGroup[] {
  const out: DupGroup[] = [];
  for (const [full, members] of map) {
    const sep = full.indexOf('|');
    const { scope, targets } = classify(members);
    out.push({
      accountId: full.slice(0, sep),
      key: full.slice(sep + 1),
      scope,
      rows: members.length,
      targets,
      members: members.map((m) => ({
        kind: m.kind,
        ownerId: m.ownerId,
        name: m.name,
        raw: m.raw,
      })),
    });
  }
  return out;
}

function statsOf(groups: readonly DupGroup[]): LevelStats {
  const byScope = emptyScope();
  let rows = 0;
  for (const g of groups) {
    byScope[g.scope]++;
    rows += g.rows;
  }
  return { groups: groups.length, rows, byScope };
}

const describeGroup = (g: DupGroup): string =>
  `«${g.key}» ×${g.rows} → ${g.targets} tovar: ${g.members
    .slice(0, 4)
    .map((m) => `${m.kind}:${m.name}${m.raw === g.key ? '' : ` (xom: «${m.raw}»)`}`)
    .join(' | ')}`;

export function buildBarcodeReport(
  rows: readonly BarcodeRow[],
  sampleLimit = 10,
): BarcodeAuditReport {
  const norm = rows.map((r) => normalizeBarcode(r.raw));

  const byFlag = Object.fromEntries(Object.values(BARCODE_FLAG).map((f) => [f, 0])) as Record<
    BarcodeFlag,
    number
  >;
  const byOwner = Object.fromEntries(Object.values(BARCODE_OWNER).map((k) => [k, 0])) as Record<
    BarcodeOwnerKind,
    number
  >;
  for (let i = 0; i < rows.length; i++) {
    byOwner[rows[i]!.kind]++;
    for (const f of norm[i]!.flags) byFlag[f]++;
  }

  const rawGroups = toGroups(groupsFor(rows, (i) => (norm[i]!.blank ? '' : rows[i]!.raw)));
  const normGroups = toGroups(groupsFor(rows, (i) => norm[i]!.normalized));
  const canonGroups = toGroups(groupsFor(rows, (i) => norm[i]!.canonical));

  // «Yangi» guruh = shu darajada paydo bo'lgan, oldingi darajada mavjud
  // bo'lmagan to'qnashuv. Kalitlar darajalar orasida boshqacha bo'lgani uchun
  // solishtirish A'ZOLAR to'plami bo'yicha ketadi.
  const sig = (g: DupGroup) =>
    `${g.accountId}#${g.members
      .map((m) => `${m.kind}:${m.ownerId}:${m.raw}`)
      .sort()
      .join(',')}`;
  const rawSigs = new Set(rawGroups.map(sig));
  const normSigs = new Set(normGroups.map(sig));
  const normalizedOnly = normGroups.filter((g) => !rawSigs.has(sig(g)));
  const canonicalOnly = canonGroups.filter((g) => !normSigs.has(sig(g)) && !rawSigs.has(sig(g)));

  const pick = (gs: readonly DupGroup[], scope: DupScope) =>
    gs
      .filter((g) => g.scope === scope)
      .slice(0, sampleLimit)
      .map(describeGroup);

  const flagged: string[] = [];
  for (let i = 0; i < rows.length && flagged.length < sampleLimit; i++) {
    const n = norm[i]!;
    const real = n.flags.filter((f) => f !== BARCODE_FLAG.oddLength && f !== BARCODE_FLAG.nonDigit);
    if (real.length > 0)
      flagged.push(
        `${rows[i]!.kind}:${rows[i]!.name} «${n.raw}» → «${n.normalized}» [${real.join(',')}]`,
      );
  }

  return {
    scannedRows: rows.length,
    blank: norm.filter((n) => n.blank).length,
    distinctRawValues: new Set(rows.filter((_, i) => !norm[i]!.blank).map((r) => r.raw)).size,
    distinctCanonicalValues: new Set(norm.filter((n) => !n.blank).map((n) => n.canonical)).size,
    byFlag,
    byOwner,
    raw: statsOf(rawGroups),
    normalized: statsOf(normGroups),
    canonical: statsOf(canonGroups),
    normalizedOnlyGroups: normalizedOnly.length,
    canonicalOnlyGroups: canonicalOnly.length,
    uniqueIndexBlockers: canonGroups.filter((g) => g.scope === DUP_SCOPE.crossProduct).length,
    samples: {
      crossProduct: pick(canonGroups, DUP_SCOPE.crossProduct),
      intraProduct: pick(canonGroups, DUP_SCOPE.intraProduct),
      self: pick(canonGroups, DUP_SCOPE.self),
      normalizedOnly: normalizedOnly.slice(0, sampleLimit).map(describeGroup),
      flagged,
    },
  };
}

// ══ DB tomoni — FAQAT `findMany` ══════════════════════════════════════════

interface ReadOnlyDelegate<T> {
  findMany(args: unknown): Promise<T[]>;
}
/**
 * Prisma mijozining shu skriptga kerak bo'lgan **faqat-o'qish** kesimi.
 * Ataylab tor: yozuv metodlari tipda umuman yo'q, ya'ni `create`/`update`
 * qo'shish typecheck'da ham, testdagi Proxy-qulfda ham darhol ko'rinadi.
 */
export interface BarcodeAuditDb {
  product: ReadOnlyDelegate<{
    id: string;
    accountId: string;
    name: string;
    barcodes: string[];
  }>;
  variant: ReadOnlyDelegate<{
    id: string;
    accountId: string;
    productId: string;
    name: string;
    barcode: string | null;
    barcodes: string[];
  }>;
  productPack: ReadOnlyDelegate<{
    id: string;
    accountId: string;
    productId: string | null;
    barcode: string | null;
  }>;
  consignment: ReadOnlyDelegate<{
    id: string;
    accountId: string;
    productId: string;
    name: string;
    barcodes: string[];
  }>;
}

export interface BarcodeAuditOptions {
  /** Bitta akkauntni o'lchash (prod'da ko'p-akkaunt bo'lsa). */
  accountId?: string;
  sampleLimit?: number;
}

/** Barcode saqlanadigan 4 joyni o'qib, sof yadroga uzatadi. HECH NARSA YOZMAYDI. */
export async function runBarcodeAudit(
  db: BarcodeAuditDb,
  opts: BarcodeAuditOptions = {},
): Promise<BarcodeAuditReport> {
  const acc = opts.accountId ? { accountId: opts.accountId } : {};
  const rows: BarcodeRow[] = [];

  // `deletedAt` filtri ATAYLAB yo'q: unique indeks soft-delete qilingan
  // qatorlarni ham qamraydi (Postgres qisman indekssiz ularni ajratmaydi),
  // shuning uchun o'lchov ham ularni ko'rishi kerak.
  const products = await db.product.findMany({
    where: { ...acc, NOT: { barcodes: { isEmpty: true } } },
    select: { id: true, accountId: true, name: true, barcodes: true },
  });
  for (const p of products) {
    p.barcodes.forEach((raw, slot) =>
      rows.push({
        accountId: p.accountId,
        kind: BARCODE_OWNER.product,
        ownerId: p.id,
        productId: p.id,
        name: p.name,
        slot,
        raw,
      }),
    );
  }

  const variants = await db.variant.findMany({
    where: {
      ...acc,
      OR: [{ NOT: { barcodes: { isEmpty: true } } }, { barcode: { not: null } }],
    },
    select: {
      id: true,
      accountId: true,
      productId: true,
      name: true,
      barcode: true,
      barcodes: true,
    },
  });
  for (const v of variants) {
    const seen: string[] = [];
    if (v.barcode) seen.push(v.barcode);
    seen.push(...v.barcodes);
    seen.forEach((raw, slot) =>
      rows.push({
        accountId: v.accountId,
        kind: BARCODE_OWNER.variant,
        ownerId: v.id,
        productId: v.productId,
        name: v.name,
        slot,
        raw,
      }),
    );
  }

  const packs = await db.productPack.findMany({
    where: { ...acc, barcode: { not: null } },
    select: { id: true, accountId: true, productId: true, barcode: true },
  });
  for (const p of packs) {
    if (!p.barcode) continue;
    rows.push({
      accountId: p.accountId,
      kind: BARCODE_OWNER.pack,
      ownerId: p.id,
      productId: p.productId,
      name: `pack ${p.id.slice(0, 8)}`,
      slot: 0,
      raw: p.barcode,
    });
  }

  const consignments = await db.consignment.findMany({
    where: { ...acc, NOT: { barcodes: { isEmpty: true } } },
    select: { id: true, accountId: true, productId: true, name: true, barcodes: true },
  });
  for (const c of consignments) {
    c.barcodes.forEach((raw, slot) =>
      rows.push({
        accountId: c.accountId,
        kind: BARCODE_OWNER.consignment,
        ownerId: c.id,
        productId: c.productId,
        name: c.name,
        slot,
        raw,
      }),
    );
  }

  return buildBarcodeReport(rows, opts.sampleLimit);
}
