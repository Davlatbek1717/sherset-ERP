import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  BranchFilterSchema,
  type CreateBranchInput,
  CreateBranchSchema,
  type UpdateBranchInput,
  UpdateBranchSchema,
} from './branch.schema.js';

/**
 * Filial (branch) CRUD — 8-bo'lim TZ §2.3 / §8.1, faza F001.
 *
 * F001 QAMROVI: faqat filial o'qini bazaga kiritish. Hujjatlarga `branchId`
 * muhrlash (F003), `Store`/`CashDesk`/`Employee` bog'lanishi va filial
 * almashtirgich (F002), ko'rinish filtri (TZ §6) — BU FAZADA YO'Q. Bir filialli
 * holatda hech bir mavjud endpoint javobi o'zgarmasligi kerak.
 *
 * INVARIANT: akkauntda AYNAN BITTA `isDefault` filial. Ikki qatlamda:
 *   · shu servis (aniq xato xabari bilan) — `create` · `update` · `setDefault`;
 *   · DB'dagi qisman-unikal indeks (`branches_account_id_is_default_key`) —
 *     poyga holatida oxirgi to'siq, migratsiya faylida (Prisma sxemasi
 *     qisman-unikal indeksni ifodalay olmaydi).
 */
@Injectable()
export class BranchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = BranchFilterSchema.parse(rawFilter);
    const where: Prisma.BranchWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.client.branch.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.branch.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.branch.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Branch ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    if (parsed.isDefault) await this.assertNoOtherDefault(accountId);
    try {
      return await this.prisma.client.branch.create({
        data: {
          accountId,
          name: parsed.name,
          ...(parsed.code !== undefined ? { code: parsed.code } : {}),
          ...(parsed.address !== undefined ? { address: parsed.address } : {}),
          ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
          ...(parsed.organizationId !== undefined ? { organizationId: parsed.organizationId } : {}),
          isDefault: parsed.isDefault,
          sortOrder: parsed.sortOrder,
        },
      });
    } catch (e) {
      this.mapDefaultConflict(e);
      throw e;
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    // Prove the row exists (accountId-scoped 404) before the versioned update —
    // aks holda begona ijarachining yozuvi 409 berib MAVJUDLIGINI oshkor qilardi.
    await this.assertExists(accountId, id);
    // `isDefault: true` ni PATCH orqali ham qo'yib bo'lmaydi — aks holda create
    // dagi tekshiruv yon eshik bilan chetlab o'tilardi.
    if (parsed.isDefault === true) await this.assertNoOtherDefault(accountId, id);

    const data: Prisma.BranchUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.address !== undefined) data.address = parsed.address;
    if (parsed.phone !== undefined) data.phone = parsed.phone;
    if (parsed.sortOrder !== undefined) data.sortOrder = parsed.sortOrder;
    if (parsed.isDefault !== undefined) data.isDefault = parsed.isDefault;
    if (parsed.organizationId !== undefined) {
      data.organization = { connect: { id: parsed.organizationId } };
    }

    try {
      const row = await this.prisma.client.branch.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      return row;
    } catch (e) {
      mapVersionedUpdateError(e, 'Branch');
      this.mapDefaultConflict(e);
      throw e;
    }
  }

  /**
   * Standart filialni KO'CHIRISH — bitta tranzaksiyada eskisini bo'shatib,
   * yangisini belgilaydi. Ikki alohida PATCH bilan qilinsa oraliqda ikkita
   * (yoki nol) standart filial holati paydo bo'lardi.
   */
  async setDefault(accountId: string, id: string) {
    const target = await this.findById(accountId, id);
    if (target.archived) {
      throw new BadRequestException('Arxivlangan filial standart qilib belgilanmaydi');
    }
    if (target.isDefault) return target;

    await this.prisma.client.$transaction(async (tx) => {
      // Avval BO'SHATISH, keyin belgilash — teskari tartibda qisman-unikal
      // indeks tranzaksiya ichida ham buzilardi.
      await tx.branch.updateMany({
        where: { accountId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.branch.update({
        where: { id, accountId },
        data: { isDefault: true, version: { increment: 1 } },
      });
    });
    return this.findById(accountId, id);
  }

  async archive(accountId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.isDefault) {
      throw new BadRequestException(
        "Standart filialni arxivlab bo'lmaydi — avval boshqasini standart qiling",
      );
    }
    return this.prisma.client.branch.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.assertExists(accountId, id);
    return this.prisma.client.branch.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.isDefault) {
      throw new BadRequestException(
        "Standart filialni o'chirib bo'lmaydi — avval boshqasini standart qiling",
      );
    }
    await this.prisma.client.branch.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /** Akkauntda boshqa standart filial bormi (o'zidan tashqari). */
  private async assertNoOtherDefault(accountId: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.client.branch.findFirst({
      where: { accountId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ConflictException(
        `Akkauntda standart filial allaqachon bor («${existing.name}») — ` +
          'uni ko`chirish uchun `POST /admin/branches/:id/set-default` ishlating',
      );
    }
  }

  /** DB qisman-unikal indeksidan kelgan P2002 — servis tekshiruvi bilan bir xil xabar. */
  private mapDefaultConflict(e: unknown): void {
    const code = (e as { code?: unknown }).code;
    if (code === 'P2002') {
      throw new ConflictException(
        "Filial cheklovi buzildi: akkauntda standart filial bitta bo'ladi va `code` takrorlanmaydi",
      );
    }
  }

  private async assertExists(accountId: string, id: string): Promise<void> {
    const row = await this.prisma.client.branch.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`Branch ${id} not found`);
  }

  private parseCreate(raw: unknown): CreateBranchInput {
    const r = CreateBranchSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateBranchInput {
    const r = UpdateBranchSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
