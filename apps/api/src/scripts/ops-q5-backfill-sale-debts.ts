#!/usr/bin/env tsx
/**
 * Q5 — TARIXIY KASSA QARZLARINI UNDIRISH REYESTRIGA OLIB KIRISH (2026-08-25).
 *
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q5.
 * Hodisa-saboqlari: `docs/plans/2026-08-24-split-kassa-hodisasi.md` (qoida 12, 13).
 *
 * ── Nima qiladi ───────────────────────────────────────────────────────────
 * Q2 (2026-08-25) dan OLDIN post qilingan, qarzga sotilgan cheklarning HALI
 * QOLGAN qarzi uchun `Debt` reyestriga `balanceAdopted = true` qator ochadi —
 * ya'ni **balansga bir tiyin ham yozmaydi**, faqat allaqachon mavjud qarzni
 * KO'RINADIGAN qiladi (undirish ro'yxati, qo'ng'iroq jadvali, eslatma oqimi).
 *
 * Butun QOIDA sof modulda: `q5-backfill-plan.ts` (bazasiz, testda muzlatilgan).
 * Bu fayl — faqat I/O va hisobot.
 *
 * ── Xavfsizlik (qoida 7 · 11 · 12) ────────────────────────────────────────
 *   · **DRY-RUN default** — yozish uchun `APPLY=1` kerak;
 *   · `LIMIT` va `ONLY_CP` — bosqichma-bosqich yuritish (1 kontragent → 10 →
 *     qolgani). Reja §Q5 aynan shu tartibni talab qiladi;
 *   · **IDEMPOTENT** — `Debt.sourceDocId` bo'yicha qatori bor chek chetlab
 *     o'tiladi, yozuv esa `createMany({ skipDuplicates })` (Q2 ning `ON
 *     CONFLICT DO NOTHING` sabog'i: `create` + `P2002` tranzaksiyani ABORT
 *     qiladi);
 *   · **TESKARI YO'L** — `ops-q5-backfill-rollback.ts`, AYNAN shu
 *     yugurishning `RUN` yorlig'i bo'yicha (qoida 12);
 *   · **BALANSGA TEGMAYDI** — `applyDelta` bu fayldan CHAQIRILMAYDI
 *     (invariant 1). Yagona yozuv: `debts` + `debt_notes` + hujjat raqami.
 *
 * ── Yuritish ──────────────────────────────────────────────────────────────
 *   # 1. O'LCHASH (hech narsa yozmaydi)
 *   pnpm --filter @moysklad/api exec tsx src/scripts/ops-q5-backfill-sale-debts.ts
 *
 *   # 2. BITTA kontragent (jonlida BIRINCHI qadam — reja qabul mezoni 3)
 *   APPLY=1 ONLY_CP=<uuid> RUN=2026-08-26-01 pnpm --filter @moysklad/api exec \
 *     tsx src/scripts/ops-q5-backfill-sale-debts.ts
 *
 *   # 3. Bosqichma-bosqich qolgani
 *   APPLY=1 LIMIT=10 RUN=2026-08-26-02 …
 *   APPLY=1 RUN=2026-08-26-03 …
 *
 * Box'da (VPS):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-q5-backfill-sale-debts.ts
 *
 * ── ⚠️ OLDSHART ───────────────────────────────────────────────────────────
 * `20260825120000_debt_source_doc` migratsiyasi (Q1) bazada BERILGAN bo'lishi
 * SHART — skript `debts.source_doc_type/source_doc_id` ustunlariga yozadi.
 * Berilmagan bo'lsa skript birinchi so'rovdayoq tushunarli xato bilan
 * to'xtaydi (`preflight()`).
 */
import { PrismaClient } from '@moysklad/db';
import {
  DEBT_LEDGER_CURRENCY,
  DEFAULT_SALE_DEBT_TERM_DAYS,
  SALE_DEBT_SOURCE_DOC_TYPE,
} from '../modules/debt/sale-debt-registry.js';
import { CASHIER_EVENT } from '../modules/retail-sale/cashier-audit.js';
import { TENDER } from '../modules/retail-sale/retail-tenders.js';
import { allocateDocumentNumber } from '../prisma/document-number.js';
import {
  type Q5CounterpartyInput,
  type Q5Receipt,
  Q5_DEFAULT_MAX_STAIRCASE_DAYS,
  Q5_DEFAULT_STEP_DAYS,
  Q5_DEFAULT_STEP_ROWS,
  planQ5Backfill,
} from './q5-backfill-plan.js';

const prisma = new PrismaClient();

const APPLY = process.env.APPLY === '1';
const ONLY_CP = process.env.ONLY_CP || undefined;
const LIMIT = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : undefined;
const TERM_DAYS = process.env.TERM_DAYS
  ? Number.parseInt(process.env.TERM_DAYS, 10)
  : DEFAULT_SALE_DEBT_TERM_DAYS;
const STEP_ROWS = process.env.STEP_ROWS
  ? Number.parseInt(process.env.STEP_ROWS, 10)
  : Q5_DEFAULT_STEP_ROWS;
const STEP_DAYS = process.env.STEP_DAYS
  ? Number.parseInt(process.env.STEP_DAYS, 10)
  : Q5_DEFAULT_STEP_DAYS;
const MAX_STAIRCASE_DAYS = process.env.MAX_STAIRCASE_DAYS
  ? Number.parseInt(process.env.MAX_STAIRCASE_DAYS, 10)
  : Q5_DEFAULT_MAX_STAIRCASE_DAYS;

/**
 * Yugurish yorlig'i — izoh matniga tushadi va TESKARI skriptning manzili
 * bo'ladi. Berilmasa sana (UTC) olinadi; bir kunda ikki yugurish bo'lsa
 * `RUN=` ni QO'LDA bering, aks holda rollback ikkalasini birga o'chiradi.
 */
const RUN_ID = process.env.RUN || new Date().toISOString().slice(0, 10);

/**
 * Post qilingan chek holatlari — `recompute-counterparty-balances.ts` bilan
 * AYNAN bir xil to'plam (ikki joyda ikki ta'rif bo'lsa, biri bir kun
 * jimgina eskirardi).
 */
const POSTED_SALE_STATES = ['posted', 'refunded'] as const;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function som(minor: bigint): string {
  return `${(minor / 100n).toLocaleString('ru-RU')} so'm`;
}

/** `SOLD_ON_CREDIT` payload'idan kontragent — recompute skripti bilan bir xil. */
function readEventAgentId(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'agentId' in payload) {
    const v = (payload as { agentId?: unknown }).agentId;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/**
 * Qarz KIMGA yozilganini audit hodisasidan o'qish.
 *
 * 🔴 `RetailSale.agentId` YETARLI EMAS: `post()` chek qatoridagi `agentId` ni
 * faqat u BO'SH bo'lsa to'ldiradi, ya'ni chekda boshqa kontragent turgan va
 * to'lov payload'ida boshqasi yuborilgan holatda DAFTARGA payload'dagi
 * yozilgan. Backfill chek qatoridan yursa qarzni BOSHQA mijozga ochib
 * qo'yardi — jonli ma'lumotda bu tuzatib bo'lmaydigan xato.
 * (`recompute-counterparty-balances.ts#loadCreditEventAgents` bilan AYNI qoida.)
 */
async function loadCreditAgents(saleIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const chunk of chunked([...new Set(saleIds)], 500)) {
    const events = await prisma.cashierAuditEvent.findMany({
      where: { type: CASHIER_EVENT.soldOnCredit, docId: { in: chunk } },
      orderBy: { createdAt: 'asc' },
      select: { docId: true, payload: true },
    });
    for (const e of events) {
      const agentId = readEventAgentId(e.payload);
      if (e.docId && agentId) out.set(e.docId, agentId);
    }
  }
  return out;
}

/** Q1 migratsiyasi berilganini tekshiradi — aks holda tushunarli xato. */
async function preflight(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n
    FROM information_schema.columns
    WHERE table_name = 'debts' AND column_name IN ('source_doc_type', 'source_doc_id')
  `;
  const n = Number(rows[0]?.n ?? 0n);
  if (n < 2) {
    throw new Error(
      [
        "🔴 `debts.source_doc_type` / `source_doc_id` ustunlari bazada YO'Q.",
        'Q1 migratsiyasi berilmagan — backfill ishlay olmaydi.',
        'Avval: prisma db execute --file packages/db/prisma/migrations/' +
          '20260825120000_debt_source_doc/migration.sql',
        'so`ng: prisma migrate resolve --applied 20260825120000_debt_source_doc',
      ].join('\n'),
    );
  }
}

interface RawReceipt {
  accountId: string;
  saleId: string;
  saleName: string;
  postedAt: Date;
  counterpartyId: string;
  debtAmountMinor: bigint;
}

/** Barcha tarixiy qarz-cheklarini yig'adi (mijozi hal qilingan holda). */
async function collectReceipts(): Promise<RawReceipt[]> {
  // Qarz ulushi AYNAN `DEBT` tender qatorida turibdi — u `applyDelta` olgan
  // qiymat bilan BIR tranzaksiyada, kassa valyutasida yozilgan
  // (`recompute-counterparty-balances.ts` ning `retail-credit` manbasi).
  //
  // ⚠️ `currency` — reyestr valyutasi bo'yicha filtrlanadi: Q2 USD yashiqda
  // qator OCHMAYDI (§2.3 chegarasi), backfill ham ochmasligi shart, aks holda
  // ikki yo'l ikki xil haqiqat yozardi.
  const lines = await prisma.retailSalePayment.findMany({
    where: {
      method: TENDER.debt,
      currency: DEBT_LEDGER_CURRENCY,
      sale: { state: { in: [...POSTED_SALE_STATES] }, refundedFromId: null, deletedAt: null },
    },
    select: {
      accountId: true,
      saleId: true,
      amountMinor: true,
      sale: { select: { name: true, agentId: true, postedAt: true, moment: true } },
    },
  });
  if (lines.length === 0) return [];

  const agents = await loadCreditAgents(lines.map((l) => l.saleId));

  // Bir chekda bir nechta `DEBT` qatori bo'lishi nazariy mumkin — yig'amiz.
  const byId = new Map<string, RawReceipt>();
  const orphans: string[] = [];
  for (const l of lines) {
    if (l.amountMinor <= 0n) continue;
    const counterpartyId = agents.get(l.saleId) ?? l.sale.agentId;
    if (!counterpartyId) {
      // `post()` mijozsiz qarzga sotuvni rad etadi ⇒ bu holat bo'lmasligi
      // kerak. Bo'lsa — qator KIMGA ochilishi noma'lum; jimgina davom etish
      // «qarzni tasodifiy mijozga yozish» degani bo'lardi.
      orphans.push(`${l.sale.name} (${l.saleId})`);
      continue;
    }
    const prev = byId.get(l.saleId);
    if (prev) {
      prev.debtAmountMinor += l.amountMinor;
      continue;
    }
    byId.set(l.saleId, {
      accountId: l.accountId,
      saleId: l.saleId,
      saleName: l.sale.name,
      postedAt: l.sale.postedAt ?? l.sale.moment,
      counterpartyId,
      debtAmountMinor: l.amountMinor,
    });
  }
  if (orphans.length > 0) {
    throw new Error(
      [
        "🔴 Qarzga sotilgan, lekin MIJOZI aniqlanmagan chek(lar) — backfill to'xtadi:",
        ...orphans.map((s) => `  · ${s}`),
        'Chekka mijozni biriktiring (RetailSale.agentId) yoki qarzni qo`lda tuzating.',
      ].join('\n'),
    );
  }
  return [...byId.values()];
}

/** Har chekdan QAYTARILGAN qarz ulushi (mirror cheklarning yig'indisi). */
async function collectReturned(saleIds: readonly string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  for (const chunk of chunked(saleIds, 500)) {
    const mirrors = await prisma.retailSale.findMany({
      where: {
        refundedFromId: { in: chunk },
        debtReturnMinor: { gt: 0 },
        state: { in: [...POSTED_SALE_STATES] },
        deletedAt: null,
      },
      select: { refundedFromId: true, debtReturnMinor: true },
    });
    for (const m of mirrors) {
      if (!m.refundedFromId) continue;
      out.set(m.refundedFromId, (out.get(m.refundedFromId) ?? 0n) + m.debtReturnMinor);
    }
  }
  return out;
}

/** Reyestrda allaqachon qatori bor cheklar (`sourceDocId`). */
async function collectRegistered(saleIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const chunk of chunked(saleIds, 500)) {
    const rows = await prisma.debt.findMany({
      where: { sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE, sourceDocId: { in: chunk } },
      select: { sourceDocId: true },
    });
    for (const r of rows) if (r.sourceDocId) out.add(r.sourceDocId);
  }
  return out;
}

async function main() {
  console.log('═'.repeat(78));
  console.log('Q5 — tarixiy kassa qarzlarini undirish reyestriga olib kirish');
  console.log(
    `rejim: ${APPLY ? '🔴 APPLY (YOZADI)' : '🟢 DRY-RUN (hech narsa yozilmaydi)'}` +
      ` | RUN=${RUN_ID}` +
      (ONLY_CP ? ` | ONLY_CP=${ONLY_CP}` : '') +
      (LIMIT !== undefined ? ` | LIMIT=${LIMIT}` : ''),
  );
  console.log(
    `muddat: ${TERM_DAYS} kun | zinapoya: har ${STEP_ROWS} qatorda +${STEP_DAYS} kun ` +
      `(maks ${MAX_STAIRCASE_DAYS} kun)`,
  );
  console.log('═'.repeat(78));

  await preflight();

  const receipts = await collectReceipts();
  if (receipts.length === 0) {
    console.log('Qarzga sotilgan chek topilmadi — qiladigan ish yo`q.');
    return;
  }
  const saleIds = receipts.map((r) => r.saleId);
  const returned = await collectReturned(saleIds);
  const registered = await collectRegistered(saleIds);

  // Kontragent kesimi. `ONLY_CP` shu yerda qo'llanadi — o'lchash (cap) ham
  // faqat o'sha mijoz bo'yicha bo'lishi kerak.
  const byCp = new Map<string, { accountId: string; receipts: Q5Receipt[] }>();
  for (const r of receipts) {
    if (ONLY_CP && r.counterpartyId !== ONLY_CP) continue;
    const bucket = byCp.get(r.counterpartyId) ?? { accountId: r.accountId, receipts: [] };
    bucket.receipts.push({
      saleId: r.saleId,
      saleName: r.saleName,
      postedAt: r.postedAt,
      debtAmountMinor: r.debtAmountMinor,
      debtReturnedMinor: returned.get(r.saleId) ?? 0n,
      alreadyRegistered: registered.has(r.saleId),
    });
    byCp.set(r.counterpartyId, bucket);
  }
  if (byCp.size === 0) {
    console.log('Berilgan filtr bo`yicha kontragent topilmadi.');
    return;
  }

  // Balans va reyestr qoldig'i — kontragent kesimida.
  const cpIds = [...byCp.keys()];
  const names = new Map(
    (
      await prisma.counterparty.findMany({
        where: { id: { in: cpIds } },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name]),
  );
  const balances = new Map(
    (
      await prisma.counterpartyBalance.findMany({
        where: { counterpartyId: { in: cpIds }, currency: DEBT_LEDGER_CURRENCY },
        select: { counterpartyId: true, balanceMinor: true },
      })
    ).map((b) => [b.counterpartyId, b.balanceMinor]),
  );
  const openDebts = await prisma.debt.findMany({
    where: {
      counterpartyId: { in: cpIds },
      deletedAt: null,
      status: { notIn: ['paid', 'cancelled'] },
    },
    select: { counterpartyId: true, totalMinor: true, paidMinor: true },
  });
  const outstanding = new Map<string, bigint>();
  for (const d of openDebts) {
    const rest = d.totalMinor - d.paidMinor;
    if (rest > 0n) {
      outstanding.set(d.counterpartyId, (outstanding.get(d.counterpartyId) ?? 0n) + rest);
    }
  }

  const inputs: Q5CounterpartyInput[] = cpIds
    // Tartib DETERMINISTIK — ikki DRY-RUN bir xil ro'yxat bersin (egasi
    // tasdiqlagan ro'yxat `--apply` da o'zgarmasin).
    .sort()
    .map((id) => ({
      counterpartyId: id,
      counterpartyName: names.get(id) ?? '(nomsiz)',
      balanceMinor: balances.has(id) ? (balances.get(id) as bigint) : null,
      registryOutstandingMinor: outstanding.get(id) ?? 0n,
      receipts: byCp.get(id)?.receipts ?? [],
    }));

  const now = new Date();
  const plan = planQ5Backfill(
    inputs,
    {
      now,
      termDays: TERM_DAYS,
      stepRows: STEP_ROWS,
      stepDays: STEP_DAYS,
      maxStaircaseDays: MAX_STAIRCASE_DAYS,
      ...(LIMIT !== undefined ? { limitRows: LIMIT } : {}),
    },
    RUN_ID,
  );

  // ── O'LCHASH (reja §Q5 vazifa 1) ────────────────────────────────────────
  const oldest = receipts.reduce(
    (min, r) => (r.postedAt < min ? r.postedAt : min),
    receipts[0]?.postedAt ?? now,
  );
  const skippedCounts = new Map<string, number>();
  for (const p of plan.plans) {
    for (const s of p.skipped) {
      skippedCounts.set(s.reason, (skippedCounts.get(s.reason) ?? 0) + 1);
    }
  }

  console.log('\n── O`LCHOV ────────────────────────────────────────────────────');
  console.log(`qarzga sotilgan chek (jami)        : ${receipts.length}`);
  console.log(`eng eski chek                      : ${oldest.toISOString()}`);
  console.log(`kontragent (filtrdan keyin)        : ${inputs.length}`);
  console.log(`  · balansi o'lchanmagan (chetlab) : ${plan.unmeasuredCounterparties}`);
  console.log(
    `  · reyestrdan tashqari qarzi yo'q  : ${
      plan.plans.filter((p) => p.skipReason === 'no-unregistered-debt').length
    }`,
  );
  console.log(`OCHILADIGAN QATOR                  : ${plan.totalRows}`);
  console.log(`OCHILADIGAN JAMI SUMMA             : ${som(plan.totalMinor)}`);
  if (plan.truncatedRows > 0) {
    console.log(`⚠️  LIMIT tufayli kesilgan qator    : ${plan.truncatedRows}`);
  }
  for (const [reason, n] of [...skippedCounts].sort()) {
    console.log(`o'tkazib yuborilgan chek (${reason}) : ${n}`);
  }

  console.log('\n── KONTRAGENTLAR ──────────────────────────────────────────────');
  for (const p of plan.plans) {
    if (p.rows.length === 0 && p.skipReason === undefined) continue;
    const head =
      `${p.counterpartyId.slice(0, 8)}… ${p.counterpartyName}` +
      ` | cap ${som(p.capMinor)} | qator ${p.rows.length} | Σ ${som(p.allocatedMinor)}`;
    console.log(p.skipReason ? `  ⏭  ${head}  [${p.skipReason}]` : `  · ${head}`);
    for (const r of p.rows) {
      console.log(
        `        ${r.saleName}  ${som(r.totalMinor)}` +
          (r.cappedMinor > 0n ? `  (KESILDI: −${som(r.cappedMinor)})` : '') +
          `  muddat ${r.nextContactAt.toISOString().slice(0, 10)} (+${r.staircaseDays}k)`,
      );
    }
    if (p.capLeftoverMinor > 0n && p.rows.length > 0) {
      console.log(
        `        ⚠️  cap dan ${som(p.capLeftoverMinor)} taqsimlanmadi — chek yetmadi ` +
          '(boshqa hujjat manbalari: InvoiceOut / CashOut / qo`lda tuzatish)',
      );
    }
  }

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN tugadi — bazaga HECH NARSA yozilmadi.');
    console.log('   Yozish uchun: APPLY=1 RUN=<yorliq> … (avval BITTA kontragent!)');
    return;
  }

  // ── YOZISH ──────────────────────────────────────────────────────────────
  console.log('\n🔴 APPLY — yozilmoqda…');
  let written = 0;
  let skippedByIndex = 0;

  for (const p of plan.plans) {
    if (p.rows.length === 0) continue;
    const accountId = byCp.get(p.counterpartyId)?.accountId;
    if (!accountId) continue;

    // Har kontragent ALOHIDA tranzaksiyada: bittasi yiqilsa qolgani
    // yo'qolmaydi va qayta yugurish (idempotent) qolganini yozadi.
    await prisma.$transaction(async (tx) => {
      for (const row of p.rows) {
        const year = now.getFullYear();
        const prefix = `QRZ-${year}-`;
        const seq = await allocateDocumentNumber(tx, accountId, prefix, async () => {
          const last = await tx.debt.findFirst({
            where: { accountId, name: { startsWith: prefix } },
            orderBy: { name: 'desc' },
            select: { name: true },
          });
          return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
        });

        // Q2 ning `ON CONFLICT DO NOTHING` sabog'i — `create` + `P2002`
        // tranzaksiyani ABORT qilardi va kontragentning QOLGAN qatorlari ham
        // yiqilardi.
        const created = await tx.debt.createMany({
          data: [
            {
              accountId,
              counterpartyId: p.counterpartyId,
              name: `${prefix}${String(seq).padStart(5, '0')}`,
              totalMinor: row.totalMinor,
              paidMinor: 0n,
              currency: DEBT_LEDGER_CURRENCY,
              status: 'unpaid',
              // 🔴 Invariant 1 — qarz balansda ALLAQACHON bor.
              balanceAdopted: true,
              nextContactAt: row.nextContactAt,
              sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE,
              sourceDocId: row.saleId,
              // 🔴 Reja §Q5 vazifa 2: `problem: false`, `ownerId: null` —
              // javobgar keyin qo'yiladi, undirish ekrani «javobgarsiz» ni
              // ochiq ko'rsatadi.
              problem: false,
              ownerId: null,
              issuedById: null,
              comment: row.comment,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count === 0) {
          skippedByIndex++;
          continue;
        }
        const debt = await tx.debt.findFirstOrThrow({
          where: {
            accountId,
            sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE,
            sourceDocId: row.saleId,
          },
          select: { id: true },
        });
        await tx.debtNote.create({
          data: {
            accountId,
            debtId: debt.id,
            text: row.noteText,
            // Skript — odam emas. `authorId: null` ⇒ ekranda «tizim».
            authorId: null,
            authorRole: 'admin',
            kind: 'debt_issue',
          },
        });
        written++;
      }
    });
    console.log(`  ✔ ${p.counterpartyName}: ${p.rows.length} qator`);
  }

  console.log(`\n✅ Yozildi: ${written} qator`);
  if (skippedByIndex > 0) {
    console.log(`   ⏭  indeks tutdi (allaqachon bor): ${skippedByIndex}`);
  }
  console.log(`\n🔁 TESKARI YO'L (qoida 12):`);
  console.log(
    `   APPLY=1 RUN=${RUN_ID} pnpm --filter @moysklad/api exec ` +
      'tsx src/scripts/ops-q5-backfill-rollback.ts',
  );
  console.log('   (avval RUN=… bilan DRY-RUN qilib ro`yxatni ko`ring)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
