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
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type Characteristic,
  type CreateVariantInput,
  CreateVariantSchema,
  type GenerateVariantsInput,
  GenerateVariantsSchema,
  type UpdateVariantInput,
  UpdateVariantSchema,
  VariantFilterSchema,
} from './variant.schema.js';

import {
  GenerateValidationError,
  cartesian,
  charSignature,
  normalizeAxes,
} from './variant-generate.util.js';

/** Hard cap on a single generate call (guards against a runaway matrix). */
const MAX_GENERATED_VARIANTS = 200;

@Injectable()
export class VariantService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = VariantFilterSchema.parse(rawFilter);
    // NOTE: no «Ниже минимума» (below-minimum) filter here. Variant has no
    // denormalized stock column — its stock lives only in the Stock ledger
    // (assortmentKind='variant'; Product's vestigial denorm columns were also
    // dropped 2026-06-12, so neither entity keeps one). The old code built
    // `where.stockMinor`, a column that does not exist on Variant, which threw
    // PrismaClientValidationError → GET /variants 500. moysklad has no
    // standalone variant list, so there is no parity requirement; a correct
    // re-order view would need a Stock-ledger aggregation (separate feature).
    const where: Prisma.VariantWhereInput = {
      accountId,
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
              { barcode: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.variant.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        product: { select: { id: true, name: true, uom: true, vat: true, vatEnabled: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.variant.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.variant.findFirst({
      where: { id, accountId },
      include: {
        product: true,
      },
    });
    if (!row) throw new NotFoundException(`Variant ${id} not found`);
    return row;
  }

  /**
   * «Код» for a new modification — moysklad auto-fills the NEXT code in the shared
   * product/variant sequence (Скоч маляр 00001 → modifications 00002, 00003). Uses
   * the SAME 'product' atomic counter as the product create-form, so a product and
   * its variants never overlap. 5-digit zero-padded.
   */
  private async allocateCode(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'product', () =>
      this.maxAssortmentCode(accountId),
    );
    return String(n).padStart(5, '0');
  }

  /** MAX numeric «Код» across products AND variants — the shared-sequence seed. */
  private async maxAssortmentCode(accountId: string): Promise<number> {
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

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    const product = await this.prisma.client.product.findFirst({
      where: { id: parsed.productId, accountId },
      select: { id: true, name: true },
    });
    if (!product) throw new BadRequestException('Parent Product topilmadi');

    const name = parsed.name ?? this.formatName(product.name, parsed.characteristics);
    // moysklad auto-fills «Код» for a new modification — allocate the next code in
    // the shared product/variant sequence when the caller didn't supply one.
    const code = parsed.code ?? (await this.allocateCode(accountId));

    try {
      const created = await this.prisma.client.variant.create({
        data: {
          accountId,
          productId: parsed.productId,
          name,
          code,
          externalCode: parsed.externalCode ?? null,
          barcode: parsed.barcode ?? null,
          characteristics: parsed.characteristics as unknown as Prisma.InputJsonValue,
          salePrices: this.serializeSalePrices(parsed.salePrices),
          buyPrice: parsed.buyPrice,
          minPrice: parsed.minPrice,
          weightG: parsed.weightG,
          volumeML: parsed.volumeML,
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * «Создание модификаций» — generate the Cartesian product of variants from a
   * set of characteristics × values. Idempotent: combos that already exist for
   * the product are skipped (re-running after adding a value only creates the
   * new ones). Characteristic names are remembered in the dictionary for the
   * modal's suggestions. All fresh variants are created in one transaction.
   * Returns { created, skipped, items }.
   */
  async generate(accountId: string, userId: string, raw: unknown) {
    const r = GenerateVariantsSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const parsed: GenerateVariantsInput = r.data;

    const product = await this.prisma.client.product.findFirst({
      where: { id: parsed.productId, accountId },
      select: { id: true, name: true },
    });
    if (!product) throw new BadRequestException('Mahsulot topilmadi');

    // Normalize (trim, dedup values, reject a repeated characteristic name) —
    // GenerateValidationError → 400.
    let chars: ReturnType<typeof normalizeAxes>;
    try {
      chars = normalizeAxes(parsed.characteristics);
    } catch (e) {
      if (e instanceof GenerateValidationError) throw new BadRequestException(e.message);
      throw e;
    }

    const combos = cartesian(chars);
    if (combos.length > MAX_GENERATED_VARIANTS) {
      throw new BadRequestException(
        `Juda ko'p modifikatsiya (${combos.length}). Maksimum ${MAX_GENERATED_VARIANTS}.`,
      );
    }

    // Skip combos that already exist for this product (idempotent re-run).
    const existing = await this.prisma.client.variant.findMany({
      where: { accountId, productId: product.id },
      select: { characteristics: true },
    });
    const existingSigs = new Set(
      existing.map((v) => charSignature(v.characteristics as unknown as Characteristic[])),
    );
    const fresh = combos.filter((combo) => !existingSigs.has(charSignature(combo)));

    if (fresh.length === 0) {
      return { created: 0, skipped: combos.length, items: [] };
    }

    // Remember the characteristic names (dictionary) for next time — idempotent
    // upsert on the [accountId, name] unique index (race-safe).
    for (const c of chars) {
      await this.prisma.client.characteristic.upsert({
        where: { accountId_name: { accountId, name: c.name } },
        create: { accountId, name: c.name },
        update: {},
      });
    }

    // moysklad auto-fills «Код» for every generated modification — allocate a
    // sequential code per fresh combo (shared product/variant sequence) up front.
    const codes: string[] = [];
    for (let i = 0; i < fresh.length; i++) codes.push(await this.allocateCode(accountId));

    let created: Array<{ id: string }>;
    try {
      created = await this.prisma.client.$transaction(
        fresh.map((combo, i) =>
          this.prisma.client.variant.create({
            data: {
              accountId,
              productId: product.id,
              name: this.formatName(product.name, combo),
              code: codes[i],
              characteristics: combo as unknown as Prisma.InputJsonValue,
            },
          }),
        ),
      );
    } catch (e) {
      this.handlePrisma(e);
    }

    await this.prisma.client.auditLog.createMany({
      data: created.map((v) => ({
        accountId,
        userId,
        entity: 'Variant',
        entityId: v.id,
        action: 'create',
      })),
    });

    return { created: created.length, skipped: combos.length - fresh.length, items: created };
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    const data: Prisma.VariantUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.barcode !== undefined) data.barcode = parsed.barcode;
    if (parsed.salePrices !== undefined)
      data.salePrices = this.serializeSalePrices(parsed.salePrices);
    if (parsed.buyPrice !== undefined) data.buyPrice = parsed.buyPrice;
    if (parsed.minPrice !== undefined) data.minPrice = parsed.minPrice;
    if (parsed.weightG !== undefined) data.weightG = parsed.weightG;
    if (parsed.volumeML !== undefined) data.volumeML = parsed.volumeML;
    if (parsed.characteristics !== undefined) {
      data.characteristics = parsed.characteristics as unknown as Prisma.InputJsonValue;
      if (parsed.name === undefined) {
        // Regenerate the auto-name if user changed characteristics but not name.
        const parent = await this.prisma.client.product.findFirst({
          where: { id: existing.productId, accountId },
          select: { name: true },
        });
        if (parent) {
          data.name = this.formatName(parent.name, parsed.characteristics);
        }
      }
    }

    try {
      // Optimistic lock: the `version` filter (extra scalar predicate on the
      // unique `id`) only matches if the row is unchanged since the form loaded.
      // A stale version matches zero rows → Prisma P2025 → 409. findById above
      // already proved the row exists, so P2025 here can only be a conflict.
      const updated = await this.prisma.client.variant.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      // History (Tarix) tab fetches /audit-logs?entity=Variant (FE auditEntity
      // slug). `existing` carries a `product` relation that `updated` lacks, so
      // diffing over the updated row's own keys keeps the relation out of the
      // changeset; only log when a user-meaningful field actually changed.
      const diff = this.computeDiff(existing, updated);
      if (Object.keys(diff).length > 0) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Variant');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.variant.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'archived', id, null);
    return updated;
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.variant.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.variant.delete({ where: { id, accountId } });
    // Hard delete (no soft-delete column on Variant). The audit row outlives
    // the variant — entityId references the now-removed row, mirroring the
    // moysklad History feed for deleted records.
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  /**
   * Builds the moysklad variant name: "{parent} ({value1}, {value2})" — e.g.
   * "Банан (оверспелый, чёрный)", "Potato (yellow)" (grounded against the
   * official API reference responses). Falls back to the bare parent name when
   * there are no characteristic values.
   */
  formatName(parentName: string, chars: Characteristic[]): string {
    const parts = chars.map((c) => c.value).filter((v) => v.length > 0);
    return parts.length ? `${parentName} (${parts.join(', ')})` : parentName;
  }

  /**
   * Field-level changeset for the audit log. `after` is the bare updated
   * variant (the `update()` call has no relation include), so iterating its
   * own keys naturally excludes the `product` relation that `before` carries.
   * BigInt-safe: Variant has BigInt columns (buyPrice/minPrice/…), and a plain
   * `JSON.stringify` throws on BigInt — so the comparison serializer coerces
   * BigInt → string.
   */
  private computeDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const stable = (v: unknown) =>
      JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(after)) {
      // version bumps every save; the *At timestamps + ids are infra, not
      // user-meaningful — keep them out of the History feed.
      if (key === 'version' || key === 'updatedAt' || key === 'createdAt') continue;
      if (stable(before[key]) !== stable(after[key])) {
        diff[key] = { before: before[key], after: after[key] };
      }
    }
    return diff;
  }

  /**
   * Writes one History row under the `Variant` entity slug (matches the FE
   * `auditEntity="Variant"` on variants/[id]). Non-transactional, mirroring
   * product.service — the audit feed is advisory, not balance-critical.
   * BigInt-safe: fieldChanges values are coerced before the Json write.
   */
  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
  ): Promise<void> {
    const safeChanges =
      fieldChanges == null
        ? undefined
        : (JSON.parse(
            JSON.stringify(fieldChanges, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
          ) as Prisma.InputJsonValue);
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Variant',
        entityId,
        action,
        fieldChanges: safeChanges,
      },
    });
  }

  /**
   * Serialize salePrices for Prisma Json: BigInt value → string, since
   * Json can't hold native BigInts.
   */
  private serializeSalePrices(
    prices: Array<{ priceTypeId: string; value: bigint; currencyCode: string }> | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!prices) return undefined;
    return prices.map((p) => ({
      priceTypeId: p.priceTypeId,
      value: p.value.toString(),
      currencyCode: p.currencyCode,
    })) as Prisma.InputJsonValue;
  }

  private parseCreate(raw: unknown): CreateVariantInput {
    const r = CreateVariantSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateVariantInput {
    const r = UpdateVariantSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu qiymat bilan variant allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
