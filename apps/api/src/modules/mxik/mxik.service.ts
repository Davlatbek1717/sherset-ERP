import type { Prisma } from '@moysklad/db';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type BulkImportResult, runBulkImport } from '../shared/bulk.js';
import {
  type CreateMxikInput,
  CreateMxikSchema,
  MxikCodeSchema,
  MxikFilterSchema,
  UpdateMxikSchema,
} from './mxik.schema.js';

/**
 * MxikService — read + manual write API for the Soliq MXIK catalog.
 *
 * The catalog is global (no `accountId`) because Soliq's classifier is
 * the same for every tenant. Manual entries (`source = 'manual'`) sit in
 * the same table; tenant-specific overrides are tagged `source = 'override'`
 * and the lookup endpoint surfaces both the imported row and any override
 * it finds (V1.5 — currently we just return whatever's there).
 *
 * V2 follow-ups:
 *   - tasnif.soliq.uz auto-sync once Soliq merchant credentials land
 *     (requires a paid contract, can't be set up from a public test env).
 *   - Per-tenant override layer (return manual override above soliq row)
 *   - UoM catalog as its own table; unitCode here would FK into it.
 */
@Injectable()
export class MxikService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(rawFilter: unknown) {
    const filter = MxikFilterSchema.parse(rawFilter);
    const where: Prisma.MxikCodeWhereInput = {
      ...(filter.archived ? {} : { archived: false }),
      ...(filter.codePrefix ? { code: { startsWith: filter.codePrefix } } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.search
        ? {
            OR: [
              { nameUz: { contains: filter.search, mode: 'insensitive' } },
              { nameRu: { contains: filter.search, mode: 'insensitive' } },
              { code: { startsWith: filter.search.replace(/\D/g, '') } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.mxikCode.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { code: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.code : undefined;
    const total = await this.prisma.client.mxikCode.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Single-code lookup for invoice-line autocomplete or external integrations.
   * Returns the active row; archived codes resolve only when explicitly
   * requested via `?includeArchived=true` on the controller.
   */
  async findByCode(code: string, includeArchived = false) {
    MxikCodeSchema.parse(code);
    const row = await this.prisma.client.mxikCode.findFirst({
      where: { code, ...(includeArchived ? {} : { archived: false }) },
    });
    if (!row) {
      throw new NotFoundException(`MXIK ${code} topilmadi`);
    }
    return row;
  }

  async create(raw: unknown) {
    const parsed = CreateMxikSchema.parse(raw);
    try {
      return await this.prisma.client.mxikCode.create({ data: parsed });
    } catch (e) {
      this.handlePrisma(e, parsed.code);
    }
  }

  async update(code: string, raw: unknown) {
    MxikCodeSchema.parse(code);
    const parsed = UpdateMxikSchema.parse(raw);
    const existing = await this.prisma.client.mxikCode.findFirst({ where: { code } });
    if (!existing) throw new NotFoundException(`MXIK ${code} topilmadi`);
    return this.prisma.client.mxikCode.update({
      where: { code },
      data: parsed,
    });
  }

  /**
   * Soft-archive (sets `archived = true`). Hard delete is intentionally
   * omitted — historical invoices reference codes by FK-less string column,
   * and nuking a row would corrupt their display labels in printed PDFs.
   */
  async archive(code: string) {
    MxikCodeSchema.parse(code);
    const existing = await this.prisma.client.mxikCode.findFirst({ where: { code } });
    if (!existing) throw new NotFoundException(`MXIK ${code} topilmadi`);
    return this.prisma.client.mxikCode.update({
      where: { code },
      data: { archived: true },
    });
  }

  async restore(code: string) {
    MxikCodeSchema.parse(code);
    const existing = await this.prisma.client.mxikCode.findFirst({ where: { code } });
    if (!existing) throw new NotFoundException(`MXIK ${code} topilmadi`);
    return this.prisma.client.mxikCode.update({
      where: { code },
      data: { archived: false },
    });
  }

  /**
   * Bulk-import path — fronted by the ImportWizard pattern in the web app.
   * Each row runs in its own attempt via runBulkImport so a single bad
   * code (e.g. 16 digits) doesn't abort the whole batch; the response
   * tells the operator which 0-based index failed and why.
   *
   * On `source = 'soliq'` rows, we treat re-imports as upserts so the
   * operator can re-run the catalog with newer names without manually
   * deleting the existing rows. Manual entries are kept as inserts to
   * avoid silently overwriting tenant-specific labels.
   */
  async bulkImport(raw: unknown): Promise<BulkImportResult<{ code: string }>> {
    const { rows } = await import('./mxik.schema.js').then((m) =>
      m.BulkImportMxikSchema.parse(raw),
    );
    return runBulkImport(rows, async (row: CreateMxikInput) => {
      if (row.source === 'soliq') {
        // Re-importing the same Soliq catalog twice should be idempotent.
        const upserted = await this.prisma.client.mxikCode.upsert({
          where: { code: row.code },
          create: row,
          update: {
            nameUz: row.nameUz,
            nameRu: row.nameRu ?? null,
            nameEn: row.nameEn ?? null,
            unitCode: row.unitCode ?? null,
            groupCode: row.groupCode ?? null,
            classCode: row.classCode ?? null,
            // Don't flip 'manual' / 'override' rows back to 'soliq' on
            // import; the source column tracks the original entry path.
          },
        });
        return { code: upserted.code };
      }
      try {
        const created = await this.prisma.client.mxikCode.create({ data: row });
        return { code: created.code };
      } catch (e) {
        this.handlePrisma(e, row.code);
      }
    });
  }

  private handlePrisma(e: unknown, code: string): never {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code: string }).code === 'P2002'
    ) {
      throw new ConflictException(`MXIK ${code} allaqachon mavjud`);
    }
    throw e;
  }
}
