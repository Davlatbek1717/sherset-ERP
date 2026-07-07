import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { formatCellCode, parseCellCode, segmentWhere } from './cell-code.util.js';
import {
  type BulkUpdatePatch,
  ProductRepository,
  type SetPricesSpec,
} from './product.repository.js';
import {
  type CreateProductInput,
  CreateProductSchema,
  ProductFilterSchema,
  UpdateProductSchema,
} from './product.schema.js';

@Injectable()
export class ProductService {
  constructor(
    @Inject(ProductRepository) private readonly repo: ProductRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ProductFilterSchema.parse(rawFilter);
    return this.repo.list(accountId, filter);
  }

  /** «Характеристики» filter options for the products Фильтр panel. */
  async characteristicValues(accountId: string) {
    return this.repo.characteristicValues(accountId);
  }

  async findById(accountId: string, id: string) {
    const product = await this.repo.findById(accountId, id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  /** Multi-bin: list a product's additional shelf locations. */
  async listLocations(accountId: string, id: string) {
    await this.findById(accountId, id); // existence / tenant guard → 404
    return this.repo.listLocations(accountId, id);
  }

  /** Multi-bin: replace a product's additional shelf locations (full list). */
  async setLocations(
    accountId: string,
    id: string,
    locations: Array<{
      sklad: number;
      polka: number | null;
      qavat: number | null;
      yacheyka: number | null;
      qty: number | null;
      note: string | null;
    }>,
  ) {
    await this.findById(accountId, id); // existence / tenant guard → 404
    return this.repo.setLocations(accountId, id, locations);
  }

  /** Scan page: product detail + stock balance per store. */
  async getScanInfo(accountId: string, id: string) {
    const product = await this.findById(accountId, id);
    const stocks = await this.prisma.client.stock.findMany({
      where: { accountId, assortmentId: id, assortmentKind: 'product' },
      include: { store: { select: { name: true } } },
    });
    const balances = stocks.map((s) => ({
      storeId: s.storeId,
      storeName: s.store?.name ?? null,
      qty: s.qty.toString(),
      reservedQty: s.reservedQty.toString(),
    }));
    const totalQty = stocks.reduce((sum, s) => sum + Number(s.qty.toFixed(6)), 0);
    return { product, balances, totalQty };
  }

  /**
   * Yacheyka scan sahifasi — cell kod bo'yicha shu manzilga biriktirilgan
   * tovarlar: asosiy manzil (Product.loc*) ∪ qo'shimcha yacheykalar
   * (ProductLocation), har biriga ombor qoldiqlari bilan. Kodda 0-segment =
   * «belgilanmagan» (label 00 deb bosadi) — NULL'ga ham mos keladi.
   */
  async getCellContents(accountId: string, rawCode: string) {
    const addr = parseCellCode(rawCode);
    if (!addr) {
      throw new BadRequestException(
        "Yacheyka kodi noto'g'ri — NN-NN-NN-NN yoki 8 raqamli barcode kutiladi",
      );
    }
    const productSelect = {
      id: true,
      name: true,
      code: true,
      article: true,
      uom: true,
      archived: true,
      // Per-cell qty of the PRIMARY home bin (Phase 2) — shown when the
      // scanned cell IS the product's primary address.
      locQty: true,
    } satisfies Prisma.ProductSelect;

    const [primary, extra, store] = await Promise.all([
      this.prisma.client.product.findMany({
        where: {
          accountId,
          deletedAt: null,
          AND: [
            segmentWhere('locSklad', addr.sklad),
            segmentWhere('locPolka', addr.polka),
            segmentWhere('locQavat', addr.qavat),
            segmentWhere('locYacheyka', addr.yacheyka),
          ] as Prisma.ProductWhereInput[],
        },
        select: productSelect,
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.productLocation.findMany({
        where: {
          accountId,
          sklad: addr.sklad,
          AND: [
            segmentWhere('polka', addr.polka),
            segmentWhere('qavat', addr.qavat),
            segmentWhere('yacheyka', addr.yacheyka),
          ] as Prisma.ProductLocationWhereInput[],
          product: { deletedAt: null },
        },
        include: { product: { select: productSelect } },
      }),
      // Yacheyka↔ombor bog'i (konvensiya: Store.code = sklad raqami, 0–99) —
      // kartochkada «Ombor: <nom>» ko'rsatish uchun. Padded/unpadded ikkalasi.
      this.prisma.client.store.findFirst({
        where: {
          accountId,
          archived: false,
          code: { in: [String(addr.sklad), String(addr.sklad).padStart(2, '0')] },
        },
        select: { id: true, name: true },
      }),
    ]);

    // Bir tovar ham asosiy, ham qo'shimcha manzil bilan chiqishi mumkin —
    // primary yorlig'i ustun, note/qty esa extra-yozuvdan to'ldiriladi.
    const byId = new Map<
      string,
      {
        product: (typeof primary)[number];
        source: 'primary' | 'extra';
        note: string | null;
        // SHU yacheykadagi soni (Phase 2): primary → Product.locQty,
        // extra → ProductLocation.qty. null = yuritilmaydi.
        cellQty: Prisma.Decimal | null;
      }
    >();
    for (const p of primary)
      byId.set(p.id, { product: p, source: 'primary', note: null, cellQty: p.locQty });
    for (const l of extra) {
      const existing = byId.get(l.productId);
      if (existing) {
        existing.note = existing.note ?? l.note ?? null;
        existing.cellQty = existing.cellQty ?? l.qty ?? null;
      } else {
        byId.set(l.productId, {
          product: l.product,
          source: 'extra',
          note: l.note ?? null,
          cellQty: l.qty ?? null,
        });
      }
    }

    const ids = [...byId.keys()];
    const stocks = ids.length
      ? await this.prisma.client.stock.findMany({
          where: { accountId, assortmentKind: 'product', assortmentId: { in: ids } },
          include: { store: { select: { name: true } } },
        })
      : [];
    const stocksByProduct = new Map<string, typeof stocks>();
    for (const s of stocks) {
      const list = stocksByProduct.get(s.assortmentId) ?? [];
      list.push(s);
      stocksByProduct.set(s.assortmentId, list);
    }

    return {
      cell: { code: formatCellCode(addr), ...addr, store: store ?? null },
      items: [...byId.values()].map(({ product, source, note, cellQty }) => {
        const rows = stocksByProduct.get(product.id) ?? [];
        // locQty is an internal fetch detail (feeds cellQty) — not part of the response.
        const { locQty: _locQty, ...productFields } = product;
        return {
          ...productFields,
          source,
          note,
          // SHU yacheykada nechta dona turishi (Phase 2, qo'lda yuritiladi).
          cellQty: cellQty != null ? cellQty.toString() : null,
          totalQty: rows.reduce((sum, s) => sum + Number(s.qty.toFixed(6)), 0),
          balances: rows.map((s) => ({
            storeId: s.storeId,
            storeName: s.store?.name ?? null,
            qty: s.qty.toString(),
          })),
        };
      }),
    };
  }

  async create(accountId: string, userId: string, input: unknown) {
    const parsed = this.validateCreate(input);
    // Cross-tenant FK guard — every assignable relation id (owner/group/folder/
    // supplier) must belong to THIS account before it is written. The user-
    // supplied groupId is checked HERE, before the creator-group fallback below
    // overwrites a left-empty one with the (trusted) creator's department.
    await this.assertFksInAccount(accountId, parsed);
    // H4 record-scope foundation (read-only-safe): stamp the creating
    // employee's department onto the new product's `groupId`. Unlike the pure
    // record-scope `groupId` on document models (e.g. Demand) — where the
    // column is always-NULL until H4 fills it — on Product `groupId` is ALSO a
    // user-facing domain field («Группа», a create-form picker the repository
    // already writes from `input.groupId`). To stay read-only-safe we must NOT
    // overwrite a user-chosen group, so the creator-department stamp is applied
    // as a FALLBACK only — it fills `groupId` exactly when the user left it
    // unset (the previously-NULL case the future OWN_GROUP `scopedWhere` reads),
    // and leaves an explicitly chosen product group untouched. See `problems`
    // in the task report for why this diverges from the literal reference.
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    if (parsed.groupId == null && creatorGroupId != null) {
      parsed.groupId = creatorGroupId;
    }
    // «Код» — moysklad auto-assigns a per-account sequential product code; ours left
    // it empty. Allocate race-safely (atomic counter, key 'product') ONLY when the
    // form didn't supply one (a manual code still wins). 5-digit zero-padded to match
    // moysklad's display (e.g. 07758). The /new form pre-consumes one via allocateCode().
    if (!parsed.code) {
      const n = await allocateDocumentNumber(this.prisma.client, accountId, 'product', () =>
        this.maxProductCode(accountId),
      );
      parsed.code = String(n).padStart(5, '0');
    }
    try {
      const created = await this.repo.create(accountId, userId, parsed);
      await this.logAudit(accountId, userId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  /**
   * «Код» allocate for the create form. moysklad shows the next sequential code
   * already filled on the NEW product form; calling this on /new open consumes one
   * code (atomic counter, key 'product') and returns it 5-digit zero-padded. Create
   * then stores the supplied value; abandoning the form leaves a gap (moysklad parity).
   */
  async allocateCode(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'product', () =>
      this.maxProductCode(accountId),
    );
    return String(n).padStart(5, '0');
  }

  /**
   * Seed value for the 'product' code counter: the MAX existing numeric code in
   * the account (NOT the row count — `code` is UNIQUE per account, and existing
   * codes can exceed the count via gaps/manual entries, so a count-based seed
   * would collide). Non-numeric codes parse to 0. The counter's first allocation
   * is this + 1, so auto-codes always land above every existing code.
   */
  private async maxProductCode(accountId: string): Promise<number> {
    // moysklad shares ONE «Код» sequence across products AND their variants
    // (Скоч маляр = 00001 → its modifications 00002, 00003). So the seed is the
    // MAX numeric code across BOTH tables; the 'product' counter is shared by the
    // product create-form and the variant module (variant.service.allocateCode).
    const [products, variants] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { accountId, code: { not: null } },
        select: { code: true },
      }),
      this.prisma.client.variant.findMany({
        where: { accountId, code: { not: null } },
        select: { code: true },
      }),
    ]);
    let max = 0;
    for (const r of [...products, ...variants]) {
      const n = Number.parseInt(r.code ?? '', 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  async update(accountId: string, userId: string, id: string, input: unknown) {
    const parsed = UpdateProductSchema.parse(input);
    // findById first: confirms the row exists in this tenant (→ 404 if gone) so
    // a P2025 from the version-guarded update below can only mean a stale
    // version (→ 409), not a missing record.
    const existing = await this.findById(accountId, id);
    // Cross-tenant FK guard on edit too — a re-owning / re-grouping / re-foldering
    // PATCH must not connect to another tenant's row (a bare connect-by-id is not
    // account-scoped). Only provided non-null ids are checked (null = clear).
    await this.assertFksInAccount(accountId, parsed);
    try {
      const updated = await this.repo.update(accountId, userId, id, parsed, parsed.version);
      const diff = this.computeDiff(existing, updated);
      if (Object.keys(diff).length > 0) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Product');
      this.handlePrismaError(e);
    }
  }

  async archive(accountId: string, userId: string, id: string, archived: boolean) {
    await this.findById(accountId, id);
    const updated = await this.repo.archive(accountId, id, archived);
    await this.logAudit(accountId, userId, archived ? 'archived' : 'restored', id, null);
    return updated;
  }

  /** «Переместить» — move selected products to a folder (null = root). */
  async bulkMove(accountId: string, ids: string[], productFolderId: string | null) {
    if (productFolderId && !(await this.repo.folderExists(accountId, productFolderId))) {
      throw new NotFoundException(`Folder ${productFolderId} not found`);
    }
    return this.repo.bulkMove(accountId, ids, productFolderId);
  }

  /** «Копировать» — duplicate one product (used per-id by the bulk-clone endpoint). */
  async cloneOne(accountId: string, userId: string, id: string) {
    const created = await this.repo.clone(accountId, userId, id);
    if (!created) throw new NotFoundException(`Product ${id} not found`);
    await this.logAudit(accountId, userId, 'create', created.id, null);
    return created;
  }

  /** «Изменить цены» — set one target price type on a product by the bulk-price
   * engine (per-id for bulk-set-prices). */
  async setPricesOne(accountId: string, userId: string, id: string, spec: SetPricesSpec) {
    const updated = await this.repo.setPrices(accountId, id, spec);
    if (!updated) throw new NotFoundException(`Product ${id} not found`);
    await this.logAudit(accountId, userId, 'update', id, null);
    return updated;
  }

  /** «Массовое редактирование» — bulk-edit common fields on the selection. */
  async bulkUpdate(accountId: string, ids: string[], patch: BulkUpdatePatch) {
    // Same cross-tenant FK guard as create/edit (the FKs reference only [id], so
    // a foreign-tenant id would otherwise be stamped silently — updateMany's
    // accountId scopes only the TARGET rows, not the value written).
    await this.assertFksInAccount(accountId, patch);
    return this.repo.bulkUpdate(accountId, ids, patch);
  }

  /**
   * Cross-tenant FK guard shared by create / update / bulk-update. Every
   * assignable relation id on a product write — owner (Доступ-сотрудник), group
   * (Доступ-отдел), catalog folder (Группа), supplier (Поставщик) — must belong
   * to THIS account. Both the Prisma `connect: { id }` (create/update) and the
   * unchecked scalar (bulk updateMany) write the FK by global id WITHOUT an
   * account predicate, so without this a client could point any of them at
   * another tenant's row. null/undefined are skipped (clear / omit). Mirrors the
   * bulk-edit guard first shipped in 849a9653, now applied on create+edit too.
   */
  private async assertFksInAccount(
    accountId: string,
    fks: {
      supplierId?: string | null;
      productFolderId?: string | null;
      ownerId?: string | null;
      groupId?: string | null;
    },
  ): Promise<void> {
    if (
      fks.supplierId != null &&
      !(await this.repo.counterpartyExists(accountId, fks.supplierId))
    ) {
      throw new NotFoundException(`Supplier ${fks.supplierId} not found`);
    }
    if (
      fks.productFolderId != null &&
      !(await this.repo.folderExists(accountId, fks.productFolderId))
    ) {
      throw new NotFoundException(`Folder ${fks.productFolderId} not found`);
    }
    if (fks.ownerId != null && !(await this.repo.employeeExists(accountId, fks.ownerId))) {
      throw new NotFoundException(`Owner ${fks.ownerId} not found`);
    }
    if (fks.groupId != null && !(await this.repo.groupExists(accountId, fks.groupId))) {
      throw new NotFoundException(`Group ${fks.groupId} not found`);
    }
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.repo.softDelete(accountId, id);
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // ---- private helpers ----

  private validateCreate(input: unknown): CreateProductInput {
    const parsed = CreateProductSchema.parse(input);
    // Additional business-rule validations:
    // 1. If trackingType set, GTIN required.
    if (parsed.trackingType && parsed.trackingType !== 'NOT_TRACKED' && !parsed.gtin) {
      throw new BadRequestException('GTIN is required for marked products');
    }
    // 2. VAT sanity.
    if (parsed.vatEnabled && parsed.vat == null && !parsed.useParentVat) {
      throw new BadRequestException(
        'Specify VAT rate, or enable useParentVat, or disable vatEnabled',
      );
    }
    return parsed;
  }

  private computeDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(after)) {
      // version bumps on every save; createdAt/updatedAt are infra timestamps —
      // none are user-meaningful field changes, so keep them out of the audit.
      if (key === 'updatedAt' || key === 'createdAt' || key === 'version') continue;
      const b = before[key];
      const a = after[key];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diff[key] = { before: b, after: a };
      }
    }
    return diff;
  }

  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Product',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrismaError(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      const target = err.meta?.target?.join(', ') ?? 'field';
      throw new ConflictException(`Duplicate value on unique field: ${target}`);
    }
    throw e as Error;
  }
}
