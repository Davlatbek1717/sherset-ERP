import { createHash } from 'node:crypto';
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

/**
 * Faza 20 (audit INT-05) — commit «claim»ining eskirish muddati.
 *
 * `commit()` to'lov yaratishdan oldin qatorni `commit_claimed_at` bilan band
 * qiladi va yakunda uni PaymentIn/Out'ga bog'laydi yoki (xato bo'lsa)
 * bo'shatadi. Jarayon aynan shu ikkisining ORASIDA o'lsa (pod restart, OOM)
 * bo'shatish bajarilmay qoladi — TTL'siz qator abadiy «band» bo'lib, faqat
 * DB'ga qo'l bilan kirib tuzatish mumkin bo'lardi. TTL o'tgach claim qayta
 * olinadi. 15 daqiqa = to'lov yaratishning eng yomon holatidan ancha uzoq,
 * operator kutishidan esa ancha qisqa.
 *
 * QOLDIQ XAVF (halol yozilsin): jarayon AYNAN `paymentIn.create` muvaffaqiyatli
 * tugagan-u, `bankStatementRow.update({paymentInId})` hali yozilmagan lahzada
 * o'lsa — yaratilgan to'lov HECH QAYSI qatorga bog'lanmagan bo'ladi, shu
 * sababli TTL'dan keyingi qayta-urinishda dedup uni «egizak» sifatida topa
 * olmaydi va IKKINCHI to'lov yaratiladi. Oyna millisekundlar; to'liq yopish
 * uchun to'lovni qator-bog'lanishi bilan BIR tranzaksiyada yaratish kerak
 * (PaymentInService.create hozir o'z tranzaksiyasini ochadi) — alohida ish.
 */
export const COMMIT_CLAIM_STALE_MS = 15 * 60_000;

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

    // INT-05: bir xil vypiska ikkinchi marta yuklanmoqdami? Hash mazmun
    // bo'yicha (fayl nomi emas — operator `may.csv`ni `may-copy.csv` deb
    // qayta yuklashi odatiy hol). Yuklashni BLOKLAMAYMIZ (qayta-parse
    // qonuniy bo'lishi mumkin — masalan mos-kelishuvni tuzatgandan keyin);
    // haqiqiy himoya commit'dagi qator-dedup'da. Bu yerda faqat UI'ga
    // ko'rsatiladigan ogohlantirish qaytariladi.
    const contentHash = createHash('sha256').update(parsed.content, 'utf8').digest('hex');
    const duplicateOf = await this.prisma.client.bankStatement.findFirst({
      where: { accountId, contentHash, state: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        createdAt: true,
        rowCountImported: true,
        state: true,
      },
    });

    const statement = await this.prisma.client.bankStatement.create({
      data: {
        accountId,
        uploadedBy: userId,
        organizationAccountId: parsed.organizationAccountId,
        filename: parsed.filename,
        format: resolvedFormat,
        contentHash,
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

    return { ...this.serialize(statement), duplicateOf: duplicateOf ?? null };
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
   *
   * Faza 20 (audit INT-05) — har qator uchun IKKI himoya:
   *  1. **Dedup**: shu bank tranzaksiyasi (yo'nalish + sana + summa + hujjat
   *     raqami + kontragent hisobi) boshqa vypiskadan allaqachon import
   *     qilingan bo'lsa — rad etiladi. Bir oylik vypiskani ikki marta yuklab
   *     ikkalasidan commit qilish endi butun oyni dublikat qilmaydi.
   *  2. **Atomik claim**: to'lov yaratishdan OLDIN qator shartli `updateMany`
   *     bilan band qilinadi. Ilgari kod statementni rows bilan bir marta
   *     o'qib, keyin siklda `paymentIn.create` chaqirardi — ikki parallel
   *     commit (double-click) IKKALASI ham `paymentInId = null` snapshot'ini
   *     ko'rib IKKITA to'lov yaratardi va kontragent balansi ikki baravar
   *     buzilardi.
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
    const allowDuplicates = new Set(parsed.allowDuplicateRowIds ?? []);

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

      if (!allowDuplicates.has(row.id)) {
        const dup = await this.findImportedTwin(accountId, row);
        if (dup) {
          failed.push({
            rowId: row.id,
            error: `Duplicate of already-imported row ${dup.id} (statement ${dup.statementId})`,
          });
          continue;
        }
      }

      const claimedAt = await this.claimRow(accountId, row.id);
      // Qatorni shu orada boshqa commit oldi (yoki allaqachon import qildi) —
      // uni O'SHA commit yakunlaydi, bu yerda hech narsa qilinmaydi. `failed`ga
      // ham yozilmaydi: bu xato emas, ish taqsimoti.
      if (!claimedAt) continue;

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
            await this.releaseClaim(row.id, claimedAt);
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
            await this.releaseClaim(row.id, claimedAt);
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
        await this.releaseClaim(row.id, claimedAt);
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

  /**
   * INT-05 atomik claim. Yagona `updateMany` — WHERE'da «hali import
   * qilinmagan VA (band emas YOKI bandligi eskirgan)» sharti bor, shuning
   * uchun qatorni faqat BITTA raqib ola oladi: yutqazgani `count === 0`
   * oladi. Qaytariladigan qiymat — qo'yilgan claim vaqti; uni bo'shatishda
   * ishlatamiz (o'zimizniki ekanini tasdiqlash uchun).
   */
  private async claimRow(accountId: string, rowId: string): Promise<Date | null> {
    const claimedAt = new Date();
    const staleBefore = new Date(claimedAt.getTime() - COMMIT_CLAIM_STALE_MS);
    const { count } = await this.prisma.client.bankStatementRow.updateMany({
      where: {
        id: rowId,
        accountId,
        paymentInId: null,
        paymentOutId: null,
        OR: [{ commitClaimedAt: null }, { commitClaimedAt: { lt: staleBefore } }],
      },
      data: { commitClaimedAt: claimedAt },
    });
    return count === 1 ? claimedAt : null;
  }

  /**
   * Claim'ni bo'shatish — faqat AYNAN o'zimiz qo'ygan claim'ni (WHERE'dagi
   * `commitClaimedAt: claimedAt`), aks holda TTL bo'yicha qatorni allaqachon
   * qayta olgan raqibning claim'ini o'chirib yuborardik. Bo'shatishning o'zi
   * yiqilsa yutamiz: eng yomoni qator TTL tugaguncha band qoladi — bu
   * dublikat to'lovdan ancha arzon.
   */
  private async releaseClaim(rowId: string, claimedAt: Date): Promise<void> {
    try {
      await this.prisma.client.bankStatementRow.updateMany({
        where: { id: rowId, commitClaimedAt: claimedAt, paymentInId: null, paymentOutId: null },
        data: { commitClaimedAt: null },
      });
    } catch {
      // best-effort — TTL baribir qatorni qaytadan olinadigan qiladi.
    }
  }

  /**
   * INT-05 vypiska-dedup: shu bank tranzaksiyasi boshqa (yoki shu) vypiskaning
   * qatoridan allaqachon import qilinganmi?
   *
   * Tabiiy kalit = yo'nalish + moment + summa + hujjat raqami + kontragent
   * hisob raqami. Bank vypiskasida aynan shu beshlik bir tranzaksiyani
   * ajratadi; fayl nomi yoki qator raqami emas (qayta yuklashda o'zgaradi).
   * `null` maydonlar Prisma'da `IS NULL` bo'lib solishtiriladi — ya'ni
   * «hujjat raqami yo'q» qator faqat yana «hujjat raqami yo'q» qator bilan
   * dublikat hisoblanadi.
   */
  private async findImportedTwin(
    accountId: string,
    row: {
      id: string;
      direction: string;
      moment: Date;
      amountMinor: bigint;
      documentNumber: string | null;
      counterpartyAccount: string | null;
    },
  ): Promise<{ id: string; statementId: string } | null> {
    const twin = await this.prisma.client.bankStatementRow.findFirst({
      where: {
        accountId,
        id: { not: row.id },
        direction: row.direction,
        moment: row.moment,
        amountMinor: row.amountMinor,
        documentNumber: row.documentNumber,
        counterpartyAccount: row.counterpartyAccount,
        OR: [{ paymentInId: { not: null } }, { paymentOutId: { not: null } }],
      },
      select: { id: true, statementId: true },
    });
    return twin ?? null;
  }

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
