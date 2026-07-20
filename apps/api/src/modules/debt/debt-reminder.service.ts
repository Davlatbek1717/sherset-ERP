import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { MessageTemplateService } from '../sms/sms-template.service.js';
import { SmsService } from '../sms/sms.service.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { renderReminderText } from './telegram-template-render.util.js';

/**
 * QO'NG'IROQ ESLATMASI (2026-07-12 talab): «vaqt kelganda notification bilan
 * eslatilishi kerak — mana shu odamlarga qo'ng'iroq qilish vaqti keldi».
 *
 * Har daqiqada: nextContactAt vaqti KELGAN, hali eslatilmagan faol qarzlar
 * topiladi → tegishli operatorlarga BITTA jamlangan bildirishnoma yuboriladi
 * («📞 N mijozga qo'ng'iroq vaqti keldi») → bell'dagi «Qaysilar?» bosilganda
 * /debts/calls (Bugungi qo'ng'iroqlar) ochiladi (kind='debt_call_due'
 * mapping notification-bell.tsx da).
 *
 * Qabul qiluvchi: qarz egasi (ownerId); egasiz qarzlar (masalan 579-lik
 * import) uchun — akkauntdagi QarzOperatori roli biriktirilgan barcha
 * xodimlar. Dedup: callRemindedAt — bir muddat uchun bir marta; operator
 * yangi sana qo'ysa (markCall/addNote) belgi tozalanadi va keyingi muddat
 * uchun eslatma yana ishlaydi.
 */
@Injectable()
export class DebtReminderService {
  private readonly logger = new Logger(DebtReminderService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    // Mijozning O'ZIGA ham eslatma ketadi (2026-07-13) — operator qo'ng'iroq
    // qilishidan oldin mijoz allaqachon xabardor bo'ladi.
    @Inject(TelegramService) private readonly telegram: TelegramService,
    // Xabar aloqa-bloki uchun kompaniya aloqa ma'lumotlari (CompanySettings).
    @Inject(SmsService) private readonly sms: SmsService,
    // Tahrirlanadigan Telegram qarz-shabloni (default; yo'q bo'lsa fallback).
    @Inject(MessageTemplateService) private readonly msgTemplates: MessageTemplateService,
  ) {}

  @Cron('0 * * * * *') // har daqiqa, 0-soniyada
  async remindDueCalls(): Promise<void> {
    try {
      const now = new Date();
      const due = await this.prisma.client.debt.findMany({
        where: {
          deletedAt: null,
          status: { in: ['unpaid', 'partial'] },
          nextContactAt: { lte: now },
          callRemindedAt: null,
          // 2026-07-20: "muammoli" (problem: true) qarzlar avtomatik
          // eslatmadan chiqarib tashlanadi — operator uni allaqachon ko'rib
          // chiqmoqda, mijozga avtomatik xabar ketavermasligi kerak. Qo'lda
          // "xabar yuborish" tugmasi (debt.service.ts sendTelegramReminder,
          // POST /debts/:id/telegram-reminder) bu flagni tekshirmaydi —
          // operator xohlasa muammoli mijozga ham qo'lda yubora oladi.
          problem: false,
        },
        select: {
          id: true,
          accountId: true,
          ownerId: true,
          counterpartyId: true,
          totalMinor: true,
          paidMinor: true,
          counterparty: { select: { name: true } },
        },
        take: 500,
      });
      if (due.length === 0) return;

      // account → recipient → qarzdor nomlari
      const byAccount = new Map<string, Map<string, string[]>>();
      const orphanByAccount = new Map<string, string[]>();
      for (const d of due) {
        if (d.ownerId) {
          const acc = byAccount.get(d.accountId) ?? new Map<string, string[]>();
          const list = acc.get(d.ownerId) ?? [];
          list.push(d.counterparty.name);
          acc.set(d.ownerId, list);
          byAccount.set(d.accountId, acc);
        } else {
          const list = orphanByAccount.get(d.accountId) ?? [];
          list.push(d.counterparty.name);
          orphanByAccount.set(d.accountId, list);
        }
      }

      // Egasiz qarzlar → akkauntning barcha QarzOperatori'lariga.
      for (const [accountId, names] of orphanByAccount) {
        const operators = await this.prisma.client.employeeRole.findMany({
          where: { role: { accountId, name: 'QarzOperatori' } },
          select: { employeeId: true },
        });
        const acc = byAccount.get(accountId) ?? new Map<string, string[]>();
        for (const op of operators) {
          const list = acc.get(op.employeeId) ?? [];
          list.push(...names);
          acc.set(op.employeeId, list);
        }
        byAccount.set(accountId, acc);
      }

      for (const [accountId, recipients] of byAccount) {
        for (const [recipientId, names] of recipients) {
          const preview = names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : '');
          await this.notifications.emit(
            accountId,
            recipientId,
            'debt_call_due',
            `📞 ${names.length} mijozga qo'ng'iroq vaqti keldi`,
            preview,
            'DebtCalls',
            null,
          );
        }
      }

      // ── MIJOZGA TELEGRAM ESLATMASI (2026-07-13) ──────────────────────────
      // Ketma-ket yuboriladi (Telegram tezlik chegarasi bor). Bittasi
      // yiqilsa qolganlari davom etadi — eslatma cron'i to'xtamasin.
      // Aloqa-bloki (telefon/karta/egasi) account bo'yicha bir marta olinadi.
      const contactByAccount = new Map<
        string,
        { phone: string; card: string; cardOwner: string }
      >();
      // Default Telegram shabloni ham account bo'yicha bir marta olinadi (yo'q →
      // renderReminderText fallback hardcoded matnni ishlatadi).
      const tplByAccount = new Map<string, { body: string; enabled: boolean } | null>();
      for (const d of due) {
        const remaining = d.totalMinor - d.paidMinor;
        if (remaining <= 0n) continue;
        let contact = contactByAccount.get(d.accountId);
        if (!contact) {
          contact = await this.sms.getContacts(d.accountId);
          contactByAccount.set(d.accountId, contact);
        }
        let tpl = tplByAccount.get(d.accountId);
        if (tpl === undefined) {
          tpl = await this.msgTemplates.findDefault(d.accountId, 'telegram');
          tplByAccount.set(d.accountId, tpl);
        }
        await this.telegram
          .notifyCounterparty(
            d.accountId,
            d.counterpartyId,
            renderReminderText(tpl, {
              name: d.counterparty.name,
              remainingMinor: remaining,
              totalMinor: d.totalMinor,
              contact,
            }),
            'reminder',
          )
          .catch(() => {
            /* chat bo'lmasa yoki Telegram javob bermasa — jim o'tamiz */
          });
      }

      await this.prisma.client.debt.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { callRemindedAt: now },
      });
      this.logger.log(`Qo'ng'iroq eslatmasi: ${due.length} qarz, bildirishnomalar yuborildi`);
    } catch (e) {
      // Cron hech qachon yiqilmasin — keyingi daqiqada qayta uriniladi.
      this.logger.error(`Eslatma-cron xatosi: ${(e as Error).message}`);
    }
  }
}
