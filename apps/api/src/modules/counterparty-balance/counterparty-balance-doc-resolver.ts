/**
 * BALANS-HUJJAT RESOLVERI — jurnal qatoridan («docType + docId») hujjatning
 * ko'rsatiladigan atributlariga (raqam, sana, shartnoma, tovar qatorlari).
 *
 * NEGA ALOHIDA MODUL (Faza 10, audit `DUP-06` tavsiyasi: «barcha
 * rekonstruksiyalarni bitta shared balance-doc-registry modulidan olish —
 * bitta ro'yxat, N iste'molchi»):
 *
 * Akt-sverka va statement qatorlarida hujjat RAQAMI va SANASI ko'rinishi kerak,
 * jurnalda esa faqat identifikator bor. Ilgari har o'quvchi buni o'z hujjat-
 * ro'yxati bilan hal qilardi — va o'sha ro'yxat AYNI PAYTDA saldoni ham
 * belgilar edi, ya'ni ro'yxatdan tushib qolgan tur → NOTO'G'RI SALDO.
 *
 * Endi bu ikki mas'uliyat ajratilgan:
 *   · SALDO   — har doim jurnaldan (`counterparty-balance-journal.util.ts`),
 *               docType ro'yxatiga UMUMAN bog'liq emas;
 *   · YORLIQ  — shu resolverdan. Bu yerda tur qo'shilmagan bo'lsa qator baribir
 *               chiqadi, faqat `number: null` bilan («—»).
 *
 * Ya'ni ro'yxatni unutishning eng yomon oqibati endi «raqamsiz qator», ilgarigi
 * «jimgina yo'qolgan saldo» emas. Bu — ataylab tanlangan degradatsiya yo'li.
 */

import { computePositionTotal } from '@moysklad/money';

/** Tovar qatorining aktdagi ko'rinishi (statement `StatementItem` bilan bir xil shakl). */
export interface BalanceDocItem {
  name: string;
  quantity: string;
  /**
   * O'lchov birligi («шт», «м»…). 2026-08-16 da qo'shildi: mijozga Telegramda
   * yuboriladigan «hisob-kitob cheki» tovar qatorini «3 dona» ko'rinishida
   * chizadi. IXTIYORIY — eski iste'molchilar (Excel) o'zgarmaydi.
   */
  uom?: string | null;
  priceMinor: bigint;
  discountPercent?: string;
  sumMinor: bigint;
}

export interface ResolvedBalanceDoc {
  /** Hujjat raqami («СЧ-2026-00001»). `null` ⇒ hujjat topilmadi / turi noma'lum. */
  number: string | null;
  /** Hujjatning O'Z sanasi. `null` ⇒ chaqiruvchi jurnal `createdAt` ini ishlatadi. */
  moment: Date | null;
  /** Shartnoma filtri uchun. `null` ⇒ hujjatda shartnoma o'lchovi yo'q. */
  contractId: string | null;
  /** Tovar qatorlari (faqat `withItems` so'ralganda va faqat tovar hujjatlarida). */
  items: BalanceDocItem[];
}

export interface BalanceDocRef {
  docType: string;
  docId: string | null;
}

/** `Map` kaliti — jurnal qatoridan bir xil usulda quriladi. */
export function docKey(docType: string, docId: string | null): string {
  return `${docType}|${docId ?? ''}`;
}

/* ------------------------------------------------------------------ *
 * Prisma delegatlarining struktural tiplari.
 * Har turdagi hujjat alohida Prisma modeli, lekin bu yerda kerakli
 * maydonlar to'plami bir xil — shuning uchun ular ustidan sikl yuriladi.
 * ------------------------------------------------------------------ */

interface FlatDocRow {
  id: string;
  name: string;
  moment: Date;
  contractId: string | null;
}
interface FlatDelegate {
  findMany(args: {
    where: { accountId: string; id: { in: string[] } };
    select: { id: true; name: true; moment: true; contractId: true };
  }): Promise<FlatDocRow[]>;
}

interface GoodsPositionRow {
  quantity: unknown;
  priceMinor: bigint;
  discount: unknown;
  vat: number | null;
  vatEnabled: boolean;
  product: { name: string; uom?: string | null } | null;
}
interface GoodsDocRow extends FlatDocRow {
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: GoodsPositionRow[];
}
interface GoodsDelegate {
  findMany(args: {
    where: { accountId: string; id: { in: string[] } };
    select: Record<string, unknown>;
  }): Promise<GoodsDocRow[]>;
}

/**
 * Resolver ishlatadigan Prisma modellari. Struktural tip — `PrismaService.client`
 * ham, skriptdagi `PrismaClient` ham to'g'ri keladi.
 */
export interface BalanceDocClient {
  invoiceOut: unknown;
  invoiceIn: unknown;
  supply: unknown;
  purchaseReturn: unknown;
  salesReturn: unknown;
  paymentIn: unknown;
  paymentOut: unknown;
  cashIn: unknown;
  cashOut: unknown;
  prepayment: unknown;
  prepaymentReturn: unknown;
  counterpartyAdjustment: unknown;
  debt: {
    findMany(args: {
      where: { accountId: string; id: { in: string[] } };
      select: { id: true; name: true; createdAt: true };
    }): Promise<Array<{ id: string; name: string; createdAt: Date }>>;
  };
  debtPayment: {
    findMany(args: {
      where: {
        accountId: string;
        OR: Array<{ id: { in: string[] } } | { batchId: { in: string[] } }>;
      };
      select: {
        id: true;
        batchId: true;
        createdAt: true;
        debt: { select: { name: true } };
      };
    }): Promise<
      Array<{ id: string; batchId: string | null; createdAt: Date; debt: { name: string } }>
    >;
  };
  retailSale: {
    findMany(args: {
      where: { accountId: string; id: { in: string[] } };
      select: { id: true; name: true; moment: true };
    }): Promise<Array<{ id: string; name: string; moment: Date }>>;
  };
  /** G1 — `returnPayout` yorlig'i (ВВ- raqami) shu jadvaldan o'qiladi. */
  retailDrawerCashOut: {
    findMany(args: {
      where: { accountId: string; id: { in: string[] } };
      select: { id: true; name: true; moment: true };
    }): Promise<Array<{ id: string; name: string; moment: Date }>>;
  };
  /** A1 — `customerPrepay` yorlig'i (АВ- raqami) shu jadvaldan o'qiladi. */
  retailDrawerCashIn: {
    findMany(args: {
      where: { accountId: string; id: { in: string[] } };
      select: { id: true; name: true; moment: true };
    }): Promise<Array<{ id: string; name: string; moment: Date }>>;
  };
}

// `purchaseReturn` — Faza 13 (`PP-02`). `salesReturn` — P14 (`H1`). `invoiceIn`
// TARIXIY qatorlar uchun qoladi (Faza 13 dan keyin yangi qator yozilmaydi,
// eskilarining raqami baribir ko'rinishi kerak). docType qiymati Prisma delegat
// nomi bilan bir xil bo'lishi SHART — pastdagi sikl `client[t]` bilan indekslaydi.
const GOODS_TYPES = ['invoiceOut', 'invoiceIn', 'supply', 'purchaseReturn', 'salesReturn'] as const;
const FLAT_TYPES = [
  'paymentIn',
  'paymentOut',
  'cashIn',
  'cashOut',
  'prepayment',
  'prepaymentReturn',
  'adjustment',
] as const;

/** `docType` → Prisma model nomi (`adjustment` bundan mustasno — model nomi boshqa). */
const FLAT_MODEL: Record<(typeof FLAT_TYPES)[number], keyof BalanceDocClient> = {
  paymentIn: 'paymentIn',
  paymentOut: 'paymentOut',
  cashIn: 'cashIn',
  cashOut: 'cashOut',
  prepayment: 'prepayment',
  prepaymentReturn: 'prepaymentReturn',
  adjustment: 'counterpartyAdjustment',
};

const GOODS_SELECT = {
  id: true,
  name: true,
  moment: true,
  contractId: true,
  vatEnabled: true,
  vatIncluded: true,
  positions: {
    orderBy: { position: 'asc' as const },
    select: {
      quantity: true,
      priceMinor: true,
      discount: true,
      vat: true,
      vatEnabled: true,
      product: { select: { name: true, uom: true } },
    },
  },
} as const;

const FLAT_SELECT = { id: true, name: true, moment: true, contractId: true } as const;

/**
 * Pozitsiya summasi — hujjatni POST QILGAN mantiq bilan aynan bir xil
 * (`computePositionTotal`: avval chegirma, keyin QQS, aniq BigInt). Boshqa
 * formula ishlatilsa akt qatorlari hujjatning o'z summasiga yig'ilmasdi.
 */
function itemsOf(d: GoodsDocRow): BalanceDocItem[] {
  return d.positions.map((p) => ({
    name: p.product?.name ?? '(tovar)',
    quantity: String(p.quantity ?? ''),
    uom: p.product?.uom ?? null,
    priceMinor: p.priceMinor,
    discountPercent: String(p.discount ?? '0'),
    sumMinor: computePositionTotal(
      {
        quantity: String(p.quantity ?? '0'),
        priceMinor: String(p.priceMinor),
        discount: String(p.discount ?? '0'),
        vat: p.vat ?? null,
      },
      d.vatEnabled && p.vatEnabled,
      d.vatIncluded,
    ).totalMinor,
  }));
}

/**
 * Jurnal qatorlari uchun hujjat atributlarini TO'PLAB (turi bo'yicha bitta
 * so'rov) qaytaradi. N+1 yo'q: har docType uchun bitta `IN (…)` so'rovi.
 *
 * `withItems` — faqat statement Excel'iga kerak (tovar qatorlari); akt-sverka
 * uni so'ramaydi, shuning uchun pozitsiyalar yuklanmaydi.
 */
export async function resolveBalanceDocs(
  client: BalanceDocClient,
  accountId: string,
  refs: readonly BalanceDocRef[],
  opts: { withItems?: boolean } = {},
): Promise<Map<string, ResolvedBalanceDoc>> {
  const byType = new Map<string, Set<string>>();
  for (const r of refs) {
    if (!r.docId) continue;
    let set = byType.get(r.docType);
    if (!set) {
      set = new Set();
      byType.set(r.docType, set);
    }
    set.add(r.docId);
  }

  const out = new Map<string, ResolvedBalanceDoc>();
  const jobs: Promise<void>[] = [];

  for (const t of GOODS_TYPES) {
    const ids = byType.get(t);
    if (!ids?.size) continue;
    const delegate = client[t] as GoodsDelegate;
    jobs.push(
      delegate
        .findMany({
          where: { accountId, id: { in: [...ids] } },
          select: opts.withItems ? GOODS_SELECT : FLAT_SELECT,
        })
        .then((rows) => {
          for (const d of rows) {
            out.set(docKey(t, d.id), {
              number: d.name,
              moment: d.moment,
              contractId: d.contractId,
              items: opts.withItems ? itemsOf(d) : [],
            });
          }
        }),
    );
  }

  for (const t of FLAT_TYPES) {
    const ids = byType.get(t);
    if (!ids?.size) continue;
    const delegate = client[FLAT_MODEL[t]] as FlatDelegate;
    jobs.push(
      delegate
        .findMany({ where: { accountId, id: { in: [...ids] } }, select: FLAT_SELECT })
        .then((rows) => {
          for (const d of rows) {
            out.set(docKey(t, d.id), {
              number: d.name,
              moment: d.moment,
              contractId: d.contractId,
              items: [],
            });
          }
        }),
    );
  }

  const debtIds = byType.get('debt');
  if (debtIds?.size) {
    jobs.push(
      client.debt
        .findMany({
          where: { accountId, id: { in: [...debtIds] } },
          select: { id: true, name: true, createdAt: true },
        })
        .then((rows) => {
          for (const d of rows) {
            // Qarz kartochkasida `moment` yo'q — ochilgan payt hujjat sanasi.
            out.set(docKey('debt', d.id), {
              number: d.name,
              moment: d.createdAt,
              contractId: null,
              items: [],
            });
          }
        }),
    );
  }

  jobs.push(resolveDebtPayments(client, accountId, byType.get('debtpayment'), out));

  // G1 — vozvrat puli hujjati (ВВ- raqami). Topilmasa qator raqamsiz chiqadi
  // (resolverning ataylab tanlangan degradatsiya yo'li — saldoga ta'sir yo'q).
  //
  // 🔴 A3 (2026-08-25): AVANS QAYTARISH hujjati (ВА- raqami) AYNI jadvalda
  // yashaydi (`kind='prepay_refund'`), lekin turi ATAYLAB boshqa — biri
  // vozvratga bog'langan pul, ikkinchisi mijozning o'z avansi. Shuning uchun
  // sikl ikki tur bo'yicha yuradi, so'rov esa har turga bittadan.
  for (const cashOutDocType of ['returnPayout', 'customerPrepayRefund'] as const) {
    const payoutIds = byType.get(cashOutDocType);
    if (!payoutIds?.size) continue;
    jobs.push(
      client.retailDrawerCashOut
        .findMany({
          where: { accountId, id: { in: [...payoutIds] } },
          select: { id: true, name: true, moment: true },
        })
        .then((rows) => {
          for (const d of rows) {
            out.set(docKey(cashOutDocType, d.id), {
              number: d.name,
              moment: d.moment,
              contractId: null,
              items: [],
            });
          }
        }),
    );
  }

  // A1 — mijoz avansi hujjati (АВ- raqami). `returnPayout` ning kirim
  // tomonidagi ko'zgusi; topilmasa qator raqamsiz chiqadi.
  const prepayIds = byType.get('customerPrepay');
  if (prepayIds?.size) {
    jobs.push(
      client.retailDrawerCashIn
        .findMany({
          where: { accountId, id: { in: [...prepayIds] } },
          select: { id: true, name: true, moment: true },
        })
        .then((rows) => {
          for (const d of rows) {
            out.set(docKey('customerPrepay', d.id), {
              number: d.name,
              moment: d.moment,
              contractId: null,
              items: [],
            });
          }
        }),
    );
  }

  // A2 — `salePrepay` (avansdan to'lov) AYNI jadvaldan o'qiladi: hujjat o'sha
  // chek. Turlar esa ATAYLAB ajratilgan (qarz ≠ avans sarfi) — shuning uchun
  // bu yerda ikkala tur uchun ham qator yoziladi, so'rov esa BITTA.
  for (const saleDocType of ['retailsale', 'salePrepay'] as const) {
    const saleIds = byType.get(saleDocType);
    if (!saleIds?.size) continue;
    jobs.push(
      client.retailSale
        .findMany({
          where: { accountId, id: { in: [...saleIds] } },
          select: { id: true, name: true, moment: true },
        })
        .then((rows) => {
          for (const d of rows) {
            out.set(docKey(saleDocType, d.id), {
              number: d.name,
              moment: d.moment,
              contractId: null,
              items: [],
            });
          }
        }),
    );
  }

  await Promise.all(jobs);
  return out;
}

/**
 * `debtpayment` — YAGONA ASIMMETRIK tur (Faza 9 hisobotida ochiq qoldirilgan
 * qarz). `docId` uchta manbadan biri bo'lishi mumkin:
 *   1. `DebtPayment.id`   — qarz-modul yo'li, to'lov id'si ma'lum bo'lganda;
 *   2. `DebtPayment.batchId` — POS yo'li (bitta jismoniy to'lov FIFO bo'yicha
 *      N qarzga bo'linadi, PKO cheki esa BITTA hujjat);
 *   3. `Debt.id`          — delta to'lovlar YIG'INDISIDAN kelgan holat
 *      (`recalc` aniq to'lovni bilmaydi), qarz kartochkasi id'si.
 *
 * Uchalasi ham bir xil yorliq beradi (QRZ- raqami), shuning uchun ketma-ket
 * qidiriladi va topilmagani keyingi manbaga o'tadi. Bu — YORLIQ yo'li; saldo
 * bunga bog'liq emas (jurnal deltasi baribir sanaladi).
 */
async function resolveDebtPayments(
  client: BalanceDocClient,
  accountId: string,
  ids: Set<string> | undefined,
  out: Map<string, ResolvedBalanceDoc>,
): Promise<void> {
  if (!ids?.size) return;
  const list = [...ids];
  const rows = await client.debtPayment.findMany({
    where: { accountId, OR: [{ id: { in: list } }, { batchId: { in: list } }] },
    select: { id: true, batchId: true, createdAt: true, debt: { select: { name: true } } },
  });
  const put = (id: string, name: string, moment: Date) => {
    const k = docKey('debtpayment', id);
    // Birinchi (eng erta) qator sanani beradi — batch bir necha qatordan iborat.
    if (!out.has(k)) out.set(k, { number: name, moment, contractId: null, items: [] });
  };
  for (const p of rows) {
    if (ids.has(p.id)) put(p.id, p.debt.name, p.createdAt);
    if (p.batchId && ids.has(p.batchId)) put(p.batchId, p.debt.name, p.createdAt);
  }
  const leftover = list.filter((id) => !out.has(docKey('debtpayment', id)));
  if (!leftover.length) return;
  const debts = await client.debt.findMany({
    where: { accountId, id: { in: leftover } },
    select: { id: true, name: true, createdAt: true },
  });
  for (const d of debts) put(d.id, d.name, d.createdAt);
}
