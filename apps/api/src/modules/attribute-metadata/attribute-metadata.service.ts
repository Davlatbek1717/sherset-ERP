import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type AttributeEntity,
  AttributeMetadataFilterSchema,
  type CreateAttributeMetadataInput,
  CreateAttributeMetadataSchema,
  type EnumOption,
  type UpdateAttributeMetadataInput,
  UpdateAttributeMetadataSchema,
  validateAttributeValue,
} from './attribute-metadata.schema.js';

/**
 * AttributeMetadataService — CRUD for custom field definitions plus
 * a `validateAndNormalize` helper that other services call before
 * writing to entity.attributes.
 */
@Injectable()
export class AttributeMetadataService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = AttributeMetadataFilterSchema.parse(rawFilter);
    const where: Prisma.AttributeMetadataWhereInput = {
      accountId,
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search.toLowerCase() } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.attributeMetadata.findMany({
      where,
      orderBy: [
        { entity: 'asc' },
        { [filter.sortBy === 'position' ? 'position' : filter.sortBy]: filter.sortDir },
      ],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.attributeMetadata.count({ where });
    return { items, nextCursor, total };
  }

  /** Returns active (non-archived) attributes for one entity, ordered by position. */
  async findForEntity(accountId: string, entity: AttributeEntity) {
    return this.prisma.client.attributeMetadata.findMany({
      where: { accountId, entity, archived: false },
      orderBy: { position: 'asc' },
    });
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.attributeMetadata.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`AttributeMetadata ${id} topilmadi`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const r = CreateAttributeMetadataSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as CreateAttributeMetadataInput;

    if (parsed.referenceEntity === 'CustomEntity' && parsed.customEntityId) {
      const ce = await this.prisma.client.customEntity.findFirst({
        where: { id: parsed.customEntityId, accountId },
      });
      if (!ce) throw new BadRequestException('CustomEntity dictionary topilmadi');
    }

    try {
      return await this.prisma.client.attributeMetadata.create({
        data: {
          accountId,
          entity: parsed.entity,
          code: parsed.code,
          name: parsed.name,
          type: parsed.type,
          required: parsed.required,
          defaultValue: (parsed.defaultValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          description: parsed.description ?? null,
          enumOptions: (parsed.enumOptions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          referenceEntity: parsed.referenceEntity ?? null,
          customEntityId: parsed.customEntityId ?? null,
          position: parsed.position,
          archived: parsed.archived,
          shared: parsed.shared,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const existing = await this.findById(accountId, id);
    const r = UpdateAttributeMetadataSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as UpdateAttributeMetadataInput;

    // type can change but only if no entity has stored values for this code yet.
    // Check is informational — UI should warn before the call. Skip strict
    // gating for now (data migration is the user's responsibility).

    const data: Prisma.AttributeMetadataUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.type !== undefined) data.type = parsed.type;
    if (parsed.required !== undefined) data.required = parsed.required;
    if (parsed.defaultValue !== undefined) {
      data.defaultValue = (parsed.defaultValue as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }
    if (parsed.description !== undefined) data.description = parsed.description ?? null;
    if (parsed.enumOptions !== undefined) {
      data.enumOptions = (parsed.enumOptions as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }
    if (parsed.referenceEntity !== undefined) data.referenceEntity = parsed.referenceEntity ?? null;
    if (parsed.customEntityId !== undefined) data.customEntityId = parsed.customEntityId ?? null;
    if (parsed.position !== undefined) data.position = parsed.position;
    if (parsed.archived !== undefined) data.archived = parsed.archived;
    if (parsed.shared !== undefined) data.shared = parsed.shared;

    try {
      return await this.prisma.client.attributeMetadata.update({
        where: { id, accountId: existing.accountId },
        data,
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    const existing = await this.findById(accountId, id);
    await this.prisma.client.attributeMetadata.delete({
      where: { id, accountId: existing.accountId },
    });
    return { ok: true };
  }

  /**
   * Validates a record of attribute values against the active metadata
   * definitions for an entity. Returns the normalized record (only includes
   * known codes; unknown keys are silently dropped). Throws on type or
   * required-ness violations.
   *
   * Call this from each entity service's create/update before writing to
   * `attributes Json`.
   */
  async validateAndNormalize(
    accountId: string,
    entity: AttributeEntity,
    raw: Record<string, unknown> | null | undefined,
  ): Promise<Record<string, unknown>> {
    const metas = await this.findForEntity(accountId, entity);
    const out: Record<string, unknown> = {};
    const input = raw ?? {};

    for (const meta of metas) {
      const value = input[meta.code];
      const enumOptions = (meta.enumOptions as EnumOption[] | null) ?? null;
      const normalized = validateAttributeValue(
        {
          type: meta.type as Parameters<typeof validateAttributeValue>[0]['type'],
          required: meta.required,
          enumOptions,
          name: meta.name,
        },
        value,
      );
      if (normalized != null) out[meta.code] = normalized;
    }

    return out;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu code allaqachon mavjud: ${err.meta?.target?.join(', ') ?? ''}`,
      );
    }
    throw e as Error;
  }
}
