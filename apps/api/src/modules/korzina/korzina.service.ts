import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * KorzinaService — moysklad parity Recycle Bin.
 *
 * Backed by `deletedAt` columns on every business-document model. A
 * delete in any list page is a soft-delete (sets deletedAt = now). The
 * row stays queryable from korzina for 30 days. After that an
 * @Cron-driven sweep purges them permanently.
 *
 * Cross-model fan-out: the public list endpoint reads from every model
 * that owns a deletedAt column. We model the union via a typed
 * `EntityKey` enum + per-key handlers — no eval, no string-keyed
 * Prisma access. Adding a new soft-delete model = one entry in the
 * `HANDLERS` map.
 */

export type EntityKey =
  | 'cash_in'
  | 'cash_out'
  | 'customer_order'
  | 'demand'
  | 'enter'
  | 'inventory'
  | 'invoice_in'
  | 'invoice_out'
  | 'loss'
  | 'move'
  | 'payment_in'
  | 'payment_out'
  | 'product'
  | 'purchase_order'
  | 'purchase_return'
  | 'retail_sale'
  | 'sales_return'
  | 'supply';

export interface KorzinaItem {
  entity: EntityKey;
  id: string;
  name: string;
  deletedAt: string;
  /** Optional secondary line — typically the agent or store name. */
  secondary?: string | null;
}

interface Handler {
  list: (
    accountId: string,
    take: number,
    search?: string,
  ) => Promise<{ id: string; name: string; deletedAt: Date | null; secondary?: string | null }[]>;
  restore: (accountId: string, id: string) => Promise<{ ok: true } | null>;
  purge: (accountId: string, id: string) => Promise<{ ok: true } | null>;
}

/**
 * Generic Prisma delegate shape — loose enough for every model's typed
 * delegate to satisfy. The Korzina is cross-entity by nature: we erase
 * Prisma's per-model `WhereInput` types here and enforce correctness
 * through the typed `EntityKey` enum + the `handlers` wiring instead.
 *
 * Why `any` for `args` instead of `unknown`: TypeScript function-arg
 * variance forbids assigning a typed delegate (which expects a strict
 * input shape) to a hypothetical `unknown`-arg signature (which would
 * accept literally anything). Using `any` lets every Prisma delegate
 * satisfy the shape since its typed input is assignable to `any`.
 * Correctness is enforced by the in-method object literals — they're
 * checked against this loose shape but written by hand to match the
 * column set every soft-delete model carries.
 */
type AnyDelegate = {
  // biome-ignore lint/suspicious/noExplicitAny: cross-model adapter (see comment above)
  findMany: (args: any) => Promise<any[]>;
  // biome-ignore lint/suspicious/noExplicitAny: cross-model adapter
  updateMany: (args: any) => Promise<{ count: number }>;
  // biome-ignore lint/suspicious/noExplicitAny: cross-model adapter
  deleteMany: (args: any) => Promise<{ count: number }>;
};

@Injectable()
export class KorzinaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Default page size for cross-entity union list. Caller can override
   * via `?limit=`. We keep the default low (50) because the user is
   * usually scanning recent deletions.
   */
  private readonly DEFAULT_LIMIT = 50;

  /** Days after which deleted rows are permanently purged. */
  private readonly RETENTION_DAYS = 30;

  /**
   * Cross-entity union list. Caller can filter to a specific entity via
   * `?entity=...`. Sorted by deletedAt descending (newest first).
   */
  async list(
    accountId: string,
    rawFilter: {
      entity?: string;
      search?: string;
      limit?: string;
      sortBy?: string;
      sortDir?: string;
    },
  ): Promise<{ items: KorzinaItem[]; total: number }> {
    const limit = Math.min(
      Math.max(Number.parseInt(rawFilter.limit ?? '', 10) || this.DEFAULT_LIMIT, 1),
      200,
    );
    const sortBy = rawFilter.sortBy === 'name' ? 'name' : 'deletedAt';
    const sortDir = rawFilter.sortDir === 'asc' ? 'asc' : 'desc';

    const allKeys = Object.keys(this.handlers) as EntityKey[];
    const targets =
      rawFilter.entity && rawFilter.entity in this.handlers
        ? [rawFilter.entity as EntityKey]
        : allKeys;

    const results = await Promise.all(
      targets.map(async (key) => {
        const rows = await this.handlers[key].list(accountId, limit, rawFilter.search);
        return rows.map((r) => ({
          entity: key,
          id: r.id,
          name: r.name,
          deletedAt: (r.deletedAt as Date).toISOString(),
          secondary: r.secondary ?? null,
        }));
      }),
    );

    // Merge + sort + cap. Each handler already capped at `limit`, so
    // worst-case we sort `limit * targets.length` rows — fine at our
    // scale (cap is 200 × 18 = 3600 in-memory items).
    const merged = results.flat();
    if (sortBy === 'name') {
      merged.sort((a, b) =>
        sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
      );
    } else {
      merged.sort((a, b) =>
        sortDir === 'asc'
          ? a.deletedAt.localeCompare(b.deletedAt)
          : b.deletedAt.localeCompare(a.deletedAt),
      );
    }

    return {
      items: merged.slice(0, limit),
      total: merged.length,
    };
  }

  /** Restore a single row by entity + id. */
  async restore(accountId: string, entity: string, id: string) {
    const handler = this.handlers[entity as EntityKey];
    if (!handler) {
      throw new BadRequestException(`Noma'lum entity: ${entity}`);
    }
    const result = await handler.restore(accountId, id);
    if (!result) {
      throw new NotFoundException(`${entity} ${id} topilmadi yoki o'chirilmagan`);
    }
    return result;
  }

  /** Permanently purge a single row by entity + id. */
  async purge(accountId: string, entity: string, id: string) {
    const handler = this.handlers[entity as EntityKey];
    if (!handler) {
      throw new BadRequestException(`Noma'lum entity: ${entity}`);
    }
    const result = await handler.purge(accountId, id);
    if (!result) {
      throw new NotFoundException(`${entity} ${id} topilmadi yoki o'chirilmagan`);
    }
    return result;
  }

  /**
   * Empty the entire Recycle Bin — purge every soft-deleted row across
   * every entity. Mirrors moysklad's "Очистить корзину" button.
   *
   * Returns the number of rows purged per entity for the success toast.
   */
  async empty(accountId: string): Promise<Record<EntityKey, number>> {
    const counts = {} as Record<EntityKey, number>;
    for (const key of Object.keys(this.handlers) as EntityKey[]) {
      // Each handler sweeps all soft-deleted rows for the account.
      const rows = await this.handlers[key].list(accountId, 1000);
      for (const r of rows) {
        await this.handlers[key].purge(accountId, r.id).catch(() => null);
      }
      counts[key] = rows.length;
    }
    return counts;
  }

  /**
   * 30-day retention sweep — called by the cron worker. Removes any
   * soft-deleted row older than RETENTION_DAYS.
   */
  async pruneOldEntries(): Promise<{ purged: number }> {
    const cutoff = new Date(Date.now() - this.RETENTION_DAYS * 86_400_000);
    let total = 0;
    // Each handler is per-account-keyed; for the cron we just sweep
    // anything older than cutoff regardless of account.
    for (const key of Object.keys(this.handlers) as EntityKey[]) {
      // We use raw deleteMany via prisma client — bypass the per-account
      // restriction since the cron is system-level.
      const delegate = this.delegateFor(key);
      const res = await delegate.deleteMany({
        where: { deletedAt: { lt: cutoff } },
      });
      total += res.count;
    }
    return { purged: total };
  }

  private delegateFor(key: EntityKey): AnyDelegate {
    const map: Record<EntityKey, unknown> = {
      cash_in: this.prisma.client.cashIn,
      cash_out: this.prisma.client.cashOut,
      customer_order: this.prisma.client.customerOrder,
      demand: this.prisma.client.demand,
      enter: this.prisma.client.enter,
      inventory: this.prisma.client.inventory,
      invoice_in: this.prisma.client.invoiceIn,
      invoice_out: this.prisma.client.invoiceOut,
      loss: this.prisma.client.loss,
      move: this.prisma.client.move,
      payment_in: this.prisma.client.paymentIn,
      payment_out: this.prisma.client.paymentOut,
      product: this.prisma.client.product,
      purchase_order: this.prisma.client.purchaseOrder,
      purchase_return: this.prisma.client.purchaseReturn,
      retail_sale: this.prisma.client.retailSale,
      sales_return: this.prisma.client.salesReturn,
      supply: this.prisma.client.supply,
    };
    return map[key] as never;
  }

  // =====================================================================
  // Per-entity handlers — each lists, restores, purges its own rows
  // =====================================================================
  //
  // All 18 handlers follow the same shape. Slight per-entity variation
  // exists in the secondary line (e.g. invoice has agent.name; retail-
  // sale has store.name). Where there's no good secondary value the
  // handler returns null and the UI just doesn't render the line.

  private docList = (
    delegate: AnyDelegate,
    secondaryField: 'agent' | 'store' | 'organization' | null,
    nameField: 'name' | 'title' = 'name',
  ) => {
    return async (accountId: string, take: number, search?: string) => {
      const where: Record<string, unknown> = {
        accountId,
        deletedAt: { not: null },
      };
      if (search) {
        where[nameField] = { contains: search, mode: 'insensitive' };
      }
      const select: Record<string, unknown> = {
        id: true,
        [nameField]: true,
        deletedAt: true,
      };
      if (secondaryField) {
        select[secondaryField] = { select: { id: true, name: true } };
      }
      const rows = (await delegate.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        take,
        select,
      })) as Array<{
        id: string;
        deletedAt: Date | null;
        name?: string;
        title?: string;
        agent?: { name: string } | null;
        store?: { name: string } | null;
        organization?: { name: string } | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        name: (nameField === 'name' ? r.name : r.title) ?? '—',
        deletedAt: r.deletedAt,
        secondary:
          secondaryField === 'agent'
            ? (r.agent?.name ?? null)
            : secondaryField === 'store'
              ? (r.store?.name ?? null)
              : secondaryField === 'organization'
                ? (r.organization?.name ?? null)
                : null,
      }));
    };
  };

  private docRestore = (delegate: AnyDelegate) => {
    return async (accountId: string, id: string) => {
      const res = await delegate.updateMany({
        where: { id, accountId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      return res.count > 0 ? ({ ok: true } as const) : null;
    };
  };

  private docPurge = (delegate: AnyDelegate) => {
    return async (accountId: string, id: string) => {
      const res = await delegate.deleteMany({
        where: { id, accountId, deletedAt: { not: null } },
      });
      return res.count > 0 ? ({ ok: true } as const) : null;
    };
  };

  private get handlers(): Record<EntityKey, Handler> {
    const c = this.prisma.client;
    return {
      cash_in: {
        list: this.docList(c.cashIn, 'agent'),
        restore: this.docRestore(c.cashIn),
        purge: this.docPurge(c.cashIn),
      },
      cash_out: {
        list: this.docList(c.cashOut, 'agent'),
        restore: this.docRestore(c.cashOut),
        purge: this.docPurge(c.cashOut),
      },
      customer_order: {
        list: this.docList(c.customerOrder, 'agent'),
        restore: this.docRestore(c.customerOrder),
        purge: this.docPurge(c.customerOrder),
      },
      demand: {
        list: this.docList(c.demand, 'agent'),
        restore: this.docRestore(c.demand),
        purge: this.docPurge(c.demand),
      },
      enter: {
        list: this.docList(c.enter, 'store'),
        restore: this.docRestore(c.enter),
        purge: this.docPurge(c.enter),
      },
      inventory: {
        list: this.docList(c.inventory, 'store'),
        restore: this.docRestore(c.inventory),
        purge: this.docPurge(c.inventory),
      },
      invoice_in: {
        list: this.docList(c.invoiceIn, 'agent'),
        restore: this.docRestore(c.invoiceIn),
        purge: this.docPurge(c.invoiceIn),
      },
      invoice_out: {
        list: this.docList(c.invoiceOut, 'agent'),
        restore: this.docRestore(c.invoiceOut),
        purge: this.docPurge(c.invoiceOut),
      },
      loss: {
        list: this.docList(c.loss, 'store'),
        restore: this.docRestore(c.loss),
        purge: this.docPurge(c.loss),
      },
      move: {
        list: this.docList(c.move, null),
        restore: this.docRestore(c.move),
        purge: this.docPurge(c.move),
      },
      payment_in: {
        list: this.docList(c.paymentIn, 'agent'),
        restore: this.docRestore(c.paymentIn),
        purge: this.docPurge(c.paymentIn),
      },
      payment_out: {
        list: this.docList(c.paymentOut, 'agent'),
        restore: this.docRestore(c.paymentOut),
        purge: this.docPurge(c.paymentOut),
      },
      product: {
        list: this.docList(c.product, null),
        restore: this.docRestore(c.product),
        purge: this.docPurge(c.product),
      },
      purchase_order: {
        list: this.docList(c.purchaseOrder, 'agent'),
        restore: this.docRestore(c.purchaseOrder),
        purge: this.docPurge(c.purchaseOrder),
      },
      purchase_return: {
        list: this.docList(c.purchaseReturn, 'agent'),
        restore: this.docRestore(c.purchaseReturn),
        purge: this.docPurge(c.purchaseReturn),
      },
      retail_sale: {
        list: this.docList(c.retailSale, 'store'),
        restore: this.docRestore(c.retailSale),
        purge: this.docPurge(c.retailSale),
      },
      sales_return: {
        list: this.docList(c.salesReturn, 'agent'),
        restore: this.docRestore(c.salesReturn),
        purge: this.docPurge(c.salesReturn),
      },
      supply: {
        list: this.docList(c.supply, 'agent'),
        restore: this.docRestore(c.supply),
        purge: this.docPurge(c.supply),
      },
    };
  }
}
