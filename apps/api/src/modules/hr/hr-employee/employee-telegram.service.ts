import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

/**
 * Xodim ↔ Telegram bog'lash (Faza D1, 2026-07-30).
 *
 * Inline-tugma FAQAT Bot API `chat_id`'da ishlaydi (taminotchi oqimi ham shunday),
 * shuning uchun xodimning bot bilan yozishgandagi chat_id'si kerak. Oqim:
 *   ERP «Telegram ulash» → issueBindToken() bir-martalik token + deep-link qaytaradi
 *   → xodim `t.me/<bot>?start=bind_<token>` ni ochadi → telegram.service `/start bind_`
 *   ни tanaydi → bindByToken() chat_id'ni saqlab tokenni iste'mol qiladi.
 */

const BIND_PREFIX = '/start bind_';
const TTL_MS = 15 * 60 * 1000; // token 15 daqiqa amal qiladi

/** `/start bind_<token>` matnidan tokenni ajratadi (aks holda null). Pure — testда DB kerak emas. */
export function parseBindToken(text: string | null | undefined): string | null {
  if (!text || !text.startsWith(BIND_PREFIX)) return null;
  const token = text.slice(BIND_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

@Injectable()
export class EmployeeTelegramService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** ERP «Telegram ulash» — bir-martalik token yaratadi + deep-link qaytaradi. */
  async issueBindToken(accountId: string, employeeId: string) {
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.prisma.client.employee.update({
      where: { id: employeeId, accountId },
      data: { telegramBindToken: token, telegramBindTokenExpiresAt: expiresAt },
    });
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    const deepLink = cfg?.botUsername
      ? `https://t.me/${cfg.botUsername}?start=bind_${token}`
      : null;
    return { deepLink, expiresAt };
  }

  /** ERP «Telegram uzish» — chat_id + tokenni tozalaydi. */
  async unbind(accountId: string, employeeId: string) {
    await this.prisma.client.employee.update({
      where: { id: employeeId, accountId },
      data: {
        telegramChatId: null,
        telegramBindToken: null,
        telegramBindTokenExpiresAt: null,
      },
    });
  }

  /**
   * `/start bind_<token>` — tokenli (muddat ichida) xodimni topib chat_id'ni saqlaydi,
   * tokenni iste'mol qiladi. Topilmasa / muddati o'tgan bo'lsa → null.
   */
  async bindByToken(
    chatId: string,
    tokenRaw: string,
  ): Promise<{ employeeId: string; name: string } | null> {
    const emp = await this.prisma.client.employee.findFirst({
      where: { telegramBindToken: tokenRaw, telegramBindTokenExpiresAt: { gt: new Date() } },
      select: { id: true, name: true },
    });
    if (!emp) return null;
    await this.prisma.client.employee.update({
      where: { id: emp.id },
      data: {
        telegramChatId: chatId,
        telegramBindToken: null,
        telegramBindTokenExpiresAt: null,
      },
    });
    return { employeeId: emp.id, name: emp.name };
  }
}
