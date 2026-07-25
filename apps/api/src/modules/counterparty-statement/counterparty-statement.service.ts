import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type RawDoc, type StatementDocType, computeStatement } from './statement-compute.util.js';
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

  /** Query + normalise every balance-affecting posted document for the agent. */
  async aggregate(accountId: string, counterpartyId: string) {
    const c = this.prisma.client;
    const where = { accountId, agentId: counterpartyId, state: 'posted' };

    const [cp, invOut, invIn, cashIn, cashOut, payIn, payOut] = await Promise.all([
      c.counterparty.findFirst({
        where: { id: counterpartyId, accountId },
        select: { id: true, name: true, phone: true },
      }),
      c.invoiceOut.findMany({ where, select: GOODS_SELECT }),
      c.invoiceIn.findMany({ where, select: GOODS_SELECT }),
      c.cashIn.findMany({ where, select: FLAT_SELECT }),
      c.cashOut.findMany({ where, select: FLAT_SELECT }),
      c.paymentIn.findMany({ where, select: FLAT_SELECT }),
      c.paymentOut.findMany({ where, select: FLAT_SELECT }),
    ]);
    if (!cp) throw new NotFoundException('Kontragent topilmadi');

    const raw: RawDoc[] = [
      ...(invOut as GoodsRow[]).map((d) => this.goods(d, 'invoiceOut')),
      ...(invIn as GoodsRow[]).map((d) => this.goods(d, 'invoiceIn')),
      ...(cashIn as FlatRow[]).map((d) => this.flat(d, 'cashIn')),
      ...(cashOut as FlatRow[]).map((d) => this.flat(d, 'cashOut')),
      ...(payIn as FlatRow[]).map((d) => this.flat(d, 'paymentIn')),
      ...(payOut as FlatRow[]).map((d) => this.flat(d, 'paymentOut')),
    ];

    return { cp, data: computeStatement(raw) };
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
  async generate(accountId: string, counterpartyId: string, userId: string | null) {
    const { cp, data } = await this.aggregate(accountId, counterpartyId);

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
      periodLabel: 'Butun tarix',
      generatedAtLabel,
      data,
      currency: 'UZS',
    });

    const token = randomBytes(24).toString('hex');
    const fileName = `akt-sverka-${this.slug(cp.name)}-${Date.now()}.xlsx`;
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
  ): Promise<{ link: string; counterpartySent: boolean }> {
    const base = process.env.STATEMENT_BASE_URL || 'https://erp.sherset.uz/api/v1';
    const link = `${base}/akt/${ctx.row.fileToken}`;

    // (1) Counterparty — MTProto file via the outbox (worker sends the document).
    let counterpartySent = false;
    const phone = ctx.cp.phone?.trim();
    if (phone) {
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
