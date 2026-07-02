import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateTaskTypeInput,
  CreateTaskTypeSchema,
  TaskTypeFilterSchema,
  type UpdateTaskTypeInput,
  UpdateTaskTypeSchema,
} from './task-type.schema.js';

// moysklad seeds a small starter set so the «Тип задачи» dropdown is
// useful from day-one. Positions reserved 0..3 so future user-added types
// fall after them by default.
const DEFAULT_TYPES: Array<{ name: string; color: string; position: number }> = [
  { name: 'Telefon qo‘ng‘irog‘i', color: '#3B82F6', position: 0 },
  { name: 'Yig‘ilish', color: '#16A34A', position: 1 },
  { name: 'Vazifa', color: '#F59E0B', position: 2 },
  { name: 'Boshqa', color: '#6B7280', position: 3 },
];

@Injectable()
export class TaskTypeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = TaskTypeFilterSchema.parse(rawFilter);
    const where: Prisma.TaskTypeWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.taskType.findMany({
      where,
      orderBy:
        filter.sortBy === 'position'
          ? [{ position: filter.sortDir }, { name: 'asc' }]
          : { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.taskType.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`TaskType ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.taskType.create({
        data: {
          accountId,
          name: parsed.name,
          color: parsed.color ?? null,
          position: parsed.position,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.TaskTypeUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.color !== undefined) data.color = parsed.color;
    if (parsed.position !== undefined) data.position = parsed.position;

    try {
      return await this.prisma.client.taskType.update({
        where: { id, accountId },
        data,
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.taskType.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.taskType.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    // FK is ON DELETE SET NULL — referencing tasks survive with type_id=null.
    await this.prisma.client.taskType.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /** Seed default UZ task types if account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.taskType.findFirst({ where: { accountId } });
    if (existing) return;
    for (const def of DEFAULT_TYPES) {
      try {
        await this.prisma.client.taskType.create({
          data: { accountId, name: def.name, color: def.color, position: def.position },
        });
      } catch {
        // Concurrent seed from another request — ignore unique-violation.
      }
    }
  }

  // helpers

  private parseCreate(raw: unknown): CreateTaskTypeInput {
    const r = CreateTaskTypeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateTaskTypeInput {
    const r = UpdateTaskTypeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('Bunday nomli «Тип задачи» allaqachon mavjud');
    }
    throw e as Error;
  }
}
