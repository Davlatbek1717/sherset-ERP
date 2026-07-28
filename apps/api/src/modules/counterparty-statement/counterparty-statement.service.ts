import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computePositionTotal } from '@moysklad/money';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartySettlementService } from '../counterparty-settlement/counterparty-settlement.service.js';
import {
  currencyUnit,
  formatSettlementAmount,
  settlementTextForCounterparty,
  settlementTextForOwner,
} from '../counterparty-settlement/counterparty-settlement.util.js';
import { type ProductReportRow, buildProductReportXlsx } from './product-report-xlsx.util.js';
import { type RawDoc, type StatementDocType, computeStatement } from './statement-compute.util.js';
import { type SupplyGoodsRow, buildSupplyGoodsXlsx } from './supply-goods-xlsx.util.js';
import { buildStatementXlsx } from './xlsx-builder.util.js';

const STATEMENTS_DIR = process.env.STATEMENTS_DIR || join(process.cwd(), 'var', 'statements');

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
 * Goods docs expose positions; cash/payment docs are single-line.
 *
 * 2026-07-28 — `discount` / `vat` / `vatEnabled` (pozitsiya) va `vatEnabled` /
 * `vatIncluded` (hujjat) qo'shildi: ularsiz qator summasi brutto hisoblanardi
 * va aktdagi tovar qatorlari hujjatning o'z summasiga yig'ilmasdi.
 */
const GOODS_SELECT = {
  moment: true,
  name: true,
  sumMinor: true,
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
      product: { select: { name: true } },
    },
  },
} as const;
const FLAT_SELECT = { moment: true, name: true, sumMinor: true } as const;

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
    product: { name: string } | null;
  }>;
}
interface FlatRow {
  moment: Date;
  name: string;
  sumMinor: bigint;
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
   */
  async aggregate(accountId: string, counterpartyId: string, productId?: string) {
    const c = this.prisma.client;
    const where = { accountId, agentId: counterpartyId, state: 'posted' };

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
            product: { select: { name: true } },
          },
        },
      } as const;
      const w = { ...where, positions: { some: { productId } } };
      const [invOut, invIn, supply, product] = await Promise.all([
        c.invoiceOut.findMany({ where: w, select: sel }),
        c.invoiceIn.findMany({ where: w, select: sel }),
        c.supply.findMany({ where: w, select: sel }),
        c.product.findFirst({ where: { id: productId, accountId }, select: { name: true } }),
      ]);
      const raw: RawDoc[] = [
        ...(invOut as GoodsRow[]).map((d) => this.productLine(d, 'invoiceOut')),
        ...(invIn as GoodsRow[]).map((d) => this.productLine(d, 'invoiceIn')),
        ...(supply as GoodsRow[]).map((d) => this.productLine(d, 'supply')),
      ];
      return { cp, data: computeStatement(raw), productName: product?.name ?? '(buyum)' };
    }

    // 2026-07-28 — avans / avans-qaytarish / korrektirovka / qarz-to'lovi
    // QO'SHILDI. Ular `CounterpartyBalanceService.applyDelta` ni chaqiradi, ya'ni
    // materiallashgan saldoni harakatlantiradi, lekin aktda yo'q edi: shuning
    // uchun aktning yakuniy qoldig'i kontragentning haqiqiy saldosidan farq
    // qilardi — va aynan o'sha son mijozga «Sizda N so'm qarz bor» bo'lib
    // yuborilardi. Endi akt ham o'zi bilan yig'iladi, ham bosh daftarga mos.
    const [invOut, invIn, supply, cashIn, cashOut, payIn, payOut, prepay, prepayRet, adj, debtPay] =
      await Promise.all([
        c.invoiceOut.findMany({ where, select: GOODS_SELECT }),
        c.invoiceIn.findMany({ where, select: GOODS_SELECT }),
        c.supply.findMany({ where, select: GOODS_SELECT }),
        c.cashIn.findMany({ where, select: FLAT_SELECT }),
        c.cashOut.findMany({ where, select: FLAT_SELECT }),
        c.paymentIn.findMany({ where, select: FLAT_SELECT }),
        c.paymentOut.findMany({ where, select: FLAT_SELECT }),
        c.prepayment.findMany({ where, select: FLAT_SELECT }),
        c.prepaymentReturn.findMany({ where, select: FLAT_SELECT }),
        c.counterpartyAdjustment.findMany({
          where,
          select: { ...FLAT_SELECT, direction: true },
        }),
        // Qarz kartochkasi to'lovlari — `DebtService.recalc` applyDelta(-paid)
        // yozadi. Storno qilinganlari (reversedAt) chiqarib tashlanadi, xuddi
        // recalc'dagidek. Hujjat raqami sifatida QRZ- nomi ko'rsatiladi.
        c.debtPayment.findMany({
          where: { accountId, reversedAt: null, debt: { counterpartyId } },
          select: {
            createdAt: true,
            amountMinor: true,
            debt: { select: { name: true } },
          },
        }),
      ]);

    const raw: RawDoc[] = [
      ...(invOut as GoodsRow[]).map((d) => this.goods(d, 'invoiceOut')),
      ...(invIn as GoodsRow[]).map((d) => this.goods(d, 'invoiceIn')),
      ...(supply as GoodsRow[]).map((d) => this.goods(d, 'supply')),
      ...(cashIn as FlatRow[]).map((d) => this.flat(d, 'cashIn')),
      ...(cashOut as FlatRow[]).map((d) => this.flat(d, 'cashOut')),
      ...(payIn as FlatRow[]).map((d) => this.flat(d, 'paymentIn')),
      ...(payOut as FlatRow[]).map((d) => this.flat(d, 'paymentOut')),
      ...(prepay as FlatRow[]).map((d) => this.flat(d, 'prepayment')),
      ...(prepayRet as FlatRow[]).map((d) => this.flat(d, 'prepaymentReturn')),
      ...(adj as Array<FlatRow & { direction: string }>).map((d) =>
        this.flat(d, d.direction === 'INCREASE' ? 'adjustmentIncrease' : 'adjustmentDecrease'),
      ),
      ...debtPay.map((d) => ({
        moment: d.createdAt,
        docType: 'debtPayment' as const,
        docNumber: d.debt.name,
        sumMinor: d.amountMinor,
        items: [],
      })),
    ];

    return { cp, data: computeStatement(raw), productName: null as string | null };
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
      priceMinor: p.priceMinor,
      discountPercent: String(p.discount ?? '0'),
      sumMinor: this.positionSum(d, p),
    }));
  }

  /** A goods doc reduced to ONLY the matched product's line(s) — discount applied. */
  private productLine(d: GoodsRow, docType: StatementDocType): RawDoc {
    const items = this.itemsOf(d);
    const total = items.reduce((s, it) => s + it.sumMinor, 0n);
    return { moment: d.moment, docType, docNumber: d.name, sumMinor: total, items };
  }

  private goods(d: GoodsRow, docType: StatementDocType): RawDoc {
    return {
      moment: d.moment,
      docType,
      docNumber: d.name,
      sumMinor: d.sumMinor,
      items: this.itemsOf(d),
    };
  }

  private flat(d: FlatRow, docType: StatementDocType): RawDoc {
    return { moment: d.moment, docType, docNumber: d.name, sumMinor: d.sumMinor, items: [] };
  }

  /** Generate + persist the statement; returns the DB row (with token). */
  async generate(
    accountId: string,
    counterpartyId: string,
    userId: string | null,
    productId?: string,
  ) {
    const { cp, data, productName } = await this.aggregate(accountId, counterpartyId, productId);

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
      periodLabel: productName ? `Buyum: ${productName} · butun tarix` : 'Butun tarix',
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
            product: { select: { name: true } },
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
