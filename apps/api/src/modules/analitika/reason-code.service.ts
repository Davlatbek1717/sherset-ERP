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
  type CreateReasonCodeInput,
  CreateReasonCodeSchema,
  ReasonCodeFilterSchema,
  type UpdateReasonCodeInput,
  UpdateReasonCodeSchema,
} from './reason-code.schema.js';

const DEFAULT_REASON_CODES = ["O'g'irlik", 'Buzilgan', "Muddati o'tgan", 'Sanab xato qilingan'];

@Injectable()
export class ReasonCodeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ReasonCodeFilterSchema.parse(rawFilter);
    const where: Prisma.AnalitikaReasonCodeWhereInput = {
      accountId,
      ...(filter.activeOnly ? { active: true } : {}),
    };
    const items = await this.prisma.client.analitikaReasonCode.findMany({
      where,
      orderBy: { label: 'asc' },
      take: 200,
    });
    return { items, total: items.length };
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.analitikaReasonCode.create({
        data: { accountId, label: parsed.label, active: parsed.active },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);
    const data: Prisma.AnalitikaReasonCodeUpdateInput = {};
    if (parsed.label !== undefined) data.label = parsed.label;
    if (parsed.active !== undefined) data.active = parsed.active;
    try {
      return await this.prisma.client.analitikaReasonCode.update({
        where: { id, accountId },
        data,
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.analitikaReasonCode.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /** Seed default reason codes if the account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.analitikaReasonCode.findFirst({
      where: { accountId },
    });
    if (existing) return;
    for (const label of DEFAULT_REASON_CODES) {
      await this.prisma.client.analitikaReasonCode.create({ data: { accountId, label } });
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private async findById(accountId: string, id: string) {
    const row = await this.prisma.client.analitikaReasonCode.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`ReasonCode ${id} not found`);
    return row;
  }

  private parseCreate(raw: unknown): CreateReasonCodeInput {
    const r = CreateReasonCodeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateReasonCodeInput {
    const r = UpdateReasonCodeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('Bu nomli sabab kodi allaqachon mavjud');
    }
    throw e as Error;
  }
}
