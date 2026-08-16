import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyStatementService } from '../counterparty-statement/counterparty-statement.service.js';
import { normalizeTelegramPhone } from '../hr/hr-shared/phone-normalize.util.js';
import { type DebtReceiptDoc, buildDebtReceiptMessages } from './debt-receipt-message.util.js';
import { ensureReceiptLink } from './receipt-link.util.js';

/**
 * «Hisob-kitob cheki» — mijoz kartasidagi tugma (egasi, 2026-08-16:
 * «mijozlar bo'limidan qarzdorligi bo'yicha chek yuborish… u mijoz bilan
 * bo'lgan barcha cheklar borishi kerak»).
 *
 * TUZILISH — uch mavjud qismning ustida:
 *   1. **Ma'lumot**: `CounterpartyStatementService.aggregate` — butun tarix
 *      balans JURNALIDAN quriladi (tur ro'yxatidan emas), ya'ni chekdagi jami
 *      bosh daftar bilan printsipial ajrala olmaydi;
 *   2. **Matn**: `buildDebtReceiptMessages` — sof funksiya, testda qulflangan;
 *   3. **Yuborish**: `hrTelegramOutbox` — egasining SHAXSIY Telegram raqamidan
 *      (bot emas), avtomatik qarz xabarlari bilan AYNI quvur.
 *
 * 🔴 KO'RIB CHIQISH MAJBURIY: `preview()` matnni QAYTARADI, lekin hech narsa
 * yubormaydi va hech narsa YARATMAYDI. Ochiq havolalar ham faqat `send()` da
 * tug'iladi — aks holda kartani ochgan har bir xodim mijozning butun tarixiga
 * ochiq havola yaratib qo'yardi.
 */
@Injectable()
export class DebtReceiptService {
  private readonly logger = new Logger(DebtReceiptService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartyStatementService)
    private readonly statements: CounterpartyStatementService,
  ) {}

  /** Yuborish mumkinmi — sabab bilan (tugma o'chiq turganda kassir nega bilsin). */
  private async reachability(
    accountId: string,
    phone: string | null,
  ): Promise<{ canSend: boolean; reason?: string; toPhone: string | null }> {
    const userbot = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, isActive: true, sessionEncrypted: { not: null } },
      select: { id: true },
    });
    if (!userbot) {
      return {
        canSend: false,
        toPhone: null,
        reason: "Telegram raqami ulanmagan — Sozlamalar → Telegram profillari'da raqamni ulang",
      };
    }
    let toPhone: string | null = null;
    try {
      toPhone = normalizeTelegramPhone(phone);
    } catch {
      toPhone = null;
    }
    if (!toPhone) {
      return {
        canSend: false,
        toPhone: null,
        reason: "Mijozda to'g'ri telefon raqami yo'q — kartada raqamni to'ldiring",
      };
    }
    return { canSend: true, toPhone };
  }

  /**
   * Chek matnini tayyorlaydi. `withLinks` — faqat `send()` uchun `true`
   * (havola yaratish YOZUV amali, ko'rib chiqishda bo'lmasligi kerak).
   */
  private async build(accountId: string, counterpartyId: string, withLinks: boolean) {
    const { cp, data } = await this.statements.aggregate(accountId, counterpartyId);
    const org = await this.prisma.client.organization.findFirst({
      where: { accountId },
      select: { name: true },
    });

    const docs: DebtReceiptDoc[] = [];
    for (const line of data.lines) {
      // `opening` — «Oldingi qoldiq» sifatida sarlavhada alohida chiqadi,
      // shuning uchun hujjatlar ro'yxatida takrorlanmaydi.
      if (line.docType === 'opening') continue;
      docs.push({
        moment: line.moment,
        docType: line.docType,
        docNumber: line.docNumber,
        deltaMinor: line.deltaMinor,
        items: line.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          uom: it.uom ?? null,
        })),
        receiptUrl: null,
      });
    }

    if (withLinks) {
      // Havola FAQAT kassa cheklariga tegishli; boshqa turlar uchun ochiq
      // sahifa yo'q. Ketma-ket — chek soni kichik va bu yozuv amali.
      const ids = new Map<string, string>();
      for (const line of data.lines) {
        if (line.docType === 'retailsale' && line.docId) ids.set(line.docNumber, line.docId);
      }
      for (const d of docs) {
        if (d.docType !== 'retailsale') continue;
        const docId = ids.get(d.docNumber);
        if (docId) d.receiptUrl = await ensureReceiptLink(this.prisma.client, accountId, docId);
      }
    }

    const messages = buildDebtReceiptMessages({
      orgName: org?.name ?? null,
      name: cp.name,
      currency: 'UZS',
      generatedAt: new Date(),
      openingMinor: data.openingMinor,
      docs,
      finalBalanceMinor: data.finalBalanceMinor,
    });

    return { cp, data, messages };
  }

  /** Mijoz kartasidagi ko'rib chiqish oynasi — matn + yuborish holati. */
  async preview(accountId: string, counterpartyId: string) {
    const { cp, data, messages } = await this.build(accountId, counterpartyId, false);
    const reach = await this.reachability(accountId, cp.phone);
    return {
      counterpartyId: cp.id,
      counterpartyName: cp.name,
      phone: cp.phone ?? null,
      messages,
      docCount: data.lines.filter((l) => l.docType !== 'opening').length,
      finalBalanceMinor: String(data.finalBalanceMinor),
      canSend: reach.canSend,
      reason: reach.reason ?? null,
    };
  }

  /**
   * Yuborish: har bo'lak alohida navbat qatori bo'ladi (worker ularni tartib
   * bilan jo'natadi). Bo'sh hisob ham yuboriladi — «qarzingiz yo'q» tasdig'i
   * mijoz uchun ham, do'kon uchun ham foydali hujjat.
   */
  async send(accountId: string, counterpartyId: string) {
    const cpRow = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, phone: true },
    });
    if (!cpRow) throw new NotFoundException('Mijoz topilmadi');

    const reach = await this.reachability(accountId, cpRow.phone);
    if (!reach.canSend || !reach.toPhone) {
      throw new BadRequestException(reach.reason ?? 'Yuborib bo`lmadi');
    }

    const { messages } = await this.build(accountId, counterpartyId, true);
    for (const text of messages) {
      await this.prisma.client.hrTelegramOutbox.create({
        data: {
          accountId,
          counterpartyId,
          toPhone: reach.toPhone,
          messageText: text,
          status: 'pending',
          // Manba turi ALOHIDA: avtomatik qarz xabaridan (`debt.counterparty_notify`)
          // ajratilsin — jurnalda «kim qo'lda yubordi» ko'rinib tursin.
          sourceEventType: 'debt.receipt',
        },
      });
    }
    this.logger.log(
      `hisob-kitob cheki navbatga qo'yildi: cp=${counterpartyId} x${messages.length}`,
    );
    return { queued: messages.length, status: 'pending' as const };
  }
}
