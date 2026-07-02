import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CounterpartyNoteFilterSchema,
  CreateCounterpartyNoteSchema,
  UpdateCounterpartyNoteSchema,
} from './counterparty-note.schema.js';

/**
 * CRM «Заметки» on a counterparty — the free-text notes behind the card's «События»
 * tab («Создать заметку» composer + the «Заметки» sub-filter). Author is stamped from
 * the current user; everything is tenant-guarded by accountId.
 */
@Injectable()
export class CounterpartyNoteService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const r = CounterpartyNoteFilterSchema.safeParse(rawFilter);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const filter = r.data;
    const items = await this.prisma.client.counterpartyNote.findMany({
      where: { accountId, counterpartyId: filter.counterpartyId, archived: false },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
      include: { author: { select: { id: true, name: true } } },
    });
    return { items };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const r = CreateCounterpartyNoteSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const parsed = r.data;
    // Tenant guard — the note's counterparty must belong to this account.
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: parsed.counterpartyId, accountId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException('Kontragent topilmadi');
    return this.prisma.client.counterpartyNote.create({
      data: {
        accountId,
        counterpartyId: parsed.counterpartyId,
        authorId: userId,
        text: parsed.text,
      },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const r = UpdateCounterpartyNoteSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const row = await this.prisma.client.counterpartyNote.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`Note ${id} not found`);
    return this.prisma.client.counterpartyNote.update({
      where: { id },
      data: { text: r.data.text },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async delete(accountId: string, id: string) {
    const row = await this.prisma.client.counterpartyNote.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`Note ${id} not found`);
    await this.prisma.client.counterpartyNote.delete({ where: { id } });
    return { ok: true };
  }
}
