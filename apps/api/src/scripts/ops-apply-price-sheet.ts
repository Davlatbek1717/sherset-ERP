#!/usr/bin/env tsx
/**
 * OPS (idempotent): egasining Excel jamlanmasidan tovar NARXLARINI qo'yadi va
 * QIZIL belgilangan tovarlarni saytdan olib tashlaydi.
 *
 * Egasi, 2026-08-19: «shu faylda hamma tovarlarni to'g'ri narxlari kiritilgan…
 * optom narxi, xarid qilingan narxi, sotilish narxi — hammasini shu bilan bir
 * xil qilib to'g'irlab ber. Qizil bilan qilingan tovarlarni esa saytdan
 * o'chirib tashla».
 *
 * MANBA USTUNLARI (Лист1):
 *   2  UUID              → `products.external_code` (prodda XOM UUID — `ms:` YO'Q)
 *   9  Sotilish narxi    → `sale_prices[]` «Розничная цена» qavati
 *   11 Optom narx        → `sale_prices[]` «Оптовая цена» qavati
 *   13 Закупочная цена   → `products.buy_price`
 *   5  Наименование      → QIZIL to'ldirish (FFFF0000) = o'chiriladigan tovar
 *
 * 🔴 O'LCHANGAN SHARTNOMALAR (taxmin emas, prodda tekshirilgan):
 *   · Kalit `external_code` = xom MoySklad UUID (5064/5064 shu shaklda);
 *     [[moysklad-product-key-is-raw-uuid]] — `ms:` prefiksi bilan qidirilsa
 *     BIRORTA ham mos kelmaydi.
 *   · Excel qiymati SO'Mda, baza TIYINda ⇒ ×100 (namuna bilan tasdiqlangan:
 *     410 000 so'm ↔ 41 000 000).
 *   · Narx qavatlari NOM bo'yicha topiladi (`Розничная цена` / `Оптовая цена`),
 *     tartibga TAYANMAYMIZ — bir kun qo'shilgan uchinchi qavat siljitardi.
 *   · O'chirish = `deleted_at` (yumshoq) — ilovaning O'Z «O'chirish» tugmasi
 *     ayni shuni qiladi (`product.service.ts` → `softDelete`), ro'yxat/detal
 *     `deleted_at is null` bo'yicha filtrlaydi. Qattiq DELETE mumkin emas:
 *     tovar hujjatlarda (savdo/qabul/qoldiq) FK bilan bog'langan va tarix
 *     yo'qolardi.
 *
 * XAVFSIZLIK:
 *   · sukut — DRY-RUN; yozish uchun `--apply`;
 *   · faqat FARQI BOR qatorga UPDATE yuboriladi (idempotent, ikkinchi yugurish 0);
 *   · valyutasi «сум» bo'lmagan qator bo'lsa — BALAND OVOZDA to'xtaydi;
 *   · bazada topilmagan UUID jimgina o'tkazilmaydi — sanaladi va ro'yxatlanadi.
 *
 * Yugurtirish (apps/api ichidan):
 *   set -a; . .env; set +a; npx tsx src/scripts/ops-apply-price-sheet.ts --file=/tmp/narxlar.xlsx
 *   set -a; . .env; set +a; npx tsx src/scripts/ops-apply-price-sheet.ts --file=/tmp/narxlar.xlsx --apply
 */
import { PrismaClient } from '@moysklad/db';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FILE = process.argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);

const RED_ARGB = 'FFFF0000';
const COL = {
  uuid: 2,
  kind: 3,
  code: 4,
  name: 5,
  sale: 9,
  saleCur: 10,
  optom: 11,
  optomCur: 12,
  buy: 13,
  buyCur: 14,
};
const RETAIL_NAME = 'Розничная цена';
const WHOLESALE_NAME = 'Оптовая цена';

interface SheetRow {
  row: number;
  uuid: string;
  code: string | null;
  name: string;
  /** Tiyin. `null` = katakcha BO'SH (tegilmaydi), `0` = ataylab nol. */
  sale: bigint | null;
  optom: bigint | null;
  buy: bigint | null;
  red: boolean;
}

interface UsdStat {
  sale: number;
  optom: number;
  buy: number;
  rows: number;
  sample: string[];
}

interface SalePrice {
  priceTypeId: string;
  value: string;
  currencyCode?: string;
}

/** Faylda uchraydigan valyutalar. Boshqasi — BALAND OVOZDA xato. */
const CUR_UZS = new Set(['', 'сум', 'сўм', 'uzs']);
const CUR_USD = new Set(['доллар', 'usd']);

/**
 * Manba qiymati → TIYIN.
 * Dollarli katakcha so'mga o'giriladi (egasi, 2026-08-19: «dollar tovarlarni ham
 * so'mga o'tkazib hisoblashi kerak»). Kurs — KASSA ishlatadigan ayni kurs
 * (`getRate()`: eng oxirgi MANUAL qator CBRU'dan ustun), ya'ni katalogdagi narx
 * bilan kassadagi hisob bir manbadan. Yaxlitlash: butun tiyingacha, bir marta.
 */
function convertMinor(v: unknown, currency: string, usdRate: number): bigint | null {
  const base = toMinor(v);
  if (base === null) return null;
  if (CUR_UZS.has(currency)) return base;
  if (CUR_USD.has(currency)) return BigInt(Math.round(Number(base) * usdRate));
  throw new Error(`Noma'lum valyuta: ${currency}`);
}

/** So'm → tiyin. «85000,00», 95000, formula-natijasi — hammasi bir yo'ldan. */
function toMinor(v: unknown): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  let raw: unknown = v;
  if (typeof raw === 'object' && raw !== null && 'result' in (raw as Record<string, unknown>)) {
    raw = (raw as { result: unknown }).result;
  }
  if (typeof raw === 'number') return BigInt(Math.round(raw * 100));
  const s = String(raw).replace(/[\s ]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Narxni o'qib bo'lmadi: ${JSON.stringify(v)}`);
  return BigInt(Math.round(n * 100));
}

function isRed(cell: ExcelJS.Cell): boolean {
  const f = cell.fill as ExcelJS.FillPattern | undefined;
  return f?.type === 'pattern' && f.fgColor?.argb === RED_ARGB;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'result' in (v as unknown as Record<string, unknown>)) {
    return String((v as { result: unknown }).result ?? '');
  }
  return String(v).trim();
}

async function readSheet(
  path: string,
  usdRate: number,
): Promise<{ rows: SheetRow[]; usd: UsdStat }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Birinchi varaq topilmadi');
  const rows: SheetRow[] = [];
  const usd: UsdStat = { sale: 0, optom: 0, buy: 0, rows: 0, sample: [] };
  const badCurrency: string[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const uuid = cellText(row.getCell(COL.uuid));
    if (!uuid) continue;
    const cur = {
      sale: cellText(row.getCell(COL.saleCur)).toLowerCase(),
      optom: cellText(row.getCell(COL.optomCur)).toLowerCase(),
      buy: cellText(row.getCell(COL.buyCur)).toLowerCase(),
    };
    for (const [k, v] of Object.entries(cur)) {
      if (!CUR_UZS.has(v) && !CUR_USD.has(v)) badCurrency.push(`R${r}.${k}:${v}`);
      else if (CUR_USD.has(v)) usd[k as keyof typeof cur]++;
    }
    if (Object.values(cur).some((v) => CUR_USD.has(v))) {
      usd.rows++;
      if (usd.sample.length < 5) {
        const which = (Object.entries(cur).find(([, v]) => CUR_USD.has(v)) ?? ['', ''])[0];
        const col = which === 'sale' ? COL.sale : which === 'optom' ? COL.optom : COL.buy;
        usd.sample.push(
          `${cellText(row.getCell(COL.name)).slice(0, 26).padEnd(28)} ${which}: ${cellText(row.getCell(col))}`,
        );
      }
    }
    rows.push({
      row: r,
      uuid,
      code: cellText(row.getCell(COL.code)) || null,
      name: cellText(row.getCell(COL.name)),
      sale: convertMinor(row.getCell(COL.sale).value, cur.sale, usdRate),
      optom: convertMinor(row.getCell(COL.optom).value, cur.optom, usdRate),
      buy: convertMinor(row.getCell(COL.buy).value, cur.buy, usdRate),
      red: isRed(row.getCell(COL.name)) || isRed(row.getCell(COL.uuid)),
    });
  }
  if (badCurrency.length > 0) {
    // Jim konvertatsiya QILINMAYDI: noma'lum valyutali narx so'm deb yozilsa
    // katalog bo'ylab yolg'on raqam tarqalardi.
    throw new Error(
      `Noma'lum valyuta (${badCurrency.length}): ${badCurrency.slice(0, 5).join(', ')}`,
    );
  }
  const dup = rows.length - new Set(rows.map((x) => x.uuid)).size;
  if (dup > 0) throw new Error(`Faylda ${dup} ta takroriy UUID — kalit noaniq`);
  return { rows, usd };
}

/** Qavatni o'rniga qo'yadi; valyutani mavjudidan (yoki qo'shnisidan) oladi. */
function withTier(list: SalePrice[], priceTypeId: string, minor: bigint): SalePrice[] {
  const out = list.map((p) => ({ ...p }));
  const i = out.findIndex((p) => p.priceTypeId === priceTypeId);
  const currency = out[i]?.currencyCode ?? out.find((p) => p.currencyCode)?.currencyCode ?? 'UZS';
  const next: SalePrice = { priceTypeId, value: minor.toString(), currencyCode: currency };
  if (i >= 0) out[i] = next;
  else out.push(next);
  return out;
}

function tierValue(list: SalePrice[], priceTypeId: string): bigint | null {
  const hit = list.find((p) => p.priceTypeId === priceTypeId);
  if (!hit) return null;
  try {
    return BigInt(hit.value);
  } catch {
    return null;
  }
}

async function main() {
  if (!FILE) throw new Error('--file=<xlsx yo`li> ko`rsatilmagan');
  console.log(APPLY ? 'REJIM: APPLY (yoziladi)\n' : 'REJIM: DRY-RUN (hech nima yozilmaydi)\n');

  const accounts = await prisma.account.findMany({ select: { id: true } });
  if (accounts.length !== 1) throw new Error(`Kutilgan 1 akkaunt, topildi ${accounts.length}`);
  const accountId = accounts[0]?.id as string;

  const types = await prisma.priceType.findMany({
    where: { accountId },
    select: { id: true, name: true, isDefault: true, position: true },
  });
  const retail = types.find((t) => t.name === RETAIL_NAME);
  const wholesale = types.find((t) => t.name === WHOLESALE_NAME);
  if (!retail || !wholesale) {
    throw new Error(`Narx turlari topilmadi (bor: ${types.map((t) => t.name).join(', ')})`);
  }
  console.log(`narx turlari: «${retail.name}» ${retail.id} · «${wholesale.name}» ${wholesale.id}`);

  // Kurs — KASSA ishlatadigan ayni manba: eng oxirgi MANUAL qator (bo'lmasa
  // eng oxirgi kunlik qator). `exchange-rate.service.ts` → `getRate()` bilan
  // BIR XIL tartib; ikkinchi nusxa yozilsa katalog kassadan ayrilardi.
  const rateArg = process.argv.find((a) => a.startsWith('--usd-rate='));
  let usdRate: number;
  if (rateArg) {
    usdRate = Number(rateArg.slice('--usd-rate='.length));
    if (!Number.isFinite(usdRate) || usdRate <= 0) throw new Error('--usd-rate qiymati xato');
    console.log(`USD kursi (qo'lda berilgan): ${usdRate}`);
  } else {
    const manual = await prisma.exchangeRate.findFirst({
      where: { currency: 'USD', source: 'MANUAL', date: { lte: new Date() } },
      orderBy: { date: 'desc' },
      select: { rate: true, date: true, source: true },
    });
    const row =
      manual ??
      (await prisma.exchangeRate.findFirst({
        where: { currency: 'USD', date: { lte: new Date() } },
        orderBy: { date: 'desc' },
        select: { rate: true, date: true, source: true },
      }));
    if (!row) throw new Error('USD kursi topilmadi — --usd-rate= bilan bering');
    usdRate = Number(row.rate);
    console.log(
      `USD kursi: ${usdRate} (${row.source}, ${row.date.toISOString().slice(0, 10)}) — kassa ham AYNI shu kursni o'qiydi`,
    );
  }

  const { rows: sheet, usd } = await readSheet(FILE, usdRate);
  const red = sheet.filter((r) => r.red);
  const keep = sheet.filter((r) => !r.red);
  console.log(`fayl: ${sheet.length} qator — qizil ${red.length}, qolgan ${keep.length}`);
  console.log(
    `dollarli katakcha → so'mga o'girildi: ${usd.sale + usd.optom + usd.buy} ta (${usd.rows} tovarda) — sotilish ${usd.sale} · optom ${usd.optom} · xarid ${usd.buy}`,
  );
  for (const x of usd.sample) console.log(`    ${x}`);
  console.log('');

  const dbRows = await prisma.product.findMany({
    where: { accountId },
    select: {
      id: true,
      name: true,
      externalCode: true,
      buyPrice: true,
      salePrices: true,
      deletedAt: true,
      archived: true,
    },
  });
  const byKey = new Map(
    dbRows.filter((p) => p.externalCode).map((p) => [p.externalCode as string, p]),
  );
  console.log(
    `baza: ${dbRows.length} tovar (o'chirilgan ${dbRows.filter((p) => p.deletedAt).length})`,
  );

  // ── FAZA 1: moslik ────────────────────────────────────────────────────────
  const missing = sheet.filter((r) => !byKey.has(r.uuid));
  const inDbNotInSheet = dbRows.filter(
    (p) => p.deletedAt == null && p.externalCode && !sheet.some((r) => r.uuid === p.externalCode),
  );
  console.log('\n── FAZA 1 · MOSLIK ──');
  console.log(`  mos keldi          : ${sheet.length - missing.length}`);
  console.log(
    `  bazada YO'Q        : ${missing.length}${
      missing.length
        ? ` (${missing
            .slice(0, 3)
            .map((m) => m.name)
            .join(' · ')}…)`
        : ''
    }`,
  );
  console.log(`  bazada bor, faylda YO'Q: ${inDbNotInSheet.length} — TEGILMAYDI`);

  // ── FAZA 2: narxlar (qizil bo'lmaganlar) ──────────────────────────────────
  interface Change {
    id: string;
    name: string;
    buy?: bigint;
    prices?: SalePrice[];
    what: string[];
  }
  const changes: Change[] = [];
  let zeroSale = 0;
  for (const r of keep) {
    const p = byKey.get(r.uuid);
    if (!p) continue;
    const cur = (
      Array.isArray(p.salePrices) ? (p.salePrices as unknown as SalePrice[]) : []
    ).filter((x) => x && typeof x.priceTypeId === 'string');
    let next = cur;
    const what: string[] = [];
    if (r.sale !== null && tierValue(cur, retail.id) !== r.sale) {
      next = withTier(next, retail.id, r.sale);
      what.push('sotilish');
      if (r.sale === 0n) zeroSale++;
    }
    if (r.optom !== null && tierValue(next, wholesale.id) !== r.optom) {
      next = withTier(next, wholesale.id, r.optom);
      what.push('optom');
    }
    const buyChanged = r.buy !== null && p.buyPrice !== r.buy;
    if (buyChanged) what.push('xarid');
    if (what.length === 0) continue;
    changes.push({
      id: p.id,
      name: p.name,
      ...(buyChanged && r.buy !== null ? { buy: r.buy } : {}),
      ...(next !== cur ? { prices: next } : {}),
      what,
    });
  }
  const cnt = (k: string) => changes.filter((c) => c.what.includes(k)).length;
  console.log('\n── FAZA 2 · NARXLAR ──');
  console.log(`  o'zgaradigan tovar : ${changes.length}`);
  console.log(
    `    · sotilish narxi : ${cnt('sotilish')}${zeroSale ? `  (shundan 0 so'm: ${zeroSale})` : ''}`,
  );
  console.log(`    · optom narxi    : ${cnt('optom')}`);
  console.log(`    · xarid narxi    : ${cnt('xarid')}`);
  for (const c of changes.slice(0, 5))
    console.log(`      ${c.name.slice(0, 40).padEnd(42)} ${c.what.join('+')}`);

  // ── FAZA 3: qizil tovarlar ────────────────────────────────────────────────
  const toDelete = red
    .map((r) => byKey.get(r.uuid))
    .filter((p): p is NonNullable<typeof p> => p != null && p.deletedAt == null);
  console.log('\n── FAZA 3 · QIZIL TOVARLAR (saytdan olib tashlanadi) ──');
  console.log(`  faylda qizil       : ${red.length}`);
  console.log(`  bazada tirik       : ${toDelete.length} → deleted_at qo'yiladi`);
  console.log(`  allaqachon yo'q    : ${red.length - toDelete.length}`);
  for (const p of toDelete.slice(0, 5)) console.log(`      ${p.name.slice(0, 50)}`);

  if (!APPLY) {
    console.log('\n(DRY-RUN — hech nima yozilmadi. Yozish uchun `--apply`.)');
    return;
  }

  // ── YOZISH ────────────────────────────────────────────────────────────────
  let done = 0;
  for (let i = 0; i < changes.length; i += 200) {
    const chunk = changes.slice(i, i + 200);
    await prisma.$transaction(
      chunk.map((c) =>
        prisma.product.update({
          where: { id: c.id },
          data: {
            ...(c.buy !== undefined ? { buyPrice: c.buy } : {}),
            ...(c.prices !== undefined ? { salePrices: c.prices as unknown as object } : {}),
          },
        }),
      ),
    );
    done += chunk.length;
    if (done % 1000 === 0 || done === changes.length)
      console.log(`  narx yangilandi: ${done}/${changes.length}`);
  }

  const now = new Date();
  let del = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const chunk = toDelete.slice(i, i + 200);
    const res = await prisma.product.updateMany({
      where: { id: { in: chunk.map((p) => p.id) }, deletedAt: null },
      data: { deletedAt: now },
    });
    del += res.count;
  }
  console.log(`  o'chirildi (yumshoq): ${del}/${toDelete.length}`);

  // ── Tekshiruv ─────────────────────────────────────────────────────────────
  const after = await prisma.product.count({ where: { accountId, deletedAt: null } });
  console.log(`\n── NATIJA ── saytda ko'rinadigan tovar: ${after}`);
}

main()
  .catch((e) => {
    console.error('XATO:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
