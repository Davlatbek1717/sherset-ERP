import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentInService } from '../payment-in/payment-in.service.js';
import { PaymentOutService } from '../payment-out/payment-out.service.js';
import {
  type CommitBankStatementInput,
  CommitBankStatementSchema,
  type UploadBankStatementInput,
  UploadBankStatementSchema,
} from './bank-import.schema.js';
import { parseBankStatementCamt053 } from './camt053-parser.js';
import { parseBankStatementCsv } from './csv-parser.js';

interface MatchHit {
  counterpartyId: string;
  reason: 'inn' | 'account';
}

@Injectable()
export class BankImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentInService) private readonly paymentIn: PaymentInService,
    @Inject(PaymentOutService) private readonly paymentOut: PaymentOutService,
  ) {}

  /**
   * Upload → parse → auto-match pipeline. The statement + rows are
   * persisted even if some rows have parse errors so the user can fix
   * them via the UI and re-run commit.
   */
  async upload(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseUpload(raw);

    // Auto-detect camt.053 XML regardless of the declared format; fall
    // back to the tolerant CSV parser otherwise.
    const head = parsed.content.slice(0, 512).trimStart();
    const isCamt =
      parsed.format === 'camt053' ||
      /^<\?xml/i.test(head) ||
      (head.includes('<Document') && parsed.content.includes('BkToCstmrStmt'));

    let rows: ReturnType<typeof parseBankStatementCsv>['rows'];
    let resolvedFormat = parsed.format;
    let reconNote: string | null = null;
    if (isCamt) {
      const res = parseBankStatementCamt053(parsed.content);
      rows = res.rows;
      resolvedFormat = 'camt053';
      reconNote = res.reconciliation.message;
    } else {
      rows = parseBankStatementCsv(parsed.content).rows;
    }
    const notes = [parsed.notes, reconNote].filter(Boolean).join(' — ') || null;

    // Collect counterparty hints once for a single batched lookup.
    const innValues = new Set<string>();
    const acctValues = new Set<string>();
    for (const r of rows) {
      if (r.counterpartyInn) innValues.add(r.counterpartyInn);
      if (r.counterpartyAccount) acctValues.add(r.counterpartyAccount);
    }

    const matchMap = await this.buildMatchMap(
      accountId,
      Array.from(innValues),
      Array.from(acctValues),
    );

    const statement = await this.prisma.client.bankStatement.create({
      data: {
        accountId,
        uploadedBy: userId,
        organizationAccountId: parsed.organizationAccountId,
        filename: parsed.filename,
        format: resolvedFormat,
        notes,
        state: 'parsed',
        rowCountTotal: rows.length,
        rowCountMatched: rows.filter(
          (r) => !!this.pickMatch(r.counterpartyInn, r.counterpartyAccount, matchMap),
        ).length,
        rows: {
          create: rows.map((r) => {
            const hit = this.pickMatch(r.counterpartyInn, r.counterpartyAccount, matchMap);
            return {
              accountId,
              lineNumber: r.lineNumber,
              direction: r.direction,
              moment: r.moment,
              amountMinor: r.amountMinor,
              currency: 'UZS',
              counterpartyName: r.counterpartyName,
              counterpartyInn: r.counterpartyInn,
              counterpartyAccount: r.counterpartyAccount,
              paymentPurpose: r.paymentPurpose,
              documentNumber: r.documentNumber,
              matchedCounterpartyId: hit?.counterpartyId ?? null,
              matchReason: hit?.reason ?? null,
              error: r.error,
            };
          }),
        },
      },
      include: {
        rows: { orderBy: { lineNumber: 'asc' } },
      },
    });

    return this.serialize(statement);
  }

  async list(accountId: string) {
    const rows = await this.prisma.client.bankStatement.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { uploader: { select: { id: true, name: true } } },
    });
    return { items: rows, total: rows.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.bankStatement.findFirst({
      where: { id, accountId },
      include: {
        uploader: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, currency: true } },
        rows: {
          orderBy: { lineNumber: 'asc' },
          include: {
            matchedCounterparty: { select: { id: true, name: true, legalTitle: true } },
            paymentIn: { select: { id: true, name: true, state: true } },
            paymentOut: { select: { id: true, name: true, state: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`BankStatement ${id} not found`);
    return this.serialize(row);
  }

  /**
   * Create PaymentIn/Out drafts from the statement rows. Each row commits
   * independently so a single bad row doesn't abort the batch.
   */
  async commit(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseCommit(raw);

    const statement = await this.prisma.client.bankStatement.findFirst({
      where: { id, accountId },
      include: { rows: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!statement) throw new NotFoundException(`BankStatement ${id} not found`);
    if (statement.state === 'cancelled') {
      throw new BadRequestException('Cancelled statements cannot be committed');
    }

    const selectedIds = parsed.rowIds && parsed.rowIds.length > 0 ? new Set(parsed.rowIds) : null;

    const succeeded: string[] = [];
    const failed: Array<{ rowId: string; error: string }> = [];

    for (const row of statement.rows) {
      if (row.paymentInId || row.paymentOutId) continue; // already imported
      if (row.skipped) continue;
      if (selectedIds && !selectedIds.has(row.id)) continue;
      if (row.error) {
        failed.push({ rowId: row.id, error: `Parse error: ${row.error}` });
        continue;
      }
      const overrideCp = parsed.counterpartyOverrides?.[row.id];
      const cpId = overrideCp ?? row.matchedCounterpartyId;
      if (!cpId) {
        failed.push({ rowId: row.id, error: 'No counterparty matched' });
        continue;
      }

      try {
        if (row.direction === 'in') {
          const created = await this.paymentIn.create(accountId, userId, {
            agentId: cpId,
            organizationId: parsed.organizationId,
            moment: row.moment.toISOString(),
            sumMinor: row.amountMinor.toString(),
            paymentPurpose: row.paymentPurpose ?? undefined,
            incomingNumber: row.documentNumber ?? undefined,
            incomingDate: row.moment.toISOString(),
            currency: row.currency,
          });
          if (!created) {
            failed.push({ rowId: row.id, error: 'payment create returned no record' });
            continue;
          }
          await this.prisma.client.bankStatementRow.update({
            where: { id: row.id },
            data: { paymentInId: created.id },
          });
          succeeded.push(row.id);
        } else {
          const created = await this.paymentOut.create(accountId, userId, {
            agentId: cpId,
            organizationId: parsed.organizationId,
            moment: row.moment.toISOString(),
            sumMinor: row.amountMinor.toString(),
            paymentPurpose: row.paymentPurpose ?? undefined,
            currency: row.currency,
          });
          if (!created) {
            failed.push({ rowId: row.id, error: 'payment create returned no record' });
            continue;
          }
          await this.prisma.client.bankStatementRow.update({
            where: { id: row.id },
            data: { paymentOutId: created.id },
          });
          succeeded.push(row.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ rowId: row.id, error: msg });
      }
    }

    const imported = statement.rows.filter(
      (r) => succeeded.includes(r.id) || r.paymentInId || r.paymentOutId,
    ).length;

    await this.prisma.client.bankStatement.update({
      where: { id, accountId },
      data: {
        state: succeeded.length > 0 ? 'committed' : statement.state,
        rowCountImported: imported,
      },
    });

    return {
      statementId: id,
      total: statement.rows.length,
      succeeded,
      failed,
    };
  }

  async cancel(accountId: string, id: string) {
    const stm = await this.prisma.client.bankStatement.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!stm) throw new NotFoundException(`BankStatement ${id} not found`);
    await this.prisma.client.bankStatement.update({
      where: { id, accountId },
      data: { state: 'cancelled' },
    });
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseUpload(raw: unknown): UploadBankStatementInput {
    const r = UploadBankStatementSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseCommit(raw: unknown): CommitBankStatementInput {
    const r = CommitBankStatementSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async buildMatchMap(
    accountId: string,
    innList: string[],
    acctList: string[],
  ): Promise<{ byInn: Map<string, string>; byAcct: Map<string, string> }> {
    const byInn = new Map<string, string>();
    const byAcct = new Map<string, string>();
    if (innList.length === 0 && acctList.length === 0) return { byInn, byAcct };

    const cps = await this.prisma.client.counterparty.findMany({
      where: {
        accountId,
        archived: false,
      },
      select: { id: true, uzRequisites: true, code: true },
    });

    for (const cp of cps) {
      const reqs = (cp.uzRequisites ?? {}) as {
        inn?: string;
        mfo?: string;
        account?: string;
      };
      if (reqs.inn && innList.includes(reqs.inn)) {
        byInn.set(reqs.inn, cp.id);
      }
      if (reqs.account && acctList.includes(reqs.account)) {
        byAcct.set(reqs.account, cp.id);
      }
      // Secondary: match code (free-form identifier) to INN list if INN stored there
      if (cp.code && innList.includes(cp.code) && !byInn.has(cp.code)) {
        byInn.set(cp.code, cp.id);
      }
    }
    return { byInn, byAcct };
  }

  private pickMatch(
    inn: string | null,
    acct: string | null,
    map: { byInn: Map<string, string>; byAcct: Map<string, string> },
  ): MatchHit | null {
    if (inn) {
      const m = map.byInn.get(inn);
      if (m) return { counterpartyId: m, reason: 'inn' };
    }
    if (acct) {
      const m = map.byAcct.get(acct);
      if (m) return { counterpartyId: m, reason: 'account' };
    }
    return null;
  }

  private serialize<T extends { rows?: Array<{ amountMinor: bigint } & Record<string, unknown>> }>(
    statement: T,
  ): T {
    if (!statement.rows) return statement;
    return {
      ...statement,
      rows: statement.rows.map((r) => ({
        ...r,
        amountMinor: r.amountMinor.toString(),
      })),
    } as T;
  }

  // Expose for service consumers that need the raw Prisma type.
  applyPrismaError(e: unknown): never {
    throw e as Prisma.PrismaClientKnownRequestError;
  }
}
