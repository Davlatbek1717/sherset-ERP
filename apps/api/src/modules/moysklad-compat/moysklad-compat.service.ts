import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CompatSlug } from './compat-slugs.js';
import { buildListQuery, scalarFieldTypes } from './moysklad-compat.query.js';
import type {
  MoyskladListParams,
  MoyskladListResponse,
  MoyskladSingleResponse,
} from './moysklad-compat.types.js';
import {
  type AttrDef,
  REFERENCE_ENTITY_SLUGS,
  buildAttributesArray,
  parseExpand,
  toUzsMinor,
} from './moysklad-compat.wire.js';

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
 *
 * Hrefs are built from the caller's request (proto/host headers) so they
 * always point at the URL the client actually reached us on — deriving them
 * from env proved fragile (pm2 keeps a stale env snapshot across restarts).
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
  /** Prisma delegate + parent-FK for the document's positions table. */
  positionModel?: string;
  positionFk?: string;
  /** AttributeMetadata.entity value for this slug (attributes → array). */
  attrEntity?: string;
}

/**
 * Slug → config. Typed against the shared registry (Faza Q14) so a slug
 * added here without adding it to `compat-slugs.ts` — or removed here while
 * still offered by the token scope UI — is a `tsc` error, not a silent
 * mismatch between "what we serve" and "what a scope may name".
 */
const SLUGS: Record<CompatSlug, SlugConfig> = {
  counterparty: {
    type: 'counterparty',
    model: 'counterparty',
    fkFields: ['ownerId', 'groupId', 'priceTypeId', 'stateId', 'bonusProgramId'],
    internalPath: 'counterparties',
    attrEntity: 'Counterparty',
  },
  product: {
    type: 'product',
    model: 'product',
    fkFields: ['ownerId', 'groupId', 'productFolderId', 'supplierId'],
    internalPath: 'products',
    attrEntity: 'Product',
  },
  organization: {
    type: 'organization',
    model: 'organization',
    fkFields: ['ownerId', 'groupId', 'bonusProgramId'],
    internalPath: 'admin/organizations',
    attrEntity: 'Organization',
  },
  employee: {
    type: 'employee',
    model: 'employee',
    fkFields: ['ownerId', 'groupId'],
    internalPath: 'admin/employees',
    attrEntity: 'Employee',
  },
  store: {
    type: 'store',
    model: 'store',
    fkFields: ['ownerId', 'groupId', 'parentId'],
    internalPath: 'admin/stores',
    attrEntity: 'Store',
  },
  productfolder: {
    type: 'productfolder',
    model: 'productFolder',
    fkFields: ['ownerId', 'groupId', 'parentId'],
    internalPath: 'product-folders',
    attrEntity: 'ProductFolder',
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
    positionModel: 'customerOrderPosition',
    positionFk: 'customerOrderId',
    attrEntity: 'CustomerOrder',
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
    positionModel: 'demandPosition',
    positionFk: 'demandId',
    attrEntity: 'Demand',
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
    positionModel: 'invoiceOutPosition',
    positionFk: 'invoiceOutId',
    attrEntity: 'InvoiceOut',
  },
  // ===== Sprint 25 expansion — full coverage for shipped doc/ref types ====
  // Document types
  supply: {
    type: 'supply',
    model: 'supply',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'purchaseOrderId'],
    internalPath: 'supplies',
    positionModel: 'supplyPosition',
    positionFk: 'supplyId',
    attrEntity: 'Supply',
  },
  purchaseorder: {
    type: 'purchaseorder',
    model: 'purchaseOrder',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId'],
    internalPath: 'purchase-orders',
    positionModel: 'purchaseOrderPosition',
    positionFk: 'purchaseOrderId',
    attrEntity: 'PurchaseOrder',
  },
  invoicein: {
    type: 'invoicein',
    model: 'invoiceIn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'purchaseOrderId'],
    internalPath: 'invoices-in',
    positionModel: 'invoiceInPosition',
    positionFk: 'invoiceInId',
    attrEntity: 'InvoiceIn',
  },
  salesreturn: {
    type: 'salesreturn',
    model: 'salesReturn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'demandId'],
    internalPath: 'sales-returns',
    positionModel: 'salesReturnPosition',
    positionFk: 'salesReturnId',
    attrEntity: 'SalesReturn',
  },
  purchasereturn: {
    type: 'purchasereturn',
    model: 'purchaseReturn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'supplyId'],
    internalPath: 'purchase-returns',
    positionModel: 'purchaseReturnPosition',
    positionFk: 'purchaseReturnId',
    attrEntity: 'PurchaseReturn',
  },
  paymentin: {
    type: 'paymentin',
    model: 'paymentIn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'organizationAccountId'],
    internalPath: 'payments-in',
    attrEntity: 'PaymentIn',
  },
  paymentout: {
    type: 'paymentout',
    model: 'paymentOut',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'organizationAccountId'],
    internalPath: 'payments-out',
    attrEntity: 'PaymentOut',
  },
  cashin: {
    type: 'cashin',
    model: 'cashIn',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'cashDeskId'],
    internalPath: 'cash-in',
    attrEntity: 'CashIn',
  },
  cashout: {
    type: 'cashout',
    model: 'cashOut',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'cashDeskId'],
    internalPath: 'cash-out',
    attrEntity: 'CashOut',
  },
  move: {
    type: 'move',
    model: 'move',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'sourceStoreId', 'destinationStoreId'],
    internalPath: 'moves',
    positionModel: 'movePosition',
    positionFk: 'moveId',
    attrEntity: 'Move',
  },
  loss: {
    type: 'loss',
    model: 'loss',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId'],
    internalPath: 'losses',
    positionModel: 'lossPosition',
    positionFk: 'lossId',
    attrEntity: 'Loss',
  },
  enter: {
    type: 'enter',
    model: 'enter',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId'],
    internalPath: 'enters',
    positionModel: 'enterPosition',
    positionFk: 'enterId',
    attrEntity: 'Enter',
  },
  inventory: {
    type: 'inventory',
    model: 'inventory',
    fkFields: ['ownerId', 'groupId', 'organizationId', 'storeId'],
    internalPath: 'inventories',
    positionModel: 'inventoryPosition',
    positionFk: 'inventoryId',
    attrEntity: 'Inventory',
  },
  retaildemand: {
    type: 'retaildemand',
    model: 'retailSale',
    fkFields: ['ownerId', 'groupId', 'agentId', 'organizationId', 'storeId', 'cashierSessionId'],
    internalPath: 'retail-sales',
    positionModel: 'retailSalePosition',
    positionFk: 'retailSaleId',
    attrEntity: 'RetailSale',
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
    attrEntity: 'Variant',
  },
  bundle: {
    type: 'bundle',
    model: 'bundle',
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

/** Fallback when the controller cannot derive a base from the request. */
const ENV_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';

/**
 * String-keyed view of the same object, for runtime lookups where the slug
 * comes from an URL (untrusted `string`). Keeping the literal typed as
 * `Record<CompatSlug, …>` is what makes registry drift a compile error; this
 * alias only relaxes the *read* side.
 */
const SLUG_LOOKUP: Partial<Record<string, SlugConfig>> = SLUGS;

@Injectable()
export class MoyskladCompatService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    accountId: string,
    _employeeId: string,
    slug: string,
    params: MoyskladListParams,
    remapBase = `${ENV_BASE}/api/remap/1.2`,
  ): Promise<MoyskladListResponse> {
    const config = this.requireConfig(slug);
    const delegate = this.requireDelegate(slug, config);

    const expand = parseExpand(
      params.expand,
      this.expandableFkFields(config),
      Boolean(config.positionModel),
    );
    const hasExpand = expand.fields.length > 0 || expand.positions;

    const { where, orderBy } = buildListQuery(scalarFieldTypes(config.model), {
      accountId,
      filter: params.filter,
      order: params.order,
      search: params.search,
    });

    // moysklad caps expand-ed listings at 100 rows; we clamp instead of
    // silently dropping the expand (their client syncs with limit<=100).
    const maxLimit = hasExpand ? 100 : 1000;
    const limit = Math.min(Math.max(params.limit, 1), maxLimit);
    const offset = Math.max(params.offset, 0);

    const [rows, size] = await Promise.all([
      delegate.findMany({ where, take: limit, skip: offset, orderBy }),
      delegate.count({ where }),
    ]);

    const wrapped = await this.wrapMany(accountId, slug, config, rows, remapBase, expand);

    return {
      context: {
        employee: {
          meta: {
            href: `${remapBase}/context/employee`,
            metadataHref: `${remapBase}/entity/employee/metadata`,
            type: 'employee',
            mediaType: 'application/json',
          },
        },
      },
      meta: {
        href: this.listHref(remapBase, slug, limit, offset),
        type: config.type,
        mediaType: 'application/json',
        size,
        limit,
        offset,
        nextHref:
          offset + limit < size ? this.listHref(remapBase, slug, limit, offset + limit) : undefined,
        previousHref:
          offset > 0
            ? this.listHref(remapBase, slug, limit, Math.max(0, offset - limit))
            : undefined,
      },
      rows: wrapped,
    };
  }

  async getById(
    accountId: string,
    slug: string,
    id: string,
    remapBase = `${ENV_BASE}/api/remap/1.2`,
    expandParam?: string[],
  ): Promise<MoyskladSingleResponse> {
    const config = this.requireConfig(slug);
    const delegate = this.requireDelegate(slug, config);
    const expand = parseExpand(
      expandParam,
      this.expandableFkFields(config),
      Boolean(config.positionModel),
    );
    // Soft-deleted rows 404 (parity with our internal API + moysklad trash).
    const where: Record<string, unknown> = { id, accountId };
    if (scalarFieldTypes(config.model).has('deletedAt')) where.deletedAt = null;
    const row = await delegate.findFirst({ where });
    if (!row) throw new NotFoundException(`${slug}/${id} not found`);
    const [wrapped] = await this.wrapMany(accountId, slug, config, [row], remapBase, expand);
    return wrapped as MoyskladSingleResponse;
  }

  /** GET /entity/:slug/:id/positions — moysklad positions sub-collection. */
  async positionsList(
    accountId: string,
    slug: string,
    docId: string,
    opts: { limit: number; offset: number; expand?: string[] },
    remapBase = `${ENV_BASE}/api/remap/1.2`,
  ): Promise<MoyskladListResponse> {
    const config = this.requireConfig(slug);
    if (!config.positionModel || !config.positionFk) {
      throw new NotFoundException(`${slug} has no positions collection`);
    }
    const delegate = this.requireDelegate(slug, config);
    const docWhere: Record<string, unknown> = { id: docId, accountId };
    if (scalarFieldTypes(config.model).has('deletedAt')) docWhere.deletedAt = null;
    const doc = await delegate.findFirst({ where: docWhere });
    if (!doc) throw new NotFoundException(`${slug}/${docId} not found`);

    const withAssortment = (opts.expand ?? []).some(
      (t) => t.trim() === 'assortment' || t.trim() === 'positions.assortment',
    );
    const posDelegate = (this.prisma.client as unknown as Record<string, any>)[
      config.positionModel
    ];
    const limit = Math.min(Math.max(opts.limit, 1), 1000);
    const offset = Math.max(opts.offset, 0);
    const posWhere = { accountId, [config.positionFk]: docId };
    const [posRows, size] = await Promise.all([
      posDelegate.findMany({
        where: posWhere,
        take: limit,
        skip: offset,
        orderBy: { position: 'asc' },
      }),
      posDelegate.count({ where: posWhere }),
    ]);

    const assortmentNames = withAssortment
      ? await this.resolveAssortmentNames(accountId, posRows)
      : new Map<string, string>();
    const rows = posRows.map((p: Record<string, unknown>) =>
      this.wrapPosition(slug, config, doc as Record<string, unknown>, p, remapBase, {
        withNames: withAssortment,
        names: assortmentNames,
      }),
    );

    const collectionHref = `${remapBase}/entity/${slug}/${docId}/positions`;
    return {
      context: {
        employee: {
          meta: {
            href: `${remapBase}/context/employee`,
            metadataHref: `${remapBase}/entity/employee/metadata`,
            type: 'employee',
            mediaType: 'application/json',
          },
        },
      },
      meta: {
        href: `${collectionHref}?limit=${limit}&offset=${offset}`,
        type: `${config.type}position`,
        mediaType: 'application/json',
        size,
        limit,
        offset,
        nextHref:
          offset + limit < size
            ? `${collectionHref}?limit=${limit}&offset=${offset + limit}`
            : undefined,
      },
      rows,
    };
  }

  async metadata(slug: string, remapBase = `${ENV_BASE}/api/remap/1.2`): Promise<unknown> {
    this.requireConfig(slug); // 404 for unknown slugs; result unused
    return {
      meta: {
        href: `${remapBase}/entity/${slug}/metadata`,
        type: 'metadata',
        mediaType: 'application/json',
      },
      attributes: {
        meta: {
          href: `${remapBase}/entity/${slug}/metadata/attributes`,
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
    const c = SLUG_LOOKUP[slug];
    if (!c) throw new NotFoundException(`Unknown slug: ${slug}`);
    return c;
  }

  private requireDelegate(slug: string, config: SlugConfig): Record<string, any> {
    const delegate = (this.prisma.client as unknown as Record<string, any>)[config.model];
    if (!delegate?.findMany) {
      throw new NotFoundException(`Slug ${slug} not connected`);
    }
    return delegate;
  }

  /** FK fields whose target we can actually inline (has a slug config). */
  private expandableFkFields(config: SlugConfig): string[] {
    return (config.fkFields ?? []).filter((f) => SLUG_LOOKUP[this.guessTypeFromFkName(f)]);
  }

  private listHref(remapBase: string, slug: string, limit: number, offset: number): string {
    return `${remapBase}/entity/${slug}?limit=${limit}&offset=${offset}`;
  }

  private singleHref(remapBase: string, slug: string, id: string): string {
    return `${remapBase}/entity/${slug}/${id}`;
  }

  /**
   * Wraps raw rows and applies the field-level contract Biznesjon relies on:
   * attributes as a moysklad-style ARRAY, `sumUzsMinor` (money normalised to
   * UZS tiyin via the document's 8-decimal rateValue), expanded FK relations
   * and (for document slugs) the positions collection with per-doc size.
   */
  private async wrapMany(
    accountId: string,
    slug: string,
    config: SlugConfig,
    rows: Array<Record<string, unknown>>,
    remapBase: string,
    expand: { fields: string[]; positions: boolean; positionsAssortment: boolean },
  ): Promise<Array<Record<string, unknown>>> {
    const wrapped = rows.map((r) => this.wrap(remapBase, slug, r, config));

    if (rows.length === 0) return wrapped;

    await this.applyAttributesArray(accountId, slug, config, rows, wrapped, remapBase);

    for (const field of expand.fields) {
      await this.applyFkExpand(accountId, field, rows, wrapped, remapBase);
    }

    if (config.positionModel && config.positionFk) {
      await this.applyPositions(accountId, slug, config, rows, wrapped, remapBase, expand);
    }

    return wrapped;
  }

  /** attributes `{code:value}` → moysklad array, with reference names. */
  private async applyAttributesArray(
    accountId: string,
    slug: string,
    config: SlugConfig,
    rows: Array<Record<string, unknown>>,
    wrapped: Array<Record<string, unknown>>,
    remapBase: string,
  ): Promise<void> {
    if (!config.attrEntity) return;
    const defs: AttrDef[] = await this.prisma.client.attributeMetadata.findMany({
      where: { accountId, entity: config.attrEntity, archived: false },
      orderBy: { position: 'asc' },
      select: { id: true, code: true, name: true, type: true, referenceEntity: true },
    });
    if (!defs.length) {
      for (const w of wrapped) if ('attributes' in w) w.attributes = [];
      return;
    }

    // Batch-resolve names for reference-type values (e.g. Уста → counterparty).
    const refDefs = defs.filter((d) => d.type === 'reference' && d.referenceEntity);
    const idsByEntity = new Map<string, Set<string>>();
    for (const row of rows) {
      const attrs = row.attributes;
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) continue;
      for (const def of refDefs) {
        const v = (attrs as Record<string, unknown>)[def.code];
        if (typeof v === 'string' && v && def.referenceEntity) {
          if (!idsByEntity.has(def.referenceEntity)) {
            idsByEntity.set(def.referenceEntity, new Set());
          }
          idsByEntity.get(def.referenceEntity)?.add(v);
        }
      }
    }
    const refNames = new Map<string, string>();
    for (const [entity, ids] of idsByEntity) {
      const refSlug = REFERENCE_ENTITY_SLUGS[entity];
      const refConfig = refSlug ? SLUG_LOOKUP[refSlug] : undefined;
      if (!refConfig) continue;
      const refDelegate = (this.prisma.client as unknown as Record<string, any>)[refConfig.model];
      if (!refDelegate?.findMany) continue;
      const found: Array<{ id: string; name: string }> = await refDelegate.findMany({
        where: { accountId, id: { in: [...ids] } },
        select: { id: true, name: true },
      });
      for (const f of found) refNames.set(`${entity}:${f.id}`, f.name);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const target = wrapped[i];
      if (!row || !target) continue;
      const attrs = row.attributes;
      const attrObj =
        attrs && typeof attrs === 'object' && !Array.isArray(attrs)
          ? (attrs as Record<string, unknown>)
          : {};
      target.attributes = buildAttributesArray(attrObj, defs, slug, remapBase, refNames);
    }
  }

  /** expand=agent etc: replace `{meta}` stubs with the full wrapped entity. */
  private async applyFkExpand(
    accountId: string,
    field: string,
    rows: Array<Record<string, unknown>>,
    wrapped: Array<Record<string, unknown>>,
    remapBase: string,
  ): Promise<void> {
    const fkField = `${field}Id`;
    const targetSlug = this.guessTypeFromFkName(fkField);
    const targetConfig = SLUG_LOOKUP[targetSlug];
    if (!targetConfig) return;
    const targetDelegate = (this.prisma.client as unknown as Record<string, any>)[
      targetConfig.model
    ];
    if (!targetDelegate?.findMany) return;

    const ids = [
      ...new Set(rows.map((r) => r[fkField]).filter((v): v is string => typeof v === 'string')),
    ];
    if (!ids.length) return;
    const targetRows: Array<Record<string, unknown>> = await targetDelegate.findMany({
      where: { accountId, id: { in: ids } },
    });
    // Nested attribute conversion too — an expanded counterparty must carry
    // its attributes (tgid) in array form, same contract as top level.
    const targetWrapped = await this.wrapMany(
      accountId,
      targetSlug,
      targetConfig,
      targetRows,
      remapBase,
      { fields: [], positions: false, positionsAssortment: false },
    );
    const byId = new Map<string, Record<string, unknown>>();
    targetRows.forEach((tr, i) => {
      const w = targetWrapped[i];
      if (w) byId.set(String(tr.id), w);
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const target = wrapped[i];
      if (!row || !target) continue;
      const fk = row[fkField];
      if (typeof fk === 'string') {
        const full = byId.get(fk);
        if (full) target[field] = full;
      }
    }
  }

  /** positions collection: size meta always; inline rows when expanded. */
  private async applyPositions(
    accountId: string,
    slug: string,
    config: SlugConfig,
    rows: Array<Record<string, unknown>>,
    wrapped: Array<Record<string, unknown>>,
    remapBase: string,
    expand: { positions: boolean; positionsAssortment: boolean },
  ): Promise<void> {
    const positionModel = config.positionModel as string;
    const positionFk = config.positionFk as string;
    const posDelegate = (this.prisma.client as unknown as Record<string, any>)[positionModel];
    if (!posDelegate?.findMany) return;
    const docIds = rows.map((r) => String(r.id));

    const counts: Array<Record<string, unknown>> = await posDelegate.groupBy({
      by: [positionFk],
      where: { accountId, [positionFk]: { in: docIds } },
      _count: { _all: true },
    });
    const sizeByDoc = new Map<string, number>();
    for (const c of counts) {
      sizeByDoc.set(
        String(c[positionFk]),
        Number((c._count as Record<string, unknown> | undefined)?._all ?? 0),
      );
    }

    let rowsByDoc = new Map<string, Array<Record<string, unknown>>>();
    let assortmentNames = new Map<string, string>();
    if (expand.positions) {
      const posRows: Array<Record<string, unknown>> = await posDelegate.findMany({
        where: { accountId, [positionFk]: { in: docIds } },
        orderBy: { position: 'asc' },
      });
      rowsByDoc = new Map();
      for (const p of posRows) {
        const key = String(p[positionFk]);
        if (!rowsByDoc.has(key)) rowsByDoc.set(key, []);
        rowsByDoc.get(key)?.push(p);
      }
      if (expand.positionsAssortment) {
        assortmentNames = await this.resolveAssortmentNames(accountId, posRows);
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const target = wrapped[i];
      if (!row || !target) continue;
      const docId = String(row.id);
      const collectionHref = `${remapBase}/entity/${slug}/${docId}/positions`;
      const node: Record<string, unknown> = {
        meta: {
          href: collectionHref,
          type: `${config.type}position`,
          mediaType: 'application/json',
          size: sizeByDoc.get(docId) ?? 0,
          limit: 1000,
          offset: 0,
        },
      };
      if (expand.positions) {
        node.rows = (rowsByDoc.get(docId) ?? []).map((p) =>
          this.wrapPosition(slug, config, row, p, remapBase, {
            withNames: expand.positionsAssortment,
            names: assortmentNames,
          }),
        );
      }
      target.positions = node;
    }
  }

  /** Batch product/variant names for positions' assortment refs. */
  private async resolveAssortmentNames(
    accountId: string,
    posRows: Array<Record<string, unknown>>,
  ): Promise<Map<string, string>> {
    const byKind = new Map<string, Set<string>>();
    for (const p of posRows) {
      const { kind, id } = this.assortmentRef(p);
      if (!id) continue;
      if (!byKind.has(kind)) byKind.set(kind, new Set());
      byKind.get(kind)?.add(id);
    }
    const names = new Map<string, string>();
    for (const [kind, ids] of byKind) {
      const model = kind === 'variant' ? 'variant' : kind === 'product' ? 'product' : null;
      if (!model) continue;
      const delegate = (this.prisma.client as unknown as Record<string, any>)[model];
      const found: Array<{ id: string; name: string }> = await delegate.findMany({
        where: { accountId, id: { in: [...ids] } },
        select: { id: true, name: true },
      });
      for (const f of found) names.set(`${kind}:${f.id}`, f.name);
    }
    return names;
  }

  private assortmentRef(position: Record<string, unknown>): { kind: string; id: string | null } {
    const kind = typeof position.assortmentKind === 'string' ? position.assortmentKind : 'product';
    const id =
      typeof position.assortmentId === 'string'
        ? position.assortmentId
        : typeof position.productId === 'string'
          ? position.productId
          : null;
    return { kind, id };
  }

  /** One position row → moysklad wire shape (+ our priceUzsMinor). */
  private wrapPosition(
    slug: string,
    config: SlugConfig,
    doc: Record<string, unknown>,
    position: Record<string, unknown>,
    remapBase: string,
    assortment: { withNames: boolean; names: Map<string, string> },
  ): Record<string, unknown> {
    const id = String(position.id);
    const docId = String(position[config.positionFk as string] ?? doc.id);
    const out: Record<string, unknown> = {
      meta: {
        href: `${remapBase}/entity/${slug}/${docId}/positions/${id}`,
        type: `${config.type}position`,
        mediaType: 'application/json',
      },
      id,
      accountId: position.accountId,
    };
    if (position.quantity !== undefined) out.quantity = Number(position.quantity);
    if (typeof position.priceMinor === 'bigint') {
      out.price = Number(position.priceMinor);
      const rate = doc.rateValue;
      if (typeof rate === 'bigint') {
        out.priceUzsMinor = toUzsMinor(position.priceMinor, rate);
      }
    }
    if (position.discount !== undefined) out.discount = Number(position.discount);
    if (position.vat !== undefined && position.vat !== null) out.vat = position.vat;

    const { kind, id: assortmentId } = this.assortmentRef(position);
    if (assortmentId) {
      const refSlug = kind === 'variant' ? 'variant' : 'product';
      const node: Record<string, unknown> = {
        meta: {
          href: `${remapBase}/entity/${refSlug}/${assortmentId}`,
          type: refSlug,
          mediaType: 'application/json',
        },
      };
      if (assortment.withNames) {
        const name = assortment.names.get(`${kind}:${assortmentId}`);
        if (name) {
          node.id = assortmentId;
          node.name = name;
        }
      }
      out.assortment = node;
    }
    return out;
  }

  /**
   * Wrap a row with a moysklad-style {meta, ...fields} envelope, replacing
   * FK columns with Meta references and dropping internal-only fields
   * (accountId is leaked at top-level for moysklad parity but FK fields
   * become Meta refs).
   */
  private wrap(
    remapBase: string,
    slug: string,
    row: Record<string, unknown>,
    config: SlugConfig,
  ): Record<string, unknown> {
    const id = String(row.id);
    const out: Record<string, unknown> = {
      meta: {
        href: this.singleHref(remapBase, slug, id),
        metadataHref: `${remapBase}/entity/${slug}/metadata`,
        type: config.type,
        mediaType: 'application/json',
      },
      id,
      accountId: row.accountId,
      // moysklad uses ISO strings
      created: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updated: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    };

    // Money normalised to UZS tiyin (Biznesjon item C): documents carry
    // sumMinor in the DOCUMENT currency + a 1e8-scaled rateValue.
    if (typeof row.sumMinor === 'bigint' && typeof row.rateValue === 'bigint') {
      out.sumUzsMinor = toUzsMinor(row.sumMinor, row.rateValue);
    }

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
            href: `${remapBase}/entity/${targetType}/${v}`,
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
      sourceStore: 'store',
      destinationStore: 'store',
      cashDesk: 'cashdesk',
      cashierSession: 'retailshift',
      demand: 'demand',
      supply: 'supply',
      purchaseOrder: 'purchaseorder',
      parent: base, // self-referential
    };
    return map[base] ?? base.toLowerCase();
  }
}
