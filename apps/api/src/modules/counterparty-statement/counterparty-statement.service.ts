import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
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

/** Goods docs expose positions; cash/payment docs are single-line. */
const GOODS_SELECT = {
  moment: true,
  name: true,
  sumMinor: true,
  positions: {
    orderBy: { position: 'asc' as const },
    select: {
      quantity: true,
      priceMinor: true,
      product: { select: { name: true } },
    },
  },
} as const;
const FLAT_SELECT = { moment: true, name: true, sumMinor: true } as const;

interface GoodsRow {
  moment: Date;
  name: string;
  sumMinor: bigint;
  positions: Array<{
    quantity: unknown;
    priceMinor: bigint;
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
        positions: {
          where: { productId },
          select: { quantity: true, priceMinor: true, product: { select: { name: true } } },
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

    const [invOut, invIn, supply, cashIn, cashOut, payIn, payOut] = await Promise.all([
      c.invoiceOut.findMany({ where, select: GOODS_SELECT }),
      c.invoiceIn.findMany({ where, select: GOODS_SELECT }),
      c.supply.findMany({ where, select: GOODS_SELECT }),
      c.cashIn.findMany({ where, select: FLAT_SELECT }),
      c.cashOut.findMany({ where, select: FLAT_SELECT }),
      c.paymentIn.findMany({ where, select: FLAT_SELECT }),
      c.paymentOut.findMany({ where, select: FLAT_SELECT }),
    ]);

    const raw: RawDoc[] = [
      ...(invOut as GoodsRow[]).map((d) => this.goods(d, 'invoiceOut')),
      ...(invIn as GoodsRow[]).map((d) => this.goods(d, 'invoiceIn')),
      ...(supply as GoodsRow[]).map((d) => this.goods(d, 'supply')),
      ...(cashIn as FlatRow[]).map((d) => this.flat(d, 'cashIn')),
      ...(cashOut as FlatRow[]).map((d) => this.flat(d, 'cashOut')),
      ...(payIn as FlatRow[]).map((d) => this.flat(d, 'paymentIn')),
      ...(payOut as FlatRow[]).map((d) => this.flat(d, 'paymentOut')),
    ];

    return { cp, data: computeStatement(raw), productName: null as string | null };
  }

  /** A goods doc reduced to ONLY the matched product's line(s) — sum = Σ(qty·price). */
  private productLine(d: GoodsRow, docType: StatementDocType): RawDoc {
    const items = d.positions.map((p) => {
      const qty = Number(p.quantity ?? 0);
      const sum = BigInt(Math.round(qty * Number(p.priceMinor)));
      return {
        name: p.product?.name ?? '(tovar)',
        quantity: String(p.quantity ?? ''),
        priceMinor: p.priceMinor,
        sumMinor: sum,
      };
    });
    const total = items.reduce((s, it) => s + it.sumMinor, 0n);
    return { moment: d.moment, docType, docNumber: d.name, sumMinor: total, items };
  }

  private goods(d: GoodsRow, docType: StatementDocType): RawDoc {
    return {
      moment: d.moment,
      docType,
      docNumber: d.name,
      sumMinor: d.sumMinor,
      items: d.positions.map((p) => {
        const qty = Number(p.quantity ?? 0);
        const sum = BigInt(Math.round(qty * Number(p.priceMinor)));
        return {
          name: p.product?.name ?? '(tovar)',
          quantity: String(p.quantity ?? ''),
          priceMinor: p.priceMinor,
          sumMinor: sum,
        };
      }),
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
        agent: { select: { id: true, name: true, phone: true } },
        positions: {
          orderBy: { position: 'asc' },
          select: { quantity: true, priceMinor: true, product: { select: { name: true } } },
        },
      },
    });
    if (!supply) throw new NotFoundException('Qabul topilmadi');

    const rows: SupplyGoodsRow[] = supply.positions.map((p) => {
      const qty = Number(p.quantity ?? 0);
      return {
        name: p.product?.name ?? '(tovar)',
        quantity: String(p.quantity ?? ''),
        priceMinor: p.priceMinor,
        sumMinor: BigInt(Math.round(qty * Number(p.priceMinor))),
      };
    });
    const total = rows.reduce((s, x) => s + x.sumMinor, 0n);
    const dateLabel = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(supply.moment);
    const org = await c.organization.findFirst({ where: { accountId }, select: { name: true } });

    const buf = await buildSupplyGoodsXlsx({
      companyName: org?.name ?? 'Sherset',
      counterpartyName: supply.agent.name,
      docNumber: supply.name,
      dateLabel,
      rows,
      totalSumMinor: total,
      currency: 'UZS',
    });

    const token = randomBytes(24).toString('hex');
    const fileName = `qabul-tovarlar-${this.slug(supply.name)}-${Date.now()}.xlsx`;
    const filePath = join(STATEMENTS_DIR, `${token}.xlsx`);
    await mkdir(STATEMENTS_DIR, { recursive: true });
    await writeFile(filePath, buf);

    const row = await c.counterpartyStatement.create({
      data: {
        accountId,
        counterpartyId: supply.agent.id,
        fileToken: token,
        filePath,
        fileName,
        finalBalanceMinor: total,
        currency: 'UZS',
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
            messageText: `Hurmatli ${supply.agent.name}, qabul №${supply.name} — tovarlar ro'yxati (Excel).`,
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
      await this.sendBotLink(
        `📦 *Qabul tovarlari* — «${supply.agent.name}» №${supply.name}\n${link}`,
      );
    } catch {
      /* logged inside sendBotLink */
    }
    return { row, agentName: supply.agent.name, counterpartySent, link };
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
