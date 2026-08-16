import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computePositionTotal } from '@moysklad/money';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  docKey,
  resolveBalanceDocs,
} from '../counterparty-balance/counterparty-balance-doc-resolver.js';
import {
  type DatedJournalEntry,
  foldJournalPeriod,
  listJournalEntries,
} from '../counterparty-balance/counterparty-balance-journal.util.js';
import { CounterpartySettlementService } from '../counterparty-settlement/counterparty-settlement.service.js';
import {
  currencyUnit,
  formatSettlementAmount,
  settlementTextForCounterparty,
  settlementTextForOwner,
} from '../counterparty-settlement/counterparty-settlement.util.js';
import { reportDateBounds } from '../report/report-date-bounds.util.js';
import { type ProductReportRow, buildProductReportXlsx } from './product-report-xlsx.util.js';
import { type RawDoc, computeStatement } from './statement-compute.util.js';
import { type SupplyGoodsRow, buildSupplyGoodsXlsx } from './supply-goods-xlsx.util.js';
import { buildStatementXlsx } from './xlsx-builder.util.js';

const STATEMENTS_DIR = process.env.STATEMENTS_DIR || join(process.cwd(), 'var', 'statements');

/**
 * Akt-sverka BIR valyutada yuritiladi — Excel sarlavhasi ham, saqlanadigan
 * `CounterpartyStatement.currency` ham `'UZS'`. Faza 10 gacha agregatsiya
 * hujjatlarni valyuta bo'yicha UMUMAN filtrlamasdi, ya'ni dollarlik hujjat
 * so'mlik running-balansga qo'shilib ketardi (mavjud, hujjatlanmagan xato).
 * Jurnal qatorida valyuta bor, shuning uchun endi filtr aniq — va aynan shu
 * «closing == materiallashgan UZS balans» invariantining sharti.
 */
const STATEMENT_CURRENCY = 'UZS';

/**
 * FAZA Q6 (`PERF-02`) — akt-sverkaning DAVR o'qi.
 *
 * `from`/`to` — sana-only chegaralar (`YYYY-MM-DD`, `z.coerce.date()` UTC yarim
 * tuniga aylantiradi). Ular Toshkent kalendar kuniga `reportDateBounds` orqali
 * ochiladi — bu yerda O'Z formulasi YOZILMAYDI (`month-bounds-label-vs-instant`
 * xotirasi: qo'lda yozilgan chegara oxirgi kunni jimgina tashlab ketadi).
 *
 * `from` bo'lmasa davr-boshi qoldig'i faqat `opening` (backfill) qatorlaridan
 * iborat bo'ladi — ya'ni davrsiz akt eski xulqni AYNAN saqlaydi va Faza 10 ning
 * «closing == materiallashgan balans» invarianti buzilmaydi.
 */
export interface StatementPeriod {
  from?: Date;
  to?: Date;
}

export interface StatementAggregateOptions extends StatementPeriod {
  /** Buyum-bo'yicha akt (balans ko'rinishi EMAS — bitta tovar kesimi). */
  productId?: string;
}

/** Davr sarlavhasi (Excel «Davr:» qatori). Sana-only ⇒ UTC bo'yicha formatlanadi. */
function periodLabelOf(period: StatementPeriod): string {
  const f = (d: Date) =>
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  if (period.from && period.to) return `${f(period.from)} – ${f(period.to)}`;
  if (period.from) return `${f(period.from)} dan`;
  if (period.to) return `${f(period.to)} gacha`;
  return 'Butun tarix';
}

function fmtSom(balanceMinor: bigint): string {
  const abs = balanceMinor < 0n ? -balanceMinor : balanceMinor;
  return new Intl.NumberFormat('ru-RU').format(Number(abs) / 100);
}

/** OWNER framing (admin bot): who owes whom, our books. */
function ownerBalanceText(name: string, balanceMinor: bigint): string {
  const amt = fmtSom(balanceMinor);
  if (balanceMinor > 0n) return `💰 «${name}» bizga ${amt} so'm qarzdor.`;
  if (balanceMinor < 0n) return `💰 Biz «${name}»ga ${amt} so'm qarzdormiz.`;
  return "💰 Hisob teng — qarz yo'q.";
}

/** COUNTERPARTY framing (file caption): their view. */
function cpBalanceText(balanceMinor: bigint): string {
  const amt = fmtSom(balanceMinor);
  if (balanceMinor > 0n) return `💰 Sizda ${amt} so'm qarz bor.`;
  if (balanceMinor < 0n) return `💰 Sizga ${amt} so'm qarzimiz bor — tez orada to'lanadi.`;
  return "💰 Hisob teng — qarz yo'q.";
}

/**
 * BUYUM-bo'yicha aktda ishlatiladigan tovar hujjati shakli.
 *
 * Faza 10 da to'liq akt jurnalga ko'chgach, bu yerdagi `GOODS_SELECT` /
 * `FLAT_SELECT` / `FlatRow` juftliklari o'lik qoldi va olib tashlandi — endi
 * pul/tovar hujjatlarining balans uchun o'qilishi
 * `counterparty-balance-doc-resolver.ts` da, BITTA joyda turadi.
 */
interface GoodsRow {
  moment: Date;
  name: string;
  sumMinor: bigint;
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: Array<{
    quantity: unknown;
    priceMinor: bigint;
    discount: unknown;
    vat: number | null;
    vatEnabled: boolean;
    product: { name: string; uom?: string | null } | null;
  }>;
}

/**
 * Kontragent akt-sverka orchestration: aggregate a counterparty's full
 * balance-affecting history → compute the ledger → render a professional .xlsx →
 * persist it (disk + DB row with a capability token).
 */
@Injectable()
export class CounterpartyStatementService {
  private readonly logger = new Logger(CounterpartyStatementService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartySettlementService)
    private readonly settlement: CounterpartySettlementService,
  ) {}

  /**
   * Query + normalise the balance-affecting posted documents for the agent.
   * When `productId` is set → PRODUCT-filtered log: only goods documents that
   * contain that product, and each row carries only that product's line (sum,
   * qty). Cash/payment docs are excluded (no product). Otherwise → full history.
   *
   * FAZA Q6 (`PERF-02`) — `opts.from`/`opts.to` davr o'qi. Davr HUJJATNING O'Z
   * sanasi bo'yicha kesiladi (jurnal `createdAt` bo'yicha EMAS): orqaga sanalgan
   * hujjat aks holda o'z davridagi aktdan jimgina tushib qolardi. Davrdan
   * oldingi harakatlar yo'qolmaydi — ular davr-boshi qoldig'iga (saldo-forward)
   * yig'iladi.
   */
  async aggregate(accountId: string, counterpartyId: string, opts: StatementAggregateOptions = {}) {
    const c = this.prisma.client;
    const { productId } = opts;
    const where = { accountId, agentId: counterpartyId, state: 'posted' };
    // `to` berilmasa — hozir; `lt` shunda ham har qanday o'tmish hujjatini
    // qamraydi (kelajakdagi hujjat yo'q). `from` berilmasa davr-boshi YO'Q.
    const { gte, lt } = reportDateBounds(opts.from ?? new Date(0), opts.to ?? new Date());
    const periodStart = opts.from ? gte : null;
    const momentFilter = opts.from || opts.to ? { moment: { gte, lt } } : {};

    const cp = await c.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Kontragent topilmadi');

    if (productId) {
      const sel = {
        moment: true,
        name: true,
        sumMinor: true,
        vatEnabled: true,
        vatIncluded: true,
        positions: {
          where: { productId },
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
      // Davr kesimi SQL darajasida (`moment` chegaralari) — buyum-jurnalida
      // saldo-forward tushunchasi yo'q (bu balans ko'rinishi emas), shuning
      // uchun davrdan tashqari hujjatlar shunchaki tortilmaydi.
      const w = { ...where, ...momentFilter, positions: { some: { productId } } };
      const [invOut, supply, purchaseReturn, product] = await Promise.all([
        c.invoiceOut.findMany({ where: w, select: sel }),
        c.supply.findMany({ where: w, select: sel }),
        c.purchaseReturn.findMany({ where: w, select: sel }),
        c.product.findFirst({ where: { id: productId, accountId }, select: { name: true } }),
      ]);
      // BUYUM-bo'yicha jurnal — bu BALANS ko'rinishi EMAS (bitta tovar kesimi),
      // shuning uchun belgi hujjat turidan olinadi: sotuv (+) mijoz qarzini
      // oshiradi, qabul (−) bizning qarzimizni, taminotchiga qaytarish (+) uni
      // kamaytiradi. Ro'yxat qisqa va yopiq (faqat tovar hujjatlari), ya'ni
      // «chala ro'yxat» xatari bu yerda yo'q.
      //
      // ⚠️ FAZA 13 (`PP-03`): `invoiceIn` bu ro'yxatdan CHIQARILDI. U yerda
      // xarid IKKI marta — hisob-faktura va qabul sifatida — sanalardi, endi esa
      // hisob-faktura kontragent balansiga umuman tegmaydi (QAROR-B
      // «Supply-only»). Ro'yxat shu bilan yuqoridagi jurnal-manbali kesim bilan
      // bir xil semantikaga keldi.
      const raw: RawDoc[] = [
        ...(invOut as GoodsRow[]).map((d) => this.productLine(d, 'invoiceOut', 1n)),
        ...(supply as GoodsRow[]).map((d) => this.productLine(d, 'supply', -1n)),
        ...(purchaseReturn as GoodsRow[]).map((d) => this.productLine(d, 'purchaseReturn', 1n)),
      ];
      return { cp, data: computeStatement(raw), productName: product?.name ?? '(buyum)' };
    }

    // FAZA 10 (`DUP-08`) — MANBA: `CounterpartyBalanceEntry` jurnali.
    //
    // Ilgari bu yerda 12 turdan iborat qattiq ro'yxat turardi, unda `debt`
    // (QRZ- reyestrida qo'lda ochilgan qarz) va `retailsale` (POS qarzga sotuv)
    // YO'Q edi — 2026-07-28 tuzatuvi 2026-08-05 o'zgarishi bilan qayta buzilgan
    // edi. Oqibati: `finalBalanceMinor` haqiqiy saldodan farq qilardi va aynan
    // o'sha son mijozga «Sizda N so'm qarz bor» bo'lib yuborilardi — modulning
    // o'z izohida bir marta yopilgan bug-klass.
    //
    // Endi qatorlar jurnal deltalaridan quriladi ⇒ tur ro'yxati bilan
    // boshqarilmaydi; belgi ham `applyDelta` ning o'zinikidan olinadi.
    const entries = await listJournalEntries(c.counterpartyBalanceEntry, {
      accountId,
      counterpartyId,
      currency: STATEMENT_CURRENCY,
    });

    // IKKI BOSQICHLI RESOLVE (Faza Q6, `PERF-02` ning perf qismi):
    //   1-bosqich — SANA/RAQAM (pozitsiyalarsiz, flat select). Sana HAR bir
    //      qatorga kerak, chunki davr aynan shu sana bo'yicha kesiladi;
    //   2-bosqich — TOVAR QATORLARI faqat davr ICHIDA qolgan hujjatlar uchun.
    // Ilgari butun tarix uchun pozitsiyalar tortilardi — bir yillik kontragentda
    // bu aktning eng qimmat so'rovi edi, ustiga natijaning ko'p qismi
    // ishlatilmasdi. «Batafsil» varag'idagi tovar qatorlari SAQLANADI (egasi
    // 2026-07-28 talabi: chegirma ochiq ustunda) — ular endi faqat KO'RSATILADIGAN
    // hujjatlar uchun yuklanadi.
    const heads = await resolveBalanceDocs(c, accountId, entries);
    const dated: DatedJournalEntry[] = entries.map((e) => ({
      ...e,
      docMoment: heads.get(docKey(e.docType, e.docId))?.moment ?? null,
    }));
    const folded = foldJournalPeriod(dated, periodStart, lt);
    const detailed = await resolveBalanceDocs(c, accountId, folded.lines, { withItems: true });

    const raw: RawDoc[] = folded.lines.map((e) => {
      const key = docKey(e.docType, e.docId);
      return {
        moment: e.docMoment ?? e.createdAt,
        docType: e.docType,
        docNumber: heads.get(key)?.number ?? '—',
        docId: e.docId ?? null,
        deltaMinor: e.deltaMinor,
        items: detailed.get(key)?.items ?? [],
      };
    });

    return {
      cp,
      data: computeStatement(raw, folded.openingMinor),
      productName: null as string | null,
    };
  }

  /**
   * Bitta pozitsiyaning aktdagi summasi — hujjatni post qilgan mantiq bilan
   * AYNAN bir xil (`computePositionTotal`: chegirma, keyin QQS, aniq BigInt).
   *
   * Ilgari bu `Math.round(qty * Number(priceMinor))` edi — chegirmani ham,
   * QQSni ham tashlab ketardi. Oqibati ikki xil edi: (1) to'liq aktda hujjat
   * jami `d.sumMinor` (chegirmali) bo'lgani holda tovar qatorlari brutto
   * chiqib, kontragent qatorlarni qo'shsa hujjat summasiga to'g'ri kelmasdi;
   * (2) buyum-bo'yicha aktda esa shu brutto summa LEDGER qiymati sifatida
   * ishlatilib, «sizda N so'm qarz bor» raqamini shishirib yuborardi.
   */
  private positionSum(d: GoodsRow, p: GoodsRow['positions'][number]): bigint {
    return computePositionTotal(
      {
        quantity: String(p.quantity ?? '0'),
        priceMinor: String(p.priceMinor),
        discount: String(p.discount ?? '0'),
        vat: p.vat ?? null,
      },
      d.vatEnabled && p.vatEnabled,
      d.vatIncluded,
    ).totalMinor;
  }

  private itemsOf(d: GoodsRow) {
    return d.positions.map((p) => ({
      name: p.product?.name ?? '(tovar)',
      quantity: String(p.quantity ?? ''),
      uom: p.product?.uom ?? null,
      priceMinor: p.priceMinor,
      discountPercent: String(p.discount ?? '0'),
      sumMinor: this.positionSum(d, p),
    }));
  }

  /** A goods doc reduced to ONLY the matched product's line(s) — discount applied. */
  private productLine(d: GoodsRow, docType: string, sign: 1n | -1n): RawDoc {
    const items = this.itemsOf(d);
    const total = items.reduce((s, it) => s + it.sumMinor, 0n);
    return { moment: d.moment, docType, docNumber: d.name, deltaMinor: sign * total, items };
  }

  /** Generate + persist the statement; returns the DB row (with token). */
  async generate(
    accountId: string,
    counterpartyId: string,
    userId: string | null,
    opts: StatementAggregateOptions = {},
  ) {
    const { cp, data, productName } = await this.aggregate(accountId, counterpartyId, opts);

    const generatedAtLabel = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());

    const org = await this.prisma.client.organization.findFirst({
      where: { accountId },
      select: { name: true },
    });

    const buf = await buildStatementXlsx({
      companyName: org?.name ?? 'Sherset',
      counterpartyName: cp.name,
      periodLabel: productName
        ? `Buyum: ${productName} · ${periodLabelOf(opts)}`
        : periodLabelOf(opts),
      generatedAtLabel,
      data,
      currency: 'UZS',
    });

    const token = randomBytes(24).toString('hex');
    const namePart = productName
      ? `${this.slug(cp.name)}-${this.slug(productName)}`
      : this.slug(cp.name);
    const fileName = `akt-sverka-${namePart}-${Date.now()}.xlsx`;
    const filePath = join(STATEMENTS_DIR, `${token}.xlsx`);
    await mkdir(STATEMENTS_DIR, { recursive: true });
    await writeFile(filePath, buf);

    const row = await this.prisma.client.counterpartyStatement.create({
      data: {
        accountId,
        counterpartyId,
        fileToken: token,
        filePath,
        fileName,
        finalBalanceMinor: data.finalBalanceMinor,
        currency: 'UZS',
        createdById: userId,
      },
    });
    this.logger.log(`akt-sverka generated: cp=${counterpartyId} token=${token}`);
    return { row, cp, data, fileName };
  }

  /**
   * Deliver a generated statement: (1) enqueue an MTProto FILE to the
   * counterparty (if they have a phone), (2) send the ADMIN a bot message with a
   * capability link. Self-contained: never throws into the caller.
   */
  async deliver(
    accountId: string,
    ctx: {
      row: { id: string; fileToken: string; filePath: string };
      cp: { id: string; name: string; phone: string | null };
      finalBalanceMinor: bigint;
    },
    /**
     * EXPLICIT gate (owner 2026-07-26): the counterparty gets the file ONLY when
     * the admin presses «Kontragentga yuborish». Default false ⇒ generate/download
     * never auto-messages the counterparty. The admin bot link is always sent.
     */
    toCounterparty = false,
  ): Promise<{ link: string; counterpartySent: boolean }> {
    const base = process.env.STATEMENT_BASE_URL || 'https://erp.sherset.uz/api/v1';
    const link = `${base}/akt/${ctx.row.fileToken}`;

    // (1) Counterparty — MTProto file via the outbox (worker sends the document).
    let counterpartySent = false;
    const phone = ctx.cp.phone?.trim();
    if (toCounterparty && phone) {
      try {
        await this.prisma.client.hrTelegramOutbox.create({
          data: {
            accountId,
            counterpartyId: ctx.cp.id,
            toPhone: phone,
            messageText: `Hurmatli ${ctx.cp.name}, hisob-kitob akt-sverkangiz (Excel). ${cpBalanceText(ctx.finalBalanceMinor)}`,
            attachmentPath: ctx.row.filePath,
            sourceEventType: 'statement',
            sourceDocId: ctx.row.id,
            status: 'pending',
          },
        });
        counterpartySent = true;
      } catch (e) {
        this.logger.warn(`statement counterparty enqueue failed: ${(e as Error).message}`);
      }
    }

    // (2) Admin — bot message with the download link.
    try {
      await this.sendBotLink(
        `📄 *Akt-sverka* — «${ctx.cp.name}»\n${ownerBalanceText(ctx.cp.name, ctx.finalBalanceMinor)}\n${link}`,
      );
    } catch (e) {
      this.logger.warn(`statement bot link failed: ${(e as Error).message}`);
    }

    return { link, counterpartySent };
  }

  private async sendBotLink(text: string): Promise<void> {
    const token = process.env.DEBT_NOTIFY_BOT_TOKEN;
    const chatId = process.env.DEBT_NOTIFY_CHAT_ID;
    if (!token || !chatId) {
      this.logger.warn('statement bot not configured — skip admin link');
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Bot API ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // ===== Report B: «Buyum bo'yicha» (product → counterparties) =====

  /** For a product: each counterparty's bought qty + sum + their current debt. */
  async aggregateByProduct(accountId: string, productId: string) {
    const c = this.prisma.client;
    const product = await c.product.findFirst({
      where: { id: productId, accountId },
      select: { name: true },
    });
    if (!product) throw new NotFoundException('Buyum topilmadi');

    const invoices = await c.invoiceOut.findMany({
      where: { accountId, state: 'posted', positions: { some: { productId } } },
      select: {
        agentId: true,
        agent: { select: { name: true } },
        positions: { where: { productId }, select: { quantity: true, priceMinor: true } },
      },
    });

    const map = new Map<string, { name: string; qty: number; sumMinor: bigint }>();
    for (const inv of invoices) {
      const e = map.get(inv.agentId) ?? { name: inv.agent.name, qty: 0, sumMinor: 0n };
      for (const p of inv.positions) {
        const q = Number(p.quantity ?? 0);
        e.qty += q;
        e.sumMinor += BigInt(Math.round(q * Number(p.priceMinor)));
      }
      map.set(inv.agentId, e);
    }

    const agentIds = [...map.keys()];
    const balances = agentIds.length
      ? await c.counterpartyBalance.findMany({
          where: { accountId, counterpartyId: { in: agentIds }, currency: 'UZS' },
          select: { counterpartyId: true, balanceMinor: true },
        })
      : [];
    const debt = new Map(balances.map((b) => [b.counterpartyId, b.balanceMinor]));

    const rows: ProductReportRow[] = agentIds
      .map((id) => {
        const e = map.get(id) as { name: string; qty: number; sumMinor: bigint };
        return { cpName: e.name, qty: e.qty, sumMinor: e.sumMinor, debtMinor: debt.get(id) ?? 0n };
      })
      .sort((a, b) => (b.sumMinor > a.sumMinor ? 1 : b.sumMinor < a.sumMinor ? -1 : 0));

    return {
      productName: product.name,
      rows,
      totalQty: rows.reduce((s, r) => s + r.qty, 0),
      totalSumMinor: rows.reduce((s, r) => s + r.sumMinor, 0n),
    };
  }

  /** Generate + persist + (bot-)deliver the product report. */
  async generateProductReport(accountId: string, productId: string, userId: string | null) {
    const agg = await this.aggregateByProduct(accountId, productId);
    const generatedAtLabel = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
    const org = await this.prisma.client.organization.findFirst({
      where: { accountId },
      select: { name: true },
    });

    const buf = await buildProductReportXlsx({
      companyName: org?.name ?? 'Sherset',
      productName: agg.productName,
      periodLabel: 'Butun tarix',
      generatedAtLabel,
      rows: agg.rows,
      totalQty: agg.totalQty,
      totalSumMinor: agg.totalSumMinor,
      currency: 'UZS',
    });

    const token = randomBytes(24).toString('hex');
    const fileName = `buyum-hisobot-${this.slug(agg.productName)}-${Date.now()}.xlsx`;
    const filePath = join(STATEMENTS_DIR, `${token}.xlsx`);
    await mkdir(STATEMENTS_DIR, { recursive: true });
    await writeFile(filePath, buf);

    const row = await this.prisma.client.counterpartyStatement.create({
      data: {
        accountId,
        counterpartyId: null,
        productId,
        fileToken: token,
        filePath,
        fileName,
        finalBalanceMinor: agg.totalSumMinor,
        currency: 'UZS',
        createdById: userId,
      },
    });

    // Admin bot link only — a product report has no single counterparty for MTProto.
    const base = process.env.STATEMENT_BASE_URL || 'https://erp.sherset.uz/api/v1';
    const link = `${base}/akt/${token}`;
    const totalSom = new Intl.NumberFormat('ru-RU').format(Number(agg.totalSumMinor) / 100);
    try {
      await this.sendBotLink(
        `📦 *Buyum hisoboti* — «${agg.productName}»\n${agg.rows.length} ta kontragent · jami ${totalSom} so'm\n${link}`,
      );
    } catch {
      /* logged inside sendBotLink */
    }
    return {
      row,
      productName: agg.productName,
      downloadUrl: link,
      totalSumMinor: agg.totalSumMinor,
    };
  }

  /**
   * «Qabul tovarlari» Excel for ONE supply — only THIS document's goods (not the
   * full akt). Optionally delivered to the supply's agent (MTProto) + admin bot.
   */
  async generateSupplyGoods(
    accountId: string,
    supplyId: string,
    userId: string | null,
    deliver: boolean,
  ) {
    const c = this.prisma.client;
    const supply = await c.supply.findFirst({
      where: { id: supplyId, accountId },
      select: {
        name: true,
        moment: true,
        currency: true,
        sumMinor: true,
        vatEnabled: true,
        vatIncluded: true,
        agent: { select: { id: true, name: true, phone: true } },
        positions: {
          orderBy: { position: 'asc' },
          select: {
            quantity: true,
            priceMinor: true,
            // 2026-07-28 — chegirma/QQS ilgari SELECT qilinmasdi, shuning uchun
            // qator summasi brutto chiqib, jadval hujjat summasiga to'g'ri
            // kelmasdi (egasi: «skidkani yubormadi»).
            discount: true,
            vat: true,
            vatEnabled: true,
            product: { select: { name: true, uom: true } },
          },
        },
      },
    });
    if (!supply) throw new NotFoundException('Qabul topilmadi');

    // Qator summasi hujjatni post qilgan mantiq bilan AYNAN bir xil hisoblanadi
    // (`computePositionTotal` — chegirma, keyin QQS, aniq BigInt, half-up).
    // Ilgari bu yerda `Math.round(qty * Number(priceMinor))` turardi: chegirmani
    // ham, QQSni ham tashlab ketardi va float arifmetikasida edi.
    const rows: SupplyGoodsRow[] = supply.positions.map((p) => {
      const discount = String(p.discount ?? '0');
      const { totalMinor } = computePositionTotal(
        {
          quantity: String(p.quantity ?? '0'),
          priceMinor: String(p.priceMinor),
          discount,
          vat: p.vat ?? null,
        },
        supply.vatEnabled && p.vatEnabled,
        supply.vatIncluded,
      );
      // Chegirmasiz (brutto) summa — QQSsiz taqqoslash ustuni uchun: aynan
      // shu narx×miqdor kontragent kutgan raqam, chegirma esa undan ayriladi.
      const { totalMinor: grossMinor } = computePositionTotal(
        {
          quantity: String(p.quantity ?? '0'),
          priceMinor: String(p.priceMinor),
          discount: '0',
          vat: p.vat ?? null,
        },
        supply.vatEnabled && p.vatEnabled,
        supply.vatIncluded,
      );
      return {
        name: p.product?.name ?? '(tovar)',
        quantity: String(p.quantity ?? ''),
        priceMinor: p.priceMinor,
        discountPercent: discount,
        grossSumMinor: grossMinor,
        discountSumMinor: grossMinor - totalMinor,
        sumMinor: totalMinor,
      };
    });
    const grossTotal = rows.reduce((s, x) => s + x.grossSumMinor, 0n);
    const discountTotal = rows.reduce((s, x) => s + x.discountSumMinor, 0n);
    // Hujjatning O'Z summasi — yagona haqiqat. Qatorlar yig'indisi undan farq
    // qilsa (masalan hujjat post qilingandan keyin narx qo'lda tuzatilgan
    // bo'lsa), kontragentga hujjatdagi raqam ketishi kerak.
    const total = supply.sumMinor;
    const dateLabel = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(supply.moment);
    const org = await c.organization.findFirst({ where: { accountId }, select: { name: true } });

    // Kontragentning BARCHA qarzlari bo'yicha yakuniy holat — bitta manbadan
    // (materiallashgan CounterpartyBalance + QRZ- reyestri). Bu yerda hech narsa
    // qayta hisoblanmaydi; izohi counterparty-settlement.util.ts da.
    const settlement = await this.settlement.forCounterparty(accountId, supply.agent.id);
    const settlementLines = settlement.lines.map((l) => ({
      currency: l.currency,
      ledgerBalanceMinor: l.ledgerBalanceMinor,
      debtRegistryOutstandingMinor: l.debtRegistryOutstandingMinor,
      verdict: settlementTextForCounterparty(l.ledgerBalanceMinor, l.currency),
    }));

    const buf = await buildSupplyGoodsXlsx({
      companyName: org?.name ?? 'Sherset',
      counterpartyName: supply.agent.name,
      docNumber: supply.name,
      dateLabel,
      rows,
      grossTotalMinor: grossTotal,
      discountTotalMinor: discountTotal,
      totalSumMinor: total,
      currency: supply.currency,
      settlement: settlementLines,
    });

    const token = randomBytes(24).toString('hex');
    const fileName = `qabul-tovarlar-${this.slug(supply.name)}-${Date.now()}.xlsx`;
    const filePath = join(STATEMENTS_DIR, `${token}.xlsx`);
    await mkdir(STATEMENTS_DIR, { recursive: true });
    await writeFile(filePath, buf);

    // `finalBalanceMinor` — ustun nomi aytganidek, kontragentning YAKUNIY
    // SALDOSI. Ilgari bu yerga qabulning SUMMASI yozilardi (`total`), ya'ni
    // hujjat summasi «balans» sifatida saqlanardi va shu son kontragentga
    // qarz bo'lib ko'rinardi — egasi keltirgan «45 ming so'm» aynan shu edi.
    const primary = settlement.primary;
    const row = await c.counterpartyStatement.create({
      data: {
        accountId,
        counterpartyId: supply.agent.id,
        fileToken: token,
        filePath,
        fileName,
        finalBalanceMinor: primary?.ledgerBalanceMinor ?? 0n,
        currency: primary?.currency ?? supply.currency,
        createdById: userId,
      },
    });

    const base = process.env.STATEMENT_BASE_URL || 'https://erp.sherset.uz/api/v1';
    const link = `${base}/akt/${token}`;
    let counterpartySent = false;
    const phone = supply.agent.phone?.trim();
    if (deliver && phone) {
      try {
        await c.hrTelegramOutbox.create({
          data: {
            accountId,
            counterpartyId: supply.agent.id,
            toPhone: phone,
            // Xabar matnida ham chegirma va yakuniy hisob-kitob turadi —
            // kontragent Excel'ni ochmasdan asosiy raqamlarni ko'rsin. Ilgari
            // bu yerda faqat «tovarlar ro'yxati (Excel)» bor edi: na chegirma,
            // na qarz — akt-sverka yo'lida esa balans matni allaqachon bor edi.
            messageText: this.supplyGoodsCaption({
              name: supply.agent.name,
              docNumber: supply.name,
              currency: supply.currency,
              grossTotalMinor: grossTotal,
              discountTotalMinor: discountTotal,
              totalSumMinor: total,
              settlementLines,
            }),
            attachmentPath: filePath,
            sourceEventType: 'supply_goods',
            sourceDocId: row.id,
            status: 'pending',
          },
        });
        counterpartySent = true;
      } catch (e) {
        this.logger.warn(`supply-goods enqueue failed: ${(e as Error).message}`);
      }
    }
    try {
      const ownerSettle = primary
        ? `\n${settlementTextForOwner(supply.agent.name, primary.ledgerBalanceMinor, primary.currency)}`
        : '';
      await this.sendBotLink(
        `📦 *Qabul tovarlari* — «${supply.agent.name}» №${supply.name}${ownerSettle}\n${link}`,
      );
    } catch {
      /* logged inside sendBotLink */
    }
    return { row, agentName: supply.agent.name, counterpartySent, link };
  }

  /**
   * Qabul-tovarlari xabarining matni. Ataylab alohida, sof metod — MTProto
   * ishga tushirmasdan testlanadi.
   *
   * Matn tarkibi (egasi 2026-07-28 talabi): hujjat sarlavhasi → chegirma
   * (bo'lsa) → hujjat summasi → kontragentning BARCHA qarzlari bo'yicha
   * yakuniy holat. Chegirma nol bo'lsa o'sha qator umuman chizilmaydi.
   */
  private supplyGoodsCaption(ctx: {
    name: string;
    docNumber: string;
    currency: string;
    grossTotalMinor: bigint;
    discountTotalMinor: bigint;
    totalSumMinor: bigint;
    settlementLines: Array<{ currency: string; verdict: string }>;
  }): string {
    const unit = currencyUnit(ctx.currency);
    const lines = [`Hurmatli ${ctx.name}, qabul №${ctx.docNumber} — tovarlar ro'yxati (Excel).`];
    if (ctx.discountTotalMinor !== 0n) {
      lines.push(
        `Chegirmasiz: ${formatSettlementAmount(ctx.grossTotalMinor)} ${unit}`,
        `Chegirma: ${formatSettlementAmount(ctx.discountTotalMinor)} ${unit}`,
      );
    }
    lines.push(`Jami: ${formatSettlementAmount(ctx.totalSumMinor)} ${unit}`);
    if (ctx.settlementLines.length > 0) {
      lines.push('━━━━━━━━━━━━');
      for (const l of ctx.settlementLines) lines.push(l.verdict);
    }
    return lines.join('\n');
  }

  /** Product reports for a product (newest first). */
  listForProduct(accountId: string, productId: string) {
    return this.prisma.client.counterpartyStatement.findMany({
      where: { accountId, productId, counterpartyId: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileToken: true,
        fileName: true,
        finalBalanceMinor: true,
        currency: true,
        createdAt: true,
      },
      take: 100,
    });
  }

  /** Past statements for a counterparty (newest first). */
  listForCounterparty(accountId: string, counterpartyId: string) {
    return this.prisma.client.counterpartyStatement.findMany({
      where: { accountId, counterpartyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileToken: true,
        fileName: true,
        finalBalanceMinor: true,
        currency: true,
        createdAt: true,
      },
      take: 100,
    });
  }

  /** Resolve a statement by its capability token (for download). */
  async getByToken(token: string) {
    const row = await this.prisma.client.counterpartyStatement.findUnique({
      where: { fileToken: token },
      select: { filePath: true, fileName: true },
    });
    if (!row) throw new NotFoundException('Akt topilmadi');
    return row;
  }

  private slug(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
}
