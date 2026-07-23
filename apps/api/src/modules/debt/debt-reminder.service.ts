import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';

/**
 * QO'NG'IROQ ESLATMASI (2026-07-12 talab): «vaqt kelganda notification bilan
 * eslatilishi kerak — mana shu odamlarga qo'ng'iroq qilish vaqti keldi».
 *
 * Har daqiqada: nextContactAt vaqti KELGAN, hali eslatilmagan faol qarzlar
 * topiladi → tegishli OPERATORLARGA (mijozga EMAS) BITTA jamlangan ichki
 * bildirishnoma yuboriladi («📞 N mijozga qo'ng'iroq vaqti keldi») → bell'dagi
 * «Qaysilar?» bosilganda /debts/calls (Bugungi qo'ng'iroqlar) ochiladi
 * (kind='debt_call_due' mapping notification-bell.tsx da).
 *
 * ⚠️ MIJOZGA AVTOMATIK XABAR YUBORILMAYDI (2026-07-23, foydalanuvchi qarori).
 * Ilgari (2026-07-13) bu cron mijozning O'ZIGA ham Telegram-eslatma yuborardi —
 * foydalanuvchi «faqat o'zimiz bossak ketsin» dedi, shuning uchun mijozga
 * eslatma endi FAQAT QO'LDA ketadi: per-qarz «Xabar yuborish» tugmasi
 * (POST /debts/:id/telegram-reminder → debt.service.sendTelegramReminder) yoki
 * bulk «SMS-tarqatma»/eslatma (POST /debts/reminders → sendBulkReminders). Bu
 * cron endi faqat operatorni «qo'ng'iroq vaqti keldi» deb ogohlantiradi.
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
          // chiqmoqda.
          problem: false,
        },
        select: {
          id: true,
          accountId: true,
          ownerId: true,
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

      // ── OPERATORGA ICHKI BILDIRISHNOMA (mijozga EMAS) ────────────────────
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

      await this.prisma.client.debt.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { callRemindedAt: now },
      });
      this.logger.log(
        `Qo'ng'iroq eslatmasi: ${due.length} qarz, operator bildirishnomalari yuborildi`,
      );
    } catch (e) {
      // Cron hech qachon yiqilmasin — keyingi daqiqada qayta uriniladi.
      this.logger.error(`Eslatma-cron xatosi: ${(e as Error).message}`);
    }
  }
}
