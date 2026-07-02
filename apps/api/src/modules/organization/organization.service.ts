import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateOrganizationInput,
  CreateOrganizationSchema,
  type OrganizationAccountInput,
  OrganizationFilterSchema,
  type UpdateOrganizationInput,
  UpdateOrganizationSchema,
} from './organization.schema.js';

@Injectable()
export class OrganizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = OrganizationFilterSchema.parse(rawFilter);
    const where: Prisma.OrganizationWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search
        ? {
            // Search box placeholder promises «Название или ИНН» — honor the INN
            // too. INN lives in the uzRequisites JSON ({ inn: "STIR", ... }), so
            // match it via a JSON-path string filter (INN is digits → case is moot).
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { legalTitle: { contains: filter.search, mode: 'insensitive' } },
              { uzRequisites: { path: ['inn'], string_contains: filter.search } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.organization.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.organization.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.organization.findFirst({
      where: { id, accountId },
      include: {
        // Full account fields — the org editor renders them inline as moysklad
        // «Расчётный счёт» cards (БИК/Банк/Адрес/Корр.счёт/name/Валюта/остаток/
        // Основной). Ordered by creation so the card order is stable across loads.
        accounts: {
          where: { archived: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            currency: true,
            isDefault: true,
            bankName: true,
            bankLocation: true,
            accountNumber: true,
            correspondentAccount: true,
            bic: true,
            balanceMinor: true,
            version: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Organization ${id} not found`);
    // BigInt balance → string for safe JSON transport (mirrors the account service).
    return {
      ...row,
      accounts: row.accounts.map((a) => ({ ...a, balanceMinor: a.balanceMinor.toString() })),
    };
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    return this.prisma.client.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          accountId,
          name: parsed.name,
          legalTitle: parsed.legalTitle ?? null,
          legalAddress: parsed.legalAddress ?? null,
          companyType: parsed.companyType,
          email: parsed.email ?? null,
          phone: parsed.phone ?? null,
          director: parsed.director ?? null,
          directorPosition: parsed.directorPosition ?? null,
          chiefAccountant: parsed.chiefAccountant ?? null,
          externalCode: parsed.externalCode ?? null,
          payerVat: parsed.payerVat,
          uzRequisites: parsed.uzRequisites ?? Prisma.JsonNull,
        },
      });
      if (parsed.accounts?.length) {
        await this.syncAccounts(tx, accountId, org.id, parsed.accounts);
      }
      return org;
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);
    const data: Prisma.OrganizationUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.legalTitle !== undefined) data.legalTitle = parsed.legalTitle;
    if (parsed.legalAddress !== undefined) data.legalAddress = parsed.legalAddress;
    if (parsed.companyType !== undefined) data.companyType = parsed.companyType;
    if (parsed.email !== undefined) data.email = parsed.email;
    if (parsed.phone !== undefined) data.phone = parsed.phone;
    if (parsed.director !== undefined) data.director = parsed.director;
    if (parsed.directorPosition !== undefined) data.directorPosition = parsed.directorPosition;
    if (parsed.chiefAccountant !== undefined) data.chiefAccountant = parsed.chiefAccountant;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.payerVat !== undefined) data.payerVat = parsed.payerVat;
    if (parsed.uzRequisites !== undefined) {
      data.uzRequisites = parsed.uzRequisites ?? Prisma.JsonNull;
    }
    try {
      // Org fields + inline settlement accounts save ATOMICALLY in one
      // transaction (moysklad parity: a single «Сохранить» persists everything,
      // or nothing). Optimistic lock: the `version` filter only matches if the
      // row is unchanged since the form loaded — a stale version matches zero
      // rows → Prisma P2025 → 409, which aborts the whole tx (account writes
      // roll back too). findById above already proved the row exists, so a
      // P2025 here can only be a conflict.
      return await this.prisma.client.$transaction(async (tx) => {
        const org = await tx.organization.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
        // `accounts === undefined` → the caller didn't touch accounts (leave them).
        // An explicit array (even empty) is the FULL desired set (replace semantics).
        if (parsed.accounts !== undefined) {
          await this.syncAccounts(tx, accountId, id, parsed.accounts);
        }
        return org;
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Organization');
      throw e;
    }
  }

  /**
   * Reconcile an organization's settlement accounts against the FULL desired set
   * sent by the inline editor (moysklad «Расчётные счета»). Runs INSIDE the org
   * save transaction so a failure rolls the whole save back.
   *
   *  - id present & belongs to this org → update (bumps the account's version).
   *  - id absent → create.
   *  - existing account missing from the set → ARCHIVE (soft-delete), never hard
   *    delete — the FK graph is `onDelete: SetNull`, so a hard delete would silently
   *    null a draft/config row's account binding. Archiving preserves the bindings.
   *  - finally normalise: at most ONE «Основной счёт» per currency.
   *
   * A supplied `id` that is not one of THIS org's live accounts is rejected — it
   * blocks hijacking another org's (or tenant's) account through this endpoint.
   */
  private async syncAccounts(
    tx: Prisma.TransactionClient,
    accountId: string,
    organizationId: string,
    accounts: OrganizationAccountInput[],
  ): Promise<void> {
    const existing = await tx.organizationAccount.findMany({
      where: { accountId, organizationId, archived: false },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    for (const a of accounts) {
      if (a.id && !existingIds.has(a.id)) {
        throw new BadRequestException(`Hisob-varaq topilmadi: ${a.id}`);
      }
    }
    const keepIds = new Set(accounts.filter((a) => a.id).map((a) => a.id as string));

    // 1. Removals — an existing account dropped from the form. ARCHIVE (soft-delete)
    //    rather than hard-delete: ~20 document/config tables reference
    //    OrganizationAccount with `onDelete: SetNull`, so a hard delete would
    //    SILENTLY null the account binding on a draft document or config row (e.g. a
    //    draft PaymentIn, a RetailStore) — data loss with no error. Archiving hides
    //    the account from the active list yet preserves every binding + its balance,
    //    and it stays restorable in Bank hisoblari → Arxivda. This also means a
    //    removal never throws, so it can't block the unrelated org-field save.
    //    (Adversarial QA 2026-06-21 #1/#4 — docs/audits/org-accounts-qa-2026-06-21.md.)
    for (const e of existing) {
      if (keepIds.has(e.id)) continue;
      await tx.organizationAccount.update({
        where: { id: e.id, accountId },
        data: { archived: true },
      });
    }

    // 2. Upserts — update existing, create new.
    for (const a of accounts) {
      const fields = {
        name: a.name,
        currency: a.currency,
        isDefault: a.isDefault,
        bankName: a.bankName ?? null,
        bankLocation: a.bankLocation ?? null,
        accountNumber: a.accountNumber ?? null,
        correspondentAccount: a.correspondentAccount ?? null,
        bic: a.bic ?? null,
      };
      if (a.id) {
        // Per-account optimistic lock (parity with the standalone account endpoint):
        // a stale `version` matches zero rows → P2025 → the outer catch maps it to a
        // 409 conflict, aborting the whole tx. Guards against a concurrent edit made
        // via the standalone bank-accounts page (which doesn't bump Organization.version).
        await tx.organizationAccount.update({
          where: {
            id: a.id,
            accountId,
            ...(a.version !== undefined ? { version: a.version } : {}),
          },
          data: { ...fields, version: { increment: 1 } },
        });
      } else {
        await tx.organizationAccount.create({
          data: { accountId, organizationId, ...fields },
        });
      }
    }

    // 3. Normalise: keep at most one «Основной счёт» per currency. The FE radio
    //    already enforces this, but a malformed payload must not persist two
    //    defaults (which would make the document account auto-pick ambiguous).
    const defaults = await tx.organizationAccount.findMany({
      where: { accountId, organizationId, archived: false, isDefault: true },
      select: { id: true, currency: true },
      orderBy: { createdAt: 'asc' },
    });
    const seenCurrency = new Set<string>();
    for (const d of defaults) {
      if (seenCurrency.has(d.currency)) {
        await tx.organizationAccount.update({
          where: { id: d.id, accountId },
          data: { isDefault: false },
        });
      } else {
        seenCurrency.add(d.currency);
      }
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.organization.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.organization.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    // Block deletion if the org is referenced by any document. Cascade to
    // child tables would orphan ledgers, so instead we ask the user to
    // archive the org or migrate documents to a different organization
    // (out-of-band tooling).
    const refs = await this.prisma.client.$transaction([
      this.prisma.client.demand.count({ where: { accountId, organizationId: id } }),
      this.prisma.client.invoiceOut.count({ where: { accountId, organizationId: id } }),
      this.prisma.client.supply.count({ where: { accountId, organizationId: id } }),
      this.prisma.client.paymentIn.count({ where: { accountId, organizationId: id } }),
    ]);
    const total = refs.reduce((s, n) => s + n, 0);
    if (total > 0) {
      throw new BadRequestException(
        `Tashkilot ${total} ta hujjatda ishlatilgan — o'chirib bo'lmaydi (arxivlang)`,
      );
    }
    await this.prisma.client.organization.delete({ where: { id, accountId } });
    return { ok: true };
  }

  private parseCreate(raw: unknown): CreateOrganizationInput {
    const r = CreateOrganizationSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateOrganizationInput {
    const r = UpdateOrganizationSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
