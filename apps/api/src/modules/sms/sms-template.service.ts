import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { renderTelegramTemplate } from '../debt/telegram-template-render.util.js';
import { renderSmsTemplate } from './sms-render.util.js';
import {
  CreateMessageTemplateSchema,
  type TemplateChannel,
  UpdateMessageTemplateSchema,
} from './sms-template.schema.js';

// Saqlashdan oldin shablonni HAQIQIY renderer bilan sinaymiz — noto'g'ri
// o'zgaruvchi (masalan {{= custamer.name }}) yoki yopilmagan tag Eta'da throw
// qiladi (useWith:true). Aks holda buzuq shablon jimgina saqlanib, keyingi HAR
// yuborishda yiqilardi. Namuna kontekst — render vaqtidagi bilan bir xil shakl.
const SAMPLE = {
  counterparty: { name: 'Namuna Mijoz' },
  debt: { remainingFormatted: '1 250 000', totalFormatted: '2 000 000' },
  company: { phone: '+998900000000', card: '0000 0000 0000 0000', cardOwner: 'Namuna Egasi' },
};

export interface MessageTemplateView {
  id: string;
  channel: string;
  key: string | null;
  name: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

interface TemplateRow {
  id: string;
  accountId: string;
  channel: string;
  key: string | null;
  name: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

@Injectable()
export class MessageTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, channel?: TemplateChannel): Promise<MessageTemplateView[]> {
    const rows = await this.prisma.client.messageTemplate.findMany({
      where: { accountId, ...(channel ? { channel } : {}) },
      orderBy: [{ channel: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map(view);
  }

  async findOne(accountId: string, id: string): Promise<MessageTemplateView> {
    const row = await this.prisma.client.messageTemplate.findUnique({ where: { id } });
    if (!row || row.accountId !== accountId) throw new NotFoundException('Shablon topilmadi');
    return view(row);
  }

  /** Avtomatik-oqim (cron/bitta-yuborish) uchun — kanalning default+enabled shabloni (yo'q bo'lsa null). */
  async findDefault(
    accountId: string,
    channel: TemplateChannel,
  ): Promise<MessageTemplateView | null> {
    const row = await this.prisma.client.messageTemplate.findFirst({
      where: { accountId, channel, isDefault: true, enabled: true },
    });
    return row ? view(row) : null;
  }

  async create(accountId: string, raw: unknown): Promise<MessageTemplateView> {
    const p = CreateMessageTemplateSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message).join(', '));
    this.validateBody(p.data.channel, p.data.body);
    const { channel, name, body, enabled, isDefault } = p.data;
    const row = await this.prisma.client.$transaction(async (tx) => {
      if (isDefault) await clearDefault(tx, accountId, channel);
      return tx.messageTemplate.create({
        data: { accountId, channel, name, body, enabled, isDefault },
      });
    });
    return view(row);
  }

  async update(accountId: string, id: string, raw: unknown): Promise<MessageTemplateView> {
    const existing = await this.findOne(accountId, id); // 404 + tenant guard
    const p = UpdateMessageTemplateSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message).join(', '));
    if (p.data.body != null) this.validateBody(existing.channel as TemplateChannel, p.data.body);
    const row = await this.prisma.client.$transaction(async (tx) => {
      if (p.data.isDefault) await clearDefault(tx, accountId, existing.channel as TemplateChannel);
      return tx.messageTemplate.update({ where: { id }, data: p.data });
    });
    return view(row);
  }

  async setDefault(accountId: string, id: string): Promise<MessageTemplateView> {
    const t = await this.findOne(accountId, id);
    const row = await this.prisma.client.$transaction(async (tx) => {
      await clearDefault(tx, accountId, t.channel as TemplateChannel);
      return tx.messageTemplate.update({ where: { id }, data: { isDefault: true } });
    });
    return view(row);
  }

  async remove(accountId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(accountId, id); // 404 + tenant guard
    await this.prisma.client.messageTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private validateBody(channel: TemplateChannel, body: string): void {
    try {
      if (channel === 'telegram') renderTelegramTemplate(body, SAMPLE);
      else renderSmsTemplate(body, SAMPLE);
    } catch {
      throw new BadRequestException(
        "Shablon xato: noto'g'ri o'zgaruvchi yoki tag. Ruxsat etilgan o'zgaruvchilar: counterparty.name, debt.remainingFormatted, debt.totalFormatted, company.phone, company.card, company.cardOwner",
      );
    }
  }
}

/** Kanalда mavjud default'ni tozalaydi (bitta-default invariant, tx ичida). */
async function clearDefault(
  tx: Prisma.TransactionClient,
  accountId: string,
  channel: TemplateChannel,
): Promise<void> {
  await tx.messageTemplate.updateMany({
    where: { accountId, channel, isDefault: true },
    data: { isDefault: false },
  });
}

function view(r: TemplateRow): MessageTemplateView {
  return {
    id: r.id,
    channel: r.channel,
    key: r.key,
    name: r.name,
    body: r.body,
    enabled: r.enabled,
    isDefault: r.isDefault,
  };
}
