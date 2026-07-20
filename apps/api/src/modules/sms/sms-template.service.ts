import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { renderSmsTemplate } from './sms-render.util.js';
import { type SmsTemplateKey, UpsertSmsTemplateSchema } from './sms-template.schema.js';

// Saqlashdan oldin shablonni HAQIQIY renderer bilan sinaymiz — noto'g'ri
// o'zgaruvchi (masalan {{= custamer.name }}) yoki yopilmagan tag Eta'da throw
// qiladi (useWith:true). Aks holda buzuq shablon jimgina saqlanib, keyingi HAR
// bulk-SMS'da yiqilardi. Namuna kontekst — render vaqtidagi bilan bir xil shakl.
const SAMPLE_CONTEXT = {
  counterparty: { name: 'Namuna Mijoz' },
  debt: { remainingFormatted: '1 250 000', totalFormatted: '2 000 000' },
  company: { phone: '+998900000000', card: '0000 0000 0000 0000', cardOwner: 'Namuna Egasi' },
};

export interface SmsTemplateView {
  id: string;
  key: string;
  name: string;
  body: string;
  enabled: boolean;
}

@Injectable()
export class SmsTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string): Promise<SmsTemplateView[]> {
    const rows = await this.prisma.client.smsTemplate.findMany({
      where: { accountId },
      orderBy: { key: 'asc' },
    });
    return rows.map(this.view);
  }

  /** Kalit bo'yicha shablon — enabled bo'lishidan qat'i nazar qaytaradi (yo'q bo'lsa null). */
  async findByKey(accountId: string, key: SmsTemplateKey): Promise<SmsTemplateView | null> {
    const row = await this.prisma.client.smsTemplate.findUnique({
      where: { accountId_key: { accountId, key } },
    });
    return row ? this.view(row) : null;
  }

  async upsert(accountId: string, key: SmsTemplateKey, raw: unknown): Promise<SmsTemplateView> {
    const p = UpsertSmsTemplateSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message).join(', '));
    const { name, body, enabled } = p.data;
    // Buzuq shablonni saqlashdan oldin tut (erta 400, kech runtime-crash emas).
    try {
      renderSmsTemplate(body, SAMPLE_CONTEXT);
    } catch {
      throw new BadRequestException(
        "Shablon xato: noto'g'ri o'zgaruvchi yoki tag. Ruxsat etilgan o'zgaruvchilar: counterparty.name, debt.remainingFormatted, debt.totalFormatted, company.phone, company.card, company.cardOwner",
      );
    }
    const row = await this.prisma.client.smsTemplate.upsert({
      where: { accountId_key: { accountId, key } },
      create: { accountId, key, name, body, enabled },
      update: { name, body, enabled },
    });
    return this.view(row);
  }

  private view = (r: {
    id: string;
    key: string;
    name: string;
    body: string;
    enabled: boolean;
  }): SmsTemplateView => ({ id: r.id, key: r.key, name: r.name, body: r.body, enabled: r.enabled });
}
