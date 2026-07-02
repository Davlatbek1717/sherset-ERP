import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  MoyskladListParams,
  MoyskladListResponse,
  MoyskladSingleResponse,
} from './moysklad-compat.types.js';

/**
 * moysklad-compat service. Translates between our internal Prisma models
 * and the moysklad API wire shape (`{meta: {...}, rows: [...]}`).
 *
 * Slug-driven dispatch: each entity slug points to its Prisma client
 * delegate + a list of FK fields that need to be wrapped as Meta refs.
 *
 * This is a thin shim — the heavy lifting (validation, business rules)
 * still happens in the entity-specific services. The shim just adapts
 * URL/payload shapes.
 */

interface SlugConfig {
  /** moysklad's entity type name (used in `meta.type`). */
  type: string;
  /** Prisma model name as a key on PrismaClient. */
  model: string;
  /** Field names that hold UUID FKs. The shim wraps them as Meta refs. */
  fkFields?: string[];
  /** Field aliases: moysklad's name → our column name. */
  aliases?: Record<string, string>;
  /** Base path under our internal API (when redirecting writes). */
  internalPath?: string;
}

const SLUGS: Record<string, SlugConfig> = {
  counterparty: {
    type: 'counterparty',
    model: 'counterparty',
    fkFields: ['ownerId', 'groupId', 'priceTypeId', 'stateId', 'bonusProgramId'],
    internalPath: 'counterparties',
  },
  product: {
    type: 'product',
    model: 'product',
    fkFields: ['ownerId', 'groupId', 'productFolderId', 'supplierId'],
    internalPath: 'products',
  },
  organization: {
    type: 'organization',
    model: 'organization',
    fkFields: ['ownerId', 'groupId', 'bonusProgramId'],
    internalPath: 'admin/organizations',
  },
  employee: {
    type: 'employee',
    model: 'employee',
    fkFields: ['ownerId', 'groupId'],
    internalPath: 'admin/employees',
  },
  store: {
    type: 'store',
    model: 'store',
    fkFields: ['ownerId', 'groupId', 'parentId'],
    internalPath: 'admin/stores',
  },
  productfolder: {
    type: 'productfolder',
    model: 'productFolder',
    fkFields: ['ownerId', 'groupId', 'parentId'],
    internalPath: 'product-folders',
  },
  customerorder: {
    type: 'customerorder',
    model: 'customerOrder',
    fkFields: [
      'ownerId',
      'groupId',
      'agentId',
      'agentAccountId',
      'organizationId',
      'organizationAccountId',
      'storeId',
      'salesChannelId',
    ],
    internalPath: 'customer-orders',
  },
  demand: {
    type: 'demand',
    model: 'demand',
    fkFields: [
      'ownerId',
      'groupId',
      'agentId',
      'agentAccountId',
      'organizationId',
      'organizationAccountId',
      'storeId',
      'customerOrderId',
      'salesChannelId',
    ],
    internalPath: 'demands',
  },
  invoiceout: {
    type: 'invoiceout',
    model: 'invoiceOut',
    fkFields: [
      'ownerId',
      'groupId',
      'agentId',
      'agentAccountId',
      'organizationId',
      'organizationAccountId',
      'storeId',
      'salesChannelId',
      'customerOrderId',
    ],
    internalPath: 'invoices-out',
  },
  // ===== Sprint 25 expansion — full coverage for shipped doc/ref types ====
  // Document types
  supply: {
    type: 'supply',
    model: 'supply',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'purchaseOrderId'],
    internalPath: 'supplies',
  },
  purchaseorder: {
    type: 'purchaseorder',
    model: 'purchaseOrder',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId'],
    internalPath: 'purchase-orders',
  },
  invoicein: {
    type: 'invoicein',
    model: 'invoiceIn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'purchaseOrderId'],
    internalPath: 'invoices-in',
  },
  salesreturn: {
    type: 'salesreturn',
    model: 'salesReturn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'demandId'],
    internalPath: 'sales-returns',
  },
  purchasereturn: {
    type: 'purchasereturn',
    model: 'purchaseReturn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'supplyId'],
    internalPath: 'purchase-returns',
  },
  paymentin: {
    type: 'paymentin',
    model: 'paymentIn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'organizationAccountId'],
    internalPath: 'payments-in',
  },
  paymentout: {
    type: 'paymentout',
    model: 'paymentOut',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'organizationAccountId'],
    internalPath: 'payments-out',
  },
  cashin: {
    type: 'cashin',
    model: 'cashIn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'cashDeskId'],
    internalPath: 'cash-in',
  },
  cashout: {
    type: 'cashout',
    model: 'cashOut',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'cashDeskId'],
    internalPath: 'cash-out',
  },
  move: {
    type: 'move',
    model: 'move',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'sourceStoreId', 'destinationStoreId'],
    internalPath: 'moves',
  },
  loss: {
    type: 'loss',
    model: 'loss',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId'],
    internalPath: 'losses',
  },
  enter: {
    type: 'enter',
    model: 'enter',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId'],
    internalPath: 'enters',
  },
  inventory: {
    type: 'inventory',
    model: 'inventory',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId'],
    internalPath: 'inventories',
  },
  retaildemand: {
    type: 'retaildemand',
    model: 'retailSale',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'cashierSessionId'],
    internalPath: 'retail-sales',
  },
  retailshift: {
    type: 'retailshift',
    model: 'cashierSession',
    fkFields: ['ownerId', 'organizationId', 'storeId', 'cashDeskId'],
    internalPath: 'cashier-sessions',
  },
  production: {
    type: 'production',
    model: 'production',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId', 'customerOrderId'],
    internalPath: 'productions',
  },
  processingorder: {
    type: 'processingorder',
    model: 'processingOrder',
    fkFields: [
      'ownerId',
      'groupId',
      'organizationId',
      'storeId',
      'productionId',
      'processingPlanId',
    ],
    internalPath: 'processing-orders',
  },
  // Reference data
  variant: {
    type: 'variant',
    model: 'variant',
    fkFields: ['productId'],
    internalPath: 'variants',
  },
  bundle: {
    type: 'bundle',
    model: 'bundle',
    fkFields: ['ownerId', 'groupId', 'productFolderId'],
    internalPath: 'bundles',
  },
  contactperson: {
    type: 'contactperson',
    model: 'contactPerson',
    fkFields: ['ownerId', 'counterpartyId'],
    internalPath: 'contact-persons',
  },
  pricetype: {
    type: 'pricetype',
    model: 'priceType',
    internalPath: 'price-types',
  },
  cashdesk: {
    type: 'cashdesk',
    model: 'cashDesk',
    fkFields: ['ownerId', 'organizationId'],
    internalPath: 'cash-desks',
  },
  task: {
    type: 'task',
    model: 'task',
    fkFields: ['ownerId', 'assigneeId', 'agentId'],
    internalPath: 'tasks',
  },
  pipeline: {
    type: 'pipeline',
    model: 'pipeline',
    fkFields: ['ownerId', 'groupId'],
    internalPath: 'pipelines',
  },
  opportunity: {
    type: 'opportunity',
    model: 'opportunity',
    fkFields: ['ownerId', 'groupId', 'agentId', 'pipelineId', 'pipelineStageId'],
    internalPath: 'opportunities',
  },
  call: {
    type: 'call',
    model: 'call',
    fkFields: ['ownerId', 'groupId', 'counterpartyId', 'contactPersonId'],
    internalPath: 'calls',
  },
  saleschannel: {
    type: 'saleschannel',
    model: 'salesChannel',
    fkFields: ['ownerId', 'groupId'],
    internalPath: 'sales-channels',
  },
  onlineorder: {
    type: 'onlineorder',
    model: 'onlineOrder',
    fkFields: ['ownerId', 'salesChannelId', 'agentId', 'storeId'],
    internalPath: 'online-orders',
  },
  webhook: {
    type: 'webhook',
    model: 'webhook',
    internalPath: 'webhook',
  },
  webhookstock: {
    type: 'webhookstock',
    model: 'webhookStock',
    internalPath: 'webhookstock',
  },
  servicerequest: {
    type: 'servicerequest',
    model: 'serviceRequest',
    fkFields: ['ownerId', 'groupId', 'assigneeId', 'counterpartyId', 'contactPersonId'],
    internalPath: 'service-requests',
  },
};

const BASE_HREF = process.env.API_BASE_URL ?? 'http://localhost:4000';

@Injectable()
export class MoyskladCompatService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    accountId: string,
    employeeId: string,
    slug: string,
    params: MoyskladListParams,
  ): Promise<MoyskladListResponse> {
    const config = this.requireConfig(slug);
    const delegate = (this.prisma.client as unknown as Record<string, any>)[config.model];
    if (!delegate?.findMany) {
      throw new NotFoundException(`Slug ${slug} not connected`);
    }

    const where: Record<string, unknown> = { accountId };
    if ('archived' in (delegate.fields ?? {}) || true) {
      // Default: active only — matches moysklad's behaviour where archived
      // rows require explicit `?filter=archived=true`.
      where.archived = false;
    }
    // Best-effort search across name + code (accountable for most entities)
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const limit = Math.min(Math.max(params.limit, 1), 1000);
    const offset = Math.max(params.offset, 0);

    const [rows, size] = await Promise.all([
      delegate.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: this.parseOrder(params.order ?? 'updatedAt,desc'),
      }),
      delegate.count({ where }),
    ]);

    return {
      context: {
        employee: {
          meta: {
            href: `${BASE_HREF}/api/remap/1.2/context/employee`,
            metadataHref: `${BASE_HREF}/api/remap/1.2/entity/employee/metadata`,
            type: 'employee',
            mediaType: 'application/json',
          },
        },
      },
      meta: {
        href: this.listHref(slug, limit, offset),
        type: config.type,
        mediaType: 'application/json',
        size,
        limit,
        offset,
        nextHref: offset + limit < size ? this.listHref(slug, limit, offset + limit) : undefined,
        previousHref:
          offset > 0 ? this.listHref(slug, limit, Math.max(0, offset - limit)) : undefined,
      },
      rows: rows.map((r: unknown) => this.wrap(slug, r as Record<string, unknown>, config)),
    };
  }

  async getById(accountId: string, slug: string, id: string): Promise<MoyskladSingleResponse> {
    const config = this.requireConfig(slug);
    const delegate = (this.prisma.client as unknown as Record<string, any>)[config.model];
    const row = await delegate.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`${slug}/${id} not found`);
    return this.wrap(slug, row as Record<string, unknown>, config) as MoyskladSingleResponse;
  }

  async metadata(slug: string): Promise<unknown> {
    const config = this.requireConfig(slug);
    return {
      meta: {
        href: `${BASE_HREF}/api/remap/1.2/entity/${slug}/metadata`,
        type: 'metadata',
        mediaType: 'application/json',
      },
      attributes: {
        meta: {
          href: `${BASE_HREF}/api/remap/1.2/entity/${slug}/metadata/attributes`,
          type: 'attributemetadata',
          mediaType: 'application/json',
          size: 0,
          limit: 1000,
          offset: 0,
        },
      },
      states: [],
      tags: [],
      // Mirror moysklad's createShared default
      createShared: false,
    };
  }

  /** Returns slugs we currently support — for the discovery endpoint. */
  supportedSlugs(): string[] {
    return Object.keys(SLUGS);
  }

  // ---- internals ----

  private requireConfig(slug: string): SlugConfig {
    const c = SLUGS[slug];
    if (!c) throw new NotFoundException(`Unknown slug: ${slug}`);
    return c;
  }

  private parseOrder(order: string): Record<string, 'asc' | 'desc'> {
    const [field = 'updatedAt', direction = 'desc'] = order.split(',');
    return { [field]: direction === 'desc' ? 'desc' : 'asc' };
  }

  private listHref(slug: string, limit: number, offset: number): string {
    return `${BASE_HREF}/api/remap/1.2/entity/${slug}?limit=${limit}&offset=${offset}`;
  }

  private singleHref(slug: string, id: string): string {
    return `${BASE_HREF}/api/remap/1.2/entity/${slug}/${id}`;
  }

  /**
   * Wrap a row with a moysklad-style {meta, ...fields} envelope, replacing
   * FK columns with Meta references and dropping internal-only fields
   * (accountId is leaked at top-level for moysklad parity but FK fields
   * become Meta refs).
   */
  private wrap(
    slug: string,
    row: Record<string, unknown>,
    config: SlugConfig,
  ): Record<string, unknown> {
    const id = String(row.id);
    const out: Record<string, unknown> = {
      meta: {
        href: this.singleHref(slug, id),
        metadataHref: `${BASE_HREF}/api/remap/1.2/entity/${slug}/metadata`,
        type: config.type,
        mediaType: 'application/json',
      },
      id,
      accountId: row.accountId,
      // moysklad uses ISO strings
      created: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updated: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    };

    for (const [k, v] of Object.entries(row)) {
      if (k === 'id' || k === 'accountId' || k === 'createdAt' || k === 'updatedAt') continue;
      // Convert BigInt to number (moysklad serialises money as number — UI
      // does the divide-by-100 separately).
      if (typeof v === 'bigint') {
        out[k] = Number(v);
        continue;
      }
      // FK columns get wrapped as Meta refs
      if (config.fkFields?.includes(k) && typeof v === 'string') {
        const targetType = this.guessTypeFromFkName(k);
        out[k.replace(/Id$/, '')] = {
          meta: {
            href: `${BASE_HREF}/api/remap/1.2/entity/${targetType}/${v}`,
            type: targetType,
            mediaType: 'application/json',
          },
        };
        continue;
      }
      out[k] = v;
    }
    return out;
  }

  /** Best-effort: 'agentId' → 'counterparty', 'storeId' → 'store'. */
  private guessTypeFromFkName(fk: string): string {
    const base = fk.replace(/Id$/, '');
    const map: Record<string, string> = {
      agent: 'counterparty',
      organization: 'organization',
      store: 'store',
      owner: 'employee',
      group: 'group',
      productFolder: 'productfolder',
      priceType: 'pricetype',
      bonusProgram: 'bonusprogram',
      state: 'state',
      salesChannel: 'saleschannel',
      customerOrder: 'customerorder',
      agentAccount: 'counterpartyaccount',
      organizationAccount: 'account',
      supplier: 'counterparty',
      parent: base, // self-referential
    };
    return map[base] ?? base.toLowerCase();
  }
}
